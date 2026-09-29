import { NextRequest, NextResponse } from "next/server";
import { verifierSession } from "@/lib/auth";
import { evaluerDistances } from "@/lib/deplacement/service";
import { calculerMontantDeplacement, calculerTaxesDeplacement } from "@/lib/deplacement/calcul";
import { getEntrepriseCouranteId, lireTarifCommercial } from "../utils";

export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;

  try {
    const entrepriseId = await getEntrepriseCouranteId();
    if (!entrepriseId) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body || !body.adresse_depart || !body.adresse_arrivee) {
      return NextResponse.json({ error: "Adresses de départ et d'arrivée requises." }, { status: 400 });
    }

    const tarifKm = await lireTarifCommercial(entrepriseId);

    const distanceRes = await evaluerDistances(body.adresse_depart, body.adresse_arrivee);
    if (!distanceRes.ok) {
      return NextResponse.json({ error: distanceRes.erreur }, { status: 400 });
    }

    const { distanceAllerKm, distanceRetourKm } = distanceRes.data;
    const montantHt = calculerMontantDeplacement(distanceAllerKm, distanceRetourKm, tarifKm);
    const { montantTva, montantTtc } = calculerTaxesDeplacement(montantHt, 20);

    return NextResponse.json({
      distanceAllerKm,
      distanceRetourKm,
      tarifKm,
      montantHt,
      montantTva,
      montantTtc
    });
  } catch (err) {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
