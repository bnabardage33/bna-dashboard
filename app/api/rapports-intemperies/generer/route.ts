// app/api/rapports-intemperies/generer/route.ts
//
// Génération des rapports d'intempéries.
// ------------------------------------------------------------
// Sources utilisées :
//   1. Visual Crossing -> données météo réelles
//   2. /api/meteo-vigilance -> vigilance officielle Météo-France
//   3. lib/meteoAlerte.ts -> analyse technique du chantier
//
// IMPORTANT :
// La vigilance officielle Météo-France et le risque technique
// du chantier restent deux notions distinctes.
// ------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Database, TablesInsert } from "@/types/supabase";
import { verifierSession } from "@/lib/auth";
import { adresseVersDepartement } from "@/lib/meteoDepartements";
import { resoudreLocalisationMeteo } from "@/lib/meteoLocalisation";
import {
  evaluerJourChantier,
  Materiau,
  Acces,
  NiveauAlerte,
} from "@/lib/meteoAlerte";
import type { HeureMeteo } from "@/lib/meteo";
import { heureParisEnMinutes } from "@/lib/dateParis";
import { statutHeure } from "@/lib/meteoHoraire";
import {
  prefixerMotifVigilance,
  type VigilanceDepartement,
} from "@/lib/vigilanceMeteoFrance";

// La vigilance officielle est SOIT une couleur Météo-France, SOIT l'état
// explicite « indisponible ». Elle n'est jamais remplacée par un « vert » de
// complaisance : une vigilance qu'on n'a pas pu lire n'est pas une vigilance
// verte.
export type StatutVigilance = NiveauAlerte | "indisponible";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type HeureRapport = {
  heure: string;
  temp: number;
  vent: number;
  rafales: number;
  pluie: number;
};

type MeteoJour = {
  heures: HeureRapport[];
  tempMax: number;
  rafalesMax: number;
  pluieCumul: number;
};

type ResultatGeneration = {
  chantierId: string;
  nom: string | null;
  numero?: string;
  vigilance?: StatutVigilance;
  rapportId?: string;
  statut: string;
  erreur?: string;
};

type ChantierMeteoRow = {
  id: string;
  entreprise_id: string;
  nom: string | null;
  adresse_chantier: string | null;
  materiau_structurel: string | null;
  moyen_acces: string | null;
  zone_vent: string | null;
  statut: string | null;
};

type ClientDonnees = SupabaseClient<Database>;

type ContexteGeneration = {
  client: ClientDonnees;
  entrepriseIds: string[];
};

type ResultatContexteGeneration =
  | { ok: true; contexte: ContexteGeneration }
  | { ok: false; reponse: NextResponse };

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VISUAL_CROSSING_URL =
  "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline";

function estUuid(value: string) {
  return UUID_RE.test(value);
}

// Une session ne traite que le tenant de son claim. Le chemin cron est
// exclusivement accessible avec CRON_SECRET et transforme la liste des
// entreprises actives en contextes tenant séparés.
async function resoudreContexteGeneration(
  request: NextRequest
): Promise<ResultatContexteGeneration> {
  const session = await verifierSession();

  if (session.authentifie) {
    try {
      const client = await createClient();
      const {
        data: { user },
        error,
      } = await client.auth.getUser();

      if (error || !user) {
        return {
          ok: false,
          reponse: NextResponse.json({ error: "Non autorisé" }, { status: 401 }),
        };
      }

      const claim = (
        user.app_metadata as { entreprise_id?: unknown } | null | undefined
      )?.entreprise_id;
      const entrepriseId = typeof claim === "string" ? claim.trim() : "";

      if (!estUuid(entrepriseId)) {
        return {
          ok: false,
          reponse: NextResponse.json(
            { error: "Contexte entreprise introuvable ou invalide." },
            { status: 403 }
          ),
        };
      }

      return {
        ok: true,
        contexte: { client, entrepriseIds: [entrepriseId] },
      };
    } catch (err) {
      console.error("Erreur résolution contexte rapports intempéries:", err);
      return {
        ok: false,
        reponse: NextResponse.json({ error: "Erreur serveur" }, { status: 500 }),
      };
    }
  }

  const secret = process.env.CRON_SECRET ?? "";
  const autorisation = request.headers.get("authorization") ?? "";
  if (!secret || autorisation !== `Bearer ${secret}`) {
    return {
      ok: false,
      reponse: NextResponse.json({ error: "Non autorisé" }, { status: 401 }),
    };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("entreprises")
      .select("id")
      .eq("actif", true)
      .order("id");

    if (error) {
      return {
        ok: false,
        reponse: NextResponse.json({ error: "Erreur serveur" }, { status: 500 }),
      };
    }

    const entrepriseIds = [...new Set((data ?? []).map((entreprise) => entreprise.id))];
    if (entrepriseIds.some((id) => !estUuid(id))) {
      return {
        ok: false,
        reponse: NextResponse.json({ error: "Erreur serveur" }, { status: 500 }),
      };
    }

    return {
      ok: true,
      contexte: { client: supabaseAdmin, entrepriseIds },
    };
  } catch (err) {
    console.error("Erreur résolution contexte cron rapports intempéries:", err);
    return {
      ok: false,
      reponse: NextResponse.json({ error: "Erreur serveur" }, { status: 500 }),
    };
  }
}

