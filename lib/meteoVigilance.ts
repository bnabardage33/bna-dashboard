// app/api/meteo-vigilance/route.ts
//
// Proxy serveur vers l'API officielle Vigilance de Météo-France.
//
// Le navigateur appelle :
//   /api/meteo-vigilance?departement=33
//
// La clé METEOFRANCE_API_KEY reste côté serveur.
//
// Paramètres acceptés :
//   ?departement=33
//   ?departement=Bordeaux
//   ?departement=33000
//   ?departement=2A
//   ?departement=2B
//   ?location=Bordeaux
//   ?demain=true
//

import { NextRequest, NextResponse } from "next/server";
import { adresseVersDepartement } from "@/lib/meteoDepartements";

// ---------------------------------------------------------------------------
// Configuration Météo-France
// ---------------------------------------------------------------------------

const URL_VIGILANCE =
  "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours";

// Météo-France :
// 1 = vert
// 2 = jaune
// 3 = orange
// 4 = rouge

type CouleurVigilance =
  | "vert"
  | "jaune"
  | "orange"
  | "rouge";

const COULEUR_PAR_ID: Record<
  number,
  CouleurVigilance
> = {
  1: "vert",
  2: "jaune",
  3: "orange",
  4: "rouge",
};

// ---------------------------------------------------------------------------
// Phénomènes suivis
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Types retournés
// ---------------------------------------------------------------------------

export interface VigilancePhenomene {
  id: number;
  nom: string;
  couleur: CouleurVigilance;
}

export interface VigilanceDepartement {
  departement: string;
  couleurMax: CouleurVigilance;
  phenomenes: VigilancePhenomene[];
  misAJourLe: string | null;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
) {
  const rawParam =
    request.nextUrl.searchParams.get("departement") ??
    request.nextUrl.searchParams.get("location");

  const demain =
    request.nextUrl.searchParams.get("demain") === "true";

  // -------------------------------------------------------------------------
  // Vérification paramètre
  // -------------------------------------------------------------------------

  if (!rawParam?.trim()) {
    return NextResponse.json(
      {
        error:
          "Paramètre 'departement' ou 'location' manquant",
      },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // Résolution de l'adresse vers le département
  // -------------------------------------------------------------------------

  const departement =
    adresseVersDepartement(rawParam) ??
    rawParam.trim().toUpperCase();

  // -------------------------------------------------------------------------
  // Clé API
  // -------------------------------------------------------------------------

  const apiKey =
    process.env.METEOFRANCE_API_KEY;

  if (!apiKey) {
    console.error(
      "METEOFRANCE_API_KEY non configurée"
    );

    return NextResponse.json(
      {
        error:
          "METEOFRANCE_API_KEY non configurée",
      },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // Appel Météo-France
  // -------------------------------------------------------------------------

  try {
    const response = await fetch(
      URL_VIGILANCE,
      {
        method: "GET",
        headers: {
          apikey: apiKey,
        },

        // La vigilance ne change pas toutes les secondes.
        // 10 minutes de cache suffisent.
        next: {
          revalidate: 600,
        },
      }
    );

    if (!response.ok) {
      const texte =
        await response.text();

      console.error(
        "Erreur API Vigilance Météo-France:",
        response.status,
        texte
      );

      return NextResponse.json(
        {
          error:
            "Échec de l'appel à l'API Vigilance Météo-France",
          status: response.status,
        },
        { status: 502 }
      );
    }

    const data =
      await response.json();

    // -----------------------------------------------------------------------
    // Extraction du département
    // -----------------------------------------------------------------------

    const resultat =
      extraireDepartement(
        data,
        departement,
        demain
      );

    if (!resultat) {
      return NextResponse.json(
        {
          error:
            `Département ${departement} ` +
            "introuvable dans la réponse Météo-France",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      resultat
    );
  } catch (error) {
    console.error(
      "Erreur route meteo-vigilance:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erreur serveur lors de la récupération de la vigilance",
      },
      { status: 500 }
    );
  }
}

// ===========================================================================
// EXTRACTION DU DÉPARTEMENT
// ===========================================================================
//
// La structure de l'API peut légèrement varier selon les versions.
//
// On reste donc volontairement tolérant sur :
//   product.periods
//   periods
//   timelaps.domain_ids
//   domain_ids
//
// ===========================================================================

function extraireDepartement(
  data: any,
  departement: string,
  demain = false
): VigilanceDepartement | null {
  // -------------------------------------------------------------------------
  // Périodes
  // -------------------------------------------------------------------------

  const periodes =
    data?.product?.periods ??
    data?.periods ??
    [];

  if (
    !Array.isArray(periodes) ||
    periodes.length === 0
  ) {
    console.error(
      "Réponse Vigilance sans périodes exploitables"
    );

    return null;
  }

  // J = 0
  // J+1 = 1

  const index =
    demain ? 1 : 0;

  const periode =
    periodes[index] ??
    periodes[0];

  if (!periode) {
    return null;
  }

  // -------------------------------------------------------------------------
  // Départements disponibles dans la période
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Normalisation du département demandé
  // -------------------------------------------------------------------------

  const deptNormalized =
    departement
      .trim()
      .toUpperCase();

  // -------------------------------------------------------------------------
  // Recherche du département
  // -------------------------------------------------------------------------

  const domaineDept =
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

        // Cas standard :
        // 33, 75, 64, 13, etc.
        if (
          id === deptNormalized
        ) {
          return true;
        }

        // Corse du Sud
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

        // Haute-Corse
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
      }
    );

  if (!domaineDept) {
    console.warn(
      `Département ${deptNormalized} ` +
      "non trouvé dans les données Vigilance"
    );

    return null;
  }

  // -------------------------------------------------------------------------
  // Couleur maximale du département
  // -------------------------------------------------------------------------

  const couleurMax =
    COULEUR_PAR_ID[
      Number(
        domaineDept.max_color_id
      )
    ] ?? "vert";

  // -------------------------------------------------------------------------
  // Phénomènes
  // -------------------------------------------------------------------------

  const phenomenesBrut: any[] =
    domaineDept.phenomenon_items ??
    domaineDept.phenomenon_max_colors ??
    [];

  const phenomenes =
    phenomenesBrut
      .map(
        (phenomene: any) => {
          const id =
            Number(
              phenomene?.phenomenon_id ??
              phenomene
                ?.phenomenon_max_color_id
                ?.phenomenon_id
            );

          if (
            !id ||
            !PHENOMENE_PAR_ID[id]
          ) {
            return null;
          }

          // Selon la forme de la réponse,
          // la couleur peut être directement dans
          // phenomenon_max_color_id ou dans color_id/max_color_id.

          const couleurId =
            Number(
              phenomene
                ?.phenomenon_max_color_id ??
              phenomene?.color_id ??
              phenomene?.max_color_id ??
              1
            );

          return {
            id,
            nom:
              PHENOMENE_PAR_ID[id],
            couleur:
              COULEUR_PAR_ID[
                couleurId
              ] ?? "vert",
          };
        }
      )
      .filter(
        (
          phenomene
        ): phenomene is VigilancePhenomene =>
          phenomene !== null
      );

  // -------------------------------------------------------------------------
  // Date de mise à jour
  // -------------------------------------------------------------------------

  const misAJourLe =
    data?.product?.update_time ??
    data?.update_time ??
    null;

  // -------------------------------------------------------------------------
  // Résultat final
  // -------------------------------------------------------------------------

  return {
    departement:
      deptNormalized,

    couleurMax,

    phenomenes,

    misAJourLe,
  };
}
