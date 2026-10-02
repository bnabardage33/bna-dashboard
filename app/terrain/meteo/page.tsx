import { redirect } from "next/navigation";

/**
 * `/terrain/meteo` — PHASE 2.
 *
 * Le bloc « Météo + impact météo sur les chantiers » (`ChantiersMeteoCards`)
 * est migré vers l'Accueil authentifié. Parallèlement, les fonctionnalités
 * météo (recherche par ville, prévisions) et la logique « Intempéries /
 * notification client » de `/bureau/meteo` sont maintenues et la recherche
 * existante sur `/terrain/meteo` est intégrable à `/bureau/meteo` sans
 * suppression de fonctionnalités.
 *
 * Conformément aux arbitrages : UNE SEULE entrée météo dans le Drawer
 * (« Chantiers → Météo & intempéries » pointant sur `/bureau/meteo`). La page
 * `/terrain/meteo` devient donc redondante et est redirigée vers
 * `/bureau/meteo`.
 */
export default function TerrainMeteoLegacy() {
  redirect("/bureau/meteo");
}