// -----------------------------------------------------------------------------
// Utilitaires
// -----------------------------------------------------------------------------

function normaliserMateriau(value: unknown): Materiau {
  const valeur = String(value ?? "").toLowerCase().trim();

  switch (valeur) {
    case "metal":
    case "métal":
    case "bac_acier":
    case "bac-acier":
      return "metal";

    case "composite":
      return "composite";

    case "fibrociment":
    case "fibre-ciment":
      return "fibrociment";

    case "bois":
    default:
      return "bois";
  }
}

function normaliserAcces(value: unknown): Acces {
  const valeur = String(value ?? "").toLowerCase().trim();

  switch (valeur) {
    case "nacelle":
      return "nacelle";

    case "echafaudage":
    case "échafaudage":
    default:
      return "echafaudage";
  }
}

function normaliserZoneVent(value: unknown): number {
  const zone = Number(value);

  if (!Number.isFinite(zone)) return 1;

  return Math.min(4, Math.max(1, Math.round(zone)));
}

// -----------------------------------------------------------------------------
// Météo Visual Crossing
// -----------------------------------------------------------------------------

async function fetchMeteoVisualCrossing(
  coordonnees: { lat: number; lon: number },
  apiKey: string
): Promise<MeteoJour> {
  // Visual Crossing reçoit `lat,lon` : ce sont les coordonnées validées par le
  // code postal, les mêmes que celles d'Open-Meteo ailleurs. Il ne géocode donc
  // plus l'adresse lui-même et ne peut pas retenir une autre commune.
  const url =
    `${VISUAL_CROSSING_URL}/${coordonnees.lat},${coordonnees.lon}/today` +
    `?unitGroup=metric` +
    `&key=${encodeURIComponent(apiKey)}` +
    `&contentType=json` +
    `&include=days,hours` +
    `&elements=datetime,temp,windspeed,windgust,precip`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    const texte = await response.text().catch(() => "");

    throw new Error(
      `Visual Crossing (${response.status})${
        texte ? ` : ${texte.slice(0, 200)}` : ""
      }`
    );
  }

  const data = await response.json();
  const today = data?.days?.[0];

  if (!today) {
    throw new Error("Aucune donnée météo disponible pour aujourd'hui");
  }

  const heures: HeureRapport[] = (today.hours ?? []).map(
    (h: {
      datetime?: string | number;
      temp?: string | number;
      windspeed?: string | number;
      windgust?: string | number;
      precip?: string | number;
    }) => ({
    heure: String(h.datetime ?? "").slice(0, 5),
    temp: Math.round(Number(h.temp ?? 0)),
    vent: Math.round(Number(h.windspeed ?? 0)),
    rafales: Math.round(
      Number(h.windgust ?? h.windspeed ?? 0)
    ),
    pluie: Number(h.precip ?? 0),
  }));

  const tempMax =
    heures.length > 0
      ? Math.max(...heures.map((h) => h.temp))
      : Number(today.tempmax ?? 0);

  const rafalesMax =
    heures.length > 0
      ? Math.max(...heures.map((h) => h.rafales))
      : Number(today.windgust ?? today.windspeed ?? 0);

  const pluieCumul =
    heures.length > 0
      ? heures.reduce((total, h) => total + h.pluie, 0)
      : Number(today.precip ?? 0);

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
//
// On utilise la même route interne que le reste de l'application.
// La clé Météo-France reste donc côté serveur.
// -----------------------------------------------------------------------------

