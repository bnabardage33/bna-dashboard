// __tests__/bardage/profils-finitions-openings.test.ts
// Tests unitaires : Habillage complet des ouvertures, angles & optimisation débit 1D barres 3,00 m

import { describe, it, expect } from "vitest";
import {
  calculerHabillageOuverturesEtProfils1D,
  optimiserDecoupe1D,
  CONSTANTES_PROFILS_1D,
  type PieceProfil1D,
  calculerBardagePro,
} from "@/lib/bardage/pro";
import { genererExcel, genererPdf, type DonneesExport } from "@/lib/calepinage/export";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import type { ChantierZone, Module, ModuleGroup, Opening } from "@/types/calepinage";

describe("Habillage complet des ouvertures & Cornières d'angles / rives", () => {
  it("calcule individuellement bavette (+60 mm), 2 tableaux (H) et linteau (+40 mm) pour chaque fenêtre/baie", () => {
    const res = calculerHabillageOuverturesEtProfils1D({
      largeurM: 6.0,
      hauteurMurM: 3.0,
      ouvertures: [
        {
          id: "fen-1",
          nom: "Fenêtre Salon",
          type: "fenetre",
          largeurM: 1.2, // 1200 mm
          hauteurM: 1.4, // 1400 mm
        },
        {
          id: "baie-1",
          nom: "Baie Vitrée Terrasse",
          type: "baie",
          largeurM: 2.4, // 2400 mm
          hauteurM: 2.15, // 2150 mm
        },
        {
          id: "porte-1",
          nom: "Porte Entrée",
          type: "porte",
          largeurM: 0.9, // 900 mm
          hauteurM: 2.15, // 2150 mm
        },
      ],
    });

    expect(res.detailsParOuverture).toHaveLength(3);

    // 1. Fenêtre standard
    const fen = res.detailsParOuverture[0];
    expect(fen.bavetteAppui).not.toBeNull();
    expect(fen.bavetteAppui?.longueurMm).toBe(1200 + 60); // 1260 mm (largeur + 60 mm)
    expect(fen.bavetteAppui?.longueurM).toBe(1.26);
    expect(fen.tableauxLateraux.quantite).toBe(2);
    expect(fen.tableauxLateraux.longueurUnitaireMm).toBe(1400); // 1400 mm chacun
    expect(fen.tableauxLateraux.longueurTotaleM).toBe(2.8);
    expect(fen.linteauGoutteEau.longueurMm).toBe(1200 + 40); // 1240 mm (largeur + 40 mm)
    expect(fen.linteauGoutteEau.longueurM).toBe(1.24);

    // 2. Baie vitrée
    const baie = res.detailsParOuverture[1];
    expect(baie.bavetteAppui).not.toBeNull();
    expect(baie.bavetteAppui?.longueurMm).toBe(2400 + 60); // 2460 mm
    expect(baie.tableauxLateraux.longueurUnitaireMm).toBe(2150);
    expect(baie.linteauGoutteEau.longueurMm).toBe(2400 + 40); // 2440 mm

    // 3. Porte (pas de bavette d'appui surélevée, mais 2 tableaux et linteau)
    const porte = res.detailsParOuverture[2];
    expect(porte.bavetteAppui).toBeNull();
    expect(porte.tableauxLateraux.longueurUnitaireMm).toBe(2150);
    expect(porte.linteauGoutteEau.longueurMm).toBe(900 + 40); // 940 mm
  });

  it("calcule les cornières d'angle aluminium laqué RAL sur toute la hauteur des rives", () => {
    const res = calculerHabillageOuverturesEtProfils1D({
      largeurM: 8.0,
      hauteurMurM: 2.8,
      angle: true,
      ouvertures: [],
    });

    const corrieres = res.familles.cornieresAnglesRives;
    expect(corrieres.pieces).toHaveLength(2); // 2 rives/angles
    expect(corrieres.pieces[0].longueurMm).toBe(2800);
    expect(corrieres.pieces[1].longueurMm).toBe(2800);
    expect(corrieres.lineairePoseNetMl).toBe(5.6);
  });
});

