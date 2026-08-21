// lib/meteoAlerte.ts
//
// Moteur de décision météo pour les chantiers.
//
// IMPORTANT :
// - Ce fichier contient les règles TECHNIQUES de pose.
// - La vigilance officielle Météo-France est traitée séparément.
// - La décision "jour d'arrêt" combine les deux notions.
//
// 1. Risque technique
//    → matériau + accès + zone de vent + position d'angle
//
// 2. Décision journée
//    → vigilance officielle + météo réellement mesurée
//
// Les seuils ci-dessous sont des seuils métier internes à l'application.
// Ils ne constituent pas à eux seuls une référence réglementaire.

import { HeureMeteo } from "./meteo";
import {
  VigilanceDepartement,
  couleurPourPhenomene,
  couleurLaPlusForte,
} from "./meteoVigilance";

export type Materiau =
  | "bois"
  | "metal"
  | "composite"
  | "fibrociment";

export type Acces = "echafaudage" | "nacelle";

export type NiveauAlerte =
  | "vert"
  | "jaune"
  | "orange"
  | "rouge";

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
  ampleurImpact: "complete" | "partielle" | null;
  motif: string;
}

// ---------------------------------------------------------------------------
// Seuils métier
// ---------------------------------------------------------------------------

interface SeuilMateriau {
  ventVigilance: number;
  ventCritique: number;
  pluieCritique: number;
  tempMini: number;
  tempMaxi: number;
}

interface SeuilAcces {
  ventVigilance: number;
  ventCritique: number;
}

const SEUILS_MATERIAUX: Record<Materiau, SeuilMateriau> = {
  bois: {
    ventVigilance: 30,
    ventCritique: 60,
    pluieCritique: 1,
    tempMini: 0,
    tempMaxi: 30,
  },

  metal: {
    ventVigilance: 25,
    ventCritique: 45,
    pluieCritique: 1,
    tempMini: 0,
    tempMaxi: 35,
  },

  composite: {
    ventVigilance: 30,
    ventCritique: 60,
    pluieCritique: 1,
    tempMini: 1,
    tempMaxi: 30,
  },

  fibrociment: {
    ventVigilance: 30,
    ventCritique: 60,
    pluieCritique: 2,
    tempMini: 0,
    tempMaxi: 30,
  },
};

const SEUILS_ACCES: Record<Acces, SeuilAcces> = {
  echafaudage: {
    ventVigilance: 45,
    ventCritique: 60,
  },

  nacelle: {
    ventVigilance: 35,
    ventCritique: 45,
  },
};

// ---------------------------------------------------------------------------
// Paramètres d'environnement chantier
// ---------------------------------------------------------------------------

function normaliserZoneVent(zoneVent: number): number {
  if (!Number.isFinite(zoneVent)) return 1;

  return Math.min(
    4,
    Math.max(1, Math.round(zoneVent))
  );
}

// ---------------------------------------------------------------------------
// Risque technique
// ---------------------------------------------------------------------------

export function evaluerAlerteChantier(
  materiau: Materiau,
  acces: Acces,
  meteo: MeteoJour,
  zoneVent: number = 1,
  estEnAngle: boolean = false
): RisqueTechnique {
  const seuilMateriau =
    SEUILS_MATERIAUX[materiau] ?? SEUILS_MATERIAUX.bois;

  const seuilAcces =
    SEUILS_ACCES[acces] ?? SEUILS_ACCES.echafaudage;

  const zone = normaliserZoneVent(zoneVent);

  let ventCritique = Math.min(
    seuilMateriau.ventCritique,
    seuilAcces.ventCritique
  );

  let ventVigilance = Math.min(
    seuilMateriau.ventVigilance,
    seuilAcces.ventVigilance
  );

  // Zone de vent forte.
  if (zone >= 3) {
    ventCritique -= 10;
    ventVigilance -= 10;
  }

  // Situation en angle.
  if (estEnAngle) {
    ventCritique -= 5;
    ventVigilance -= 5;
  }

  // Sécurité minimale des seuils.
  ventCritique = Math.max(10, ventCritique);
  ventVigilance = Math.max(5, ventVigilance);

  // 1. Vent critique
  if (meteo.rafalesMax >= ventCritique) {
    return {
      niveau: "rouge",
      motif:
        `Vent critique : ${meteo.rafalesMax} km/h ` +
        `(seuil ${ventCritique} km/h, zone ${zone}` +
        `${estEnAngle ? ", angle" : ""}) — pose interdite`,
    };
  }

  // 2. Pluie importante
  if (
    meteo.pluieCumul >= seuilMateriau.pluieCritique &&
    meteo.pluieCumul >= 8
  ) {
    return {
      niveau: "rouge",
      motif:
        `Pluie critique : ${meteo.pluieCumul.toFixed(1)} mm ` +
        `— risque de glissance / protection des matériaux`,
    };
  }

  // 3. Température limite
  if (
    meteo.tempMax <= seuilMateriau.tempMini ||
    meteo.tempMax >= seuilMateriau.tempMaxi
  ) {
    return {
      niveau: "orange",
      motif:
        `Température limite : ${meteo.tempMax}°C ` +
        `pour ${LABELS_MATERIAU[materiau]}`,
    };
  }

  // 4. Vent de vigilance
  if (meteo.rafalesMax >= ventVigilance) {
    return {
      niveau: "jaune",
      motif:
        `Vent de vigilance : ${meteo.rafalesMax} km/h ` +
        `(seuil ${ventVigilance} km/h)`,
    };
  }

  return {
    niveau: "vert",
    motif: "Conditions techniques favorables à la pose",
  };
}

