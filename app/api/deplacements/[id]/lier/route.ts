import { NextRequest, NextResponse } from "next/server";
import { verifierSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getEntrepriseCouranteId } from "../../utils";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;

  try {
    // Pré-contrôle applicatif : un compte sans entreprise rattachée n'a rien à
    // lier. La RPC refait le même contrôle côté base (fail-closed) — celui-ci
    // sert à rendre l'erreur lisible, pas à sécuriser.
    const entrepriseId = await getEntrepriseCouranteId();
    if (!entrepriseId) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body || !body.devis_id) {
      return NextResponse.json({ error: "devis_id manquant." }, { status: 400 });
    }

    // B1 — L'appel se fait par le client PORTÉ PAR LA SESSION de l'utilisateur
    // (cookies, clé anon), et non par supabaseAdmin (clé service_role). C'est
    // indispensable : entreprise_courante() lit le claim
    // app_metadata.entreprise_id du JWT de l'appelant, or le JWT du service_role
    // ne porte pas ce claim. En passant par le service_role, la RPC tournerait
    // sans contexte et échouerait fermée.
    //
    // La RPC ne reçoit plus p_entreprise_id : le tenant est résolu DEPUIS LA
    // SESSION. Un utilisateur du tenant B ne peut plus viser le tenant A, même
    // en appelant la RPC directement depuis le navigateur.
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("lier_deplacement_devis", {
      p_deplacement_id: id,
      p_devis_id: body.devis_id,
    });

    if (error) {
      if (error.message.includes("HTTP_409_CONFLICT")) {
        return NextResponse.json({ error: "Ce déplacement est déjà lié à un devis." }, { status: 409 });
      }
      if (error.message.includes("HTTP_400_CONTEXTE_ENTREPRISE")) {
        return NextResponse.json({ error: "Entreprise introuvable." }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
