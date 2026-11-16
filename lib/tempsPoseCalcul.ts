/**
 * Moteur unifié de calcul des temps de pose, cadences, planification et rentabilité main-d'œuvre.
 * (Remplace l'ancien module `gaelLogic.ts`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultatMetre } from "@/lib/metre-serialization";
import { calculerHabillageOuverturesEtProfils1D } from "@/lib/bardage/pro/profils-finitions";
import type { ResultatCalculTerrasse } from "@/lib/terrasse/types";

// ── Cadences & Taux horaires paramétrables (table `catalogue_temps`) ──────────

export interface CadencesTempsPose {
  // Bardage
  bardage_ite_h_m2: number;
  bardage_ossature_h_m2: number;
  bardage_parement_clin_h_m2: number;
  bardage_parement_claire_voie_h_m2: number;
  bardage_parement_hpl_h_m2: number;
  bardage_pignon_majoration_pct: number;
  bardage_ouverture_h_u: number;
  bardage_corniere_h_ml: number;

  // Terrasse & Terrasse Mobile
  terrasse_prep_geotextile_h_m2: number;
  terrasse_structure_h_m2: number;
  terrasse_platelage_h_m2: number;
  terrasse_escalier_h_u: number;
  terrasse_garde_corps_h_ml: number;
  terrasse_mobile_rails_chassis_h: number;
  terrasse_mobile_motorisation_h: number;

  // Taux horaires entreprise (€ HT / h)
  taux_horaire_vente_ht: number;
  taux_horaire_charge_ht: number;
}

export const CADENCES_DEFAUT: CadencesTempsPose = {
  bardage_ite_h_m2: 0.30,
  bardage_ossature_h_m2: 0.55,
  bardage_parement_clin_h_m2: 0.65,
  bardage_parement_claire_voie_h_m2: 0.85,
  bardage_parement_hpl_h_m2: 1.00,
  bardage_pignon_majoration_pct: 25,
  bardage_ouverture_h_u: 1.80,
  bardage_corniere_h_ml: 0.25,

  terrasse_prep_geotextile_h_m2: 0.15,
  terrasse_structure_h_m2: 0.45,
  terrasse_platelage_h_m2: 0.55,
  terrasse_escalier_h_u: 4.00,
  terrasse_garde_corps_h_ml: 0.50,
  terrasse_mobile_rails_chassis_h: 8.00,
  terrasse_mobile_motorisation_h: 4.00,

  taux_horaire_vente_ht: 45.00,
  taux_horaire_charge_ht: 28.50,
};

export interface LigneCatalogueTemps {
  id?: string;
  nom_tache: string;
  temps_unitaire_heure: number;
}

/**
 * Fusionne les lignes de `catalogue_temps` avec les valeurs par défaut `CADENCES_DEFAUT`.
 * Toute clé inconnue est ignorée ; toute valeur négative ou non finie est ignorée.
 */
export function fusionnerCadencesDepuisCatalogueTemps(
  rows: Array<{ nom_tache: string; temps_unitaire_heure: number }> | null | undefined,
): CadencesTempsPose {
  const result: CadencesTempsPose = { ...CADENCES_DEFAUT };
  if (!rows || !Array.isArray(rows)) return result;

  const clesValides = new Set<keyof CadencesTempsPose>(
    Object.keys(CADENCES_DEFAUT) as Array<keyof CadencesTempsPose>,
  );

  for (const row of rows) {
    const cle = row?.nom_tache as keyof CadencesTempsPose;
    const val = Number(row?.temps_unitaire_heure);
    if (clesValides.has(cle) && Number.isFinite(val) && val >= 0) {
      result[cle] = val;
    }
  }
  return result;
}

/**
 * Charge les cadences & taux horaires depuis la table Supabase `catalogue_temps`,
 * avec repli automatique sur `CADENCES_DEFAUT`.
 */
