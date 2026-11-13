import { describe, it, expect } from "vitest";
import {
  resoudreConfigTerrasseMobile,
  calculerSousEnsembleTerrasseMobile,
} from "@/lib/terrasse/pro/terrasse-mobile";
import { calculerTerrasse } from "@/lib/terrasse/calculs";
import type {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
} from "@/lib/terrasse/types";

describe("Terrasse Mobile Coulissante sur Rails (Piscine)", () => {
  const baseConfig: ChantierTerrasseConfig = {
    chantier_id: "test-chantier-123",
    nom: "Terrasse Piscine Pro",
    longueur_m: 8.0,
    largeur_m: 5.0,
    hauteur_sol_cm: 15.0,
    type_sol: "dalle_beton",
    pente_pct: 1.5,
    essence_bois: "pin_cl4",
    type_pose: "parallele",
    largeur_lame_mm: 145,
    epaisseur_lame_mm: 21,
    longueur_lame_m: 4.0,
    espacement_lames_mm: 5,
    type_fixation: "vis_inox",
    type_lambourde: "alu_structure",
    section_largeur_mm: 40,
    section_hauteur_mm: 80,
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
    escalier_nb_marches: 0,
    escalier_largeur_m: 0,
    escalier_giron_cm: 0,
    escalier_hauteur_marche_cm: 0,
    presence_garde_corps: false,
    garde_corps_longueur_ml: 0,
    garde_corps_type: "bois_cables",
    garde_corps_hauteur_cm: 0,
    coef_perte_lames: 1.1,
    coef_perte_lambourdes: 1.08,
  };

  const poolReservation: ChantierTerrasseReservation = {
    terrasse_id: "test-terrasse",
    type_reservation: "piscine",
    nom: "Piscine 4x2.5",
    x: 1.5,
    y: 1.0,
    largeur: 4.0,
    longueur: 2.5,
    terrasse_mobile: {
      active: true,
      mode: "1_plateau",
      sens_refoulement: "droite",
      hauteur_chassis_alu_mm: 100,
      jeu_fonctionnel_peripherique_mm: 20,
      section_profil_alu_mm: "80x40",
      charge_exploitation_kn_m2: 2.5,
    },
  };

  it("1. Résout correctement la configuration de terrasse mobile liée à la réservation piscine", () => {
    const mob = resoudreConfigTerrasseMobile(baseConfig, poolReservation);
    expect(mob).not.toBeNull();
    expect(mob?.active).toBe(true);
    expect(mob?.mode).toBe("1_plateau");
    expect(mob?.sens_refoulement).toBe("droite");
    expect(mob?.hauteur_chassis_alu_mm).toBe(100);
    expect(mob?.jeu_fonctionnel_peripherique_mm).toBe(20);
  });

  it("2. Calcule les dimensions, châssis et rails pour le mode 1_plateau (coulissement latéral)", () => {
    const res = calculerSousEnsembleTerrasseMobile({
      config: baseConfig,
      poolReservation,
      mobileConfig: poolReservation.terrasse_mobile!,
    });

    const { resultatPlateau, mobileStructure } = res;

    // Dimensions avec jeu de 20 mm de chaque côté
    // Largeur piscine = 4.0 m -> 4.0 + 2*0.02 = 4.04 m
    // Longueur piscine = 2.5 m -> 2.5 + 2*0.02 = 2.54 m
    expect(resultatPlateau.dimensionsPlateau.largeurM).toBe(4.04);
    expect(resultatPlateau.dimensionsPlateau.longueurM).toBe(2.54);
    expect(resultatPlateau.dimensionsPlateau.surfaceM2).toBeCloseTo(10.26, 1);

    // Châssis alu et profilés
    expect(resultatPlateau.hauteurChassisMm).toBe(100);
    expect(resultatPlateau.structureChassis.lineaireProfilesAluM).toBeGreaterThan(20);
    expect(resultatPlateau.structureChassis.sectionAluMm).toBe("80x40");

    // Rails inox au sol
    // Refoulement à droite : longueur rail = bassin + refoulement + marge
    expect(resultatPlateau.rails.nbRails).toBe(2);
    expect(resultatPlateau.rails.longueurUnitaireM).toBeGreaterThanOrEqual(4.04 * 2);
    expect(resultatPlateau.rails.lineaireTotalM).toBeGreaterThanOrEqual(16.0);

    // Roulement
    expect(resultatPlateau.roulement.nbGaletsTotal).toBeGreaterThanOrEqual(4);
    expect(resultatPlateau.roulement.chargeParGaletKg).toBeGreaterThan(0);
    expect(resultatPlateau.roulement.chargeParGaletKg).toBeLessThan(350);

    // 1 seul panneau avec vecteur direction vers la droite
    expect(mobileStructure.panels.length).toBe(1);
    expect(mobileStructure.panels[0].directionVector).toEqual({ x: 1, y: 0 });
    expect(mobileStructure.panels[0].travelDistanceMm).toBeGreaterThanOrEqual(4040);
  });

  it("3. Calcule les 2 demi-plateaux pour le mode 2_demi_plateaux (ouverture centrale symétrique)", () => {
    const configDeuxPlateaux = {
      ...poolReservation.terrasse_mobile!,
      mode: "2_demi_plateaux" as const,
      sens_refoulement: "droite" as const,
    };

    const res = calculerSousEnsembleTerrasseMobile({
      config: baseConfig,
      poolReservation,
      mobileConfig: configDeuxPlateaux,
    });

    const { resultatPlateau, mobileStructure } = res;

    expect(resultatPlateau.mode).toBe("2_demi_plateaux");
    expect(mobileStructure.panels.length).toBe(2);

    // Les 2 demi-plateaux ont des largeurs divisées par 2
    const p1 = mobileStructure.panels[0];
    const p2 = mobileStructure.panels[1];

    expect(p1.widthMm).toBe(Math.round(4040 / 2));
    expect(p2.widthMm).toBe(Math.round(4040 / 2));

    // Direction opposée : l'un va à gauche (-1, 0), l'autre à droite (1, 0)
    expect(p1.directionVector).toEqual({ x: -1, y: 0 });
    expect(p2.directionVector).toEqual({ x: 1, y: 0 });

    // Course divisée par 2 par rapport au monobloc
    expect(p1.travelDistanceMm).toBeLessThan(4040);
    expect(p2.travelDistanceMm).toBeLessThan(4040);

    // Minimum 4 galets par demi-plateau
    expect(p1.wheels.length).toBeGreaterThanOrEqual(4);
    expect(p2.wheels.length).toBeGreaterThanOrEqual(4);
    expect(resultatPlateau.roulement.nbGaletsTotal).toBeGreaterThanOrEqual(8);
  });

  it("4. S'intègre dans calculerTerrasse() et enrichit quantitatifs-contrat (Q_net, Q_tech, Q_appro)", () => {
    const resultat = calculerTerrasse(baseConfig, [poolReservation]);

    expect(resultat.terrassePro).toBeDefined();
    expect(resultat.terrasseMobile).toBeDefined();

    const mob = resultat.terrasseMobile!;
    expect(mob.active).toBe(true);
    expect(mob.mode).toBe("1_plateau");
    expect(mob.rails.lineaireTotalM).toBeGreaterThan(0);

    // Vérification du contrat de sortie quantitatif
    const q = resultat.terrassePro!.quantities;
    expect(q.geometricNet.mobileDeckingNetAreaM2).toBe(mob.dimensionsPlateau.surfaceM2);
    expect(q.geometricNet.mobileRailsNetLinearMeters).toBe(mob.rails.lineaireTotalM);
    expect(q.geometricNet.mobileChassisNetLinearMeters).toBe(
      mob.structureChassis.lineaireProfilesAluM
    );
    expect(q.geometricNet.mobileWheelsCount).toBe(mob.roulement.nbGaletsTotal);

    // Quantités d'approvisionnement
    expect(q.commercialSupply.mobileSupply).toBeDefined();
    expect(q.commercialSupply.mobileSupply?.railsInoxLinearMeters).toBe(mob.rails.lineaireTotalM);
    expect(q.commercialSupply.mobileSupply?.railsInoxBarsCount).toBeGreaterThan(0);
    expect(q.commercialSupply.mobileSupply?.wheelsCount).toBe(mob.roulement.nbGaletsTotal);
    expect(q.commercialSupply.mobileSupply?.chassisAluBarsCount).toBeGreaterThan(0);
  });
});
