import type { NextRequest } from "next/server";
import {
  TYPE_PDF,
  chargerDonneesExport,
  genererPdf,
  nomFichier,
  reponseFichier,
} from "@/lib/calepinage/export";

// POST /api/calepinage/export/pdf  { zone_id }
// Génère à la volée le bordereau de débit (PDF A4) d'une zone, avec mini-plan PNG.
// Auth + tenant : voir lib/calepinage/export.ts (chargerDonneesExport).

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // pdf-lib + sharp (binaire natif) : runtime Node obligatoire

export async function POST(request: NextRequest) {
  const charge = await chargerDonneesExport(request);
  if (!charge.ok) return charge.reponse;
  try {
    charge.data.inclureProfils = true;
    const octets = await genererPdf(charge.data);
    return reponseFichier(octets, TYPE_PDF, nomFichier(charge.data.zone.nom, "pdf"));
  } catch (e: unknown) {
    console.error("[calepinage/export/pdf] génération :", e);
    return Response.json({ error: "Erreur serveur lors de la génération du PDF." }, { status: 500 });
  }
}
