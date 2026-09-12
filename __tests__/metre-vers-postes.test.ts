// __tests__/metre-vers-postes.test.ts
// Tests du mapper PUR des résultats techniques persistés (metre-complet)
// vers des postes techniques quantifiés pour l'IA Devis.
//
// RÈGLES VERROUILLÉES :
//   * chaque quantité provient STRICTEMENT du JSONB persisté (aucune règle parallèle) ;
//   * aucune importation/exécution des moteurs métier ;
//   * nulls respectés (pose/calepinage/metrage null → aucun poste de la catégorie) ;
//   * traçabilité par zone.id, jamais de fusion entre zones ;
//   * meta (statut_completude / manquants / nb_a_chiffrer) transmis.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type {
  PayloadMetreComplet,
  EntreeZoneMetreComplet,
} from "@/lib/metre-complet";
import type { ResultatPose } from "@/lib/poseCalcul";
import type { ResultatCalepinage } from "@/lib/calepinageCalcul";
import { mapperQuantitesPersistees } from "@/lib/metreVersPostes";

/* ==================================================================
   FIXTURES
   ================================================================== */

const POSE_BASE: ResultatPose = {
  entraxeVertical: 0.9,
  entraxeHorizontal: 1.2,
  positionsChevronsM: [0.45, 1.35, 2.25],
  nbMontants: 3,
  nbSegmentsChevrons: 3,
  lineaireChevronsM: 6.75,
  fixationsParMontant: 4,
  nbFixationsTotal: 12,
  nbEquerresPorteuses: 3,
  nbEquerresGuides: 2,
  nbChevillesMurales: 10,
  nbVisChevronEquerre: 16,
  nbVisParement: 24,
  nbVis: 40,
  lineaireBandeEPDMM: 7.1,
  isolant: {
    actif: true,
    typeIsolant: "Laine de roche semi-rigide (ROCKWOOL)",
    epaisseurMm: 120,
    surfaceNetteM2: 15,
    surfaceACommanderM2: 16.2,
    tauxPertePct: 0.08,
    surfacePaquetM2: 4.8,
    nbPaquetsACommander: 4,
    nbChevillesRosaces: 75,
    modeleEquerreIsolco: "Isolco 3000 P2 140 mm (Isolant 120mm + lame d'air 20mm)",
  },
  joint: "chevrons 14 mm",
  remarques: [],
};

const CALEPINAGE_BASE: ResultatCalepinage = {
  colonnesLargeursM: [0.5, 1, 1, 1, 1, 0.5],
  rangeesHauteursM: [0.6, 0.6, 0.6, 0.6, 0.6],
  pieces: [],
  nbPlaquesNecessaires: 12,
  nbPiecesPosees: 20,
  surfaceZoneM2: 15,
  surfacePlaquesAchetesM2: 16.98,
  tauxChuteBrutePct: 11.7,
  tauxChuteNettePct: 8.3,
  tauxChutePct: 8.3,
  totalChutesReutilisablesM2: 0.5,
  totalDechetsPerteM2: 1.5,
  nbJoints: 18,
  estPignon: false,
  hauteurFaiteM: 0,
  pentePct: 0,
  plaqueBruteLongueurMm: 3050,
  plaqueBruteLargeurMm: 1300,
  moduleCibleLargeurMm: 1000,
  moduleCibleHauteurMm: 600,
  modulesParPlaqueBrute: 4,
  plaquesDebit: [],
  entraxeReelMm: 600,
};

