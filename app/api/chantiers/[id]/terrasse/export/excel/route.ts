// Route d'export Excel pour le quantitatif Terrasse
// POST /api/chantiers/[id]/terrasse/export/excel

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import { calculerTerrasse } from "@/lib/terrasse/calculs";
import { genererExcelTerrasse } from "@/lib/terrasse/exportExcel";
import type { ChantierTerrasseConfig } from "@/lib/terrasse/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TYPE_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

  let config: ChantierTerrasseConfig | null = null;
  try {
    const body = await request.json();
    if (body && body.longueur_m) {
      config = body as ChantierTerrasseConfig;
    }
  } catch {
    // Pas de JSON fourni, on lit depuis la DB
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
    const excelBytes = await genererExcelTerrasse({
      terrasse: config,
      resultat,
      chantierNom: nomChantier,
      clientNom: (chantier.clients as unknown as { nom: string })?.nom,
    });

    const nomFichier = `quantitatif-terrasse-${nomChantier.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`;

    return new Response(Buffer.from(excelBytes), {
      status: 200,
      headers: {
        "Content-Type": TYPE_XLSX,
        "Content-Disposition": `attachment; filename="${nomFichier}"`,
      },
    });
  } catch (err: unknown) {
    console.error("[terrasse/export/excel] Erreur génération :", err);
    return NextResponse.json(
      { error: "Erreur serveur lors de la génération de l'Excel terrasse" },
      { status: 500 }
    );
  }
}