describe("Optimisation de débit 1D (Bin-Packing Barres 3,00 m, Trait de scie 3 mm)", () => {
  it("optimise le découpage de pièces dans des barres de 3000 mm avec trait de scie de 3 mm", () => {
    // 2 pièces de 1200 mm : 1200 + 3 + 1200 = 2403 mm <= 3000 mm -> Doit tenir dans 1 seule barre !
    const pieces: PieceProfil1D[] = [
      { id: "p1", famille: "bavette_appui", designation: "Bavette 1", longueurMm: 1200, longueurM: 1.2 },
      { id: "p2", famille: "bavette_appui", designation: "Bavette 2", longueurMm: 1200, longueurM: 1.2 },
    ];

    const opt = optimiserDecoupe1D(pieces, {
      longueurBarreMm: CONSTANTES_PROFILS_1D.LONGUEUR_BARRE_STANDARD_MM,
      traitDeScieMm: CONSTANTES_PROFILS_1D.TRAIT_DE_SCIE_MM,
    });

    expect(opt.nbBarres).toBe(1);
    expect(opt.barres[0].pieces).toHaveLength(2);
    expect(opt.lineairePoseNetMl).toBe(2.4);
    expect(opt.lineaireDebiteMl).toBe(3.0);
    expect(opt.chuteTotaleMl).toBe(0.6);
    expect(opt.tauxChutePct).toBe(20.0);
  });

  it("ouvre une nouvelle barre lorsque l'espace restant + trait de scie est insuffisant", () => {
    // 2 pièces de 1800 mm : 1800 + 3 + 1800 = 3603 mm > 3000 mm -> Nécessite 2 barres distinctes
    const pieces: PieceProfil1D[] = [
      { id: "p1", famille: "tableau_lateral", designation: "Tableau 1", longueurMm: 1800, longueurM: 1.8 },
      { id: "p2", famille: "tableau_lateral", designation: "Tableau 2", longueurMm: 1800, longueurM: 1.8 },
    ];

    const opt = optimiserDecoupe1D(pieces);

    expect(opt.nbBarres).toBe(2);
    expect(opt.lineairePoseNetMl).toBe(3.6);
    expect(opt.lineaireDebiteMl).toBe(6.0);
  });

  it("fractionne automatiquement les rives dépassant la longueur d'une barre standard (> 3,00 m)", () => {
    // Rive de 4,50 m (4500 mm) -> fractionnée en 3000 mm + 1500 mm
    const pieces: PieceProfil1D[] = [
      { id: "angle-grand", famille: "corniere_angle_rive", designation: "Angle grand", longueurMm: 4500, longueurM: 4.5 },
    ];

    const opt = optimiserDecoupe1D(pieces);
    expect(opt.nbBarres).toBe(2);
    expect(opt.lineairePoseNetMl).toBe(4.5);
    expect(opt.lineaireDebiteMl).toBe(6.0);
  });
});

