// Export PDF pour la fiche technique & conformité DTU 51.4 Terrasse
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  ResultatCalculTerrasse,
} from "./types";
import { fmtEuro } from "@/lib/financeCalculs";

/**
 * pdf-lib + polices standard (Helvetica) encodent en WinAnsi : tout caractère
 * hors de cet encodage fait LEVER `drawText`
 * (ex. « ≤ » → « WinAnsi cannot encode "≤" (0x2264) »).
 * Remplace les symboles DTU/typographiques par un équivalent encodable, sans
 * toucher à la logique métier. WinAnsi ⊇ Latin-1 + CP1252 : « € » et « œ » sont
 * donc PRÉSERVÉS (notamment le « € » produit par fmtEuro).
 */
const CARACTERES_WINANSI_EXTRA =
  "\u20AC\u201A\u0192\u201E\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2022\u2122\u0161\u203A\u0153\u017E\u0178";
const RE_NON_WINANSI = new RegExp(`[^\\x00-\\xFF${CARACTERES_WINANSI_EXTRA}]`, "g");

export function sanitizeForPdf(texte: string): string {
  return texte
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/[×✕]/g, "x")
    .replace(/→/g, "->")
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...")
    .replace(RE_NON_WINANSI, " "); // espaces fines insécables fr-FR, etc.
}


export interface DonneesExportTerrasse {
  terrasse: ChantierTerrasseConfig;
  resultat: ResultatCalculTerrasse;
  chantierNom: string;
  clientNom?: string;
  reservations?: ChantierTerrasseReservation[];
}

