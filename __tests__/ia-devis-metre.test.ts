// __tests__/ia-devis-metre.test.ts
// Liaison transformation metre-complet → LigneDevis pour IA Devis.
//
// RÈGLES VERROUILLÉES :
//   * les quantités techniques sont INALTÉRABLES (jamais ×1,5 / ×2 / ×6) ;
//   * l'appariement catalogue fixe désignation/prix/unité, PAS les quantités ;
//   * chaque ligne de zone conserve zone_id ; plusieurs zones → lignes distinctes ;
//   * absence de correspondance catalogue → « À CHIFFRER » (aucune invention) ;
//   * la route /api/ia-devis et GET /api/chantiers/[id]/metre-complet utilisent
//     la MÊME fonction serveur de source (servirPayloadMetreComplet) ;
//   * aucun moteur métier importable depuis la route IA.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { PayloadMetreComplet } from "@/lib/metre-complet";
import {
  construireLignesDepuisPostes,
  construireLignesAChiffrerManquantes,
  cheminMetreDisponible,
} from "@/lib/iaDevisMetre";
import { mapperQuantitesPersistees } from "@/lib/metreVersPostes";
import type { PosteTechnique } from "@/lib/metreVersPostes";

/* ==================================================================
   FIXTURES
   ================================================================== */

const CATALOGUE = [
  {
    id: "cat-chevron",
    designation: "Chevronnage — chevron sapin de pays traite bois brut",
    description: "Ossature verticale entraxe 0,9 m pour bardage horizontal",
    famille_label: "OSSATURE",
    unite: "ml",
    pu_ht: 4.5,
    pu_revient: 3.2,
    type_cout: "matiere",
  },
  {
    id: "cat-equerre",
    designation: "Équerre de fixation Isolco 3000 P2 140 mm",
    description: "Équerre porteuse et guide",
    famille_label: "OSSATURE",
    unite: "u",
    pu_ht: 12.9,
    pu_revient: 9.5,
    type_cout: "matiere",
  },
];

function poste(overrides: Partial<PosteTechnique> & { zoneId: string }): PosteTechnique {
  return {
    zoneNom: "Façade test",
    categorie: "pose",
    libelle: "Chevronnage",
    quantite: 6.75,
    unite: "ml",
    contexte: ["entraxe vertical 0.9 m"],
    ...overrides,
  };
}

/* ==================================================================
   TESTS
   ================================================================== */

describe("construireLignesDepuisPostes", () => {
  it("quantité technique issue du metre PERSISTÉ, jamais altérée (pas de ×1,5)", () => {
    const lignes = construireLignesDepuisPostes(
      [poste({ zoneId: "z-a" })],
      CATALOGUE,
    );

    expect(lignes).toHaveLength(1);
    expect(lignes[0].qte).toBe(6.75);
    expect(lignes[0].unite).toBe("ml");
    // La surface du chantier (ex 15 m²) n'a rien à voir avec cette quantité.
  });

  it("catalogue confirmé → désignation/prix du catalogue, quantité du metre, zone_id conservé", () => {
    const lignes = construireLignesDepuisPostes(
      [poste({ zoneId: "z-a" })],
      CATALOGUE,
    );

    expect(lignes[0].catalogue_id).toBe("cat-chevron");
    expect(lignes[0].designation).toBe("Chevronnage — chevron sapin de pays traite bois brut");
    expect(lignes[0].pu_ht).toBe(4.5);
    expect(lignes[0].pu_revient).toBe(3.2);
    expect(lignes[0].a_chiffrer).toBe(false);
    expect(lignes[0].zone_id).toBe("z-a");
  });

  it("aucune correspondance catalogue → ligne « À CHIFFRER » avec zone_id (aucune invention)", () => {
    const lignes = construireLignesDepuisPostes(
      [poste({ zoneId: "z-a", libelle: "Bande EPDM", quantite: 7.1, contexte: [] })],
      CATALOGUE,
    );

    expect(lignes).toHaveLength(1);
    expect(lignes[0].a_chiffrer).toBe(true);
    expect(lignes[0].catalogue_id).toBeNull();
    expect(lignes[0].zone_id).toBe("z-a");
    expect(lignes[0].qte).toBeNull(); // format historique « À CHIFFRER » : pas de quantité fabriquée
  });

  it("plusieurs zones → lignes SÉPARÉES, chacune avec son zone_id (jamais fusionnées)", () => {
    const lignes = construireLignesDepuisPostes(
      [
        poste({ zoneId: "z-a", zoneNom: "Façade Nord" }),
        poste({ zoneId: "z-b", zoneNom: "Pignon Sud" }),
        poste({
          zoneId: "z-b",
          zoneNom: "Pignon Sud",
          libelle: "Équerres",
          quantite: 5,
          unite: "u",
          contexte: ["porteuses 3", "guides 2"],
        }),
      ],
      CATALOGUE,
    );

    expect(lignes).toHaveLength(3);
    const ids = lignes.map((l) => l.zone_id).sort();
    expect(ids).toEqual(["z-a", "z-b", "z-b"]);
    // Les deux postes de z-b ne sont pas fusionnés avec z-a et conservent l'identité de zone.
    const chevronsZb = lignes.filter((l) => l.zone_id === "z-b" && l.qte === 6.75);
    expect(chevronsZb).toHaveLength(1);
  });

  it("quantité modifiée dans le JSONB → ligne différente, sans toucher aux moteurs", () => {
    const lignesA = construireLignesDepuisPostes(
      [poste({ zoneId: "z-a", quantite: 6.75 })],
      CATALOGUE,
    );
    const lignesB = construireLignesDepuisPostes(
      [poste({ zoneId: "z-a", quantite: 12.5 })],
      CATALOGUE,
    );

    expect(lignesA[0].qte).toBe(6.75);
    expect(lignesB[0].qte).toBe(12.5);
    expect(lignesA[0].qte).not.toBe(lignesB[0].qte);
  });
});

