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

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { adresseVersDepartement } from "@/lib/meteoDepartements";
import {
  evaluerJourChantier,
  Materiau,
  Acces,
  NiveauAlerte,
} from "@/lib/meteoAlerte";
import type { HeureMeteo } from "@/lib/meteo";
import type { RapportResult } from "@/types/finance";

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
  vigilance?: NiveauAlerte;
  rapportId?: string;
  statut: string;
  erreur?: string;
};

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const VISUAL_CROSSING_URL =
  "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline";

const ORDRE_VIGILANCE: Record<NiveauAlerte, number> = {
  vert: 0,
  jaune: 1,
  orange: 2,
  rouge: 3,
};

// -----------------------------------------------------------------------------
// Utilitaires
// -----------------------------------------------------------------------------

function plusForte(
  a: NiveauAlerte,
  b: NiveauAlerte
): NiveauAlerte {
  return ORDRE_VIGILANCE[a] >= ORDRE_VIGILANCE[b] ? a : b;
}

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
  adresse: string,
  apiKey: string
): Promise<MeteoJour> {
  const url =
    `${VISUAL_CROSSING_URL}/${encodeURIComponent(adresse)}/today` +
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

  const heures: HeureRapport[] = (today.hours ?? []).map((h: any) => ({
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
) {
  const origin = new URL(request.url).origin;

  const url =
    `${origin}/api/meteo-vigilance?departement=` +
    encodeURIComponent(departement);

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);

    throw new Error(
      data?.error ||
        `Impossible de récupérer la vigilance Météo-France (${response.status})`
    );
  }

  return response.json();
}

// -----------------------------------------------------------------------------
// Numéro de rapport
// -----------------------------------------------------------------------------

async function prochainNumero(): Promise<string> {
  const annee = new Date().getFullYear();

  const { data, error } = await supabase
    .from("rapports_intemperies")
    .select("numero")
    .ilike("numero", `RI-${annee}-%`);

  if (error) {
    throw new Error(
      `Impossible de récupérer les numéros existants : ${error.message}`
    );
  }

  const numeros = (data ?? [])
    .map((ligne: any) => {
      const morceaux = String(ligne.numero ?? "").split("-");
      return Number.parseInt(morceaux[2] ?? "", 10);
    })
    .filter((numero) => Number.isFinite(numero));

  const prochain =
    numeros.length > 0 ? Math.max(...numeros) + 1 : 1;

  return `RI-${annee}-${String(prochain).padStart(3, "0")}`;
}

// -----------------------------------------------------------------------------
// Vérification rapport existant aujourd'hui
// -----------------------------------------------------------------------------

async function rapportDuJourExiste(
  chantierId: string
) {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);

  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);

  const { data, error } = await supabase
    .from("rapports_intemperies")
    .select("id, numero, cree_le")
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

  return data;
}

// -----------------------------------------------------------------------------
// POST
// -----------------------------------------------------------------------------

export async function POST(request: NextRequest) {
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

    const chantierId = typeof body.chantierId === "string" ? body.chantierId : undefined;
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

    let query = supabase
      .from("chantiers")
      .select(
        [
          "id",
          "nom",
          "adresse_chantier",
          "materiau_structurel",
          "moyen_acces",
          "zone_vent",
          "statut",
        ].join(", ")
      );

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

    if (!chantiers || chantiers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: chantierId ? "Chantier introuvable" : "Aucun chantier actif trouvé",
        },
        { status: 404 }
      );
    }

    const resultats: ResultatGeneration[] = [];
    const listeChantiers = (chantiers || []) as unknown as RapportResult[];

    for (const chantier of listeChantiers as any[]) {
      try {
        const existant = await rapportDuJourExiste(chantier.id);

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

        const adresse = chantier.adresse_chantier?.trim() || chantier.nom?.trim() || "Bordeaux, France";
        const departement = adresseVersDepartement(adresse) || "33";
        const materiau = normaliserMateriau(chantier.materiau_structurel);
        const acces = normaliserAcces(chantier.moyen_acces);
        const zoneVent = normaliserZoneVent(chantier.zone_vent);

        const meteo = await fetchMeteoVisualCrossing(adresse, visualCrossingKey);
        const vigilance = await fetchVigilanceInterne(request, departement);

        const heuresMeteo: HeureMeteo[] = meteo.heures.map((h) => ({
          heure: h.heure,
          temp: h.temp,
          vent: h.vent,
          rafales: h.rafales,
          pluie: h.pluie,
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
          vigilance?.couleurMax ?? "vert",
          vigilance?.couleurMax ?? "vert"
        );

        const niveauRapport = plusForte(decision.vigilanceOfficielle, decision.risqueTechnique.niveau);

        let motif = decision.motif;
        if (decision.risqueTechnique.niveau !== "vert" && decision.risqueTechnique.motif) {
          motif += ` Risque technique : ${decision.risqueTechnique.motif}.`;
        }

        const donneesRapport = {
          vigilance_officielle: niveauRapport,
          jour_arrete: decision.jourArrete,
          a_valider: decision.aValider,
          ampleur_impact: decision.jourArrete ? "complete" : decision.aValider ? "partielle" : null,
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
        let rapportFinal: any;

        if (existant && force) {
          numero = existant.numero;
          const { data: rapportMaj, error: erreurMaj } = await supabase
            .from("rapports_intemperies")
            .update(donneesRapport)
            .eq("id", existant.id)
            .select()
            .single();

          if (erreurMaj || !rapportMaj) {
            throw new Error(erreurMaj?.message || "Impossible de mettre à jour le rapport");
          }
          rapportFinal = rapportMaj;
        } else {
          numero = await prochainNumero();
          const { data: rapportCree, error: erreurInsertion } = await supabase
            .from("rapports_intemperies")
            .insert({
              numero,
              chantier_id: chantier.id,
              ...donneesRapport,
              cree_par: "auto",
            })
            .select()
            .single();

          if (erreurInsertion || !rapportCree) {
            throw new Error(erreurInsertion?.message || "Impossible de créer le rapport");
          }
          rapportFinal = rapportCree;
        }

        resultats.push({
          chantierId: chantier.id,
          nom: chantier.nom,
          numero,
          vigilance: niveauRapport,
          rapportId: (rapportFinal as { id: string }).id,
          statut: existant && force ? "Rapport mis à jour avec succès" : "Rapport généré avec succès",
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Erreur génération rapport chantier ${chantier.id}: ${message}`);
        resultats.push({
          chantierId: chantier.id,
          nom: chantier.nom,
          statut: "Erreur lors de la génération",
          erreur: message,
        });
      }
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
