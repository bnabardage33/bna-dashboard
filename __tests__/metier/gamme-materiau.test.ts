// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  calculerIndicateurMargeTarif,
  calculerPrixVenteDepuisRevient,
  estContexteOssature,
  GAMME_MATERIAU_CONFIG,
  getGammeLabelClient,
  getGammeLibellesContextuels,
  normaliserGammeMateriau,
  parseNombreDecimal,
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

  it("calcule automatiquement le prix unitaire HT et la marge depuis le coût de revient et la gamme", () => {
    expect(parseNombreDecimal("120,40")).toBe(120.4);
    expect(parseNombreDecimal("")).toBe(0);

    expect(calculerPrixVenteDepuisRevient(100, "eco")).toBe(125);
    expect(calculerPrixVenteDepuisRevient(100, "standard")).toBe(130);
    expect(calculerPrixVenteDepuisRevient(120.4, "premium")).toBe(162.54);
    expect(calculerPrixVenteDepuisRevient(100, "prestige")).toBe(140);
    expect(calculerPrixVenteDepuisRevient(0, "premium")).toBe(0);

    const ind = calculerIndicateurMargeTarif(162.54, 120.4, "premium");
    expect(ind.labelClient).toBe("Premium");
    expect(ind.coef).toBe(1.35);
    expect(ind.margeEuro).toBe(42.14);
    expect(ind.margePct).toBeCloseTo(25.9259, 2);
  });

  it("adapte les libellés de gamme en Classe 2 / 3 / 4 / 5 (EN 335) pour le contexte ossature", () => {
    expect(estContexteOssature({ famille: "Ossature & Fixations" })).toBe("ossature");
    expect(estContexteOssature({ categorie: "lambourde" })).toBe("ossature");
    expect(estContexteOssature({ categorie: "poteau", materiau: "BOIS" })).toBe("ossature");
    expect(estContexteOssature({ famille: "Bardage Bois" })).toBe("standard");

    const c2 = getGammeLibellesContextuels("eco", "ossature");
    const c3 = getGammeLibellesContextuels("standard", "ossature");
    const c4 = getGammeLibellesContextuels("premium", "ossature");
    const c5 = getGammeLibellesContextuels("prestige", "ossature");

    expect(c2.labelClient).toBe("Classe 2");
    expect(c3.labelClient).toBe("Classe 3");
    expect(c4.labelClient).toBe("Classe 4");
    expect(c4.prefixDevis).toBe("Classe");
    expect(c5.labelClient).toBe("Classe 5 / Exotique");
  });
});
