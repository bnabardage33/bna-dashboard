// supabase/functions/generer-rapports-intemperies/index.ts
//
// Deux modes, appelés par des cron différents :
//
// MODE "capture" :
//   Prend une photo de la vigilance officielle Météo-France
//   pour chaque chantier actif et la stocke dans vigilance_captures.
//
//   Body :
//   {"mode": "capture", "periode": "matin"}
//   {"mode": "capture", "periode": "apresmidi"}
//
// MODE "generer" :
//   Relit les captures matin + après-midi,
//   récupère la météo réelle de la journée,
//   puis décide si le jour doit être arrêté ou soumis à validation.
//
// Body optionnel :
//   {"force": true}
//
// Secrets nécessaires :
//   VISUALCROSSING_API_KEY
//   METEOFRANCE_APPLICATION_ID   (OAuth2 client_credentials pour DPVigilance v1)
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Lecture PARTAGÉE de la Vigilance Météo-France, sans dépendance Next.js : le
// même fichier (`lib/vigilanceMeteoFrance.ts`) sert les routes `app/api/...` et
// cette Edge Function. Voir ce fichier pour la sélection de période et la
// lecture de `phenomenon_max_color_id.color_id`.
//
// NB : cet import remonte hors du dossier de la fonction. Le bundler Supabase
// (esbuild) résout les imports relatifs ; ce point reste à confirmer au premier
// `supabase functions deploy` — déploiement volontairement HORS PÉRIMÈTRE ici.
import { geocoderAdresse } from "../../../lib/geocodageBAN.ts";

import {
  extraireDepartement,
  couleurPourPhenomene,
  prefixerMotifVigilance,
  type VigilanceDepartement,
} from "../../../lib/vigilanceMeteoFrance.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VISUALCROSSING_API_KEY =
  Deno.env.get("VISUALCROSSING_API_KEY")!;

// Authentification Météo-France : OAuth2 client_credentials. Le token est
// demandé à `URL_TOKEN_METEOFRANCE` puis présenté en `Authorization: Bearer`.
// (L'ancien appel `apikey: METEOFRANCE_API_KEY` ne fonctionne pas : cette
// variable n'existe plus et DPVigilance v1 n'accepte pas ce header.)
const METEOFRANCE_APPLICATION_ID =
  Deno.env.get("METEOFRANCE_APPLICATION_ID")!;

const URL_TOKEN_METEOFRANCE =
  "https://portail-api.meteofrance.fr/token";

let tokenCache: {
  accessToken: string;
  expireLe: number;
} | null = null;

const MARGE_SECURITE_MS = 5 * 60 * 1000;

