// __tests__/devis-analyse.test.ts
// Module devis_ia (ÉTAPE 1) — partie pure :
//   * verrou de concurrence (décision) : pas de double analyse simultanée ;
//   * normalisation stricte de la réponse LLM : les PRIX ne viennent JAMAIS du LLM ;
//   * estimations finales via le moteur devisCalcul réutilisé ;
//   * historique append-only + incrément de version avant remplacement.

import { describe, it, expect } from "vitest";
import {
  decisionDemarrageAnalyse,
  normaliserAnalyseBrute,
  calculerEstimations,
  construireContexteBNA,
  mapperLignesPersistees,
  ErreurAnalyse,
  FRAICHEUR_VERROU_MS,
  type OuvrageAnalyse,
} from "@/lib/devisAnalyse";
import { preparerRemplacement, type AnalysePersistee } from "@/lib/devisHistorique";

const MAINTENANT = Date.parse("2026-09-13T12:00:00Z");

/* ==================================================================
   VERROU DE CONCURRENCE (décision pure)
   ================================================================== */

describe("decisionDemarrageAnalyse — verrou de concurrence", () => {
  it("autorise la première analyse (aucune ligne en base)", () => {
    const decision = decisionDemarrageAnalyse({
      existe: false,
      statut: null,
      derniereMaj: null,
      maintenant: MAINTENANT,
    });
    expect(decision).toEqual({ autorise: true, raison: "nouvelle" });
  });

  it("bloque une analyse concurrente fraîche (en_cours)", () => {
    const decision = decisionDemarrageAnalyse({
      existe: true,
      statut: "en_cours",
      derniereMaj: new Date(MAINTENANT - 1000).toISOString(),
      maintenant: MAINTENANT,
    });
    expect(decision).toEqual({ autorise: false, raison: "verrouille" });
  });

  it("bloque une analyse en_attente fraîche", () => {
    const decision = decisionDemarrageAnalyse({
      existe: true,
      statut: "en_attente",
      derniereMaj: new Date(MAINTENANT - 5000).toISOString(),
      maintenant: MAINTENANT,
    });
    expect(decision).toEqual({ autorise: false, raison: "verrouille" });
  });

  it("bloque si en_cours et aucune date de mise à jour (âge = 0)", () => {
    const decision = decisionDemarrageAnalyse({
      existe: true,
      statut: "en_cours",
      derniereMaj: null,
      maintenant: MAINTENANT,
    });
    expect(decision.autorise).toBe(false);
  });

  it("récupère un verrou orphelin (crash) : en_cours obsolète", () => {
    const decision = decisionDemarrageAnalyse({
      existe: true,
      statut: "en_cours",
      derniereMaj: new Date(MAINTENANT - FRAICHEUR_VERROU_MS - 60_000).toISOString(),
      maintenant: MAINTENANT,
    });
    expect(decision).toEqual({ autorise: true, raison: "recupere" });
  });

  it("autorise un remplacement après une analyse terminee", () => {
    const decision = decisionDemarrageAnalyse({
      existe: true,
      statut: "terminee",
      derniereMaj: new Date(MAINTENANT - 1000).toISOString(),
      maintenant: MAINTENANT,
    });
    expect(decision).toEqual({ autorise: true, raison: "disponible" });
  });

  it("autorise un relance après un échec (en_echec)", () => {
    const decision = decisionDemarrageAnalyse({
      existe: true,
      statut: "en_echec",
      derniereMaj: new Date(MAINTENANT - 1000).toISOString(),
      maintenant: MAINTENANT,
    });
    expect(decision).toEqual({ autorise: true, raison: "disponible" });
  });

  it("autorise si ligne existante mais statut inconnu", () => {
    const decision = decisionDemarrageAnalyse({
      existe: true,
      statut: null,
      derniereMaj: new Date(MAINTENANT - 1000).toISOString(),
      maintenant: MAINTENANT,
    });
    expect(decision).toEqual({ autorise: true, raison: "disponible" });
  });

  it("respecte une fraicheur de verrou personnalisée", () => {
    const decision = decisionDemarrageAnalyse({
      existe: true,
      statut: "en_cours",
      derniereMaj: new Date(MAINTENANT - 1000).toISOString(),
      maintenant: MAINTENANT,
      fraicheurMs: 500,
    });
    expect(decision).toEqual({ autorise: true, raison: "recupere" });
  });
});

