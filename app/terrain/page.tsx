import { redirect } from "next/navigation";

/**
 * `/terrain` — PHASE 2.
 *
 * L'ancien cockpit Terrain (« TerrainNav ») est supprimé. L'index du groupe
 * redirigeait vers `/terrain/meteo` (l'entrée « Accueil » de ce sous-menu
 * ouvrait la météo). Après fusion de l'impact météo vers l'accueil et la
 * normalisation vers UNE entrée météo (`/bureau/meteo`), la destination la
 * plus logique est la liste des chantiers, qui correspond à
 * « Chantiers → Liste des chantiers » dans le Drawer.
 */
export default function TerrainIndex() {
  redirect("/terrain/chantier");
}
