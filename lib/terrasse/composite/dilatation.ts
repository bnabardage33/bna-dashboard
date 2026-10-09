// Moteur de calcul de dilatation thermique et de dimensionnement des jeux
// Applicable aux lames composites sous DTA GS 2.1 (comportement longitudinal thermique)

import { ZoneEnvironnement } from "../types";
import { CalculDilatationResult, GradeInox, SpecGammeComposite } from "./types";

/**
 * Calcule la dilatation longitudinale prévisible d'une lame composite
 * et dimensionne les jeux nécessaires en fonction de la température de pose et de la zone.
 *
 * @param longueurLameM Longueur unitaire d'une lame en mètres
 * @param gamme Spécification de la gamme fabricant
 * @param temperaturePoseC Température ambiante lors du chantier (défaut 18°C)
 * @param zone Zone environnementale
 */
export function calculerDilatationComposite(
  longueurLameM: number,
  gamme: SpecGammeComposite,
  temperaturePoseC: number = 18,
  zone: ZoneEnvironnement = "normal"
): CalculDilatationResult {
  // Delta T maximal attendu selon climat
  // En plein soleil, une lame sombre monte à 65°C en plaine, 70°C en montagne/sud
  const tempSurfaceMaxC = zone === "montagne" ? 70 : 65;
  const deltaTChaleur = Math.max(10, tempSurfaceMaxC - temperaturePoseC);

  // Dilatation max en mm sur la barre : (dilat_30C / 30) * deltaT * L
  const dilatParMetre = (gamme.dilatationMmParMPar30C / 30) * deltaTChaleur;
  const deltaLMaxMm = Math.round(dilatParMetre * longueurLameM * 10) / 10;

  // Jeu d'aboutage recommandé en bout à bout (mm) selon la température au moment de la pose
  let jeuAboutageRecommandeMm = gamme.jeuAboutageMinMm;
  if (temperaturePoseC < 10) {
    // Par temps froid, la lame va beaucoup se dilater ensuite
    jeuAboutageRecommandeMm = Math.max(gamme.jeuAboutageMinMm + 3, Math.ceil(deltaLMaxMm));
  } else if (temperaturePoseC >= 10 && temperaturePoseC <= 22) {
    // Température tempérée
    jeuAboutageRecommandeMm = Math.max(gamme.jeuAboutageMinMm, Math.ceil(deltaLMaxMm * 0.7));
  } else {
    // Par forte chaleur (> 22°C), la lame est déjà dilatée
    jeuAboutageRecommandeMm = Math.max(2, Math.floor(gamme.jeuAboutageMinMm - 1));
  }

  // Jeu périphérique recommandé (murs, margelles, poteaux)
  const jeuPeripheriqueRecommandeMm = Math.max(
    gamme.jeuPeripheriqueMm,
    Math.ceil(deltaLMaxMm + 3)
  );

  // Grade inox selon zone environnementale
  const gradeInoxRequis: GradeInox =
    zone === "piscine" || zone === "littoral" ? "A4" : "A2";

  return {
    deltaLMaxMm,
    jeuAboutageRecommandeMm,
    jeuPeripheriqueRecommandeMm,
    temperaturePoseC,
    gradeInoxRequis,
  };
}
