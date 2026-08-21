/// lib/meteoAlerte.ts
//
// Moteur métier des rapports d'intempéries.
//
// Le système distingue volontairement 3 notions :
//
// 1) VIGILANCE OFFICIELLE
//    Donnée provenant exclusivement de Météo-France.
//
// 2) RISQUE TECHNIQUE CHANTIER
//    Analyse interne basée sur :
//      - matériau
//      - moyen d'accès
//      - rafales
//      - pluie
//      - température
//      - zone de vent
//      - position en angle
//
// 3) DÉCISION CHANTIER
//    Décision opérationnelle résultant de la vigilance officielle,
//    du risque technique et des conditions météo locales.
//
// IMPORTANT :
// Un risque technique ne modifie JAMAIS la vigilance officielle
// Météo-France.
//

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

export type Acces =
  | "echafaudage"
  | "nacelle";

export type NiveauAlerte =
  | "vert"
  | "jaune"
  | "orange"
  | "rouge";

const ORDRE_NIVEAU: Record<NiveauAlerte, number> = {
  vert: 0,
  jaune: 1,
  orange: 2,
  rouge: 3,
};

/**
 * Retourne le niveau le plus élevé entre deux niveaux.
 */
export function plusForte(
  a: NiveauAlerte,
  b: NiveauAlerte
): NiveauAlerte {
  return ORDRE_NIVEAU[a] >= ORDRE_NIVEAU[b]
    ? a
    : b;
}

/**
 * Seuils météo propres aux matériaux.
 *
 * Ces seuils sont des règles métier internes au logiciel.
 * Ils ne représentent PAS les seuils officiels Météo-France.
 */
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

/**
 * Seuils liés au moyen d'accès.
 */
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

/**
 * Analyse du risque technique du chantier.
 *
 * Cette fonction ne touche JAMAIS à la vigilance officielle
 * Météo-France.
 */
export function evaluerAlerteChantier(
  materiau: Materiau,
  acces: Acces,
  meteo: {
    rafalesMax: number;
    pluieCumul: number;
    tempMax: number;
  },
  zoneVent: number = 1,
  estEnAngle: boolean = false
): {
  niveau: NiveauAlerte;
  motif: string;
} {
  const seuilMateriau =
    SEUILS_MATERIAUX[materiau] ??
    SEUILS_MATERIAUX.bois;

  const seuilAcces =
    SEUILS_ACCES[acces] ??
    SEUILS_ACCES.echafaudage;

  /*
   * On prend le seuil le plus restrictif entre
   * le matériau et le moyen d'accès.
   */
  let ventCritique = Math.min(
    seuilMateriau.vent_critique,
    seuilAcces.vent_critique
  );

  let ventVigilance = Math.min(
    seuilMateriau.vent_vigilance,
    seuilAcces.vent_vigilance
  );

  /*
   * Zone de vent 3 ou 4 :
   * seuils abaissés de 10 km/h.
   */
  if (zoneVent >= 3) {
    ventCritique -= 10;
    ventVigilance -= 10;
  }

  /*
   * Position en angle :
   * seuils abaissés de 5 km/h.
   */
  if (estEnAngle) {
    ventCritique -= 5;
    ventVigilance -= 5;
  }

  /*
   * Sécurité minimale :
   * on évite qu'un cumul d'ajustements fasse tomber
   * les seuils à des valeurs absurdes.
   */
  ventCritique = Math.max(20, ventCritique);
  ventVigilance = Math.max(15, ventVigilance);

  /*
   * 1. Vent critique
   */
  if (meteo.rafalesMax >= ventCritique) {
    return {
      niveau: "rouge",
      motif:
        `Vent critique : ${meteo.rafalesMax} km/h ` +
        `≥ seuil ${ventCritique} km/h ` +
        `(Zone ${zoneVent}${estEnAngle ? ", angle" : ""}) ` +
        `• pose interdite.`,
    };
  }

  /*
   * 2. Pluie critique
   *
   * On conserve la double condition :
   * - seuil propre au matériau
   * - cumul réellement important
   */
  if (
    meteo.pluieCumul >=
      seuilMateriau.pluie_critique &&
    meteo.pluieCumul >= 8
  ) {
    return {
      niveau: "rouge",
      motif:
        `Pluie importante : ${meteo.pluieCumul.toFixed(
          1
        )} mm ` +
        `• protection de l'isolant, glissance ou conditions de pose incompatibles.`,
    };
  }

  /*
   * 3. Température limite
   */
  if (
    meteo.tempMax <= seuilMateriau.temp_mini ||
    meteo.tempMax >= seuilMateriau.temp_maxi
  ) {
    return {
      niveau: "orange",
      motif:
        `Température limite : ${meteo.tempMax}°C ` +
        `pour le matériau ${LABELS_MATERIAU[materiau]}.`,
    };
  }

  /*
   * 4. Vent de vigilance
   */
  if (meteo.rafalesMax >= ventVigilance) {
    return {
      niveau: "jaune",
      motif:
        `Vent de vigilance : ${meteo.rafalesMax} km/h ` +
        `≥ seuil ${ventVigilance} km/h ` +
        `• attention à l'effet de voile.`,
    };
  }

  /*
   * 5. Conditions techniques normales
   */
  return {
    niveau: "vert",
    motif: "Conditions techniques compatibles avec la pose.",
  };
}

