// GET /api/chantiers/[id]/metre-complet
//
// Retourne le payload structuré destiné à la future IA Devis :
//   * chantier + configuration technique + client
//   * zones avec résultats techniques copiés du JSONB persisté
//   * totaux = agrégats déjà persistés sur chantiers
//   * statut de complétude + liste des éléments manquants
//
// L'API ne recalcule, n'invente et n'estime AUCUNE quantité.
// La construction du payload est déléguée à `servirPayloadMetreComplet`
// (source de vérité UNIQUE, également utilisée par POST /api/ia-devis).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resoudreTenant } from "@/lib/tenant";
import {
  servirPayloadMetreComplet,
  ChantierIntrouvableError,
} from "@/lib/servir-metre-complet";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;
  const { id } = await params;

  try {
    // ── Auth obligatoire ──────────────────────────────────────────────
    // ── Source de vérité partagée (mêmes données que l'IA Devis) ─────
    const payload = await servirPayloadMetreComplet(id, tenant.entrepriseId);

    return NextResponse.json({ ok: true, data: payload });
  } catch (error) {
    if (error instanceof ChantierIntrouvableError) {
      return NextResponse.json(
        { ok: false, error: "Chantier introuvable" },
        { status: 404 },
      );
    }
    console.error("Erreur API metre-complet:", error);
    return NextResponse.json(
      { ok: false, error: "Erreur interne" },
      { status: 500 },
    );
  }
}
