import { NextRequest, NextResponse } from "next/server";
import { resoudreTenant } from "@/lib/tenant";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { calculerSoldeRestantDu } from "@/lib/retenueCalculs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/factures/[id]/reglements
 *
 * Liste les règlements partiels d'une facture appartenant à l'entreprise courante
 * et retourne le résumé (déjà réglé / reste à encaisser).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  const { id } = await params;

  try {
    const { data: facture, error: errFacture } = await supabaseAdmin
      .from("factures")
      .select("id, net_a_payer_ttc, statut")
      .eq("id", id)
      .eq("entreprise_id", tenant.entrepriseId)
      .maybeSingle();

    if (errFacture || !facture) {
      return NextResponse.json(
        { ok: false, error: "Facture introuvable ou non autorisée." },
        { status: 404 }
      );
    }

    const { data: reglements, error: errReglements } = await supabaseAdmin
      .from("reglements_factures")
      .select("*")
      .eq("facture_id", id)
      .eq("entreprise_id", tenant.entrepriseId)
      .order("date_reglement", { ascending: true })
      .order("created_at", { ascending: true });

    if (errReglements) {
      return NextResponse.json(
        { ok: false, error: errReglements.message },
        { status: 500 }
      );
    }

    const liste = reglements || [];
    const resume = calculerSoldeRestantDu(facture.net_a_payer_ttc, liste);

    return NextResponse.json(
      { ok: true, data: liste, resume },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erreur GET /api/factures/[id]/reglements:", error);
    return NextResponse.json(
      { ok: false, error: "Erreur interne serveur." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/factures/[id]/reglements
 *
 * Enregistre un règlement partiel (ou total) sur une facture et passe
 * automatiquement son statut à 'payee' lorsque le cumul réglé atteint net_a_payer_ttc.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  const { id } = await params;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Corps de requête invalide." },
        { status: 400 }
      );
    }

    const montantTtc = Number(body.montant_ttc);
    if (!Number.isFinite(montantTtc) || montantTtc <= 0) {
      return NextResponse.json(
        { ok: false, error: "Le montant du règlement doit être strictement positif." },
        { status: 400 }
      );
    }

    const dateReglement =
      typeof body.date_reglement === "string" && body.date_reglement.trim()
        ? body.date_reglement.trim()
        : new Date().toISOString().split("T")[0];
    const modePaiement =
      typeof body.mode_paiement === "string" && body.mode_paiement.trim()
        ? body.mode_paiement.trim()
        : "virement";
    const reference =
      typeof body.reference === "string" && body.reference.trim()
        ? body.reference.trim()
        : null;

    const { data: facture, error: errFacture } = await supabaseAdmin
      .from("factures")
      .select("id, net_a_payer_ttc, statut, type_facture")
      .eq("id", id)
      .eq("entreprise_id", tenant.entrepriseId)
      .maybeSingle();

    if (errFacture || !facture) {
      return NextResponse.json(
        { ok: false, error: "Facture introuvable ou non autorisée." },
        { status: 404 }
      );
    }

    if (facture.statut === "annulee" || facture.type_facture === "avoir") {
      return NextResponse.json(
        {
          ok: false,
          error: "Impossible d'enregistrer un règlement sur une facture annulée ou un avoir.",
        },
        { status: 400 }
      );
    }

    const { data: reglementCree, error: errInsert } = await supabaseAdmin
      .from("reglements_factures")
      .insert({
        facture_id: id,
        entreprise_id: tenant.entrepriseId,
        montant_ttc: Math.round(montantTtc * 100) / 100,
        date_reglement: dateReglement,
        mode_paiement: modePaiement,
        reference,
      })
      .select()
      .single();

    if (errInsert || !reglementCree) {
      return NextResponse.json(
        { ok: false, error: errInsert?.message || "Échec de l'enregistrement du règlement." },
        { status: 500 }
      );
    }

    const { data: tousReglements } = await supabaseAdmin
      .from("reglements_factures")
      .select("*")
      .eq("facture_id", id)
      .eq("entreprise_id", tenant.entrepriseId)
      .order("date_reglement", { ascending: true })
      .order("created_at", { ascending: true });

    const liste = tousReglements || [reglementCree];
    const resume = calculerSoldeRestantDu(facture.net_a_payer_ttc, liste);

    let nouveauStatut = facture.statut;
    if (resume.est_soldee && facture.statut !== "payee") {
      nouveauStatut = "payee";
      await supabaseAdmin
        .from("factures")
        .update({ statut: "payee" })
        .eq("id", id)
        .eq("entreprise_id", tenant.entrepriseId);
    }

    return NextResponse.json(
      {
        ok: true,
        data: reglementCree,
        reglements: liste,
        resume,
        statut: nouveauStatut,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur POST /api/factures/[id]/reglements:", error);
    return NextResponse.json(
      { ok: false, error: "Erreur interne serveur." },
      { status: 500 }
    );
  }
}
