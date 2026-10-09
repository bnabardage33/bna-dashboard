import { describe, it, expect } from "vitest";
import { verifierEligibiliteClipBois } from "@/lib/terrasse/bois/clipsBois";
import { calculerVissageApparentDTU } from "@/lib/terrasse/bois/vissage";
import { auditBois } from "@/lib/terrasse/bois/audit";
import type { ChantierTerrasseConfig } from "@/lib/terrasse/types";

describe("Sous-module Bois - DTU 51.4 & Clips Avis Techniques", () => {
  it("rejette les essences instables en clips invisibles", () => {
    // Pin sylvestre
    const testPin = verifierEligibiliteClipBois("pin_cl4", 145, 21);
    expect(testPin.estEligible).toBe(false);

    // Douglas
    const testDouglas = verifierEligibiliteClipBois("douglas", 140, 21);
    expect(testDouglas.estEligible).toBe(false);
  });

  it("valide l'Ipé en clips invisibles uniquement si largeur ≤ 120 mm", () => {
    // Ipé 120 mm -> Eligible
    const testIpeOk = verifierEligibiliteClipBois("ipe", 120, 21);
    expect(testIpeOk.estEligible).toBe(true);

    // Ipé 145 mm -> Rejeté (risque tuilage excessif)
    const testIpeLarge = verifierEligibiliteClipBois("ipe", 145, 21);
    expect(testIpeLarge.estEligible).toBe(false);
  });

  it("calcule les vis selon DTU 51.4 et impose Inox A4 en zone littoral/piscine", () => {
    const visStandard = calculerVissageApparentDTU(21, 145, "pin_cl4", "normal");
    expect(visStandard.nbVisParPoint).toBe(2);
    expect(visStandard.diametreVisMinMm).toBe(5);
    expect(visStandard.longueurVisMinMm).toBeGreaterThanOrEqual(50);
    expect(visStandard.inoxGrade).toBe("A2");

    const visLittoral = calculerVissageApparentDTU(21, 145, "pin_cl4", "littoral");
    expect(visLittoral.inoxGrade).toBe("A4");
  });

  it("génère une non-conformité si clips activés sur Pin", () => {
    const configPinClips: ChantierTerrasseConfig = {
      chantier_id: "c-1",
      nom: "Terrasse Pin Clips",
      systeme_terrasse: "bois_clip",
      longueur_m: 6.0,
      largeur_m: 4.0,
      hauteur_sol_cm: 15.0,
      type_sol: "dalle_beton",
      pente_pct: 1.5,
      essence_bois: "pin_cl4",
      type_pose: "parallele",
      largeur_lame_mm: 145,
      epaisseur_lame_mm: 21,
      longueur_lame_m: 4.0,
      espacement_lames_mm: 5,
      type_fixation: "clips_invisibles",
      type_lambourde: "bois_cl4",
      section_largeur_mm: 45,
      section_hauteur_mm: 70,
      longueur_lambourde_m: 4.0,
      entraxe_lambourdes_cm: 40,
      double_lambourdage_aboutage: true,
      bande_etancheite_epdm: true,
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

    const audit = auditBois(configPinClips);
    expect(audit.statutGlobal).toBe("non_conforme");
    const cFix = audit.controles.find((c) => c.id === "bois_fixation_clip");
    expect(cFix?.statut).toBe("non_conforme");
  });
});
