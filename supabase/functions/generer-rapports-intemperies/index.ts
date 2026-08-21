// supabase/functions/generer-rapports-intemperies/index.ts
//
// Génération automatique des rapports d'intempéries.
//
// Deux modes:
//
// 1. CAPTURE
//    Appelé par un cron le matin et l'après-midi.
//    Exemple:
//      { "mode": "capture", "periode": "matin" }
//      { "mode": "capture", "periode": "apresmidi" }
//
//    Enregistre uniquement la vigilance officielle Météo-France
//    dans vigilance_captures.
//
// 2. GENERER
//    Appelé le soir.
//    Récupère:
//      - les captures de vigilance du matin
//      - les captures de vigilance de l'après-midi
//      - la météo réelle de la journée via Visual Crossing
//      - les caractéristiques du chantier
//
//    Puis décide si:
//      - le jour est arrêté
//      - le rapport doit être validé
//      - aucun rapport n'est nécessaire.
//
// Secrets nécessaires:
//
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   VISUALCROSSING_API_KEY
//   METEOFRANCE_API_KEY
//

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// -----------------------------------------------------------------------------
// Supabase
// -----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY"
);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant"
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

// -----------------------------------------------------------------------------
// Clés API
// -----------------------------------------------------------------------------

const VISUALCROSSING_API_KEY =
  Deno.env.get("VISUALCROSSING_API_KEY");

const METEOFRANCE_API_KEY =
  Deno.env.get("METEOFRANCE_API_KEY");

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type HeureMeteo = {
  heure: string;
  temp: number;
  vent: number;
  rafales: number;
  pluie: number;
};

type NiveauAlerte =
  | "vert"
  | "jaune"
  | "orange"
  | "rouge";

type Materiau =
  | "bois"
  | "metal"
  | "composite"
  | "fibrociment";

type Acces =
  | "echafaudage"
  | "nacelle";

type Periode =
  | "matin"
  | "apresmidi";

type AmpleurImpact =
  | "complete"
  | "partielle"
  | null;

type VigilancePhenomene = {
  id: number;
  nom: string;
  couleur: NiveauAlerte;
};

type VigilanceInfo = {
  couleurMax: NiveauAlerte;
  phenomenes: VigilancePhenomene[];
};

type RisqueTechnique = {
  niveau: NiveauAlerte;
  motif: string;
};

type DecisionJour = {
  vigilanceOfficielle: NiveauAlerte;
  risqueTechnique: RisqueTechnique;
  pluieContinue: boolean;
  jourArrete: boolean;
  aValider: boolean;
  ampleurImpact: AmpleurImpact;
  motif: string;
};

// -----------------------------------------------------------------------------
// Ordre des niveaux de vigilance
// -----------------------------------------------------------------------------

const ORDRE: Record<NiveauAlerte, number> = {
  vert: 0,
  jaune: 1,
  orange: 2,
  rouge: 3,
};

function plusForte(
  a: NiveauAlerte,
  b: NiveauAlerte
): NiveauAlerte {
  return ORDRE[a] >= ORDRE[b] ? a : b;
}

// -----------------------------------------------------------------------------
// Adresse -> département
// -----------------------------------------------------------------------------

