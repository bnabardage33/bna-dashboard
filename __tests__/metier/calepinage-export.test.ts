// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";

// Ces modules sont importés par lib/calepinage/export.ts mais non exécutés ici.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ resoudreTenant: vi.fn() }));

import {
  genererExcel,
  genererPdf,
  genererPlanPng,
  nomFichier,
  type DonneesExport,
} from "@/lib/calepinage/export";
import {
  lignesBordereau,
  totauxBordereau,
  surfaceGroupeM2,
} from "@/lib/calepinage/bordereau";
import { couleurGroupe } from "@/lib/calepinage/palette";
import type { ChantierZone, Module, ModuleGroup, Opening } from "@/types/calepinage";

const base = { zone_id: "z", entreprise_id: "e" };

const groupe = (n: string, w: number, h: number, count: number, material = "default"): ModuleGroup => ({
  id: `g-${n}`, ...base, group_number: n, width_mm: w, height_mm: h,
  is_rotated: false, is_flipped: false, treatment: "none", material, count,
});

const module_ = (n: string, x: number, y: number, w: number, h: number, cut = false): Module => ({
  id: `m-${n}-${x}-${y}`, ...base, group_number: n, x_mm: x, y_mm: y, width_mm: w, height_mm: h,
  is_cut: cut, is_rotated: false, is_flipped: false, treatment: "none", material: "default",
  created_at: "2026-10-05T00:00:00Z",
});

function donnees(overrides: Partial<DonneesExport> = {}): DonneesExport {
  return {
    zone: { id: "z", nom: "Façade Nord é/è", largeur: 4, hauteur_mur: 3 } as unknown as ChantierZone,
    projet: "Résidence Les Pins",
    groups: [groupe("G-001", 1000, 600, 15), groupe("G-002", 500, 600, 4, "=HYPERLINK(\"x\")")],
    modules: [module_("G-001", 0, 0, 1000, 600), module_("G-002", 3500, 0, 500, 600, true)],
    openings: [
      { id: "o", ...base, type: "fenetre", x_mm: 1000, y_mm: 1000, width_mm: 1000, height_mm: 1000, created_at: "" } as Opening,
    ],
    ...overrides,
  };
}

describe("bordereau (calculs purs)", () => {
  it("surface d'un groupe = largeur × hauteur × quantité", () => {
    expect(surfaceGroupeM2(groupe("G-001", 1000, 600, 15))).toBeCloseTo(9);
  });

  it("totaux : modules, surface (arrondie une fois), groupes", () => {
    const t = totauxBordereau(donnees().groups);
    expect(t).toEqual({ nbModules: 19, surfaceM2: 10.2, nbGroupes: 2 });
  });

  it("marque COUPE uniquement les groupes ayant un module coupé", () => {
    const l = lignesBordereau(donnees().groups, donnees().modules);
    expect(l.map((x) => x.nbCoupes)).toEqual([0, 1]);
  });

  it("palette : G-001 bleu, cyclique sur 8", () => {
    expect(couleurGroupe("G-001")).toBe("#3b82f6");
    expect(couleurGroupe("G-009")).toBe("#3b82f6");
  });
});

describe("nomFichier", () => {
  it("slug ASCII sûr + date", () => {
    expect(nomFichier("Façade Nord é/è", "pdf", new Date("2026-10-05T10:00:00Z"))).toBe(
      "bordereau_Facade_Nord_e_e_2026-10-05.pdf",
    );
    expect(nomFichier("../../\"x\r\n", "xlsx", new Date("2026-10-05T10:00:00Z"))).toBe(
      "bordereau_x_2026-10-05.xlsx",
    );
    expect(nomFichier("", "xlsx", new Date("2026-10-05T10:00:00Z"))).toMatch(/^bordereau_zone_/);
  });
});

