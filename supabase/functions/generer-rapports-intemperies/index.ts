// supabase/functions/generer-rapports-intemperies/index.ts
//
// GESTION DES RAPPORTS D'INTEMPÉRIES
//
// MODE CAPTURE
// ------------
// Appelé par les cron à 06h et 16h Europe/Paris.
// Capture uniquement la vigilance officielle Météo-France
// pour chaque chantier actif.
//
// Body :
//   { "mode": "capture", "periode": "matin" }
//   { "mode": "capture", "periode": "apresmidi" }
//
// AUCUN rapport n'est créé pendant une capture.
//
// MODE GÉNÉRER
// ------------
// Appelé en fin de journée.
// Combine :
//   - vigilance Météo-France du matin
//   - vigilance Météo-France de l'après-midi
//   - météo réelle de la journée
//   - seuils techniques matériau / accès
//   - pluie continue
//
// Puis décide :
//   - journée arrêtée
//   - à valider
//   - conditions normales
//
// Secrets nécessaires :
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   VISUALCROSSING_API_KEY
//   METEOFRANCE_API_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VISUALCROSSING_API_KEY =
  Deno.env.get("VISUALCROSSING_API_KEY") ?? "";

const METEOFRANCE_API_KEY =
  Deno.env.get("METEOFRANCE_API_KEY") ?? "";

const URL_VIGILANCE =
  "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours";

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

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

type HeureMeteo = {
  heure: string;
  temp: number;
  vent: number;
  rafales: number;
  pluie: number;
};

type VigilancePhenomene = {
  id: number;
  nom: string;
  couleur: NiveauAlerte;
};

type VigilanceInfo = {
  couleurMax: NiveauAlerte;
  phenomenes: VigilancePhenomene[];
  misAJourLe: string | null;
};

// -----------------------------------------------------------------------------
// CONSTANTES VIGILANCE
// -----------------------------------------------------------------------------

const ORDRE_VIGILANCE: Record<NiveauAlerte, number> = {
  vert: 0,
  jaune: 1,
  orange: 2,
  rouge: 3,
};

const COULEUR_PAR_ID: Record<number, NiveauAlerte> = {
  1: "vert",
  2: "jaune",
  3: "orange",
  4: "rouge",
};

