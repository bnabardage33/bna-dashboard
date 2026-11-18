import { describe, expect, it } from "vitest";
import {
  CLE_PREFILL_DEVIS_V2,
  convertirQuantitatifEnLignesDevis,
  extraireLignesCommandeFournisseur,
} from "@/lib/quantitatifs/types";
import {
  adapterBardageProEnQuantitatif,
  adapterZonesBardageEnQuantitatif,
} from "@/lib/quantitatifs/adaptateurBardage";
import { adapterTerrasseEnQuantitatif } from "@/lib/quantitatifs/adaptateurTerrasse";
import { adapterClotureEnQuantitatif } from "@/lib/quantitatifs/adaptateurCloture";
import { calculerChiffrageCloture } from "@/lib/cloture/calculs";
import { calculerTerrasse } from "@/lib/terrasse/calculs";
import { calculerBardagePro } from "@/lib/bardage/pro/quantitatifs-contrat";

describe("QuantitatifExportable & Adaptateurs 3 métiers", () => {
  it("adapte le calculateur Bardage Pro vers QuantitatifExportable et filtre la MO pour commande", () => {
    const pro = calculerBardagePro(
      {
        id: "fac-1",
        nom: "Façade Sud",
        type: "facade",
        largeurM: 8,
        hauteurMurM: 3,
        ouvertures: [],
      },
      { gamme: "trespa_meteon" }
    );

    const q = adapterBardageProEnQuantitatif(pro, {
      chantierId: "ch-bardage-1",
      chantierNom: "Villa Dupont",
    });

    expect(CLE_PREFILL_DEVIS_V2).toBe("bna_prefill_devis_v2");
    expect(q.metier).toBe("bardage");
    expect(q.lignes.some((l) => l.categorie === "materiaux")).toBe(true);
    expect(q.lignes.some((l) => l.categorie === "main_oeuvre")).toBe(true);

    const cmdLignes = extraireLignesCommandeFournisseur(q);
    expect(cmdLignes.length).toBeGreaterThan(0);
    expect(cmdLignes.every((l) => l.unite !== "h")).toBe(true);

    const zonesRes = adapterZonesBardageEnQuantitatif([
      { id: "z1", nom: "Façade Nord", materiau: "HPL Trespa", surfaceNetteM2: 20, surfaceACommanderM2: 22 },
    ]);
    expect(zonesRes.metier).toBe("bardage");
    expect(zonesRes.lignes).toHaveLength(2);
  });

  it("adapte le calculateur Terrasse vers QuantitatifExportable", () => {
    const res = calculerTerrasse({
      id: "t-1",
      chantier_id: "ch-terrasse-1",
      nom: "Terrasse Pin",
      longueur_m: 6,
      largeur_m: 4,
      hauteur_sol_cm: 15,
      type_sol: "dalle_beton",
      pente_pct: 1.5,
      essence_bois: "pin_cl4",
      type_pose: "parallele",
      largeur_lame_mm: 145,
      epaisseur_lame_mm: 27,
      longueur_lame_m: 3,
      espacement_lames_mm: 5,
      type_fixation: "vis_inox",
      type_lambourde: "bois_cl4",
      section_largeur_mm: 45,
      section_hauteur_mm: 70,
      longueur_lambourde_m: 3,
      entraxe_lambourdes_cm: 40,
      double_lambourdage_aboutage: false,
      bande_etancheite_epdm: true,
      cales_isolation: false,
      type_plots: "reglables",
      entraxe_plots_cm: 50,
      hauteur_reglage_plots: "40_60",
      geotextile: false,
      presence_escalier: false,
      escalier_nb_marches: 0,
      escalier_largeur_m: 0,
      escalier_giron_cm: 0,
      escalier_hauteur_marche_cm: 0,
      presence_garde_corps: false,
      garde_corps_longueur_ml: 0,
      garde_corps_type: "tout_bois",
      garde_corps_hauteur_cm: 100,
      coef_perte_lames: 1.08,
      coef_perte_lambourdes: 1.05,
      zone_environnement: "normal",
    });

    const q = adapterTerrasseEnQuantitatif(res, {
      chantierId: "ch-terrasse-1",
      chantierNom: "Terrasse Martin",
    });

    expect(q.metier).toBe("terrasse");
    expect(q.surface_ou_lineaire).toBe(res.surfaceNetteM2);
    expect(q.lignes.length).toBeGreaterThan(0);

    const devisLignes = convertirQuantitatifEnLignesDevis(q);
    expect(devisLignes.length).toBe(q.lignes.filter((l) => l.quantite > 0).length);
  });

  it("adapte le calculateur Clôture vers QuantitatifExportable (fournitures + main d'oeuvre)", () => {
    const chiffrage = calculerChiffrageCloture(
      {
        forme: "DROITE",
        segments: { A: 12, B: 0, C: 0 },
        hauteurUtile: 1.8,
        materiau: "COMPOSITE",
        longueurLameBrute: 1.8,
        hauteurLame: 0.15,
        extremites: "LIBRE",
        typePoseSol: "DIRECT_SOL",
        presenceSoubassement: false,
        gestionPente: "PLAT",
      },
      { inclureMainOeuvre: true }
    );

    const q = adapterClotureEnQuantitatif(chiffrage, {
      chantierId: "ch-cloture-1",
      materiauLabel: "Clôture Composite",
    });

    expect(q.metier).toBe("cloture");
    expect(q.surface_ou_lineaire).toBe(12);
    expect(q.lignes.some((l) => l.categorie === "ossature")).toBe(true);
    expect(q.lignes.some((l) => l.categorie === "main_oeuvre")).toBe(true);

    const cmdLignes = extraireLignesCommandeFournisseur(q);
    expect(cmdLignes.every((l) => l.unite !== "h")).toBe(true);
  });
});
