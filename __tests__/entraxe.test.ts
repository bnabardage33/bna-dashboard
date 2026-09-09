import { describe, it, expect } from "vitest";
import { calculerPose, LIMITE_DTU_MM } from "../lib/poseCalcul";
import { calculerEntraxeReel, calculerCalepinage } from "../lib/calepinageCalcul";

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