// lib/meteoAlerte.ts
//
// Deux notions bien séparées :
//
// 1) "Risque technique" (evaluerAlerteChantier) :
//    seuils maison par matériau/accès, ajustés selon la zone de vent (1 à 4)
//    et la position (angle ou courant). Utile pour la sécurité terrain.
//
// 2) "Décision jour d'arrêt" (evaluerJourChantier) :
//    ce qui compte pour le rapport intempéries officiel (Vigilance Météo-France).

import { HeureMeteo } from "./meteo";
import {
  VigilanceDepartement,
  couleurPourPhenomene,
  couleurLaPlusForte,
} from "./meteoVigilance";

export type Materiau = "bois" | "metal" | "composite" | "fibrociment";
export type Acces = "echafaudage" | "nacelle";
export type NiveauAlerte = "vert" | "jaune" | "orange" | "rouge";

const SEUILS_MATERIAUX: Record<
  Materiau,
  { vent_vigilance: number; vent_critique: number; pluie_critique: number; temp_mini: number; temp_maxi: number }
> = {
  bois: { vent_vigilance: 30, vent_critique: 60, pluie_critique: 1.0, temp_mini: 0.0, temp_maxi: 30.0 },
  metal: { vent_vigilance: 25, vent_critique: 45, pluie_critique: 1.0, temp_mini: 0.0, temp_maxi: 35.0 },
  composite: { vent_vigilance: 30, vent_critique: 60, pluie_critique: 1.0, temp_mini: 1.0, temp_maxi: 30.0 },
  fibrociment: { vent_vigilance: 30, vent_critique: 60, pluie_critique: 2.0, temp_mini: 0.0, temp_maxi: 30.0 },
};

const SEUILS_ACCES: Record<Acces, { vent_vigilance: number; vent_critique: number }> = {
  echafaudage: { vent_vigilance: 45, vent_critique: 60 },
  nacelle: { vent_vigilance: 35, vent_critique: 45 },
};

// -----------------------------------------------------------------------
// 1) Risque technique (seuils maison, matériau/accès/zone de vent)
// -----------------------------------------------------------------------

export function evaluerAlerteChantier(
  materiau: Materiau,
  acces: Acces,
  meteo: { rafalesMax: number; pluieCumul: number; tempMax: number },
  zoneVent: number = 1,     // Ajouté : 1, 2, 3 ou 4 depuis la BDD chantiers
  estEnAngle: boolean = false // Ajouté : réduit les seuils si vrai
): { niveau: NiveauAlerte; motif: string } {
  const sm = SEUILS_MATERIAUX[materiau] ?? SEUILS_MATERIAUX.bois;
  const sa = SEUILS_ACCES[acces] ?? SEUILS_ACCES.echafaudage;

  // Calcul du vent critique de base
  let ventCritique = Math.min(sm.vent_critique, sa.vent_critique);
  let ventVigilance = Math.min(sm.vent_vigilance, sa.vent_vigilance);

  // LOGIQUE DE MINORATION SELON ZONE DE VENT & POSITION ANGLE (Ajustement DTU)
  // Si zone de vent forte (3 ou 4), on réduit le seuil de tolérance aux rafales de 10 km/h
  if (zoneVent >= 3) {
    ventCritique -= 10;
    ventVigilance -= 10;
  }
  
  // Si la pose se fait dans une zone d'angle du bâtiment, l'effet de sillage réduit le seuil de 5 km/h supplémentaires
  if (estEnAngle) {
    ventCritique -= 5;
    ventVigilance -= 5;
  }

  if (meteo.rafalesMax >= ventCritique) {
    return {
      niveau: "rouge",
      motif: `Vent critique (${meteo.rafalesMax} km/h >= seuil ajusté ${ventCritique} km/h pour Zone ${zoneVent}${estEnAngle ? ' en Angle' : ''}) — pose interdite`,
    };
  }
  if (meteo.pluieCumul >= sm.pluie_critique && meteo.pluieCumul >= 8) {
    return {
      niveau: "rouge",
      motif: `Pluie critique (${meteo.pluieCumul.toFixed(1)} mm) — protection isolant/glissance`,
    };
  }
  if (meteo.tempMax <= sm.temp_mini || meteo.tempMax >= sm.temp_maxi) {
    return {
      niveau: "orange",
      motif: `Température limite (${meteo.tempMax}°C) pour ${materiau}`,
    };
  }
  if (meteo.rafalesMax >= ventVigilance) {
    return {
      niveau: "jaune",
      motif: `Vent de vigilance (${meteo.rafalesMax} km/h >= seuil ${ventVigilance} km/h) — attention effet voile`,
    };
  }
  return { niveau: "vert", motif: "Conditions optimales de pose" };
}