async function fetchVigilanceInterne(
  request: NextRequest,
  departement: string
): Promise<VigilanceDepartement | null> {
  const origin = new URL(request.url).origin;

  const url =
    `${origin}/api/meteo-vigilance?departement=` +
    encodeURIComponent(departement);

  try {
    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      // La vigilance officielle est INDISPONIBLE (clé/API en panne, département
      // inconnu…). On ne l'invente pas : on retourne `null`, l'appelant écrira
      // l'état explicite « indisponible » et poursuivra la génération.
      console.warn(
        `Vigilance Météo-France indisponible pour le département ${departement} (${response.status})`
      );
      return null;
    }

    return (await response.json()) as VigilanceDepartement;
  } catch (erreur) {
    console.warn(
      `Vigilance Météo-France injoignable pour le département ${departement}`,
      erreur
    );
    return null;
  }
}

// -----------------------------------------------------------------------------
// Numéro de rapport
// -----------------------------------------------------------------------------

async function prochainNumero(entrepriseId: string): Promise<string> {
  if (!estUuid(entrepriseId)) {
    throw new Error("Contexte entreprise invalide");
  }

  // La RPC est réservée à service_role. Le tenant est donc toujours transmis
  // explicitement ; la variante 0-argument n'est jamais appelée.
  const { data, error } = await supabaseAdmin.rpc("generer_prochain_numero_ri", {
    p_entreprise_id: entrepriseId,
  });
  if (error || !data) {
    throw new Error(
      `Impossible de générer un numéro sécurisé via RPC : ${error?.message}`
    );
  }
  return data;
}

// -----------------------------------------------------------------------------
// Vérification rapport existant aujourd'hui
// -----------------------------------------------------------------------------

