// Moteur de calcul du vissage apparent selon DTU 51.4 P1-1
// Règles géométriques : 2 vis/croisement, diamètre ≥ 5mm, longueur ≥ 2.5 * e

import { ZoneEnvironnement } from "../types";
import { getEssenceBoisDetail } from "./essences";
import { SpecVissageBois } from "./types";
import { EssenceBois } from "../types";

export function calculerVissageApparentDTU(
  epaisseurLameMm: number,
  largeurLameMm: number,
  essence: EssenceBois,
  zone: ZoneEnvironnement = "normal"
): SpecVissageBois {
  const essenceDetail = getEssenceBoisDetail(essence);

  // Longueur de vis minimale : 2.5 * épaisseur de lame (DTU 51.4 § 5.4.3)
  const longueurTheoriqueMm = epaisseurLameMm * 2.5;
  // Arrondi aux longueurs commerciales standard (50, 60, 70, 80 mm)
  let longueurVisMinMm = 50;
  if (longueurTheoriqueMm > 65) longueurVisMinMm = 80;
  else if (longueurTheoriqueMm > 55) longueurVisMinMm = 70;
  else if (longueurTheoriqueMm > 45) longueurVisMinMm = 60;

  // Grade inox selon environnement
  const inoxGrade: "A2" | "A4" =
    zone === "piscine" || zone === "littoral" ? "A4" : "A2";

  // Diamètre minimal de vis selon NF DTU 51.4 (Décembre 2018) P1-1 §5.5.6.2.1 Tableau 9 :
  // - Ø 5 mm pour épaisseur de lame 21 <= e <= 29 mm
  // - Ø 6 mm pour épaisseur de lame 30 <= e <= 45 mm
  const diametreVisMinMm = epaisseurLameMm >= 30 ? 6 : 5;

  // Distance minimale en bout de lame : 20 mm (ou jusqu'à 3*e max, DTU 51.4 Déc. 2018 Fig. 19)
  const distanceAboutageMm = Math.min(Math.max(20, epaisseurLameMm * 2), epaisseurLameMm * 3);

  return {
    nbVisParPoint: 2,
    distanceRiveMm: Math.min(20, Math.max(15, Math.round(largeurLameMm * 0.12))),
    distanceAboutageMm,
    diametreVisMinMm,
    longueurVisMinMm,
    prepercageRequis: essenceDetail.prepercageObligatoire,
    inoxGrade,
  };
}
