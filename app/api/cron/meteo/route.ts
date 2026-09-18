import { NextRequest } from "next/server";
import { POST } from "../../meteo/intemperies/route";

export const revalidate = 0;

export async function GET(request: NextRequest) {
  // Transmet la requête (et donc l'en-tête Authorization: Bearer CRON_SECRET
  // envoyé par Vercel Cron) au handler POST protégé.
  return POST(request);
}