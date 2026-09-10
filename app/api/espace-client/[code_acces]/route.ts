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

// Force dynamic — never cache this route on Vercel/Next.js
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Lignes renvoyées telles quelles au client (type opaque volontaire :
// ces données ne sont jamais lues structurellement côté serveur).
type LignePassePartout = Record<string, unknown>;

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

  if (erreurChantier || !chantiers || chantiers.length === 0) {
    // Code invalide : on ne donne aucun indice, juste "introuvable"
    return NextResponse.json({ error: "Code d'accès invalide" }, { status: 404 });
  }

  const chantier = chantiers[0];

  // On récupère toutes les entrées d'avancement pour ce chantier sans ORDER BY SQL
  // (pour éviter tout bug lié aux colonnes de tri absentes ou mal indexées)
  const { data: avancements, error: avError } = await supabaseAdmin
    .from("avancements_chantier")
    .select("id, pourcentage, date, created_at, details")
    .eq("chantier_id", chantier.id);

  let avancement = 0;
  let avancementDetails = null;

  if (avError) {
    console.error("Erreur lecture avancements_chantier :", avError);
  } else if (avancements && avancements.length > 0) {
    // Tri robuste en Javascript (par created_at ou par date)
    const sorted = [...avancements].sort((a, b) => {
      const timeA = new Date(a.created_at || a.date || 0).getTime();
      const timeB = new Date(b.created_at || b.date || 0).getTime();
      // Si les dates sont identiques (ex: pas de time), on utilise l'ID en string locale compare (fallback)
      if (timeA === timeB) {
        return String(b.id).localeCompare(String(a.id));
      }
      return timeB - timeA; // Descending
    });
    
    // Récupérer le pourcentage de la toute dernière entrée
    const latest = sorted[0];
    avancement = latest.pourcentage != null ? Number(latest.pourcentage) : 0;
    avancementDetails = latest.details;
  }

  // 4. Devis visibles (envoyés ou acceptés) — par chantier, fallback par client
  let devisList: LignePassePartout[] = [];
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
  let facturesList: LignePassePartout[] = [];
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

  // 6. Rapports hebdomadaires — STRICTEMENT envoyés au client.
  //    Un brouillon ne doit JAMAIS sortir de cette route : filtre SQL
  //    statut = 'envoye' ET re-filtrage défensif avant envoi.
  const { data: rapportsClient } = await supabaseAdmin
    .from("rapports_client")
    .select("id, statut, semaine_label, date_debut, contenu")
    .eq("chantier_id", chantier.id)
    .eq("statut", "envoye")
    .order("date_debut", { ascending: false });

  const rapports = (rapportsClient ?? [])
    .filter((r) => r.statut === "envoye")
    .map(({ id, semaine_label, date_debut, contenu }) => ({
      id,
      semaine_label,
      date_debut,
      contenu,
    }));

  // 7. Intempéries (justificatifs auto) — visibles côté client
  const { data: intemperiesBruts } = await supabaseAdmin
    .from("rapports_intemperies")
    .select("id, numero, motif, jour_arrete, cree_le, pluie_cumul, rafales_max, ampleur_impact, vigilance_officielle")
    .eq("chantier_id", chantier.id)
    .order("cree_le", { ascending: false });

  const intemperies = (intemperiesBruts ?? []).map((r) => ({
    id: r.id,
    numero: r.numero,
    motif: r.motif,
    jour_arrete: r.jour_arrete,
    cree_le: r.cree_le,
    pluie_cumul: r.pluie_cumul,
    rafales_max: r.rafales_max,
    ampleur_impact: r.ampleur_impact,
    vigilance_officielle: r.vigilance_officielle,
  }));

  return NextResponse.json({
    entreprise,
    chantier,
    client: chantier.clients,
    avancement,
    avancementDetails,
    devis: devisList,
    factures: facturesList,
    rapports,
    intemperies,
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    }
  });
}
