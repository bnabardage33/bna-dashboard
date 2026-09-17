import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { code } = await req.json();
    const { id } = await params;

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json({ error: "Code OTP invalide" }, { status: 400 });
    }

    // Récupérer le devis pour vérifier le code et l'expiration
    const { data: devis, error: fetchError } = await supabaseAdmin
      .from("devis")
      .select("otp_code, otp_expires_at, signature_phone")
      .eq("id", id)
      .single();

    if (fetchError || !devis) {
      return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });
    }

    if (!devis.otp_code || devis.otp_code !== code) {
      return NextResponse.json({ error: "Code incorrect" }, { status: 400 });
    }

    if (!devis.otp_expires_at || new Date() > new Date(devis.otp_expires_at)) {
      return NextResponse.json({ error: "Le code a expiré" }, { status: 400 });
    }

    // Valider la signature
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "IP_INCONNUE";
    const now = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("devis")
      .update({
        statut: "signe",
        signature_date: now,
        signature_ip: ip,
        // On efface le code pour éviter une réutilisation
        otp_code: null,
        otp_expires_at: null,
      })
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true, message: "Document signé avec succès" });
  } catch (error) {
    console.error("Erreur verify-otp:", error);
    return NextResponse.json({ error: "Erreur lors de la vérification du code" }, { status: 500 });
  }
}
