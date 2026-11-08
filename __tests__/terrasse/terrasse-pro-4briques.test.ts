import { describe, it, expect } from "vitest";
import {
  CONSTANTES_TERRASSE_PRO,
  SOLLICITATIONS_DTU_2018,
  resoudreEntraxeMaxLambourdesMm,
  resoudrePorteeMaxLambourdeMm,
  resoudreJeuxPoseMm,
  resoudreSpecFixationPro,
  genererGeometrieStructure2D,
  calculerCalepinageEtDecoupe1D,
  calculerTerrasseProGeometrie,
} from "@/lib/terrasse/pro";
import { calculerTerrasse } from "@/lib/terrasse/calculs";
import { getFabricantComposite } from "@/lib/terrasse/composite/fabricants";
import type { ChantierTerrasseConfig, ChantierTerrasseReservation } from "@/lib/terrasse/types";

const baseConfigBois: ChantierTerrasseConfig = {
  chantier_id: "ch-pro-1",
  nom: "Terrasse Bois Pro DTU 2018",
  longueur_m: 6.0,
  largeur_m: 4.0,
  hauteur_sol_cm: 18.0,
  type_sol: "dalle_beton",
  pente_pct: 2.0,
  essence_bois: "ipe",
  type_pose: "parallele",
  largeur_lame_mm: 140,
  epaisseur_lame_mm: 21,
  longueur_lame_m: 2.4,
  espacement_lames_mm: 5,
  type_fixation: "vis_inox",
  type_lambourde: "bois_cl4",
  section_largeur_mm: 50,
  section_hauteur_mm: 70,
  longueur_lambourde_m: 4.0,
  entraxe_lambourdes_cm: 45,
  double_lambourdage_aboutage: true,
  bande_etancheite_epdm: true,
  cales_isolation: true,
  type_plots: "reglables",
  entraxe_plots_cm: 60,
  hauteur_reglage_plots: "60_90",
  geotextile: false,
  presence_escalier: false,
  escalier_nb_marches: 2,
  escalier_largeur_m: 1.5,
  escalier_giron_cm: 28,
  escalier_hauteur_marche_cm: 16,
  presence_garde_corps: false,
  garde_corps_longueur_ml: 0,
  garde_corps_type: "bois_cables",
  garde_corps_hauteur_cm: 100,
  coef_perte_lames: 1.1,
  coef_perte_lambourdes: 1.08,
};