/* ------------------------------------------------------------------ */
/* Pluie continue                                                     */
/* ------------------------------------------------------------------ */

const SEUIL_PLUIE_HORAIRE_MM = 0.2;

/**
 * Au moins 75 % des relevés horaires doivent
 * présenter une pluie significative.
 */
const FRACTION_MINI_HEURES_PLUIE = 0.75;

export function pleutTouteLaJournee(
  heures: HeureMeteo[]
): boolean {
  if (!heures || heures.length === 0) {
    return false;
  }

  const heuresPluvieuses =
    heures.filter(
      (heure) =>
        heure.pluie >=
        SEUIL_PLUIE_HORAIRE_MM
    ).length;

  return (
    heuresPluvieuses / heures.length >=
    FRACTION_MINI_HEURES_PLUIE
  );
}

/* ------------------------------------------------------------------ */
/* Décision du jour                                                   */
/* ------------------------------------------------------------------ */

export interface DecisionJourChantier {
  /**
   * Vigilance officielle Météo-France.
   */
  vigilanceOfficielle: NiveauAlerte;

  /**
   * Risque technique calculé par le moteur interne.
   */
  risqueTechnique: {
    niveau: NiveauAlerte;
    motif: string;
  };

  /**
   * Détection météo locale.
   */
  pluieContinue: boolean;

  /**
   * Décision opérationnelle.
   */
  jourArrete: boolean;
  aValider: boolean;

  /**
   * Impact :
   * - complete
   * - partielle
   * - null
   */
  ampleurImpact:
    | "complete"
    | "partielle"
    | null;

  /**
   * Explication destinée au rapport.
   */
  motif: string;
}

/**
 * Détermine la vigilance officielle Météo-France
 * à partir des phénomènes pertinents pour le chantier.
 *
 * IMPORTANT :
 * Le risque technique n'est PAS inclus dans cette valeur.
 */
