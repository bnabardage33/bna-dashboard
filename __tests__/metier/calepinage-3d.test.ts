import { describe, it, expect } from "vitest";
import {
  VUE_DE_FACE,
  Z_MODULE,
  Z_MUR,
  bornerVue,
  doitSimplifier,
  echelleScene,
  ecranVersMur,
  elementsModeComplet,
  moduleSousPointMm,
  moduleSousTap,
  projeter,
  rectanglesGroupes,
  rectVisible,
  transformProfondeur,
  transformScene,
  type Vue3D,
} from "@/lib/calepinage/css3d";

describe("css3d helpers", () => {
  it("bornerVue limite rotateX à ±60°, rotateY à ±180° et zoom à [0.5, 3]", () => {
    expect(bornerVue({ rotateX: 90, rotateY: 200, zoom: 5 })).toEqual({
      rotateX: 60,
      rotateY: 180,
      zoom: 3,
    });
    expect(bornerVue({ rotateX: -100, rotateY: -250, zoom: 0.1 })).toEqual({
      rotateX: -60,
      rotateY: -180,
      zoom: 0.5,
    });
    expect(bornerVue({ rotateX: 15, rotateY: -30, zoom: 1.5 })).toEqual({
      rotateX: 15,
      rotateY: -30,
      zoom: 1.5,
    });
  });

  it("echelleScene calcule l'échelle avec facteur de marge 0.8 ou 0 si dimensions invalides", () => {
    // conteneur 1000x500, zone 10000x5000 -> ratio 0.1 * 0.8 = 0.08 px/mm
    expect(echelleScene(1000, 500, 10000, 5000)).toBeCloseTo(0.08);
    expect(echelleScene(0, 500, 10000, 5000)).toBe(0);
    expect(echelleScene(1000, 500, 0, 5000)).toBe(0);
  });

  it("transformScene et transformProfondeur génèrent le CSS valide", () => {
    expect(transformScene(VUE_DE_FACE)).toBe("rotateX(0.00deg) rotateY(0.00deg) scale(1.0000)");
    expect(transformProfondeur(Z_MODULE)).toBe("translateZ(2px)");
    expect(transformProfondeur(Z_MUR)).toBe("translateZ(0px)");
  });

  it("projeter et ecranVersMur sont réciproques à vue de face et gèrent la perspective", () => {
    const vue: Vue3D = { rotateX: 0, rotateY: 0, zoom: 1 };
    const p = projeter(100, 50, 0, vue);
    expect(p).not.toBeNull();
    expect(p?.x).toBeCloseTo(100);
    expect(p?.y).toBeCloseTo(50);

    const inverse = ecranVersMur(100, 50, vue);
    expect(inverse).not.toBeNull();
    expect(inverse?.x).toBeCloseTo(100);
    expect(inverse?.y).toBeCloseTo(50);
  });

  it("moduleSousPointMm trouve le module sous les coordonnées mm", () => {
    const modules = [
      { id: "m1", x_mm: 0, y_mm: 0, width_mm: 1000, height_mm: 500 },
      { id: "m2", x_mm: 1000, y_mm: 0, width_mm: 1000, height_mm: 500 },
    ];
    expect(moduleSousPointMm(modules, 500, 250)?.id).toBe("m1");
    expect(moduleSousPointMm(modules, 1500, 250)?.id).toBe("m2");
    expect(moduleSousPointMm(modules, 2500, 250)).toBeNull();
  });

  it("moduleSousTap résout le hit-test depuis les coordonnées écran", () => {
    const modules = [
      { id: "m1", x_mm: 0, y_mm: 0, width_mm: 1000, height_mm: 1000 },
      { id: "m2", x_mm: 1000, y_mm: 0, width_mm: 1000, height_mm: 1000 },
    ];
    const zw = 2000;
    const zh = 1000;
    const echelle = 0.5; // 1000 px de large au total pour la zone
    // Centre de la zone = (1000, 500) mm -> en écran relatif au centre: (0, 0) px
    // Le module m1 va de x_mm 0 à 1000 -> de -500mm à 0mm relatif au centre -> -250px à 0px
    const hit1 = moduleSousTap(modules, -100, 0, VUE_DE_FACE, echelle, zw, zh);
    expect(hit1?.id).toBe("m1");

    const hit2 = moduleSousTap(modules, 100, 0, VUE_DE_FACE, echelle, zw, zh);
    expect(hit2?.id).toBe("m2");
  });

  it("budget DOM et détection de dépassement pour vue simplifiée", () => {
    expect(elementsModeComplet(50, 2)).toBe(55); // 3 fixes + 50 + 2
    expect(doitSimplifier(50, 2)).toBe(false);

    expect(elementsModeComplet(195, 10)).toBe(208);
    expect(doitSimplifier(195, 10)).toBe(true); // > 200
  });

  it("rectanglesGroupes calcule les boîtes englobantes par groupe", () => {
    const modules = [
      { group_number: "G-001", x_mm: 0, y_mm: 0, width_mm: 500, height_mm: 400 },
      { group_number: "G-001", x_mm: 500, y_mm: 0, width_mm: 500, height_mm: 400 },
      { group_number: "G-002", x_mm: 0, y_mm: 400, width_mm: 1000, height_mm: 600 },
    ];
    const groups = [{ group_number: "G-001" }, { group_number: "G-002" }];

    const rects = rectanglesGroupes(modules, groups);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual(
      expect.objectContaining({
        groupNumber: "G-001",
        x_mm: 0,
        y_mm: 0,
        width_mm: 1000,
        height_mm: 400,
      }),
    );
    expect(rects[1]).toEqual(
      expect.objectContaining({
        groupNumber: "G-002",
        x_mm: 0,
        y_mm: 400,
        width_mm: 1000,
        height_mm: 600,
      }),
    );
  });

  it("rectVisible détecte les éléments dans ou hors viewport", () => {
    const rect = { x_mm: 0, y_mm: 0, width_mm: 500, height_mm: 500 };
    // Dans le viewport
    expect(rectVisible(rect, Z_MODULE, VUE_DE_FACE, 0.5, 2000, 1000, 1200, 800)).toBe(true);

    // Hors viewport (très loin)
    const rectLoin = { x_mm: 50000, y_mm: 50000, width_mm: 500, height_mm: 500 };
    expect(rectVisible(rectLoin, Z_MODULE, VUE_DE_FACE, 0.5, 2000, 1000, 800, 600, 10)).toBe(false);
  });
});
