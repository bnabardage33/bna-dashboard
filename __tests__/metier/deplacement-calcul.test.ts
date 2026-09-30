import { describe, it, expect } from "vitest";
import { calculerMontantDeplacement, calculerTaxesDeplacement } from "../../lib/deplacement/calcul";

describe("Moteur de calcul de déplacement", () => {
  it("calcule correctement l'aller + retour × tarif", () => {
    expect(calculerMontantDeplacement(15, 15, 1)).toBe(30);
    expect(calculerMontantDeplacement(20, 20, 1.5)).toBe(60);
  });

  it("calcule correctement l'aller simple (retour = 0)", () => {
    expect(calculerMontantDeplacement(10, 0, 1.15)).toBe(11.5);
  });

  it("gère correctement le tarif décimal et les arrondis à 2 chiffres", () => {
    // (15.33 + 15.33) * 1.15 = 30.66 * 1.15 = 35.259 -> 35.26
    expect(calculerMontantDeplacement(15.33, 15.33, 1.15)).toBe(35.26);
  });

  it("autorise une distance zéro", () => {
    expect(calculerMontantDeplacement(0, 0, 1)).toBe(0);
  });

  it("rejette implicitement les distances négatives en les ramenant à zéro", () => {
    expect(calculerMontantDeplacement(-10, 10, 1)).toBe(10);
    expect(calculerMontantDeplacement(-10, -10, 1)).toBe(0);
  });

  it("rejette implicitement le tarif négatif en le ramenant à zéro", () => {
    expect(calculerMontantDeplacement(10, 10, -1)).toBe(0);
  });
});

describe("Calcul des taxes", () => {
  it("calcule la TVA et le TTC correctement", () => {
    const res = calculerTaxesDeplacement(100, 20);
    expect(res.montantTva).toBe(20);
    expect(res.montantTtc).toBe(120);
  });

  it("arrondit proprement la TVA", () => {
    // 35.26 * 0.20 = 7.052 -> 7.05
    // TTC = 35.26 + 7.05 = 42.31
    const res = calculerTaxesDeplacement(35.26, 20);
    expect(res.montantTva).toBe(7.05);
    expect(res.montantTtc).toBe(42.31);
  });
});
