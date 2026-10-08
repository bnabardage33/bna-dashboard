import { NextRequest, NextResponse } from "next/server";
import { resoudreTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/types/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/factures/[id]
 *
 * Récupère le détail d'une facture de l'entreprise courante.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  const { id } = await params;

  try {
    const supabase = await createClient();
    const { data: facture, error } = await supabase
      .from("factures")
      .select("*")
      .eq("id", id)
      .eq("entreprise_id", tenant.entrepriseId)
      .maybeSingle();

    if (error || !facture) {
      return NextResponse.json(
        { ok: false, error: "Facture introuvable ou non autorisée." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: facture }, { status: 200 });
  } catch (error) {
    console.error("Erreur GET /api/factures/[id]:", error);
    return NextResponse.json(
      { ok: false, error: "Erreur interne serveur." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/factures/[id]
 *
 * Met à jour le statut ou les métadonnées d'une facture.
 *
 * INVARIANT D'IMMUTABILITÉ FINANCIÈRE :
 *   - Les montants de retenue et montants TTC ne peuvent pas être modifiés
 *     rétroactivement pour simuler une libération de retenue.
 *   - L'historique de libération doit transiter EXCLUSIVEMENT par la RPC
 *     et la table `retenues_liberations`.
 *   - Le passage à 'annulee' déclenche automatiquement le recalcul
 *     de la retenue de garantie cumulée du chantier (exclusion de l'assiette).
 */
export async function PATCH(
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
        { ok: false, error: "Corps de requête JSON invalide." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: existante, error: readErr } = await supabase
      .from("factures")
      .select("*")
      .eq("id", id)
      .eq("entreprise_id", tenant.entrepriseId)
      .maybeSingle();

    if (readErr || !existante) {
      return NextResponse.json(
        { ok: false, error: "Facture introuvable ou non autorisée." },
        { status: 404 }
      );
    }

    // Protection contre la falsification rétroactive des montants financiers
    const champsInterdits = [
      "montant_ht",
      "montant_tva",
      "montant_ttc",
      "montant_retenue_ht",
      "montant_retenue_ttc",
      "net_a_payer_ttc",
      "retenue_garantie_pct",
      "entreprise_id",
      "id",
    ];

    for (const champ of champsInterdits) {
      if (champ in body && body[champ] !== existante[champ as keyof typeof existante]) {
        return NextResponse.json(
          {
            ok: false,
            error: `Modification interdite : le champ financier '${champ}' est immuable après émission.`,
          },
          { status: 403 }
        );
      }
    }

    const updatePayload: TablesUpdate<"factures"> = {};

    if ("statut" in body && typeof body.statut === "string") {
      const statutValide = ["brouillon", "emise", "payee", "annulee"];
      if (!statutValide.includes(body.statut)) {
        return NextResponse.json(
          { ok: false, error: `Statut invalide : ${body.statut}` },
          { status: 400 }
        );
      }
      updatePayload.statut = body.statut;
    }

    if ("echeance" in body) {
      updatePayload.echeance =
        typeof body.echeance === "string" ? body.echeance : null;
    }
    if ("objet" in body) {
      updatePayload.objet =
        typeof body.objet === "string" ? body.objet : null;
    }
    if ("adresse_chantier" in body) {
      updatePayload.adresse_chantier =
        typeof body.adresse_chantier === "string" ? body.adresse_chantier : null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Aucun champ valide à mettre à jour." },
        { status: 400 }
      );
    }

    const { data: updated, error: updateErr } = await supabase
      .from("factures")
      .update(updatePayload)
      .eq("id", id)
      .eq("entreprise_id", tenant.entrepriseId)
      .select()
      .single();

    if (updateErr) {
      console.error("Erreur PATCH /api/factures/[id]:", updateErr);
      return NextResponse.json(
        { ok: false, error: "Échec de la mise à jour de la facture." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: updated }, { status: 200 });
  } catch (error) {
    console.error("Erreur interne PATCH /api/factures/[id]:", error);
    return NextResponse.json(
      { ok: false, error: "Erreur interne serveur." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/factures/[id]
 *
 * Supprime une facture en statut 'brouillon'.
 * Le trigger SQL décrémente automatiquement le cumul de retenue du chantier.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  const { id } = await params;

  try {
    const supabase = await createClient();
    const { data: existante, error: readErr } = await supabase
      .from("factures")
      .select("id, statut")
      .eq("id", id)
      .eq("entreprise_id", tenant.entrepriseId)
      .maybeSingle();

    if (readErr || !existante) {
      return NextResponse.json(
        { ok: false, error: "Facture introuvable ou non autorisée." },
        { status: 404 }
      );
    }

    if (existante.statut !== "brouillon") {
      return NextResponse.json(
        {
          ok: false,
          error: "Seule une facture au statut 'brouillon' peut être supprimée.",
        },
        { status: 403 }
      );
    }

    const { error: delErr } = await supabase
      .from("factures")
      .delete()
      .eq("id", id)
      .eq("entreprise_id", tenant.entrepriseId);

    if (delErr) {
      return NextResponse.json(
        { ok: false, error: "Échec de la suppression de la facture." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: "Facture supprimée." }, { status: 200 });
  } catch (error) {
    console.error("Erreur interne DELETE /api/factures/[id]:", error);
    return NextResponse.json(
      { ok: false, error: "Erreur interne serveur." },
      { status: 500 }
    );
  }
}
