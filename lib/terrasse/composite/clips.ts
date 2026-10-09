// Calcul précis des clips invisibles et visserie pour platelage composite
// Implémente les prescriptions DTA GS 2.1 (clips de départ, courants, aboutages doubles, fin)

import { ZoneEnvironnement } from "../types";
import { QuantitatifClipsComposite, SpecGammeComposite } from "./types";

/**
 * Calcule le quantitatif exact des clips de fixation invisible pour terrasse composite.
 *
 * @param nbRangeesLames Nombre de rangées de lames sur la largeur
 * @param nbLambourdes Nombre de lignes de lambourdes sur la longueur
 * @param nbLignesAboutage Nombre de lignes d'aboutage transversal
 * @param gamme Gamme composite
 * @param zone Zone environnementale
 */
export function calculerClipsComposite(
  nbRangeesLames: number,
  nbLambourdes: number,
  nbLignesAboutage: number,
  gamme: SpecGammeComposite,
  zone: ZoneEnvironnement = "normal"
): QuantitatifClipsComposite {
  // 1 clip de départ par lambourde au premier rang
  const nbClipsDepart = nbLambourdes;

  // Clips intermédiaires : (nbRangees - 1) * nbLambourdes
  const nbClipsCourants = Math.max(0, (nbRangeesLames - 1) * nbLambourdes);

  // Aboutages : en DTA GS 2.1, double lambourde obligatoire.
  // Chaque bout de lame reçoit son propre clip sur sa lambourde dédiée.
  // 2 clips par croisement d'aboutage
  const nbClipsAboutage = nbLignesAboutage > 0
    ? nbLignesAboutage * nbLambourdes * 2
    : 0;

  // Clips de fin de terrasse (dernier rang)
  const nbClipsFin = nbLambourdes;

  const nbTotalClips = nbClipsDepart + nbClipsCourants + nbClipsAboutage + nbClipsFin;

  // Conditionnement par boîte de 100 clips (standard fabricant)
  const conditionnementBoite = 100;
  const nbBoitesClips = Math.ceil(nbTotalClips / conditionnementBoite);

  const gradeInox = zone === "piscine" || zone === "littoral" ? "A4" : "A2";

  return {
    nbClipsDepart,
    nbClipsCourants,
    nbClipsAboutage,
    nbClipsFin,
    nbTotalClips,
    nbBoitesClips,
    conditionnementBoite,
    gradeInox,
    visFourniesAvecClips: true,
  };
}
