import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomInt } from "crypto";
import { resoudreTenant } from "@/lib/tenant";

// SÉCURITÉ TENANT :
// - `verifierSession()` ne fournissait AUCUN tenant (ni user, ni entreprise) :
//   cette route ne pouvait donc pas poser de prédicat `entreprise_id` et
//   écrasait `signature_phone` / `otp_code` de N'IMPORTE QUEL devis connu.
// - `resoudreTenant()` échoue fermé (401 sans session, 403 sans claim valide)
//   AVANT toute requête métier.
// - Cet UPDATE est le SEUL accès base de la route : `.select("id")` est donc
//   indispensable, sinon PostgREST ne renvoie aucun décompte et la route ne
//   peut pas distinguer « inexistant » ou « autre tenant » d'un succès.
// - Le 404 est indistinguable, par construction, d'un UUID inconnu : pas
//   d'oracle d'existence inter-tenant.

// Cooldown anti-inondation : on ne peut (re)demander un OTP pour un même
// devis qu'une fois par minute. Empêche de flinguer la limite SMS et protège
// le verrouillage anti-bruteforce de /verify-otp.
const COOLDOWN_MS = 60 * 1000;
const derniersEnvois = new Map<string, number>();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;
  const entrepriseId = tenant.entrepriseId;
  try {
    const { phone } = await req.json();
    const { id } = await params;

    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Numéro de téléphone invalide" }, { status: 400 });
    }

    // Cooldown par devis (module-level, suffisant en secours d'une base de données)
    const maintenant = Date.now();
    const dernierEnvoi = derniersEnvois.get(id);
    if (dernierEnvoi && maintenant - dernierEnvoi < COOLDOWN_MS) {
      const restant = Math.ceil((COOLDOWN_MS - (maintenant - dernierEnvoi)) / 1000);
      return NextResponse.json(
        { error: `Patientez encore ${restant} s avant de redemander un code.` },
        { status: 429 }
      );
    }

    // Générer OTP (6 chiffres)
    const otpCode = randomInt(100000, 1000000).toString();
    
    // Date d'expiration à +10 minutes
    const expiresAt = new Date(maintenant + 10 * 60 * 1000).toISOString();

    const { data: touchees, error } = await supabaseAdmin
      .from("devis")
      .update({
        otp_code: otpCode,
        otp_expires_at: expiresAt,
        signature_phone: phone,
      })
      .eq("id", id)
      .eq("entreprise_id", entrepriseId)
      .select("id");

    if (error) {
      throw error;
    }

    // 0 ligne ⇒ devis inexistant OU appartenant à un autre tenant. Réponse
    // identique dans les deux cas, et AUCUN cooldown consommé : aucun SMS
    // n'a été envoyé, il n'y a donc rien à limiter.
    if (!touchees || touchees.length === 0) {
      return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });
    }

    derniersEnvois.set(id, maintenant);

    // Simulation de l'appel SMS (Twilio / Vonage / etc.)
    console.log(`[SMS MOCK] => Dest: ${phone} | Msg: BNA : Votre code de signature pour l'avenant/devis est ${otpCode}`);

    return NextResponse.json({ success: true, message: "Code OTP envoyé" });
  } catch (error) {
    console.error("Erreur send-otp:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi du code" }, { status: 500 });
  }
}
