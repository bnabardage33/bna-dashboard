// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  calculateFenceLayout,
  FENCE_MATERIAL_PRESETS,
  type FenceConfig,
} from "@/lib/cloture/calepinageCloture";
import { calculerChiffrageCloture } from "@/lib/cloture/calculs";
import { calculerTempsPoseCloture } from "@/lib/tempsPoseCalcul";
import { METIERS_REGISTRY } from "@/lib/metiers/registry";

describe("Moteur métier Clôture — Calepinage (Bna-app) + Enrichissements BNA Dashboard", () => {
  it("1. Clôture DROITE + DIRECT_SOL + LIBRE (Bois 2.00m)", () => {
    const configDroite: FenceConfig = {
      forme: "DROITE",
      segments: { A: 12.5, B: 4.2, C: 6.0, D: 4.2 },
      hauteurUtile: 1.8,
      materiau: "BOIS",
      longueurLameBrute: FENCE_MATERIAL_PRESETS.BOIS.defaultBladeLengthM,
      hauteurLame: FENCE_MATERIAL_PRESETS.BOIS.defaultBladeHeightM,
      extremites: "LIBRE",
      typePoseSol: "DIRECT_SOL",
    };

    const res = calculateFenceLayout(configDroite);
    expect(res.segmentsActifs).toHaveLength(1);
    expect(res.nbPoteauxAngle).toBe(0);
    expect(res.segmentsActifs[0].nbTraveesSegment).toBe(7);
    const expectedAxeA = 12.5 / 7;
    expect(res.segmentsActifs[0].largeurTraveeAxe).toBeCloseTo(expectedAxeA, 6);
    expect(res.segmentsActifs[0].longueurCoupeLame).toBeCloseTo(
      expectedAxeA - 0.07 + 0.03 - 0.01,
      6
    );
    expect(res.nbPoteauxIntermediaires).toBe(6);
    expect(res.nbPoteauxBoutStandards).toBe(2);
    expect(res.nbDemiPoteauxMuraux).toBe(0);
    expect(res.totalPoteauxComplets).toBe(8);
    expect(res.longueurCommandePoteauM).toBeCloseTo(2.3, 6);
    expect(res.nbSacsBeton35kg).toBe(16);
  });

  it("2. Clôture EN_L + SUR_MURET + DEPART_MUR (Composite 1.80m)", () => {
    const res = calculateFenceLayout({
      forme: "EN_L",
      segments: { A: 12.5, B: 4.2, C: 5.0, D: 4.2 },
      hauteurUtile: 1.5,
      materiau: "COMPOSITE",
      longueurLameBrute: FENCE_MATERIAL_PRESETS.COMPOSITE.defaultBladeLengthM,
      hauteurLame: FENCE_MATERIAL_PRESETS.COMPOSITE.defaultBladeHeightM,
      extremites: "DEPART_MUR",
      typePoseSol: "SUR_MURET",
    });

    expect(res.segmentsActifs).toHaveLength(2);
    expect(res.nbPoteauxAngle).toBe(1);
    expect(res.nbPoteauxIntermediaires).toBe(8);
    expect(res.nbPoteauxBoutStandards).toBe(1);
    expect(res.nbDemiPoteauxMuraux).toBe(1);
    expect(res.totalPoteauxComplets).toBe(10);
    expect(res.nbPlatines).toBe(10);
    expect(res.longueurCommandePoteauM).toBeCloseTo(1.52, 6);
    expect(res.nbLamesParTravee).toBe(10);
    expect(res.nbTotalLames).toBe(100);
  });

  it("3. Clôture EN_U + ENTRE_MURS + Alerte chute > 15 %", () => {
    const res = calculateFenceLayout({
      forme: "EN_U",
      segments: { A: 6.0, B: 10.0, C: 6.0, D: 10.0 },
      hauteurUtile: 1.8,
      materiau: "ALU",
      longueurLameBrute: 1.8,
      hauteurLame: 0.15,
      extremites: "ENTRE_MURS",
      typePoseSol: "DIRECT_SOL",
    });

    expect(res.segmentsActifs).toHaveLength(3);
    expect(res.nbPoteauxAngle).toBe(2);
    expect(res.nbPoteauxBoutStandards).toBe(0);
    expect(res.nbDemiPoteauxMuraux).toBe(2);
    expect(res.nbPoteauxIntermediaires).toBe(11);
    expect(res.totalPoteauxComplets).toBe(13);
    expect(res.alerteChuteElevee).toBe(true);
  });

  it("4. Clôture 4_COTES boucle fermée sans doublon d'angle", () => {
    const res = calculateFenceLayout({
      forme: "4_COTES",
      segments: { A: 12.0, B: 8.0, C: 12.0, D: 8.0 },
      hauteurUtile: 1.8,
      materiau: "BOIS",
      longueurLameBrute: 2.0,
      hauteurLame: 0.15,
      extremites: "LIBRE",
      typePoseSol: "DIRECT_SOL",
    });

    expect(res.isClosedLoop).toBe(true);
    expect(res.lineaireTotalM).toBe(40);
    expect(res.nbPoteauxAngle).toBe(4);
    expect(res.nbTraveesTotal).toBe(20);
    expect(res.nbPoteauxIntermediaires).toBe(16);
    expect(res.totalPoteauxComplets).toBe(20);
  });

  it("5. Soubassement béton, Portillon et Redans de pente", () => {
    const res = calculateFenceLayout({
      forme: "DROITE",
      segments: { A: 10.0, B: 5.0, C: 10.0 },
      hauteurUtile: 1.8,
      materiau: "COMPOSITE",
      longueurLameBrute: 1.8,
      hauteurLame: 0.15,
      extremites: "LIBRE",
      typePoseSol: "DIRECT_SOL",
      presenceSoubassement: true,
      hauteurSoubassementM: 0.3,
      gestionPente: "REDANS",
      denivelesSegments: { A: 0.9 },
      portillons: [{ segment: "A", largeurM: 1.0 }],
    });

    // Longueur utile hors portillon = 10 - 1 = 9 m -> 5 travées de 1.80 m
    expect(res.segmentsActifs[0].longueurClotureUtileM).toBeCloseTo(9.0, 4);
    expect(res.nbTraveesTotal).toBe(5);
    expect(res.nbPlaquesSoubassement).toBe(5);
    expect(res.hauteurLamesUtileM).toBeCloseTo(1.5, 4);
    expect(res.nbLamesParTravee).toBe(10); // 1.50 / 0.15
    expect(res.nbPortillonsTotal).toBe(1);
    expect(res.nbPoteauxPortillon).toBe(2);
    expect(res.nbRedansTotal).toBe(4);
    expect(res.surcoteMaxPoteauRedanM).toBeCloseTo(0.9 / 5, 4);
    expect(res.longueurCommandePoteauM).toBeCloseTo(1.8 + 0.5 + 0.9 / 5, 4);
  });

  it("6. Temps de pose Clôture & Chiffrage complet avec main-d'œuvre", () => {
    const config: FenceConfig = {
      forme: "EN_L",
      segments: { A: 10.0, B: 6.0, C: 10.0 },
      hauteurUtile: 1.8,
      materiau: "COMPOSITE",
      longueurLameBrute: 1.8,
      hauteurLame: 0.15,
      extremites: "LIBRE",
      typePoseSol: "DIRECT_SOL",
      presenceSoubassement: true,
      hauteurSoubassementM: 0.25,
      portillons: [{ segment: "A", largeurM: 1.0 }],
    };

    const chiffrage = calculerChiffrageCloture(config, { inclureMainOeuvre: true });
    const temps = calculerTempsPoseCloture(chiffrage.calepinage);

    expect(temps.totalHeures).toBeGreaterThan(0);
    expect(temps.parPhase.implantation_scellement).toBeGreaterThan(0);
    expect(temps.parPhase.pose_poteaux_soubassement).toBeGreaterThan(0);
    expect(temps.parPhase.pose_panneaux_lames).toBeGreaterThan(0);
    expect(temps.parPhase.portillons_finitions).toBeGreaterThan(0);

    expect(chiffrage.totalFournituresHT).toBeGreaterThan(0);
    expect(chiffrage.totalMainOeuvreHT).toBeGreaterThan(0);
    expect(chiffrage.totalHT).toBeCloseTo(
      chiffrage.totalFournituresHT + chiffrage.totalMainOeuvreHT,
      2
    );
  });

  it("7. Cloisonnement métier strict : CLOTURE isolé avec accent Terracotta #B85B2B", () => {
    expect(METIERS_REGISTRY.CLOTURE.code).toBe("CLOTURE");
    expect(METIERS_REGISTRY.CLOTURE.slug).toBe("cloture");
    expect(METIERS_REGISTRY.CLOTURE.identiteVisuelle.accentHex).toBe("#B85B2B");
    expect(METIERS_REGISTRY.CLOTURE.fonctionnalites.ongletsTechniquesChantier).toEqual([
      "cloture",
    ]);
  });
});
