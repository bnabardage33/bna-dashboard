import { dateParis, heureParisEnMinutes } from "@/lib/dateParis";
import { fetchDonneesOpenMeteo } from "@/lib/meteoOpenMeteo";
import {
  heureDe,
  natureHeure,
  statutHeure,
  type LectureHoraires,
  type NatureHeure,
  type SynthesePose,
  type StatutHeure,
} from "@/lib/meteoHoraire";

// ─── Types de la prévision ───────────────────────────────────────────────────
//
// RÈGLE DE TOUT LE FICHIER : une valeur `null` signifie « la source n'a rien
// renvoyé ». Elle n'est JAMAIS remplacée par 0, ni dans ce fichier, ni en
// aval. C'est la correction du second défaut d'audit : `?? 0` transformait une
// heure sans relevé en « 0 mm · 0 km/h », c'est-à-dire en garantie de temps sec
// qui n'a jamais existé.

/**
 * Agrégat d'une période de la journée (matin / après-midi).
 *
 * `null` dans un champ = aucune heure CONNUE dans la période pour cette
 * grandeur. Afficher `0` à la place laisserait croire à un vent nul ou à un
 * ciel sec.
 */
export type PeriodeMeteo = {
  temp: number | null;
  vent: number | null;
  rafales: number | null;
};

/**
 * Une heure de la série.
 *
 * `statut` distingue une heure déjà écoulée d'une heure à venir ;
 * `nature` dit si la donnée est observée, prévue, ou si la source ne permet
 * pas de trancher (`inconnue`). Voir `lib/meteoHoraire.ts`.
 */
export type HeureMeteo = {
  heure: string;
  temp: number | null;
  vent: number | null;
  rafales: number | null;
  pluie: number | null;
  statut: StatutHeure;
  nature: NatureHeure;
};

/**
 * Décision de pose, évaluée sur les HORAIRES DE POSE du chantier.
 *
 * `statut: "non_determine"` est un état À AFFICHER, pas une erreur : il couvre
 * les horaires absents, les horaires illisibles, et les heures de pose sans
 * aucune donnée. Il ne se traduit jamais par un vert.
 */
export type DecisionPose = {
  statut: "evaluee" | "non_determine";
  /** Niveau de pose, présent seulement si `statut === "evaluee"`. */
  niveau: "vert" | "jaune" | "orange" | "rouge" | null;
  motif: string;
  /** Fenêtre de pose effectivement utilisée, ou `null`. */
  fenetre: { debut: string; fin: string } | null;
  /** État brut de la lecture de `chantiers.horaires`. */
  horairesStatut: LectureHoraires["statut"];
  /** Texte brut des horaires, conservé pour diagnostic. */
  horairesBrut: string | null;
  /** Découpage pose / hors pose de la journée, pour l'affichage. */
  synthese: SynthesePose;
  /** Avertissements matériaux, distincts du niveau de pose. */
  avertissements: string[];
};

export type AlerteMeteo = { niveau: "vert" | "jaune" | "orange" | "rouge"; motif: string };
export type JourPrevu = {
  date: string;
  tempMax: number;
  tempMin: number;
  icon: string;
  conditions: string;
  /**
   * Cumul de précipitations de la journée, en mm, tel que fourni par la source
   * (`precipitation_sum` chez Open-Meteo, `precip` journalier chez
   * VisualCrossing). C'est déjà un cumul : il ne doit jamais être additionné.
   * Absent si la source ne le fournit pas.
   */
  cumulPluie?: number;
};
// Origine de la prévision. `icon` n'a pas le même sens selon la source : un
// NOM d'icône chez VisualCrossing, un CODE WMO chez Open-Meteo. Voir
// `lib/meteoOpenMeteo.ts` pour pourquoi la route accepte les deux.
export type SourceMeteo = "visualcrossing" | "open-meteo";

