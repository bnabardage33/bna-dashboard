// lib/meteoHoraire.ts
//
// LOGIQUE MÉTIER PURE DES DÉCISIONS MÉTÉO HORAIRES.
//
// ─── Pourquoi ce module existe ───────────────────────────────────────────────
//
// Le défaut corrigé par la refonte : `GET /api/meteo` déclenchait « Pose
// interdite » (rouge) à partir du CUMUL JOURNALIER de pluie (≥ 8 mm en ≥ 4 h
// sur 24 h), c'est-à-dire à partir d'une nuit de pluie qui n'interdit rien à
// une équipe posant de 7 h à 17 h. Le cumul journalier reste une information
// consultable ; ce n'est plus une décision.
//
// La décision se pose MAINTENANT sur les heures pendant lesquelles l'équipe
// POSE RÉELLEMENT, c'est-à-dire sur la fenêtre d'horaire déclarée pour le
// chantier. Ce module porte toute la logique qui dépend de cette fenêtre :
//
//   - lire l'horaire libre saisi sur le chantier (`chantiers.horaires`) ;
//   - ranger une heure de série dans « pendant la pose » / « hors pose » ;
//   - distinguer une heure ÉCOULÉE d'une heure À VENIR ;
//   - agréger SANS JAMAIS transformer une donnée manquante en 0.
//
// Il ne contient AUCUN seuil. Les seuils vivent dans `lib/meteoAlerte.ts`
// (`SEUILS_MATERIAUX`, `SEUILS_ACCES`) et sont importés par les fonctions qui
// en ont besoin. Aucun seuil n'est inventé ni abaissé ici.
//
// ─── Règles non négociables portées par ce module ───────────────────────────
//
//  1. UNE DONNÉE MANQUANTE N'EST PAS UNE DONNÉE NULLE. `null` signifie « la
//     source n'a rien renvoyé pour cette heure ». Une somme qui ne porte que
//     des `null` vaut `null`, pas 0. Un cumul de 0 mm se déduit d'heures
//     CONNUES toutes à 0 mm — jamais d'heures manquantes.
//
//  2. DES HORAIRES ABSENTS OU ILLISIBLES NE VEULENT PAS DIRE « PAS DE RISQUE ».
//     `lireHorairesPose` distingue explicitement `non_configuree` et
//     `illisible` : l'appelant doit afficher un état « non déterminé » plutôt
//     que de conclure à une journée verte.
//
//  3. LA BORNE PASSÉ / À VENIR SE CALCULE À L'AFFICHAGE. `GET /api/meteo` est
//     mis en cache 30 minutes (`revalidate: 1800`) : une heure rangée « à
//     venir » à la génération du cache peut être « écoulée » à l'affichage.
//     La route renvoie la référence temporelle de sa génération, et
//     `reclasserHeures` permet à chaque client de reclasser avec SA propre
//     heure. Ce module ne fait que fournir la règle ; il ne décide pas quand
//     l'appliquer.
//
// Ce module ne touche à AUCUN appel réseau, AUCUNE table, AUCUNE Edge Function.

import { heureVersMinutes } from "@/lib/dateParis";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Une heure de la série météo, dans sa forme minimale pour les agrégats. */
export interface HeureHoraires {
  /** Heure LOCALE `Europe/Paris` au format `HH:MM`. */
  heure: string;
  /** Précipitations en mm. `null` = donnée absente de la réponse source. */
  pluie: number | null;
  /** Vent moyen en km/h. `null` = donnée absente. */
  vent: number | null;
  /** Rafales en km/h. `null` = donnée absente. */
  rafales: number | null;
  /** Température en °C. `null` = donnée absente. */
  temp: number | null;
}

/** Heure déjà passée à l'instant de référence, ou heure à venir. */
export type StatutHeure = "ecoulee" | "avenir";

