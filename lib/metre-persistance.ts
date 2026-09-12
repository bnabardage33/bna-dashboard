// lib/metre-persistance.ts
// Couche PURE de persistance du métré technique.
//
// Elle ne contient AUCUN moteur : elle décide uniquement SI un résultat
// validé doit (re)être écrit sur `chantier_zones.resultats_techniques`,
// à partir des entrées réellement utilisées par les calculs.
//
//   * Ne recalcule rien : les résultats proviennent des moteurs
//     (calculerZone / calculerPose / calculerCalepinage), jamais d'ici.
//   * Ne fabrique aucune quantité.
//   * Les moteurs restent la source du calcul, cette couche la source
//     de la PERSISTANCE.

import type { EntreesMetre, ResultatMetre } from "@/lib/metre-serialization";
import { lesEntreesOntChangent } from "@/lib/metre-serialization";

/**
 * Décide si une écriture Supabase sur `resultats_techniques` est nécessaire.
 *
 *   - `stocker === null` (zone historique jamais calculée, ou colonne NULL)
 *     → PREMIER calcul constaté : on persiste (aucun résultat en base).
 *   - `stocker` mal formé sans `entrees` exploitable → on repersiste.
 *   - les entrées actuelles sont IDENTIQUES aux entrées déjà stockées
 *     → AUCUNE écriture (le résultat en base reste la source de vérité).
 *   - les entrées ont changé → recalcul nécessaire → nouvelle persistance.
 *
 * `resultats_techniques` reste NULL tant que cette fonction ne renvoie pas
 * `true` : les zones/chantiers historiques ne sont jamais cassés.
 */
export function persistanceNecessaire(
  stocker: ResultatMetre | null | undefined,
  entreesActuelles: EntreesMetre,
): boolean {
  if (!stocker || !stocker.entrees) return true;
  return lesEntreesOntChangent(stocker.entrees, entreesActuelles);
}