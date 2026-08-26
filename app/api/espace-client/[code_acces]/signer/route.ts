// app/api/espace-client/[code_acces]/signer/route.ts
//
// Valide la signature d'un devis ou d'une facture.
// SÉCURITÉ CRITIQUE : avant toute modification, on vérifie que le
// document (devis/facture) appartient bien au chantier associé au
// code_acces fourni dans l'URL. Sans cette vérification, n'importe
// qui connaissant un ID de document pourrait le faire passer à
// "accepté"/"payé" sans lien avec son propre code d'accès.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code_acces: string }> }
) {
  const { code_acces } = await params;

  let body: { docId?: string; docKind?: "devis" | "facture" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const { docId, docKind } = body;

  if (!code_acces || !docId || !docKind || !["devis", "facture"].includes(docKind)) {
    return NextResponse.json({ error: "Paramètres manquants ou invalides" }, { status: 400 });
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
  const table = docKind === "devis" ? "devis" : "factures";

  // 2. Vérifier que le document appartient bien à ce chantier (ou à défaut, à ce client)
  const { data: document } = await supabaseAdmin
    .from(table)
    .select("id, chantier_id, client_id")
    .eq("id", docId)
    .single();

  if (!document) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  const appartientAuChantier = document.chantier_id === chantier.id;
  const appartientAuClient = chantier.client_id && document.client_id === chantier.client_id;

  if (!appartientAuChantier && !appartientAuClient) {
    // Le document ne correspond pas à ce code d'accès : refus strict
    return NextResponse.json({ error: "Document non autorisé pour ce code d'accès" }, { status: 403 });
  }

  // 3. Mise à jour du statut (uniquement maintenant que l'appartenance est confirmée)
  const nouveauStatut = docKind === "devis" ? "accepte" : "payee";

  const { error: erreurMaj } = await supabaseAdmin
    .from(table)
    .update({ statut: nouveauStatut })
    .eq("id", docId);

  if (erreurMaj) {
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