/**
 * Nature de la donnée horaire.
 *
 * `observee` / `prevision` ne sont affirmés QUE lorsque la source le permet :
 * la seule marque de fiabilité disponible est la référence temporelle
 * renvoyée par le fournisseur (`current.time` chez Open-Meteo,
 * `currentConditions.time` chez Visual Crossing). Sans elle, la nature est
 * `inconnue` — on ne devine pas si un relevé est mesuré ou prévu.
 */
export type NatureHeure = "observee" | "prevision" | "inconnue";

/** Fenêtre de pose, en minutes depuis minuit local. */
export interface FenetrePose {
  debutMinutes: number;
  finMinutes: number;
}

/**
 * Résultat de la lecture de `chantiers.horaires`.
 *
 * Trois états, jamais fusionnés : `non_configuree` (champ vide) et
 * `illisible` (champ rempli mais non exploitable) ne se corrigent pas au même
 * endroit. L'un se règle en saisissant les horaires, l'autre en corrigeant une
 * saisie aberrante.
 */
export type LectureHoraires =
  | { statut: "configuree"; fenetre: FenetrePose }
  | { statut: "non_configuree" }
  | { statut: "illisible"; brut: string };

/** Ce que la fenêtre de pose permet de calculer sur une série horaire. */
export interface SynthesePose {
  /** Fenêtre effectivement utilisée, ou `null` si elle n'a pas pu être lue. */
  fenetre: FenetrePose | null;
  /** Cumul de pluie PENDANT la pose, ou `null` si aucune heure n'est connue. */
  pluiePendantPose: number | null;
  /** Cumul de pluie HORS pose (avant/après, nuit), ou `null` si inconnu. */
  pluieHorsPose: number | null;
  /** Rafales maximales PENDANT la pose, ou `null` si inconnues. */
  rafalesPendantPose: number | null;
  /** Rafales maximales HORS pose, ou `null` si inconnues. */
  rafalesHorsPose: number | null;
  /** Température maximale PENDANT la pose, ou `null` si inconnue. */
  tempPendantPose: number | null;
  /** Cumul journalier (toutes heures connues), conservé comme information. */
  pluieJour: number | null;
  /** Heures de la fenêtre de pose réellement présentes dans la série. */
  heuresPoseConnues: number;
  /** Taille attendue de la fenêtre de pose, en heures. */
  heuresPoseAttendues: number;
  /** Heures de pose dont la pluie est connue (0 si toutes manquantes). */
  heuresPoseAvecPluie: number;
  /**
   * Heures de pose avec une pluie STRICTEMENT supérieure au seuil d'averse.
   *
   * C'est le compteur qui, associé au cumul, existait déjà dans l'ancienne
   * règle (« cumul ≥ 8 mm ET ≥ 4 h pluvieuses »). Il est conservé tel quel,
   * mais restreint aux heures de pose.
   */
  heuresPosePluvieuses: number;
}

// ─── Lecture des horaires de pose ────────────────────────────────────────────
//
// `chantiers.horaires` est un TEXTE LIBRE, saisi dans `components/PhotosNotes.tsx`
// sans aucun format imposé, et aucune règle métier n'a encore validé un format.
// La lecture est donc tolérante sur la FORME et STRICTE sur le FOND :
//
//   accepté   : "7h-17h", "07:00 - 17:00", "7h30 à 17h30", "07:30/16:30"
//   refusé    : "le matin", "selon météo", "7h", "7h-17h-19h", "13h-11h"
//
// Une saisie douteuse est REFUSÉE plutôt qu'approximée : « 7h-19h30 » n'est
// pas rattrapée en « 7h-19h ». Refuser produit un état explicite
// (« horaires illisibles ») ; rattraper silencieusement produirait une
// décision de pose sur des horaires que personne n'a validés.
const RE_HEURE = /(\d{1,2})\s*[:hH]\s*(\d{2})?/g;

/** Minutes depuis minuit d'une occurrence d'`RE_HEURE`, ou `null`. */
function occurrenceVersMinutes(match: RegExpExecArray): number | null {
  const heures = Number.parseInt(match[1], 10);
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (!Number.isFinite(heures) || !Number.isFinite(minutes)) return null;
  if (heures > 23 || minutes > 59) return null;
  return heures * 60 + minutes;
}

