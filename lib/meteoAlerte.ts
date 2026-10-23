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
  LectureHoraires,
  SynthesePose,
  evaluerAvisMateriaux,
  lireHorairesPose,
  synthetiserPose,
} from "./meteoHoraire";
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

/**
 * Mesures de la journée.
 *
 * `null` = grandeur NON CONNUE (aucune heure de la série ne l'a fournie). La
 * règle d'or : un `null` n'est jamais converti en 0, et une grandeur manquante
 * ne produit jamais un seuil franchi — elle produit un état « incomplet » que
 * l'écran doit afficher.
 */
export interface MeteoJour {
  rafalesMax: number | null;
  pluieCumul: number | null;
  tempMax: number | null;
}

export interface RisqueTechnique {
  niveau: NiveauAlerte;
  motif: string;
  /**
   * `true` quand au moins une grandeur manquait : le niveau affiché est alors
   * un PLANCHER (ce qui est certain), pas une conclusion (ce qui ne l'est
   * pas). Un vert « incomplet » doit être affiché comme tel.
   */
  incomplet?: boolean;
  /** Grandeurs manquantes, pour l'affichage. */
  manquantes?: string[];
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

export const SEUILS_MATERIAUX: Record<
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

export const SEUILS_ACCES: Record<
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

  // Une grandeur manquante ne franchit AUCUN seuil, mais elle est TRACÉE :
  // le résultat est marqué `incomplet` pour que l'écran affiche « non déterminé »
  // plutôt qu'un vert silencieux.
  const connu = (v: number | null): v is number =>
    typeof v === "number" && Number.isFinite(v);

  const manquantes: string[] = [];
  if (!connu(meteo.rafalesMax)) manquantes.push("rafales");
  if (!connu(meteo.pluieCumul)) manquantes.push("pluie");
  if (!connu(meteo.tempMax)) manquantes.push("température");

  const incomplet = manquantes.length > 0;
  const suffixe = incomplet
    ? ` (donnée manquante : ${manquantes.join(", ")})`
    : "";

  // 1. Vent critique — PRIORITÉ CONSERVÉE avant la pluie, comme aujourd'hui.
  if (connu(meteo.rafalesMax) && meteo.rafalesMax >= ventCritique) {
    return {
      niveau: "rouge",
      motif: `Vent critique (${meteo.rafalesMax} km/h ≥ seuil ${ventCritique} km/h)${suffixe}`,
    };
  }

  // 2. Pluie importante
  //
  // Même logique que l'Edge Function :
  // le cumul doit atteindre à la fois le seuil du matériau
  // et 8 mm sur la journée.
  if (
    connu(meteo.pluieCumul) &&
    meteo.pluieCumul >= sm.pluie_critique &&
    meteo.pluieCumul >= 8
  ) {
    return {
      niveau: "rouge",
      motif: `Pluie critique (${meteo.pluieCumul.toFixed(1)} mm)${suffixe}`,
    };
  }

  // 3. Température limite
  if (
    connu(meteo.tempMax) &&
    (meteo.tempMax <= sm.temp_mini ||
    meteo.tempMax >= sm.temp_maxi)
  ) {
    return {
      niveau: "orange",
      motif: `Température limite (${meteo.tempMax}°C) pour ${materiau}${suffixe}`,
    };
  }

  // 4. Vent de vigilance
  if (connu(meteo.rafalesMax) && meteo.rafalesMax >= ventVigilance) {
    return {
      niveau: "jaune",
      motif: `Vent de vigilance (${meteo.rafalesMax} km/h)${suffixe}`,
    };
  }

  return {
    niveau: "vert",
    motif: incomplet
      ? `Conditions non déterminées${suffixe}`
      : "Conditions optimales de pose",
    incomplet,
    ...(incomplet ? { manquantes } : {}),
  };
}

// -----------------------------------------------------------------------------
// 1-bis. DÉCISION DE POSE SUR LES HORAIRES DU CHANTIER
// -----------------------------------------------------------------------------
//
// C'est la fonction qui remplace, pour les DÉCISIONS DE POSE affichées aux
// équipes, l'évaluation sur la journée entière.
//
// Règle corrigée : le cumul JOURNALIER de pluie ne déclenche plus « Pose
// interdite ». Les mêmes seuils s'appliquent MAINTENANT sur les heures
// pendant lesquelles l'équipe pose réellement. Un chantier de 7 h à 17 h
// n'interdit donc plus la pose parce qu'il a plu toute la nuit.
//
// Ce qui ne change PAS :
//   - aucun seuil n'est redéfini : `SEUILS_MATERIAUX` et `SEUILS_ACCES`
//     servent tels quels ;
//   - la priorité « vent critique avant pluie critique » est conservée ;
//   - le cumul journalier reste calculé et affiché, en information.
//
// Ce qui change :
//   - le périmètre du calcul (fenêtre de pose, et non 24 h) ;
//   - une donnée manquante produit « non déterminé », et non un vert.
// -----------------------------------------------------------------------------

