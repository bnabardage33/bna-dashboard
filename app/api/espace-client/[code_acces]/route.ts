// app/api/espace-client/[code_acces]/route.ts
//
// Récupère toutes les données de l'espace client de façon sécurisée.
// Utilise supabaseAdmin (clé service_role, jamais exposée au navigateur)
// pour aller chercher les données côté serveur, puis ne renvoie QUE
// ce qui concerne le chantier correspondant au code_acces fourni.
//
// Le navigateur du client ne voit jamais la clé Supabase générale
// ni les données d'autres clients.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code_acces: string }> }
) {
  const { code_acces } = await params;

  if (!code_acces) {
    return NextResponse.json({ error: "Code d'accès manquant" }, { status: 400 });
  }

  // 1. Paramètres entreprise (affichage logo, coordonnées)
  const { data: entreprise } = await supabaseAdmin
    .from("entreprise_settings")
    .select("*")
    .eq("id", 1)
    .single();

  // 2. Chantier correspondant au code d'accès
  const { data: chantiers, error: erreurChantier } = await supabaseAdmin
    .from("chantiers")
    .select("*, clients(*)")
    .eq("code_acces", code_acces)
    .limit(1);

  console.log("DEBUG code_acces reçu:", JSON.stringify(code_acces));
  console.log("DEBUG erreurChantier:", JSON.stringify(erreurChantier));
  console.log("DEBUG chantiers trouvés:", chantiers?.length);

  if (erreurChantier || !chantiers || chantiers.length === 0) {
    // Code invalide : on ne donne aucun indice, juste "introuvable"
    return NextResponse.json({ error: "Code d'accès invalide" }, { status: 404 });
  }

  const chantier = chantiers[0];

  // 3. Avancement le plus récent
  const { data: avancements } = await supabaseAdmin
    .from("avancements_chantier")
    .select("pourcentage")
    .eq("chantier_id", chantier.id)
    .order("date", { ascending: false })
    .limit(1);

  const avancement = avancements && avancements.length > 0 ? avancements[0].pourcentage : 45;

  // 4. Devis visibles (envoyés ou acceptés) — par chantier, fallback par client
  let devisList: any[] = [];
  const { data: devisParChantier } = await supabaseAdmin
    .from("devis")
    .select("*")
    .eq("chantier_id", chantier.id)
    .in("statut", ["envoye", "accepte"]);

  if (devisParChantier && devisParChantier.length > 0) {
    devisList = devisParChantier;
  } else if (chantier.client_id) {
    const { data: devisParClient } = await supabaseAdmin
      .from("devis")
      .select("*")
      .eq("client_id", chantier.client_id)
      .in("statut", ["envoye", "accepte"]);
    if (devisParClient) devisList = devisParClient;
  }

  // 5. Factures — par chantier, fallback par client
  let facturesList: any[] = [];
  const { data: facturesParChantier } = await supabaseAdmin
    .from("factures")
    .select("*")
    .eq("chantier_id", chantier.id)
    .in("statut", ["emise", "envoyee", "payee"]);

  if (facturesParChantier && facturesParChantier.length > 0) {
    facturesList = facturesParChantier;
  } else if (chantier.client_id) {
    const { data: facturesParClient } = await supabaseAdmin
      .from("factures")
      .select("*")
      .eq("client_id", chantier.client_id)
      .in("statut", ["emise", "envoyee", "payee"]);
    if (facturesParClient) facturesList = facturesParClient;
  }

  return NextResponse.json({
    entreprise,
    chantier,
    client: chantier.clients,
    avancement,
    devis: devisList,
    factures: facturesList,
  });
}
