// lib/meteoAlerte.ts
//
// Logique météo commune au dashboard.
//
// Deux niveaux sont volontairement séparés :
//
// 1. RISQUE TECHNIQUE
//    Seuils chantier selon matériau + accès.
//    Sert à déterminer si les conditions réellement mesurées
//    dépassent les seuils de pose.
//
// 2. DÉCISION JOUR CHANTIER
//    Croise la vigilance officielle Météo-France capturée matin +
//    après-midi avec les mesures météo réellement constatées.
//    Cette logique doit rester identique à l'Edge Function
//    generer-rapports-intemperies.
//
// IMPORTANT : ce fichier ne décide pas juridiquement d'un arrêt.
// Il fournit une aide à la décision et un état "à valider" lorsque
// l'interprétation doit être confirmée par le chef de chantier.
//

import { HeureMeteo } from "./meteo";
import {
  VigilanceDepartement,
  couleurPourPhenomene,
  couleurLaPlusForte,
} from "./meteoVigilance";

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

export type Materiau =
  | "bois"
  | "metal"
  | "composite"
  | "fibrociment";

export type Acces =
  | "echafaudage"
  | "nacelle";

export type NiveauAlerte =
  | "vert"
  | "jaune"
  | "orange"
  | "rouge";

export type AmpleurImpact =
  | "complete"
  | "partielle"
  | null;

export interface MeteoJour {
  rafalesMax: number;
  pluieCumul: number;
  tempMax: number;
}

export interface RisqueTechnique {
  niveau: NiveauAlerte;
  motif: string;
}

export interface DecisionJourChantier {
  vigilanceOfficielle: NiveauAlerte;
  risqueTechnique: RisqueTechnique;
  pluieContinue: boolean;
  jourArrete: boolean;
  aValider: boolean;
  ampleurImpact: AmpleurImpact;
  motif: string;
}

// -----------------------------------------------------------------------------
// SEUILS TECHNIQUES
// -----------------------------------------------------------------------------
//
// Ces seuils sont les seuils internes de sécurité utilisés par l'application.
// Ils ne remplacent pas les prescriptions du fabricant, du plan de prévention,
// du PPSPS, du DUERP, des notices d'utilisation ou des règles applicables
// au chantier.
// -----------------------------------------------------------------------------

const SEUILS_MATERIAUX: Record<
  Materiau,
  {
    vent_vigilance: number;
    vent_critique: number;
    pluie_critique: number;
    temp_mini: number;
    temp_maxi: number;
  }
> = {
  bois: {
    vent_vigilance: 30,
    vent_critique: 60,
    pluie_critique: 1.0,
    temp_mini: 0,
    temp_maxi: 30,
  },

  metal: {
    vent_vigilance: 25,
    vent_critique: 45,
    pluie_critique: 1.0,
    temp_mini: 0,
    temp_maxi: 35,
  },

  composite: {
    vent_vigilance: 30,
    vent_critique: 60,
    pluie_critique: 1.0,
    temp_mini: 1,
    temp_maxi: 30,
  },

  fibrociment: {
    vent_vigilance: 30,
    vent_critique: 60,
    pluie_critique: 2.0,
    temp_mini: 0,
    temp_maxi: 30,
  },
};

const SEUILS_ACCES: Record<
  Acces,
  {
    vent_vigilance: number;
    vent_critique: number;
  }
> = {
  echafaudage: {
    vent_vigilance: 45,
    vent_critique: 60,
  },

  nacelle: {
    vent_vigilance: 35,
    vent_critique: 45,
  },
};

// -----------------------------------------------------------------------------
// 1. RISQUE TECHNIQUE
// -----------------------------------------------------------------------------

/**
 * Évalue uniquement les conditions réellement mesurées.
 *
 * Cette fonction ne tient PAS compte de la vigilance Météo-France.
 */