describe("construireLignesAChiffrerManquantes", () => {
  it("zone sans pose → ligne À CHIFFRER nominale (absence réelle de donnée)", () => {
    const payload = {
      meta: { manquants: ["pose"] },
      zones: [
        {
          zone: { id: "z-a", nom: "Façade Nord" },
          metrage: { ok: true },
          pose: null,
          calepinage: { ok: true },
        },
      ],
    } as unknown as PayloadMetreComplet;

    const lignes = construireLignesAChiffrerManquantes(payload);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].a_chiffrer).toBe(true);
    expect(lignes[0].designation).toContain("Façade Nord");
    expect(lignes[0].description).toContain("pose");
  });

  it("zone complète → aucune ligne À CHIFFRER ajoutée", () => {
    const payload = {
      meta: { manquants: [] },
      zones: [
        {
          zone: { id: "z-a", nom: "Façade Nord", materiau: "plaques" },
          metrage: { ok: true },
          pose: { ok: true },
          calepinage: { ok: true },
        },
      ],
    } as unknown as PayloadMetreComplet;

    expect(construireLignesAChiffrerManquantes(payload)).toEqual([]);
  });
});

describe("cheminMetreDisponible", () => {
  it("aucune zone calculée → path metre indisponible (repli légitime sans invention)", () => {
    expect(
      cheminMetreDisponible({
        meta: { zones_calculees: 0 },
        zones: [],
      } as unknown as PayloadMetreComplet),
    ).toBe(false);
  });

  it("au moins une zone calculée → path metre disponible", () => {
    expect(
      cheminMetreDisponible({
        meta: { zones_calculees: 1 },
        zones: [{ metrage: null, pose: null, calepinage: null }],
      } as unknown as PayloadMetreComplet),
    ).toBe(true);
  });
});

describe("flux de bout en bout : payload → lignes (mapper + liaison)", () => {
  it("les quantités FINALES du devis égalent le JSONB persisté, pas la surface", () => {
    const payload = {
      chantier: {} as never,
      configuration_technique: {} as never,
      totaux: { surface_m2: 15, quantite_coupes_ml: 6, singularites_nb: 0 },
      meta: {
        version_moteur: "1.0.0",
        nombre_zones: 1,
        zones_calculees: 1,
        statut_completude: "complet" as const,
        manquants: [] as string[],
      },
      zones: [
        {
          zone: {
            id: "z-a",
            nom: "Façade Nord",
            type: "facade",
            materiau: "plaques",
          },
          metrage: {
            surfaceNette: 15,
            surfaceACommander: 16.95,
            nombreOuvertures: 0,
          },
          pose: {
            entraxeVertical: 0.9,
            entraxeHorizontal: 1.2,
            lineaireChevronsM: 6.75,
            nbEquerresPorteuses: 3,
            nbEquerresGuides: 2,
            nbChevillesMurales: 10,
            nbVisChevronEquerre: 16,
            nbVisParement: 24,
            lineaireBandeEPDMM: 7.1,
            isolant: { actif: false },
          },
          calepinage: {
            nbPlaquesNecessaires: 12,
            tauxChutePct: 8.3,
            surfaceZoneM2: 15,
          },
        },
      ],
    } as unknown as PayloadMetreComplet;

    const { postes } = mapperQuantitesPersistees(payload);
    const lignes = construireLignesDepuisPostes(postes, CATALOGUE);

    const chevron = lignes.find((l) => l.designation.includes("Chevron"));
    expect(chevron!.qte).toBe(6.75);
    expect(chevron!.zone_id).toBe("z-a");

    // Aucune ligne ne porte de quantité calculée à partir de la surface (15 m²).
    for (const l of lignes) {
      if (l.qte && l.unite === "ml") expect(l.qte).toBeLessThan(15);
    }
  });
});

