import { describe, it, expect } from "vitest";
import {
  CADENCES_DEFAUT,
  calculerTempsBudget,
  calculerTempsPlanification,
  calculerTempsConsommeMeteo,
  calculerBilanRentabilite,
  calculerTempsPoseBardage,
  calculerTempsPoseTerrasse,
  fusionnerCadencesDepuisCatalogueTemps,
} from "@/lib/tempsPoseCalcul";
import type { ResultatMetre } from "@/lib/metre-serialization";
import type { ResultatCalculTerrasse, ChantierTerrasseConfig } from "@/lib/terrasse/types";
import { mapperQuantitesPersistees } from "@/lib/metreVersPostes";
import { construireLignesDepuisPostes } from "@/lib/iaDevisMetre";
import type { PayloadMetreComplet } from "@/lib/metre-complet";
import { calculerTerrasse } from "@/lib/terrasse/calculs";

function makeZoneMetre(overrides: {
  type?: "facade" | "pignon";
  famille_pose?: "hpl" | "composite" | "bois_naturel" | "cassette";
  materiau?: "lames" | "plaques";
  largeur?: number;
  hauteur_mur?: number;
  hauteur_faite?: number | null;
  angle?: boolean;
  surfaceNette?: number;
  isolantActif?: boolean;
  ouvertures?: Array<{ id: string; type: "fenetre" | "porte"; largeur: number; hauteur: number }>;
}): ResultatMetre {
  const ouvertures = overrides.ouvertures ?? [];
  return {
    version_moteur: "1.0.0",
    calcule_le: "2026-11-16T00:00:00.000Z",
    entrees: {
      type: overrides.type ?? "facade",
      largeur: overrides.largeur ?? 10,
      hauteur_mur: overrides.hauteur_mur ?? 3,
      hauteur_faite: overrides.hauteur_faite ?? null,
      materiau: overrides.materiau ?? "lames",
      famille_pose: overrides.famille_pose ?? "composite",
      angle: overrides.angle ?? false,
      largeur_lame_mm: 202,
      plaque_longueur_mm: null,
      plaque_largeur_mm: null,
      module_largeur_mm: null,
      module_hauteur_mm: null,
      sens_pose: "horizontal",
      type_isolant: overrides.isolantActif ? "laine_roche" : "sans_isolant",
      epaisseur_isolant_mm: overrides.isolantActif ? 120 : 0,
      surface_paquet_m2: 4.8,
      zone_vent_rive: false,
      coef_perte_rendement: 1.1,
      ouvertures,
    },
    resultat_zone: {
      bruteFacade: 30,
      brutePignon: 0,
      pente: 0,
      totalOuvertures: 0,
      surfaceNette: overrides.surfaceNette ?? 30,
      marge: 1.1,
      surfaceACommander: 33,
      nombreOuvertures: ouvertures.length,
      totalCoupesML: 6,
      lamesACommander: 0,
      surfaceTheoriqueLames: 0,
      lamesNeuvesSimul: 0,
      morceauxReutilises: 0,
      longueurChutesGenerees: 0,
      longueurChutesReutilisees: 0,
      chutesPerdues: 0,
    },
    resultat_pose: {
      entraxeVertical: 1.35,
      entraxeHorizontal: 0.6,
      positionsChevronsM: [0, 0.6],
      nbMontants: 18,
      nbSegmentsChevrons: 18,
      lineaireChevronsM: 54,
      fixationsParMontant: 3,
      nbFixationsTotal: 54,
      nbEquerresPorteuses: 18,
      nbEquerresGuides: 36,
      nbChevillesMurales: 108,
      nbVisChevronEquerre: 144,
      nbVisParement: 300,
      nbVis: 444,
      lineaireBandeEPDMM: 56.7,
      isolant: {
        actif: overrides.isolantActif ?? false,
        typeIsolant: "laine_roche",
        epaisseurMm: 120,
        surfaceNetteM2: overrides.surfaceNette ?? 30,
        surfaceACommanderM2: 32.4,
        tauxPertePct: 8,
        surfacePaquetM2: 4.8,
        nbPaquetsACommander: 7,
        nbChevillesRosaces: 150,
        modeleEquerreIsolco: "Isolco 3000 P2 140 mm",
      },
      joint: "5 mm",
      remarques: [],
    },
    resultat_calepinage: null,
  };
}