describe("Intégration Quantitatifs Contrat (calculerBardagePro)", () => {
  it("intègre les profilés d'habillage et cornières d'angle dans Q_net, Q_tech, Q_appro", () => {
    const res = calculerBardagePro({
      id: "facade-test",
      nom: "Façade avec baies",
      type: "facade",
      largeurM: 10.0,
      hauteurMurM: 2.8,
      ouvertures: [
        {
          id: "ouv-1",
          type: "fenetre",
          largeurM: 1.4,
          hauteurM: 1.3,
          xM: 2.0,
          yM: 0.8,
        },
      ],
    });

    // 1. Q_net
    const qNetProfils = res.quantities.qNet.profilsFinitions;
    expect(qNetProfils).toBeDefined();
    expect(qNetProfils.bavettesAppuiMl).toBe(1.46); // 1.4m + 0.06m
    expect(qNetProfils.tableauxLaterauxMl).toBe(2.6); // 2 x 1.3m
    expect(qNetProfils.linteauxGoutteEauMl).toBe(1.44); // 1.4m + 0.04m
    expect(qNetProfils.cornieresAnglesRivesMl).toBe(5.6); // 2 x 2.8m
    expect(qNetProfils.totalProfilsMl).toBeCloseTo(11.1, 1);

    // 2. Q_tech (débit barres de 3,00 m)
    const qTechProfils = res.quantities.qTech.profilsFinitions;
    expect(qTechProfils).toBeDefined();
    expect(qTechProfils.lineaireDebiteMl).toBeGreaterThanOrEqual(qNetProfils.totalProfilsMl);
    expect(qTechProfils.totalBarres3MDebitees).toBeGreaterThanOrEqual(4);

    // 3. Q_appro (barres de 3,00 m à commander)
    const qApproProfils = res.quantities.qAppro.profilsFinitions;
    expect(qApproProfils).toBeDefined();
    expect(qApproProfils.barresBavettesAppui3M).toBe(1);
    expect(qApproProfils.barresTableauxLateraux3M).toBe(1); // 2x 1.3m = 2.6m + 3mm trait scie <= 3.0m !
    expect(qApproProfils.barresLinteauxGoutteEau3M).toBe(1);
    expect(qApproProfils.barresCornieresAngles3M).toBe(2); // 2x 2.8m -> 2 barres
    expect(qApproProfils.totalBarresProfils3MACommander).toBe(5);

    // 4. Geometry details
    expect(res.geometry.habillageOuvertures).toBeDefined();
    expect(res.geometry.habillageOuvertures.detailsParOuverture).toHaveLength(1);
  });
});

describe("Intégration Exports Excel & PDF (export/excel et export/pdf)", () => {
  const zoneTest: ChantierZone = {
    id: "zone-1",
    nom: "Façade Sud",
    type: "facade",
    largeur: 6.0,
    hauteur_mur: 2.8,
    hauteur_faite: null,
  } as unknown as ChantierZone;

  const donneesExport: DonneesExport = {
    zone: zoneTest,
    projet: "Chantier Test Finitions",
    groups: [
      {
        id: "g-1",
        zone_id: "zone-1",
        entreprise_id: "e-1",
        group_number: "G-001",
        width_mm: 1000,
        height_mm: 600,
        is_rotated: false,
        is_flipped: false,
        treatment: "none",
        material: "trespa",
        count: 10,
      },
    ],
    modules: [],
    openings: [
      {
        id: "ouv-1",
        zone_id: "zone-1",
        entreprise_id: "e-1",
        type: "fenetre",
        x_mm: 1500,
        y_mm: 1000,
        width_mm: 1200,
        height_mm: 1400,
        created_at: "",
      } as Opening,
    ],
    inclureProfils: true,
  };

  it("génère la feuille 'Profilés & Finitions' dans le classeur Excel (.xlsx)", async () => {
    const octets = await genererExcel(donneesExport);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(octets as unknown as ArrayBuffer);

    const nomsFeuilles = wb.worksheets.map((w) => w.name);
    expect(nomsFeuilles).toContain("Profilés & Finitions");

    const ws = wb.getWorksheet("Profilés & Finitions")!;
    expect(ws).toBeDefined();
    // Vérifier la présence des sections synthèses et détails
    let foundBavette = false;
    let foundTableau = false;
    ws.eachRow((row) => {
      const text = row.values ? JSON.stringify(row.values).toLowerCase() : "";
      if (text.includes("bavette d'appui")) foundBavette = true;
      if (text.includes("tableau")) foundTableau = true;
    });
    expect(foundBavette).toBe(true);
    expect(foundTableau).toBe(true);
  });

  it("génère la page dédiée aux Profilés et Habillage d'Ouvertures dans le PDF vectoriel", async () => {
    const octets = await genererPdf(donneesExport);
    expect(new TextDecoder().decode(octets.slice(0, 5))).toBe("%PDF-");

    const doc = await PDFDocument.load(octets);
    // Au moins 2 pages (page bordereau + page dédiée profilés)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});