export async function chargerCadencesTempsPose(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any>,
): Promise<CadencesTempsPose> {
  try {
    const { data, error } = await client
      .from("catalogue_temps")
      .select("nom_tache, temps_unitaire_heure, entreprise_id");
    if (error || !data) return { ...CADENCES_DEFAUT };
    // Priorise les surcharges de l'entreprise (entreprise_id non null) sur d'éventuelles valeurs globales
    const tries = [...data].sort((a, b) => {
      if (a.entreprise_id && !b.entreprise_id) return 1;
      if (!a.entreprise_id && b.entreprise_id) return -1;
      return 0;
    });
    return fusionnerCadencesDepuisCatalogueTemps(tries);
  } catch {
    return { ...CADENCES_DEFAUT };
  }
}

function arrondirHeures(val: number): number {
  return Math.round(val * 100) / 100;
}

// ── Fonctions historiques conservées ──────────────────────────────────────────

/**
 * Étape 1 - Le Temps Budget (Vente)
 * Calcule le temps théorique total en croisant les données du chantier (le calepinage) avec le catalogue_temps.
 */
export function calculerTempsBudget(
  surfaceM2: number,
  tempsUnitaireSurface: number,
  quantiteCoupesMl: number,
  tempsUnitaireCoupe: number,
  singularitesNb: number,
  tempsUnitaireSingularite: number,
): number {
  return (
    surfaceM2 * tempsUnitaireSurface +
    quantiteCoupesMl * tempsUnitaireCoupe +
    singularitesNb * tempsUnitaireSingularite
  );
}

/**
 * Étape 2 - Le Temps de Planification (Réalité terrain pour l'équipe)
 * Calcule le temps de présence estimé sur place, avec une marge de sécurité.
 */
export function calculerTempsPlanification(
  tempsBudget: number,
  coefPerteRendement: number = 1.8,
): number {
  if (coefPerteRendement <= 0) return tempsBudget;
  return tempsBudget / coefPerteRendement;
}

/**
 * Calcule le Temps Réel Consommé (Ajusté selon la météo)
 * Somme de (volume_heures_declare / coef_meteo)
 */
export function calculerTempsConsommeMeteo(
  pointages: { volumeHeures: number; coefMeteo: number }[],
): number {
  return pointages.reduce(
    (somme, p) => somme + p.volumeHeures / (p.coefMeteo || 1.0),
    0,
  );
}

/**
 * Étape 3 - Le Bilan de Rentabilité
 * Compare le "Temps Budget" avec le temps consommé (ajusté par la météo).
 */
export function calculerBilanRentabilite(
  tempsBudget: number,
  tempsConsomme: number,
): number {
  return tempsBudget - tempsConsomme;
}

// ── Calculateur métier Bardage (basé sur ResultatMetre & profils-finitions) ───

export type PhaseBardageTemps = "ossature" | "isolation" | "bardage" | "finitions";

export interface ResultatTempsPoseBardage {
  parPhase: Record<PhaseBardageTemps, number>;
  totalHeures: number;
  tempsPlanification: number;
  details: {
    surfaceNetteTotaleM2: number;
    surfaceIsolantM2: number;
    surfacePignonsM2: number;
    nbOuvertures: number;
    lineaireCornieresMl: number;
  };
}

export interface OptionsCalculTempsBardage {
  cadences?: Partial<CadencesTempsPose>;
  coefPerteRendement?: number;
  /** Force le mode claire-voie (0.85 h/m²) pour les lames bois/composite. */
  claireVoie?: boolean;
  /** Permet de fournir directement un linéaire de cornières d'angle/départ (sinon calculé via profils-finitions.ts). */
  lineaireCornieresMl?: number;
}

function cadenceParementPourZone(
  entrees: ResultatMetre["entrees"],
  cadences: CadencesTempsPose,
  claireVoie?: boolean,
): number {
  if (
    entrees.famille_pose === "hpl" ||
    entrees.famille_pose === "cassette" ||
    entrees.materiau === "plaques"
  ) {
    return cadences.bardage_parement_hpl_h_m2;
  }
  if (claireVoie) {
    return cadences.bardage_parement_claire_voie_h_m2;
  }
  return cadences.bardage_parement_clin_h_m2;
}