async function rapportDuJourExiste(
  client: ClientDonnees,
  entrepriseId: string,
  chantierId: string
) {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);

  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);

  const { data, error } = await client
    .from("rapports_intemperies")
    .select("id, numero, cree_le, chantier_id, entreprise_id")
    .eq("entreprise_id", entrepriseId)
    .eq("chantier_id", chantierId)
    .gte("cree_le", debut.toISOString())
    .lt("cree_le", fin.toISOString())
    .order("cree_le", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erreur recherche rapport existant : ${error.message}`
    );
  }

  if (
    data &&
    (data.entreprise_id !== entrepriseId || data.chantier_id !== chantierId)
  ) {
    throw new Error("Rapport existant hors entreprise");
  }

  return data;
}

// -----------------------------------------------------------------------------
// POST
// -----------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const resultatContexte = await resoudreContexteGeneration(request);
  if (!resultatContexte.ok) return resultatContexte.reponse;

  const { client, entrepriseIds } = resultatContexte.contexte;

  try {
    let body: {
      chantierId?: string;
      force?: boolean;
    } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    let chantierId: string | undefined;
    if (body.chantierId !== undefined) {
      if (typeof body.chantierId !== "string" || !estUuid(body.chantierId.trim())) {
        return NextResponse.json(
          { success: false, error: "chantierId invalide" },
          { status: 400 }
        );
      }
      chantierId = body.chantierId.trim();
    }

    const force = body.force === true;
    const visualCrossingKey = process.env.VISUALCROSSING_API_KEY;

    if (!visualCrossingKey) {
      return NextResponse.json(
        {
          success: false,
          error: "VISUALCROSSING_API_KEY non configurée dans .env.local",
        },
        { status: 500 }
      );
    }

    const resultats: ResultatGeneration[] = [];
    let totalChantiers = 0;

    for (const entrepriseId of entrepriseIds) {
      let query = client
        .from("chantiers")
        .select(
          [
            "id",
            "entreprise_id",
            "nom",
            "adresse_chantier",
            "materiau_structurel",
            "moyen_acces",
            "zone_vent",
            "statut",
          ].join(", ")
        )
        .eq("entreprise_id", entrepriseId);

      if (chantierId) {
        query = query.eq("id", chantierId);
      } else {
        query = query.neq("statut", "termine");
      }

      const { data: chantiers, error: erreurChantiers } = await query;

      if (erreurChantiers) {
        return NextResponse.json(
          {
            success: false,
            error: `Erreur chargement des chantiers : ${erreurChantiers.message}`,
          },
          { status: 500 }
        );
      }

      const listeChantiers = (chantiers || []) as unknown as ChantierMeteoRow[];
      if (listeChantiers.some((chantier) => chantier.entreprise_id !== entrepriseId)) {
        return NextResponse.json(
          { success: false, error: "Contexte entreprise invalide" },
          { status: 500 }
        );
      }

      totalChantiers += listeChantiers.length;

      for (const chantier of listeChantiers) {
        try {
          const existant = await rapportDuJourExiste(
            client,
            entrepriseId,
            chantier.id
          );

          if (existant && !force) {
            resultats.push({
              chantierId: chantier.id,
              nom: chantier.nom,
              numero: existant.numero,
              rapportId: existant.id,
              statut: "Rapport déjà existant pour aujourd'hui",
            });
            continue;
          }

          const adresse =
            chantier.adresse_chantier?.trim() ||
            chantier.nom?.trim() ||
            "Bordeaux, France";

          // Code postal d'abord : si le lieu ne peut pas être validé (code
          // postal incompatible, ambiguïté), on refuse ce chantier au lieu de
          // produire un rapport sur une commune choisie au hasard.
          const localisation = await resoudreLocalisationMeteo(adresse);
          if (!localisation.ok) {
            throw new Error(`Localisation non validée : ${localisation.erreur}`);
          }

          const departement = adresseVersDepartement(adresse) || "33";
          const materiau = normaliserMateriau(chantier.materiau_structurel);
          const acces = normaliserAcces(chantier.moyen_acces);
          const zoneVent = normaliserZoneVent(chantier.zone_vent);

          const meteo = await fetchMeteoVisualCrossing(
            { lat: localisation.data.lat, lon: localisation.data.lon },
            visualCrossingKey
          );
          const vigilance = await fetchVigilanceInterne(request, departement);

          const referenceMinutes = heureParisEnMinutes();
          const heuresMeteo: HeureMeteo[] = meteo.heures.map((h) => ({
            heure: h.heure,
            temp: h.temp,
            vent: h.vent,
            rafales: h.rafales,
            pluie: h.pluie,
            // Ce fetcher VisualCrossing n'expose pas l'horodatage de son
            // relevé courant : la nature des heures reste donc `inconnue`.
            // On n'affirme pas « observé » sans marque de fiabilité.
            statut: statutHeure(h.heure, referenceMinutes),
            nature: "inconnue",
          }));

          const decision = evaluerJourChantier(
            materiau,
            acces,
            {
              rafalesMax: meteo.rafalesMax,
              pluieCumul: meteo.pluieCumul,
              tempMax: meteo.tempMax,
            },
            heuresMeteo,
            // Couleur officielle SEULE, ou `null` si elle est indisponible. Le
            // risque technique du chantier n'entre PAS ici : il est calculé
            // séparément par `evaluerJourChantier`.
            vigilance?.couleurMax ?? null,
            vigilance?.couleurMax ?? null
          );

          // La vigilance OFFICIELLE enregistrée est la couleur Météo-France, et
          // rien d'autre. Plus de fusion avec le risque technique : une
          // vigilance verte accompagnée d'un dépassement mesuré sur le chantier
          // ne doit PAS devenir « vigilance orange ». Si la vigilance n'a pas pu
          // être lue, on écrit l'état explicite « indisponible » — jamais une
          // couleur inventée.
          const vigilanceOfficielle: StatutVigilance =
            vigilance?.couleurMax ?? "indisponible";

          // Préfixe d'indisponibilité PARTAGÉ avec l'Edge Function
          // (`lib/vigilanceMeteoFrance.ts`) : le motif ne doit jamais laisser
          // croire à une vigilance verte confirmée quand la donnée manque.
          let motif = prefixerMotifVigilance(
            decision.motif,
            vigilance?.couleurMax ?? null,
            vigilance?.couleurMax ?? null
          );
          if (
            decision.risqueTechnique.niveau !== "vert" &&
            decision.risqueTechnique.motif
          ) {
            motif += ` Risque technique : ${decision.risqueTechnique.motif}.`;
          }

          const donneesRapport = {
            vigilance_officielle: vigilanceOfficielle,
            jour_arrete: decision.jourArrete,
            a_valider: decision.aValider,
            ampleur_impact: decision.jourArrete
              ? "complete"
              : decision.aValider
                ? "partielle"
                : null,
            pluie_continue: decision.pluieContinue,
            motif,
            risque_technique_niveau: decision.risqueTechnique.niveau,
            risque_technique_motif: decision.risqueTechnique.motif,
            temp_max: meteo.tempMax,
            rafales_max: meteo.rafalesMax,
            pluie_cumul: meteo.pluieCumul,
            materiau,
            acces,
            departement,
            releve_horaire: meteo.heures,
          };

          let numero: string;
          let rapportId: string | null = null;

          if (existant && force) {
            numero = existant.numero;
            const { data: rapportMaj, error: erreurMaj } = await client
              .from("rapports_intemperies")
              .update(donneesRapport)
              .eq("id", existant.id)
              .eq("entreprise_id", entrepriseId)
              .eq("chantier_id", chantier.id)
              .select("id, chantier_id, entreprise_id")
              .single();

            if (
              erreurMaj ||
              !rapportMaj ||
              rapportMaj.entreprise_id !== entrepriseId ||
              rapportMaj.chantier_id !== chantier.id
            ) {
              throw new Error(
                erreurMaj?.message || "Impossible de mettre à jour le rapport"
              );
            }
            rapportId = rapportMaj.id;
          } else {
            numero = await prochainNumero(entrepriseId);
            const donneesInsertion: TablesInsert<"rapports_intemperies"> = {
              entreprise_id: entrepriseId,
              numero,
              chantier_id: chantier.id,
              ...donneesRapport,
              cree_par: "auto",
            };
            const { data: rapportCree, error: erreurInsertion } = await client
              .from("rapports_intemperies")
              .insert(donneesInsertion)
              .select("id, chantier_id, entreprise_id")
              .single();

            if (
              erreurInsertion ||
              !rapportCree ||
              rapportCree.entreprise_id !== entrepriseId ||
              rapportCree.chantier_id !== chantier.id
            ) {
              throw new Error(
                erreurInsertion?.message || "Impossible de créer le rapport"
              );
            }
            rapportId = rapportCree.id;
          }

          resultats.push({
            chantierId: chantier.id,
            nom: chantier.nom,
            numero,
            vigilance: vigilanceOfficielle,
            rapportId: rapportId ?? undefined,
            statut:
              existant && force
                ? "Rapport mis à jour avec succès"
                : "Rapport généré avec succès",
          });
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(
            `Erreur génération rapport chantier ${chantier.id}: ${message}`
          );
          resultats.push({
            chantierId: chantier.id,
            nom: chantier.nom,
            statut: "Erreur lors de la génération",
            erreur: message,
          });
        }
      }
    }

    if (totalChantiers === 0) {
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

    const erreurs = resultats.filter((r) => r.erreur);

    return NextResponse.json({
      success: erreurs.length === 0,
      total: resultats.length,
      generes: resultats.filter((r) => r.rapportId).length,
      erreurs: erreurs.length,
      resultats,
    });
  } catch (globalError: unknown) {
    console.error("Erreur globale dans l'API de génération :", globalError);
    return NextResponse.json(
      {
        success: false,
        error: globalError instanceof Error ? globalError.message : String(globalError),
      },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------------------------
// GET
// -----------------------------------------------------------------------------
//
// Permet de tester rapidement la route dans le navigateur.
// Exemple :
// /api/rapports-intemperies/generer?chantierId=xxx
//
// Le GET est converti en POST interne.
// -----------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const chantierId =
    request.nextUrl.searchParams.get("chantierId");

  const url = new URL(request.url);

  const nouvelleRequete = new NextRequest(
    url.toString(),
    {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        chantierId: chantierId || undefined,
        force: false,
      }),
    }
  );

  return POST(nouvelleRequete);
}