function zoneEntree(overrides: Partial<EntreeZoneMetreComplet> & { id: string; nom: string }): EntreeZoneMetreComplet {
  return {
    zone: {
      id: overrides.id,
      nom: overrides.nom,
      type: "facade",
      largeur: 5,
      hauteur_mur: 3,
      hauteur_faite: null,
      materiau: "plaques",
      famille_pose: "hpl",
      sens_pose: "horizontal",
      angle: false,
      largeur_lame_mm: null,
      plaque_longueur_mm: 3050,
      plaque_largeur_mm: 1300,
      module_largeur_mm: 1000,
      module_hauteur_mm: 600,
      ouvertures: [],
    },
    version_moteur: "1.0.0",
    calcule_le: "2026-09-12T10:00:00.000Z",
    entrees: null,
    metrage: {
      bruteFacade: 15,
      brutePignon: 0,
      pente: 0,
      totalOuvertures: 0,
      surfaceNette: 15,
      surfaceACommander: 16.95,
      nombreOuvertures: 0,
      totalCoupesML: 6,
    },
    pose: POSE_BASE,
    calepinage: CALEPINAGE_BASE,
    ...overrides,
  };
}

function payloadFixture(zones: EntreeZoneMetreComplet[]): PayloadMetreComplet {
  return {
    chantier: {
      id: "c-1",
      nom: "Villa Test",
      client: null,
      adresse: null,
      materiau_structurel: "beton",
      moyen_acces: "pied_oeuvre",
      zone_vent: 1,
      coef_perte_rendement: 1.12,
    },
    configuration_technique: {
      type_isolant: "laine_roche",
      epaisseur_isolant_mm: 120,
      surface_paquet_m2: 4.8,
      zone_vent_rive: null,
      coef_perte_rendement: 1.12,
    },
    zones,
    totaux: { surface_m2: 15, quantite_coupes_ml: 6, singularites_nb: 0 },
    meta: {
      version_moteur: "1.0.0",
      nombre_zones: zones.length,
      zones_calculees: zones.length,
      statut_completude: "complet",
      manquants: [],
    },
  };
}

/* ==================================================================
   TESTS
   ================================================================== */