// ---------------------------------------------------------------------------
// Pluie continue
// ---------------------------------------------------------------------------

const SEUIL_PLUIE_HORAIRE_MM = 0.2;
const FRACTION_MINI_HEURES_PLUIE = 0.75;

export function pleutTouteLaJournee(
  heures: HeureMeteo[]
): boolean {
  if (!heures?.length) return false;

  const heuresPluvieuses = heures.filter(
    (heure) =>
      Number(heure.pluie) >= SEUIL_PLUIE_HORAIRE_MM
  ).length;

  return (
    heuresPluvieuses / heures.length >=
    FRACTION_MINI_HEURES_PLUIE
  );
}

// ---------------------------------------------------------------------------
// Décision finale de la journée
// ---------------------------------------------------------------------------

export function evaluerJourChantier(
  materiau: Materiau,
  acces: Acces,
  meteoJour: MeteoJour,
  heures: HeureMeteo[],
  vigilance: VigilanceDepartement,
  zoneVent: number = 1,
  estEnAngle: boolean = false
): DecisionJourChantier {
  const risqueTechnique = evaluerAlerteChantier(
    materiau,
    acces,
    meteoJour,
    zoneVent,
    estEnAngle
  );

  const pluieContinue =
    pleutTouteLaJournee(heures);

  const vigilanceVent =
    couleurPourPhenomene(vigilance, "vent");

  const vigilancePluie =
    couleurPourPhenomene(
      vigilance,
      "pluie-inondation"
    );

  const vigilanceOrages =
    couleurPourPhenomene(vigilance, "orages");

  const vigilanceOfficielle =
    couleurLaPlusForte(
      vigilanceVent,
      vigilancePluie,
      vigilanceOrages
    );

  // -----------------------------------------------------------------------
  // ROUGE
  // -----------------------------------------------------------------------

  if (vigilanceOfficielle === "rouge") {
    const risqueConfirme =
      risqueTechnique.niveau === "orange" ||
      risqueTechnique.niveau === "rouge";

    if (risqueConfirme) {
      return {
        vigilanceOfficielle,
        risqueTechnique,
        pluieContinue,
        jourArrete: true,
        aValider: false,
        ampleurImpact: "complete",
        motif:
          "Vigilance rouge Météo-France confirmée " +
          "par les conditions techniques mesurées " +
          "sur le chantier — arrêt de chantier",
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
        "Vigilance rouge Météo-France, mais " +
        "aucun dépassement technique mesuré — " +
        "validation nécessaire par le chef de chantier",
    };
  }

  // -----------------------------------------------------------------------
  // ORANGE
  // -----------------------------------------------------------------------

  if (vigilanceOfficielle === "orange") {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",
      motif:
        "Vigilance orange Météo-France — " +
        "décision à confirmer selon les conditions " +
        "réellement constatées sur le chantier",
    };
  }

  // -----------------------------------------------------------------------
  // JAUNE
  // -----------------------------------------------------------------------

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
          "Vigilance jaune Météo-France + pluie " +
          "continue constatée sur la journée — " +
          "arrêt de chantier",
      };
    }

    if (
      risqueTechnique.niveau === "orange" ||
      risqueTechnique.niveau === "rouge"
    ) {
      return {
        vigilanceOfficielle,
        risqueTechnique,
        pluieContinue,
        jourArrete: false,
        aValider: true,
        ampleurImpact: "partielle",
        motif:
          `Vigilance jaune + dépassement technique : ` +
          `${risqueTechnique.motif} — à confirmer`,
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
        "Vigilance jaune Météo-France — " +
        "conditions dégradées à surveiller",
    };
  }

  // -----------------------------------------------------------------------
  // VERT + pluie continue
  // -----------------------------------------------------------------------

  if (pluieContinue) {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: true,
      aValider: false,
      ampleurImpact: "complete",
      motif:
        "Pluie continue constatée sur la journée " +
        "malgré l'absence de vigilance officielle",
    };
  }

  // -----------------------------------------------------------------------
  // VERT + risque technique
  // -----------------------------------------------------------------------

  if (
    risqueTechnique.niveau === "orange" ||
    risqueTechnique.niveau === "rouge"
  ) {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",
      motif:
        `Aucun niveau de vigilance officiel supérieur ` +
        `au vert, mais risque technique constaté : ` +
        `${risqueTechnique.motif} — validation nécessaire`,
    };
  }

  // -----------------------------------------------------------------------
  // NORMAL
  // -----------------------------------------------------------------------

  return {
    vigilanceOfficielle,
    risqueTechnique,
    pluieContinue,
    jourArrete: false,
    aValider: false,
    ampleurImpact: null,
    motif:
      "Conditions normales — aucune intempérie nécessitant " +
      "un rapport",
  };
}

// ---------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------

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
