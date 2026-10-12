// Export PDF pour la fiche technique & conformité DTU 51.4 Terrasse
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { ChantierTerrasseConfig, ResultatCalculTerrasse } from "./types";
import { fmtEuro } from "@/lib/financeCalculs";

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

  page.drawText("FICHE TECHNIQUE & CONFORMITÉ DTU 51.4", {
    x: 55,
    y: y - 20,
    size: 15,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(`Chantier : ${chantierNom} ${clientNom ? `| Client : ${clientNom}` : ""}`, {
    x: 55,
    y: y - 38,
    size: 10,
    font: fontRegular,
    color: rgb(0.9, 0.95, 1),
  });

  page.drawText(`Édité le ${new Date().toLocaleDateString("fr-FR")} — Ouvrage : ${terrasse.nom}`, {
    x: 55,
    y: y - 50,
    size: 8,
    font: fontRegular,
    color: rgb(0.8, 0.9, 1),
  });

  y -= 75;

  // --- GÉOMÉTRIE & MATÉRIAUX ---
  page.drawText("1. CARACTÉRISTIQUES DE L'OUVRAGE", {
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

  page.drawText(`Surface brute : ${resultat.surfaceBruteM2} m² (${terrasse.longueur_m}m × ${terrasse.largeur_m}m)`, {
    x: col1X,
    y: y - 18,
    size: 9,
    font: fontBold,
    color: darkColor,
  });
  page.drawText(`Hauteur sol fini : ${terrasse.hauteur_sol_cm} cm | Pente : ${terrasse.pente_pct} %`, {
    x: col1X,
    y: y - 32,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });
  page.drawText(`Type de sol : ${terrasse.type_sol.replace("_", " ")}`, {
    x: col1X,
    y: y - 46,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });

  page.drawText(`Lames : ${terrasse.essence_bois.toUpperCase()} ${terrasse.largeur_lame_mm}×${terrasse.epaisseur_lame_mm}mm`, {
    x: col2X,
    y: y - 18,
    size: 9,
    font: fontBold,
    color: darkColor,
  });
  page.drawText(`Jeu entre lames : ${terrasse.espacement_lames_mm} mm | Fixation : ${terrasse.type_fixation === "vis_inox" ? "Vis inox" : "Clips"}`, {
    x: col2X,
    y: y - 32,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });
  page.drawText(`Pose : ${terrasse.type_pose} | Lame std : ${terrasse.longueur_lame_m}m`, {
    x: col2X,
    y: y - 46,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });

  page.drawText(`Lambourdes : ${resultat.lambourdes.sectionMm} (${terrasse.type_lambourde})`, {
    x: col3X,
    y: y - 18,
    size: 9,
    font: fontBold,
    color: darkColor,
  });
  page.drawText(`Entraxe lambourdes : ${terrasse.entraxe_lambourdes_cm} cm`, {
    x: col3X,
    y: y - 32,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });
  page.drawText(`Plots : ${terrasse.type_plots} (entraxe ${terrasse.entraxe_plots_cm}cm)`, {
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

  page.drawText("2. AUDIT DE CONFORMITÉ DTU 51.4", {
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
  page.drawText(labelBadge, {
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

    page.drawText(`${itemSymbol} ${c.titre} : ${c.valeurConstatee}`, {
      x: 50,
      y,
      size: 8,
      font: fontBold,
      color: itemColor,
    });
    y -= 11;

    page.drawText(`${c.regleDtu} — ${c.recommandation}`, {
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
  page.drawText("3. NOMENCLATURE & QUANTITATIF APPROVISIONNEMENTS", {
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

  page.drawText("DÉSIGNATION", { x: 50, y: y - 10, size: 7, font: fontBold, color: darkColor });
  page.drawText("CATÉGORIE", { x: 300, y: y - 10, size: 7, font: fontBold, color: darkColor });
  page.drawText("QTÉ", { x: 390, y: y - 10, size: 7, font: fontBold, color: darkColor });
  page.drawText("UNITÉ", { x: 440, y: y - 10, size: 7, font: fontBold, color: darkColor });
  page.drawText("TOTAL HT (IND.)", { x: 485, y: y - 10, size: 7, font: fontBold, color: darkColor });

  y -= 18;

  for (const ligne of resultat.chiffrage.lignes) {
    if (y < 60) break;

    page.drawText(ligne.designation.substring(0, 48), {
      x: 50,
      y: y - 6,
      size: 7,
      font: fontRegular,
      color: darkColor,
    });
    page.drawText(ligne.categorie, {
      x: 300,
      y: y - 6,
      size: 7,
      font: fontRegular,
      color: grayColor,
    });
    page.drawText(ligne.quantite.toLocaleString("fr-FR"), {
      x: 390,
      y: y - 6,
      size: 7,
      font: fontBold,
      color: darkColor,
    });
    page.drawText(ligne.unite, {
      x: 440,
      y: y - 6,
      size: 7,
      font: fontRegular,
      color: grayColor,
    });
    page.drawText(fmtEuro(ligne.totalHt), {
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

  page.drawText("TOTAL ESTIMATIF FOURNITURES HT :", {
    x: 280,
    y: y - 11,
    size: 8,
    font: fontBold,
    color: primaryColor,
  });

  page.drawText(`${fmtEuro(resultat.chiffrage.totalHt)} HT`, {
    x: 475,
    y: y - 11,
    size: 9,
    font: fontBold,
    color: primaryColor,
  });

  // Footer
  page.drawText(
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