describe("mapperQuantitesPersistees", () => {
  it("quantités du JSONB reflétées À L'IDENTIQUE — aucun recalcul (chevrons ≠ 1,5×surface)", () => {
    const zones = [zoneEntree({ id: "z-a", nom: "Façade Nord" })];
    const { postes } = mapperQuantitesPersistees(payloadFixture(zones));

    const chevron = postes.find((p) => p.libelle === "Chevronnage");
    expect(chevron).toBeDefined();
    expect(chevron!.quantite).toBe(6.75); // valeur persistée (surface 15 → 1,5×15 = 22,5 JAMAIS utilisé)
    expect(chevron!.unite).toBe("ml");
  });

  it("chevilles/équerres proviennent du JSONB, pas de règle 2/m² ou 6/m²", () => {
    const zones = [zoneEntree({ id: "z-a", nom: "Façade Nord" })];
    const { postes } = mapperQuantitesPersistees(payloadFixture(zones));

    const equerres = postes.find((p) => p.libelle === "Équerres");
    expect(equerres!.quantite).toBe(5); // porteuses 3 + guides 2 (persistés)
    const chevillesMurales = postes.find((p) => p.libelle === "Chevilles maçonnerie");
    expect(chevillesMurales!.quantite).toBe(10); // persisté (jamais 15×6)
  });

  it("une valeur modifiée dans le JSONB → quantité différente, sans modifier aucun moteur", () => {
    const zones1 = [zoneEntree({ id: "z-a", nom: "Façade Nord" })];
    const zones2 = [
      zoneEntree({
        id: "z-a",
        nom: "Façade Nord",
        pose: { ...POSE_BASE, lineaireChevronsM: 9.0 },
      }),
    ];

    const p1 = mapperQuantitesPersistees(payloadFixture(zones1)).postes.find((p) => p.libelle === "Chevronnage");
    const p2 = mapperQuantitesPersistees(payloadFixture(zones2)).postes.find((p) => p.libelle === "Chevronnage");
    expect(p1!.quantite).toBe(6.75);
    expect(p2!.quantite).toBe(9.0);
  });

  it("resultat_pose null → AUCUN poste de pose ni d'isolant", () => {
    const zones = [zoneEntree({ id: "z-a", nom: "Façade Nord", pose: null })];
    const { postes } = mapperQuantitesPersistees(payloadFixture(zones));

    expect(postes.some((p) => p.categorie === "pose")).toBe(false);
    expect(postes.some((p) => p.categorie === "isolant")).toBe(false);
    expect(postes.find((p) => p.libelle === "Chevronnage")).toBeUndefined();
  });

  it("resultat_calepinage null → AUCUN poste plaques", () => {
    const zones = [zoneEntree({ id: "z-a", nom: "Façade Nord", calepinage: null })];
    const { postes } = mapperQuantitesPersistees(payloadFixture(zones));

    expect(postes.some((p) => p.libelle === "Plaques")).toBe(false);
    expect(postes.some((p) => p.categorie === "calepinage")).toBe(false);
  });

  it("resultat_zone null → AUCUNE quantité de métrage inventée", () => {
    const zones = [zoneEntree({ id: "z-a", nom: "Façade Nord", metrage: null })];
    const { postes } = mapperQuantitesPersistees(payloadFixture(zones));

    expect(postes.some((p) => p.categorie === "metrage")).toBe(false);
    expect(postes.find((p) => p.libelle === "Bardage — surface à commander")).toBeUndefined();
  });

  it("isolant inactif → AUCUN poste d'isolant", () => {
    const zones = [
      zoneEntree({
        id: "z-a",
        nom: "Sans isolant",
        pose: { ...POSE_BASE, isolant: { ...POSE_BASE.isolant, actif: false } },
      }),
    ];
    const { postes } = mapperQuantitesPersistees(payloadFixture(zones));
    expect(postes.some((p) => p.categorie === "isolant")).toBe(false);
  });

  it("plusieurs zones → postes séparés, chacun avec son zone_id (jamais fusionnés)", () => {
    const zones = [
      zoneEntree({ id: "z-a", nom: "Façade Nord" }),
      zoneEntree({ id: "z-b", nom: "Pignon Sud" }),
    ];
    const { postes } = mapperQuantitesPersistees(payloadFixture(zones));

    const chevrons = postes.filter((p) => p.libelle === "Chevronnage");
    expect(chevrons).toHaveLength(2);
    expect(chevrons.map((p) => p.zoneId).sort()).toEqual(["z-a", "z-b"]);
    expect(postes.every((p) => p.zoneId === "z-a" || p.zoneId === "z-b")).toBe(true);
  });

  it("meta : statut_completude et manquants transmis tels quels", () => {
    const zones = [zoneEntree({ id: "z-a", nom: "Façade Nord", pose: null })];
    const payload = payloadFixture(zones);
    payload.meta.statut_completude = "incomplet";
    payload.meta.manquants = ["pose"];

    const { meta } = mapperQuantitesPersistees(payload);
    expect(meta.statut_completude).toBe("incomplet");
    expect(meta.manquants).toEqual(["pose"]);
  });

  it("nb_a_chiffrer : zones avec catégorie manquante comptées (sans fabriquer de quantité)", () => {
    const zones = [
      zoneEntree({ id: "z-a", nom: "Complète" }),
      zoneEntree({ id: "z-b", nom: "Sans pose", pose: null }),
      zoneEntree({
        id: "z-c",
        nom: "Sans résultat",
        metrage: null,
        pose: null,
        calepinage: null,
      }),
    ];
    const { meta } = mapperQuantitesPersistees(payloadFixture(zones));
    expect(meta.nb_a_chiffrer).toBe(2);
  });

  it("statique : aucun moteur métier n'est importé par le mapper", () => {
    const source = readFileSync("./lib/metreVersPostes.ts", "utf8");
    expect(source).not.toMatch(/components\/ZoneCard/);
    expect(source).not.toMatch(/lib\/poseCalcul/);
    expect(source).not.toMatch(/lib\/calepinageCalcul/);
    expect(source).not.toMatch(/1\.5|facteur|REGLES_OSSATURE/);
  });
});