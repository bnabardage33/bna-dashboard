// app/api/rapports-intemperies/generer/route.ts
//
// Génération des rapports d'intempéries.
//
// Responsabilités de cette route :
// 1. Récupérer le ou les chantiers
// 2. Récupérer la météo locale
// 3. Récupérer la vigilance officielle Météo-France
// 4. Confier la décision au moteur meteoAlerte.ts
// 5. Enregistrer le rapport dans Supabase
//
// La route NE contient volontairement aucune règle métier
// de décision météo. Le cerveau est lib/meteoAlerte.ts.
//

import { NextRequest, NextResponse } from "next/server";

import { supabase } from "@/lib/supabase";
import { adresseVersDepartement } from "@/lib/meteoDepartements";

import {
  evaluerJourChantier,
  Materiau,
  Acces,
  NiveauAlerte,
} from "@/lib/meteoAlerte";

import {
  VigilanceDepartement,
  CouleurVigilance,
} from "@/lib/meteoVigilance";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const URL_VIGILANCE =
  "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours";

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

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type HeureMeteo = {
  heure: string;
  temp: number;
  vent: number;
  rafales: number;
  pluie: number;
};

type MeteoJour = {
  heures: HeureMeteo[];
  tempMax: number;
  rafalesMax: number;
  pluieCumul: number;
};

type Phenomenon = {
  nom: string;
  couleur: NiveauAlerte;
};

type VigilanceInfo = {
  couleurMax: NiveauAlerte;
  phenomenes: Phenomenon[];
};

/* ------------------------------------------------------------------ */
/* Météo Visual Crossing                                               */
/* ------------------------------------------------------------------ */

/**
 * Récupère les données météo horaires du jour.
 */
