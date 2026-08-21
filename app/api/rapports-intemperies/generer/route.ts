// app/api/rapports-intemperies/generer/route.ts
//
// Génération des rapports d'intempéries.
//
// La route orchestre uniquement :
// 1. récupération du chantier
// 2. récupération de la météo locale
// 3. récupération de la vigilance officielle
// 4. appel du moteur métier evaluerJourChantier()
// 5. enregistrement du rapport dans Supabase
//
// Les règles de décision sont centralisées dans lib/meteoAlerte.ts.

import { NextRequest, NextResponse } from "next/server";

import { supabase } from "@/lib/supabase";
import { adresseVersDepartement } from "@/lib/meteoDepartements";

import {
  evaluerJourChantier,
  Materiau,
  Acces,
} from "@/lib/meteoAlerte";

import {
  VigilanceDepartement,
  CouleurVigilance,
} from "@/lib/meteoVigilance";

const URL_VIGILANCE =
  "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours";

const COULEUR_PAR_ID: Record<
  number,
  CouleurVigilance
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

type VigilanceInfo = VigilanceDepartement;

/* ------------------------------------------------------------------ */
/* Météo Visual Crossing                                               */
/* ------------------------------------------------------------------ */

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

  const res = await fetch(url, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Erreur Visual Crossing (${res.status}) pour l'adresse "${adresse}".`
    );
  }

  const data = await res.json();

  const today = data?.days?.[0];

  if (!today) {
    throw new Error(
      `Aucune donnée météo disponible pour "${adresse}".`
    );
  }

  const heures: HeureMeteo[] = (
    Array.isArray(today.hours)
      ? today.hours
      : []
  ).map((h: any) => ({
    heure: String(
      h.datetime ?? ""
    ).slice(0, 5),

    temp:
      typeof h.temp === "number"
        ? Math.round(h.temp)
        : 0,

    vent:
      typeof h.windspeed === "number"
        ? Math.round(h.windspeed)
        : 0,

    rafales:
      typeof h.windgust === "number"
        ? Math.round(h.windgust)
        : typeof h.windspeed === "number"
          ? Math.round(h.windspeed)
          : 0,

    pluie:
      typeof h.precip === "number"
        ? h.precip
        : 0,
  }));

  const tempMax =
    heures.length > 0
      ? Math.max(
          ...heures.map(
            (h) => h.temp
          )
        )
      : 0;

  const rafalesMax =
    heures.length > 0
      ? Math.max(
          ...heures.map(
            (h) => h.rafales
          )
        )
      : 0;

  const pluieCumul =
    heures.reduce(
      (total, h) =>
        total + h.pluie,
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

async function fetchVigilanceMeteoFrance(
  departement: string,
  apiKey?: string
): Promise<VigilanceInfo> {
  /*
   * Si la clé n'est pas configurée,
   * on ne prétend pas avoir une vigilance officielle.
   *
   * Pour éviter de bloquer complètement la génération,
   * on utilise vert comme valeur de repli.
   */
  if (!apiKey) {
    console.warn(
      "METEOFRANCE_API_KEY non configurée."
    );

    return {
      departement,
      couleurMax: "vert",
      phenomenes: [],
      misAJourLe: null,
    };
  }

  try {
    const res = await fetch(
      URL_VIGILANCE,
      {
        headers: {
          apikey: apiKey,
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      console.warn(
        `API Vigilance Météo-France indisponible (${res.status}).`
      );

      return {
        departement,
        couleurMax: "vert",
        phenomenes: [],
        misAJourLe: null,
      };
    }

    const data = await res.json();

    const periodes =
      data?.product?.periods ??
      data?.periods ??
      [];

    const periodeEnCours =
      periodes?.[0];

    const domaines =
      periodeEnCours?.timelaps
        ?.domain_ids ??
      periodeEnCours?.domain_ids ??
      [];

    const domaineArray: any[] =
      Array.isArray(domaines)
        ? domaines
        : Object.values(
            domaines ?? {}
          );

    const departementNormalise =
      departement
        .trim()
        .toUpperCase();

    const domaineDepartement =
      domaineArray.find(
        (d: any) => {
          const id =
            d?.domain_id
              ?.toString()
              .trim()
              .toUpperCase();

          if (!id) {
            return false;
          }

          if (
            id ===
            departementNormalise
          ) {
            return true;
          }

          /*
           * Corse.
           */
          if (
            departementNormalise ===
              "2A" &&
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
            departementNormalise ===
              "2B" &&
            [
              "20B",
              "2B",
              "202",
            ].includes(id)
          ) {
            return true;
          }

          return false;
        }
      );

    if (!domaineDepartement) {
      return {
        departement,
        couleurMax: "vert",
        phenomenes: [],
        misAJourLe: null,
      };
    }

    const couleurMax =
      COULEUR_PAR_ID[
        Number(
          domaineDepartement.max_color_id
        )
      ] ?? "vert";

    const phenomenesBruts: any[] =
      domaineDepartement.phenomenon_items ??
      domaineDepartement.phenomenon_max_colors ??
      [];

    const phenomenes =
      phenomenesBruts
        .map(
          (p: any) => {
            const id =
              p?.phenomenon_id ??
              p?.phenomenon_max_color_id
                ?.phenomenon_id;

            const couleurId =
              p?.phenomenon_max_color_id ??
              p?.color_id ??
              p?.max_color_id;

            const nom =
              PHENOMENE_PAR_ID[
                Number(id)
              ];

            if (!nom) {
              return null;
            }

            return {
              id: Number(id),
              nom,
              couleur:
                COULEUR_PAR_ID[
                  Number(
                    couleurId
                  )
                ] ?? "vert",
            };
          }
        )
        .filter(Boolean);

    return {
      departement,
      couleurMax,
      phenomenes,
      misAJourLe:
        data?.product?.update_time ??
        data?.update_time ??
        null,
    };
  } catch (error) {
    console.error(
      "Erreur lecture vigilance Météo-France :",
      error
    );

    return {
      departement,
      couleurMax: "vert",
      phenomenes: [],
      misAJourLe: null,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Numéro du rapport                                                   */
/* ------------------------------------------------------------------ */

async function prochainNumero(): Promise<string> {
  const annee =
    new Date().getFullYear();

  const {
    data,
    error,
  } = await supabase
    .from(
      "rapports_intemperies"
    )
    .select("numero")
    .ilike(
      "numero",
      `RI-${annee}-%`
    );

  if (error) {
    throw new Error(
      `Impossible de récupérer les numéros de rapports : ${error.message}`
    );
  }

  const numeros =
    (data ?? [])
      .map((row: any) => {
        const morceaux =
          String(
            row.numero ?? ""
          ).split("-");

        return Number.parseInt(
          morceaux[2],
          10
        );
      })
      .filter(
        Number.isFinite
      );

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
    body =
      await request.json();
  } catch {
    body = {};
  }

  const chantierId =
    typeof body.chantierId ===
      "string" &&
    body.chantierId.trim()
      ? body.chantierId.trim()
      : undefined;

  /*
   * force=true par défaut pour le bouton
   * "Générer le rapport du jour".
   */
  const force =
    body.force !== false;

  const visualCrossingKey =
    process.env
      .VISUALCROSSING_API_KEY;

  const meteoFranceKey =
    process.env
      .METEOFRANCE_API_KEY;

  if (!visualCrossingKey) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Clé VISUALCROSSING_API_KEY non configurée dans .env.local.",
      },
      {
        status: 500,
      }
    );
  }

  /* -------------------------------------------------------------- */
  /* Chantiers                                                       */
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
    query =
      query.eq(
        "id",
        chantierId
      );
  } else {
    query =
      query.neq(
        "statut",
        "termine"
      );
  }

  const {
    data: chantiers,
    error:
      erreurChantiers,
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
      {
        status: 404,
      }
    );
  }

  /* -------------------------------------------------------------- */
  /* Fenêtre du jour                                                 */
  /* -------------------------------------------------------------- */

  const maintenant =
    new Date();

  const debutJour =
    new Date(
      maintenant
    );

  debutJour.setHours(
    0,
    0,
    0,
    0
  );

  const finJour =
    new Date(
      maintenant
    );

  finJour.setHours(
    23,
    59,
    59,
    999
  );

  const resultats: any[] =
    [];

  /* -------------------------------------------------------------- */
  /* Traitement                                                       */
  /* -------------------------------------------------------------- */

  for (const chantier of chantiers) {
    try {
      /*
       * Adresse météo.
       */
      const adresse =
        chantier.adresse_chantier ||
        chantier.nom ||
        "Bordeaux, France";

      /* ---------------------------------------------------------- */
      /* Rapport déjà présent                                       */
      /* ---------------------------------------------------------- */

      const {
        data:
          rapportExistant,
        error:
          erreurExistant,
      } = await supabase
        .from(
          "rapports_intemperies"
        )
        .select(
          "id, numero"
        )
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
          {
            ascending: false,
          }
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
          chantierId:
            chantier.id,
          nom:
            chantier.nom,
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
      /* Météo locale                                                */
      /* ---------------------------------------------------------- */

      const meteoJour =
        await fetchMeteoVisualCrossing(
          adresse,
          visualCrossingKey
        );

      /* ---------------------------------------------------------- */
      /* Vigilance officielle                                       */
      /* ---------------------------------------------------------- */

      const vigilance =
        await fetchVigilanceMeteoFrance(
          departement,
          meteoFranceKey
        );

      /* ---------------------------------------------------------- */
      /* Paramètres du chantier                                     */
      /* ---------------------------------------------------------- */

      const materiau =
        (chantier
          .materiau_structural as Materiau) ||
        "bois";

      const acces =
        (chantier
          .moyen_acces as Acces) ||
        "echafaudage";

      const zoneVent =
        typeof chantier.zone_vent ===
        "number"
          ? chantier.zone_vent
          : 1;

      const estEnAngle =
        chantier.est_en_angle ===
        true;

      /* ---------------------------------------------------------- */
      /* MOTEUR MÉTIER CENTRAL                                      */
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
      /* Création du rapport                                         */
      /* ---------------------------------------------------------- */

      const {
        data:
          rapportCree,
        error:
          erreurInsertion,
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
          decision.risqueTechnique
            .niveau,

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
        `Erreur génération rapport pour ${chantier.id}:`,
        error
      );

      resultats.push({
        chantierId:
          chantier.id,

        nom:
          chantier.nom,

        statut:
          `Erreur : ${
            error?.message ??
            String(error)
          }`,
      });
    }
  }

  /* -------------------------------------------------------------- */
  /* Réponse                                                         */
  /* -------------------------------------------------------------- */

  const erreurs =
    resultats.filter(
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
/* GET                                                                  */
/* ------------------------------------------------------------------ */

export async function GET(
  request: NextRequest
) {
  return POST(request);
}