describe("tempsPoseCalcul — fonctions historiques", () => {
  it("calcule le temps budget, la planification, le consommé météo et la rentabilité", () => {
    const budget = calculerTempsBudget(40, 0.5, 10, 0.3, 2, 1.5);
    expect(budget).toBeCloseTo(26, 2);
    expect(calculerTempsPlanification(budget, 2)).toBeCloseTo(13, 2);
    const conso = calculerTempsConsommeMeteo([
      { volumeHeures: 13, coefMeteo: 1.3 },
      { volumeHeures: 10, coefMeteo: 1.0 },
    ]);
    expect(conso).toBeCloseTo(20, 2);
    expect(calculerBilanRentabilite(budget, conso)).toBeCloseTo(6, 2);
  });

  it("fusionne les cadences catalogue_temps avec CADENCES_DEFAUT", () => {
    const res = fusionnerCadencesDepuisCatalogueTemps([
      { nom_tache: "taux_horaire_vente_ht", temps_unitaire_heure: 52 },
      { nom_tache: "taux_horaire_charge_ht", temps_unitaire_heure: 31 },
      { nom_tache: "bardage_ite_h_m2", temps_unitaire_heure: 0.4 },
      { nom_tache: "cle_inconnue", temps_unitaire_heure: 999 },
      { nom_tache: "bardage_ossature_h_m2", temps_unitaire_heure: -5 },
    ]);
    expect(res.taux_horaire_vente_ht).toBe(52);
    expect(res.taux_horaire_charge_ht).toBe(31);
    expect(res.bardage_ite_h_m2).toBe(0.4);
    expect(res.bardage_ossature_h_m2).toBe(CADENCES_DEFAUT.bardage_ossature_h_m2);
  });
});

describe("tempsPoseCalcul — Bardage", () => {
  it("ventile les 4 phases pour une façade clin composite avec ITE et 2 ouvertures + angle", () => {
    const zone = makeZoneMetre({
      type: "facade",
      famille_pose: "composite",
      materiau: "lames",
      largeur: 10,
      hauteur_mur: 3,
      angle: true,
      surfaceNette: 30,
      isolantActif: true,
      ouvertures: [
        { id: "o1", type: "fenetre", largeur: 1.2, hauteur: 1.2 },
        { id: "o2", type: "porte", largeur: 1.0, hauteur: 2.1 },
      ],
    });
    const res = calculerTempsPoseBardage(zone);
    // Isolation: 30 * 0.30 = 9h
    expect(res.parPhase.isolation).toBe(9);
    // Ossature: 30 * 0.55 = 16.5h
    expect(res.parPhase.ossature).toBe(16.5);
    // Bardage clin: 30 * 0.65 = 19.5h
    expect(res.parPhase.bardage).toBe(19.5);
    // Finitions: 2 ouvertures * 1.80h = 3.60h + cornières (2*3m = 6ml * 0.25 = 1.50h) => 5.10h
    expect(res.parPhase.finitions).toBe(5.1);
    expect(res.totalHeures).toBe(50.1);
  });

  it("applique la cadence HPL (1.00 h/m²) et la majoration pignon (+25 %)", () => {
    const pignonHpl = makeZoneMetre({
      type: "pignon",
      famille_pose: "hpl",
      materiau: "plaques",
      largeur: 8,
      hauteur_mur: 3,
      hauteur_faite: 5,
      surfaceNette: 20,
      isolantActif: false,
    });
    const res = calculerTempsPoseBardage(pignonHpl);
    expect(res.parPhase.isolation).toBe(0);
    // 20 * 1.00 * 1.25 = 25h
    expect(res.parPhase.bardage).toBe(25);
    expect(res.parPhase.ossature).toBe(11);
  });

  it("applique la cadence claire-voie (0.85 h/m²) lorsque demandée", () => {
    const facade = makeZoneMetre({ surfaceNette: 20 });
    const res = calculerTempsPoseBardage(facade, { claireVoie: true });
    expect(res.parPhase.bardage).toBe(17);
  });
});

describe("tempsPoseCalcul — Terrasse & Terrasse Mobile", () => {
  it("calcule les 4 phases avec escalier, garde-corps et terrasse mobile motorisée", () => {
    const mockTerrasse = {
      surfaceNetteM2: 40,
      escalier: { present: true },
      gardeCorps: { present: true, longueurMl: 8 },
      terrasseMobile: {
        active: true,
        motorisation: { active: true },
      },
    } as unknown as ResultatCalculTerrasse;

    const res = calculerTempsPoseTerrasse(mockTerrasse);
    // Préparation: 40 * 0.15 = 6h
    expect(res.parPhase.terrassement_support).toBe(6);
    // Structure: 40 * 0.45 = 18h
    expect(res.parPhase.structure_plots_lambourdes).toBe(18);
    // Platelage: 40 * 0.55 = 22h
    expect(res.parPhase.pose_platelage).toBe(22);
    // Finitions: escalier (4h) + garde-corps (8 * 0.5 = 4h) + mobile (8h) + motorisation (4h) = 20h
    expect(res.parPhase.finitions_rives).toBe(20);
    expect(res.totalHeures).toBe(66);
  });
});

