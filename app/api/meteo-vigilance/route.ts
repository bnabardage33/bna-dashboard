// app/api/meteo-vigilance/route.ts
// Interroge l'API officielle Vigilance de Météo-France pour un département
// donné, et renvoie la couleur globale + le détail par phénomène (vent,
// pluie-inondation, orages, etc.).
//
// Doc / abonnement : portail-api.meteofrance.fr -> "DonneesPubliquesVigilance"
// Clé API attendue dans la variable d'env METEOFRANCE_APPLICATION_ID (.env.local).
//
// MODE D'AUTHENTIFICATION (vérifié dans lib/meteoFranceToken.ts) : l'endpoint
// DPVigilance v1 exige le token OAuth2 en `Authorization: Bearer <token>`,
// obtenu par client_credentials. Ce n'est PAS un simple header `apikey`.
//
// Le parsing du JSON vit dans `lib/vigilanceMeteoFrance.ts`, partagé avec
// l'Edge Function (Deno) : une seule lecture, pas trois.

import { NextRequest, NextResponse } from "next/server";
import { obtenirTokenMeteoFrance, invaliderCacheToken } from "@/lib/meteoFranceToken";
import { adresseVersDepartement } from "@/lib/meteoDepartements";
import { verifierSession } from "@/lib/auth";
import { extraireDepartement } from "@/lib/vigilanceMeteoFrance";

const URL_VIGILANCE =
  "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours";

export async function GET(request: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;

  const rawParam =
    request.nextUrl.searchParams.get("departement") ||
    request.nextUrl.searchParams.get("location");
  const demain = request.nextUrl.searchParams.get("demain") === "true";

  if (!rawParam) {
    return NextResponse.json(
      { error: "Paramètre 'departement' ou 'location' manquant" },
      { status: 400 }
    );
  }

  const departement =
    adresseVersDepartement(rawParam) || rawParam.trim().toUpperCase();

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

    const data: unknown = await res.json();
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
