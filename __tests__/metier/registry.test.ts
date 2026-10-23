import { describe, it, expect } from "vitest";
import {
  METIERS_CODES,
  METIER_DEFAUT,
  METIERS_REGISTRY,
  PHASES_MAIN_OEUVRE_BARDAGE,
  PHASES_MAIN_OEUVRE_TERRASSE,
  estMetierCode,
  estFiltreMetier,
  estScopeStockMetier,
  resoudreMetierCode,
  getMetierConfig,
  listerMetiers,
  getMetierParCatalogueType,
  getPhasesMainOeuvre,
  creerChecklistChantierInitiale,
} from "@/lib/metiers/registry";
import {
  MATERIAU_STRUCTUREL_DEFAUT,
  MOYEN_ACCES_DEFAUT,
  ZONE_VENT_DEFAUT,
} from "@/lib/chantierDefaults";

describe("Registre central des métiers — lib/metiers/registry.ts", () => {
  it("déclare exactement les deux métiers validés BARDAGE et TERRASSE avec BARDAGE par défaut", () => {
    expect(METIERS_CODES).toEqual(["BARDAGE", "TERRASSE"]);
    expect(METIER_DEFAUT).toBe("BARDAGE");
    expect(listerMetiers().map((m) => m.code)).toEqual(["BARDAGE", "TERRASSE"]);
  });

  it("valide strictement les codes métiers, filtres consolidés et scopes de stock", () => {
    expect(estMetierCode("BARDAGE")).toBe(true);
    expect(estMetierCode("TERRASSE")).toBe(true);
    expect(estMetierCode("bardage")).toBe(false);
    expect(estMetierCode("TOUS")).toBe(false);
    expect(estMetierCode("COMMUN")).toBe(false);
    expect(estMetierCode(null)).toBe(false);
    expect(estMetierCode(undefined)).toBe(false);

    expect(estFiltreMetier("BARDAGE")).toBe(true);
    expect(estFiltreMetier("TERRASSE")).toBe(true);
    expect(estFiltreMetier("TOUS")).toBe(true);
    expect(estFiltreMetier("COMMUN")).toBe(false);

    expect(estScopeStockMetier("BARDAGE")).toBe(true);
    expect(estScopeStockMetier("TERRASSE")).toBe(true);
    expect(estScopeStockMetier("COMMUN")).toBe(true);
    expect(estScopeStockMetier("TOUS")).toBe(false);
  });

  it("normalise les entrées externes via resoudreMetierCode avec repli sécurisé", () => {
    expect(resoudreMetierCode("bardage")).toBe("BARDAGE");
    expect(resoudreMetierCode("  terrasse ")).toBe("TERRASSE");
    expect(resoudreMetierCode("INCONNU")).toBe("BARDAGE");
    expect(resoudreMetierCode(null, "TERRASSE")).toBe("TERRASSE");
  });

  it("garantit la cohérence de la configuration de chaque métier déclaré", () => {
    for (const code of METIERS_CODES) {
      const cfg = getMetierConfig(code);
      expect(cfg.code).toBe(code);
      expect(cfg.slug).toBe(code.toLowerCase());
      expect(cfg.libelle.length).toBeGreaterThan(0);
      expect(cfg.libelleCourt.length).toBeGreaterThan(0);
      expect(cfg.libelleDocument.length).toBeGreaterThan(0);
      expect(cfg.normeReference.length).toBeGreaterThan(0);

      // Identité visuelle complète
      expect(cfg.identiteVisuelle.icone.length).toBeGreaterThan(0);
      expect(cfg.identiteVisuelle.emoji.length).toBeGreaterThan(0);
      expect(cfg.identiteVisuelle.accentHex).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(cfg.identiteVisuelle.badgeClasses.length).toBeGreaterThan(0);

      // Phases de main-d'œuvre non vides et incluant toujours le repli "general"
      expect(cfg.phasesMainOeuvre.length).toBeGreaterThan(0);
      expect(cfg.phasesMainOeuvre.some((p) => p.key === "general")).toBe(true);

      // Outils et fonctionnalités chantier
      expect(cfg.outils.length).toBeGreaterThan(0);
      expect(cfg.fonctionnalites.ongletsTechniquesChantier.length).toBeGreaterThan(0);
      expect(cfg.fonctionnalites.clesChecklistChantier.length).toBeGreaterThan(0);
      expect(cfg.fonctionnalites.valeursDefautChantier).toEqual({
        materiau_structurel: MATERIAU_STRUCTUREL_DEFAUT,
        moyen_acces: MOYEN_ACCES_DEFAUT,
        zone_vent: ZONE_VENT_DEFAUT,
      });

      // Catalogue associé
      expect(cfg.catalogue.routeBureau).toMatch(/^\/bureau\/catalogue/);
      expect(cfg.catalogue.typesFormulaires.length).toBeGreaterThan(0);
      expect(cfg.catalogue.tablesSupabase.length).toBeGreaterThan(0);
      expect(cfg.catalogue.naturesCoutSupportees).toEqual(["matiere", "main_oeuvre"]);

      // Règles transverses validées
      expect(cfg.reglesTransverses).toEqual({
        numerotationCommuneEntreprise: true,
        afficherMetierSurDocuments: true,
        stockFiltrableEtConsolide: true,
      });
    }
  });

  it("préserve les clés de phases de main-d'œuvre Bardage de lib/mainOeuvreAnalytique.ts et sépare celles de Terrasse", () => {
    expect(getPhasesMainOeuvre("BARDAGE").map((p) => p.key)).toEqual([
      "ossature",
      "isolation",
      "bardage",
      "finitions",
      "general",
    ]);
    expect(PHASES_MAIN_OEUVRE_BARDAGE.map((p) => p.nomAffichage)).toEqual([
      "🏗️ Ossature",
      "🌡️ Isolation",
      "🪵 Bardage",
      "✨ Finitions",
      "📁 Général",
    ]);

    expect(getPhasesMainOeuvre("TERRASSE").map((p) => p.key)).toEqual([
      "preparation_support",
      "structure_plots_lambourdes",
      "platelage_lames",
      "finitions_accessoires",
      "general",
    ]);
    expect(PHASES_MAIN_OEUVRE_TERRASSE).toHaveLength(5);
  });

  it("isole les onglets techniques et les checklists initiales entre BARDAGE et TERRASSE", () => {
    expect(METIERS_REGISTRY.BARDAGE.fonctionnalites.ongletsTechniquesChantier).toEqual([
      "metres",
    ]);
    expect(METIERS_REGISTRY.TERRASSE.fonctionnalites.ongletsTechniquesChantier).toEqual([
      "terrasse",
    ]);

    expect(creerChecklistChantierInitiale("BARDAGE")).toEqual({
      tasseaux: false,
      pare_pluie: false,
      pose: false,
      finition: false,
    });
    expect(creerChecklistChantierInitiale("TERRASSE")).toEqual({
      support_plots: false,
      structure_lambourdes: false,
      platelage: false,
      finition: false,
    });
  });

  it("relie chaque CatalogueType existant au bon métier", () => {
    expect(getMetierParCatalogueType("BARDAGE")).toBe("BARDAGE");
    expect(getMetierParCatalogueType("TERRASSE_LAME")).toBe("TERRASSE");
    expect(getMetierParCatalogueType("TERRASSE_ACCESSOIRE")).toBe("TERRASSE");
  });
});
