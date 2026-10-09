// Route d'export PDF pour le sous-onglet Terrasse
// POST /api/chantiers/[id]/terrasse/export/pdf

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import { calculerTerrasse } from "@/lib/terrasse/calculs";
import { genererPdfTerrasse } from "@/lib/terrasse/exportPdf";
import type { ChantierTerrasseConfig } from "@/lib/terrasse/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  const tenantRes = await resoudreTenant();
  if (!tenantRes.ok) return tenantRes.reponse;
  const { entrepriseId } = tenantRes;

  const { id: chantierId } = await params;
  const supabase = await createClient();

  const { data: chantier, error: errChantier } = await supabase
    .from("chantiers")
    .select("id, nom, clients(nom)")
    .eq("id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .single();

  if (errChantier || !chantier) {
    return NextResponse.json({ error: "Chantier introuvable ou non autorisé" }, { status: 404 });
  }

  // Permet de passer la config en body (pour exporter même sans sauvegarde préalable)
  let config: ChantierTerrasseConfig | null = null;
  try {
    const body = await request.json();
    if (body && body.longueur_m) {
      config = body as ChantierTerrasseConfig;
    }
  } catch {
    // pas de body JSON valide, on lit la DB
  }

  if (!config) {
    const { data: terrasseData } = await supabase
      .from("chantier_terrasses")
      .select("*")
      .eq("chantier_id", chantierId)
      .eq("entreprise_id", entrepriseId)
      .maybeSingle();

    if (terrasseData) {
      config = terrasseData as unknown as ChantierTerrasseConfig;
    }
  }

  if (!config) {
    return NextResponse.json(
      { error: "Aucune terrasse configurée pour ce chantier" },
      { status: 404 }
    );
  }

  try {
    const nomChantier = chantier.nom || "Chantier";
    const resultat = calculerTerrasse(config);
    const pdfBytes = await genererPdfTerrasse({
      terrasse: config,
      resultat,
      chantierNom: nomChantier,
      clientNom: (chantier.clients as unknown as { nom: string })?.nom,
    });

    const nomFichier = `terrasse-dtu51.4-${nomChantier.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomFichier}"`,
      },
    });
  } catch (err: unknown) {
    console.error("[terrasse/export/pdf] Erreur génération :", err);
    return NextResponse.json(
      { error: "Erreur serveur lors de la génération du PDF terrasse" },
      { status: 500 }
    );
  }
}