describe("genererExcel", () => {
  it("produit un classeur lisible : 2 feuilles, ligne TOTAL, formules neutralisées", async () => {
    const octets = await genererExcel(donnees());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(octets as unknown as ArrayBuffer);

    expect(wb.worksheets.map((w) => w.name)).toEqual(["Bordereau", "Modules"]);
    const ws = wb.getWorksheet("Bordereau")!;
    expect(ws.getRow(1).values).toEqual([
      undefined, "N° Groupe", "Qté", "Largeur (mm)", "Hauteur (mm)", "Surface (m²)", "Traitement", "Matériau", "Coupe",
    ]);
    expect(ws.getRow(2).getCell(5).value).toBe(9);
    expect(ws.getRow(3).getCell(8).value).toBe("Oui (1)");
    // injection de formule neutralisée (cellule texte, pas une formule)
    expect(String(ws.getRow(3).getCell(7).value)).toBe("'=HYPERLINK(\"x\")");
    const total = ws.getRow(4);
    expect(total.getCell(1).value).toBe("TOTAL");
    expect((total.getCell(2).value as ExcelJS.CellFormulaValue).result).toBe(19);
    expect((total.getCell(5).value as ExcelJS.CellFormulaValue).result).toBe(10.2);

    expect(wb.getWorksheet("Modules")!.rowCount).toBe(3); // en-tête + 2 modules
  });

  it("sans groupe : classeur valide avec total à 0", async () => {
    const octets = await genererExcel(donnees({ groups: [], modules: [] }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(octets as unknown as ArrayBuffer);
    expect(wb.getWorksheet("Bordereau")!.getRow(2).getCell(1).value).toBe("TOTAL");
  });

  it("inclut la colonne Perçages si des perçages sont fournis", async () => {
    const d = donnees({
      percages: [
        { id: "p1", module_id: "m-G-001-0-0", zone_id: "z", entreprise_id: "e", x_mm: 50, y_mm: 50, diameter_mm: 8, type: "fixe", created_at: "" },
        { id: "p2", module_id: "m-G-001-0-0", zone_id: "z", entreprise_id: "e", x_mm: 950, y_mm: 50, diameter_mm: 8, type: "fixe", created_at: "" },
        { id: "p3", module_id: "m-G-001-0-0", zone_id: "z", entreprise_id: "e", x_mm: 50, y_mm: 550, diameter_mm: 8, type: "coulissante", created_at: "" },
        { id: "p4", module_id: "m-G-001-0-0", zone_id: "z", entreprise_id: "e", x_mm: 950, y_mm: 550, diameter_mm: 8, type: "coulissante", created_at: "" },
      ],
    });
    const octets = await genererExcel(d);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(octets as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Bordereau")!;
    expect(ws.getRow(1).values).toContain("Perçages");
    expect(ws.getRow(2).getCell(9).value).toBe("4 trous Ø8 (2 fixes, 2 coulissants)");
  });
});

// sharp = binaire natif : absent sur certaines plateformes (ex. Termux/Android).
// Le PDF dispose alors d'un repli vectoriel (testé plus bas dans tous les cas).
const sharpDisponible = await import("sharp").then(
  async (m) => {
    await m.default(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/>")).png().toBuffer();
    return true;
  },
  () => false,
);

describe("genererPlanPng", () => {
  it.skipIf(!sharpDisponible)("rend un PNG 800×600", async () => {
    const png = await genererPlanPng(donnees());
    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([800, 600]);
  });
});

describe("genererPdf", () => {
  it("produit un PDF A4 d'une page avec plan et tableau", async () => {
    const octets = await genererPdf(donnees());
    expect(new TextDecoder().decode(octets.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(octets);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
  });

  it("pagine un bordereau long et supporte les caractères hors Latin-1", async () => {
    const groups = Array.from({ length: 60 }, (_, i) =>
      groupe(`G-${String(i + 1).padStart(3, "0")}`, 1000, 600, 1, i === 0 ? "Béton → œuvre ≥ 5€" : "default"),
    );
    const octets = await genererPdf(donnees({ groups, modules: [] }));
    const doc = await PDFDocument.load(octets);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("produit un schéma de perçage par groupe dans le PDF", async () => {
    const d = donnees({
      percages: [
        { id: "p1", module_id: "m-G-001-0-0", zone_id: "z", entreprise_id: "e", x_mm: 50, y_mm: 50, diameter_mm: 8, type: "fixe", created_at: "" },
        { id: "p2", module_id: "m-G-001-0-0", zone_id: "z", entreprise_id: "e", x_mm: 950, y_mm: 50, diameter_mm: 8, type: "fixe", created_at: "" },
        { id: "p3", module_id: "m-G-001-0-0", zone_id: "z", entreprise_id: "e", x_mm: 50, y_mm: 550, diameter_mm: 8, type: "coulissante", created_at: "" },
        { id: "p4", module_id: "m-G-001-0-0", zone_id: "z", entreprise_id: "e", x_mm: 950, y_mm: 550, diameter_mm: 8, type: "coulissante", created_at: "" },
      ],
    });
    const octets = await genererPdf(d);
    const doc = await PDFDocument.load(octets);
    expect(doc.getPageCount()).toBe(2);
  });
});