const PHENOMENE_PAR_ID: Record<number, string> = {
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

function plusForte(
  a: NiveauAlerte,
  b: NiveauAlerte
): NiveauAlerte {
  return ORDRE_VIGILANCE[a] >= ORDRE_VIGILANCE[b]
    ? a
    : b;
}

// -----------------------------------------------------------------------------
// ADRESSE -> DÉPARTEMENT
// -----------------------------------------------------------------------------

function adresseVersDepartement(
  adresse: string | null
): string | null {
  if (!adresse) return null;

  const raw = adresse.trim();

  const matchCP = raw.match(/\b\d{5}\b/);

  if (matchCP) {
    const cp = matchCP[0];

    // DOM-TOM
    if (cp.startsWith("97")) {
      return cp.slice(0, 3);
    }

    // Corse
    if (cp.startsWith("20")) {
      const valeur = Number(cp);

      return valeur <= 20190
        ? "2A"
        : "2B";
    }

    return cp.slice(0, 2);
  }

  const matchDept = raw.match(
    /\b(2A|2B|\d{2})\b/i
  );

  if (matchDept) {
    return matchDept[1].toUpperCase();
  }

  const lower = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

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

  if (
    lower.includes("bastia") ||
    lower.includes("calvi") ||
    lower.includes("corte") ||
    lower.includes("ile rousse") ||
    lower.includes("haute corse")
  ) {
    return "2B";
  }

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
// MÉTÉO VISUAL CROSSING
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
    `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/` +
    `${encodeURIComponent(adresse)}/today` +
    `?unitGroup=metric` +
    `&key=${VISUALCROSSING_API_KEY}` +
    `&contentType=json` +
    `&include=days,hours` +
    `&elements=datetime,temp,windspeed,windgust,precip`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    const texte = await response.text();

    throw new Error(
      `Visual Crossing ${response.status}: ${texte.slice(0, 300)}`
    );
  }

  const data = await response.json();

  const today = data?.days?.[0];

  if (!today) {
    throw new Error(
      "Visual Crossing : aucune donnée pour cette adresse"
    );
  }

  const heures: HeureMeteo[] = (
    today.hours ?? []
  ).map((h: any) => ({
    heure: String(h.datetime ?? "").slice(0, 5),
    temp: Number.isFinite(h.temp)
      ? Math.round(h.temp)
      : 0,
    vent: Number.isFinite(h.windspeed)
      ? Math.round(h.windspeed)
      : 0,
    rafales: Number.isFinite(h.windgust)
      ? Math.round(h.windgust)
      : Number.isFinite(h.windspeed)
        ? Math.round(h.windspeed)
        : 0,
    pluie: Number.isFinite(h.precip)
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
    (total, h) => total + h.pluie,
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
// VIGILANCE MÉTÉO-FRANCE
// -----------------------------------------------------------------------------

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
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const texte = await response.text();

    throw new Error(
      `Météo-France ${response.status}: ${texte.slice(0, 300)}`
    );
  }

  const data = await response.json();

  const periodes =
    data?.product?.periods ??
    data?.periods ??
    [];

  if (!Array.isArray(periodes) || periodes.length === 0) {
    return {
      couleurMax: "vert",
      phenomenes: [],
      misAJourLe: null,
    };
  }

  const periode = periodes[0];

  // CORRECTION IMPORTANTE :
  // domaineArray n'existait pas dans l'ancien fichier.
  const domaines =
    periode?.timelaps?.domain_ids ??
    periode?.domain_ids ??
    [];

  const domaineArray: any[] =
    Array.isArray(domaines)
      ? domaines
      : Object.values(domaines ?? {});

  const deptNormalized =
    departement.trim().toUpperCase();

  const domaineDept = domaineArray.find(
    (d: any) => {
      const id = d?.domain_id
        ?.toString()
        .trim()
        .toUpperCase();

      if (!id) return false;

      if (id === deptNormalized) {
        return true;
      }

      if (
        deptNormalized === "2A" &&
        ["20A", "2A", "200", "201"].includes(id)
      ) {
        return true;
      }

      if (
        deptNormalized === "2B" &&
        ["20B", "2B", "202"].includes(id)
      ) {
        return true;
      }

      return false;
    }
  );

  if (!domaineDept) {
    return {
      couleurMax: "vert",
      phenomenes: [],
      misAJourLe:
        data?.product?.update_time ?? null,
    };
  }

  const couleurMax =
    COULEUR_PAR_ID[
      Number(domaineDept.max_color_id)
    ] ?? "vert";

  const phenomenesBrut =
    domaineDept.phenomenon_items ??
    domaineDept.phenomenon_max_colors ??
    [];

  const phenomenes: VigilancePhenomene[] =
    (Array.isArray(phenomenesBrut)
      ? phenomenesBrut
      : Object.values(phenomenesBrut ?? {})
    )
      .map((p: any) => {
        const id = Number(
          p?.phenomenon_id ??
          p?.phenomenon_max_color_id
            ?.phenomenon_id
        );

        const couleurId = Number(
          p?.phenomenon_max_color_id ??
          p?.color_id ??
          p?.max_color_id ??
          1
        );

        const nom = PHENOMENE_PAR_ID[id];

        if (!nom) {
          return null;
        }

        return {
          id,
          nom,
          couleur:
            COULEUR_PAR_ID[couleurId] ??
            "vert",
        };
      })
      .filter(Boolean) as VigilancePhenomene[];

  return {
    couleurMax,
    phenomenes,
    misAJourLe:
      data?.product?.update_time ?? null,
  };
}

function couleurPhenomene(
  vigilance: VigilanceInfo,
  nom: string
): NiveauAlerte {
  return (
    vigilance.phenomenes.find(
      (p) => p.nom === nom
    )?.couleur ??
    "vert"
  );
}

function vigilancePertinente(
  vigilance: VigilanceInfo
): NiveauAlerte {
  return plusForte(
    plusForte(
      couleurPhenomene(vigilance, "vent"),
      couleurPhenomene(
        vigilance,
        "pluie-inondation"
      )
    ),
    couleurPhenomene(vigilance, "orages")
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
): {
  niveau: NiveauAlerte;
  motif: string;
} {
  const sm =
    SEUILS_MATERIAUX[materiau] ??
    SEUILS_MATERIAUX.bois;

  const sa =
    SEUILS_ACCES[acces] ??
    SEUILS_ACCES.echafaudage;

  const ventCritique = Math.min(
    sm.vent_critique,
    sa.vent_critique
  );

  const ventVigilance = Math.min(
    sm.vent_vigilance,
    sa.vent_vigilance
  );

  if (
    meteo.rafalesMax >= ventCritique
  ) {
    return {
      niveau: "rouge",
      motif:
        `Vent critique (${meteo.rafalesMax} km/h ≥ ` +
        `seuil ${ventCritique} km/h)`,
    };
  }

  if (
    meteo.pluieCumul >= sm.pluie_critique &&
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
    meteo.rafalesMax >= ventVigilance
  ) {
    return {
      niveau: "jaune",
      motif:
        `Vent de vigilance (${meteo.rafalesMax} km/h)`,
    };
  }

  return {
    niveau: "vert",
    motif: "Conditions optimales de pose",
  };
}

// -----------------------------------------------------------------------------
// PLUIE CONTINUE
// -----------------------------------------------------------------------------

const SEUIL_PLUIE_HORAIRE = 0.2;
const FRACTION_HEURES_PLUIE = 0.75;

function pleutTouteLaJournee(
  heures: HeureMeteo[]
): boolean {
  if (!heures.length) {
    return false;
  }

  const heuresPluvieuses =
    heures.filter(
      (h) =>
        h.pluie >= SEUIL_PLUIE_HORAIRE
    ).length;

  return (
    heuresPluvieuses / heures.length >=
    FRACTION_HEURES_PLUIE
  );
}

// -----------------------------------------------------------------------------
// DÉCISION FINALE
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
  vigilanceMatin: NiveauAlerte | null,
  vigilanceApresmidi: NiveauAlerte | null
) {
  const risqueTechnique =
    evaluerRisqueTechnique(
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
    plusForte(vMatin, vAprem);

  const evolution =
    vigilanceMatin &&
    vigilanceApresmidi &&
    vigilanceMatin !== vigilanceApresmidi
      ? ` (vigilance ${vigilanceMatin} le matin, ${vigilanceApresmidi} l'après-midi)`
      : "";

  const risqueConfirmeParTerrain =
    risqueTechnique.niveau === "orange" ||
    risqueTechnique.niveau === "rouge";

  // ROUGE
  if (vigilanceOfficielle === "rouge") {
    if (risqueConfirmeParTerrain) {
      return {
        vigilanceOfficielle,
        risqueTechnique,
        pluieContinue,
        jourArrete: true,
        aValider: false,
        ampleurImpact: "complete" as const,
        motif:
          `Vigilance rouge Météo-France confirmée ` +
          `par les mesures du chantier${evolution} — ` +
          `arrêt de chantier`,
      };
    }

    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle" as const,
      motif:
        `Vigilance rouge Météo-France${evolution}, ` +
        `mais aucun dépassement mesuré sur le chantier — ` +
        `à confirmer par le chef de chantier`,
    };
  }

  // ORANGE
  if (vigilanceOfficielle === "orange") {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle" as const,
      motif:
        `Vigilance orange Météo-France${evolution} — ` +
        `arrêt à confirmer selon les conditions réelles ` +
        `du chantier`,
    };
  }

  // JAUNE
  if (vigilanceOfficielle === "jaune") {
    if (pluieContinue) {
      return {
        vigilanceOfficielle,
        risqueTechnique,
        pluieContinue,
        jourArrete: true,
        aValider: false,
        ampleurImpact: "complete" as const,
        motif:
          `Vigilance jaune Météo-France + pluie continue ` +
          `constatée toute la journée — arrêt de chantier`,
      };
    }

    if (risqueConfirmeParTerrain) {
      return {
        vigilanceOfficielle,
        risqueTechnique,
        pluieContinue,
        jourArrete: false,
        aValider: true,
        ampleurImpact: "partielle" as const,
        motif:
          `Vigilance jaune Météo-France${evolution} + ` +
          `dépassement technique mesuré ` +
          `(${risqueTechnique.motif}) — ` +
          `à confirmer par le chef de chantier`,
      };
    }

    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle" as const,
      motif:
        `Vigilance jaune Météo-France${evolution} — ` +
        `conditions météo dégradées à surveiller`,
    };
  }

  // VERT + PLUIE CONTINUE
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
      ampleurImpact: "complete" as const,
      motif:
        `Pluie continue constatée toute la journée ` +
        `(hors vigilance officielle)`,
    };
  }

  // VERT + RISQUE TECHNIQUE
  if (risqueConfirmeParTerrain) {
    return {
      vigilanceOfficielle,
      risqueTechnique,
      pluieContinue,
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle" as const,
      motif:
        `Pas de vigilance officielle, mais dépassement ` +
        `mesuré sur le chantier (${risqueTechnique.motif}) — ` +
        `à confirmer par le chef de chantier`,
    };
  }

  // NORMAL
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
// NUMÉRO RAPPORT
// -----------------------------------------------------------------------------

