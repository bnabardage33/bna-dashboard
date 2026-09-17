import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomInt } from "crypto";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { phone } = await req.json();
    const { id } = await params;

    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Numéro de téléphone invalide" }, { status: 400 });
    }

    // Générer OTP (6 chiffres)
    const otpCode = randomInt(100000, 1000000).toString();
    
    // Date d'expiration à +10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin
      .from("devis")
      .update({
        otp_code: otpCode,
        otp_expires_at: expiresAt,
        signature_phone: phone,
      })
      .eq("id", id);

    if (error) {
      throw error;
    }

    // Simulation de l'appel SMS (Twilio / Vonage / etc.)
    console.log(`[SMS MOCK] => Dest: ${phone} | Msg: BNA : Votre code de signature pour l'avenant/devis est ${otpCode}`);

    return NextResponse.json({ success: true, message: "Code OTP envoyé" });
  } catch (error) {
    console.error("Erreur send-otp:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi du code" }, { status: 500 });
  }
}