/**
 * Lit les horaires de pose saisis sur un chantier.
 *
 * AUCUN DÉFAUT : un champ vide renvoie `non_configuree`, jamais une fenêtre
 * supposée « 8h-18h ». C'est la règle « ne pas inventer d'horaires par défaut ».
 */
export function lireHorairesPose(brut: string | null | undefined): LectureHoraires {
  const texte = (brut ?? "").trim();
  if (!texte) return { statut: "non_configuree" };

  const matches = [...texte.matchAll(RE_HEURE)];
  if (matches.length !== 2) return { statut: "illisible", brut: texte };

  const debut = occurrenceVersMinutes(matches[0] as RegExpExecArray);
  const fin = occurrenceVersMinutes(matches[1] as RegExpExecArray);
  if (debut === null || fin === null) return { statut: "illisible", brut: texte };
  if (debut === fin) return { statut: "illisible", brut: texte };

  // Une fenêtre traversant minuit est acceptée (pose de nuit possible). En
  // revanche une fenêtre de plus de 12 h est refusée : une pose de 13 h n'est
  // pas une pose, c'est une saisie qu'il faut corriger.
  const duree = (fin - debut + 1440) % 1440;
  if (duree > 12 * 60) return { statut: "illisible", brut: texte };

  return { statut: "configuree", fenetre: { debutMinutes: debut, finMinutes: fin } };
}