export function evaluerAlerteChantier(
  materiau: Materiau,
  acces: Acces,
  meteo: MeteoJour
): RisqueTechnique {
  const sm =
    SEUILS_MATERIAUX[materiau] ??
    SEUILS_MATERIAUX.bois;

  const sa =
    SEUILS_ACCES[acces] ??
    SEUILS_ACCES.echafaudage;

  // Le seuil le plus contraignant entre matériau et accès s'applique.
  const ventCritique = Math.min(
    sm.vent_critique,
    sa.vent_critique
  );

  const ventVigilance = Math.min(
    sm.vent_vigilance,
    sa.vent_vigilance
  );

  // 1. Vent critique
  if (meteo.rafalesMax >= ventCritique) {
    return {
      niveau: "rouge",
      motif: `Vent critique (${meteo.rafalesMax} km/h ≥ seuil ${ventCritique} km/h)`,
    };
  }

  // 2. Pluie importante
  //
  // Même logique que l'Edge Function :
  // le cumul doit atteindre à la fois le seuil du matériau
  // et 8 mm sur la journée.
  if (
    meteo.pluieCumul >= sm.pluie_critique &&
    meteo.pluieCumul >= 8
  ) {
    return {
      niveau: "rouge",
      motif: `Pluie critique (${meteo.pluieCumul.toFixed(1)} mm)`,
    };
  }

  // 3. Température limite
  if (
    meteo.tempMax <= sm.temp_mini ||
    meteo.tempMax >= sm.temp_maxi
  ) {
    return {
      niveau: "orange",
      motif: `Température limite (${meteo.tempMax}°C) pour ${materiau}`,
    };
  }

  // 4. Vent de vigilance
  if (meteo.rafalesMax >= ventVigilance) {
    return {
      niveau: "jaune",
      motif: `Vent de vigilance (${meteo.rafalesMax} km/h)`,
    };
  }

  return {
    niveau: "vert",
    motif: "Conditions optimales de pose",
  };
}

// -----------------------------------------------------------------------------
// 2. PLUIE CONTINUE
// -----------------------------------------------------------------------------

const SEUIL_PLUIE_HORAIRE_MM = 0.2;
const FRACTION_MINI_HEURES_PLUIE = 0.75;

/**
 * Considère la journée comme pluvieuse de façon continue lorsque
 * au moins 75 % des relevés horaires atteignent 0,2 mm ou plus.
 */
export function pleutTouteLaJournee(
  heures: HeureMeteo[]
): boolean {
  if (!heures || heures.length === 0) {
    return false;
  }

  const heuresPluvieuses = heures.filter(
    (h) => h.pluie >= SEUIL_PLUIE_HORAIRE_MM
  ).length;

  return (
    heuresPluvieuses / heures.length >=
    FRACTION_MINI_HEURES_PLUIE
  );
}

// -----------------------------------------------------------------------------
// 3. DÉCISION DU JOUR
// -----------------------------------------------------------------------------
//
// Cette fonction reproduit la logique de l'Edge Function
// generer-rapports-intemperies.
//
// Vigilance :
//   - matin
//   - après-midi
//
// Terrain :
//   - rafales réelles
//   - pluie réelle
//   - température réelle
//
// La vigilance officielle seule ne transforme pas automatiquement
// une journée en arrêt définitif, sauf lorsqu'elle est confirmée
// par les conditions réelles selon les règles ci-dessous.
// -----------------------------------------------------------------------------