async function obtenirTokenMeteoFrance(): Promise<string> {
  const maintenant = Date.now();

  if (
    tokenCache &&
    tokenCache.expireLe - MARGE_SECURITE_MS > maintenant
  ) {
    return tokenCache.accessToken;
  }

  const response = await fetch(URL_TOKEN_METEOFRANCE, {
    method: "POST",
    headers: {
      Authorization: `Basic ${METEOFRANCE_APPLICATION_ID}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const texte = await response.text();
    throw new Error(
      `Échec génération token Météo-France (${response.status}): ${texte}`
    );
  }

  const data = await response.json();
  const accessToken: string = data.access_token;
  const expiresInSec: number = data.expires_in ?? 3600;

  if (!accessToken) {
    throw new Error("Réponse token Météo-France sans access_token");
  }

  tokenCache = {
    accessToken,
    expireLe: maintenant + expiresInSec * 1000,
  };

  return accessToken;
}

// -----------------------------------------------------------------------------
// TYPES
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

// Alias du type PARTAGÉ (lib/vigilanceMeteoFrance.ts). Les couleurs y sont
// typées `CouleurVigilance`, union strictement identique à `NiveauAlerte`.
type VigilanceInfo = VigilanceDepartement;

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
  ampleurImpact: "complete" | "partielle" | null;
  motif: string;
};

// -----------------------------------------------------------------------------
// CODE POSTAL -> DÉPARTEMENT
// -----------------------------------------------------------------------------

function adresseVersDepartement(
  adresse: string
): string | null {
  if (!adresse) return null;

  const raw = adresse.trim();

  const match = raw.match(/\b\d{5}\b/);

  if (match) {
    const cp = match[0];

    // DOM-TOM
    if (cp.startsWith("97")) {
      return cp.slice(0, 3);
    }

    // Corse
    if (cp.startsWith("20")) {
      const valeur = parseInt(cp, 10);

      return valeur <= 20190
        ? "2A"
        : "2B";
    }

    return cp.slice(0, 2);
  }

  const matchDept = raw.match(
    /\b(2A|2B|2a|2b|\d{2})\b/i
  );

  if (matchDept) {
    return matchDept[1].toUpperCase();
  }

  const lower = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Corse du Sud
  if (
    lower.includes("ajaccio") ||
    lower.includes("porto vecchio") ||
    lower.includes("porticcio") ||
    lower.includes("bonifacio") ||
    lower.includes("propriano") ||
    lower.includes("corse du sud")
  ) {
    return "2A";
  }

  // Haute-Corse
  if (
    lower.includes("bastia") ||
    lower.includes("calvi") ||
    lower.includes("corte") ||
    lower.includes("ile rousse") ||
    lower.includes("haute corse")
  ) {
    return "2B";
  }

  // Gironde
  if (
    lower.includes("bordeaux") ||
    lower.includes("merignac") ||
    lower.includes("arcachon") ||
    lower.includes("gironde")
  ) {
    return "33";
  }

  return null;
}

// -----------------------------------------------------------------------------
// GÉOCODAGE (BAN) — validation par code postal
// -----------------------------------------------------------------------------
//
// Visual Crossing acceptait l'adresse brute : son géocodeur interne pouvait
// retenir l'homonyme d'une AUTRE commune, incompatible avec le code postal du
// chantier. L'implémentation vit dans `lib/geocodageBAN.ts` (module pur,
// partagé avec les tests) : code postal exact, sinon refus ; ambiguïté, refus.
// Elle LÈVE, et le try/catch par chantier le consigne sans produire de rapport
// sur une commune inventée.
//
// La BAN (`api-adresse.data.gouv.fr`) remplace Nominatim ici : ce dernier
// répond 403 aux IP d'egress de Supabase.

// -----------------------------------------------------------------------------
// MÉTÉO DU JOUR COMPLET - VISUAL CROSSING
// -----------------------------------------------------------------------------

async function fetchMeteoJour(
  adresse: string
): Promise<{
  heures: HeureMeteo[];
  tempMax: number;
  rafalesMax: number;
  pluieCumul: number;
}> {
  // Coordonnées validées par le code postal, puis transmises à Visual
  // Crossing : le fournisseur ne peut donc plus choisir une autre commune.
  const { lat, lon } = await geocoderAdresse(adresse);

  const url =
    `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/` +
    `${lat},${lon}/today` +
    `?unitGroup=metric` +
    `&key=${VISUALCROSSING_API_KEY}` +
    `&contentType=json` +
    `&include=days,hours` +
    `&elements=datetime,temp,windspeed,windgust,precip`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Erreur Visual Crossing (${res.status})`
    );
  }

  const data = await res.json();

  const today = data.days?.[0];

  if (!today) {
    throw new Error(
      "Pas de données météo pour cette adresse"
    );
  }

  const heures: HeureMeteo[] =
    (today.hours || []).map((h: {
      datetime?: string;
      temp?: number;
      windspeed?: number;
      windgust?: number;
      precip?: number;
    }) => ({
      heure: h.datetime?.slice(0, 5) ?? "",
      temp: Math.round(h.temp ?? 0),
      vent: Math.round(h.windspeed ?? 0),
      rafales: Math.round(
        h.windgust ?? h.windspeed ?? 0
      ),
      pluie: h.precip ?? 0,
    }));

  const tempMax =
    heures.length > 0
      ? Math.max(
          ...heures.map((h) => h.temp)
        )
      : 0;

  const rafalesMax =
    heures.length > 0
      ? Math.max(
          ...heures.map((h) => h.rafales)
        )
      : 0;

  const pluieCumul =
    heures.reduce(
      (s, h) => s + h.pluie,
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
// VIGILANCE OFFICIELLE MÉTÉO-FRANCE
// -----------------------------------------------------------------------------

// La lecture du JSON officiel (choix de la période par ses bornes temporelles,
// lecture de `phenomenon_max_color_id.color_id`, repli sûr) vit dans
// `lib/vigilanceMeteoFrance.ts`, PARTAGÉE avec les routes Next. Une seule
// implémentation : plus de `Number(phenomenon_max_color_id)` qui valait NaN face
// à l'objet `{ phenomenon_id, color_id }` de l'API et faisait passer un orange
// pour un vert.
async function fetchVigilance(
  departement: string
): Promise<VigilanceInfo | null> {
  const token =
    await obtenirTokenMeteoFrance();

  const res = await fetch(
    "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours",
    {
      // DPVigilance v1 : token OAuth2 en Authorization: Bearer, PAS `apikey`.
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    console.error(
      `Vigilance Météo-France indisponible (${res.status})`
    );
    return null;
  }

  const data = await res.json();

  return extraireDepartement(
    data,
    departement
  );
}

// -----------------------------------------------------------------------------
// UTILITAIRES VIGILANCE
// -----------------------------------------------------------------------------

function couleurPhenomene(
  vigilance: VigilanceInfo,
  nom: string
): NiveauAlerte {
  // Délégué à l'implémentation PARTAGÉE avec Next (une seule règle).
  return couleurPourPhenomene(vigilance, nom);
}

const ORDRE: Record<
  NiveauAlerte,
  number
> = {
  vert: 0,
  jaune: 1,
  orange: 2,
  rouge: 3,
};

function plusForte(
  a: NiveauAlerte,
  b: NiveauAlerte
): NiveauAlerte {
  return ORDRE[a] >= ORDRE[b]
    ? a
    : b;
}

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
// RISQUE TECHNIQUE
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
// PLUIE CONTINUE
// -----------------------------------------------------------------------------

function pleutTouteLaJournee(
  heures: HeureMeteo[]
): boolean {
  if (!heures.length) {
    return false;
  }

  const pluvieuses =
    heures.filter(
      (h) => h.pluie >= 0.2
    ).length;

  return (
    pluvieuses /
      heures.length >=
    0.75
  );
}

// -----------------------------------------------------------------------------
// DÉCISION FINALE DU JOUR
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
    vigilanceMatin ?? "vert";

  const vAprem =
    vigilanceApresmidi ?? "vert";

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
  // VERT + PLUIE CONTINUE
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
  // RISQUE TECHNIQUE CONFIRMÉ
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
  // NORMAL
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
// NUMÉROTATION
// -----------------------------------------------------------------------------

async function prochainNumero(): Promise<string> {
  const annee =
    new Date().getFullYear();

  const { data } =
    await supabase
      .from("rapports_intemperies")
      .select("numero")
      .ilike(
        "numero",
        `RI-${annee}-%`
      );

  const nums =
    (data ?? []).map(
      (d: { numero?: string | null }) =>
        parseInt(
          (d.numero ?? "")
            .split("-")[2] ?? ""
        ) || 0
    );

  const suivant =
    (nums.length
      ? Math.max(...nums)
      : 0) + 1;

  return `RI-${annee}-${String(
    suivant
  ).padStart(3, "0")}`;
}

// -----------------------------------------------------------------------------
// MODE CAPTURE
// -----------------------------------------------------------------------------

async function modeCapture(
  periode: Periode
) {
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

  if (error || !chantiers) {
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

  const debutJour =
    new Date();

  debutJour.setHours(
    0,
    0,
    0,
    0
  );

  for (const ch of chantiers) {
    const adresse =
      ch.adresse_chantier as
        | string
        | null;

    if (!adresse) {
      resultats.push({
        chantier:
          ch.nom ?? ch.id,
        statut:
          "ignoré (pas d'adresse)",
      });
      continue;
    }

    try {
      const {
        data: existant,
      } = await supabase
        .from(
          "vigilance_captures"
        )
        .select("id")
        .eq(
          "chantier_id",
          ch.id
        )
        .eq(
          "periode",
          periode
        )
        .gte(
          "capture_le",
          debutJour.toISOString()
        )
        .maybeSingle();

      if (existant) {
        resultats.push({
          chantier:
            ch.nom ?? ch.id,
          statut:
            `capture ${periode} déjà faite aujourd'hui`,
        });
        continue;
      }

      const departement =
        adresseVersDepartement(
          adresse
        );

      const vigilance =
        departement
          ? await fetchVigilance(
              departement
            )
          : null;

      if (!vigilance) {
        // Vigilance officielle INDISPONIBLE : on n'enregistre PAS une capture
        // « verte » inventée (elle serait relue telle quelle en mode génération).
        resultats.push({
          chantier:
            ch.nom ?? ch.id,
          statut:
            "capture ignorée : vigilance officielle indisponible",
        });
        continue;
      }

      const couleur =
        vigilancePertinente(
          vigilance
        );

      const {
        error: errInsert,
      } = await supabase
        .from(
          "vigilance_captures"
        )
        .insert({
          chantier_id:
            ch.id,
          periode,
          departement,
          vigilance_couleur:
            couleur,
          vigilance_phenomenes:
            vigilance.phenomenes,
        });

      if (errInsert) {
        throw errInsert;
      }

      resultats.push({
        chantier:
          ch.nom ?? ch.id,
        statut:
          `capture ${periode} enregistrée (${couleur})`,
      });
    } catch (err) {
      resultats.push({
        chantier:
          ch.nom ?? ch.id,
        statut:
          `erreur : ${
            (err as Error).message
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
) {
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

  if (error || !chantiers) {
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

  const debutJour =
    new Date();

  debutJour.setHours(
    0,
    0,
    0,
    0
  );

  for (const ch of chantiers) {
    const adresse =
      ch.adresse_chantier as
        | string
        | null;

    if (!adresse) {
      resultats.push({
        chantier:
          ch.nom ?? ch.id,
        statut:
          "ignoré (pas d'adresse)",
      });
      continue;
    }

    try {
      // -----------------------------------------------------------------------
      // Évite de générer deux fois le même rapport le même jour.
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
          ch.id
        )
        .gte(
          "cree_le",
          debutJour.toISOString()
        )
        .maybeSingle();

      if (existant) {
        resultats.push({
          chantier:
            ch.nom ?? ch.id,
          statut:
            "déjà généré aujourd'hui",
        });
        continue;
      }

      // -----------------------------------------------------------------------
      // Récupération des captures du jour.
      // -----------------------------------------------------------------------

      const {
        data: captures,
      } = await supabase
        .from(
          "vigilance_captures"
        )
        .select(
          "periode, vigilance_couleur"
        )
        .eq(
          "chantier_id",
          ch.id
        )
        .gte(
          "capture_le",
          debutJour.toISOString()
        );

      const captureMatin =
        captures?.find(
          (c: { periode?: string }) =>
            c.periode ===
            "matin"
        );

      const captureAprem =
        captures?.find(
          (c: { periode?: string }) =>
            c.periode ===
            "apresmidi"
        );

      const vigilanceMatin =
        (captureMatin
          ?.vigilance_couleur as
          | NiveauAlerte
          | undefined) ??
        null;

      const vigilanceApresmidi =
        (captureAprem
          ?.vigilance_couleur as
          | NiveauAlerte
          | undefined) ??
        null;

      // -----------------------------------------------------------------------
      // Météo réelle du jour.
      // -----------------------------------------------------------------------

      const meteoJour =
        await fetchMeteoJour(
          adresse
        );

      const departement =
        adresseVersDepartement(
          adresse
        );

      // -----------------------------------------------------------------------
      // Décision.
      // -----------------------------------------------------------------------

      const decision =
        evaluerJour(
          ch.materiau_structurel,
          ch.moyen_acces,
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
      // Pas d'intempérie et pas de validation nécessaire.
      // -----------------------------------------------------------------------

      if (
        !decision.jourArrete &&
        !decision.aValider &&
        !force
      ) {
        resultats.push({
          chantier:
            ch.nom ?? ch.id,
          statut:
            "conditions normales, pas de rapport",
        });

        continue;
      }

      // -----------------------------------------------------------------------
      // Création du rapport.
      // -----------------------------------------------------------------------

      const numero =
        await prochainNumero();

      const {
        error: errInsert,
      } = await supabase
        .from(
          "rapports_intemperies"
        )
        .insert({
          numero,
          chantier_id:
            ch.id,

          vigilance_officielle:
            vigilanceMatin === null &&
            vigilanceApresmidi === null
              ? "indisponible"
              : decision.vigilanceOfficielle,

          jour_arrete:
            decision.jourArrete,

          a_valider:
            decision.aValider,

          ampleur_impact:
            decision.ampleurImpact,

          pluie_continue:
            decision.pluieContinue,

          motif:
            prefixerMotifVigilance(
              decision.motif,
              vigilanceMatin,
              vigilanceApresmidi
            ),

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

          materiau:
            ch.materiau_structurel,

          acces:
            ch.moyen_acces,

          departement,

          releve_horaire:
            meteoJour.heures,

          cree_par:
            "auto",
        });

      if (errInsert) {
        throw errInsert;
      }

      resultats.push({
        chantier:
          ch.nom ?? ch.id,
        statut:
          `rapport ${numero} généré`,
      });
    } catch (err) {
      resultats.push({
        chantier:
          ch.nom ?? ch.id,
        statut:
          `erreur : ${
            (err as Error).message
          }`,
      });
    }
  }

  return new Response(
    JSON.stringify(
      {
        mode: "generer",
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
// HANDLER
// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  let mode:
    | "capture"
    | "generer" = "generer";

  let periode: Periode =
    "matin";

  let force = false;

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

    force =
      body?.force === true;
  } catch {
    // Pas de body ou body invalide :
    // on conserve les valeurs par défaut.
  }

  if (
    mode === "capture"
  ) {
    return modeCapture(
      periode
    );
  }

  return modeGenerer(
    force
  );
});
