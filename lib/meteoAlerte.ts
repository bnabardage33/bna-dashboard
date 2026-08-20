// lib/meteoAlerte.ts
//
// Deux notions bien séparées :
//
// 1) "Risque technique" (evaluerAlerteChantier, inchangé) :
//    seuils maison par matériau/accès, utile pour savoir si la pose est
//    risquée. Reste affiché sur la fiche chantier pour info terrain.
//
// 2) "Décision jour d'arrêt" (evaluerJourChantier, nouveau) :
//    ce qui compte pour le rapport intempéries officiel. Basé sur la
//    vigilance Météo-France (vent + pluie-inondation) et sur une
//    détection de pluie continue toute la journée à partir des relevés
//    horaires — indépendante des seuils maison, pour rester "propre et
//    carré" en cas de litige.

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
// 1) Risque technique (seuils maison, matériau/accès) — inchangé
// -----------------------------------------------------------------------

export function evaluerAlerteChantier(
  materiau: Materiau,
  acces: Acces,
  meteo: { rafalesMax: number; pluieCumul: number; tempMax: number }
): { niveau: NiveauAlerte; motif: string } {
  const sm = SEUILS_MATERIAUX[materiau] ?? SEUILS_MATERIAUX.bois;
  const sa = SEUILS_ACCES[acces] ?? SEUILS_ACCES.echafaudage;

  const ventCritique = Math.min(sm.vent_critique, sa.vent_critique);
  const ventVigilance = Math.min(sm.vent_vigilance, sa.vent_vigilance);

  if (meteo.rafalesMax >= ventCritique) {
    return {
      niveau: "rouge",
      motif: `Vent critique (${meteo.rafalesMax} km/h ≥ seuil ${ventCritique} km/h) — pose interdite`,
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
      motif: `Vent de vigilance (${meteo.rafalesMax} km/h) — attention effet voile`,
    };
  }
  return { niveau: "vert", motif: "Conditions optimales de pose" };
}

// -----------------------------------------------------------------------
// 2) Détection pluie continue sur la journée (données locales horaires)
// -----------------------------------------------------------------------

// Seuil pour considérer une heure "pluvieuse".
const SEUIL_PLUIE_HORAIRE_MM = 0.2;
// Fraction des heures de la journée devant être pluvieuses pour parler de
// "pluie toute la journée".
const FRACTION_MINI_HEURES_PLUIE = 0.75;

export function pleutTouteLaJournee(heures: HeureMeteo[]): boolean {
  if (!heures || heures.length === 0) return false;

  const heuresPluvieuses = heures.filter(
    (h) => h.pluie >= SEUIL_PLUIE_HORAIRE_MM
  ).length;

  return heuresPluvieuses / heures.length >= FRACTION_MINI_HEURES_PLUIE;
}

// -----------------------------------------------------------------------
// 3) Décision "jour d'arrêt" — ce qui compte pour le rapport officiel
// -----------------------------------------------------------------------

export interface DecisionJourChantier {
  // Couleur de vigilance officielle retenue (max entre vent et pluie-inondation).
  vigilanceOfficielle: NiveauAlerte;
  // Risque technique maison (matériau/accès), gardé à titre indicatif.
  risqueTechnique: { niveau: NiveauAlerte; motif: string };
  // Pluie continue détectée localement sur la journée.
  pluieContinue: boolean;
  // Décision auto : ce jour compte comme un jour d'arrêt de chantier.
  jourArrete: boolean;
  // true si la décision n'est pas automatisable et doit être confirmée
  // par le chef de chantier (cas vigilance orange).
  aValider: boolean;
  // Texte de synthèse à afficher/imprimer sur le rapport.
  motif: string;
}

export function evaluerJourChantier(
  materiau: Materiau,
  acces: Acces,
  meteoJour: { rafalesMax: number; pluieCumul: number; tempMax: number },
  heures: HeureMeteo[],
  vigilance: VigilanceDepartement
): DecisionJourChantier {
  const risqueTechnique = evaluerAlerteChantier(materiau, acces, meteoJour);

  const vigilanceVent = couleurPourPhenomene(vigilance, "vent");
  const vigilancePluie = couleurPourPhenomene(vigilance, "pluie-inondation");
  const vigilanceOfficielle = couleurLaPlusForte(vigilanceVent, vigilancePluie);

  const pluieContinue = pleutTouteLaJournee(heures);

  if (vigilanceOfficielle === "rouge") {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: true,
      aValider: false,
      motif: `Vigilance rouge Météo-France (${vigilanceVent === "rouge" ? "vent" : "pluie-inondation"}) — arrêt de chantier`,
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
      aValider: false,
      motif: "Vigilance jaune Météo-France — travail possible, vigilance de rigueur",
    };
  }

  // vigilanceOfficielle === "vert"
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
