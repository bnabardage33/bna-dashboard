import { describe, it, expect } from "vitest";
import { calculerTerrasse } from "@/lib/terrasse/calculs";
import type { ChantierTerrasseConfig } from "@/lib/terrasse/types";

const configStandard: ChantierTerrasseConfig = {
  chantier_id: "chantier-456",
  nom: "Terrasse 24m2",
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

describe("Calculs et quantitatifs Terrasse DTU 51.4", () => {
  it("calcule les surfaces et dimensions de la terrasse", () => {
    const res = calculerTerrasse(configStandard);
    expect(res.surfaceBruteM2).toBe(24);
    expect(res.perimetreM).toBe(20);
  });

  it("calcule les rangées et le linéaire de lambourdes", () => {
    const res = calculerTerrasse(configStandard);
    // Longueur 6m, entraxe 40cm -> 600/40 + 1 = 16 rangées (+ renforts aboutages)
    expect(res.lambourdes.nbRangees).toBeGreaterThanOrEqual(16);
    expect(res.lambourdes.lineaireMl).toBeGreaterThan(60);
    expect(res.lambourdes.nbBarres).toBeGreaterThan(15);
  });

  it("calcule le nombre et la densité de plots", () => {
    const res = calculerTerrasse(configStandard);
    expect(res.plots.nbPlotsTotal).toBeGreaterThan(50);
    expect(res.plots.densiteParM2).toBeGreaterThanOrEqual(3);
  });

  it("calcule les lames et les fixations inox", () => {
    const res = calculerTerrasse(configStandard);
    expect(res.lames.surfaceACommanderM2).toBeCloseTo(24 * 1.1, 1);
    expect(res.fixations.nbVisOuClipsTotal).toBeGreaterThan(500);
    expect(res.fixations.nbBoites).toBeGreaterThanOrEqual(3); // boîtes de 200
  });

  it("génère une nomenclature chiffrée avec total HT", () => {
    const res = calculerTerrasse(configStandard);
    expect(res.chiffrage.lignes.length).toBeGreaterThanOrEqual(4);
    expect(res.chiffrage.totalHt).toBeGreaterThan(1000);
  });
});
