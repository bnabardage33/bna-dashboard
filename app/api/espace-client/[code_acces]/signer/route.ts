// app/api/espace-client/[code_acces]/signer/route.ts
//
// Valide la signature d'un DEVIS par le client.
// SÉCURITÉ CRITIQUE : avant toute modification, on vérifie que le devis
// appartient bien au chantier associé au code_acces fourni dans l'URL.
// Sans cette vérification, n'importe qui connaissant un ID de devis
// pourrait le faire signer sans lien avec son propre code d'accès.
//
// ⚠️ Une FACTURE ne peut PAS être signée par ce portail :
//    - Une signature client ne concerne que les devis (statut -> "signe").
//    - Une facture ne passe à "payee" QUE par une action manuelle de
//      l'artisan (dashboard) ou un webhook de paiement sécurisé.
//      Aucun code d'accès ne doit pouvoir déclencher ce changement.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const STATUT_APRES_SIGNATURE = "signe";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code_acces: string }> }
) {
  const { code_acces } = await params;

  let body: { docId?: string; docKind?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const { docId, docKind } = body;

  if (!code_acces || !docId || !docKind) {
    return NextResponse.json({ error: "Paramètres manquants ou invalides" }, { status: 400 });
  }

  // Seul un devis peut être signé par le portail client. Le refus des
  // factures est sans appel : indépendamment de l'appartenance du document,
  // le statut "payee" ne peut jamais être atteint depuis cette route.
  if (docKind !== "devis") {
    return NextResponse.json(
      { error: "Seuls les devis peuvent être signés par le portail client. Une facture ne peut être passée à réglée que par votre artisan." },
      { status: 403 }
    );
  }

  // 1. Retrouver le chantier associé à ce code d'accès
  const { data: chantiers } = await supabaseAdmin
    .from("chantiers")
    .select("id, client_id")
    .eq("code_acces", code_acces)
    .limit(1);

  if (!chantiers || chantiers.length === 0) {
    return NextResponse.json({ error: "Code d'accès invalide" }, { status: 404 });
  }

  const chantier = chantiers[0];

  // 2. Vérifier que le devis appartient bien à ce chantier (ou à défaut, à ce client)
  const { data: document } = await supabaseAdmin
    .from("devis")
    .select("id, chantier_id, client_id")
    .eq("id", docId)
    .single();

  if (!document) {
    return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });
  }

  const appartientAuChantier = document.chantier_id === chantier.id;
  const appartientAuClient = chantier.client_id && document.client_id === chantier.client_id;

  if (!appartientAuChantier && !appartientAuClient) {
    // Le document ne correspond pas à ce code d'accès : refus strict
    return NextResponse.json({ error: "Document non autorisé pour ce code d'accès" }, { status: 403 });
  }

  // 3. Mise à jour du statut (uniquement maintenant que l'appartenance est confirmée)
  //    Le devis passe à "signe" — jamais à "accepte", jamais à "payee".
  const { error: erreurMaj } = await supabaseAdmin
    .from("devis")
    .update({ statut: STATUT_APRES_SIGNATURE })
    .eq("id", docId);

  if (erreurMaj) {
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }

  return NextResponse.json({ success: true, statut: STATUT_APRES_SIGNATURE });
}