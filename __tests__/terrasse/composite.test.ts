import { describe, it, expect } from "vitest";
import { calculerDilatationComposite } from "@/lib/terrasse/composite/dilatation";
import { calculerClipsComposite } from "@/lib/terrasse/composite/clips";
import { calculComposite } from "@/lib/terrasse/composite/calculs";
import { auditComposite } from "@/lib/terrasse/composite/audit";
import { getFabricantComposite, estDTAExpire } from "@/lib/terrasse/composite/fabricants";
import type { ChantierTerrasseConfig } from "@/lib/terrasse/types";

describe("Sous-module Composite - Moteur DTA GS 2.1 & Fabricants", () => {
  const fabricantSilvadec = getFabricantComposite("silvadec");
  const gammeAtmosphere = fabricantSilvadec.gammes[0];

  it("calcule la dilatation thermique selon la température de pose et la zone", () => {
    // Pose par temps frais (8°C) sur lame de 4m
    const resFroid = calculerDilatationComposite(4.0, gammeAtmosphere, 8, "normal");
    expect(resFroid.deltaLMaxMm).toBeGreaterThan(0);
    expect(resFroid.jeuAboutageRecommandeMm).toBeGreaterThanOrEqual(5);
    expect(resFroid.gradeInoxRequis).toBe("A2");

    // En zone piscine, inox A4 obligatoire
    const resPiscine = calculerDilatationComposite(4.0, gammeAtmosphere, 20, "piscine");
    expect(resPiscine.gradeInoxRequis).toBe("A4");
  });

  it("calcule les quantitatifs de clips avec double lambourdage aux aboutages", () => {
    const clips = calculerClipsComposite(28, 16, 1, gammeAtmosphere, "piscine");
    expect(clips.nbClipsDepart).toBe(16);
    expect(clips.nbClipsCourants).toBe((28 - 1) * 16);
    // Double lambourde à l'aboutage : 1 ligne d'aboutage * 16 lambourdes * 2
    expect(clips.nbClipsAboutage).toBe(32);
    expect(clips.gradeInox).toBe("A4");
    expect(clips.nbBoitesClips).toBeGreaterThan(0);
  });

  it("génère le calepinage et le chiffrage complet calculComposite", () => {
    const config: ChantierTerrasseConfig = {
      chantier_id: "c-1",
      nom: "Terrasse Silvadec",
      systeme_terrasse: "composite_clip",
      zone_environnement: "piscine",
      fabricant_composite: "silvadec",
      longueur_m: 6.0,
      largeur_m: 4.0,
      hauteur_sol_cm: 15.0,
      type_sol: "dalle_beton",
      pente_pct: 1.5,
      essence_bois: "composite",
      type_pose: "parallele",
      largeur_lame_mm: 138,
      epaisseur_lame_mm: 23,
      longueur_lame_m: 4.0,
      espacement_lames_mm: 5,
      type_fixation: "clips_invisibles",
      type_lambourde: "alu_structure",
      section_largeur_mm: 40,
      section_hauteur_mm: 50,
      longueur_lambourde_m: 4.0,
      entraxe_lambourdes_cm: 40,
      double_lambourdage_aboutage: true,
      bande_etancheite_epdm: false,
      cales_isolation: true,
      type_plots: "reglables",
      entraxe_plots_cm: 60,
      hauteur_reglage_plots: "40_60",
      geotextile: false,
      presence_escalier: false,
      escalier_nb_marches: 2,
      escalier_largeur_m: 2.0,
      escalier_giron_cm: 28.0,
      escalier_hauteur_marche_cm: 16.0,
      presence_garde_corps: false,
      garde_corps_longueur_ml: 0.0,
      garde_corps_type: "bois_cables",
      garde_corps_hauteur_cm: 100,
      coef_perte_lames: 1.10,
      coef_perte_lambourdes: 1.08,
    };

    const res = calculComposite(config, [
      {
        terrasse_id: "t-1",
        type_reservation: "trappe",
        nom: "Trappe technique",
        x: 1,
        y: 1,
        largeur: 0.6,
        longueur: 0.6,
      },
    ]);

    expect(res.surfaceNetteM2).toBeLessThan(res.surfaceBruteM2);
    expect(res.fixations.type).toBe("clips_invisibles");
    expect(res.fixations.inoxGrade).toBe("A4");
    expect(res.chiffrage.lignes.length).toBeGreaterThan(3);
  });

  it("alerte en cas d'entraxe excessif par rapport au DTA du fabricant", () => {
    const configEntraxeHaut: ChantierTerrasseConfig = {
      chantier_id: "c-1",
      nom: "Terrasse Silvadec",
      systeme_terrasse: "composite_clip",
      fabricant_composite: "silvadec",
      longueur_m: 6.0,
      largeur_m: 4.0,
      hauteur_sol_cm: 15.0,
      type_sol: "dalle_beton",
      pente_pct: 1.5,
      essence_bois: "composite",
      type_pose: "parallele",
      largeur_lame_mm: 138,
      epaisseur_lame_mm: 23,
      longueur_lame_m: 4.0,
      espacement_lames_mm: 5,
      type_fixation: "clips_invisibles",
      type_lambourde: "alu_structure",
      section_largeur_mm: 40,
      section_hauteur_mm: 50,
      longueur_lambourde_m: 4.0,
      entraxe_lambourdes_cm: 50, // DTA exige ≤ 40 cm
      double_lambourdage_aboutage: true,
      bande_etancheite_epdm: false,
      cales_isolation: true,
      type_plots: "reglables",
      entraxe_plots_cm: 60,
      hauteur_reglage_plots: "40_60",
      geotextile: false,
      presence_escalier: false,
      escalier_nb_marches: 2,
      escalier_largeur_m: 2.0,
      escalier_giron_cm: 28.0,
      escalier_hauteur_marche_cm: 16.0,
      presence_garde_corps: false,
      garde_corps_longueur_ml: 0.0,
      garde_corps_type: "bois_cables",
      garde_corps_hauteur_cm: 100,
      coef_perte_lames: 1.10,
      coef_perte_lambourdes: 1.08,
    };

    const audit = auditComposite(configEntraxeHaut);
    expect(audit.statutGlobal).toBe("non_conforme");
    const cEntraxe = audit.controles.find((c) => c.id === "comp_entraxe_lambourdes");
    expect(cEntraxe?.statut).toBe("non_conforme");
  });
});
