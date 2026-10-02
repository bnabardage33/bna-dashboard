import { redirect } from "next/navigation";

/**
 * `/chantiers` — PHASE 2.
 *
 * Cet écran ne montrait que « Cette section est en cours de construction », et
 * n'avait AUCUNE référence entrante dans le code : aucun lien, aucun test, et
 * le Drawer pointait vers `/terrain/chantier`, jamais vers ici. Il n'était
 * atteignable qu'en tapant l'URL à la main.
 *
 * Il fait doublon avec la vraie liste des chantiers, qui n'a jamais été une
 * page mais la route `/terrain/chantier` (segment dynamique pour la fiche).
 * La redirection est donc l'écran honnête : la fonction existe, à une adresse
 * seulement.
 */
export default function ChantiersLegacy() {
  redirect("/terrain/chantier");
}