describe("verrous statiques côté route / source partagée", () => {
  it("la route /api/ia-devis utilise servirPayloadMetreComplet (source unique)", () => {
    const source = readFileSync("./app/api/ia-devis/route.ts", "utf8");
    expect(source).toMatch(/servirPayloadMetreComplet/);
    expect(source).toMatch(/mapperQuantitesPersistees/);
    expect(source).toMatch(/construireLignesDepuisPostes/);
  });

  it("metre-complet ET ia-devis utilisent la MÊME fonction de source", () => {
    const ia = readFileSync("./app/api/ia-devis/route.ts", "utf8");
    const metro = readFileSync(
      "./app/api/chantiers/[id]/metre-complet/route.ts",
      "utf8",
    );
    // Les deux routes délèguent à « servirPayloadMetreComplet » (lib partagée),
    // jamais à un auto-appel HTTP.
    expect(ia).toMatch(/@\/lib\/servir-metre-complet/);
    expect(metro).toMatch(/@\/lib\/servir-metre-complet/);
    expect(ia).not.toMatch(/fetch\(/);
  });

  it("aucun moteur métier n'est importé par la route IA (ni calculerZone ni pose/calepinage)", () => {
    const source = readFileSync("./app/api/ia-devis/route.ts", "utf8");
    expect(source).not.toMatch(/calculerZone/);
    expect(source).not.toMatch(/poseCalcul/);
    expect(source).not.toMatch(/calepinageCalcul/);
    expect(source).not.toMatch(/components\/ZoneCard/);
  });

  it("les règles 1,5 / 2 / 6 ne sont PAS utilisées sur le chemin metre (mapper + liaison)", () => {
    const mapper = readFileSync("./lib/metreVersPostes.ts", "utf8");
    const liaison = readFileSync("./lib/iaDevisMetre.ts", "utf8");
    expect(mapper).not.toMatch(/facteur/);
    expect(mapper).not.toMatch(/REGLES_OSSATURE/);
    expect(liaison).not.toMatch(/facteur/);
    expect(liaison).not.toMatch(/REGLES_OSSATURE/);
    expect(mapper).not.toMatch(/surface\s*[*]\s*(?:1\.5|2|6)/);
  });

  it("ÉTAPE 12 : le bouton chantier transmet le chantier_id réel sans aucun moteur", () => {
    const bouton = readFileSync("./app/terrain/chantier/[id]/page.tsx", "utf8");
    // Navigation directe vers Devis & Factures avec l'ID du chantier courant.
    expect(bouton).toMatch(/bureau\/devis-factures\?chantier_id=/);
    // Aucun calcul de quantité n'est fait dans ce nouveau raccord UI.
    expect(bouton).not.toMatch(/calculerPose/);
    expect(bouton).not.toMatch(/calculerCalepinage/);
  });

  it("ÉTAPE 12 : la présélection Devis & Factures reste un pur raccord (aucun moteur, aucun recalcul)", () => {
    const preselection = readFileSync("./lib/devisPreselection.ts", "utf8");
    const pageDevis = readFileSync("./app/bureau/devis-factures/page.tsx", "utf8");
    // La couche de présélection ne lit que l'identifiant, elle ne calcule rien.
    expect(preselection).not.toMatch(/calculerZone/);
    expect(preselection).not.toMatch(/calculerPose/);
    expect(preselection).not.toMatch(/calculerCalepinage/);
    expect(preselection).not.toMatch(/resultats_techniques/);
    // La page ne réintroduit pas de moteur dans le flux d'arrivée avec chantier_id.
    expect(pageDevis).not.toMatch(/import .*from ["'].*ZoneCard/);
    expect(pageDevis).not.toMatch(/calculerPose|calculerCalepinage/);
    // L'ID du chantier continue de transiter vers POST /api/ia-devis (source unique).
    expect(pageDevis).toMatch(/chantier_id/);
  });
});