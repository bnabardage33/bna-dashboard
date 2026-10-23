// lib/intemperiesSeuils.ts
//
// Seuils de la VEILLE intempéries (`/api/meteo/intemperies`), au même endroit
// pour la route et pour l'affichage `/bureau/meteo`.
//
// ─── Pourquoi ce module ──────────────────────────────────────────────────────
//
// Le sous-titre de la page veille annonçait « Pluie > 10mm · Vent > 50 km/h »
// alors que la route applique 5 mm et un seuil de vent calculé matériau ×
// accès. Corriger le texte suffisait pour une fois, mais un nombre recopié
// dans deux fichiers dérive : ces constantes ne vivent donc qu'ICI, importées
// par la route et par la page.
//
// Les VALEURS ne changent pas (audit : seuils métier inchangés) — seul leur
// emplacement bouge. Le seuil de vent, lui, reste calculé dans la route à
// partir du barème partagé `lib/meteoAlerte.ts` : la page n'en affiche que
// la PLAGE réelle, dérivée des mêmes tables, sans inventer de chiffre.

/** Cumul de pluie journalier (mm) qui déclenche l'intempérie quand la date de la pluie est inconnue (horaires illisibles). */
export const SEUIL_PLUIE_MM = 5;

/** En dessous de cette température (°C), le gel devient une raison d'intempérie. */
export const SEUIL_GEL_C = 0;
