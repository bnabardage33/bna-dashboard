// lib/intemperiesSemaine.ts
//
// Agrégation PURE de la vigilance officielle d'une semaine de rapports
// d'intempéries, pour le résumé hebdomadaire client.
//
// ─── Le défaut corrigé ────────────────────────────────────────────────────────
//
// Le résumé hebdomadaire fabriquait un « vert » :
//   • la plus forte vigilance démarrait à "vert" ;
//   • un jour sans rapport (`vigilance_officielle` absente) valait "vert".
//
// Résultat : une semaine où TOUS les rapports portaient la sentinelle
// « indisponible » (API Météo-France muette) — ou une semaine sans aucun
// rapport — s'affichait comme une « vigilance verte confirmée ». Une valeur
// inattendue (ex. « violet ») était, elle aussi, rabattue sur "vert" (ordre 0).
//
// Ce module ne connaît NI Supabase NI Next : il reçoit des lignes déjà lues et
// renvoie un résumé honnête. Ne jamais y réintroduire de couleur par défaut.

import type { JourIntemperie } from "@/lib/rapports-client";
import { dateParis } from "@/lib/dateParis";
import { ORDRE_COULEUR, type CouleurVigilance } from "./vigilanceMeteoFrance";

/** Sentinelle explicite : la vigilance officielle n'a pas pu être obtenue. */
export const VIGILANCE_INDISPONIBLE = "indisponible";

/**
 * Niveau de vigilance d'une semaine. Contrairement à `CouleurVigilance`, il
 * distingue « aucune vigilance officielle lisible » d'un « vert confirmé ».
 */
export type VigilanceSemaine = CouleurVigilance | typeof VIGILANCE_INDISPONIBLE;

/** Ligne minimale nécessaire à l'agrégation (sous-ensemble de la table). */
export type RapportIntemperieSemaine = {
  cree_le: string;
  jour_arrete: boolean;
  motif: string;
  vigilance_officielle: string;
};

export type IntemperiesSemaine = {
  joursArretTotal: number;
  details: JourIntemperie[];
  vigilanceMax: VigilanceSemaine;
};

/**
 * `true` seulement pour un niveau officiel reconnu (vert/jaune/orange/rouge).
 * Toute autre valeur — dont la sentinelle « indisponible » — est rejetée.
 */
export function estCouleurVigilance(
  valeur: unknown
): valeur is CouleurVigilance {
  return (
    typeof valeur === "string" &&
    Object.prototype.hasOwnProperty.call(ORDRE_COULEUR, valeur)
  );
}

/**
 * Niveau officiel exploitable, ou « indisponible » — jamais un « vert » inventé.
 */
export function normaliserVigilance(valeur: unknown): VigilanceSemaine {
  return estCouleurVigilance(valeur) ? valeur : VIGILANCE_INDISPONIBLE;
}

/**
 * Plus forte couleur CONFIRMÉE de la liste.
 *
 * Renvoie « indisponible » si aucune valeur n'est un niveau officiel reconnu :
 * l'appelant ne peut donc pas confondre « tout est vert » avec « rien de lisible ».
 */
export function vigilanceMaxDe(valeurs: readonly unknown[]): VigilanceSemaine {
  let max: VigilanceSemaine = VIGILANCE_INDISPONIBLE;
  let rangMax = -1;

  for (const valeur of valeurs) {
    if (estCouleurVigilance(valeur) && ORDRE_COULEUR[valeur] > rangMax) {
      rangMax = ORDRE_COULEUR[valeur];
      max = valeur;
    }
  }

  return max;
}

/**
 * Résume une semaine de rapports : un jour par date (le plus récent prime),
 * jours d'arrêt comptés, et la plus forte vigilance CONFIRMÉE.
 *
 * Un jour présent dans `details` porte donc toujours une vraie ligne de rapport
 * (les clés viennent de la liste) ; la normalisation ne sert qu'aux valeurs
 * inattendues, jamais de couleur fabriquée.
 */
export function agregerIntemperiesSemaine(
  rapports: readonly RapportIntemperieSemaine[],
  lundiISO: string,
  dimancheISO: string
): IntemperiesSemaine {
  const parJour = new Map<string, RapportIntemperieSemaine>();

  for (const rapport of rapports) {
    const jour = dateParis(new Date(rapport.cree_le));
    if (jour < lundiISO || jour > dimancheISO) continue;

    const existant = parJour.get(jour);
    if (!existant || rapport.cree_le > existant.cree_le) {
      parJour.set(jour, rapport);
    }
  }

  const joursTries = [...parJour.keys()].sort();

  let joursArretTotal = 0;
  const details: JourIntemperie[] = joursTries.map((jour) => {
    const ligne = parJour.get(jour);

    if (ligne?.jour_arrete) joursArretTotal += 1;

    return {
      date: jour,
      motif: ligne?.motif ?? "Aucun rapport intempéries enregistré.",
      jour_arrete: ligne?.jour_arrete ?? false,
      vigilance: normaliserVigilance(ligne?.vigilance_officielle),
    };
  });

  return {
    joursArretTotal,
    details,
    vigilanceMax: vigilanceMaxDe(details.map((d) => d.vigilance)),
  };
}