/* ==================================================================
   NORMALISATION STRICTE DE LA RÉPONSE LLM
   ================================================================== */

const OUVRE = (overrides: Partial<OuvrageAnalyse> = {}): OuvrageAnalyse => ({
  id: "ouv-chevron",
  designation: "Chevronnage — chevron sapin de pays",
  unite: "ml",
  pu_ht: 4.5,
  pu_revient: 3.2,
  type_cout: "matiere",
  ...overrides,
});

const CATALOGUE_PAR_ID = new Map<string, OuvrageAnalyse>([[OUVRE().id, OUVRE()]]);

describe("normaliserAnalyseBrute — les prix viennent strictement du catalogue", () => {
  it("rejette une réponse qui n'est pas un objet", () => {
    expect(() => normaliserAnalyseBrute("pas un objet", CATALOGUE_PAR_ID)).toThrow(ErreurAnalyse);
    expect(() => normaliserAnalyseBrute(null, CATALOGUE_PAR_ID)).toThrow(ErreurAnalyse);
  });

  it("chiffre une ligne via le catalogue (le prix du LLM est ignoré)", () => {
    const brut = {
      analyse_resultats: { resume: "OK" },
      lignes_proposees: [
        {
          catalogue_id: "ouv-chevron",
          designation: "une intention libre",
          qte: 12,
          prix_invente: 999,
          zone_id: "zone-1",
        },
      ],
      alertes: ["Quantité arrondie"],
      recommandations: ["Prévoir la pose"],
    };
    const lue = normaliserAnalyseBrute(brut, CATALOGUE_PAR_ID);
    expect(lue.lignes_proposees).toHaveLength(1);
    const ligne = lue.lignes_proposees[0];
    expect(ligne).toMatchObject({
      catalogue_id: "ouv-chevron",
      designation: "Chevronnage — chevron sapin de pays",
      unite: "ml",
      pu_ht: 4.5,
      pu_revient: 3.2,
      type_cout: "matiere",
      a_chiffrer: false,
      qte: 12,
      zone_id: "zone-1",
    });
  });

  it("rejette le prix d'un ouvrage inconnu : ligne À CHIFFRER", () => {
    const brut = {
      lignes_proposees: [
        { catalogue_id: "inconnu", designation: "Prestation exotique", qte: 5, pu_ht: 9999 },
      ],
    };
    const lue = normaliserAnalyseBrute(brut, CATALOGUE_PAR_ID);
    expect(lue.lignes_proposees[0]).toMatchObject({
      a_chiffrer: true,
      catalogue_id: null,
      pu_ht: null,
      qte: null,
    });
  });

  it("bascule en À CHIFFRER si la quantité est absente même avec un ouvrage connu", () => {
    const brut = { lignes_proposees: [{ catalogue_id: "ouv-chevron", qte: null }] };
    const lue = normaliserAnalyseBrute(brut, CATALOGUE_PAR_ID);
    expect(lue.lignes_proposees[0]).toMatchObject({ a_chiffrer: true, pu_ht: null });
  });

  it("rejette une quantité ≤ 0", () => {
    const brut = { lignes_proposees: [{ catalogue_id: "ouv-chevron", qte: 0 }] };
    const lue = normaliserAnalyseBrute(brut, CATALOGUE_PAR_ID);
    expect(lue.lignes_proposees[0].a_chiffrer).toBe(true);
  });

  it("conserve zone_id même sur une ligne À CHIFFRER", () => {
    const brut = { lignes_proposees: [{ designation: "Bidon", zone_id: "zone-9" }] };
    const lue = normaliserAnalyseBrute(brut, CATALOGUE_PAR_ID);
    expect(lue.lignes_proposees[0].zone_id).toBe("zone-9");
  });

  it("filtre les alertes et recommandations (texte vide exclu)", () => {
    const brut = {
      alertes: ["  ", "Une vraie alerte", { message: "Doublon détecté" }, 42],
      recommandations: ["Optimiser", ""],
    };
    const lue = normaliserAnalyseBrute(brut, CATALOGUE_PAR_ID);
    expect(lue.alertes).toEqual(["Une vraie alerte", "Doublon détecté"]);
    expect(lue.recommandations).toEqual(["Optimiser"]);
  });

  it("produit une analyse vide mais valide si aucune ligne", () => {
    const lue = normaliserAnalyseBrute({ lignes_proposees: [] }, CATALOGUE_PAR_ID);
    expect(lue.lignes_proposees).toEqual([]);
    expect(lue.alertes).toEqual([]);
  });
});

