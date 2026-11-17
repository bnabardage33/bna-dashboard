// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  GAMME_MATERIAU_CONFIG,
  getGammeLabelClient,
  normaliserGammeMateriau,
} from "@/types/catalogue";
import { calculerBardagePro } from "@/lib/bardage/pro/quantitatifs-contrat";
import { calculerTerrasseProGeometrie } from "@/lib/terrasse/pro/quantitatifs-contrat";
import { calculerChiffrageCloture } from "@/lib/cloture/calculs";
import type { ChantierTerrasseConfig } from "@/lib/terrasse/types";

const BASE_TERRASSE_CFG: ChantierTerrasseConfig = {
  chantier_id: "ch-test-1",
  nom: "Terrasse Test",
  longueur_m: 5,
  largeur_m: 4,
  hauteur_sol_cm: 12,
  type_sol: "dalle_beton",
  pente_pct: 1.5,
  type_pose: "perpendiculaire",
  essence_bois: "pin_cl4",
  epaisseur_lame_mm: 27,
  largeur_lame_mm: 145,
  longueur_lame_m: 4,
  espacement_lames_mm: 5,
  type_fixation: "vis_inox",
  type_lambourde: "bois_cl4",
  section_largeur_mm: 45,
  section_hauteur_mm: 70,
  longueur_lambourde_m: 4,
  entraxe_lambourdes_cm: 40,
  double_lambourdage_aboutage: false,
  bande_etancheite_epdm: false,
  cales_isolation: false,
  type_plots: "reglables",
  entraxe_plots_cm: 50,
  hauteur_reglage_plots: "90_150",
  geotextile: false,
  presence_escalier: false,
  escalier_nb_marches: 0,
  escalier_largeur_m: 1,
  escalier_giron_cm: 28,
  escalier_hauteur_marche_cm: 18,
  presence_garde_corps: false,
  garde_corps_longueur_ml: 0,
  garde_corps_type: "tout_bois",
  garde_corps_hauteur_cm: 100,
  coef_perte_lames: 1.1,
  coef_perte_lambourdes: 1.08,
  zone_environnement: "normal",
};

describe("Gamme Matériau (4 niveaux : eco, standard, premium, prestige)", () => {
  it("normalise les valeurs inconnues ou null vers 'standard' et n'affiche jamais 'Bas de gamme' côté client", () => {
    expect(normaliserGammeMateriau(undefined)).toBe("standard");
    expect(normaliserGammeMateriau(null)).toBe("standard");
    expect(normaliserGammeMateriau("inconnu")).toBe("standard");
    expect(normaliserGammeMateriau("prestige")).toBe("prestige");

    expect(getGammeLabelClient("eco")).toBe("Essentiel");
    expect(getGammeLabelClient("standard")).toBe("Classique");
    expect(getGammeLabelClient("premium")).toBe("Premium");
    expect(getGammeLabelClient("prestige")).toBe("Signature");
    expect(getGammeLabelClient("eco")).not.toContain("Bas de gamme");
  });

  it("propage gamme_qualite, coefTempsPose et margeCibleDefaut dans Bardage Pro et respecte tempsPoseManuelHeures", () => {
    const facade = {
      id: "fac-1",
      nom: "Façade Test",
      type: "facade" as const,
      largeurM: 8,
      hauteurMurM: 3,
      ouvertures: [],
    };
    const resStd = calculerBardagePro(facade, { gamme_qualite: "standard" });
    const resPrestige = calculerBardagePro(facade, { gamme_qualite: "prestige" });
    const resManuel = calculerBardagePro(facade, {
      gamme_qualite: "prestige",
      tempsPoseManuelHeures: 12.5,
    });

    expect(resStd.gamme_qualite).toBe("standard");
    expect(resStd.coefTempsPoseGamme).toBe(1.0);
    expect(resStd.margeCibleDefaut).toBe(1.30);

    expect(resPrestige.gamme_qualite).toBe("prestige");
    expect(resPrestige.coefTempsPoseGamme).toBe(1.30);
    expect(resPrestige.margeCibleDefaut).toBe(1.40);
    expect(resPrestige.heuresPoseEstimatives).toBeGreaterThan(resStd.heuresPoseEstimatives);

    expect(resManuel.coefTempsPoseGamme).toBe(1);
    expect(resManuel.heuresPoseEstimatives).toBe(12.5);
  });

  it("propage gamme_qualite et coefTempsPose dans Terrasse Pro et Clôture", () => {
    const terEco = calculerTerrasseProGeometrie(BASE_TERRASSE_CFG, [], {
      gamme_qualite: "eco",
    });
    const terPrem = calculerTerrasseProGeometrie(BASE_TERRASSE_CFG, [], {
      gamme_qualite: "premium",
    });
    expect(terEco.gamme_qualite).toBe("eco");
    expect(terEco.margeCibleDefaut).toBe(GAMME_MATERIAU_CONFIG.eco.margeCibleDefaut);
    expect(terPrem.gamme_qualite).toBe("premium");
    expect(terPrem.coefTempsPoseGamme).toBe(1.15);
    expect(terPrem.heuresPoseEstimatives).toBeGreaterThan(terEco.heuresPoseEstimatives);

    const cloCfg = {
      forme: "DROITE" as const,
      segments: { A: 10, B: 0, C: 0 },
      hauteurUtile: 1.8,
      materiau: "COMPOSITE" as const,
      longueurLameBrute: 1.8,
      hauteurLame: 0.15,
      extremites: "LIBRE" as const,
      typePoseSol: "DIRECT_SOL" as const,
      presenceSoubassement: false,
    };
    const cloStd = calculerChiffrageCloture(cloCfg, {
      inclureMainOeuvre: true,
      gamme_qualite: "standard",
    });
    const cloPres = calculerChiffrageCloture(cloCfg, {
      inclureMainOeuvre: true,
      gamme_qualite: "prestige",
    });
    expect(cloStd.gamme_qualite).toBe("standard");
    expect(cloPres.gamme_qualite).toBe("prestige");
    expect(cloPres.margeCibleDefaut).toBe(1.40);
    expect(cloPres.tempsPose.totalHeures).toBeGreaterThan(cloStd.tempsPose.totalHeures);
  });
});
