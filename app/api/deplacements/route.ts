import { NextRequest, NextResponse } from "next/server";
import { verifierSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEntrepriseCouranteId, verifierChantier, lireTarifCommercial } from "./utils";
import { validerFraisDeplacement } from "@/lib/deplacement/validation";
import { calculerMontantDeplacement, calculerTaxesDeplacement } from "@/lib/deplacement/calcul";

export async function GET(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;

  try {
    const entrepriseId = await getEntrepriseCouranteId();
    if (!entrepriseId) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 403 });

    const url = new URL(req.url);
    const chantierId = url.searchParams.get("chantier_id");
    if (!chantierId) return NextResponse.json({ error: "chantier_id requis." }, { status: 400 });

    const validChantier = await verifierChantier(chantierId, entrepriseId);
    if (!validChantier) return NextResponse.json({ error: "Chantier invalide ou non autorisé." }, { status: 403 });

    const { data, error } = await (supabaseAdmin as any)
      .from("frais_deplacement")
      .select("*")
      .eq("entreprise_id", entrepriseId)
      .eq("chantier_id", chantierId)
      .order("date", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;

  try {
    const entrepriseId = await getEntrepriseCouranteId();
    if (!entrepriseId) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps invalide" }, { status: 400 });

    body.entreprise_id = entrepriseId;

    const validation = validerFraisDeplacement(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.erreur }, { status: 400 });
    }

    const validData = validation.data;
    const validChantier = await verifierChantier(validData.chantier_id, entrepriseId);
    if (!validChantier) return NextResponse.json({ error: "Chantier invalide ou non autorisé." }, { status: 403 });

    const tarifKm = await lireTarifCommercial(entrepriseId);
    const montantHt = calculerMontantDeplacement(validData.distance_aller_km, validData.distance_retour_km, tarifKm);
    const { montantTva, montantTtc } = calculerTaxesDeplacement(montantHt, validData.taux_tva ?? 20);

    const insertData = {
      ...validData,
      tarif_km: tarifKm,
      montant_ht: montantHt,
      montant_tva: montantTva,
      montant_ttc: montantTtc,
      entreprise_id: entrepriseId
    };

    const { data: inserted, error } = await (supabaseAdmin as any)
      .from("frais_deplacement")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(inserted);
  } catch (err) {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
