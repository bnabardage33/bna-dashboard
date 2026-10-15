// Export PDF pour la fiche technique & conformité DTU 51.4 Terrasse
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { ChantierTerrasseConfig, ResultatCalculTerrasse } from "./types";
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
}

export async function genererPdfTerrasse(donnees: DonneesExportTerrasse): Promise<Uint8Array> {
  const { terrasse, resultat, chantierNom, clientNom } = donnees;

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

  page.drawRectangle({
    x: 40,
    y: y - 60,
    width: width - 80,
    height: 60,
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

  y -= 80;

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
    "Document édité par BNA Dashboard — Moteur de calcul conforme DTU 51.4 (Platelages extérieurs bois).",
    {
      x: 40,
      y: 25,
      size: 7,
      font: fontRegular,
      color: grayColor,
    }
  );

  return await doc.save();
}
