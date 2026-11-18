import type { BardageProGeometricResult } from "@/lib/bardage/pro/quantitatifs-contrat";
import type { LigneQuantitatifExportable, QuantitatifExportable } from "./types";

export interface BardageZoneResumeInput {
  id: string;
  nom: string;
  materiau: string;
  surfaceNetteM2: number;
  surfaceACommanderM2: number;
  heuresPose?: number;
}

export interface AdapterBardageOptions {
  chantierId?: string;
  chantierNom?: string;
  clientId?: string;
  tvaPct?: 20 | 10 | 5.5 | 0;
  tauxHoraireMoHt?: number;
  prixM2ParementHt?: number;
}

/**
 * Convertit un résultat géométrique pro `BardageProGeometricResult`
 * vers le contrat normalisé `QuantitatifExportable`.
 */
export function adapterBardageProEnQuantitatif(
  res: BardageProGeometricResult,
  options: AdapterBardageOptions = {}
): QuantitatifExportable {
  const tva = options.tvaPct ?? 20;
  const tauxMo = options.tauxHoraireMoHt ?? 58;
  const prixParementM2 = options.prixM2ParementHt ?? 68;
  const qAppro = res.quantities.qAppro;
  const lignes: LigneQuantitatifExportable[] = [];

  const surfaceParement =
    qAppro.surfacePlaquesACommanderM2 > 0
      ? qAppro.surfacePlaquesACommanderM2
      : res.geometry.surfaceNetteM2;

  if (surfaceParement > 0) {
    lignes.push({
      designation: `Parement bardage ${res.preset.nomCommercial}${
        qAppro.nbPlaquesMeresACommander > 0 ? ` (${qAppro.nbPlaquesMeresACommander} plaques)` : ""
      } — ${res.facadeNom}`,
      unite: "m²",
      quantite: Number(surfaceParement.toFixed(2)),
      prix_unitaire_ht: prixParementM2,
      tva_pct: tva,
      categorie: "materiaux",
    });
  }

  if (qAppro.barresChevronsACommander.quantiteBarres > 0) {
    lignes.push({
      designation: `Chevrons ossature (${qAppro.barresChevronsACommander.longueurBarreM} m, total ${qAppro.barresChevronsACommander.lineaireTotalM} ml)`,
      unite: "u",
      quantite: qAppro.barresChevronsACommander.quantiteBarres,
      prix_unitaire_ht: 14.5,
      tva_pct: tva,
      categorie: "ossature",
    });
  }

  if (qAppro.fixations.nbBoites > 0) {
    lignes.push({
      designation: `${qAppro.fixations.designation} (boîte de ${qAppro.fixations.unitesParBoite})`,
      unite: "u",
      quantite: qAppro.fixations.nbBoites,
      prix_unitaire_ht: 34,
      tva_pct: tva,
      categorie: "accessoires",
    });
  }

  const nbProfilsVentil =
    qAppro.profilsDepartEtVentilation.grillesVentilationBassePieces +
    qAppro.profilsDepartEtVentilation.grillesVentilationHautePieces +
    qAppro.profilsDepartEtVentilation.cornieresAnglesPieces;

  if (nbProfilsVentil > 0) {
    lignes.push({
      designation: `Profilés ventilation & angles (${qAppro.profilsDepartEtVentilation.longueurPieceM} m)`,
      unite: "u",
      quantite: nbProfilsVentil,
      prix_unitaire_ht: 18.5,
      tva_pct: tva,
      categorie: "accessoires",
    });
  }

  if (qAppro.profilsFinitions.totalBarresProfils3MACommander > 0) {
    lignes.push({
      designation: "Profilés habillage ouvertures & bavettes (barres 3,00 m)",
      unite: "u",
      quantite: qAppro.profilsFinitions.totalBarresProfils3MACommander,
      prix_unitaire_ht: 29,
      tva_pct: tva,
      categorie: "accessoires",
    });
  }

  if (res.heuresPoseEstimatives > 0) {
    lignes.push({
      designation: `Main-d'œuvre pose ossature & bardage — ${res.facadeNom}`,
      unite: "h",
      quantite: res.heuresPoseEstimatives,
      prix_unitaire_ht: tauxMo,
      tva_pct: tva,
      temps_pose_heures: res.heuresPoseEstimatives,
      categorie: "main_oeuvre",
    });
  }

  return {
    metier: "bardage",
    chantier_id: options.chantierId,
    chantier_nom: options.chantierNom,
    client_id: options.clientId,
    objet: `Bardage ${res.preset.nomCommercial} — ${res.geometry.surfaceNetteM2} m²`,
    surface_ou_lineaire: res.geometry.surfaceNetteM2,
    lignes,
  };
}

/**
 * Convertit un ensemble de façades/zones du Hub Bardage (`BardageCalepinageModule`)
 * vers `QuantitatifExportable`.
 */
export function adapterZonesBardageEnQuantitatif(
  zones: BardageZoneResumeInput[],
  options: AdapterBardageOptions = {}
): QuantitatifExportable {
  const tva = options.tvaPct ?? 20;
  const tauxMo = options.tauxHoraireMoHt ?? 58;
  const prixM2 = options.prixM2ParementHt ?? 68;
  const lignes: LigneQuantitatifExportable[] = [];

  let surfaceNetteTotale = 0;
  let heuresTotales = 0;

  for (const z of zones) {
    surfaceNetteTotale += z.surfaceNetteM2;
    const qteM2 = Number((z.surfaceACommanderM2 || z.surfaceNetteM2).toFixed(2));
    if (qteM2 > 0) {
      lignes.push({
        designation: `Fourniture bardage ${z.materiau} — ${z.nom}`,
        unite: "m²",
        quantite: qteM2,
        prix_unitaire_ht: prixM2,
        tva_pct: tva,
        categorie: "materiaux",
      });
    }
    const hZone = z.heuresPose ?? Number((z.surfaceNetteM2 * 0.75).toFixed(1));
    heuresTotales += hZone;
  }

  if (heuresTotales > 0) {
    lignes.push({
      designation: "Main-d'œuvre pose bardage & ossature (estimatif)",
      unite: "h",
      quantite: Number(heuresTotales.toFixed(1)),
      prix_unitaire_ht: tauxMo,
      tva_pct: tva,
      temps_pose_heures: Number(heuresTotales.toFixed(1)),
      categorie: "main_oeuvre",
    });
  }

  return {
    metier: "bardage",
    chantier_id: options.chantierId,
    chantier_nom: options.chantierNom,
    client_id: options.clientId,
    objet: `Bardage — ${Number(surfaceNetteTotale.toFixed(1))} m²`,
    surface_ou_lineaire: Number(surfaceNetteTotale.toFixed(1)),
    lignes,
  };
}
