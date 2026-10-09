import { describe, it, expect } from "vitest";
import {
  calculerEntraxeMaxLambourdes,
  calculerPorteeMaxLambourde,
  verifierConformiteDTU51_4,
} from "@/lib/terrasse/dtu51_4";
import type { ChantierTerrasseConfig } from "@/lib/terrasse/types";

const configBase: ChantierTerrasseConfig = {
  chantier_id: "chantier-123",
  nom: "Terrasse test",
  longueur_m: 6.0,
  largeur_m: 4.0,
  hauteur_sol_cm: 20.0,
  type_sol: "dalle_beton",
  pente_pct: 1.5,
  essence_bois: "pin_cl4",
  type_pose: "parallele",
  largeur_lame_mm: 145,
  epaisseur_lame_mm: 21,
  longueur_lame_m: 4.0,
  espacement_lames_mm: 5,
  type_fixation: "vis_inox",
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
  geotextile: true,
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

describe("DTU 51.4 - Moteur de règles métier Terrasse", () => {
  it("calcule correctement l'entraxe maximal admissible des lambourdes", () => {
    // Pin 21 mm -> ratio 20x -> 42 cm
    expect(calculerEntraxeMaxLambourdes(21, "pin_cl4")).toBe(42);
    // Ipé 21 mm -> ratio 23x -> 48 cm
    expect(calculerEntraxeMaxLambourdes(21, "ipe")).toBe(48);
    // Composite 21 mm -> plafonné à 37-40 cm
    expect(calculerEntraxeMaxLambourdes(21, "composite")).toBe(37);
    // Pin 27 mm -> ratio 20x -> 54 cm
    expect(calculerEntraxeMaxLambourdes(27, "pin_cl4")).toBe(54);
  });

  it("calcule la portée admissible des lambourdes entre plots selon section", () => {
    // Section 45x70 sur chant résineux -> 70 cm
    expect(calculerPorteeMaxLambourde(70, 45, "bois_cl4")).toBe(70);
    // Section 40x60 sur chant résineux -> 55 cm
    expect(calculerPorteeMaxLambourde(60, 40, "bois_cl4")).toBe(55);
    // Structure aluminium -> 65 cm
    expect(calculerPorteeMaxLambourde(40, 40, "alu_structure")).toBe(65);
    // Bois exotique 70 mm -> 75 cm
    expect(calculerPorteeMaxLambourde(70, 45, "bois_exotique")).toBe(75);
  });

  it("détecte une terrasse 100% conforme aux règles DTU 51.4", () => {
    const audit = verifierConformiteDTU51_4(configBase);
    expect(audit.statutGlobal).toBe("conforme");
    expect(audit.nbNonConformes).toBe(0);
  });

  it("génère une alerte non conforme si l'entraxe des lambourdes excède la règle DTU", () => {
    const configEntraxeExcessif: ChantierTerrasseConfig = {
      ...configBase,
      entraxe_lambourdes_cm: 55, // pour lame 21 mm (max 42 cm)
    };
    const audit = verifierConformiteDTU51_4(configEntraxeExcessif);
    expect(audit.statutGlobal).toBe("non_conforme");
    const controle = audit.controles.find((c) => c.id === "dtu-entraxe-lambourdes");
    expect(controle?.statut).toBe("non_conforme");
  });

  it("détecte un espacement de lames trop serré (risque de tuilage/dilatation)", () => {
    const configJeuSerré: ChantierTerrasseConfig = {
      ...configBase,
      espacement_lames_mm: 2, // DTU exige min 4 mm
    };
    const audit = verifierConformiteDTU51_4(configJeuSerré);
    const controle = audit.controles.find((c) => c.id === "dtu-jeu-lames");
    expect(controle?.statut).toBe("non_conforme");
  });

  it("exige un garde-corps conforme si la hauteur de chute dépasse 100 cm (NF P01-012)", () => {
    const configHauteSansGardeCorps: ChantierTerrasseConfig = {
      ...configBase,
      hauteur_sol_cm: 120, // > 1.00 m
      presence_garde_corps: false,
    };
    const audit = verifierConformiteDTU51_4(configHauteSansGardeCorps);
    expect(audit.statutGlobal).toBe("non_conforme");
    const controle = audit.controles.find((c) => c.id === "norme-garde-corps-obligatoire");
    expect(controle?.statut).toBe("non_conforme");
  });

  it("valide la loi de Blondel (2H + G = 60 à 64 cm) pour les escaliers", () => {
    const configEscalier: ChantierTerrasseConfig = {
      ...configBase,
      presence_escalier: true,
      escalier_hauteur_marche_cm: 16,
      escalier_giron_cm: 28, // 2*16 + 28 = 60 cm -> Conforme
    };
    const audit = verifierConformiteDTU51_4(configEscalier);
    const controle = audit.controles.find((c) => c.id === "norme-escalier-blondel");
    expect(controle?.statut).toBe("conforme");
  });
});
