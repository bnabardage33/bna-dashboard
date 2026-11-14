import type { NextRequest } from "next/server";
import {
  TYPE_XLSX,
  chargerDonneesExport,
  genererExcel,
  nomFichier,
  reponseFichier,
} from "@/lib/calepinage/export";

// POST /api/calepinage/export/excel  { zone_id }
// Génère à la volée le bordereau de débit (.xlsx) d'une zone. Auth + tenant :
// voir lib/calepinage/export.ts (chargerDonneesExport).

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // exceljs : API Node

export async function POST(request: NextRequest) {
  const charge = await chargerDonneesExport(request);
  if (!charge.ok) return charge.reponse;
  try {
    charge.data.inclureProfils = true;
    const octets = await genererExcel(charge.data);
    return reponseFichier(octets, TYPE_XLSX, nomFichier(charge.data.zone.nom, "xlsx"));
  } catch (e: unknown) {
    console.error("[calepinage/export/excel] génération :", e);
    return Response.json({ error: "Erreur serveur lors de la génération du fichier Excel." }, { status: 500 });
  }
}