/* ==================================================================
   ESTIMATIONS (moteur devisCalcul réutilisé)
   ================================================================== */

describe("calculerEstimations — réutilisation du moteur devisCalcul", () => {
  it("calcule total / marge / ratio sur des lignes chiffrées", () => {
    const estims = calculerEstimations([
      { catalogue_id: "o1", designation: "A", unite: "ml", qte: 10, pu_ht: 5, pu_revient: 3, type_cout: "matiere", a_chiffrer: false },
      { catalogue_id: "o2", designation: "B", unite: "u", qte: 2, pu_ht: 50, pu_revient: 40, type_cout: "main_oeuvre", a_chiffrer: false },
    ]);
    expect(estims.total_estime).toBe(150);
    expect(estims.marge_estimee).toBe(40); // 150 - 30 (matière) - 80 (main-d'œuvre)
    expect(estims.marge_pct).toBeCloseTo(26.67, 0);
  });

  it("exclut les lignes À CHIFFRER des estimations", () => {
    const estims = calculerEstimations([
      { catalogue_id: null, designation: "À CHIFFRER", unite: "forfait", qte: null, pu_ht: null, a_chiffrer: true },
    ]);
    expect(estims.total_estime).toBe(0);
    expect(estims.marge_estimee).toBe(0);
    expect(estims.marge_pct).toBe(0);
  });
});

/* ==================================================================
   CONTEXTE BNA (lecture seule) + mapping des lignes persistées
   ================================================================== */

describe("mapperLignesPersistees / construireContexteBNA", () => {
  it("préserve zone_id et ignore les entrées non-objets", () => {
    const lignes = mapperLignesPersistees([
      { designation: "A", zone_id: "zone-1", qte: 4, pu_ht: 9, unite: "ml" },
      null,
      "rien",
      { designation: "B" },
    ]);
    expect(lignes).toHaveLength(2);
    expect(lignes[0].zone_id).toBe("zone-1");
    expect(lignes[1].zone_id).toBeNull();
  });

  it("construit un contexte sans chantier ni zones ni catalogue", () => {
    const contexte = construireContexteBNA({
      devis: { id: "dev-1", lignes: [{ designation: "A", qte: 2, pu_ht: 10, unite: "ml" }], surface_m2: 24 },
    });
    expect(contexte.devisId).toBe("dev-1");
    expect(contexte.total_ht).toBe(20);
    expect(contexte.surface_m2).toBe(24);
    expect(contexte.chantier).toBeNull();
    expect(contexte.zones).toEqual([]);
    expect(contexte.catalogue).toEqual([]);
  });

  it("lit chantier + zones + catalogue depuis le payload metre-complet", () => {
    const contexte = construireContexteBNA({
      devis: { id: "dev-2", lignes: [], surface_m2: null },
      payloadMetreComplet: {
        chantier: { id: "ch-1", nom: "Maison Dupont", adresse: "3 rue X" },
        zones: [
          { id: "z1", nom: "Façade", metrage: true, pose: true, calepinage: false },
        ],
      },
      catalogue: [{ id: "o1", designation: "Chevron", unite: "ml" }],
    });
    expect(contexte.chantier).toMatchObject({ id: "ch-1", nom: "Maison Dupont" });
    expect(contexte.zones[0]).toMatchObject({ id: "z1", nom: "Façade", metrage: true, pose: true, calepinage: false });
    expect(contexte.catalogue[0]).toMatchObject({ id: "o1", designation: "Chevron", unite: "ml" });
  });
});