/**
 * Calcule les heures prévues de pose Bardage ventilées sur les 4 phases
 * (`ossature`, `isolation`, `bardage`, `finitions`) à partir d'un ou plusieurs `ResultatMetre`
 * et des profils/cornières calculés par `profils-finitions.ts`.
 */
export function calculerTempsPoseBardage(
  zones: ResultatMetre | ResultatMetre[],
  options: OptionsCalculTempsBardage = {},
): ResultatTempsPoseBardage {
  const liste = Array.isArray(zones) ? zones : [zones];
  const cadences: CadencesTempsPose = { ...CADENCES_DEFAUT, ...options.cadences };

  let hOssature = 0;
  let hIsolation = 0;
  let hBardage = 0;
  let hFinitions = 0;

  let surfaceNetteTotaleM2 = 0;
  let surfaceIsolantM2 = 0;
  let surfacePignonsM2 = 0;
  let nbOuverturesTotal = 0;
  let lineaireCornieresTotal = 0;

  for (const z of liste) {
    const surfaceNette = Math.max(0, z.resultat_zone?.surfaceNette ?? 0);
    const estPignon = z.entrees.type === "pignon";
    const isolantActif = Boolean(z.resultat_pose?.isolant?.actif);

    surfaceNetteTotaleM2 += surfaceNette;
    if (estPignon) surfacePignonsM2 += surfaceNette;
    if (isolantActif) surfaceIsolantM2 += surfaceNette;

    // 1. Isolation ITE (si isolant actif)
    if (isolantActif) {
      hIsolation += surfaceNette * cadences.bardage_ite_h_m2;
    }

    // 2. Ossature (équerres + chevrons + EPDM)
    hOssature += surfaceNette * cadences.bardage_ossature_h_m2;

    // 3. Parement courant (+25 % sur pignons)
    const cadenceParement = cadenceParementPourZone(z.entrees, cadences, options.claireVoie);
    const coefPignon = estPignon ? 1 + cadences.bardage_pignon_majoration_pct / 100 : 1;
    hBardage += surfaceNette * cadenceParement * coefPignon;

    // 4. Finitions & Ouvertures (via profils-finitions.ts)
    const nbOuverturesZone =
      z.resultat_zone?.nombreOuvertures ?? z.entrees.ouvertures?.length ?? 0;
    nbOuverturesTotal += nbOuverturesZone;

    let mlCornieresZone = 0;
    if (typeof options.lineaireCornieresMl === "number") {
      mlCornieresZone = options.lineaireCornieresMl / Math.max(1, liste.length);
    } else {
      const habillage = calculerHabillageOuverturesEtProfils1D({
        type: z.entrees.type,
        largeurM: z.entrees.largeur,
        hauteurMurM: z.entrees.hauteur_mur,
        hauteurFaiteM: z.entrees.hauteur_faite,
        angle: z.entrees.angle,
        ouvertures: (z.entrees.ouvertures ?? []).map((o) => ({
          id: o.id,
          type: o.type,
          largeurM: o.largeur,
          hauteurM: o.hauteur,
        })),
      });
      mlCornieresZone = habillage.familles.cornieresAnglesRives.lineairePoseNetMl;
    }
    lineaireCornieresTotal += mlCornieresZone;

    hFinitions +=
      nbOuverturesZone * cadences.bardage_ouverture_h_u +
      mlCornieresZone * cadences.bardage_corniere_h_ml;
  }

  const parPhase: Record<PhaseBardageTemps, number> = {
    ossature: arrondirHeures(hOssature),
    isolation: arrondirHeures(hIsolation),
    bardage: arrondirHeures(hBardage),
    finitions: arrondirHeures(hFinitions),
  };

  const totalHeures = arrondirHeures(
    parPhase.ossature + parPhase.isolation + parPhase.bardage + parPhase.finitions,
  );
  const tempsPlanification = arrondirHeures(
    calculerTempsPlanification(totalHeures, options.coefPerteRendement ?? 1.8),
  );

  return {
    parPhase,
    totalHeures,
    tempsPlanification,
    details: {
      surfaceNetteTotaleM2: arrondirHeures(surfaceNetteTotaleM2),
      surfaceIsolantM2: arrondirHeures(surfaceIsolantM2),
      surfacePignonsM2: arrondirHeures(surfacePignonsM2),
      nbOuvertures: nbOuverturesTotal,
      lineaireCornieresMl: arrondirHeures(lineaireCornieresTotal),
    },
  };
}

