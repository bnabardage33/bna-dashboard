import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resoudreTenant } from "@/lib/tenant";

// SÉCURITÉ TENANT :
// - `verifierSession()` ne fournissait aucun tenant : la lecture ne portait que
//   `.eq("id", id)`. Un utilisateur authentifié pouvait donc signer le devis
//   d'une AUTRE entreprise s'il en connaissait l'UUID.
// - `resoudreTenant()` échoue fermé avant toute requête métier.
// - Les DEUX accès (lecture puis écriture) portent le prédicat `entreprise_id` :
//   la lecture est le verrou, l'écriture est la défense en profondeur.
// - Le 404 « Devis introuvable » est le même pour un UUID inexistant : pas
//   d'oracle d'existence inter-tenant.

// SÉCURITÉ OTP :
// - La vérification se fait EXCLUSIVEMENT côté serveur : on compare le code
//   soumis dans le body avec celui stocké en base. L'OTP n'apparaît jamais
//   dans une requête de lecture (GET) de l'espace client.
// - Verrouillage anti-bruteforce : après MAX_ESSAIS échecs, le devis est
//   temporairement verrouillé (par IP), même si le code est correct.
// - Une fois validé, le code est détruit en base (otp_code = null) :
//   il ne peut pas être réutilisé.

const MAX_ESSAIS = 5;
const FENETRE_VERROU_MS = 10 * 60 * 1000;

// Compteur en mémoire (module-level) : { [devisId:ip]: { nb, verrouilleJusqua } }
// Note : sur une plateforme serverless multi-instances, cette barrière est un
// premier rempart ; le lock définitif (par base de données) reste recommandé.
const tentatives = new Map<string, { nb: number; verrouilleJusqua: number }>();

function cleFinale(id: string, ip: string) {
  return `${id}:${ip}`;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;
  const entrepriseId = tenant.entrepriseId;
  try {
    const { code } = await req.json();
    const { id } = await params;

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "IP_INCONNUE";

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json({ error: "Code OTP invalide" }, { status: 400 });
    }

    const maintenant = Date.now();
    const cle = cleFinale(id, ip);
    const etat = tentatives.get(cle);

    // Verrou temporaire actif ? On refuse sans même consulter la base.
    if (etat && etat.verrouilleJusqua > maintenant) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }

    // Récupérer le devis pour vérifier le code et l'expiration (côté serveur uniquement)
    const { data: devis, error: fetchError } = await supabaseAdmin
      .from("devis")
      .select("otp_code, otp_expires_at, signature_phone")
      .eq("id", id)
      .eq("entreprise_id", entrepriseId)
      .single();

    if (fetchError || !devis) {
      return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });
    }

    const codeValide =
      devis.otp_code !== null &&
      typeof devis.otp_code === "string" &&
      devis.otp_code === code;

    const expire = !devis.otp_expires_at || new Date() > new Date(devis.otp_expires_at);

    if (!codeValide || expire) {
      const nb = (etat?.nb ?? 0) + 1;
      tentatives.set(cle, {
        nb,
        verrouilleJusqua: nb >= MAX_ESSAIS ? maintenant + FENETRE_VERROU_MS : 0,
      });
      const message = expire ? "Le code a expiré" : "Code incorrect";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Succès : on nettoie le compteur de tentatives
    tentatives.delete(cle);

    // Valider la signature
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
      .eq("id", id)
      .eq("entreprise_id", entrepriseId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true, message: "Document signé avec succès" });
  } catch (error) {
    console.error("Erreur verify-otp:", error);
    return NextResponse.json({ error: "Erreur lors de la vérification du code" }, { status: 500 });
  }
}