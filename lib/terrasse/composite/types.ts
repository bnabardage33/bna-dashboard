// Types dédiés au sous-module Terrasse Composite & Clips Invisibles
// Conformes aux règles DTA GS 2.1, CPT applicables et Guides Fabricants

import { ZoneEnvironnement } from "../types";

export type FabricantCompositeId =
  | "silvadec"
  | "fiberdeck"
  | "neolife"
  | "ocewood"
  | "trex";

export type TypeLambourdeSupport = "alu" | "bois_cl4" | "composite";

export type GradeInox = "A2" | "A4";

export interface InfoDTA {
  numero: string;
  groupeSpecialise: string; // ex: "GS 2.1"
  dateDTA: string;          // YYYY-MM-DD
  versionDTA: string;       // ex: "V2"
  expirationDTA: string;    // YYYY-MM-DD
  titre: string;
  avisTechniqueUrl?: string;
}

export interface SpecGammeComposite {
  gamme: string;
  largeurMm: number;
  epaisseurMm: number;
  longueursDisponiblesM: number[];
  entraxeMaxCm: number;
  entraxeMaxEscalierCm: number;
  dilatationMmParMPar30C: number;
  jeuLateralMm: number;
  jeuAboutageMinMm: number;      // Valeur nominale à 20°C
  jeuPeripheriqueMm: number;     // Distance aux murs / obstacles
  penteMinimalePct: number;      // Recommandation fabricant
  supportAluRecommande: boolean;
  doubleLambourdeAboutageObligatoire: boolean;
  clipType: string;
  visType: string;
  ventilationSousFaceMm: number; // Hauteur libre min sous lambourdes
}

export interface SpecFabricantComposite {
  id: FabricantCompositeId;
  nom: string;
  paysOrigine: string;
  dta: InfoDTA;
  gammes: SpecGammeComposite[];
  entraxeDefautCm: number;
  penteDefautPct: number;
  supportPrefere: TypeLambourdeSupport;
  guidePoseUrl?: string;
}

export interface CalculDilatationResult {
  deltaLMaxMm: number;           // Dilatation max sur la longueur de lame
  jeuAboutageRecommandeMm: number; // Selon température de pose
  jeuPeripheriqueRecommandeMm: number;
  temperaturePoseC: number;
  gradeInoxRequis: GradeInox;
}

export interface QuantitatifClipsComposite {
  nbClipsDepart: number;
  nbClipsCourants: number;
  nbClipsAboutage: number;
  nbClipsFin: number;
  nbTotalClips: number;
  nbBoitesClips: number;
  conditionnementBoite: number;
  gradeInox: GradeInox;
  visFourniesAvecClips: boolean;
}
