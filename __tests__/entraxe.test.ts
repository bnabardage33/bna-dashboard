import { describe, it, expect } from "vitest";
import { calculerPose, LIMITE_DTU_MM } from "../lib/poseCalcul";
import { calculerEntraxeReel, calculerCalepinage } from "../lib/calepinageCalcul";

function verifierJonctions(calepinage: ReturnType<typeof calculerCalepinage>, largeurM: number) {
  const cols = calepinage.colonnesLargeursM;
  // La somme des colonnes doit couvrir exactement la façade.
  expect(cols.reduce((s, c) => s + c, 0)).toBeCloseTo(largeurM, 6);
  const entraxeM = calepinage.entraxeReelMm / 1000;
  let x = 0;
  for (const c of cols) {
    x += c;
    // Le dernier bord (x = largeur) repose sur le chevron de fermeture :
    // sa position exacte vaut la largeur de la façade.
    if (Math.abs(x - largeurM) < 1e-6) {
      expect(x).toBeCloseTo(largeurM, 6);
      continue;
    }
    // Chaque jonction intérieure doit tomber sur un multiple de l'entraxe.
    const reste = x / entraxeM;
    expect(Math.abs(reste - Math.round(reste))).toBeLessThan(1e-6);
  }
}

describe("Entraxe HPL dynamique", () => {
  it("module 1000x600 horizontal => entraxe 50cm", () => {
    const res = calculerPose("hpl", 3.0, 2.5, false, 0, 1000, {
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "horizontal",
    });
    expect(res.entraxeHorizontal).toBeCloseTo(0.5, 3);
  });

  it("module 1000x600 vertical => entraxe 60cm (dimension = hauteur 600)", () => {
    const res = calculerPose("hpl", 3.0, 2.5, false, 0, 1000, {
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "vertical",
    });
    expect(res.entraxeHorizontal).toBeCloseTo(0.6, 3);
  });

  it("module 1000x600 vertical MAJUSCULE 'Vertical' => entraxe 60cm", () => {
    const res = calculerPose("hpl", 3.0, 2.5, false, 0, 1000, {
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      // @ts-expect-error teste une valeur historique en DB majuscule
      sensPose: "Vertical",
    });
    expect(res.entraxeHorizontal).toBeCloseTo(0.6, 3);
  });

  it("module 1500x450 vertical => entraxe 45cm", () => {
    const res = calculerPose("hpl", 3.0, 2.5, false, 0, 1000, {
      moduleLargeurMm: 1500,
      moduleHauteurMm: 450,
      sensPose: "vertical",
    });
    expect(res.entraxeHorizontal).toBeCloseTo(0.45, 3);
  });

  it("calculerEntraxeReel: 600mm => 600mm", () => {
    expect(calculerEntraxeReel(600)).toBeCloseTo(600, 6);
  });

  it("calculerEntraxeReel: 1000mm => 500mm", () => {
    expect(calculerEntraxeReel(1000)).toBeCloseTo(500, 6);
  });

  it("calepinage vertical 1000x600 => entraxeReelMm 600", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 3.0,
      zoneHauteurM: 2.5,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "vertical",
    });
    expect(res.entraxeReelMm).toBeCloseTo(600, 3);
  });

  it("calepinage vertical MAJUSCULE 'Vertical' => entraxeReelMm 600", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 3.0,
      zoneHauteurM: 2.5,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      // @ts-expect-error teste une valeur historique en DB majuscule
      sensPose: "Vertical",
    });
    expect(res.entraxeReelMm).toBeCloseTo(600, 3);
  });

  it("LIMITE_DTU_MM est strictement 600", () => {
    expect(LIMITE_DTU_MM).toBe(600);
  });
});

describe("Jonction des plaques sur les chevrons", () => {
  it("mur 2,60m / module 1000 / entraxe 500 : colonnes = [1,1,0.6]", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 2.6,
      zoneHauteurM: 2.5,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "horizontal",
    });
    expect(res.entraxeReelMm).toBe(500);
    expect(res.colonnesLargeursM).toEqual([1, 1, 0.6]);
    verifierJonctions(res, 2.6);
  });

  it("mur 2,50m / module 1000 / entraxe 500 : colonnes = [1,1,0.5]", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 2.5,
      zoneHauteurM: 2.5,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "horizontal",
    });
    expect(res.colonnesLargeursM).toEqual([1, 1, 0.5]);
    verifierJonctions(res, 2.5);
  });

  it("mur 4,00m / module 1500 / entraxe 500 : colonnes symétriques [0.5,1.5,1.5,0.5]", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 4.0,
      zoneHauteurM: 2.5,
      moduleLargeurMm: 1500,
      moduleHauteurMm: 450,
      sensPose: "horizontal",
    });
    expect(res.colonnesLargeursM).toEqual([0.5, 1.5, 1.5, 0.5]);
    verifierJonctions(res, 4.0);
  });

  it("mur 2,15m : excédent absorbé par la rive droite [1,1,0.15]", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 2.15,
      zoneHauteurM: 2.5,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "horizontal",
    });
    expect(res.colonnesLargeursM).toEqual([1, 1, 0.15]);
    verifierJonctions(res, 2.15);
  });

  it("mur 3,00m vertical / module 1000x600 (largeur visible 600) : 5 colonnes de 0.6", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 3.0,
      zoneHauteurM: 2.5,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "vertical",
    });
    expect(res.entraxeReelMm).toBe(600);
    expect(res.colonnesLargeursM).toEqual([0.6, 0.6, 0.6, 0.6, 0.6]);
    verifierJonctions(res, 3.0);
  });

  it("cohérence: chaque jonction de plaques est dessinée sur un chevron", () => {
    for (const largeurM of [2.6, 2.5, 2.15, 4.0, 3.7, 1.7]) {
      const pose = calculerPose("hpl", largeurM, 2.5, false, 0, 1000, {
        moduleLargeurMm: 1000,
        moduleHauteurMm: 600,
        sensPose: "horizontal",
      });
      const calepinage = calculerCalepinage({
        zoneLargeurM: largeurM,
        zoneHauteurM: 2.5,
        moduleLargeurMm: 1000,
        moduleHauteurMm: 600,
        sensPose: "horizontal",
      });
      const chevrons = [...pose.positionsChevronsM];
      let x = 0;
      calepinage.colonnesLargeursM.forEach((c) => {
        x += c;
        if (Math.abs(x - largeurM) < 1e-6) return;
        const supporte = chevrons.some((cv) => Math.abs(cv - x) < 1e-6);
        expect(supporte, `jonction à x=${x} sans chevron (largeur=${largeurM})`).toBe(true);
      });
    }
  });
});