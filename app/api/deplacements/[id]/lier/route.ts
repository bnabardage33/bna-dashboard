import { NextRequest, NextResponse } from "next/server";
import { verifierSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEntrepriseCouranteId } from "../../utils";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;

  try {
    const entrepriseId = await getEntrepriseCouranteId();
    if (!entrepriseId) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body || !body.devis_id) {
      return NextResponse.json({ error: "devis_id manquant." }, { status: 400 });
    }

    const { data, error } = await (supabaseAdmin as any).rpc("lier_deplacement_devis", {
      p_deplacement_id: params.id,
      p_devis_id: body.devis_id,
      p_entreprise_id: entrepriseId
    });

    if (error) {
      if (error.message.includes("HTTP_409_CONFLICT")) {
        return NextResponse.json({ error: "Ce déplacement est déjà lié à un devis." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erreur interne" }, { status: 500 });
  }
}
