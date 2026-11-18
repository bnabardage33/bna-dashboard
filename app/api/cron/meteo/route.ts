import { NextRequest } from "next/server";
import { POST } from "../../rapports-intemperies/generer/route";

export const revalidate = 0;

export async function GET(request: NextRequest) {
  // Transmet la requête (et donc l'en-tête Authorization: Bearer CRON_SECRET
  // envoyé par Vercel Cron) au moteur unifié de génération des rapports.
  return POST(request);
}