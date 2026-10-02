import { redirect } from "next/navigation";

/**
 * `/bureau` — PHASE 2.
 *
 * Ancien cockpit « Bureau & Administratif » : 4 tuiles de compteurs, le
 * « Détecteur d'Anomalies BNA » (`ChantierHealthCard`) et 8 tuiles
 * « Accès rapides ».
 *
 * Ce qui a été conservé, et OÙ :
 *   * les 4 compteurs → bloc « Chiffres clés » de l'Accueil (`app/page.tsx`) ;
 *   * les 8 « Accès rapides » → SUPPRIMÉS. Chacune des huit destinations est
 *     déjà une entrée du hamburger, y compris « Catalogue », « Photos » et
 *     « Fournisseurs ». Les garder aurait réintroduit, sous forme de grille,
 *     exactement la navigation parallèle que la refonte supprime ;
 *   * `ChantierHealthCard` → NON remonté. Le composant prenait sa marge
 *     actuelle et sa marge prévue de deux constantes en dur (`margeActuellePct:
 *     20, margePrevuePct: 20`, commentaires « Default mock for now »).
 *     Le recycler sur l'accueil aurait donc affiché, sous le titre
 *     « Chiffres clés », des marges inventées à 20 %. Le cahier des charges
 *     interdit explicitement un cockpit rempli de faux chiffres : tant que
 *     ces deux valeurs ne sont pas calculées depuis des données réelles, le
 *     bloc n'est pas remonté. Le composant lui-même est conservé
 *     (`components/ChantierHealthCard.tsx`) : rien n'est perdu, et il
 *     rebranchera tel quel le jour où la marge sera calculée.
 *
 * Le concept « Bureau » n'est plus une rubrique de navigation. Cette adresse
 * reste valable et mène désormais à l'accueil, qui est le cockpit unique.
 */
export default function BureauLegacy() {
  redirect("/");
}
