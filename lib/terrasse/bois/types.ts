// Types pour le sous-module Terrasse Bois (Vissage apparent et Clips invisibles)
// Conforme DTU 51.4 P1-1 et CPT 3669

import { EssenceBois, GradeInox, ZoneEnvironnement } from "../types";

export interface EssenceBoisDetail {
  id: EssenceBois;
  nom: string;
  famille: "resineux" | "exotique_feuillu" | "thermo_traite";
  classeEmploi: "cl3b" | "cl4" | "cl5";
  densiteKgM3: number;
  retraitVolumiquePct: number;
  compatibleClipsInvisibles: boolean;
  largeurMaxPourClipsMm: number;
  prepercageObligatoire: boolean;
  ratioEntraxeEpaisseur: number; // 20 pour résineux, 23 pour exotiques denses
  guidePose: string;
}

export interface SpecVissageBois {
  nbVisParPoint: number;       // 2 vis selon DTU 51.4
  distanceRiveMm: number;      // 15 à 20 mm
  distanceAboutageMm: number;  // 50 à 70 mm
  diametreVisMinMm: number;    // 5 mm min selon DTU 51.4
  longueurVisMinMm: number;    // ≥ 2.5 * épaisseur de lame
  prepercageRequis: boolean;
  inoxGrade: "A2" | "A4";
}