function determinerVigilanceOfficielle(
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

/**
 * Identifie le phénomène officiel principal
 * correspondant au niveau maximal.
 */
function determinerCauseVigilance(
  vigilance: VigilanceDepartement,
  niveau: NiveauAlerte
): string {
  const phenomenes = [
    {
      nom: "vent",
      couleur: couleurPourPhenomene(
        vigilance,
        "vent"
      ),
    },
    {
      nom: "pluie-inondation",
      couleur: couleurPourPhenomene(
        vigilance,
        "pluie-inondation"
      ),
    },
    {
      nom: "orages",
      couleur: couleurPourPhenomene(
        vigilance,
        "orages"
      ),
    },
  ];

  return (
    phenomenes.find(
      (phenomene) =>
        phenomene.couleur === niveau
    )?.nom ?? "conditions météorologiques"
  );
}

/**
 * Décision opérationnelle complète du chantier.
 *
 * Hiérarchie :
 *
 * 1. Vigilance rouge officielle
 *    → arrêt total automatique
 *
 * 2. Risque technique rouge
 *    → arrêt total automatique
 *
 * 3. Vigilance orange officielle
 *    → validation humaine
 *
 * 4. Risque technique orange
 *    → validation humaine
 *
 * 5. Vigilance jaune
 *    → validation humaine
 *    ou arrêt automatique si pluie continue
 *
 * 6. Pluie continue
 *    → arrêt automatique
 *
 * 7. Risque technique jaune
 *    → validation humaine
 *
 * 8. Sinon
 *    → conditions normales
 */
export function evaluerJourChantier(
  materiau: Materiau,
  acces: Acces,
  meteoJour: {
    rafalesMax: number;
    pluieCumul: number;
    tempMax: number;
  },
  heures: HeureMeteo[],
  vigilance: VigilanceDepartement,
  zoneVent: number = 1,
  estEnAngle: boolean = false
): DecisionJourChantier {
  /*
   * 1. Risque technique local.
   */
  const risqueTechnique =
    evaluerAlerteChantier(
      materiau,
      acces,
      meteoJour,
      zoneVent,
      estEnAngle
    );

  /*
   * 2. Vigilance officielle Météo-France.
   */
  const vigilanceOfficielle =
    determinerVigilanceOfficielle(
      vigilance
    );

  /*
   * 3. Pluie continue.
   */
  const pluieContinue =
    pleutTouteLaJournee(heures);

  /*
   * 4. Vigilance ROUGE officielle.
   *
   * C'est la priorité absolue.
   */
  if (
    vigilanceOfficielle === "rouge"
  ) {
    const cause =
      determinerCauseVigilance(
        vigilance,
        vigilanceOfficielle
      );

    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: true,
      aValider: false,
      ampleurImpact: "complete",
      motif:
        `Vigilance ROUGE Météo-France (${cause}) ` +
        `• arrêt total du chantier.`,
    };
  }

  /*
   * 5. Risque technique ROUGE.
   *
   * Même si Météo-France est vert,
   * les conditions locales peuvent rendre
   * une opération techniquement dangereuse.
   */
  if (
    risqueTechnique.niveau === "rouge"
  ) {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: true,
      aValider: false,
      ampleurImpact: "complete",
      motif:
        `Arrêt technique chantier : ` +
        `${risqueTechnique.motif}`,
    };
  }

  /*
   * 6. Vigilance ORANGE officielle.
   */
  if (
    vigilanceOfficielle === "orange"
  ) {
    const cause =
      determinerCauseVigilance(
        vigilance,
        vigilanceOfficielle
      );

    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",
      motif:
        `Vigilance ORANGE Météo-France (${cause}) ` +
        `• arrêt partiel ou complet à valider par le chef de chantier.`,
    };
  }

  /*
   * 7. Risque technique ORANGE.
   */
  if (
    risqueTechnique.niveau === "orange"
  ) {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",
      motif:
        `Risque technique chantier important ` +
        `• ${risqueTechnique.motif}`,
    };
  }

  /*
   * 8. Vigilance JAUNE + pluie continue.
   */
  if (
    vigilanceOfficielle === "jaune" &&
    pluieContinue
  ) {
    const cause =
      determinerCauseVigilance(
        vigilance,
        vigilanceOfficielle
      );

    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: true,
      aValider: false,
      ampleurImpact: "complete",
      motif:
        `Vigilance JAUNE Météo-France (${cause}) ` +
        `+ pluie continue constatée ` +
        `• arrêt du chantier.`,
    };
  }

  /*
   * 9. Pluie continue sans vigilance officielle.
   */
  if (pluieContinue) {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: true,
      aValider: false,
      ampleurImpact: "complete",
      motif:
        `Pluie continue constatée sur le chantier ` +
        `• conditions incompatibles avec certains travaux.`,
    };
  }

  /*
   * 10. Vigilance JAUNE sans pluie continue.
   */
  if (
    vigilanceOfficielle === "jaune"
  ) {
    const cause =
      determinerCauseVigilance(
        vigilance,
        vigilanceOfficielle
      );

    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",
      motif:
        `Vigilance JAUNE Météo-France (${cause}) ` +
        `• conditions dégradées à surveiller et valider.`,
    };
  }

  /*
   * 11. Risque technique JAUNE.
   */
  if (
    risqueTechnique.niveau === "jaune"
  ) {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",
      motif:
        `Vigilance technique chantier ` +
        `• ${risqueTechnique.motif}`,
    };
  }

  /*
   * 12. Tout est normal.
   */
  return {
    vigilanceOfficielle,
    risqueTechnique,
    pluieContinue,
    jourArrete: false,
    aValider: false,
    ampleurImpact: null,
    motif:
      "Conditions météorologiques et techniques normales.",
  };
}

/* ------------------------------------------------------------------ */
/* Libellés                                                            */
/* ------------------------------------------------------------------ */

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
