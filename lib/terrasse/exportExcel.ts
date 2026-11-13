// Export Excel pour le quantitatif & conformité DTU 51.4 Terrasse
import ExcelJS from "exceljs";
import type { ChantierTerrasseConfig, ResultatCalculTerrasse } from "./types";

export interface DonneesExportExcelTerrasse {
  terrasse: ChantierTerrasseConfig;
  resultat: ResultatCalculTerrasse;
  chantierNom: string;
  clientNom?: string;
}

export async function genererExcelTerrasse(
  donnees: DonneesExportExcelTerrasse
): Promise<Uint8Array> {
  const { terrasse, resultat, chantierNom, clientNom } = donnees;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BNA Dashboard";
  workbook.created = new Date();

  // ==========================================
  // ONGLET 1 : QUANTITATIF & APPROVISIONNEMENT
  // ==========================================
  const wsQuantitatif = workbook.addWorksheet("Nomenclature & Devis", {
    views: [{ showGridLines: true }],
  });

  // Titre
  wsQuantitatif.addRow(["BNA DASHBOARD — BORDEREAU TERRASSE & QUANTITATIF"]);
  wsQuantitatif.addRow([`Chantier : ${chantierNom}`, `Client : ${clientNom || "—"}`]);
  wsQuantitatif.addRow([
    `Ouvrage : ${terrasse.nom}`,
    `Date : ${new Date().toLocaleDateString("fr-FR")}`,
  ]);
  wsQuantitatif.addRow([]);

  // En-têtes du tableau
  const headerRow = wsQuantitatif.addRow([
    "Code",
    "Catégorie",
    "Désignation des fournitures",
    "Quantité",
    "Unité",
    "P.U. HT (€)",
    "Total HT (€)",
  ]);

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "1E3A8A" }, // Bleu marine
    };
    cell.font = { bold: true, color: { argb: "FFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  // Remplissage des lignes
  for (const l of resultat.chiffrage.lignes) {
    const row = wsQuantitatif.addRow([
      l.code,
      l.categorie,
      l.designation,
      l.quantite,
      l.unite,
      l.prixUnitaireHt,
      l.totalHt,
    ]);

    row.getCell(4).alignment = { horizontal: "right" };
    row.getCell(6).numFmt = '#,##0.00" €"';
    row.getCell(7).numFmt = '#,##0.00" €"';
    row.getCell(7).font = { bold: true };
  }

  // Ligne Total
  wsQuantitatif.addRow([]);
  const totalRow = wsQuantitatif.addRow([
    "",
    "",
    "TOTAL ESTIMATIF FOURNITURES HT",
    "",
    "",
    "",
    resultat.chiffrage.totalHt,
  ]);
  totalRow.getCell(3).font = { bold: true, size: 11 };
  totalRow.getCell(7).font = { bold: true, size: 12, color: { argb: "1E3A8A" } };
  totalRow.getCell(7).numFmt = '#,##0.00" €"';

  // Formatage largeurs colonnes
  wsQuantitatif.getColumn(1).width = 12;
  wsQuantitatif.getColumn(2).width = 16;
  wsQuantitatif.getColumn(3).width = 46;
  wsQuantitatif.getColumn(4).width = 14;
  wsQuantitatif.getColumn(5).width = 10;
  wsQuantitatif.getColumn(6).width = 15;
  wsQuantitatif.getColumn(7).width = 18;

  // ==========================================
  // ONGLET 2 : CONFORMITÉ DTU 51.4 & TECHNIQUE
  // ==========================================
  const wsDtu = workbook.addWorksheet("Audit DTU 51.4 & Géométrie", {
    views: [{ showGridLines: true }],
  });

  wsDtu.addRow(["AUDIT CONFORMITÉ DTU 51.4 — PLATELAGE EXTÉRIEUR BOIS"]);
  wsDtu.addRow([`Statut global : ${resultat.conformite.statutGlobal.toUpperCase()}`]);
  wsDtu.addRow([]);

  const dtuHeader = wsDtu.addRow([
    "Point de contrôle",
    "Exigence DTU 51.4 / Norme",
    "Valeur constatée",
    "Statut",
    "Recommandation",
  ]);

  dtuHeader.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "334155" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFF" } };
  });

  for (const c of resultat.conformite.controles) {
    const row = wsDtu.addRow([
      c.titre,
      c.regleDtu,
      c.valeurConstatee,
      c.statut.toUpperCase(),
      c.recommandation,
    ]);

    const statutCell = row.getCell(4);
    if (c.statut === "conforme") {
      statutCell.font = { color: { argb: "16A34A" }, bold: true };
    } else if (c.statut === "avertissement") {
      statutCell.font = { color: { argb: "D97706" }, bold: true };
    } else {
      statutCell.font = { color: { argb: "DC2626" }, bold: true };
    }
  }

  wsDtu.addRow([]);
  wsDtu.addRow(["PARAMÈTRES GÉOMÉTRIQUES & STRUCTURE"]);
  wsDtu.addRow(["Surface brute :", `${resultat.surfaceBruteM2} m²`]);
  wsDtu.addRow(["Surface nette (avec escalier) :", `${resultat.surfaceNetteM2} m²`]);
  wsDtu.addRow(["Dimensions :", `${terrasse.longueur_m} m × ${terrasse.largeur_m} m`]);
  wsDtu.addRow(["Entraxe lambourdes :", `${terrasse.entraxe_lambourdes_cm} cm (Max DTU: ${resultat.lambourdes.entraxeMaxDtuCm} cm)`]);
  wsDtu.addRow(["Nombre de rangées lambourdes :", `${resultat.lambourdes.nbRangees}`]);
  wsDtu.addRow(["Total lambourdes (avec chutes) :", `${resultat.lambourdes.lineaireAvecChutesMl} ml (${resultat.lambourdes.nbBarres} barres)`]);
  wsDtu.addRow(["Nombre total de plots :", `${resultat.plots.nbPlotsTotal} (${resultat.plots.densiteParM2} plots/m²)`]);
  wsDtu.addRow(["Nombre de lames standard :", `${resultat.lames.nbLamesStandard} unités`]);
  wsDtu.addRow(["Nombre de fixations prévues :", `${resultat.fixations.nbVisOuClipsTotal} (${resultat.fixations.nbBoites} boîtes)`]);

  if (resultat.terrasseMobile && resultat.terrasseMobile.active) {
    const mob = resultat.terrasseMobile;
    wsDtu.addRow([]);
    wsDtu.addRow(["TERRASSE MOBILE & MOTORISATION (NF P90-308 / DTU 51.4)"]);
    wsDtu.addRow(["Mode de couverture :", mob.mode === "2_demi_plateaux" ? "2 demi-plateaux (ouverture centrale symétrique)" : "1 plateau monobloc"]);
    wsDtu.addRow(["Dimensions plateau(x) :", `${mob.dimensionsPlateau.longueurM} m × ${mob.dimensionsPlateau.largeurM} m (Surface: ${mob.dimensionsPlateau.surfaceM2} m²)`]);
    wsDtu.addRow(["Poids propre plateau / En charge :", `${mob.dimensionsPlateau.poidsPropreKg} kg / ${mob.dimensionsPlateau.poidsTotalChargeKg} kg`]);
    wsDtu.addRow(["Rails inox 316L au sol :", `${mob.rails.lineaireTotalM} ml (${mob.rails.nbRails} rails de ${mob.rails.longueurUnitaireM} m)`]);
    wsDtu.addRow(["Galets inox sur roulements :", `${mob.roulement.nbGaletsTotal} unités (${mob.roulement.reference})`]);
    wsDtu.addRow(["Châssis porteur aluminium :", `${mob.structureChassis.lineaireProfilesAluM} ml profilés ${mob.structureChassis.sectionAluMm} mm (${mob.structureChassis.poidsAluKg} kg)`]);
    if (mob.motorisation && mob.motorisation.active) {
      const mot = mob.motorisation;
      wsDtu.addRow(["Type de motorisation :", mot.typeMotorisation === "solaire" ? "Solaire autonome 24V DC (Panneau PV 30Wc + Batteries AGM)" : "Filaire 230V AC / 24V DC TBTS (NF C 15-100)"]);
      wsDtu.addRow(["Nombre de moteurs & effort :", `${mot.nbMoteurs} moteur(s) (${mot.puissanceMoteurUnitaireN} N unitaire, ${mot.puissanceTractionTotaleN} N total)`]);
      wsDtu.addRow(["Crémaillère de guidage :", `${mot.lineaireCremaillereM} ml (${mot.barresCremaillereCount} barres de 1 m, module 4)`]);
      wsDtu.addRow(["Fins de course & Sécurité :", `${mot.finsDeCourse.nbCapteurs} capteurs magnétiques IP68 · Télécommandes sécurisées NF P90-308`]);
    } else {
      wsDtu.addRow(["Motorisation :", "Manuelle (traction manuelle sur rails inox)"]);
    }
  }

  wsDtu.getColumn(1).width = 28;
  wsDtu.getColumn(2).width = 45;
  wsDtu.getColumn(3).width = 30;
  wsDtu.getColumn(4).width = 16;
  wsDtu.getColumn(5).width = 45;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
