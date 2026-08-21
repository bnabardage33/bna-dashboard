// app/api/rapports-intemperies/generer/route.ts
//
// Route API serveur pour analyser la météo et générer / mettre à jour
// les rapports d'intempéries pour un chantier spécifique ou tous les
// chantiers actifs.
//
// Sources :
// - Météo-France : vigilance officielle du département
// - Visual Crossing : conditions météo locales du chantier
// - meteoAlerte.ts : analyse du risque technique chantier
//
// IMPORTANT :
// vigilance_officielle = uniquement la vigilance officielle Météo-France.
// Les conditions météo locales et le risque technique sont traités séparément.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { adresseVersDepartement } from "@/lib/meteoDepartements";
import {
  Materiau,
  Acces,
  evaluerAlerteChantier,
  pleutTouteLaJournee,
  NiveauAlerte,
} from "@/lib/meteoAlerte";

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

const ORDRE: Record<NiveauAlerte, number> = {
  vert: 0,
  jaune: 1,
  orange: 2,
  rouge: 3,
};

type HeureMeteo = {
  heure: string;
  temp: number;
  vent: number;
  rafales: number;
  pluie: number;
};

type VigilanceInfo = {
  couleurMax: NiveauAlerte;
  phenomenes: {
    nom: string;
    couleur: NiveauAlerte;
  }[];
};

function plusForte(
  a: NiveauAlerte,
  b: NiveauAlerte
): NiveauAlerte {
  return ORDRE[a] >= ORDRE[b] ? a : b;
}

/**
 * Récupère les données météo locales du jour via Visual Crossing.
 */
async function fetchMeteoVisualCrossing(
  adresse: string,
  apiKey: string
): Promise<{
  heures: HeureMeteo[];
  tempMax: number;
  rafalesMax: number;
  pluieCumul: number;
}> {
  const url =
    `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/` +
    `${encodeURIComponent(adresse)}/today` +
    `?unitGroup=metric` +
    `&key=${apiKey}` +
    `&contentType=json` +
    `&include=days,hours` +
    `&elements=datetime,temp,windspeed,windgust,precip`;

  const res = await fetch(url, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Erreur Visual Crossing (${res.status}) pour l'adresse "${adresse}"`
    );
  }

  const data = await res.json();
  const today = data?.days?.[0];

  if (!today) {
    throw new Error(
      "Aucune donnée météo disponible pour cette adresse"
    );
  }

  const heures: HeureMeteo[] = (today.hours ?? []).map(
    (h: {
      datetime: string;
      temp: number;
      windspeed: number;
      windgust?: number | null;
      precip?: number | null;
    }) => ({
      heure: h.datetime.slice(0, 5),
      temp: Math.round(h.temp ?? 0),
      vent: Math.round(h.windspeed ?? 0),
      rafales: Math.round(h.windgust ?? h.windspeed ?? 0),
      pluie: Number(h.precip ?? 0),
    })
  );

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

/**
 * Récupère la vigilance officielle Météo-France du département.
 *
 * Cette fonction ne tient compte QUE de Météo-France.
 * Les conditions Visual Crossing ne modifient jamais
 * vigilance_officielle.
 */