// -----------------------------------------------------------------------
// 2) Détection pluie continue sur la journée
// -----------------------------------------------------------------------
const SEUIL_PLUIE_HORAIRE_MM = 0.2;
const FRACTION_MINI_HEURES_PLUIE = 0.75;

export function pleutTouteLaJournee(heures: HeureMeteo[]): boolean {
  if (!heures || heures.length === 0) return false;

  const heuresPluvieuses = heures.filter(
    (h) => h.pluie >= SEUIL_PLUIE_HORAIRE_MM
  ).length;

  return heuresPluvieuses / heures.length >= FRACTION_MINI_HEURES_PLUIE;
}

// -----------------------------------------------------------------------
// 3) Décision "jour d'arrêt"
// -----------------------------------------------------------------------
export interface DecisionJourChantier {
  vigilanceOfficielle: NiveauAlerte;
  risqueTechnique: { niveau: NiveauAlerte; motif: string };
  pluieContinue: boolean;
  jourArrete: boolean;
  aValider: boolean;
  motif: string;
}

export function evaluerJourChantier(
  materiau: Materiau,
  acces: Acces,
  meteoJour: { rafalesMax: number; pluieCumul: number; tempMax: number },
  heures: HeureMeteo[],
  vigilance: VigilanceDepartement,
  zoneVent: number = 1,       // Transmis pour le risque technique
  estEnAngle: boolean = false  // Transmis pour le risque technique
): DecisionJourChantier {
  // Transfert des paramètres de zone de vent à l'évaluation technique
  const risqueTechnique = evaluerAlerteChantier(materiau, acces, meteoJour, zoneVent, estEnAngle);

  const vigilanceVent = couleurPourPhenomene(vigilance, "vent");
  const vigilancePluie = couleurPourPhenomene(vigilance, "pluie-inondation");
  const vigilanceOrages = couleurPourPhenomene(vigilance, "orages");
  const vigilanceOfficielle = couleurLaPlusForte(vigilanceVent, vigilancePluie, vigilanceOrages);

  const pluieContinue = pleutTouteLaJournee(heures);

  if (vigilanceOfficielle === "rouge") {
    const cause =
      vigilanceVent === "rouge" ? "vent" : vigilanceOrages === "rouge" ? "orages" : "pluie-inondation";
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: true,
      aValider: false,
      motif: `Vigilance rouge Météo-France (${cause}) — arrêt de chantier`,
    };
  }

  if (vigilanceOfficielle === "orange") {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: false,
      aValider: true,
      motif: "Vigilance orange Météo-France — arrêt à confirmer selon les prévisions et la décision du chef de chantier",
    };
  }

  if (vigilanceOfficielle === "jaune") {
    if (pluieContinue) {
      return {
        vigilanceOfficielle,
        risqueTechnique,
        pluieContinue,
        jourArrete: true,
        aValider: false,
        motif: "Vigilance jaune Météo-France + pluie continue constatée toute la journée — arrêt de chantier",
      };
    }
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: false,
      aValider: true,
      motif: "Vigilance jaune Météo-France — conditions météo dégradées constatées sur zone",
    };
  }

  if (pluieContinue) {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: true,
      aValider: false,
      motif: "Pluie continue constatée toute la journée sur le chantier (hors vigilance officielle Météo-France)",
    };
  }

  return {
    vigilanceOfficielle,
    risqueTechnique,
    pluieContinue,
    jourArrete: false,
    aValider: false,
    motif: "Conditions normales — pas d'intempérie constatée",
  };
}

export const LABELS_MATERIAU: Record<Materiau, string> = {
  bois: "Bois",
  metal: "Métal / Bac acier",
  composite: "Composite",
  fibrociment: "Fibrociment",
};

export const LABELS_ACCES: Record<Acces, string> = {
  echafaudage: "Échafaudage",
  nacelle: "Nacelle",
};