function adresseVersDepartement(
  adresse: string | null
): string | null {
  if (!adresse) {
    return null;
  }

  const raw = adresse.trim();

  if (!raw) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // Code postal
  // ---------------------------------------------------------------------------

  const matchCP = raw.match(/\b(\d{5})\b/);

  if (matchCP) {
    const cp = matchCP[1];

    // DOM-TOM
    if (cp.startsWith("97")) {
      return cp.slice(0, 3);
    }

    // Corse
    if (cp.startsWith("20")) {
      const valeur = Number.parseInt(cp, 10);

      return valeur <= 20190
        ? "2A"
        : "2B";
    }

    return cp.slice(0, 2);
  }

  // ---------------------------------------------------------------------------
  // Département déjà présent
  // ---------------------------------------------------------------------------

  const matchDept = raw.match(
    /\b(2A|2B|\d{2})\b/i
  );

  if (matchDept) {
    return matchDept[1].toUpperCase();
  }

  // ---------------------------------------------------------------------------
  // Quelques villes principales
  // ---------------------------------------------------------------------------

  const lower = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const villes: Record<string, string> = {
    ajaccio: "2A",
    "porto vecchio": "2A",
    portovecchio: "2A",
    propriano: "2A",
    bonifacio: "2A",
    sartene: "2A",
    bastia: "2B",
    calvi: "2B",
    corte: "2B",
    "ile rousse": "2B",

    bordeaux: "33",
    merignac: "33",
    pessac: "33",
    talence: "33",
    cenon: "33",
    arcachon: "33",
    libourne: "33",
    gironde: "33",

    pau: "64",
    bayonne: "64",
    biarritz: "64",
    anglet: "64",

    montdemarsan: "40",
    dax: "40",

    perigueux: "24",
    bergerac: "24",

    agen: "47",

    larochelle: "17",
    saintes: "17",
    rochefort: "17",

    angouleme: "16",
    cognac: "16",

    poitiers: "86",
    niort: "79",
    limoges: "87",

    paris: "75",
    marseille: "13",
    lyon: "69",
    toulouse: "31",
    nice: "06",
    nantes: "44",
    rennes: "35",
    strasbourg: "67",
    montpellier: "34",
    lille: "59",
    toulon: "83",
    grenoble: "38",
    rouen: "76",
    caen: "14",
    dijon: "21",
    tours: "37",
    amiens: "80",
    annecy: "74",
    perpignan: "66",
    metz: "57",
    nancy: "54",
    avignon: "84",
  };

  for (const [ville, departement] of Object.entries(villes)) {
    if (lower.includes(ville)) {
      return departement;
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// Visual Crossing
// -----------------------------------------------------------------------------

async function fetchMeteoJour(
  adresse: string
): Promise<{
  heures: HeureMeteo[];
  tempMax: number;
  rafalesMax: number;
  pluieCumul: number;
}> {
  if (!VISUALCROSSING_API_KEY) {
    throw new Error(
      "VISUALCROSSING_API_KEY non configurée"
    );
  }

  const url =
    "https://weather.visualcrossing.com/" +
    "VisualCrossingWebServices/rest/services/timeline/" +
    `${encodeURIComponent(adresse)}/today` +
    `?unitGroup=metric` +
    `&key=${VISUALCROSSING_API_KEY}` +
    `&contentType=json` +
    `&include=days,hours` +
    `&elements=datetime,temp,windspeed,windgust,precip`;

  const response = await fetch(url);

  if (!response.ok) {
    const texte = await response.text();

    throw new Error(
      `Erreur Visual Crossing (${response.status}) ${texte}`
    );
  }

  const data = await response.json();

  const today = data?.days?.[0];

  if (!today) {
    throw new Error(
      "Pas de données météo pour cette adresse"
    );
  }

  const heures: HeureMeteo[] = (
    today.hours ?? []
  ).map((h: any) => ({
    heure:
      typeof h.datetime === "string"
        ? h.datetime.slice(0, 5)
        : "--:--",

    temp:
      Number.isFinite(h.temp)
        ? Math.round(h.temp)
        : 0,

    vent:
      Number.isFinite(h.windspeed)
        ? Math.round(h.windspeed)
        : 0,

    rafales:
      Number.isFinite(h.windgust)
        ? Math.round(h.windgust)
        : Number.isFinite(h.windspeed)
          ? Math.round(h.windspeed)
          : 0,

    pluie:
      Number.isFinite(h.precip)
        ? Number(h.precip)
        : 0,
  }));

  const tempMax =
    heures.length > 0
      ? Math.max(...heures.map((h) => h.temp))
      : 0;

  const rafalesMax =
    heures.length > 0
      ? Math.max(...heures.map((h) => h.rafales))
      : 0;

  const pluieCumul = heures.reduce(
    (total, heure) =>
      total + heure.pluie,
    0
  );

  return {
    heures,
    tempMax,
    rafalesMax,
    pluieCumul,
  };
}

// -----------------------------------------------------------------------------
// Vigilance Météo-France
// -----------------------------------------------------------------------------

const URL_VIGILANCE =
  "https://public-api.meteofrance.fr/public/" +
  "DPVigilance/v1/cartevigilance/encours";

const COULEUR_PAR_ID: Record<
  number,
  NiveauAlerte
> = {
  1: "vert",
  2: "jaune",
  3: "orange",
  4: "rouge",
};

const PHENOMENE_PAR_ID: Record<
  number,
  string
> = {
  1: "vent",
  2: "pluie-inondation",
  3: "orages",
  4: "inondation",
  5: "neige-verglas",
  6: "canicule",
  7: "grand-froid",
  8: "avalanches",
  9: "vagues-submersion",
};

async function fetchVigilance(
  departement: string
): Promise<VigilanceInfo> {
  if (!METEOFRANCE_API_KEY) {
    throw new Error(
      "METEOFRANCE_API_KEY non configurée"
    );
  }

  const response = await fetch(
    URL_VIGILANCE,
    {
      headers: {
        apikey: METEOFRANCE_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const texte = await response.text();

    throw new Error(
      `Erreur Vigilance Météo-France (${response.status}) ${texte}`
    );
  }

  const data = await response.json();

  // ---------------------------------------------------------------------------
  // Même logique d'extraction que /api/meteo-vigilance
  // ---------------------------------------------------------------------------

  const periodes =
    data?.product?.periods ??
    data?.periods ??
    [];

  if (
    !Array.isArray(periodes) ||
    periodes.length === 0
  ) {
    return {
      couleurMax: "vert",
      phenomenes: [],
    };
  }

  const periode =
    periodes[0];

  const domaines =
    periode?.timelaps?.domain_ids ??
    periode?.domain_ids ??
    [];

  const domaineArray: any[] =
    Array.isArray(domaines)
      ? domaines
      : Object.values(
          domaines ?? {}
        );

  const deptNormalized =
    departement
      .trim()
      .toUpperCase();

  const domaineDept =
    domaineArray.find((d: any) => {
      const id =
        d?.domain_id
          ?.toString()
          .trim()
          .toUpperCase();

      if (!id) {
        return false;
      }

      if (id === deptNormalized) {
        return true;
      }

      if (
        deptNormalized === "2A" &&
        [
          "20A",
          "2A",
          "200",
          "201",
        ].includes(id)
      ) {
        return true;
      }

      if (
        deptNormalized === "2B" &&
        [
          "20B",
          "2B",
          "202",
        ].includes(id)
      ) {
        return true;
      }

      return false;
    });

  if (!domaineDept) {
    return {
      couleurMax: "vert",
      phenomenes: [],
    };
  }

  const couleurMax =
    COULEUR_PAR_ID[
      domaineDept.max_color_id
    ] ?? "vert";

  const phenomenesBrut: any[] =
    domaineDept.phenomenon_items ??
    domaineDept.phenomenon_max_colors ??
    [];

  const phenomenes: VigilancePhenomene[] =
    phenomenesBrut
      .map((p: any) => {
        const id =
          p?.phenomenon_id ??
          p?.phenomenon_max_color_id
            ?.phenomenon_id;

        let couleurId: number | undefined;

        if (
          typeof p?.phenomenon_max_color_id ===
          "number"
        ) {
          couleurId =
            p.phenomenon_max_color_id;
        } else {
          couleurId =
            p?.color_id ??
            p?.max_color_id;
        }

        if (
          typeof id !== "number" ||
          !PHENOMENE_PAR_ID[id]
        ) {
          return null;
        }

        return {
          id,
          nom: PHENOMENE_PAR_ID[id],
          couleur:
            COULEUR_PAR_ID[
              couleurId ?? 0
            ] ?? "vert",
        };
      })
      .filter(
        (
          p
        ): p is VigilancePhenomene =>
          p !== null
      );

  return {
    couleurMax,
    phenomenes,
  };
}

// -----------------------------------------------------------------------------
// Couleur d'un phénomène
// -----------------------------------------------------------------------------

function couleurPhenomene(
  vigilance: VigilanceInfo,
  nom: string
): NiveauAlerte {
  return (
    vigilance.phenomenes.find(
      (p) => p.nom === nom
    )?.couleur ??
    vigilance.couleurMax
  );
}

// -----------------------------------------------------------------------------
// Vigilance pertinente pour le chantier
// -----------------------------------------------------------------------------

function vigilancePertinente(
  vigilance: VigilanceInfo
): NiveauAlerte {
  const vent =
    couleurPhenomene(
      vigilance,
      "vent"
    );

  const pluie =
    couleurPhenomene(
      vigilance,
      "pluie-inondation"
    );

  const orages =
    couleurPhenomene(
      vigilance,
      "orages"
    );

  return plusForte(
    plusForte(vent, pluie),
    orages
  );
}

// -----------------------------------------------------------------------------
// Seuils techniques
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
    pluie_critique: 1,
    temp_mini: 0,
    temp_maxi: 30,
  },

  metal: {
    vent_vigilance: 25,
    vent_critique: 45,
    pluie_critique: 1,
    temp_mini: 0,
    temp_maxi: 35,
  },

  composite: {
    vent_vigilance: 30,
    vent_critique: 60,
    pluie_critique: 1,
    temp_mini: 1,
    temp_maxi: 30,
  },

  fibrociment: {
    vent_vigilance: 30,
    vent_critique: 60,
    pluie_critique: 2,
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
// Risque technique
// -----------------------------------------------------------------------------

function evaluerRisqueTechnique(
  materiau: Materiau,
  acces: Acces,
  meteo: {
    rafalesMax: number;
    pluieCumul: number;
    tempMax: number;
  }
): RisqueTechnique {
  const sm =
    SEUILS_MATERIAUX[materiau] ??
    SEUILS_MATERIAUX.bois;

  const sa =
    SEUILS_ACCES[acces] ??
    SEUILS_ACCES.echafaudage;

  const ventCritique =
    Math.min(
      sm.vent_critique,
      sa.vent_critique
    );

  const ventVigilance =
    Math.min(
      sm.vent_vigilance,
      sa.vent_vigilance
    );

  // ---------------------------------------------------------------------------
  // Vent critique
  // ---------------------------------------------------------------------------

  if (
    meteo.rafalesMax >=
    ventCritique
  ) {
    return {
      niveau: "rouge",
      motif:
        `Vent critique (${meteo.rafalesMax} km/h ≥ seuil ${ventCritique} km/h)`,
    };
  }

  // ---------------------------------------------------------------------------
  // Pluie critique
  // ---------------------------------------------------------------------------

  if (
    meteo.pluieCumul >=
      sm.pluie_critique &&
    meteo.pluieCumul >= 8
  ) {
    return {
      niveau: "rouge",
      motif:
        `Pluie critique (${meteo.pluieCumul.toFixed(1)} mm)`,
    };
  }

  // ---------------------------------------------------------------------------
  // Température limite
  // ---------------------------------------------------------------------------

  if (
    meteo.tempMax <= sm.temp_mini ||
    meteo.tempMax >= sm.temp_maxi
  ) {
    return {
      niveau: "orange",
      motif:
        `Température limite (${meteo.tempMax}°C) pour ${materiau}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Vent de vigilance
  // ---------------------------------------------------------------------------

  if (
    meteo.rafalesMax >=
    ventVigilance
  ) {
    return {
      niveau: "jaune",
      motif:
        `Vent de vigilance (${meteo.rafalesMax} km/h)`,
    };
  }

  return {
    niveau: "vert",
    motif:
      "Conditions optimales de pose",
  };
}

// -----------------------------------------------------------------------------
// Pluie continue
// -----------------------------------------------------------------------------

const SEUIL_PLUIE_HORAIRE_MM = 0.2;
const FRACTION_MINI_HEURES_PLUIE = 0.75;

function pleutTouteLaJournee(
  heures: HeureMeteo[]
): boolean {
  if (!heures.length) {
    return false;
  }

  const heuresPluvieuses =
    heures.filter(
      (h) =>
        h.pluie >=
        SEUIL_PLUIE_HORAIRE_MM
    ).length;

  return (
    heuresPluvieuses /
      heures.length >=
    FRACTION_MINI_HEURES_PLUIE
  );
}

// -----------------------------------------------------------------------------
// Décision finale
// -----------------------------------------------------------------------------

function evaluerJour(
  materiau: Materiau,
  acces: Acces,
  meteoJour: {
    rafalesMax: number;
    pluieCumul: number;
    tempMax: number;
  },
  heures: HeureMeteo[],
  vigilanceMatin:
    NiveauAlerte | null,
  vigilanceApresmidi:
    NiveauAlerte | null
): DecisionJour {
  const risqueTechnique =
    evaluerRisqueTechnique(
      materiau,
      acces,
      meteoJour
    );

  const pluieContinue =
    pleutTouteLaJournee(
      heures
    );

  const vMatin =
    vigilanceMatin ??
    "vert";

  const vAprem =
    vigilanceApresmidi ??
    "vert";

  const vigilanceOfficielle =
    plusForte(
      vMatin,
      vAprem
    );

  const evolution =
    vigilanceMatin &&
    vigilanceApresmidi &&
    vigilanceMatin !==
      vigilanceApresmidi
      ? ` (vigilance ${vigilanceMatin} le matin, vigilance ${vigilanceApresmidi} l'après-midi)`
      : "";

  const risqueConfirmeParLeTerrain =
    risqueTechnique.niveau ===
      "orange" ||
    risqueTechnique.niveau ===
      "rouge";

  // ---------------------------------------------------------------------------
  // ROUGE
  // ---------------------------------------------------------------------------

  if (
    vigilanceOfficielle ===
    "rouge"
  ) {
    if (
      risqueConfirmeParLeTerrain
    ) {
      return {
        vigilanceOfficielle,
        risqueTechnique,
        pluieContinue,
        jourArrete: true,
        aValider: false,
        ampleurImpact: "complete",
        motif:
          `Vigilance rouge Météo-France confirmée par les mesures du chantier${evolution} — arrêt de chantier`,
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
        `Vigilance rouge Météo-France${evolution}, mais aucun dépassement mesuré sur le chantier — à confirmer par le chef de chantier`,
    };
  }

  // ---------------------------------------------------------------------------
  // ORANGE
  // ---------------------------------------------------------------------------

  if (
    vigilanceOfficielle ===
    "orange"
  ) {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",
      motif:
        `Vigilance orange Météo-France${evolution} — arrêt à confirmer selon le déroulement réel de la journée`,
    };
  }

  // ---------------------------------------------------------------------------
  // JAUNE
  // ---------------------------------------------------------------------------

  if (
    vigilanceOfficielle ===
    "jaune"
  ) {
    if (pluieContinue) {
      return {
        vigilanceOfficielle,
        risqueTechnique,
        pluieContinue,
        jourArrete: true,
        aValider: false,
        ampleurImpact: "complete",
        motif:
          "Vigilance jaune Météo-France + pluie continue constatée toute la journée — arrêt de chantier",
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
        `Vigilance jaune Météo-France${evolution} — conditions météo dégradées à surveiller sur le chantier`,
    };
  }

  // ---------------------------------------------------------------------------
  // VERT + pluie continue
  // ---------------------------------------------------------------------------

  if (
    vigilanceOfficielle ===
      "vert" &&
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
        "Pluie continue constatée toute la journée (hors vigilance officielle)",
    };
  }

  // ---------------------------------------------------------------------------
  // Dépassement technique malgré vigilance verte
  // ---------------------------------------------------------------------------

  if (
    risqueConfirmeParLeTerrain
  ) {
    const contexte =
      vigilanceOfficielle ===
      "vert"
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
        `${contexte}, mais dépassement mesuré sur le chantier (${risqueTechnique.motif}) — à confirmer par le chef de chantier`,
    };
  }

  // ---------------------------------------------------------------------------
  // Conditions normales
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
// Numéro du rapport
// -----------------------------------------------------------------------------

async function prochainNumero(): Promise<string> {
  const annee =
    new Date().getFullYear();

  const prefixe =
    `RI-${annee}-`;

  const { data, error } =
    await supabase
      .from("rapports_intemperies")
      .select("numero")
      .ilike(
        "numero",
        `${prefixe}%`
      );

  if (error) {
    throw new Error(
      `Impossible de récupérer les numéros de rapports : ${error.message}`
    );
  }

  const numeros =
    (data ?? [])
      .map((rapport: any) => {
        const morceaux =
          String(
            rapport.numero ?? ""
          ).split("-");

        return Number.parseInt(
          morceaux[2] ?? "0",
          10
        ) || 0;
      });

  const suivant =
    (numeros.length
      ? Math.max(...numeros)
      : 0) + 1;

  return (
    `${prefixe}` +
    String(suivant)
      .padStart(3, "0")
  );
}

// -----------------------------------------------------------------------------
// Début de journée
// -----------------------------------------------------------------------------

function debutJournee(): Date {
  const date = new Date();

  date.setHours(
    0,
    0,
    0,
    0
  );

  return date;
}

// -----------------------------------------------------------------------------
// MODE CAPTURE
// -----------------------------------------------------------------------------

async function modeCapture(
  periode: Periode
): Promise<Response> {
  const resultats: {
    chantier: string;
    statut: string;
  }[] = [];

  const {
    data: chantiers,
    error,
  } = await supabase
    .from("chantiers")
    .select(
      "id, nom, adresse_chantier"
    )
    .neq(
      "statut",
      "termine"
    );

  if (
    error ||
    !chantiers
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Impossible de lister les chantiers",
        detail: error,
      }),
      {
        status: 500,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
  }

  const debut =
    debutJournee();

  for (const chantier of chantiers) {
    const nom =
      chantier.nom ??
      chantier.id;

    const adresse =
      chantier.adresse_chantier as
        | string
        | null;

    if (!adresse) {
      resultats.push({
        chantier: nom,
        statut:
          "ignoré (pas d'adresse)",
      });

      continue;
    }

    try {
      // -----------------------------------------------------------------------
      // Évite une double capture le même jour
      // -----------------------------------------------------------------------

      const {
        data: existant,
      } = await supabase
        .from("vigilance_captures")
        .select("id")
        .eq(
          "chantier_id",
          chantier.id
        )
        .eq(
          "periode",
          periode
        )
        .gte(
          "capture_le",
          debut.toISOString()
        )
        .maybeSingle();

      if (existant) {
        resultats.push({
          chantier: nom,
          statut:
            `capture ${periode} déjà faite aujourd'hui`,
        });

        continue;
      }

      // -----------------------------------------------------------------------
      // Département
      // -----------------------------------------------------------------------

      const departement =
        adresseVersDepartement(
          adresse
        );

      let couleur: NiveauAlerte =
        "vert";

      let phenomenes:
        VigilancePhenomene[] =
        [];

      // -----------------------------------------------------------------------
      // Vigilance officielle
      // -----------------------------------------------------------------------

      if (departement) {
        const vigilance =
          await fetchVigilance(
            departement
          );

        couleur =
          vigilancePertinente(
            vigilance
          );

        phenomenes =
          vigilance.phenomenes;
      }

      // -----------------------------------------------------------------------
      // Enregistrement
      // -----------------------------------------------------------------------

      const {
        error: erreurInsert,
      } = await supabase
        .from(
          "vigilance_captures"
        )
        .insert({
          chantier_id:
            chantier.id,
          periode,
          departement,
          vigilance_couleur:
            couleur,
          vigilance_phenomenes:
            phenomenes,
        });

      if (erreurInsert) {
        throw erreurInsert;
      }

      resultats.push({
        chantier: nom,
        statut:
          `capture ${periode} enregistrée (${couleur})`,
      });
    } catch (error) {
      resultats.push({
        chantier: nom,
        statut:
          `erreur : ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
      });
    }
  }

  return new Response(
    JSON.stringify(
      {
        mode: "capture",
        periode,
        resultats,
      },
      null,
      2
    ),
    {
      headers: {
        "Content-Type":
          "application/json",
      },
    }
  );
}

// -----------------------------------------------------------------------------
// MODE GÉNÉRATION
// -----------------------------------------------------------------------------

async function modeGenerer(
  force: boolean
): Promise<Response> {
  const resultats: {
    chantier: string;
    statut: string;
  }[] = [];

  const {
    data: chantiers,
    error,
  } = await supabase
    .from("chantiers")
    .select(
      "id, nom, adresse_chantier, materiau_structurel, moyen_acces"
    )
    .neq(
      "statut",
      "termine"
    );

  if (
    error ||
    !chantiers
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Impossible de lister les chantiers",
        detail: error,
      }),
      {
        status: 500,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
  }

  const debut =
    debutJournee();

  for (const chantier of chantiers) {
    const nom =
      chantier.nom ??
      chantier.id;

    const adresse =
      chantier.adresse_chantier as
        | string
        | null;

    if (!adresse) {
      resultats.push({
        chantier: nom,
        statut:
          "ignoré (pas d'adresse)",
      });

      continue;
    }

    try {
      // -----------------------------------------------------------------------
      // Empêche plusieurs rapports le même jour
      // -----------------------------------------------------------------------

      const {
        data: existant,
      } = await supabase
        .from(
          "rapports_intemperies"
        )
        .select("id")
        .eq(
          "chantier_id",
          chantier.id
        )
        .gte(
          "cree_le",
          debut.toISOString()
        )
        .maybeSingle();

      if (existant) {
        resultats.push({
          chantier: nom,
          statut:
            "déjà généré aujourd'hui",
        });

        continue;
      }

      // -----------------------------------------------------------------------
      // Récupération des captures
      // -----------------------------------------------------------------------

      const {
        data: captures,
        error:
          erreurCaptures,
      } = await supabase
        .from(
          "vigilance_captures"
        )
        .select(
          "periode, vigilance_couleur, vigilance_phenomenes"
        )
        .eq(
          "chantier_id",
          chantier.id
        )
        .gte(
          "capture_le",
          debut.toISOString()
        );

      if (erreurCaptures) {
        throw erreurCaptures;
      }

      const captureMatin =
        captures?.find(
          (capture: any) =>
            capture.periode ===
            "matin"
        );

      const captureApresmidi =
        captures?.find(
          (capture: any) =>
            capture.periode ===
            "apresmidi"
        );

      const vigilanceMatin =
        (
          captureMatin
            ?.vigilance_couleur ??
          null
        ) as
          | NiveauAlerte
          | null;

      const vigilanceApresmidi =
        (
          captureApresmidi
            ?.vigilance_couleur ??
          null
        ) as
          | NiveauAlerte
          | null;

      // -----------------------------------------------------------------------
      // Météo réelle de la journée
      // -----------------------------------------------------------------------

      const meteoJour =
        await fetchMeteoJour(
          adresse
        );

      // -----------------------------------------------------------------------
      // Département
      // -----------------------------------------------------------------------

      const departement =
        adresseVersDepartement(
          adresse
        );

      // -----------------------------------------------------------------------
      // Matériau et accès
      //
      // Valeurs par défaut pour éviter qu'une donnée manquante fasse planter
      // toute la génération.
      // -----------------------------------------------------------------------

      const materiau =
        (
          chantier
            .materiau_structural ??
          "bois"
        ) as Materiau;

      const acces =
        (
          chantier
            .moyen_acces ??
          "echafaudage"
        ) as Acces;

      // -----------------------------------------------------------------------
      // Décision
      // -----------------------------------------------------------------------

      const decision =
        evaluerJour(
          materiau,
          acces,
          {
            rafalesMax:
              meteoJour.rafalesMax,
            tempMax:
              meteoJour.tempMax,
            pluieCumul:
              meteoJour.pluieCumul,
          },
          meteoJour.heures,
          vigilanceMatin,
          vigilanceApresmidi
        );

      // -----------------------------------------------------------------------
      // Rien à signaler
      // -----------------------------------------------------------------------

      if (
        !decision.jourArrete &&
        !decision.aValider &&
        !force
      ) {
        resultats.push({
          chantier: nom,
          statut:
            "conditions normales, pas de rapport",
        });

        continue;
      }

      // -----------------------------------------------------------------------
      // Numéro du rapport
      // -----------------------------------------------------------------------

      const numero =
        await prochainNumero();

      // -----------------------------------------------------------------------
      // Création du rapport
      // -----------------------------------------------------------------------

      const {
        error:
          erreurInsert,
      } = await supabase
        .from(
          "rapports_intemperies"
        )
        .insert({
          numero,

          chantier_id:
            chantier.id,

          vigilance_officielle:
            decision.vigilanceOfficielle,

          jour_arrete:
            decision.jourArrete,

          a_valider:
            decision.aValider,

          ampleur_impact:
            decision.ampleurImpact,

          pluie_continue:
            decision.pluieContinue,

          motif:
            decision.motif,

          risque_technique_niveau:
            decision
              .risqueTechnique
              .niveau,

          risque_technique_motif:
            decision
              .risqueTechnique
              .motif,

          temp_max:
            meteoJour.tempMax,

          rafales_max:
            meteoJour.rafalesMax,

          pluie_cumul:
            meteoJour.pluieCumul,

          materiau,

          acces,

          departement,

          releve_horaire:
            meteoJour.heures,

          cree_par:
            "auto",
        });

      if (erreurInsert) {
        throw erreurInsert;
      }

      resultats.push({
        chantier: nom,
        statut:
          `rapport ${numero} généré`,
      });
    } catch (error) {
      resultats.push({
        chantier: nom,
        statut:
          `erreur : ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
      });
    }
  }

  return new Response(
    JSON.stringify(
      {
        mode: "generer",
        force,
        resultats,
      },
      null,
      2
    ),
    {
      headers: {
        "Content-Type":
          "application/json",
      },
    }
  );
}

// -----------------------------------------------------------------------------
// HANDLER PRINCIPAL
// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  let mode:
    | "capture"
    | "generer" = "generer";

  let periode: Periode =
    "matin";

  let force = false;

  // ---------------------------------------------------------------------------
  // Lecture du body
  // ---------------------------------------------------------------------------

  try {
    const body =
      await req.json();

    if (
      body?.mode ===
      "capture"
    ) {
      mode = "capture";
    }

    if (
      body?.periode ===
      "apresmidi"
    ) {
      periode =
        "apresmidi";
    }

    if (
      body?.force === true
    ) {
      force = true;
    }
  } catch {
    // Pas de body ou body invalide.
    // On conserve les valeurs par défaut.
  }

  // ---------------------------------------------------------------------------
  // Capture
  // ---------------------------------------------------------------------------

  if (
    mode === "capture"
  ) {
    return modeCapture(
      periode
    );
  }

  // ---------------------------------------------------------------------------
  // Génération
  // ---------------------------------------------------------------------------

  return modeGenerer(
    force
  );
});