async function fetchMeteoVisualCrossing(
  adresse: string,
  apiKey: string
): Promise<MeteoJour> {
  const url =
    `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/` +
    `${encodeURIComponent(adresse)}/today` +
    `?unitGroup=metric` +
    `&key=${encodeURIComponent(apiKey)}` +
    `&contentType=json` +
    `&include=days,hours` +
    `&elements=datetime,temp,windspeed,windgust,precip`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Erreur Visual Crossing (${response.status}) pour l'adresse "${adresse}".`
    );
  }

  const data = await response.json();

  const today = data?.days?.[0];

  if (!today) {
    throw new Error(
      `Aucune donnée météo disponible pour "${adresse}".`
    );
  }

  const heures: HeureMeteo[] = (
    Array.isArray(today.hours) ? today.hours : []
  ).map((heure: any) => ({
    heure: String(heure.datetime ?? "").slice(0, 5),

    temp:
      typeof heure.temp === "number"
        ? Math.round(heure.temp)
        : 0,

    vent:
      typeof heure.windspeed === "number"
        ? Math.round(heure.windspeed)
        : 0,

    rafales:
      typeof heure.windgust === "number"
        ? Math.round(heure.windgust)
        : typeof heure.windspeed === "number"
          ? Math.round(heure.windspeed)
          : 0,

    pluie:
      typeof heure.precip === "number"
        ? heure.precip
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
    (total, heure) => total + heure.pluie,
    0
  );

  return {
    heures,
    tempMax,
    rafalesMax,
    pluieCumul,
  };
}

/* ------------------------------------------------------------------ */
/* Vigilance Météo-France                                              */
/* ------------------------------------------------------------------ */

/**
 * Récupère la vigilance officielle du département.
 *
 * Cette fonction ne décide PAS si le chantier doit être arrêté.
 * Elle ne fait que transformer la réponse Météo-France
 * en structure exploitable par le moteur métier.
 */
async function fetchVigilanceMeteoFrance(
  departement: string,
  apiKey?: string
): Promise<VigilanceInfo> {
  if (!apiKey) {
    console.warn(
      "METEOFRANCE_API_KEY non configurée. Vigilance officielle = vert."
    );

    return {
      couleurMax: "vert",
      phenomenes: [],
    };
  }

  try {
    const response = await fetch(URL_VIGILANCE, {
      headers: {
        apikey: apiKey,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(
        `API Vigilance Météo-France indisponible (${response.status}).`
      );

      return {
        couleurMax: "vert",
        phenomenes: [],
      };
    }

    const data = await response.json();

    const periodes =
      data?.product?.periods ??
      data?.periods ??
      [];

    const periodeEnCours = periodes?.[0];

    const domaines =
      periodeEnCours?.timelaps?.domain_ids ??
      periodeEnCours?.domain_ids ??
      [];

    const domaineArray: any[] = Array.isArray(domaines)
      ? domaines
      : Object.values(domaines ?? {});

    const departementNormalise = departement
      .trim()
      .toUpperCase();

    const domaineDepartement =
      domaineArray.find((d: any) => {
        const id = d?.domain_id
          ?.toString()
          .trim()
          .toUpperCase();

        if (!id) return false;

        if (id === departementNormalise) {
          return true;
        }

        // Corse
        if (
          departementNormalise === "2A" &&
          ["20A", "2A", "200", "201"].includes(id)
        ) {
          return true;
        }

        if (
          departementNormalise === "2B" &&
          ["20B", "2B", "202"].includes(id)
        ) {
          return true;
        }

        return false;
      });

    if (!domaineDepartement) {
      return {
        couleurMax: "vert",
        phenomenes: [],
      };
    }

    const couleurMax =
      COULEUR_PAR_ID[
        Number(domaineDepartement.max_color_id)
      ] ?? "vert";

    const phenomenesBruts: any[] =
      domaineDepartement.phenomenon_items ??
      domaineDepartement.phenomenon_max_colors ??
      [];

    const phenomenes: Phenomenon[] =
      phenomenesBruts
        .map((phenomene: any) => {
          const id =
            phenomene?.phenomenon_id ??
            phenomene?.phenomenon_max_color_id
              ?.phenomenon_id;

          const couleurId =
            phenomene?.phenomenon_max_color_id ??
            phenomene?.color_id ??
            phenomene?.max_color_id;

          const nom =
            PHENOMENE_PAR_ID[Number(id)];

          if (!nom) {
            return null;
          }

          return {
            nom,
            couleur:
              COULEUR_PAR_ID[
                Number(couleurId)
              ] ?? "vert",
          };
        })
        .filter(Boolean) as Phenomenon[];

    return {
      couleurMax,
      phenomenes,
    };
  } catch (error) {
    console.error(
      "Erreur lecture vigilance Météo-France :",
      error
    );

    return {
      couleurMax: "vert",
      phenomenes: [],
    };
  }
}

/* ------------------------------------------------------------------ */
/* Adaptation VigilanceInfo -> VigilanceDepartement                    */
/* ------------------------------------------------------------------ */

/**
 * Le moteur meteoAlerte travaille avec VigilanceDepartement.
 *
 * La structure exacte de meteoVigilance peut évoluer.
 * On conserve ici l'adaptation à un seul endroit.
 */
function construireVigilanceDepartement(
  info: VigilanceInfo
): VigilanceDepartement {
  return {
    couleurMax: info.couleurMax as CouleurVigilance,
    phenomenes: info.phenomenes.reduce(
      (acc, phenomene) => {
        acc[phenomene.nom] =
          phenomene.couleur as CouleurVigilance;

        return acc;
      },
      {} as Record<
        string,
        CouleurVigilance
      >
    ),
  } as VigilanceDepartement;
}

/* ------------------------------------------------------------------ */
/* Numéro du rapport                                                   */
/* ------------------------------------------------------------------ */

/**
 * Génère le prochain numéro RI-YYYY-XXX.
 */
async function prochainNumero(): Promise<string> {
  const annee = new Date().getFullYear();

  const { data, error } = await supabase
    .from("rapports_intemperies")
    .select("numero")
    .ilike("numero", `RI-${annee}-%`);

  if (error) {
    throw new Error(
      `Impossible de récupérer les numéros de rapports : ${error.message}`
    );
  }

  const numeros = (data ?? [])
    .map((rapport: any) => {
      const morceaux = String(
        rapport.numero ?? ""
      ).split("-");

      return Number.parseInt(
        morceaux[2],
        10
      );
    })
    .filter(Number.isFinite);

  const suivant =
    numeros.length > 0
      ? Math.max(...numeros) + 1
      : 1;

  return `RI-${annee}-${String(
    suivant
  ).padStart(3, "0")}`;
}

/* ------------------------------------------------------------------ */
/* POST                                                                 */
/* ------------------------------------------------------------------ */

export async function POST(
  request: NextRequest
) {
  let body: {
    chantierId?: string;
    force?: boolean;
  } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const chantierId =
    typeof body.chantierId === "string" &&
    body.chantierId.trim()
      ? body.chantierId.trim()
      : undefined;

  /*
   * Appel manuel :
   * force = true par défaut.
   *
   * Appel automatique :
   * envoyer force=false pour ne pas recréer
   * le rapport déjà existant du jour.
   */
  const force = body.force !== false;

  const visualCrossingKey =
    process.env.VISUALCROSSING_API_KEY;

  const meteoFranceKey =
    process.env.METEOFRANCE_API_KEY;

  if (!visualCrossingKey) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Clé VISUALCROSSING_API_KEY non configurée dans .env.local.",
      },
      { status: 500 }
    );
  }

  /* -------------------------------------------------------------- */
  /* Récupération des chantiers                                     */
  /* -------------------------------------------------------------- */

  let query = supabase
    .from("chantiers")
    .select(
      `
        id,
        nom,
        adresse_chantier,
        materiau_structural,
        moyen_acces,
        zone_vent,
        est_en_angle,
        statut
      `
    );

  if (chantierId) {
    query = query.eq(
      "id",
      chantierId
    );
  } else {
    query = query.neq(
      "statut",
      "termine"
    );
  }

  const {
    data: chantiers,
    error: erreurChantiers,
  } = await query;

  if (
    erreurChantiers ||
    !chantiers ||
    chantiers.length === 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error: chantierId
          ? "Chantier introuvable."
          : "Aucun chantier actif trouvé.",
      },
      { status: 404 }
    );
  }

  /* -------------------------------------------------------------- */
  /* Date du jour                                                   */
  /* -------------------------------------------------------------- */

  const maintenant = new Date();

  const debutJour = new Date(
    maintenant
  );

  debutJour.setHours(
    0,
    0,
    0,
    0
  );

  const finJour = new Date(
    maintenant
  );

  finJour.setHours(
    23,
    59,
    59,
    999
  );

  const resultats: any[] = [];

  /* -------------------------------------------------------------- */
  /* Traitement des chantiers                                      */
  /* -------------------------------------------------------------- */

  for (const chantier of chantiers) {
    try {
      /*
       * Adresse utilisée par Visual Crossing.
       */
      const adresse =
        chantier.adresse_chantier ||
        chantier.nom ||
        "Bordeaux, France";

      /* ---------------------------------------------------------- */
      /* Vérification rapport existant                              */
      /* ---------------------------------------------------------- */

      const {
        data: rapportExistant,
        error: erreurExistant,
      } = await supabase
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
        .lte(
          "cree_le",
          finJour.toISOString()
        )
        .order(
          "cree_le",
          { ascending: false }
        )
        .limit(1)
        .maybeSingle();

      if (erreurExistant) {
        throw new Error(
          `Erreur recherche rapport existant : ${erreurExistant.message}`
        );
      }

      if (
        rapportExistant &&
        !force
      ) {
        resultats.push({
          chantierId: chantier.id,
          nom: chantier.nom,
          statut:
            `Rapport déjà existant (${rapportExistant.numero})`,
          rapportId:
            rapportExistant.id,
        });

        continue;
      }

      /* ---------------------------------------------------------- */
      /* Département                                                 */
      /* ---------------------------------------------------------- */

      const departement =
        adresseVersDepartement(
          adresse
        ) || "33";

      /* ---------------------------------------------------------- */
      /* Météo                                                       */
      /* ---------------------------------------------------------- */

      const meteoJour =
        await fetchMeteoVisualCrossing(
          adresse,
          visualCrossingKey
        );

      /* ---------------------------------------------------------- */
      /* Vigilance officielle                                       */
      /* ---------------------------------------------------------- */

      const vigilanceInfo =
        await fetchVigilanceMeteoFrance(
          departement,
          meteoFranceKey
        );

      const vigilance =
        construireVigilanceDepartement(
          vigilanceInfo
        );

      /* ---------------------------------------------------------- */
      /* Paramètres chantier                                        */
      /* ---------------------------------------------------------- */

      const materiau =
        (chantier.materiau_structural as Materiau) ||
        "bois";

      const acces =
        (chantier.moyen_acces as Acces) ||
        "echafaudage";

      const zoneVent =
        typeof chantier.zone_vent ===
        "number"
          ? chantier.zone_vent
          : 1;

      const estEnAngle =
        chantier.est_en_angle === true;

      /* ---------------------------------------------------------- */
      /* MOTEUR CENTRAL                                              */
      /* ---------------------------------------------------------- */

      const decision =
        evaluerJourChantier(
          materiau,
          acces,
          {
            rafalesMax:
              meteoJour.rafalesMax,

            pluieCumul:
              meteoJour.pluieCumul,

            tempMax:
              meteoJour.tempMax,
          },
          meteoJour.heures,
          vigilance,
          zoneVent,
          estEnAngle
        );

      /* ---------------------------------------------------------- */
      /* Numéro                                                      */
      /* ---------------------------------------------------------- */

      const numero =
        await prochainNumero();

      /* ---------------------------------------------------------- */
      /* Insertion                                                   */
      /* ---------------------------------------------------------- */

      const {
        data: rapportCree,
        error: erreurInsertion,
      } = await supabase
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
            meteoJour.tempMax,

          rafales_max:
            meteoJour.rafalesMax,

          pluie_cumul:
            Number(
              meteoJour.pluieCumul.toFixed(
                2
              )
            ),

          materiau,

          acces,

          zone_vent:
            zoneVent,

          est_en_angle:
            estEnAngle,

          departement,

          releve_horaire:
            meteoJour.heures,

          cree_par:
            "manuel",
        })
        .select()
        .single();

      if (erreurInsertion) {
        throw new Error(
          `Erreur création rapport : ${erreurInsertion.message}`
        );
      }

      /* ---------------------------------------------------------- */
      /* Résultat                                                    */
      /* ---------------------------------------------------------- */

      resultats.push({
        chantierId:
          chantier.id,

        nom:
          chantier.nom,

        numero,

        vigilance:
          decision.vigilanceOfficielle,

        risqueTechnique:
          decision.risqueTechnique.niveau,

        jourArrete:
          decision.jourArrete,

        aValider:
          decision.aValider,

        ampleurImpact:
          decision.ampleurImpact,

        pluieContinue:
          decision.pluieContinue,

        rapportId:
          rapportCree.id,

        statut:
          "Rapport généré avec succès.",
      });
    } catch (error: any) {
      console.error(
        `Erreur génération rapport pour le chantier ${chantier.id}:`,
        error
      );

      resultats.push({
        chantierId:
          chantier.id,

        nom:
          chantier.nom,

        statut:
          `Erreur : ${
            error?.message ||
            String(error)
          }`,
      });
    }
  }

  /* -------------------------------------------------------------- */
  /* Réponse                                                        */
  /* -------------------------------------------------------------- */

  const erreurs = resultats.filter(
    (resultat) =>
      typeof resultat.statut ===
      "string" &&
      resultat.statut.startsWith(
        "Erreur"
      )
  );

  return NextResponse.json({
    success:
      erreurs.length === 0,

    total:
      resultats.length,

    succes:
      resultats.length -
      erreurs.length,

    erreurs:
      erreurs.length,

    resultats,
  });
}

/* ------------------------------------------------------------------ */
/* GET                                            
*/
/* ------------------------------------------------------------------ */

/**
 * GET = même comportement que POST.
 *
 * Utile pour un déclenchement automatique/simple.
 */
export async function GET(
  request: NextRequest
) {
  return POST(request);
}