/* ==================================================================
   HISTORIQUE APPEND-ONLY (avant remplacement, version incrémentée)
   ================================================================== */

describe("preparerRemplacement — historique append-only", () => {
  it("première analyse : pas de snapshot, version 1", () => {
    const { snapshot, version } = preparerRemplacement(null);
    expect(snapshot).toBeNull();
    expect(version).toBe(1);
  });

  it("remplacement : snapshot de l'ancienne, version incrémentée", () => {
    const ancienne: AnalysePersistee = {
      version: 3,
      analyse_resultats: { resume: "v3" },
      lignes_proposees: [{ designation: "A" }],
      alertes: ["alerte v3"],
      recommandations: [],
      total_estime: 100,
      marge_estimee: 20,
      marge_pct: 20,
    };
    const { snapshot, version } = preparerRemplacement(ancienne);
    expect(version).toBe(4);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.version).toBe(3);
    expect(snapshot?.contenu).toEqual({
      analyse_resultats: { resume: "v3" },
      lignes_proposees: [{ designation: "A" }],
      alertes: ["alerte v3"],
      recommandations: [],
      total_estime: 100,
      marge_estimee: 20,
      marge_pct: 20,
    });
  });

  it("le snapshot est une copie isolée (mutation ultérieure sans effet)", () => {
    const ancienne: AnalysePersistee = {
      version: 1,
      analyse_resultats: {},
      lignes_proposees: [],
      alertes: [],
      recommandations: [],
      total_estime: 0,
      marge_estimee: 0,
      marge_pct: 0,
    };
    const { snapshot } = preparerRemplacement(ancienne);
    const contenu = snapshot?.contenu as { lignes_proposees: unknown[] };
    if (contenu) contenu.lignes_proposees.push({ designation: "muté" });
    expect(ancienne.lignes_proposees).toEqual([]);
  });

  it("cohérence des versions enchaînées : v1 → historique v1 + courant v2", () => {
    const premiere = utilitaireAnalyse(1, { resume: "v1" });
    const { snapshot: snapV1, version: v2 } = preparerRemplacement(premiere);
    expect(snapV1?.version).toBe(1);
    expect(v2).toBe(2);
    expect(snapV1?.contenu).toMatchObject({ analyse_resultats: { resume: "v1" } });
  });

  it("cohérence des versions enchaînées : v2 → historique v2 + courant v3", () => {
    const deuxieme = utilitaireAnalyse(2, { resume: "v2" });
    const { snapshot: snapV2, version: v3 } = preparerRemplacement(deuxieme);
    expect(snapV2?.version).toBe(2);
    expect(v3).toBe(3);
    expect(snapV2?.contenu).toMatchObject({ analyse_resultats: { resume: "v2" } });
  });

  it("chaîne complète : v1 → v2 → v3 sans trou de version", () => {
    const courantV1 = utilitaireAnalyse(1, { resume: "v1" });
    const r1 = preparerRemplacement(courantV1);
    expect(r1.version).toBe(2);

    const courantV2: AnalysePersistee = { ...courantV1, version: r1.version };
    const r2 = preparerRemplacement(courantV2);
    expect(r2.snapshot?.version).toBe(2);
    expect(r2.version).toBe(3);

    const courantV3: AnalysePersistee = { ...courantV2, version: r2.version };
    expect(courantV3.version).toBe(3);
  });
});

function utilitaireAnalyse(version: number, resultats: Record<string, unknown>): AnalysePersistee {
  return {
    version,
    analyse_resultats: resultats,
    lignes_proposees: [],
    alertes: [],
    recommandations: [],
    total_estime: 0,
    marge_estimee: 0,
    marge_pct: 0,
  };
}