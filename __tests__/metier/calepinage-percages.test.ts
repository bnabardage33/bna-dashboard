import { describe, it, expect } from "vitest";
import {
  genererPercagesPourModules,
  resoudreTypeFixation,
  type ModulePourPercage,
} from "@/lib/calepinage/percages";

describe("lib/calepinage/percages", () => {
  it("résout correctement les types de fixation", () => {
    expect(resoudreTypeFixation("fixe")).toBe("fixe");
    expect(resoudreTypeFixation("COULISSANTE")).toBe("coulissante");
    expect(resoudreTypeFixation("invisible")).toBe("invisible");
    expect(resoudreTypeFixation(null)).toBe("fixe");
    expect(resoudreTypeFixation(undefined)).toBe("fixe");
  });

  it("génère 4 perçages fixes pour un panneau standard non coupé", () => {
    const modules: ModulePourPercage[] = [
      {
        id: "mod-1",
        zone_id: "zone-1",
        entreprise_id: "ent-1",
        group_number: "G-001",
        x_mm: 0,
        y_mm: 0,
        width_mm: 1000,
        height_mm: 600,
        is_cut: false,
      },
    ];

    const percages = genererPercagesPourModules(modules, {
      modeFixation: "fixe",
      margeBordMm: 50,
      diameterMm: 6,
    });

    expect(percages).toHaveLength(4);
    expect(percages.every((p) => p.module_id === "mod-1")).toBe(true);
    expect(percages.every((p) => p.diameter_mm === 6)).toBe(true);
    expect(percages.every((p) => p.type === "fixe")).toBe(true);

    // Coins : (50, 50), (950, 50), (50, 550), (950, 550)
    expect(percages[0]).toMatchObject({ x_mm: 50, y_mm: 50 });
    expect(percages[1]).toMatchObject({ x_mm: 950, y_mm: 50 });
    expect(percages[2]).toMatchObject({ x_mm: 50, y_mm: 550 });
    expect(percages[3]).toMatchObject({ x_mm: 950, y_mm: 550 });
  });

  it("génère des perçages coulissants en bas en mode coulissante", () => {
    const modules: ModulePourPercage[] = [
      {
        id: "mod-2",
        zone_id: "zone-1",
        entreprise_id: "ent-1",
        group_number: "G-001",
        x_mm: 0,
        y_mm: 0,
        width_mm: 1200,
        height_mm: 800,
        is_cut: false,
      },
    ];

    const percages = genererPercagesPourModules(modules, {
      modeFixation: "coulissante",
      margeBordMm: 60,
    });

    expect(percages).toHaveLength(4);
    // Haut fixe
    expect(percages[0].type).toBe("fixe");
    expect(percages[1].type).toBe("fixe");
    // Bas coulissant
    expect(percages[2].type).toBe("coulissante");
    expect(percages[3].type).toBe("coulissante");

    expect(percages[0]).toMatchObject({ x_mm: 60, y_mm: 60 });
    expect(percages[3]).toMatchObject({ x_mm: 1140, y_mm: 740 });
  });

  it("ne génère pas de perçage automatique si le module est trop étroit", () => {
    const modules: ModulePourPercage[] = [
      {
        id: "mod-trop-petit",
        zone_id: "zone-1",
        entreprise_id: "ent-1",
        group_number: "G-coupe",
        x_mm: 0,
        y_mm: 0,
        width_mm: 80, // < 2 * 50 = 100mm
        height_mm: 600,
        is_cut: true,
      },
    ];

    const percages = genererPercagesPourModules(modules);
    expect(percages).toHaveLength(0);
  });

  it("génère des perçages adaptés sur un module coupé de dimensions suffisantes", () => {
    const modules: ModulePourPercage[] = [
      {
        id: "mod-coupe",
        zone_id: "zone-1",
        entreprise_id: "ent-1",
        group_number: "G-coupe",
        x_mm: 1000,
        y_mm: 0,
        width_mm: 400,
        height_mm: 600,
        is_cut: true,
      },
    ];

    const percages = genererPercagesPourModules(modules);
    expect(percages).toHaveLength(4);
    expect(percages[0]).toMatchObject({ x_mm: 50, y_mm: 50 });
    expect(percages[1]).toMatchObject({ x_mm: 350, y_mm: 50 });
    expect(percages[2]).toMatchObject({ x_mm: 50, y_mm: 550 });
    expect(percages[3]).toMatchObject({ x_mm: 350, y_mm: 550 });
  });
});