// ── Calculateur métier Terrasse & Terrasse Mobile ─────────────────────────────

export type PhaseTerrasseTemps =
  | "terrassement_support"
  | "structure_plots_lambourdes"
  | "pose_platelage"
  | "finitions_rives";

export interface ResultatTempsPoseTerrasse {
  parPhase: Record<PhaseTerrasseTemps, number>;
  totalHeures: number;
  tempsPlanification: number;
  details: {
    surfaceNetteM2: number;
    presenceEscalier: boolean;
    gardeCorpsMl: number;
    terrasseMobileActive: boolean;
    motorisationActive: boolean;
  };
}

export interface OptionsCalculTempsTerrasse {
  cadences?: Partial<CadencesTempsPose>;
  coefPerteRendement?: number;
}

/**
 * Calcule les heures prévues de pose Terrasse & Terrasse Mobile ventilées sur les 4 phases
 * (`terrassement_support`, `structure_plots_lambourdes`, `pose_platelage`, `finitions_rives`)
 * à partir de `ResultatCalculTerrasse`.
 */
export function calculerTempsPoseTerrasse(
  resultat: ResultatCalculTerrasse,
  options: OptionsCalculTempsTerrasse = {},
): ResultatTempsPoseTerrasse {
  const cadences: CadencesTempsPose = { ...CADENCES_DEFAUT, ...options.cadences };
  const surfaceNette = Math.max(0, resultat.surfaceNetteM2 || 0);

  const hPrep = surfaceNette * cadences.terrasse_prep_geotextile_h_m2;
  const hStructure = surfaceNette * cadences.terrasse_structure_h_m2;
  const hPlatelage = surfaceNette * cadences.terrasse_platelage_h_m2;

  const presenceEscalier = Boolean(resultat.escalier?.present);
  const gardeCorpsMl = resultat.gardeCorps?.present
    ? Math.max(0, resultat.gardeCorps.longueurMl || 0)
    : 0;
  const terrasseMobileActive = Boolean(resultat.terrasseMobile?.active);
  const motorisationActive = Boolean(
    terrasseMobileActive && resultat.terrasseMobile?.motorisation?.active,
  );

  let hFinitions = 0;
  if (presenceEscalier) {
    hFinitions += cadences.terrasse_escalier_h_u;
  }
  if (gardeCorpsMl > 0) {
    hFinitions += gardeCorpsMl * cadences.terrasse_garde_corps_h_ml;
  }
  if (terrasseMobileActive) {
    hFinitions += cadences.terrasse_mobile_rails_chassis_h;
    if (motorisationActive) {
      hFinitions += cadences.terrasse_mobile_motorisation_h;
    }
  }

  const parPhase: Record<PhaseTerrasseTemps, number> = {
    terrassement_support: arrondirHeures(hPrep),
    structure_plots_lambourdes: arrondirHeures(hStructure),
    pose_platelage: arrondirHeures(hPlatelage),
    finitions_rives: arrondirHeures(hFinitions),
  };

  const totalHeures = arrondirHeures(
    parPhase.terrassement_support +
      parPhase.structure_plots_lambourdes +
      parPhase.pose_platelage +
      parPhase.finitions_rives,
  );
  const tempsPlanification = arrondirHeures(
    calculerTempsPlanification(totalHeures, options.coefPerteRendement ?? 1.8),
  );

  return {
    parPhase,
    totalHeures,
    tempsPlanification,
    details: {
      surfaceNetteM2: arrondirHeures(surfaceNette),
      presenceEscalier,
      gardeCorpsMl: arrondirHeures(gardeCorpsMl),
      terrasseMobileActive,
      motorisationActive,
    },
  };
}
