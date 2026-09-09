import { describe, it, expect } from "vitest";
import { calculerPose, LIMITE_DTU_MM } from "../lib/poseCalcul";
import { calculerEntraxeReel, calculerCalepinage } from "../lib/calepinageCalcul";

function verifierJonctions(calepinage: ReturnType<typeof calculerCalepinage>, largeurM: number) {
  const cols = calepinage.colonnesLargeursM;
  // La somme des colonnes doit couvrir exactement la façade.
  expect(cols.reduce((s, c) => s + c, 0)).toBeCloseTo(largeurM, 6);
  // Symétrie absolue : la rive gauche vaut exactement la rive droite.
  const riveG = cols[0];
  const riveD = cols[cols.length - 1];
  expect(riveD).toBeCloseTo(riveG, 6);
  // Règle esthétique du façadier : rives ≥ 150mm dès que le mur le permet.
  const entraxeM = calepinage.entraxeReelMm / 1000;
  if (largeurM >= 3 * entraxeM) {
    expect(riveG * 1000).toBeGreaterThanOrEqual(149.999);
  }
  // Chaque jonction intérieure reste alignée sur la grille de chevrons passant
  // par la rive gauche : x = riveGauche + k * entraxe.
  let x = 0;
  const jonctions = cols.slice(0, -1).map((c) => (x += c));
  for (const xj of jonctions) {
    if (Math.abs(xj - largeurM) < 1e-6) continue;
    const rel = (xj - riveG) / entraxeM;
    expect(Math.abs(rel - Math.round(rel))).toBeLessThan(1e-6);
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

describe("Calepinage en plaques entières (largeur physique)", () => {
  it("mur 2,60m / module 1000 : rives 30cm symétriques, plaques entières de 1m", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 2.6,
      zoneHauteurM: 2.5,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "horizontal",
    });
    expect(res.entraxeReelMm).toBe(500);
    // Deux plaques PLEINES de 1m (et non 4 tranches d'entraxe de 50cm).
    expect(res.colonnesLargeursM).toEqual([0.3, 1, 1, 0.3]);
    verifierJonctions(res, 2.6);
  });

  it("mur 2,50m : 2 plaques pleines de 1m + rives 25cm", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 2.5,
      zoneHauteurM: 2.5,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "horizontal",
    });
    expect(res.colonnesLargeursM).toEqual([0.25, 1, 1, 0.25]);
    verifierJonctions(res, 2.5);
  });

  it("mur 4,00m / module 1500 : 2 plaques pleines de 1,5m + rives 50cm", () => {
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

  it("mur 2,15m : rives initiales 7.5cm < 150mm -> une plaque retirée, rives 57.5cm", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 2.15,
      zoneHauteurM: 2.5,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "horizontal",
    });
    expect(res.colonnesLargeursM).toEqual([0.575, 1, 0.575]);
    verifierJonctions(res, 2.15);
  });

  it("mur 3,00m vertical / module 1000x600 (largeur physique 600) : 4 plaques pleines de 60cm + rives 30cm", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 3.0,
      zoneHauteurM: 2.5,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "vertical",
    });
    expect(res.entraxeReelMm).toBe(600);
    expect(res.colonnesLargeursM).toEqual([0.3, 0.6, 0.6, 0.6, 0.6, 0.3]);
    verifierJonctions(res, 3.0);
  });

  it("BUG RÉGRESSION: module 1200x800 vertical -> UNE plaque de 800mm, pas deux de 400mm", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 2.4,
      zoneHauteurM: 2.5,
      moduleLargeurMm: 1200,
      moduleHauteurMm: 800,
      sensPose: "vertical",
    });
    expect(res.entraxeReelMm).toBe(400);
    // Deux plaques ENTIÈRES de 80cm soutenues par un chevron central chacune.
    expect(res.colonnesLargeursM).toEqual([0.4, 0.8, 0.8, 0.4]);
    const piecesPleines = res.pieces.filter((p) => p.type === "pleine" && p.rangee === 0);
    expect(piecesPleines.map((p) => p.largeurM)).toEqual([0.8, 0.8]);
    expect(res.pieces.some((p) => p.type === "pleine" && Math.abs(p.largeurM - 0.4) < 1e-6)).toBe(false);

    // L'ossature contient bien le chevron central de chaque plaque (x = 0.8 et 1.6)
    // ainsi que les chevrons de joints (0.4, 1.2) et les rives (2.4).
    const pose = calculerPose("hpl", 2.4, 2.5, false, 0, 1000, {
      moduleLargeurMm: 1200,
      moduleHauteurMm: 800,
      sensPose: "vertical",
    });
    expect(pose.positionsChevronsM).toEqual([0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4]);
    expect(pose.positionsChevronsM).toContain(0.8);
    expect(pose.positionsChevronsM).toContain(1.6);
  });

  it("cohérence: symétrie, rives ≥ 150mm et jonctions sur chevrons pour plusieurs largeurs", () => {
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

      verifierJonctions(calepinage, largeurM);

      // L'ossature posée partage exactement la même grille centrée :
      // chaque joint de plaque (sauf x=0 et x=largeur) est porté par un chevron.
      const chevrons = [...pose.positionsChevronsM];
      let x = 0;
      calepinage.colonnesLargeursM.forEach((c) => {
        x += c;
        if (Math.abs(x - largeurM) < 1e-6) return;
        const supporte = chevrons.some((cv) => Math.abs(cv - x) < 1e-6);
        expect(supporte, `joint à x=${x} sans chevron (largeur=${largeurM})`).toBe(true);
      });
    }
  });
});