describe("Terrasse Pro — Architecture en 4 Briques (NF DTU 51.4 Décembre 2018 & Composite)", () => {
  describe("Brique 1 — Presets & Règles utiles (presets-regles.ts)", () => {
    it("respecte les charges exactes du Tableau 4 (Décembre 2018) pour Sollicitations 1, 2 et 3", () => {
      // Sollicitation 1 : q_k = 3,5 kN/m², Q_k = 2,0 kN, plot >= 5,0 kN
      expect(SOLLICITATIONS_DTU_2018[1].qkKnM2).toBe(3.5);
      expect(SOLLICITATIONS_DTU_2018[1].QkKn).toBe(2.0);
      expect(SOLLICITATIONS_DTU_2018[1].plotFrkMinKn).toBe(5.0);

      // Sollicitation 2 : q_k = 2,5 kN/m², Q_k = 3,0 kN, plot >= 7,5 kN
      expect(SOLLICITATIONS_DTU_2018[2].qkKnM2).toBe(2.5);
      expect(SOLLICITATIONS_DTU_2018[2].QkKn).toBe(3.0);
      expect(SOLLICITATIONS_DTU_2018[2].plotFrkMinKn).toBe(7.5);

      // Sollicitation 3 : q_k = 5,0 kN/m², Q_k = 5,0 kN, plot >= 12,5 kN
      expect(SOLLICITATIONS_DTU_2018[3].qkKnM2).toBe(5.0);
      expect(SOLLICITATIONS_DTU_2018[3].QkKn).toBe(5.0);
      expect(SOLLICITATIONS_DTU_2018[3].plotFrkMinKn).toBe(12.5);
    });

    it("applique l'abattement de -15% sur 2 appuis en bois massif et la réduction à 300 mm en ERP/45° en composite", () => {
      const bois3Appuis = resoudreEntraxeMaxLambourdesMm({
        isComposite: false,
        essence: "ipe",
        epaisseurLameMm: 21,
        largeurLameMm: 140,
        solicitationCategory: 1,
        surDeuxAppuis: false,
      });
      expect(bois3Appuis.entraxeMax3AppuisMm).toBe(450);
      expect(bois3Appuis.entraxeMax2AppuisMm).toBe(Math.floor(450 * 0.85)); // 382 mm

      const compErp = resoudreEntraxeMaxLambourdesMm({
        isComposite: true,
        essence: "composite",
        epaisseurLameMm: 23,
        largeurLameMm: 138,
        solicitationCategory: 2, // ERP
        fabricantComposite: "fiberdeck",
      });
      expect(compErp.entraxeMaxEffectifMm).toBe(300);
      expect(compErp.entraxeMax2AppuisMm).toBe(0); // 2 appuis interdit en composite
    });

    it("plafonne les portées entre plots E2 à <= 700 mm (>= 3 appuis) et <= 600 mm (2 appuis)", () => {
      const portee = resoudrePorteeMaxLambourdeMm({
        sectionHauteurMm: 75,
        sectionLargeurMm: 50,
        typeLambourde: "bois_exotique",
      });
      expect(portee.porteeMax3AppuisMm).toBeLessThanOrEqual(700);
      expect(portee.porteeMax2AppuisMm).toBeLessThanOrEqual(600);
    });

    it("applique les jeux par défaut (5 mm inter-lames, 5 mm en bout, 10 mm bois / 15 mm composite)", () => {
      const jeuxBois = resoudreJeuxPoseMm(baseConfigBois);
      expect(jeuxBois.jeuEntreLamesMm).toBe(5);
      expect(jeuxBois.jeuAboutageBoutMm).toBe(5);
      expect(jeuxBois.jeuPeripheriqueMurMm).toBe(10);

      const jeuxComp = resoudreJeuxPoseMm({
        ...baseConfigBois,
        systeme_terrasse: "composite_clip",
        essence_bois: "composite",
      });
      expect(jeuxComp.jeuPeripheriqueMurMm).toBe(15);

      // Vérifie également le profil fabricant Neowood ajouté
      const neowood = getFabricantComposite("neowood");
      expect(neowood.nom).toBe("Neowood");
      expect(neowood.gammes[0].jeuPeripheriqueMm).toBe(15);
    });

    it("impose e >= 27 mm pour le vissage par le dessous et Ø5 / Ø6 mm selon le Tableau 9 (Décembre 2018)", () => {
      // Vissage par le dessous refusé si e = 21 mm (< 27 mm)
      const dessous21 = resoudreSpecFixationPro({
        isComposite: false,
        epaisseurLameMm: 21,
        largeurLameMm: 120,
        essence: "ipe",
        typeLambourde: "bois_cl4",
        vissageParDessousBois: true,
      });
      expect(dessous21.vissageDessousValide).toBe(false);

      // Vissage par le dessous accepté si e = 28 mm (>= 27 mm) et L/e <= 5 (120/28 = 4.28)
      const dessous28 = resoudreSpecFixationPro({
        isComposite: false,
        epaisseurLameMm: 28,
        largeurLameMm: 120,
        essence: "ipe",
        typeLambourde: "bois_cl4",
        vissageParDessousBois: true,
      });
      expect(dessous28.vissageDessousValide).toBe(true);

      // Tableau 9 (Déc. 2018) : Ø5 mm pour e <= 29 mm, Ø6 mm pour 30 <= e <= 45 mm
      const dessus27 = resoudreSpecFixationPro({
        isComposite: false,
        epaisseurLameMm: 27,
        largeurLameMm: 145,
        essence: "pin_cl4",
        typeLambourde: "bois_cl4",
      });
      expect(dessus27.diameterMm).toBe(5);

      const dessus34 = resoudreSpecFixationPro({
        isComposite: false,
        epaisseurLameMm: 34,
        largeurLameMm: 145,
        essence: "pin_cl4",
        typeLambourde: "bois_cl4",
      });
      expect(dessus34.diameterMm).toBe(6);
    });
  });

  describe("Brique 2 — Moteur géométrique 2D Structure (geometrie-structure.ts)", () => {
    it("génère des objets distincts pour le double lambourdage aux aboutages et le lambourdage croisé", () => {
      const struct = genererGeometrieStructure2D(baseConfigBois, [], {
        formeType: "L",
        retour1LongueurM: 2.5,
        retour1LargeurM: 1.8,
        structureMode: "CROISEE",
      });

      expect(struct.isValid).toBe(true);
      expect(struct.grossAreaM2).toBeLessThan(24); // Forme en L < rectangle 6x4

      const leftDouble = struct.joists.filter((j) => j.role === "DOUBLE_ABOUTAGE_GAUCHE");
      const rightDouble = struct.joists.filter((j) => j.role === "DOUBLE_ABOUTAGE_DROITE");
      const crossJoists = struct.joists.filter((j) => j.layer === "SECONDARY_BOTTOM_CROSS");

      expect(leftDouble.length).toBeGreaterThan(0);
      expect(rightDouble.length).toBe(leftDouble.length);
      expect(leftDouble[0].pairedJoistId).toBe(rightDouble[0].id);
      expect(crossJoists.length).toBeGreaterThanOrEqual(2);
    });

    it("encadre automatiquement les réservations (rectangles et cercles) par des chevêtres et plots dédiés", () => {
      const reservations: ChantierTerrasseReservation[] = [
        {
          terrasse_id: "t-1",
          type_reservation: "trappe",
          nom: "Trappe skimmer",
          x: 1.2,
          y: 1.0,
          longueur: 0.8,
          largeur: 0.6,
        },
        {
          terrasse_id: "t-1",
          type_reservation: "arbre",
          nom: "Olivier",
          x: 3.5,
          y: 1.5,
          diametre: 0.9,
        },
      ];

      const struct = genererGeometrieStructure2D(baseConfigBois, reservations);
      expect(struct.isValid).toBe(true);
      expect(struct.reservationsAreaM2).toBeGreaterThan(1.0);
      expect(struct.netAreaM2).toBeCloseTo(struct.grossAreaM2 - struct.reservationsAreaM2, 1);

      const chevetres = struct.joists.filter((j) => j.layer === "CHEVETRE_RESERVATION");
      const plotsChevetres = struct.supports.filter((s) => s.type === "PLOT_CHEVETRE");
      expect(chevetres.length).toBe(8); // 4 chevêtres par réservation
      expect(plotsChevetres.length).toBeGreaterThanOrEqual(16);
    });

    it("rejette explicitement les plots polymères > 300 mm et les réservations hors emprise", () => {
      const resHorsEmprise: ChantierTerrasseReservation[] = [
        {
          terrasse_id: "t-1",
          type_reservation: "piscine",
          nom: "Spa débordant",
          x: 5.2,
          y: 1.0,
          longueur: 1.5, // 5.2 + 1.5 = 6.7m > 6.0m
          largeur: 1.5,
        },
      ];

      const structInvalid = genererGeometrieStructure2D(
        { ...baseConfigBois, hauteur_sol_cm: 40 }, // 400mm - 21mm = 379mm > 300mm
        resHorsEmprise
      );
      expect(structInvalid.isValid).toBe(false);
      expect(
        structInvalid.blockingErrors.some((e) => e.code === "ERR_DTU_PLOT_POLYMERE_SUP_300MM")
      ).toBe(true);
      expect(
        structInvalid.blockingErrors.some((e) => e.code === "ERR_RESERVATION_HORS_EMPRISE")
      ).toBe(true);
    });
  });

  describe("Brique 3 — Calepinage des Lames & Optimiseur de découpe 1D (calepinage-decoupe.ts)", () => {
    it("garantit qu'aucun segment posé ne fait moins de 400 mm (R-MET-01) et propose les 2 meilleurs scénarios admissibles", () => {
      const struct = genererGeometrieStructure2D(baseConfigBois, [
        {
          terrasse_id: "t-1",
          type_reservation: "trappe",
          nom: "Trappe",
          x: 2.0,
          y: 1.2,
          longueur: 0.9,
          largeur: 0.7,
        },
      ]);

      const cal = calculerCalepinageEtDecoupe1D(baseConfigBois, struct, {
        poseMode: "COUPE_PERDUE",
      });

      expect(cal.isValid).toBe(true);
      expect(cal.blades.length).toBeGreaterThan(20);
      for (const seg of cal.blades) {
        expect(seg.lengthNetMm).toBeGreaterThanOrEqual(CONSTANTES_TERRASSE_PRO.LONGUEUR_MIN_SEGMENT_MM);
        expect(seg.supportJoistIds.length).toBeGreaterThanOrEqual(2);
      }

      // Vérifie le trait de scie 3 mm, la purge 15 mm et les 2 meilleurs scénarios admissibles
      const firstBladeBar = cal.cuttingPlan.find((b) => b.componentType === "LAME")!;
      expect(firstBladeBar.endTrimMm).toBe(15);
      expect(cal.topAdmissibleScenarios.length).toBe(2);
      expect(cal.topAdmissibleScenarios[0].rank).toBe(1);
      expect(cal.topAdmissibleScenarios[1].rank).toBe(2);
      expect(cal.topAdmissibleScenarios[0].wasteRatePercent).toBeLessThanOrEqual(
        cal.topAdmissibleScenarios[1].wasteRatePercent
      );
    });
  });

  describe("Brique 4 — Contrat TerrasseProGeometricResult & Intégration calculs.ts (quantitatifs-contrat.ts)", () => {
    it("sépare strictement Q_net, Q_tech et Q_appro (+3% marge de tri) et s'intègre dans calculerTerrasse", () => {
      const resPro = calculerTerrasseProGeometrie(baseConfigBois, [
        {
          terrasse_id: "t-1",
          type_reservation: "trappe",
          nom: "Trappe",
          x: 1.5,
          y: 1.0,
          longueur: 1.0,
          largeur: 0.8,
        },
      ]);

      expect(resPro.isValid).toBe(true);
      const { geometricNet, technicalCut, commercialSupply } = resPro.quantities;

      // 1. Q_net < Q_tech < Q_appro
      const techBladesCount = technicalCut.bladesByCommercialLength[0].count;
      const techBladesMl = technicalCut.bladesByCommercialLength[0].totalLinearMeters;

      expect(geometricNet.netDeckingAreaM2).toBeCloseTo(24 - 0.8, 1);
      expect(geometricNet.totalBladeNetLinearMeters).toBeLessThan(techBladesMl);
      expect(commercialSupply.totalBladesToOrderCount).toBe(
        techBladesCount + commercialSupply.dtu3PercentSortingMarginBladesCount
      );
      expect(commercialSupply.fastenerSpec.diameterMm).toBe(5);

      // 2. Vérifie l'intégration complète dans calculerTerrasse()
      const resGlobal = calculerTerrasse(baseConfigBois, [
        {
          terrasse_id: "t-1",
          type_reservation: "trappe",
          nom: "Trappe",
          x: 1.5,
          y: 1.0,
          longueur: 1.0,
          largeur: 0.8,
        },
      ]);
      expect(resGlobal.terrassePro).toBeDefined();
      expect(resGlobal.surfaceNetteM2).toBeCloseTo(23.2, 1);
      expect(resGlobal.fixations.diametreVisMm).toBe(5);
      expect(resGlobal.conformite.controles.some((c) => c.id === "dtu-reservations-chevetres")).toBe(true);
    });
  });
});
