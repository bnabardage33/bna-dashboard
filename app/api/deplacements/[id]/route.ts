import { NextRequest, NextResponse } from "next/server";
import { verifierSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEntrepriseCouranteId } from "../utils";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;

  try {
    const entrepriseId = await getEntrepriseCouranteId();
    if (!entrepriseId) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps invalide" }, { status: 400 });

    const { data: existing, error: findError } = await (supabaseAdmin as any)
      .from("frais_deplacement")
      .select("id, devis_id")
      .eq("id", params.id)
      .eq("entreprise_id", entrepriseId)
      .maybeSingle();

    if (findError) throw findError;
    if (!existing) return NextResponse.json({ error: "Déplacement introuvable" }, { status: 404 });
    if (existing.devis_id) return NextResponse.json({ error: "Action impossible : déplacement déjà lié" }, { status: 403 });

    const updateData: any = {};
    if (body.statut !== undefined) {
      if (!["prevu", "effectue", "annule"].includes(body.statut)) {
        return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
      }
      updateData.statut = body.statut;
    }
    if (body.devis_id !== undefined) {
      updateData.devis_id = body.devis_id;
    }
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await (supabaseAdmin as any)
      .from("frais_deplacement")
      .update(updateData)
      .eq("id", params.id)
      .eq("entreprise_id", entrepriseId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;

  try {
    const entrepriseId = await getEntrepriseCouranteId();
    if (!entrepriseId) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 403 });

    const { data: existing, error: findError } = await (supabaseAdmin as any)
      .from("frais_deplacement")
      .select("id, devis_id")
      .eq("id", params.id)
      .eq("entreprise_id", entrepriseId)
      .maybeSingle();

    if (findError) throw findError;
    if (!existing) return NextResponse.json({ error: "Déplacement introuvable" }, { status: 404 });
    if (existing.devis_id) return NextResponse.json({ error: "Action impossible : déplacement déjà lié" }, { status: 403 });

    const { error } = await (supabaseAdmin as any)
      .from("frais_deplacement")
      .delete()
      .eq("id", params.id)
      .eq("entreprise_id", entrepriseId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
