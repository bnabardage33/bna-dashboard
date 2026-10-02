import { redirect } from "next/navigation";

/**
 * `/bureau-etudes` — PHASE 2.
 *
 * Cet écran ne montrait que « Cette section est en cours de construction » et
 * n'avait AUCUNE référence entrante : le Drawer pointait vers `/bureau`, jamais
 * vers ici. Il n'était atteignable qu'en tapant l'URL.
 *
 * La rubrique correspondante existe désormais dans le hamburger, sous
 * « Études / Commercial ». Cette page ne fait donc plus qu'y renvoyer : garder
 * l'écran vide aurait laissé une adresse qui affiche un mensonge, alors que la
 * destination réelle est une seule ligne plus bas dans la liste.
 *
 * La redirection est posée ICI et dans `next.config.ts`. La double garantie
 * n'est pas de la redondance : `redirect()` sert le cas du rendu serveur de
 * cette page, `next.config.ts` sert le cas où la requête ne l'atteint jamais.
 */
export default function BureauEtudesLegacy() {
  redirect("/bureau/clients");
}