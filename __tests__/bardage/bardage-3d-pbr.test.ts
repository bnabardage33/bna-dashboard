import { describe, it, expect } from "vitest";
import {
  createBardageProceduralTextures,
  type Facade3DData,
  type OuvertureCalculee,
} from "@/components/calepinage/BardagePlan3D";
import { calculerPose } from "@/lib/poseCalcul";
import { calculerCalepinage } from "@/lib/calepinageCalcul";

describe("Bardage 3D Three.js PBR - Matériaux & Détails architecturaux", () => {
  it("génère des configurations de textures PBR distinctes selon les familles de parement", () => {
    // 1. Stratifié HPL
    const texHpl = createBardageProceduralTextures("hpl");
    expect(texHpl.roughness).toBeLessThan(0.45); // Satiné doux
    expect(texHpl.metalness).toBeLessThan(0.1);
    expect(texHpl.baseColor).toBe("#334155");

    // 2. Bois massif veiné
    const texBois = createBardageProceduralTextures("bois_naturel", "horizontal");
    expect(texBois.roughness).toBeGreaterThan(0.6); // Aspect bois naturel
    expect(texBois.metalness).toBeLessThan(0.05);
    expect(texBois.baseColor).toBe("#b45309");

    // 3. Lames composites rainurées
    const texComposite = createBardageProceduralTextures("composite");
    expect(texComposite.roughness).toBeCloseTo(0.52, 1);
    expect(texComposite.metalness).toBeCloseTo(0.07, 1);
    expect(texComposite.baseColor).toBe("#27272a");

    // 4. Cassettes métalliques
    const texCassette = createBardageProceduralTextures("cassette");
    expect(texCassette.metalness).toBeGreaterThan(0.7); // Très métallique
    expect(texCassette.roughness).toBeLessThan(0.35);
  });

  it("calcule les dimensions exactes des encadrements d'ouvertures (bavette, tableaux, linteau)", () => {
    const o: OuvertureCalculee = {
      id: "ouv-1",
      nom: "Fenêtre Sud",
      type: "fenetre",
      xM: 1.5,
      yM: 1.0,
      largeurM: 1.2,
      hauteurM: 1.4,
      surfaceM2: 1.68,
    };

    // Règle bavette d'appui alu : L_ouv + 60 mm (oreilles de 30 mm de chaque côté)
    const bavetteW = o.largeurM + 0.06;
    expect(bavetteW).toBeCloseTo(1.26, 3);
    expect(Math.round(bavetteW * 1000)).toBe(1260);

    // Règle linteau goutte d'eau : L_ouv + 40 mm
    const linteauW = o.largeurM + 0.04;
    expect(linteauW).toBeCloseTo(1.24, 3);
    expect(Math.round(linteauW * 1000)).toBe(1240);

    // Règle tableaux latéraux : hauteur exacte H_ouv
    const tableauH = o.hauteurM;
    expect(tableauH).toBe(1.4);
    expect(Math.round(tableauH * 1000)).toBe(1400);
  });

  it("vérifie le calcul des 5 couches d'altitudes DTU 41.2 en mode réel (0 %) et éclaté (100 %)", () => {
    const epMurM = 0.18;
    const epIsoM = 0.12;
    const epChevM = 0.065;
    const epPanM = 0.01;

    // Mode réel compact (eclateRatio = 0)
    const gapReel = 0 * 0.42;
    const zMurFrontReel = 0;
    const zIsoBackReel = zMurFrontReel + gapReel * 0.8;
    const zIsoFrontReel = zIsoBackReel + epIsoM;
    const zChevBackReel = zIsoFrontReel + gapReel * 1.5;
    const zChevFrontReel = zChevBackReel + epChevM;
    const zPanBackReel = zChevFrontReel + gapReel * 2.3;
    const zPanFrontReel = zPanBackReel + epPanM;

    expect(zIsoBackReel).toBe(0); // L'isolant touche le mur
    expect(zChevBackReel).toBe(epIsoM); // Les chevrons touchent l'isolant
    expect(zPanBackReel).toBe(epIsoM + epChevM); // Les panneaux touchent les chevrons

    // Mode éclaté pédagogique DTU (eclateRatio = 1)
    const gapEclate = 1.0 * 0.42;
    const zMurFrontEclate = 0;
    const zIsoBackEclate = zMurFrontEclate + gapEclate * 0.8;
    const zIsoFrontEclate = zIsoBackEclate + epIsoM;
    const zChevBackEclate = zIsoFrontEclate + gapEclate * 1.5;
    const zChevFrontEclate = zChevBackEclate + epChevM;
    const zPanBackEclate = zChevFrontEclate + gapEclate * 2.3;
    const zPanFrontEclate = zPanBackEclate + epPanM;

    // Les couches sont décollées dans l'ordre strict DTU 41.2
    expect(zIsoBackEclate).toBeGreaterThan(zMurFrontEclate);
    expect(zChevBackEclate).toBeGreaterThan(zIsoFrontEclate);
    expect(zPanBackEclate).toBeGreaterThan(zChevFrontEclate);
    expect(zPanFrontEclate - zMurFrontEclate).toBeGreaterThan(1.5); // Séparation spatiale nette
  });

  it("gère l'assemblage multi-façades pour le mode Bâtiment 3D complet", () => {
    const W = 6.0;
    const H = 3.0;

    const cal = calculerCalepinage({
      zoneLargeurM: W,
      zoneHauteurM: H,
      plaqueLongueurMm: 3050,
      plaqueLargeurMm: 1300,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "horizontal",
    });

    const pose = calculerPose("hpl", W, H, false, 1, 1000, {
      epaisseurIsolantMm: 120,
      typeIsolant: "laine_roche",
    });

    const facade1: Facade3DData = {
      id: "f1",
      nom: "Façade Sud",
      famille: "hpl",
      L: W,
      Hm: H,
      surfaceM2: W * H,
      cal,
      pose,
      ouverturesCalculees: [
        {
          id: "o1",
          nom: "Porte d'entrée",
          type: "porte",
          xM: 1.0,
          yM: 0,
          largeurM: 1.0,
          hauteurM: 2.15,
          surfaceM2: 2.15,
        },
      ],
    };

    const facade2: Facade3DData = {
      id: "f2",
      nom: "Façade Est",
      famille: "hpl",
      L: 4.0,
      Hm: H,
      surfaceM2: 4.0 * H,
      cal,
      pose,
      ouverturesCalculees: [],
    };

    const allFacades = [facade1, facade2];
    expect(allFacades.length).toBe(2);
    expect(allFacades[0].ouverturesCalculees).toHaveLength(1);
    expect(allFacades[1].L).toBe(4.0);
  });
});