async function fetchVigilanceMeteoFrance(
  departement: string,
  apiKey?: string
): Promise<VigilanceInfo> {
  if (!apiKey) {
    console.warn(
      "METEOFRANCE_API_KEY non configurée : vigilance officielle indisponible."
    );

    return {
      couleurMax: "vert",
      phenomenes: [],
    };
  }

  try {
    const res = await fetch(URL_VIGILANCE, {
      headers: {
        apikey: apiKey,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(
        `API Vigilance Météo-France indisponible (${res.status})`
      );

      return {
        couleurMax: "vert",
        phenomenes: [],
      };
    }

    const data = await res.json();

    const periodes =
      data?.product?.periods ??
      data?.periods ??
      [];

    const periodeEnCours = periodes[0];

    const domaines =
      periodeEnCours?.timelaps?.domain_ids ??
      periodeEnCours?.domain_ids ??
      [];

    const domaineArray: any[] = Array.isArray(domaines)
      ? domaines
      : Object.values(domaines ?? {});

    const deptNormalized = departement
      .trim()
      .toUpperCase();

    const domaineDept = domaineArray.find(
      (d: any) => {
        const dId = d?.domain_id
          ?.toString()
          .trim()
          .toUpperCase();

        if (!dId) return false;

        if (dId === deptNormalized) {
          return true;
        }

        if (
          deptNormalized === "2A" &&
          ["20A", "2A", "200", "201"].includes(dId)
        ) {
          return true;
        }

        if (
          deptNormalized === "2B" &&
          ["20B", "2B", "202"].includes(dId)
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
      };
    }

    const couleurMax =
      COULEUR_PAR_ID[domaineDept.max_color_id] ??
      "vert";

    const phenomenesBrut: any[] =
      domaineDept.phenomenon_items ??
      domaineDept.phenomenon_max_colors ??
      [];

    const phenomenes = phenomenesBrut
      .map((p: any) => {
        const id =
          p?.phenomenon_id ??
          p?.phenomenon_max_color_id?.phenomenon_id;

        const couleurId =
          p?.phenomenon_max_color_id ??
          p?.color_id ??
          p?.max_color_id;

        if (!id || !PHENOMENE_PAR_ID[id]) {
          return null;
        }

        return {
          nom: PHENOMENE_PAR_ID[id],
          couleur:
            COULEUR_PAR_ID[couleurId] ?? "vert",
        };
      })
      .filter(Boolean) as {
      nom: string;
      couleur: NiveauAlerte;
    }[];

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

/**
 * Calcule le prochain numéro RI-YYYY-XXX.
 *
 * NOTE :
 * Pour une garantie absolue contre deux numéros identiques
 * en cas de génération simultanée, une séquence SQL côté
 * Supabase serait préférable.
 */
async function prochainNumero(): Promise<string> {
  const annee = new Date().getFullYear();

  const { data, error } = await supabase
    .from("rapports_intemperies")
    .select("numero")
    .ilike("numero", `RI-${annee}-%`);

  if (error) {
    throw new Error(
      `Impossible de récupérer la numérotation : ${error.message}`
    );
  }

  const numeros = (data ?? [])
    .map((row: { numero?: string }) => {
      const parts = (row.numero ?? "").split("-");
      return Number.parseInt(parts[2] ?? "", 10) || 0;
    })
    .filter((numero) => numero > 0);

  const suivant =
    (numeros.length > 0
      ? Math.max(...numeros)
      : 0) + 1;

  return `RI-${annee}-${String(suivant).padStart(3, "0")}`;
}

/**
 * Retourne le début de la journée courante.
 */
function debutJournee(): Date {
  const date = new Date();

  date.setHours(0, 0, 0, 0);

  return date;
}

/**
 * Construit le motif du rapport.
 */
function construireMotif({
  vigilanceOfficielle,
  nomPhenomene,
  meteo,
  pluieContinue,
  risqueTechnique,
}: {
  vigilanceOfficielle: NiveauAlerte;
  nomPhenomene: string;
  meteo: {
    rafalesMax: number;
    pluieCumul: number;
    tempMax: number;
  };
  pluieContinue: boolean;
  risqueTechnique: {
    niveau: NiveauAlerte;
    motif: string | null;
  };
}): {
  jourArrete: boolean;
  aValider: boolean;
  ampleurImpact: "complete" | "partielle" | null;
  motif: string;
} {
  /*
   * ROUGE Météo-France :
   * arrêt total automatique.
   */
  if (vigilanceOfficielle === "rouge") {
    return {
      jourArrete: true,
      aValider: false,
      ampleurImpact: "complete",
      motif:
        `Vigilance ROUGE Météo-France (${nomPhenomene}) ` +
        `• arrêt total des travaux sur le chantier.`,
    };
  }

  /*
   * ORANGE Météo-France :
   * décision à valider par le responsable chantier.
   */
  if (vigilanceOfficielle === "orange") {
    return {
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",
      motif:
        `Vigilance ORANGE Météo-France (${nomPhenomene}) ` +
        `• rafales ${meteo.rafalesMax} km/h, ` +
        `pluie ${meteo.pluieCumul.toFixed(1)} mm ` +
        `• arrêt partiel ou complet à valider.`,
    };
  }

  /*
   * JAUNE Météo-France :
   * surveillance et validation humaine.
   */
  if (vigilanceOfficielle === "jaune") {
    return {
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",
      motif:
        `Vigilance JAUNE Météo-France (${nomPhenomene}) ` +
        `• conditions dégradées constatées : ` +
        `rafales ${meteo.rafalesMax} km/h, ` +
        `pluie ${meteo.pluieCumul.toFixed(1)} mm.`,
    };
  }

  /*
   * Même sans vigilance officielle,
   * une pluie continue peut empêcher certains travaux.
   */
  if (pluieContinue) {
    return {
      jourArrete: true,
      aValider: false,
      ampleurImpact: "complete",
      motif:
        `Pluie continue constatée sur la journée ` +
        `(${meteo.pluieCumul.toFixed(1)} mm) ` +
        `• conditions incompatibles avec certains travaux.`,
    };
  }

  /*
   * Risque technique élevé détecté par le moteur chantier.
   */
  if (risqueTechnique.niveau === "rouge") {
    return {
      jourArrete: true,
      aValider: false,
      ampleurImpact: "complete",
      motif:
        `Risque technique chantier élevé ` +
        `• ${risqueTechnique.motif ?? "conditions incompatibles avec les travaux"}.`,
    };
  }

  if (risqueTechnique.niveau === "orange") {
    return {
      jourArrete: false,
      aValider: true,
      ampleurImpact: "partielle",
      motif:
        `Risque technique chantier important ` +
        `• ${risqueTechnique.motif ?? "conditions dégradées nécessitant une validation"}.`,
    };
  }

  /*
   * Conditions normales.
   */
  return {
    jourArrete: false,
    aValider: false,
    ampleurImpact: null,
    motif:
      `Relevé météorologique du jour ` +
      `• rafales max ${meteo.rafalesMax} km/h, ` +
      `température max ${meteo.tempMax}°C, ` +
      `cumul pluie ${meteo.pluieCumul.toFixed(1)} mm.`,
  };
}

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

  const chantierId = body.chantierId;
  const force = body.force === true;

  const visualCrossingKey =
    process.env.VISUALCROSSING_API_KEY;

  const meteoFranceKey =
    process.env.METEOFRANCE_API_KEY;

  if (!visualCrossingKey) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Clé VISUALCROSSING_API_KEY non configurée dans .env.local",
      },
      { status: 500 }
    );
  }

  /*
   * 1. Récupération des chantiers cibles.
   */
  let query = supabase
    .from("chantiers")
    .select(
      "id, nom, adresse_chantier, materiau_structural, moyen_acces, zone_vent, statut"
    );

  if (chantierId) {
    query = query.eq("id", chantierId);
  } else {
    query = query.neq("statut", "termine");
  }

  const {
    data: chantiers,
    error: errChantiers,
  } = await query;

  if (
    errChantiers ||
    !chantiers ||
    chantiers.length === 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error: chantierId
          ? "Chantier introuvable"
          : "Aucun chantier actif trouvé",
      },
      { status: 404 }
    );
  }

  const debutJour = debutJournee();

  const resultats: Array<Record<string, unknown>> = [];

  /*
   * 2. Analyse de chaque chantier.
   */
  for (const ch of chantiers) {
    try {
      /*
       * Une adresse chantier est obligatoire.
       * Aucun fallback vers une autre ville.
       */
      const adresse =
        typeof ch.adresse_chantier === "string"
          ? ch.adresse_chantier.trim()
          : "";

      if (!adresse) {
        throw new Error(
          "Adresse du chantier manquante"
        );
      }

      /*
       * 3. Recherche d'un rapport déjà créé aujourd'hui.
       */
      const {
        data: existant,
        error: errExistant,
      } = await supabase
        .from("rapports_intemperies")
        .select("id, numero")
        .eq("chantier_id", ch.id)
        .gte("cree_le", debutJour.toISOString())
        .order("cree_le", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errExistant) {
        throw new Error(
          `Impossible de vérifier le rapport du jour : ${errExistant.message}`
        );
      }

      /*
       * Si un rapport existe et que force=false,
       * on ne crée rien.
       */
      if (existant && !force) {
        resultats.push({
          chantierId: ch.id,
          nom: ch.nom,
          statut: "Rapport déjà existant",
          rapportId: existant.id,
          numero: existant.numero,
        });

        continue;
      }

      /*
       * 4. Département du chantier.
       */
      const departement =
        adresseVersDepartement(adresse);

      if (!departement) {
        throw new Error(
          `Impossible de déterminer le département à partir de l'adresse "${adresse}"`
        );
      }

      /*
       * 5. Météo locale réelle.
       */
      const meteoJour =
        await fetchMeteoVisualCrossing(
          adresse,
          visualCrossingKey
        );

      /*
       * 6. Vigilance officielle Météo-France.
       *
       * IMPORTANT :
       * Cette valeur reste indépendante des seuils
       * Visual Crossing.
       */
      const vigilance =
        await fetchVigilanceMeteoFrance(
          departement,
          meteoFranceKey
        );

      const phenomeneMax =
        vigilance.phenomenes.find(
          (p) =>
            p.couleur === vigilance.couleurMax
        );

      const nomPhenomene =
        phenomeneMax?.nom ??
        "conditions météorologiques";

      /*
       * 7. Analyse du risque technique chantier.
       */
      const mat =
        (ch.materiau_structural as Materiau) ??
        "bois";

      const acc =
        (ch.moyen_acces as Acces) ??
        "echafaudage";

      const risqueTechnique =
        evaluerAlerteChantier(
          mat,
          acc,
          {
            rafalesMax:
              meteoJour.rafalesMax,
            pluieCumul:
              meteoJour.pluieCumul,
            tempMax:
              meteoJour.tempMax,
          }
        );

      /*
       * 8. Analyse pluie continue.
       */
      const pluieContinue =
        pleutTouteLaJournee(
          meteoJour.heures
        );

      /*
       * 9. Décision chantier.
       *
       * La vigilance officielle Météo-France
       * n'est jamais modifiée.
       */
      const decision =
        construireMotif({
          vigilanceOfficielle:
            vigilance.couleurMax,
          nomPhenomene,
          meteo: meteoJour,
          pluieContinue,
          risqueTechnique,
        });

      /*
       * 10. Numéro du rapport.
       *
       * Si on régénère un rapport existant,
       * on conserve son numéro.
       */
      const numero =
        existant?.numero ??
        (await prochainNumero());

      /*
       * 11. Données finales.
       */
      const rapportData = {
        numero,
        chantier_id: ch.id,

        /*
         * OFFICIEL :
         * uniquement Météo-France.
         */
        vigilance_officielle:
          vigilance.couleurMax,

        /*
         * DÉCISION CHANTIER :
         * basée sur vigilance + météo locale +
         * règles techniques.
         */
        jour_arrete:
          decision.jourArrete,

        a_valider:
          decision.aValider,

        ampleur_impact:
          decision.ampleurImpact,

        pluie_continue:
          pluieContinue,

        motif:
          decision.motif,

        risque_technique_niveau:
          risqueTechnique.niveau,

        risque_technique_motif:
          risqueTechnique.motif,

        temp_max:
          meteoJour.tempMax,

        rafales_max:
          meteoJour.rafalesMax,

        pluie_cumul:
          meteoJour.pluieCumul,

        materiau: mat,

        acces: acc,

        departement,

        releve_horaire:
          meteoJour.heures,

        /*
         * Cette route est une génération automatique
         * à partir des données météo.
         */
        cree_par: "auto",
      };

      /*
       * 12. Création ou régénération.
       */
      let rapportCree;

      if (existant && force) {
        const {
          data,
          error,
        } = await supabase
          .from("rapports_intemperies")
          .update(rapportData)
          .eq("id", existant.id)
          .select()
          .single();

        if (error) {
          throw error;
        }

        rapportCree = data;
      } else {
        const {
          data,
          error,
        } = await supabase
          .from("rapports_intemperies")
          .insert(rapportData)
          .select()
          .single();

        if (error) {
          throw error;
        }

        rapportCree = data;
      }

      /*
       * 13. Résultat.
       */
      resultats.push({
        chantierId: ch.id,
        nom: ch.nom,
        numero,
        vigilance:
          vigilance.couleurMax,
        rapportId: rapportCree.id,
        statut:
          existant && force
            ? "Rapport régénéré avec succès"
            : "Rapport généré avec succès",
      });
    } catch (error: unknown) {
      console.error(
        `Erreur génération rapport pour chantier ${ch.id}:`,
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      resultats.push({
        chantierId: ch.id,
        nom: ch.nom,
        statut: "Erreur",
        error: message,
      });
    }
  }

  return NextResponse.json({
    success: true,
    total: resultats.length,
    resultats,
  });
}
