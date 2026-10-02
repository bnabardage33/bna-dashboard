import { redirect } from "next/navigation";

/**
 * `/boite-a-outils` — PHASE 2.
 *
 * Écran vide (« en cours de construction ») sans référence entrante. La
 * rubrique Boîte à outils existe et est entièrement fonctionnelle, mais
 * éclatée sur ses quatre pages réelles : `/terrain/metre-ia`,
 * `/terrain/notes`, `/terrain/fiche-technique` et `/terrain/outils`.
 *
 * On renvoie vers `/terrain/outils`, la page fourre-tout du groupe : c'est la
 * destination la plus neutre quand on arrive d'une adresse qui annonçait
 * « Boîte à outils » sans préciser laquelle des quatre on voulait.
 * Aucune des quatre entrées n'est perdue : le hamburger les expose toutes
 * sous « Boîte à outils », repliable sur place.
 */
export default function BoiteAOutilsLegacy() {
  redirect("/terrain/outils");
}
