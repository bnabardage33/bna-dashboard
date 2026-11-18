import { NextRequest, NextResponse } from "next/server";
import { verifierSession } from "@/lib/auth";
import { resoudreLocalisationMeteo } from "@/lib/meteoLocalisation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;

  try {
    const body = (await request.json()) as { adresse?: string };
    const adresse = typeof body.adresse === "string" ? body.adresse.trim() : "";
    if (!adresse) {
      return NextResponse.json({ error: "Adresse requise" }, { status: 400 });
    }

    const res = await resoudreLocalisationMeteo(adresse);
    if (!res.ok) {
      return NextResponse.json({ error: res.erreur }, { status: 422 });
    }

    return NextResponse.json({
      lat: res.data.lat,
      lng: res.data.lon,
      libelle: res.data.libelle,
      codePostal: res.data.codePostal,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur géocodage" },
      { status: 500 }
    );
  }
}