async function prochainNumero(): Promise<string> {
  const annee = new Date().getFullYear();

  const { data, error } =
    await supabase
      .from("rapports_intemperies")
      .select("numero")
      .ilike(
        "numero",
        `RI-${annee}-%`
      );

  if (error) {
    throw new Error(
      `Erreur numérotation : ${error.message}`
    );
  }

  const numeros = (data ?? [])
    .map((row: any) => {
      const parts =
        String(row.numero ?? "").split("-");

      return Number(parts[2]) || 0;
    });

  const suivant =
    (numeros.length
      ? Math.max(...numeros)
      : 0) + 1;

  return (
    `RI-${annee}-` +
    String(suivant).padStart(3, "0")
  );
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

  const { data: chantiers, error } =
    await supabase
      .from("chantiers")
      .select(
        "id, nom, adresse_chantier"
      )
      .neq("statut", "termine");

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

  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);

  for (const chantier of chantiers) {
    const nom =
      chantier.nom ?? chantier.id;

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
      const { data: existant } =
        await supabase
          .from("vigilance_captures")
          .select("id")
          .eq(
            "chantier_id",
            chantier.id
          )
          .eq("periode", periode)
          .gte(
            "capture_le",
            debutJour.toISOString()
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

      const departement =
        adresseVersDepartement(adresse);

      let vigilance: VigilanceInfo = {
        couleurMax: "vert",
        phenomenes: [],
        misAJourLe: null,
      };

      if (departement) {
        vigilance =
          await fetchVigilance(
            departement
          );
      }

      const couleur =
        vigilancePertinente(vigilance);

      const { error: insertError } =
        await supabase
          .from("vigilance_captures")
          .insert({
            chantier_id:
              chantier.id,
            periode,
            departement,
            vigilance_couleur:
              couleur,
            vigilance_phenomenes:
              vigilance.phenomenes,
          });

      if (insertError) {
        throw insertError;
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
    JSON.stringify({
      success: true,
      mode: "capture",
      periode,
      resultats,
    }),
    {
      status: 200,
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

  const { data: chantiers, error } =
    await supabase
      .from("chantiers")
      .select(
        `
        id,
        nom,
        adresse_chantier,
        materiau_structural,
        moyen_acces
        `
      )
      .neq("statut", "termine");

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

  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);

  for (const chantier of chantiers) {
    const nom =
      chantier.nom ?? chantier.id;

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
      // ---------------------------------------------------------------
      // Évite le doublon du jour
      // ---------------------------------------------------------------

      const { data: existant } =
        await supabase
          .from("rapports_intemperies")
          .select("id, numero")
          .eq(
            "chantier_id",
            chantier.id
          )
          .gte(
            "cree_le",
            debutJour.toISOString()
          )
          .maybeSingle();

      if (existant) {
        resultats.push({
          chantier: nom,
          statut:
            `déjà généré aujourd'hui (${existant.numero})`,
        });

        continue;
      }

      // ---------------------------------------------------------------
      // Récupération des captures
      // ---------------------------------------------------------------

      const { data: captures } =
        await supabase
          .from("vigilance_captures")
          .select(
            "periode, vigilance_couleur"
          )
          .eq(
            "chantier_id",
            chantier.id
          )
          .gte(
            "capture_le",
            debutJour.toISOString()
          );

      const captureMatin =
        captures?.find(
          (c: any) =>
            c.periode === "matin"
        );

      const captureApresmidi =
        captures?.find(
          (c: any) =>
            c.periode ===
            "apresmidi"
        );

      const vigilanceMatin =
        (captureMatin
          ?.vigilance_couleur ??
          null) as NiveauAlerte | null;

      const vigilanceApresmidi =
        (captureApresmidi
          ?.vigilance_couleur ??
          null) as NiveauAlerte | null;

      // ---------------------------------------------------------------
      // Météo réelle du jour
      // ---------------------------------------------------------------

      const meteo =
        await fetchMeteoJour(
          adresse
        );

      const departement =
        adresseVersDepartement(
          adresse
        );

      // ---------------------------------------------------------------
      // Matériau / accès sécurisés
      // ---------------------------------------------------------------

      const materiau =
        (
          chantier
            .materiau_structural ??
          "bois"
        ) as Materiau;

      const acces =
        (
          chantier.moyen_acces ??
          "echafaudage"
        ) as Acces;

      // ---------------------------------------------------------------
      // Décision
      // ---------------------------------------------------------------

      const decision =
        evaluerJour(
          materiau,
          acces,
          {
            rafalesMax:
              meteo.rafalesMax,
            tempMax:
              meteo.tempMax,
            pluieCumul:
              meteo.pluieCumul,
          },
          meteo.heures,
          vigilanceMatin,
          vigilanceApresmidi
        );

      // ---------------------------------------------------------------
      // Pas d'intempérie
      // ---------------------------------------------------------------

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

      // ---------------------------------------------------------------
      // Création rapport
      // ---------------------------------------------------------------

      const numero =
        await prochainNumero();

      const { data: rapportCree, error: insertError } =
        await supabase
          .from("rapports_intemperies")
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
              decision.risqueTechnique
                .niveau,

            risque_technique_motif:
              decision.risqueTechnique
                .motif,

            temp_max:
              meteo.tempMax,

            rafales_max:
              meteo.rafalesMax,

            pluie_cumul:
              Number(
                meteo.pluieCumul.toFixed(2)
              ),

            materiau,

            acces,

            departement,

            releve_horaire:
              meteo.heures,

            cree_par: "auto",
          })
          .select("id")
          .single();

      if (insertError) {
        throw insertError;
      }

      resultats.push({
        chantier: nom,
        statut:
          `rapport ${numero} généré`,
      });
    } catch (error) {
      console.error(
        `Erreur rapport chantier ${chantier.id}:`,
        error
      );

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
    JSON.stringify({
      success: true,
      mode: "generer",
      force,
      total: resultats.length,
      resultats,
    }),
    {
      status: 200,
      headers: {
        "Content-Type":
          "application/json",
      },
    }
  );
}

// -----------------------------------------------------------------------------
// HANDLER SUPABASE EDGE FUNCTION
// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  let mode:
    | "capture"
    | "generer" = "generer";

  let periode: Periode = "matin";
  let force = false;

  try {
    const body = await req.json();

    if (
      body?.mode === "capture"
    ) {
      mode = "capture";
    }

    if (
      body?.periode ===
      "apresmidi"
    ) {
      periode = "apresmidi";
    }

    if (body?.force === true) {
      force = true;
    }
  } catch {
    // Aucun body ou body invalide.
    // On conserve les valeurs par défaut.
  }

  if (mode === "capture") {
    return modeCapture(periode);
  }

  return modeGenerer(force);
});