export async function genererPdfTerrasse(donnees: DonneesExportTerrasse): Promise<Uint8Array> {
  const { terrasse, resultat, chantierNom, clientNom, reservations } = donnees;

  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();

  // Toute écriture de texte passe par `ecrire` : le contenu est assaini pour
  // l'encodage WinAnsi, titres comme cellules de tableau.
  const ecrire = (texte: string, options: Parameters<PDFPage["drawText"]>[1]): void => {
    page.drawText(sanitizeForPdf(texte), options);
  };

  const primaryColor = rgb(0.1, 0.45, 0.85); // Bleu pro
  const darkColor = rgb(0.12, 0.14, 0.18);
  const grayColor = rgb(0.45, 0.48, 0.53);
  const successColor = rgb(0.1, 0.65, 0.35);
  const dangerColor = rgb(0.85, 0.2, 0.2);
  const warningColor = rgb(0.85, 0.55, 0.1);
  const lightBg = rgb(0.96, 0.97, 0.98);

  let y = height - 40;

  // --- EN-TÊTE ---
  page.drawRectangle({
    x: 40,
    y: y - 55,
    width: width - 80,
    height: 65,
    color: primaryColor,
  });

  ecrire("FICHE TECHNIQUE & CONFORMITÉ DTU 51.4", {
    x: 55,
    y: y - 20,
    size: 15,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  ecrire(`Chantier : ${chantierNom} ${clientNom ? `| Client : ${clientNom}` : ""}`, {
    x: 55,
    y: y - 38,
    size: 10,
    font: fontRegular,
    color: rgb(0.9, 0.95, 1),
  });

  ecrire(`Édité le ${new Date().toLocaleDateString("fr-FR")} — Ouvrage : ${terrasse.nom}`, {
    x: 55,
    y: y - 50,
    size: 8,
    font: fontRegular,
    color: rgb(0.8, 0.9, 1),
  });

  y -= 75;

  // --- GÉOMÉTRIE & MATÉRIAUX ---
  ecrire("1. CARACTÉRISTIQUES DE L'OUVRAGE", {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: primaryColor,
  });
  y -= 16;

  const hasMobile = Boolean(resultat.terrasseMobile && resultat.terrasseMobile.active);
  const cadreHeight = hasMobile ? 74 : 60;

  page.drawRectangle({
    x: 40,
    y: y - cadreHeight,
    width: width - 80,
    height: cadreHeight,
    color: lightBg,
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });

  const col1X = 50;
  const col2X = 220;
  const col3X = 390;

  ecrire(`Surface brute : ${resultat.surfaceBruteM2} m² (${terrasse.longueur_m}m × ${terrasse.largeur_m}m)`, {
    x: col1X,
    y: y - 18,
    size: 9,
    font: fontBold,
    color: darkColor,
  });
  ecrire(`Hauteur sol fini : ${terrasse.hauteur_sol_cm} cm | Pente : ${terrasse.pente_pct} %`, {
    x: col1X,
    y: y - 32,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });
  ecrire(`Type de sol : ${terrasse.type_sol.replace("_", " ")}`, {
    x: col1X,
    y: y - 46,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });

  ecrire(`Lames : ${terrasse.essence_bois.toUpperCase()} ${terrasse.largeur_lame_mm}×${terrasse.epaisseur_lame_mm}mm`, {
    x: col2X,
    y: y - 18,
    size: 9,
    font: fontBold,
    color: darkColor,
  });
  ecrire(`Jeu entre lames : ${terrasse.espacement_lames_mm} mm | Fixation : ${terrasse.type_fixation === "vis_inox" ? "Vis inox" : "Clips"}`, {
    x: col2X,
    y: y - 32,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });
  ecrire(`Pose : ${terrasse.type_pose} | Lame std : ${terrasse.longueur_lame_m}m`, {
    x: col2X,
    y: y - 46,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });

  ecrire(`Lambourdes : ${resultat.lambourdes.sectionMm} (${terrasse.type_lambourde})`, {
    x: col3X,
    y: y - 18,
    size: 9,
    font: fontBold,
    color: darkColor,
  });
  ecrire(`Entraxe lambourdes : ${terrasse.entraxe_lambourdes_cm} cm`, {
    x: col3X,
    y: y - 32,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });
  ecrire(`Plots : ${terrasse.type_plots} (entraxe ${terrasse.entraxe_plots_cm}cm)`, {
    x: col3X,
    y: y - 46,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });

  if (hasMobile && resultat.terrasseMobile) {
    const mob = resultat.terrasseMobile;
    const motTxt = mob.motorisation?.active
      ? `Motorisation ${mob.motorisation.typeMotorisation === "solaire" ? "Solaire 24V" : "Filaire 230V"} (${mob.motorisation.puissanceTractionTotaleN}N, ${mob.motorisation.lineaireCremaillereM}m crémaillère)`
      : "Manuelle sur rails";
    ecrire(`Terrasse Mobile : ${mob.mode === "2_demi_plateaux" ? "2 demi-plateaux" : "1 plateau"} · Rails : ${mob.rails.lineaireTotalM}m · ${motTxt}`, {
      x: col1X,
      y: y - 62,
      size: 7.5,
      font: fontBold,
      color: primaryColor,
    });
  }

  y -= (hasMobile ? 94 : 80);

  // --- AUDIT DE CONFORMITÉ DTU 51.4 ---
  const dtuStatut = resultat.conformite.statutGlobal;
  const dtuColor =
    dtuStatut === "conforme"
      ? successColor
      : dtuStatut === "avertissement"
      ? warningColor
      : dangerColor;

  ecrire("2. AUDIT DE CONFORMITÉ DTU 51.4", {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: primaryColor,
  });

  // Badge global
  const labelBadge =
    dtuStatut === "conforme"
      ? "CONFORME DTU 51.4"
      : dtuStatut === "avertissement"
      ? "AVERTISSEMENT"
      : "NON CONFORME";

  page.drawRectangle({
    x: width - 180,
    y: y - 4,
    width: 140,
    height: 18,
    color: dtuColor,
  });
  ecrire(labelBadge, {
    x: width - 170,
    y: y + 1,
    size: 8,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  y -= 18;

  // Lignes de contrôle (max 5 pour garder une page aérée)
  const controles = resultat.conformite.controles.slice(0, 6);
  for (const c of controles) {
    const itemColor =
      c.statut === "conforme"
        ? successColor
        : c.statut === "avertissement"
        ? warningColor
        : dangerColor;
    const itemSymbol = c.statut === "conforme" ? "[OK]" : c.statut === "avertissement" ? "[ATTN]" : "[NON]";

    ecrire(`${itemSymbol} ${c.titre} : ${c.valeurConstatee}`, {
      x: 50,
      y,
      size: 8,
      font: fontBold,
      color: itemColor,
    });
    y -= 11;

    ecrire(`${c.regleDtu} — ${c.recommandation}`, {
      x: 60,
      y,
      size: 7,
      font: fontRegular,
      color: grayColor,
    });
    y -= 13;
  }

  y -= 10;

  // --- NOMENCLATURE DES APPROVISIONNEMENTS ---
  ecrire("3. NOMENCLATURE & QUANTITATIF APPROVISIONNEMENTS", {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: primaryColor,
  });
  y -= 16;

  // En-tête tableau
  page.drawRectangle({
    x: 40,
    y: y - 14,
    width: width - 80,
    height: 16,
    color: rgb(0.9, 0.92, 0.95),
  });

  ecrire("DÉSIGNATION", { x: 50, y: y - 10, size: 7, font: fontBold, color: darkColor });
  ecrire("CATÉGORIE", { x: 300, y: y - 10, size: 7, font: fontBold, color: darkColor });
  ecrire("QTÉ", { x: 390, y: y - 10, size: 7, font: fontBold, color: darkColor });
  ecrire("UNITÉ", { x: 440, y: y - 10, size: 7, font: fontBold, color: darkColor });
  ecrire("TOTAL HT (IND.)", { x: 485, y: y - 10, size: 7, font: fontBold, color: darkColor });

  y -= 18;

  for (const ligne of resultat.chiffrage.lignes) {
    if (y < 60) break;

    ecrire(ligne.designation.substring(0, 48), {
      x: 50,
      y: y - 6,
      size: 7,
      font: fontRegular,
      color: darkColor,
    });
    ecrire(ligne.categorie, {
      x: 300,
      y: y - 6,
      size: 7,
      font: fontRegular,
      color: grayColor,
    });
    ecrire(ligne.quantite.toLocaleString("fr-FR"), {
      x: 390,
      y: y - 6,
      size: 7,
      font: fontBold,
      color: darkColor,
    });
    ecrire(ligne.unite, {
      x: 440,
      y: y - 6,
      size: 7,
      font: fontRegular,
      color: grayColor,
    });
    ecrire(fmtEuro(ligne.totalHt), {
      x: 485,
      y: y - 6,
      size: 7,
      font: fontBold,
      color: darkColor,
    });

    page.drawLine({
      start: { x: 40, y: y - 10 },
      end: { x: width - 40, y: y - 10 },
      color: rgb(0.92, 0.93, 0.95),
      thickness: 0.5,
    });

    y -= 15;
  }

  // Ligne de total
  y -= 5;
  page.drawRectangle({
    x: 40,
    y: y - 16,
    width: width - 80,
    height: 20,
    color: rgb(0.95, 0.97, 1),
    borderColor: primaryColor,
    borderWidth: 0.5,
  });

  ecrire("TOTAL ESTIMATIF FOURNITURES HT :", {
    x: 280,
    y: y - 11,
    size: 8,
    font: fontBold,
    color: primaryColor,
  });

  ecrire(`${fmtEuro(resultat.chiffrage.totalHt)} HT`, {
    x: 475,
    y: y - 11,
    size: 9,
    font: fontBold,
    color: primaryColor,
  });

  // Footer
  ecrire(
    hasMobile
      ? "Document édité par BNA Dashboard — Moteur de calcul conforme DTU 51.4 — Page 1 / 2"
      : "Document édité par BNA Dashboard — Moteur de calcul conforme DTU 51.4 (Platelages extérieurs bois).",
    {
      x: 40,
      y: 25,
      size: 7,
      font: fontRegular,
      color: grayColor,
    }
  );

  // =========================================================================
  // PLANCHE DÉDIÉE : PLAN D'IMPLANTATION TERRASSE MOBILE & RAILS (PAGE 2)
  // =========================================================================
  if (hasMobile && resultat.terrasseMobile) {
    const mob = resultat.terrasseMobile;
    const page2 = doc.addPage([595.28, 841.89]); // A4 portrait
    const { width: p2W, height: p2H } = page2.getSize();

    const ecrireP2 = (texte: string, options: Parameters<PDFPage["drawText"]>[1]): void => {
      page2.drawText(sanitizeForPdf(texte), options);
    };

    let p2Y = p2H - 40;

    // --- EN-TÊTE PLANCHE 2 ---
    page2.drawRectangle({
      x: 40,
      y: p2Y - 55,
      width: p2W - 80,
      height: 65,
      color: primaryColor,
    });

    ecrireP2("PLAN D'IMPLANTATION — TERRASSE MOBILE & RAILS AU SOL", {
      x: 55,
      y: p2Y - 20,
      size: 13.5,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    ecrireP2(`Chantier : ${chantierNom} ${clientNom ? `| Client : ${clientNom}` : ""}`, {
      x: 55,
      y: p2Y - 37,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.9, 0.95, 1),
    });

    ecrireP2(
      `Ouvrage : ${terrasse.nom} — Plan de pose & cotes d'implantation — Norme NF P90-308 & DTU 51.4 — Planche 2 / 2`,
      {
        x: 55,
        y: p2Y - 50,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.8, 0.9, 1),
      }
    );

    p2Y -= 70;

    // --- CADRE DE DESSIN 2D TECHNIQUE ---
    const drawBoxX = 40;
    const drawBoxY = 345;
    const drawBoxW = p2W - 80; // 515.28 pt
    const drawBoxH = 370; // 370 pt

    page2.drawRectangle({
      x: drawBoxX,
      y: drawBoxY,
      width: drawBoxW,
      height: drawBoxH,
      color: rgb(0.98, 0.99, 1),
      borderColor: rgb(0.82, 0.86, 0.92),
      borderWidth: 1,
    });

    ecrireP2("SCHÉMA D'IMPLANTATION TECHNIQUE AU SOL (COTATIONS EN MILLIMÈTRES)", {
      x: drawBoxX + 12,
      y: drawBoxY + drawBoxH - 16,
      size: 8,
      font: fontBold,
      color: primaryColor,
    });

    // Paramètres géométriques
    const poolRes = reservations?.find((r) => r.type_reservation === "piscine");
    const poolW_m = poolRes?.largeur ?? Math.max(1, mob.dimensionsPlateau.largeurM - 0.04);
    const poolL_m = poolRes?.longueur ?? Math.max(1, mob.dimensionsPlateau.longueurM - 0.04);
    const poolX_m = poolRes?.x ?? 1.0;
    const poolY_m = poolRes?.y ?? 1.0;
    const jeuMm = poolRes?.terrasse_mobile?.jeu_fonctionnel_peripherique_mm ?? 20;
    const jeuM = jeuMm / 1000;

    const platW_m = mob.dimensionsPlateau.largeurM;
    const platL_m = mob.dimensionsPlateau.longueurM;
    const platX_m = poolX_m - jeuM;
    const platY_m = poolY_m - jeuM;

    const isDeux = mob.mode === "2_demi_plateaux";
    const sens = poolRes?.terrasse_mobile?.sens_refoulement ?? "droite";
    const isLateral = sens === "droite" || sens === "gauche";
    const isNegative = sens === "gauche" || sens === "haut";

    const courseM = !isDeux
      ? (isLateral ? platW_m + 0.20 : platL_m + 0.20)
      : ((isLateral ? platW_m / 2 : platL_m / 2) + 0.15);
    const courseMm = Math.round(courseM * 1000);

    const railLengthM = mob.rails.longueurUnitaireM;
    const railLengthMm = Math.round(railLengthM * 1000);
    const nbRails = mob.rails.nbRails;
    const entraxeRailsM = mob.rails.entraxeRailsM;
    const entraxeRailsMm = Math.round(entraxeRailsM * 1000);

    // Bounding box en mètres pour l'échelle
    let minX_m = 0;
    let maxX_m = terrasse.longueur_m;
    let minY_m = 0;
    let maxY_m = terrasse.largeur_m;

    let rStartX_m = platX_m;
    let rStartY_m = platY_m;
    if (isLateral) {
      rStartX_m = !isDeux
        ? (isNegative ? platX_m - (platW_m + 0.2) : platX_m)
        : platX_m - (platW_m / 2 + 0.15);
      minX_m = Math.min(minX_m, rStartX_m);
      maxX_m = Math.max(maxX_m, rStartX_m + railLengthM);
    } else {
      rStartY_m = !isDeux
        ? (isNegative ? platY_m - (platL_m + 0.2) : platY_m)
        : platY_m - (platL_m / 2 + 0.15);
      minY_m = Math.min(minY_m, rStartY_m);
      maxY_m = Math.max(maxY_m, rStartY_m + railLengthM);
    }

    const padScale = 0.5;
    const spanX_m = Math.max(1, maxX_m - minX_m + padScale * 2);
    const spanY_m = Math.max(1, maxY_m - minY_m + padScale * 2);

    const plotMargin = 28;
    const plotW = drawBoxW - plotMargin * 2;
    const plotH = drawBoxH - 50 - plotMargin;
    const scalePt = Math.min(plotW / spanX_m, plotH / spanY_m);

    const midX_m = (minX_m + maxX_m) / 2;
    const midY_m = (minY_m + maxY_m) / 2;
    const originPlotX = drawBoxX + drawBoxW / 2 - midX_m * scalePt;
    const originPlotTopY = drawBoxY + drawBoxH - 35;

    const toPdfX = (x_m: number) => originPlotX + x_m * scalePt;
    const toPdfY = (y_m: number) => originPlotTopY - y_m * scalePt;

    // Helper pour tracer une cote avec flèches
    const tracerCotePdf = (
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      label: string,
      color = primaryColor,
      offset = 0
    ) => {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 8) return;

      const ux = dx / dist;
      const uy = dy / dist;
      const nx = -uy;
      const ny = ux;

      const x1 = p1.x + nx * offset;
      const y1 = p1.y + ny * offset;
      const x2 = p2.x + nx * offset;
      const y2 = p2.y + ny * offset;

      page2.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: 0.8,
        color,
      });

      const tick = 3.5;
      page2.drawLine({
        start: { x: x1 + nx * tick, y: y1 + ny * tick },
        end: { x: x1 - nx * tick, y: y1 - ny * tick },
        thickness: 0.8,
        color,
      });
      page2.drawLine({
        start: { x: x2 + nx * tick, y: y2 + ny * tick },
        end: { x: x2 - nx * tick, y: y2 - ny * tick },
        thickness: 0.8,
        color,
      });

      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const txtSanitized = sanitizeForPdf(label);
      const txtW = fontBold.widthOfTextAtSize(txtSanitized, 6.5);
      page2.drawRectangle({
        x: midX - txtW / 2 - 2,
        y: midY - 4,
        width: txtW + 4,
        height: 8.5,
        color: rgb(0.98, 0.99, 1),
      });
      ecrireP2(label, {
        x: midX - txtW / 2,
        y: midY - 2.5,
        size: 6.5,
        font: fontBold,
        color,
      });
    };

    // Helper pour tracer une flèche de direction
    const tracerFlechePdf = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      label: string,
      color = warningColor
    ) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) return;

      const ux = dx / dist;
      const uy = dy / dist;
      const nx = -uy;
      const ny = ux;

      page2.drawLine({
        start: from,
        end: to,
        thickness: 1.8,
        color,
      });

      const arr = 6;
      page2.drawLine({
        start: to,
        end: { x: to.x - ux * arr + nx * (arr * 0.5), y: to.y - uy * arr + ny * (arr * 0.5) },
        thickness: 1.8,
        color,
      });
      page2.drawLine({
        start: to,
        end: { x: to.x - ux * arr - nx * (arr * 0.5), y: to.y - uy * arr - ny * (arr * 0.5) },
        thickness: 1.8,
        color,
      });

      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      const txtSanitized = sanitizeForPdf(label);
      const txtW = fontBold.widthOfTextAtSize(txtSanitized, 7);
      page2.drawRectangle({
        x: midX - txtW / 2 - 3,
        y: midY - 5,
        width: txtW + 6,
        height: 10.5,
        color: rgb(1, 1, 1),
        borderColor: color,
        borderWidth: 0.8,
      });
      ecrireP2(label, {
        x: midX - txtW / 2,
        y: midY - 3,
        size: 7,
        font: fontBold,
        color,
      });
    };

    // 1. Plage fixe
    page2.drawRectangle({
      x: toPdfX(0),
      y: toPdfY(terrasse.largeur_m),
      width: terrasse.longueur_m * scalePt,
      height: terrasse.largeur_m * scalePt,
      color: rgb(0.95, 0.95, 0.96),
      borderColor: rgb(0.75, 0.78, 0.84),
      borderWidth: 0.8,
      borderDashArray: [4, 3],
    });
    ecrireP2(`Plage fixe (${terrasse.longueur_m}m x ${terrasse.largeur_m}m)`, {
      x: toPdfX(0) + 6,
      y: toPdfY(0) - 12,
      size: 7,
      font: fontRegular,
      color: grayColor,
    });

    // 2. Rails Inox de guidage
    for (let i = 0; i < nbRails; i++) {
      const frac = nbRails > 1 ? i / (nbRails - 1) : 0;
      let rx1_m = rStartX_m;
      let rx2_m = rStartX_m + railLengthM;
      let ry1_m = platY_m + frac * platL_m;
      let ry2_m = ry1_m;

      if (!isLateral) {
        rx1_m = platX_m + frac * platW_m;
        rx2_m = rx1_m;
        ry1_m = rStartY_m;
        ry2_m = rStartY_m + railLengthM;
      }

      const p1 = { x: toPdfX(rx1_m), y: toPdfY(ry1_m) };
      const p2 = { x: toPdfX(rx2_m), y: toPdfY(ry2_m) };

      // Ligne rail inox
      page2.drawLine({
        start: p1,
        end: p2,
        thickness: 2.2,
        color: rgb(0.42, 0.46, 0.52),
      });

      // Butées d'arrêt aux extrémités
      const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const nx = -Math.sin(ang) * 5;
      const ny = Math.cos(ang) * 5;

      page2.drawLine({
        start: { x: p1.x + nx, y: p1.y + ny },
        end: { x: p1.x - nx, y: p1.y - ny },
        thickness: 2.5,
        color: warningColor,
      });
      page2.drawLine({
        start: { x: p2.x + nx, y: p2.y + ny },
        end: { x: p2.x - nx, y: p2.y - ny },
        thickness: 2.5,
        color: warningColor,
      });
    }

    // Cotes rails inox (longueur totale et entraxe)
    if (nbRails >= 2) {
      if (isLateral) {
        const pRail1 = { x: toPdfX(rStartX_m), y: toPdfY(platY_m) };
        const pRail2 = { x: toPdfX(rStartX_m + railLengthM), y: toPdfY(platY_m) };
        tracerCotePdf(pRail1, pRail2, `Rail Inox 316L : ${railLengthMm} mm`, darkColor, 14);

        const pMid1 = { x: toPdfX(rStartX_m + railLengthM / 2), y: toPdfY(platY_m) };
        const pMid2 = { x: toPdfX(rStartX_m + railLengthM / 2), y: toPdfY(platY_m + platL_m) };
        tracerCotePdf(pMid1, pMid2, `Entraxe rails : ${entraxeRailsMm} mm`, primaryColor, 0);
      } else {
        const pRail1 = { x: toPdfX(platX_m), y: toPdfY(rStartY_m) };
        const pRail2 = { x: toPdfX(platX_m), y: toPdfY(rStartY_m + railLengthM) };
        tracerCotePdf(pRail1, pRail2, `Rail Inox 316L : ${railLengthMm} mm`, darkColor, 14);

        const pMid1 = { x: toPdfX(platX_m), y: toPdfY(rStartY_m + railLengthM / 2) };
        const pMid2 = { x: toPdfX(platX_m + platW_m), y: toPdfY(rStartY_m + railLengthM / 2) };
        tracerCotePdf(pMid1, pMid2, `Entraxe rails : ${entraxeRailsMm} mm`, primaryColor, 0);
      }
    }

    // 3. Bassin piscine
    page2.drawRectangle({
      x: toPdfX(poolX_m),
      y: toPdfY(poolY_m + poolL_m),
      width: poolW_m * scalePt,
      height: poolL_m * scalePt,
      color: rgb(0.12, 0.65, 0.88),
      borderColor: rgb(0.05, 0.45, 0.7),
      borderWidth: 1.5,
    });
    ecrireP2(`BASSIN PISCINE (${poolW_m.toFixed(2)}m x ${poolL_m.toFixed(2)}m)`, {
      x: toPdfX(poolX_m) + 8,
      y: toPdfY(poolY_m + poolL_m / 2) - 3,
      size: 7.5,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    // 4. Plateau mobile fermé (Contour plein)
    if (!isDeux) {
      page2.drawRectangle({
        x: toPdfX(platX_m),
        y: toPdfY(platY_m + platL_m),
        width: platW_m * scalePt,
        height: platL_m * scalePt,
        color: rgb(0.9, 0.94, 0.99),
        borderColor: primaryColor,
        borderWidth: 1.5,
      });
      ecrireP2(`PLATEAU FERME (${Math.round(platW_m * 1000)} x ${Math.round(platL_m * 1000)} mm)`, {
        x: toPdfX(platX_m) + 8,
        y: toPdfY(platY_m) - 12,
        size: 7.5,
        font: fontBold,
        color: primaryColor,
      });
      ecrireP2(`Jeu peripherique : ${jeuMm} mm`, {
        x: toPdfX(platX_m) + 8,
        y: toPdfY(platY_m) - 22,
        size: 6.5,
        font: fontRegular,
        color: grayColor,
      });

      // Position ouverte en zone de refoulement (Contour pointillés)
      const opX_m = isLateral ? platX_m + (isNegative ? -courseM : courseM) : platX_m;
      const opY_m = !isLateral ? platY_m + (isNegative ? -courseM : courseM) : platY_m;

      page2.drawRectangle({
        x: toPdfX(opX_m),
        y: toPdfY(opY_m + platL_m),
        width: platW_m * scalePt,
        height: platL_m * scalePt,
        color: rgb(0.99, 0.97, 0.93),
        borderColor: warningColor,
        borderWidth: 1.5,
        borderDashArray: [4, 3],
      });
      ecrireP2(`POSITION OUVERTE (Degagement)`, {
        x: toPdfX(opX_m) + 6,
        y: toPdfY(opY_m) - 12,
        size: 7.5,
        font: fontBold,
        color: warningColor,
      });

      // Flèche de translation
      const fromCenter = {
        x: toPdfX(platX_m + platW_m / 2),
        y: toPdfY(platY_m + platL_m / 2),
      };
      const toCenter = {
        x: toPdfX(opX_m + platW_m / 2),
        y: toPdfY(opY_m + platL_m / 2),
      };
      tracerFlechePdf(fromCenter, toCenter, `Translation ${courseMm} mm`, warningColor);
    } else {
      // 2 demi-plateaux symétriques
      const demiW_m = isLateral ? platW_m / 2 : platW_m;
      const demiL_m = !isLateral ? platL_m / 2 : platL_m;

      for (let p = 0; p < 2; p++) {
        const pX_m = isLateral && p === 1 ? platX_m + demiW_m : platX_m;
        const pY_m = !isLateral && p === 1 ? platY_m + demiL_m : platY_m;

        page2.drawRectangle({
          x: toPdfX(pX_m),
          y: toPdfY(pY_m + demiL_m),
          width: demiW_m * scalePt,
          height: demiL_m * scalePt,
          color: rgb(0.9, 0.94, 0.99),
          borderColor: primaryColor,
          borderWidth: 1.5,
        });

        // Positions ouvertes
        const dirSign = p === 0 ? -1 : 1;
        const opX_m = isLateral ? pX_m + dirSign * courseM : pX_m;
        const opY_m = !isLateral ? pY_m + dirSign * courseM : pY_m;

        page2.drawRectangle({
          x: toPdfX(opX_m),
          y: toPdfY(opY_m + demiL_m),
          width: demiW_m * scalePt,
          height: demiL_m * scalePt,
          color: rgb(0.99, 0.97, 0.93),
          borderColor: warningColor,
          borderWidth: 1.5,
          borderDashArray: [4, 3],
        });

        const fromC = { x: toPdfX(pX_m + demiW_m / 2), y: toPdfY(pY_m + demiL_m / 2) };
        const toC = { x: toPdfX(opX_m + demiW_m / 2), y: toPdfY(opY_m + demiL_m / 2) };
        tracerFlechePdf(fromC, toC, `${p === 0 ? "Demi A" : "Demi B"} -> ${courseMm}mm`, warningColor);
      }
    }

    // 5. Motorisation & crémaillère (si active)
    if (mob.motorisation?.active) {
      const mot = mob.motorisation;
      const mX_m = isLateral ? (isNegative ? rStartX_m : rStartX_m + railLengthM) : platX_m;
      const mY_m = !isLateral ? (isNegative ? rStartY_m : rStartY_m + railLengthM) : platY_m;

      page2.drawRectangle({
        x: toPdfX(mX_m) - 10,
        y: toPdfY(mY_m) - 7,
        width: 20,
        height: 14,
        color: darkColor,
        borderColor: warningColor,
        borderWidth: 1,
      });
      ecrireP2("MOT", {
        x: toPdfX(mX_m) - 7,
        y: toPdfY(mY_m) - 3,
        size: 6,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      if (mot.typeMotorisation === "solaire") {
        const pvX_m = mX_m + (isLateral ? 0 : 0.8);
        const pvY_m = mY_m + (isLateral ? 0.8 : 0);

        page2.drawRectangle({
          x: toPdfX(pvX_m) - 12,
          y: toPdfY(pvY_m) - 8,
          width: 24,
          height: 16,
          color: rgb(0.1, 0.25, 0.6),
          borderColor: primaryColor,
          borderWidth: 1,
        });
        ecrireP2("PV 30Wc", {
          x: toPdfX(pvX_m) - 10,
          y: toPdfY(pvY_m) - 4,
          size: 5.5,
          font: fontBold,
          color: rgb(1, 1, 1),
        });
      }
    }

    // --- CARTOUCHES RÉCAPITULATIFS TECHNIQUES (y = 195 to 335) ---
    const cardY = 195;
    const cardH = 135;
    const cardW = (drawBoxW - 16) / 3;

    // Card 1 : Plateau
    page2.drawRectangle({
      x: 40,
      y: cardY,
      width: cardW,
      height: cardH,
      color: lightBg,
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });
    ecrireP2("1. CARACTÉRISTIQUES PLATEAU", {
      x: 48,
      y: cardY + cardH - 14,
      size: 8,
      font: fontBold,
      color: primaryColor,
    });
    ecrireP2(`Mode : ${mob.mode === "2_demi_plateaux" ? "2 demi-plateaux symetriques" : "1 plateau monobloc"}`, {
      x: 48,
      y: cardY + cardH - 28,
      size: 7,
      font: fontRegular,
      color: darkColor,
    });
    ecrireP2(`Dimensions : ${Math.round(platW_m * 1000)} x ${Math.round(platL_m * 1000)} mm`, {
      x: 48,
      y: cardY + cardH - 42,
      size: 7,
      font: fontBold,
      color: darkColor,
    });
    ecrireP2(`Epaisseur totale : ${mob.dimensionsPlateau.epaisseurTotaleMm} mm`, {
      x: 48,
      y: cardY + cardH - 54,
      size: 7,
      font: fontRegular,
      color: grayColor,
    });
    ecrireP2(`Surface couverte : ${mob.dimensionsPlateau.surfaceM2} m2`, {
      x: 48,
      y: cardY + cardH - 66,
      size: 7,
      font: fontRegular,
      color: grayColor,
    });
    ecrireP2(`Poids propre : ${mob.dimensionsPlateau.poidsPropreKg} kg (a vide)`, {
      x: 48,
      y: cardY + cardH - 78,
      size: 7,
      font: fontRegular,
      color: darkColor,
    });
    ecrireP2(`Charge utile : ${mob.dimensionsPlateau.poidsTotalChargeKg} kg (250 kg/m2)`, {
      x: 48,
      y: cardY + cardH - 90,
      size: 7,
      font: fontBold,
      color: darkColor,
    });
    ecrireP2(`Finition : ${mob.dimensionsPlateau.essenceBois}${mob.dimensionsPlateau.teinteComposite ? ` (${mob.dimensionsPlateau.teinteComposite})` : ""}`, {
      x: 48,
      y: cardY + cardH - 102,
      size: 7,
      font: fontRegular,
      color: primaryColor,
    });
    ecrireP2(`Jeu peripherique : ${jeuMm} mm sur 4 cotes`, {
      x: 48,
      y: cardY + cardH - 116,
      size: 6.5,
      font: fontRegular,
      color: grayColor,
    });

    // Card 2 : Châssis & Rails
    const c2X = 40 + cardW + 8;
    page2.drawRectangle({
      x: c2X,
      y: cardY,
      width: cardW,
      height: cardH,
      color: lightBg,
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });
    ecrireP2("2. CHÂSSIS & GUIDAGE AU SOL", {
      x: c2X + 8,
      y: cardY + cardH - 14,
      size: 8,
      font: fontBold,
      color: primaryColor,
    });
    ecrireP2(`Chassis : Alu 6060 T6 section ${mob.structureChassis.sectionAluMm}mm`, {
      x: c2X + 8,
      y: cardY + cardH - 28,
      size: 7,
      font: fontRegular,
      color: darkColor,
    });
    ecrireP2(`Hauteur caisson chassis : ${mob.hauteurChassisMm} mm`, {
      x: c2X + 8,
      y: cardY + cardH - 42,
      size: 7,
      font: fontBold,
      color: darkColor,
    });
    ecrireP2(`Profiles alu porteurs : ${mob.structureChassis.lineaireProfilesAluM} ml`, {
      x: c2X + 8,
      y: cardY + cardH - 54,
      size: 7,
      font: fontRegular,
      color: grayColor,
    });
    ecrireP2(`Rails inox 316L extra-plats : ${mob.rails.nbRails} unites`, {
      x: c2X + 8,
      y: cardY + cardH - 66,
      size: 7,
      font: fontRegular,
      color: darkColor,
    });
    ecrireP2(`Longueur unitaire rail : ${mob.rails.longueurUnitaireM} m (${mob.rails.lineaireTotalM} ml totaux)`, {
      x: c2X + 8,
      y: cardY + cardH - 78,
      size: 7,
      font: fontBold,
      color: darkColor,
    });
    ecrireP2(`Entraxe des rails : ${entraxeRailsMm} mm`, {
      x: c2X + 8,
      y: cardY + cardH - 90,
      size: 7,
      font: fontRegular,
      color: primaryColor,
    });
    ecrireP2(`Galets doubles inox IP68 : ${mob.roulement.nbGaletsTotal} galets`, {
      x: c2X + 8,
      y: cardY + cardH - 102,
      size: 7,
      font: fontRegular,
      color: darkColor,
    });
    ecrireP2(`Charge max par galet : ${mob.roulement.chargeParGaletKg} kg / point`, {
      x: c2X + 8,
      y: cardY + cardH - 116,
      size: 6.5,
      font: fontRegular,
      color: grayColor,
    });

    // Card 3 : Motorisation
    const c3X = 40 + (cardW + 8) * 2;
    page2.drawRectangle({
      x: c3X,
      y: cardY,
      width: cardW,
      height: cardH,
      color: lightBg,
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });
    ecrireP2("3. MOTORISATION & SÉCURITÉ", {
      x: c3X + 8,
      y: cardY + cardH - 14,
      size: 8,
      font: fontBold,
      color: primaryColor,
    });
    const mot = mob.motorisation;
    const motLib = mot?.active
      ? mot.typeMotorisation === "solaire"
        ? "Solaire autonome 24V DC"
        : "Filaire 230V / 24V TBTS"
      : "Manuelle sur rails";
    ecrireP2(`Alimentation : ${motLib}`, {
      x: c3X + 8,
      y: cardY + cardH - 28,
      size: 7,
      font: fontBold,
      color: mot?.active ? darkColor : grayColor,
    });
    ecrireP2(`Effort de traction requis : ${mot?.puissanceTractionTotaleN || 0} N`, {
      x: c3X + 8,
      y: cardY + cardH - 42,
      size: 7,
      font: fontRegular,
      color: darkColor,
    });
    ecrireP2(`Moteur(s) : ${mot?.nbMoteurs || 0} x ${mot?.puissanceMoteurUnitaireN || 0} N`, {
      x: c3X + 8,
      y: cardY + cardH - 54,
      size: 7,
      font: fontBold,
      color: darkColor,
    });
    ecrireP2(`Cremaillere M4 acier/nylon : ${mot?.lineaireCremaillereM || 0} m`, {
      x: c3X + 8,
      y: cardY + cardH - 66,
      size: 7,
      font: fontRegular,
      color: grayColor,
    });
    ecrireP2(`Kit coffret : ${mot?.typeMotorisation === "solaire" ? "Panneau PV 30Wc + 2 bat. AGM" : mot?.typeMotorisation === "filaire" ? "Coffret 230V/24V IP65" : "Sans"}`, {
      x: c3X + 8,
      y: cardY + cardH - 78,
      size: 7,
      font: fontRegular,
      color: grayColor,
    });
    ecrireP2(`Fins de course : Magnetiques IP68 (${mot?.finsDeCourse?.nbCapteurs || 2} capteurs)`, {
      x: c3X + 8,
      y: cardY + cardH - 90,
      size: 7,
      font: fontRegular,
      color: darkColor,
    });
    ecrireP2(`Telecommande securisee : 868 MHz`, {
      x: c3X + 8,
      y: cardY + cardH - 102,
      size: 7,
      font: fontRegular,
      color: darkColor,
    });
    ecrireP2(`Norme de securite bassin : NF P90-308`, {
      x: c3X + 8,
      y: cardY + cardH - 116,
      size: 6.5,
      font: fontBold,
      color: successColor,
    });

    // --- CONSIGNES CRITIQUES DE POSE & PLANÉITÉ DES RAILS (y = 50 to 185) ---
    const consY = 50;
    const consH = 135;

    page2.drawRectangle({
      x: 40,
      y: consY,
      width: drawBoxW,
      height: consH,
      color: rgb(0.99, 0.98, 0.95),
      borderColor: warningColor,
      borderWidth: 1,
    });

    ecrireP2("CONSIGNES CRITIQUES DE POSE & PLANÉITÉ DES RAILS (ÉQUIPES DE CHANTIER)", {
      x: 50,
      y: consY + consH - 14,
      size: 8.5,
      font: fontBold,
      color: rgb(0.75, 0.42, 0.05),
    });

    const consignes = [
      "1. Planéité stricte des rails (<= 2 mm / m) : Tolérance de nivellement maximale de 2 mm par mètre linéaire sur toute la longueur des rails. Contrôle obligatoire à la règle de 2 m et au niveau laser optique avant vissage définitif. Tout défaut de planéité entraîne un coincement du caisson mobile.",
      "2. Parallélisme et équerrage (+- 1 mm) : L'écartement entre les rails inox au sol doit être strictement constant avec une tolérance maximale de +- 1 mm en tout point de la course. Contrôle croisé des diagonales au télémètre laser obligatoire pour éviter tout arc-boutement.",
      "3. Fixation dans support porteur stable : Utiliser des chevilles mécaniques ou chimiques en acier Inox A4 Marine (AISI 316) disposées tous les 500 mm dans une dalle béton ou des longrines armées C25/30 d'épaisseur minimale 150 mm.",
      "4. Jeu fonctionnel périphérique (20 mm) & garde au sol : Maintenir scrupuleusement le jeu de 20 mm entre le bord intérieur du bassin et le plateau mobile, ainsi qu'une garde au sol de 8 mm sous la jupe d'applique pour assurer un coulissement sans frottement.",
      "5. Butées mécaniques & fins de course : Poser impérativement les butées mécaniques caoutchoutées d'extrémité de rail et caler les aimants étanches de fins de course magnétiques IP68 pour garantir l'arrêt automatique sécurisé conforme NF P90-308.",
    ];

    let consLineY = consY + consH - 28;
    for (const c of consignes) {
      ecrireP2(c.substring(0, 130), {
        x: 52,
        y: consLineY,
        size: 6.8,
        font: fontBold,
        color: darkColor,
      });
      consLineY -= 11;
      if (c.length > 130) {
        ecrireP2(c.substring(130), {
          x: 62,
          y: consLineY,
          size: 6.5,
          font: fontRegular,
          color: grayColor,
        });
        consLineY -= 11;
      }
    }

    // Footer Page 2
    ecrireP2(
      "Document d'exécution chantier — Plan d'implantation Terrasse Mobile conforme NF P90-308 & DTU 51.4 — Page 2 / 2",
      {
        x: 40,
        y: 25,
        size: 7,
        font: fontRegular,
        color: grayColor,
      }
    );
  }

  return await doc.save();
}