export type JourMeteo = {
  matin: PeriodeMeteo;
  apresMidi: PeriodeMeteo;
  heures: HeureMeteo[];
  alerte: AlerteMeteo;
  icon: string;
  conditions: string;
  source?: SourceMeteo;
  tempActuelle: number;
  tempMaxJour: number;
  tempMinJour: number;
  /** Cumul de pluie de la journée, en mm. Information consultable, pas une décision. */
  cumulPluie?: number;
  /**
   * Heure LOCALE (Europe/Paris) à laquelle cette réponse a été produite.
   *
   * La réponse est mise en cache 30 minutes : c'est cette référence, et non
   * l'heure du client, qui justifie le `statut` des heures à la génération.
   * Un affichage doit reclasser les heures avec sa propre heure courante —
   * `reclasserHeures` de `lib/meteoHoraire.ts`.
   */
  genereLe: string;
  /**
   * Référence temporelle fournie PAR LA SOURCE (`current.time` chez
   * Open-Meteo, `currentConditions.datetime` chez Visual Crossing). C'est elle
   * qui autorise à dire « observé » ou « prévu ». Absente → toutes les heures
   * sont de nature `inconnue`.
   */
  referenceSource?: string;
  /** Décision de pose sur les horaires du chantier, si ils ont été fournis. */
  pose?: DecisionPose;
  prochainsJours: JourPrevu[];
};

/**
 * Prévision pour une adresse.
 *
 * `options.horaires` transporte les horaires de pose DU CHANTIER concerné
 * (`chantiers.horaires`, texte libre). Sans cette information, la route ne
 * peut pas décider d'une pose et le renvoie explicitement via
 * `pose.statut === "non_determine"` — jamais un vert silencieux.
 */
export async function fetchMeteo(
  location: string,
  options?: { horaires?: string | null; materiau?: string; acces?: string },
): Promise<JourMeteo> {
  const params = new URLSearchParams({ location });
  if (options?.horaires) params.set("horaires", options.horaires);
  if (options?.materiau) params.set("materiau", options.materiau);
  if (options?.acces) params.set("acces", options.acces);

  const res = await fetch(`/api/meteo?${params.toString()}`);
  if (!res.ok) {
    // La route porte une explication utile — notamment « localisation non
    // validée » avec le code postal attendu. On la propage au lieu de la
    // remplacer par un message générique qui masquerait la cause.
    let message = "Erreur météo";
    try {
      const corps = (await res.json()) as { error?: string };
      if (corps?.error) message = corps.error;
    } catch {
      // Corps non JSON : on garde le message générique.
    }
    throw new Error(message);
  }
  return res.json();
}

// ─── Adaptateurs de lecture ──────────────────────────────────────────────────
//
// Ces helpers servent les ÉCRANS (cartes, fiche chantier, accueil). Ils
// n'appliquent aucun seuil : ils traduisent `null` en tiret, jamais en 0.

/** `null` → `null`, sinon `Math.max` des valeurs connues. */
export function maxConnu(...valeurs: (number | null)[]): number | null {
  const connues = valeurs.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (connues.length === 0) return null;
  return Math.round(Math.max(...connues) * 10) / 10;
}

/** `null` → `null`, sinon la somme des valeurs connues. */
export function sommeConnue(valeurs: (number | null)[]): number | null {
  const connues = valeurs.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (connues.length === 0) return null;
  return Math.round(connues.reduce((s, v) => s + v, 0) * 10) / 10;
}

/**
 * Reclasse les heures avec l'heure COURANTE du client.
 *
 * À appeler à l'affichage, et non à l'import : la réponse est cachée 30
 * minutes, le `statut` livré par la route décrit la génération du cache.
 */
export function heuresAJour(heures: HeureMeteo[]): HeureMeteo[] {
  const ref = heureParisEnMinutes();
  if (ref < 0) return heures;
  return heures.map((h) => ({ ...h, statut: statutHeure(h.heure, ref) }));
}

/** Nature des heures, recalculée à partir d'une référence source. */
export function natureDesHeures(heures: HeureMeteo[], referenceSource?: string): HeureMeteo[] {
  return heures.map((h) => ({ ...h, nature: natureHeure(h.heure, referenceSource) }));
}

/** Expose `dateParis` aux écrans qui doivent dater un affichage. */
export { dateParis, heureDe };