/** Libellé court d'une fenêtre, pour l'affichage. */
export function libelleFenetre(fenetre: FenetrePose): string {
  const versTexte = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${versTexte(fenetre.debutMinutes)} – ${versTexte(fenetre.finMinutes)}`;
}

/**
 * Une heure locale (en minutes depuis minuit) est-elle dans la fenêtre ?
 *
 * Une fenêtre traversant minuit (« 22:00-02:00 ») est gérée explicitement :
 * l'heure est dans la fenêtre si elle est ≥ début OU ≤ fin.
 */
export function heureDansFenetre(heureMinutes: number, fenetre: FenetrePose): boolean {
  if (heureMinutes < 0) return false;
  if (fenetre.debutMinutes < fenetre.finMinutes) {
    return heureMinutes >= fenetre.debutMinutes && heureMinutes < fenetre.finMinutes;
  }
  return heureMinutes >= fenetre.debutMinutes || heureMinutes < fenetre.finMinutes;
}

/**
 * Heure locale (`HH:MM`) extraite d'un horodatage source.
 *
 * Les deux sources ne donnent pas la même forme : `"13:00"` dans les fixtures
 * et certains formats Visual Crossing, `"2026-10-20T13:00:00"` dans les
 * réponses complètes. Ancienne implémentation : `slice(0, 5)`, qui rendait
 * `"2026-"` sur un horodatage complet. Renvoie `""` si l'entrée n'est pas une
 * heure, pour que l'appelant voie la donnée manquante plutôt qu'un libellé
 * absurde.
 */
export function heureDe(iso: string): string {
  const brut = (iso ?? "").trim();
  if (!brut) return "";
  const t = brut.includes("T") ? brut.slice(11, 16) : brut.slice(0, 5);
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

// ─── Statut passé / à venir ──────────────────────────────────────────────────

/**
 * Range une heure de série selon qu'elle est passée ou à venir par rapport à
 * une référence en minutes depuis minuit.
 *
 * L'heure ÉGALE à la référence est rangée `avenir` : à 13:00 pile, l'heure
 * « 13:00 » n'est pas terminée.
 */
export function statutHeure(heure: string, referenceMinutes: number): StatutHeure {
  const minutes = heureVersMinutes(heure);
  if (minutes < 0) return "avenir";
  return minutes >= referenceMinutes ? "avenir" : "ecoulee";
}

/**
 * Nature d'une heure, à partir de la référence temporelle de la SOURCE.
 *
 * Sans référence fiable de la source, la nature est `inconnue` : on ne
 * transforme pas une prévision en relevé observé parce que l'heure est passée
 * sur notre horloge.
 */
export function natureHeure(
  heure: string,
  referenceSource: string | null | undefined,
): NatureHeure {
  if (!referenceSource) return "inconnue";
  // La référence est un horodatage local (`2026-10-20T13:00`) ou, plus rarement,
  // une heure seule (`13:00`). On extrait la composante horaire quelle que soit
  // la forme, plutôt que de supposer une position de champ.
  const extrait = /(\d{1,2}):(\d{2})/.exec(referenceSource);
  const h = heureVersMinutes(heure);
  if (!extrait || h < 0) return "inconnue";
  const heures = Number.parseInt(extrait[1], 10);
  const minutes = Number.parseInt(extrait[2], 10);
  if (heures > 23 || minutes > 59) return "inconnue";
  const ref = heures * 60 + minutes;
  // La source considère son relevé courant comme le dernier observé : les
  // heures antérieures sont observées, les autres prévues.
  return h <= ref ? "observee" : "prevision";
}

/** Reclasse chaque heure avec la référence de l'appelant (cache ou affichage). */
export function reclasserHeures<T extends { heure: string; statut?: StatutHeure }>(
  heures: T[],
  referenceMinutes: number,
): T[] {
  return heures.map((h) => ({ ...h, statut: statutHeure(h.heure, referenceMinutes) }));
}

// ─── Agrégats null-safe ──────────────────────────────────────────────────────
//
// Toutes les fonctions ci-dessous renvoient `null` quand AUCUNE valeur n'est
// connue. `null` se propage : il ne devient jamais 0, et surtout il n'est
// jamais interprété comme « ça ne pleut pas ».

function valeursConnu<V extends number>(
  heures: HeureHoraires[],
  lire: (h: HeureHoraires) => V | null,
  filtre?: (h: HeureHoraires) => boolean,
): number[] {
  const out: number[] = [];
  for (const h of heures) {
    if (filtre && !filtre(h)) continue;
    const v = lire(h);
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Cumul sur les heures connues répondant au filtre. `null` si rien de connu. */
export function cumul(
  heures: HeureHoraires[],
  lire: (h: HeureHoraires) => number | null,
  filtre?: (h: HeureHoraires) => boolean,
): number | null {
  const vals = valeursConnu(heures, lire, filtre);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((s, v) => s + v, 0) * 10) / 10;
}

/** Maximum sur les heures connues. `null` si rien de connu. */
export function maximum(
  heures: HeureHoraires[],
  lire: (h: HeureHoraires) => number | null,
  filtre?: (h: HeureHoraires) => boolean,
): number | null {
  const vals = valeursConnu(heures, lire, filtre);
  if (vals.length === 0) return null;
  return Math.round(Math.max(...vals) * 10) / 10;
}

/** Minimum sur les heures connues. `null` si rien de connu. */
export function minimum(
  heures: HeureHoraires[],
  lire: (h: HeureHoraires) => number | null,
  filtre?: (h: HeureHoraires) => boolean,
): number | null {
  const vals = valeursConnu(heures, lire, filtre);
  if (vals.length === 0) return null;
  return Math.round(Math.min(...vals) * 10) / 10;
}

// ─── Synthèse de la fenêtre de pose ──────────────────────────────────────────

/**
 * Découpe une série horaire entre heures de pose et heures hors pose.
 *
 * Les heures MANQUANTES de la série ne sont pas créées : la série livrée par
 * la source est ce qu'elle est. `heuresPoseAttendues` indique la taille de la
 * fenêtre pour que l'appelant puisse voir qu'une heure a disparu de la
 * réponse — c'est le signal qui déclenche « données manquantes ».
 */
/**
 * Seuil d'heure « pluvieuse », repris de l'ancienne règle de la route
 * (`h.pluie > 0.2`). Aucun seuil n'est redéfini ici : c'est la même valeur,
 * au même endroit du calcul, restreinte aux heures de pose.
 */
export const SEUIL_HEURE_PLUIE_MM = 0.2;

export function synthetiserPose(
  heures: HeureHoraires[],
  lecture: LectureHoraires,
): SynthesePose {
  const dansLaPose = (h: HeureHoraires) =>
    lecture.statut === "configuree" &&
    heureDansFenetre(heureVersMinutes(h.heure), lecture.fenetre);

  const fenetre = lecture.statut === "configuree" ? lecture.fenetre : null;
  const heuresPoseAttendues =
    fenetre === null
      ? 0
      : Math.round(((fenetre.finMinutes - fenetre.debutMinutes + 1440) % 1440) / 60);

  const heuresPoseConnues = fenetre === null ? 0 : heures.filter(dansLaPose).length;
  const heuresPoseAvecPluie =
    fenetre === null ? 0 : valeursConnu(heures, (h) => h.pluie, dansLaPose).length;
  const heuresPosePluvieuses =
    fenetre === null
      ? 0
      : valeursConnu(heures, (h) => h.pluie, dansLaPose).filter(
          (v) => v > SEUIL_HEURE_PLUIE_MM,
        ).length;

  return {
    fenetre,
    pluiePendantPose: fenetre === null ? null : cumul(heures, (h) => h.pluie, dansLaPose),
    pluieHorsPose: fenetre === null ? null : cumul(heures, (h) => h.pluie, (h) => !dansLaPose(h)),
    rafalesPendantPose: fenetre === null ? null : maximum(heures, (h) => h.rafales, dansLaPose),
    rafalesHorsPose: fenetre === null ? null : maximum(heures, (h) => h.rafales, (h) => !dansLaPose(h)),
    tempPendantPose: fenetre === null ? null : maximum(heures, (h) => h.temp, dansLaPose),
    pluieJour: cumul(heures, (h) => h.pluie),
    heuresPoseConnues,
    heuresPoseAttendues,
    heuresPoseAvecPluie,
    heuresPosePluvieuses,
  };
}

/**
 * Une fenêtre de pose est-elle ÉVALUABLE sur cette série ?
 *
 * Deux conditions, distinctes pour être diagnostiquables :
 *   - la fenêtre doit être lue (sinon : horaires non configurés / illisibles) ;
 *   - la série doit contenir au moins une heure de cette fenêtre (sinon :
 *     données manquantes — on ne conclut pas à partir d'une fenêtre vide).
 */
export function fenetreEvaluable(synthese: SynthesePose): boolean {
  return (
    synthese.fenetre !== null &&
    synthese.heuresPoseConnues > 0 &&
    synthese.heuresPoseAvecPluie > 0
  );
}

// ─── Avis matériaux (distincts de la décision de pose) ───────────────────────
//
// Ces avis ne changent le NIVEAU d'aucune alerte. Ils sont affichés à côté, et
// chacun est formulé comme une VÉRIFICATION À FAIRE, jamais comme un constat :
// « il a plu » ne prouve pas que le support est humide, ça impose de regarder.

/**
 * Seuil de déclenchement de l'avis « pluie hors pose ».
 *
 * Il n'est PAS inventé : c'est la valeur de `PLUIE_AVERSE.pluie` du barème
 * existant de `lib/meteoAlerte.ts` (5 mm), qui sert déjà à qualifier une
 * averse. Le test `__tests__/metre/meteo-horaire-seuils.test.ts` verrouille
 * cette parité, pour que les deux constantes ne puissent pas dériver.
 */
export const SEUIL_PLUIE_AVIS_MM = 5;

export interface ContexteAvis {
  /** Série horaire complète, pour le découpage nocturne. */
  heures: HeureHoraires[];
  synthese: SynthesePose;
  /** Seuil de rafale propre au chantier (matériau × accès), en km/h. */
  seuilRafaleChantier: number | null;
}

/** Une heure est « nocturne » si elle commence à partir de 20 h ou avant 6 h. */
function estNocturne(heure: string): boolean {
  const h = heureVersMinutes(heure);
  if (h < 0) return false;
  return h >= 20 * 60 || h < 6 * 60;
}

/**
 * Avis de protection des matériaux et des fournitures.
 *
 * Seuls des SEUILS EXISTANTS servent de déclencheurs (voir le détail de chaque
 * avis) : aucun seuil n'est inventé pour produire un nouvel avertissement.
 *
 * Aucun avis ne modifie le NIVEAU de pose : ils sont affichés à côté, et
 * chacun est formulé comme une VÉRIFICATION À FAIRE, jamais comme un constat.
 */
export function evaluerAvisMateriaux(ctx: ContexteAvis): string[] {
  const avis: string[] = [];
  const { synthese } = ctx;

  // 1. Pluie HORS pose la NUIT : les isolants et les matériaux restent sur le
  //    chantier quand les équipes sont parties. Seuil réutilisé :
  //    `PLUIE_AVERSE.pluie` (5 mm) du barème existant de `lib/meteoAlerte.ts`.
  const fenetre = synthese.fenetre;
  if (fenetre !== null) {
    const dansLaPose = (h: HeureHoraires) =>
      heureDansFenetre(heureVersMinutes(h.heure), fenetre);
    const pluieNuitHorsPose = cumul(
      ctx.heures,
      (h) => h.pluie,
      (h) => !dansLaPose(h) && estNocturne(h.heure),
    );
    if (typeof pluieNuitHorsPose === "number" && pluieNuitHorsPose >= SEUIL_PLUIE_AVIS_MM) {
      avis.push(
        `Fortes pluies nocturnes prévues (${pluieNuitHorsPose} mm la nuit, en dehors des horaires de pose) — vérifier la protection des isolants et des matériaux stockés.`,
      );
    }
    const pluieJourHorsPose = cumul(
      ctx.heures,
      (h) => h.pluie,
      (h) => !dansLaPose(h) && !estNocturne(h.heure),
    );
    if (
      typeof pluieJourHorsPose === "number" &&
      pluieJourHorsPose >= SEUIL_PLUIE_AVIS_MM &&
      !avis.some((a) => a.startsWith("Fortes pluies nocturnes"))
    ) {
      avis.push(
        `Pluie prévue en dehors des horaires de pose (${pluieJourHorsPose} mm) — protéger les fournitures et les matériaux stockés.`,
      );
    }
  }

  // 2. Rafales HORS pose au-dessus du seuil DU CHANTIER : après le départ des
  //    équipes, il faut sécuriser les fournitures. Seuil réutilisé : celui déjà
  //    appliqué à la pose pour ce matériau × accès ; il n'est pas relevé pour
  //    l'avis.
  const rafalesHorsPose = synthese.rafalesHorsPose;
  if (
    typeof ctx.seuilRafaleChantier === "number" &&
    typeof rafalesHorsPose === "number" &&
    rafalesHorsPose >= ctx.seuilRafaleChantier
  ) {
    avis.push(
      `Rafales prévues en dehors des horaires de pose (${rafalesHorsPose} km/h) — sécuriser les fournitures et le chantier.`,
    );
  }

  // 3. Pluie PENDANT la pose : elle indique qu'un support a pu être mouillé.
  //    AUCUNE conclusion automatique sur l'humidité du support : l'avis impose
  //    un CONSTAT SUR LE TERRAIN, qui est la seule façon d'établir l'état du
  //    support.
  const pluiePose = synthese.pluiePendantPose;
  if (typeof pluiePose === "number" && pluiePose > 0) {
    avis.push(
      `Pluie mesurée ou prévue pendant les horaires de pose (${pluiePose} mm) — vérifier l'état du support avant fermeture de la façade. L'humidité du support doit être constatée sur le terrain : rien n'est conclu automatiquement.`,
    );
  }

  return avis;
}