export interface ResultatPose {
  statut: "evaluee" | "non_determine";
  /** Niveau de pose, présent seulement si `statut === "evaluee"`. */
  niveau: NiveauAlerte | null;
  motif: string;
  /** Découpage pose / hors pose, communiqué tel quel à l'affichage. */
  synthese: SynthesePose;
  /** Avertissements matériaux, distincts du niveau de pose. */
  avertissements: string[];
  /** État de la lecture des horaires saisis. */
  horairesStatut: LectureHoraires["statut"];
  /** Fenêtre utilisée, en `HH:MM`, ou `null`. */
  fenetre: { debut: string; fin: string } | null;
}

/** Formate une minute depuis minuit en `HH:MM`. */
function versHeureTexte(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Évalue la pose d'UN chantier sur SES horaires.
 *
 * @param horaires Texte libre `chantiers.horaires`. `null` / vide →
 *   `non_configuree` : aucun défaut n'est appliqué.
 * @param heures   Série horaire de la journée, avec `null` pour les grandeurs
 *   non renvoyées par la source.
 */
export function evaluerPoseChantier(
  materiau: Materiau,
  acces: Acces,
  horaires: string | null | undefined,
  heures: HeureMeteo[]
): ResultatPose {
  const lecture: LectureHoraires = lireHorairesPose(horaires);
  const synthese = synthetiserPose(heures ?? [], lecture);

  const fenetre =
    lecture.statut === "configuree"
      ? {
          debut: versHeureTexte(lecture.fenetre.debutMinutes),
          fin: versHeureTexte(lecture.fenetre.finMinutes),
        }
      : null;

  const avertissements = evaluerAvisMateriaux({
    heures: heures ?? [],
    synthese,
    seuilRafaleChantier: Math.min(
      (SEUILS_MATERIAUX[materiau] ?? SEUILS_MATERIAUX.bois).vent_critique,
      (SEUILS_ACCES[acces] ?? SEUILS_ACCES.echafaudage).vent_critique
    ),
  });

  // ── Horaires absents : PAS de décision, et surtout PAS de vert ────────────
  if (lecture.statut === "non_configuree") {
    return {
      statut: "non_determine",
      niveau: null,
      motif:
        "Horaires de pose non configurés sur ce chantier — impact de pose non déterminé. " +
        "Le cumul journalier (" +
        (synthese.pluieJour === null ? "pluie inconnue" : `${synthese.pluieJour} mm`) +
        ") reste consultable sans décider de la pose.",
      synthese,
      avertissements,
      horairesStatut: lecture.statut,
      fenetre: null,
    };
  }

  // ── Horaires illisibles : on dit QUOI, pour pouvoir corriger ──────────────
  if (lecture.statut === "illisible") {
    return {
      statut: "non_determine",
      niveau: null,
      motif:
        `Horaires de pose illisibles (« ${lecture.brut} ») — impact de pose non déterminé. ` +
        "Corriger la saisie des horaires pour obtenir une décision.",
      synthese,
      avertissements,
      horairesStatut: lecture.statut,
      fenetre: null,
    };
  }

  // ── Fenêtre lue mais vide de données : jamais une conclusion verte ────────
  //
  // Garde explicite (plutôt que `fenetreEvaluable`) pour que TypeScript
  // sache, à partir d'ici, que `synthese.fenetre` est bien renseignée.
  if (
    synthese.fenetre === null ||
    synthese.heuresPoseConnues === 0 ||
    synthese.heuresPoseAvecPluie === 0
  ) {
    return {
      statut: "non_determine",
      niveau: null,
      motif:
        `Aucune donnée horaire disponible pendant les horaires de pose ` +
        `(${synthese.heuresPoseConnues} heure(s) reçue(s) sur ${synthese.heuresPoseAttendues}) ` +
        `— impact de pose non déterminé. Une donnée manquante n'est jamais un temps sec.`,
      synthese,
      avertissements,
      horairesStatut: lecture.statut,
      fenetre,
    };
  }

  // ── Décision : mêmes seuils, périmètre pose ───────────────────────────────
  const risque = evaluerAlerteChantier(materiau, acces, {
    rafalesMax: synthese.rafalesPendantPose,
    pluieCumul: synthese.pluiePendantPose,
    tempMax: synthese.tempPendantPose,
  });

  if (risque.incomplet) {
    return {
      statut: "non_determine",
      niveau: null,
      motif:
        `Données incomplètes pendant les horaires de pose (${risque.motif}) ` +
        `— impact de pose non déterminé.`,
      synthese,
      avertissements,
      horairesStatut: lecture.statut,
      fenetre,
    };
  }

  return {
    statut: "evaluee",
    niveau: risque.niveau,
    motif:
      `${risque.motif}, sur les horaires de pose ` +
      `${versHeureTexte(synthese.fenetre.debutMinutes)}–${versHeureTexte(synthese.fenetre.finMinutes)}`,
    synthese,
    avertissements,
    horairesStatut: lecture.statut,
    fenetre,
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
 *
 * Une heure SANS donnée (`pluie: null`) n'est jamais comptée pluvieuse : c'est
 * le comportement antérieur (la valeur manquante était alors `0`), conservé à
 * l'identique pour ne pas modifier la qualification des rapports d'intempéries.
 */
export function pleutTouteLaJournee(
  heures: HeureMeteo[]
): boolean {
  if (!heures || heures.length === 0) {
    return false;
  }

  const heuresPluvieuses = heures.filter(
    (h) => (h.pluie ?? -1) >= SEUIL_PLUIE_HORAIRE_MM
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
