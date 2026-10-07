import { describe, it, expect } from "vitest";
import { calculerCalepinage } from "@/lib/calepinageCalcul";
import { genererModules, numeroGroupe } from "@/lib/calepinage/modules";

describe("genererModules", () => {
  it("numérote les groupes G-001, G-002…", () => {
    expect(numeroGroupe(1)).toBe("G-001");
    expect(numeroGroupe(12)).toBe("G-012");
  });

  it("convertit les pièces en mm et préfixe le repère par « P- »", () => {
    const { modules } = genererModules(
      {
        pieces: [
          {
            id: "a", repere: "M-01", colonne: 0, rangee: 0,
            xM: 0.5, yM: 1.2, largeurM: 1, hauteurM: 0.6,
            type: "pleine", surfaceM2: 0.6,
          },
        ],
      },
      "hpl"
    );
    expect(modules).toEqual([
      expect.objectContaining({
        repere: "P-M-01", group_number: "G-001",
        x_mm: 500, y_mm: 1200, width_mm: 1000, height_mm: 600,
        is_cut: false, is_rotated: false, is_flipped: false,
        treatment: "none", material: "hpl",
      }),
    ]);
  });

  it("matériau vide → « default » ; coupe et pignon → is_cut", () => {
    const { modules } = genererModules(
      {
        pieces: [
          { id: "a", repere: "R-01", colonne: 0, rangee: 0, xM: 0, yM: 0, largeurM: 0.2, hauteurM: 0.6, type: "coupe", surfaceM2: 0.12 },
          { id: "b", repere: "P-01", colonne: 1, rangee: 0, xM: 0.2, yM: 0, largeurM: 1, hauteurM: 0.6, type: "pignon", surfaceM2: 0.3 },
        ],
      },
      null
    );
    expect(modules.map((m) => [m.is_cut, m.material])).toEqual([
      [true, "default"],
      [true, "default"],
    ]);
  });

  it("regroupe les modules identiques et calcule le bordereau", () => {
    const { calepinage } = { calepinage: calculerCalepinage({ zoneLargeurM: 5, zoneHauteurM: 3, traitDeScieMm: 0 }) };
    const { modules, groups, cuttingList } = genererModules(calepinage, "hpl");

    expect(modules).toHaveLength(calepinage.pieces.length);
    // Somme des exemplaires = nombre de modules
    expect(groups.reduce((s, g) => s + g.count, 0)).toBe(modules.length);
    // Chaque module pointe vers un groupe existant
    const numeros = new Set(groups.map((g) => g.group_number));
    expect(modules.every((m) => numeros.has(m.group_number))).toBe(true);
    // Numéros uniques et séquentiels
    expect(groups.map((g) => g.group_number)).toEqual(
      groups.map((_, i) => numeroGroupe(i + 1))
    );
    // Bordereau cohérent avec les groupes
    cuttingList.forEach((l, i) => {
      expect(l.count).toBe(groups[i].count);
      expect(l.surface_m2).toBeCloseTo((l.width_mm * l.height_mm * l.count) / 1e6, 3);
    });
  });
});
