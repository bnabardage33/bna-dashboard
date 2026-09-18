// app/api/meteo-vigilance/route.ts
// Interroge l'API officielle Vigilance de Météo-France pour un département
// donné, et renvoie la couleur globale + le détail par phénomène (vent,
// pluie-inondation, orages, etc.).
//
// Doc / abonnement : portail-api.meteofrance.fr -> "DonneesPubliquesVigilance"
// Clé API attendue dans la variable d'env METEOFRANCE_APPLICATION_ID (.env.local).

import { NextRequest, NextResponse } from "next/server";
import { obtenirTokenMeteoFrance, invaliderCacheToken } from "@/lib/meteoFranceToken";
import { adresseVersDepartement } from "@/lib/meteoDepartements";
import { verifierSession } from "@/lib/auth";

const URL_VIGILANCE =
  "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours";

const COULEUR_PAR_ID: Record<number, "vert" | "jaune" | "orange" | "rouge"> = {
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

export interface VigilancePhenomene {
  id: number;
  nom: string;
  couleur: "vert" | "jaune" | "orange" | "rouge";
}

export interface VigilanceDepartement {
  departement: string;
  couleurMax: "vert" | "jaune" | "orange" | "rouge";
  phenomenes: VigilancePhenomene[];
  misAJourLe: string | null;
}

interface PhenomeneMaxColor {
  phenomenon_id: number;
  color_id?: number;
}

interface PhenomeneItem {
  phenomenon_id: number;
  phenomenon_max_color_id?: PhenomeneMaxColor;
  color_id?: number;
  max_color_id?: number;
}

interface Domaine {
  domain_id?: string;
  max_color_id?: number;
  phenomenon_items?: PhenomeneItem[];
  phenomenon_max_colors?: PhenomeneItem[];
}

interface Timelaps {
  domain_ids?: string[];
}

interface Periode {
  timelaps?: Timelaps;
  domain_ids?: string[];
  phenomenon_items?: PhenomeneItem[];
  phenomenon_max_colors?: PhenomeneItem[];
}

interface MeteoFranceData {
  product?: {
    periods?: Periode[];
    domain_ids?: string[];
    update_time?: string;
  };
  periods?: Periode[];
}

export async function GET(request: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  const rawParam = request.nextUrl.searchParams.get("departement") || request.nextUrl.searchParams.get("location");
  const demain = request.nextUrl.searchParams.get("demain") === "true";

  if (!rawParam) {
    return NextResponse.json(
      { error: "Paramètre 'departement' ou 'location' manquant" },
      { status: 400 }
    );
  }

  const departement = adresseVersDepartement(rawParam) || rawParam.trim().toUpperCase();

  let apiKey: string;

  try {
    apiKey = await obtenirTokenMeteoFrance();
  } catch (error) {
    console.error("Erreur génération token Météo-France:", error);
    return NextResponse.json(
      { error: "Impossible d'obtenir un token Météo-France" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(URL_VIGILANCE, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      const texte = await res.text();
      console.error("Erreur API Vigilance Météo-France:", res.status, texte);

      if (res.status === 401) {
        invaliderCacheToken();
      }

      return NextResponse.json(
        { error: "Échec de l'appel à l'API Vigilance" },
        { status: 502 }
      );
    }

    const data: MeteoFranceData = await res.json();

    const resultat = extraireDepartement(data, departement, demain);

    if (!resultat) {
      return NextResponse.json(
        { error: `Département ${departement} introuvable dans la réponse` },
        { status: 404 }
      );
    }

    return NextResponse.json(resultat);
  } catch (err) {
    console.error("Erreur route meteo-vigilance:", err);
    return NextResponse.json(
      { error: "Erreur serveur vigilance" },
      { status: 500 }
    );
  }
}

/*
 * IMPORTANT : la forme exacte du JSON renvoyé par Météo-France peut varier
 * légèrement. On fouille donc la réponse de façon tolérante plutôt que de
 * viser un chemin fixe.
 */
function extraireDepartement(
  data: MeteoFranceData,
  departement: string,
  demain = false
): VigilanceDepartement | null {
  const periodes = data?.product?.periods ?? data?.periods ?? [];
  if (!Array.isArray(periodes) || periodes.length === 0) return null;

  const index = demain ? 1 : 0;
  const periodeEnCours = periodes[index] ?? periodes[0];

  const domaines =
    periodeEnCours?.timelaps?.domain_ids ??
    periodeEnCours?.domain_ids ??
    [];

  const domaineArray: Domaine[] = Array.isArray(domaines)
    ? (domaines as Domaine[])
    : Object.values(domaines ?? {}) as Domaine[];

  const deptNormalized = departement.toString().trim().toUpperCase();

  const domaineDept = domaineArray.find((d) => {
    const dId = d?.domain_id?.toString().trim().toUpperCase();
    if (!dId) return false;
    if (dId === deptNormalized) return true;
    if (deptNormalized === "2A" && (dId === "20A" || dId === "2A" || dId === "200" || dId === "201")) return true;
    if (deptNormalized === "2B" && (dId === "20B" || dId === "2B" || dId === "202")) return true;
    return false;
  });

  if (!domaineDept) return null;

  const couleurMax =
    COULEUR_PAR_ID[domaineDept.max_color_id ?? 0] ?? "vert";

  const phenomenesBrut: PhenomeneItem[] =
    domaineDept.phenomenon_items ??
    domaineDept.phenomenon_max_colors ??
    [];

  const phenomenes: VigilancePhenomene[] = phenomenesBrut
    .map((p) => {
      const id = p.phenomenon_id ?? p.phenomenon_max_color_id?.phenomenon_id;
      const couleurId = p.phenomenon_max_color_id?.color_id ?? p.color_id ?? p.max_color_id;
      if (!id || !PHENOMENE_PAR_ID[id]) return null;
      return {
        id,
        nom: PHENOMENE_PAR_ID[id],
        couleur: COULEUR_PAR_ID[couleurId ?? 0] ?? "vert",
      };
    })
    .filter(Boolean) as VigilancePhenomene[];

  return {
    departement,
    couleurMax,
    phenomenes,
    misAJourLe: data?.product?.update_time ?? null,
  };
}