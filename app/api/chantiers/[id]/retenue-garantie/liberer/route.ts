import { NextRequest, NextResponse } from "next/server";
import { resoudreTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import type { MotifLiberationRetenue, LibererRetenueResult } from "@/types/finance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MOTIFS_VALIDES: MotifLiberationRetenue[] = [
  "levee_reserves",
  "echeance_1_an_gpa",
  "accord_amiable",
  "substitution_caution",
];

/**
 * POST /api/chantiers/[id]/retenue-garantie/liberer
 *
 * Libère tout ou partie de la retenue de garantie via la RPC transactionnelle
 * `liberer_retenue_garantie_rpc`.
 *
 * Invariants V2.1 garantis :
 *   1. Transaction atomique côté base de données (FOR UPDATE sur le compte chantier).
 *   2. Solde restant >= 0 : aucun dépassement de montant possible.
 *   3. Si motif = 'levee_reserves', un PV purgé (sans_reserve ou reserves_levees) est exigé.
 *   4. Traçabilité immuable dans `retenues_liberations`.
 *   5. Aucune altération des factures d'origine émises.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  const { id: chantierId } = await params;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Corps de requête JSON invalide." },
        { status: 400 }
      );
    }

    const {
      montant_ttc,
      motif,
      pv_reception_id,
      observations,
      document_ref,
    } = body as {
      montant_ttc?: unknown;
      motif?: unknown;
      pv_reception_id?: unknown;
      observations?: unknown;
      document_ref?: unknown;
    };

    // 1) Validation du montant
    const montantNum = Number(montant_ttc);
    if (!Number.isFinite(montantNum) || montantNum <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Le montant à libérer doit être un nombre strictement positif.",
        },
        { status: 400 }
      );
    }

    // 2) Validation du motif
    if (typeof motif !== "string" || !MOTIFS_VALIDES.includes(motif as MotifLiberationRetenue)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Motif de libération invalide. Motifs autorisés : ${MOTIFS_VALIDES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // 3) Contrôle d'exigence du PV pour 'levee_reserves'
    const pvId =
      typeof pv_reception_id === "string" && pv_reception_id.trim()
        ? pv_reception_id.trim()
        : null;

    if (motif === "levee_reserves" && !pvId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Un PV de réception avec réserves levées est obligatoire pour le motif 'levee_reserves'.",
        },
        { status: 400 }
      );
    }

    // 4) Appel exclusif de la RPC transactionnelle sécurisée
    const supabase = await createClient();
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "liberer_retenue_garantie_rpc",
      {
        p_chantier_id: chantierId,
        p_montant_ttc: montantNum,
        p_motif: motif,
        p_pv_reception_id: pvId,
        p_observations: typeof observations === "string" ? observations.trim() : null,
        p_document_ref: typeof document_ref === "string" ? document_ref.trim() : null,
      }
    );

    // 5) Gestion des erreurs métier levées par la RPC
    if (rpcError) {
      const msg = rpcError.message || "";
      console.warn("Erreur RPC liberer_retenue_garantie_rpc:", rpcError);

      if (msg.includes("superieur au montant restant")) {
        return NextResponse.json(
          {
            ok: false,
            error: "Solde insuffisant : le montant demandé dépasse le solde restant à libérer.",
            details: msg,
          },
          { status: 422 }
        );
      }

      if (msg.includes("impossible de liberer au motif de levee_reserves")) {
        return NextResponse.json(
          {
            ok: false,
            error: "Action impossible : les réserves du PV ne sont pas encore levées.",
            details: msg,
          },
          { status: 422 }
        );
      }

      if (msg.includes("pv de reception introuvable")) {
        return NextResponse.json(
          {
            ok: false,
            error: "Le PV de réception spécifié est introuvable ou n'appartient pas à ce chantier.",
            details: msg,
          },
          { status: 404 }
        );
      }

      if (msg.includes("compte de retenue de garantie introuvable")) {
        return NextResponse.json(
          {
            ok: false,
            error: "Aucun compte de retenue de garantie n'est ouvert pour ce chantier.",
            details: msg,
          },
          { status: 404 }
        );
      }

      if (msg.includes("contexte entreprise manquant")) {
        return NextResponse.json(
          { ok: false, error: "Session non autorisée ou contexte entreprise manquant." },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { ok: false, error: msg || "Erreur lors de la libération de la retenue." },
        { status: 400 }
      );
    }

    // 6) Succès : retour typé LibererRetenueResult
    return NextResponse.json(
      {
        ok: true,
        data: rpcData as unknown as LibererRetenueResult,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erreur interne POST /api/chantiers/[id]/retenue-garantie/liberer:", error);
    return NextResponse.json(
      { ok: false, error: "Erreur interne serveur." },
      { status: 500 }
    );
  }
}