export function evaluerJourChantier(
  materiau: Materiau,
  acces: Acces,
  meteoJour: MeteoJour,
  heures: HeureMeteo[],
  vigilanceMatin: NiveauAlerte | null,
  vigilanceApresmidi: NiveauAlerte | null
): DecisionJourChantier {
  const risqueTechnique = evaluerAlerteChantier(
    materiau,
    acces,
    meteoJour
  );

  const pluieContinue =
    pleutTouteLaJournee(heures);

  const vMatin =
    vigilanceMatin ?? "vert";

  const vAprem =
    vigilanceApresmidi ?? "vert";

  const vigilanceOfficielle =
    couleurLaPlusForte(
      vMatin,
      vAprem
    );

  // ---------------------------------------------------------------------------
  // Évolution de la vigilance
  // ---------------------------------------------------------------------------

  const evolution =
    vigilanceMatin &&
    vigilanceApresmidi &&
    vigilanceMatin !== vigilanceApresmidi
      ? ` (vigilance ${vigilanceMatin} le matin, vigilance ${vigilanceApresmidi} l'après-midi)`
      : "";

  // Le terrain confirme un risque technique important
  const risqueConfirmeParLeTerrain =
    risqueTechnique.niveau === "orange" ||
    risqueTechnique.niveau === "rouge";

  // ---------------------------------------------------------------------------
  // VIGILANCE ROUGE
  // ---------------------------------------------------------------------------

  if (vigilanceOfficielle === "rouge") {
    if (risqueConfirmeParLeTerrain) {
      return {
        vigilanceOfficielle,
        risqueTechnique,
        pluieContinue,

        jourArrete: true,
        aValider: false,
        ampleurImpact: "complete",

        motif:
          `Vigilance rouge Météo-France confirmée par les mesures du chantier` +
          `${evolution} — arrêt de chantier`,
      };
    }

    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,

      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",

      motif:
        `Vigilance rouge Météo-France${evolution}, ` +
        `mais aucun dépassement mesuré sur le chantier — ` +
        `à confirmer par le chef de chantier`,
    };
  }

  // ---------------------------------------------------------------------------
  // VIGILANCE ORANGE
  // ---------------------------------------------------------------------------

  if (vigilanceOfficielle === "orange") {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,

      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",

      motif:
        `Vigilance orange Météo-France${evolution} — ` +
        `arrêt à confirmer selon le déroulement réel de la journée`,
    };
  }

  // ---------------------------------------------------------------------------
  // VIGILANCE JAUNE
  // ---------------------------------------------------------------------------

  if (vigilanceOfficielle === "jaune") {
    if (pluieContinue) {
      return {
        vigilanceOfficielle,
        risqueTechnique,
        pluieContinue,

        jourArrete: true,
        aValider: false,
        ampleurImpact: "complete",

        motif:
          "Vigilance jaune Météo-France + pluie continue " +
          "constatée toute la journée — arrêt de chantier",
      };
    }

    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,

      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",

      motif:
        `Vigilance jaune Météo-France${evolution} — ` +
        `conditions météo dégradées à surveiller sur le chantier`,
    };
  }

  // ---------------------------------------------------------------------------
  // VIGILANCE VERTE + PLUIE CONTINUE
  // ---------------------------------------------------------------------------

  if (
    vigilanceOfficielle === "vert" &&
    pluieContinue
  ) {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,

      jourArrete: true,
      aValider: false,
      ampleurImpact: "complete",

      motif:
        "Pluie continue constatée toute la journée " +
        "(hors vigilance officielle)",
    };
  }

  // ---------------------------------------------------------------------------
  // VIGILANCE VERTE/JAUNE + RISQUE TECHNIQUE CONFIRMÉ
  // ---------------------------------------------------------------------------
  //
  // Exemple :
  // Météo-France reste verte, mais les rafales réellement mesurées
  // dépassent le seuil du matériau ou de l'accès.
  //
  // On ne force pas automatiquement l'arrêt.
  // On demande une validation humaine.
  // ---------------------------------------------------------------------------

  if (risqueConfirmeParLeTerrain) {
    const contexte =
      vigilanceOfficielle === "vert"
        ? "Pas de vigilance officielle"
        : `Vigilance ${vigilanceOfficielle} Météo-France${evolution}`;

    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,

      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",

      motif:
        `${contexte}, mais dépassement mesuré sur le chantier ` +
        `(${risqueTechnique.motif}) — ` +
        `à confirmer par le chef de chantier`,
    };
  }

  // ---------------------------------------------------------------------------
  // CONDITIONS NORMALES
  // ---------------------------------------------------------------------------

  return {
    vigilanceOfficielle,
    risqueTechnique,
    pluieContinue,

    jourArrete: false,
    aValider: false,
    ampleurImpact: null,

    motif:
      "Conditions normales — pas d'intempérie constatée",
  };
}

// -----------------------------------------------------------------------------
// 4. COMPATIBILITÉ AVEC L'ANCIEN APPEL
// -----------------------------------------------------------------------------
//
// Si le dashboard dispose encore d'un objet VigilanceDepartement complet,
// cette fonction permet de continuer à l'utiliser sans reproduire la logique
// dans plusieurs composants.
//
// Elle calcule la vigilance pertinente exactement comme l'ancienne logique :
// vent + pluie-inondation + orages.
// -----------------------------------------------------------------------------

export function vigilancePertinente(
  vigilance: VigilanceDepartement
): NiveauAlerte {
  const vigilanceVent =
    couleurPourPhenomene(
      vigilance,
      "vent"
    );

  const vigilancePluie =
    couleurPourPhenomene(
      vigilance,
      "pluie-inondation"
    );

  const vigilanceOrages =
    couleurPourPhenomene(
      vigilance,
      "orages"
    );

  return couleurLaPlusForte(
    vigilanceVent,
    vigilancePluie,
    vigilanceOrages
  );
}

// -----------------------------------------------------------------------------
// 5. ANCIENNE API : évaluer directement avec une vigilance complète
// -----------------------------------------------------------------------------
//
// Utile pour les écrans qui n'ont pas encore les captures matin/après-midi.
// La vigilance fournie est utilisée pour les deux périodes.
// -----------------------------------------------------------------------------

export function evaluerJourChantierAvecVigilance(
  materiau: Materiau,
  acces: Acces,
  meteoJour: MeteoJour,
  heures: HeureMeteo[],
  vigilance: VigilanceDepartement
): DecisionJourChantier {
  const couleur =
    vigilancePertinente(vigilance);

  return evaluerJourChantier(
    materiau,
    acces,
    meteoJour,
    heures,
    couleur,
    couleur
  );
}

// -----------------------------------------------------------------------------
// LABELS
// -----------------------------------------------------------------------------

export const LABELS_MATERIAU: Record<
  Materiau,
  string
> = {
  bois: "Bois",
  metal: "Métal / Bac acier",
  composite: "Composite",
  fibrociment: "Fibrociment",
};

export const LABELS_ACCES: Record<
  Acces,
  string
> = {
  echafaudage: "Échafaudage",
  nacelle: "Nacelle",
};
