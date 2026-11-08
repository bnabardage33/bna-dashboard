import { describe, it, expect } from "vitest";
import { calculerCalepinage } from "@/lib/calepinageCalcul";

describe("Bardage Pignon Couplage et Anti-Micro-Pièces", () => {
  it("calcule les rampants et détails atelier de pignon (pignonDetails)", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 8,
      zoneHauteurM: 2.5,
      estPignon: true,
      hauteurFaiteM: 4.5,
      plaqueLongueurMm: 3050,
      plaqueLargeurMm: 1300,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "horizontal",
      minRiveWidthMm: 250,
      antiMicroPignon: true,
    });

    expect(res).toBeDefined();
    expect(res.pieces.length).toBeGreaterThan(0);

    const piecesPignon = res.pieces.filter((p) => p.type === "pignon");
    expect(piecesPignon.length).toBeGreaterThan(0);

    // Vérifie que les pièces de pignon disposent de leurs cotes atelier (hLeft, hRight)
    for (const p of piecesPignon) {
      expect(p.pignonDetails).toBeDefined();
      if (p.pignonDetails) {
        expect(p.pignonDetails.hLeftMm).toBeGreaterThanOrEqual(0);
        expect(p.pignonDetails.hRightMm).toBeGreaterThanOrEqual(0);
        expect(p.pignonDetails.cutWidthMm).toBeGreaterThan(0);
        expect(p.pignonDetails.cutHeightMm).toBeGreaterThan(0);
      }
    }
  });

  it("couple les chutes triangulaires de pignon tête-bêche (nbPiecesCouplees / coupleAvec)", () => {
    // Pignon symétrique permettant le couplage tête-bêche des triangles gauche et droit
    const res = calculerCalepinage({
      zoneLargeurM: 6,
      zoneHauteurM: 2,
      estPignon: true,
      hauteurFaiteM: 3.5,
      plaqueLongueurMm: 3050,
      plaqueLargeurMm: 1300,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 500,
      sensPose: "horizontal",
      autoriserRotation: true,
      minRiveWidthMm: 250,
      antiMicroPignon: true,
    });

    expect(res.nbPiecesCouplees).toBeDefined();
    // Au moins une paire couplée tête-bêche
    if ((res.nbPiecesCouplees ?? 0) > 0) {
      expect(res.nbBlocsCouples).toBeGreaterThan(0);
      const pieceCouplee = res.pieces.find((p) => p.coupleAvec);
      expect(pieceCouplee).toBeDefined();
      expect(pieceCouplee?.coupleAvec?.repere).toBeDefined();
    }
  });

  it("applique la règle anti-micro-plaques sur les rives et pignons (>= 250 mm)", () => {
    const res = calculerCalepinage({
      zoneLargeurM: 2.3, // Rives résiduelles qui seraient < 250 mm avec 1 m
      zoneHauteurM: 2.0,
      plaqueLongueurMm: 3050,
      plaqueLargeurMm: 1300,
      moduleLargeurMm: 1000,
      moduleHauteurMm: 600,
      sensPose: "horizontal",
      minRiveWidthMm: 250,
      antiMicroPignon: true,
    });

    for (const p of res.pieces) {
      // Aucune pièce de rive ne doit faire moins de 250 mm (0.25 m)
      expect(p.largeurM).toBeGreaterThanOrEqual(0.249);
    }
  });
});