describe("Devis — injection automatique des lignes de main-d'œuvre", () => {
  it("génère des postes main_oeuvre (heures × taux horaire vente) dans metreVersPostes + iaDevisMetre", () => {
    const zoneMetre = makeZoneMetre({ surfaceNette: 20, isolantActif: true });
    const payload: PayloadMetreComplet = {
      chantier: {
        id: "c1",
        nom: "Test",
        client: null,
        adresse: null,
        materiau_structurel: "bois",
        moyen_acces: "echafaudage",
        zone_vent: 2,
        coef_perte_rendement: 1.1,
      },
      configuration_technique: {
        type_isolant: "laine_roche",
        epaisseur_isolant_mm: 120,
        surface_paquet_m2: 4.8,
        zone_vent_rive: false,
        coef_perte_rendement: 1.1,
      },
      zones: [
        {
          zone: {
            id: "z1",
            nom: "Façade Sud",
            type: "facade",
            materiau: "lames",
            famille_pose: "composite",
            sens_pose: "horizontal",
            largeur: 10,
            hauteur_mur: 2,
            hauteur_faite: null,
            angle: false,
            largeur_lame_mm: 202,
            plaque_longueur_mm: null,
            plaque_largeur_mm: null,
            module_largeur_mm: null,
            module_hauteur_mm: null,
            ouvertures: [],
          },
          metrage: zoneMetre.resultat_zone,
          pose: zoneMetre.resultat_pose,
          calepinage: null,
          version_moteur: zoneMetre.version_moteur,
          calcule_le: zoneMetre.calcule_le,
          entrees: zoneMetre.entrees,
        },
      ],
      totaux: { surface_m2: 20, quantite_coupes_ml: 4, singularites_nb: 0 },
      meta: {
        version_moteur: "1.0.0",
        nombre_zones: 1,
        zones_calculees: 1,
        statut_completude: "complet",
        manquants: [],
      },
    };

    const sansMo = mapperQuantitesPersistees(payload);
    expect(sansMo.postes.some((p) => p.categorie === "main_oeuvre")).toBe(false);

    const avecMo = mapperQuantitesPersistees(payload, {
      inclureMainOeuvre: true,
      cadences: { taux_horaire_vente_ht: 50, taux_horaire_charge_ht: 30 },
    });
    const postesMo = avecMo.postes.filter((p) => p.categorie === "main_oeuvre");
    expect(postesMo.length).toBe(4); // isolation, ossature, bardage, finitions (rives)

    const lignes = construireLignesDepuisPostes(avecMo.postes, []);
    const lignesMo = lignes.filter((l) => l.type_cout === "main_oeuvre");
    expect(lignesMo.length).toBe(4);
    expect(lignesMo[0].unite).toBe("h");
    expect(lignesMo[0].pu_ht).toBe(50);
    expect(lignesMo[0].pu_revient).toBe(30);
    expect(lignesMo[0].a_chiffrer).toBe(false);
  });

  it("ajoute les lignes MO-TER-01..04 dans calculerTerrasse quand inclureMainOeuvre est activé", () => {
    const configBase: ChantierTerrasseConfig = {
      chantier_id: "c1",
      nom: "Terrasse Test",
      longueur_m: 5,
      largeur_m: 4,
      hauteur_sol_cm: 15,
      type_sol: "dalle_beton",
      pente_pct: 1.5,
      essence_bois: "pin_cl4",
      type_pose: "perpendiculaire",
      largeur_lame_mm: 145,
      epaisseur_lame_mm: 27,
      longueur_lame_m: 4,
      espacement_lames_mm: 5,
      type_fixation: "vis_inox",
      type_lambourde: "bois_cl4",
      section_largeur_mm: 45,
      section_hauteur_mm: 70,
      longueur_lambourde_m: 4,
      entraxe_lambourdes_cm: 45,
      double_lambourdage_aboutage: false,
      bande_etancheite_epdm: true,
      cales_isolation: true,
      type_plots: "reglables",
      entraxe_plots_cm: 60,
      hauteur_reglage_plots: "90_150",
      geotextile: true,
      presence_escalier: true,
      escalier_nb_marches: 3,
      escalier_largeur_m: 1.2,
      escalier_giron_cm: 28,
      escalier_hauteur_marche_cm: 17,
      presence_garde_corps: false,
      garde_corps_longueur_ml: 0,
      garde_corps_type: "alu_verre",
      garde_corps_hauteur_cm: 100,
      coef_perte_lames: 1.1,
      coef_perte_lambourdes: 1.1,
    };

    const sansMo = calculerTerrasse(configBase);
    expect(sansMo.chiffrage.lignes.some((l) => l.categorie === "Main-d'œuvre")).toBe(false);

    const avecMo = calculerTerrasse(configBase, [], null, {
      inclureMainOeuvre: true,
      cadences: { taux_horaire_vente_ht: 50 },
    });
    const lignesMo = avecMo.chiffrage.lignes.filter((l) => l.categorie === "Main-d'œuvre");
    expect(lignesMo.length).toBe(4);
    expect(lignesMo.every((l) => l.unite === "h" && l.prixUnitaireHt === 50)).toBe(true);
    expect(avecMo.chiffrage.totalHt).toBeGreaterThan(sansMo.chiffrage.totalHt);
  });
});
