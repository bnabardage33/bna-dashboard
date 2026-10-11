import { NextRequest, NextResponse } from "next/server";
import { resoudreTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { emailService } from "@/lib/email/service";
import { genererBonCommandePdf } from "@/lib/email/documents/bonCommandePdf";
import type { Entreprise } from "@/types/entreprise";
import type { TablesUpdate } from "@/types/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface EmailRequestBody {
  destinataire_email?: string;
  destinataire_nom?: string;
  copies_cc?: string[];
  objet?: string;
  message_personnalise?: string;
}

/**
 * GET /api/commandes/[id]/email
 * Récupère l'historique des envois d'emails pour cette commande spécifique.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  const { id } = await params;

  try {
    const supabase = await createClient();
    const { data: emails, error } = await supabase
      .from("emails_envoyes")
      .select("*")
      .eq("entreprise_id", tenant.entrepriseId)
      .eq("document_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur GET /api/commandes/[id]/email :", error);
      return NextResponse.json(
        { ok: false, error: "Impossible de récupérer l'historique des emails." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: emails ?? [] }, { status: 200 });
  } catch (err) {
    console.error("Exception GET /api/commandes/[id]/email :", err);
    return NextResponse.json(
      { ok: false, error: "Erreur serveur interne." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/commandes/[id]/email
 * Génère le PDF officiel du bon de commande, l'envoie au fournisseur par email
 * (via Outlook personnel V1) et consigne l'historique dans `emails_envoyes`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  const { id } = await params;

  try {
    let body: EmailRequestBody = {};
    try {
      body = await req.json();
    } catch {
      // Body optionnel
    }

    const supabase = await createClient();

    // 1. Récupération de la commande, de son fournisseur et du chantier
    const { data: commande, error: commandeError } = await supabase
      .from("commandes")
      .select(`
        *,
        fournisseurs (
          id, nom, contact, telephone, email, conditions_paiement
        ),
        chantiers (
          id, nom, adresse_chantier, clients ( nom )
        )
      `)
      .eq("id", id)
      .eq("entreprise_id", tenant.entrepriseId)
      .maybeSingle();

    if (commandeError || !commande) {
      return NextResponse.json(
        { ok: false, error: "Commande introuvable ou non autorisée." },
        { status: 404 }
      );
    }

    // 2. Détermination de l'email destinataire
    const destinataireEmail =
      body.destinataire_email?.trim() || commande.fournisseurs?.email?.trim();

    if (!destinataireEmail || !destinataireEmail.includes("@")) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Adresse email destinataire manquante ou invalide. Veuillez renseigner l'email du fournisseur.",
        },
        { status: 400 }
      );
    }

    const destinataireNom =
      body.destinataire_nom?.trim() ||
      commande.fournisseurs?.contact ||
      commande.fournisseurs?.nom ||
      "Fournisseur";

    // 3. Récupération des informations de l'entreprise émettrice
    const { data: entrepriseData } = await supabase
      .from("entreprises")
      .select("*")
      .eq("id", tenant.entrepriseId)
      .maybeSingle();

    const entreprise: Entreprise = entrepriseData
      ? (entrepriseData as unknown as Entreprise)
      : {
          raison_sociale: "BNA Bardage",
          siret: null,
          telephone: null,
          email: null,
          adresse: null,
          code_postal: null,
          ville: null,
          assurance: null,
          iban: null,
          bic: null,
          mentions_legales: null,
          logo_url: "/logo-bna.png",
        };

    // 4. Génération du bon de commande PDF en mémoire
    const refCommande = `BC-${commande.id.slice(0, 8).toUpperCase()}`;
    const pdfBytes = await genererBonCommandePdf({
      commande: {
        id: commande.id,
        created_at: commande.created_at,
        date_commande: commande.date_commande,
        date_livraison_prevue: commande.date_livraison_prevue,
        designation: commande.designation,
        quantite: commande.quantite,
        unite: commande.unite,
        montant_ht: commande.montant_ht,
      },
      fournisseur: {
        nom: commande.fournisseurs?.nom || "Fournisseur",
        contact: commande.fournisseurs?.contact,
        telephone: commande.fournisseurs?.telephone,
        email: commande.fournisseurs?.email,
        conditions_paiement: commande.fournisseurs?.conditions_paiement,
      },
      chantier: {
        nom: commande.chantiers?.nom || "Chantier BNA",
        adresse: commande.chantiers?.adresse_chantier,
        clientNom: commande.chantiers?.clients?.nom,
      },
      entreprise,
    });

    const nomFichierPdf = `Bon_de_Commande_${refCommande}.pdf`;

    // 5. Construction de l'objet et du corps de l'email
    const objetEmail =
      body.objet?.trim() ||
      `Bon de commande ${refCommande} — ${entreprise.raison_sociale || "BNA"}`;

    const dateLivraisonTxt = commande.date_livraison_prevue
      ? new Date(commande.date_livraison_prevue).toLocaleDateString("fr-FR")
      : "Dès que possible";

    const notePersonnalisee = body.message_personnalise?.trim()
      ? `<p style="margin: 16px 0; padding: 12px; background: #f1f5f9; border-left: 4px solid #d92626; border-radius: 4px;">${body.message_personnalise.replace(/\n/g, "<br/>")}</p>`
      : "";

    const corpsHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; max-width: 620px; line-height: 1.6; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
  <div style="border-bottom: 3px solid #d92626; padding-bottom: 12px; margin-bottom: 16px;">
    <h2 style="margin: 0; color: #0f172a; font-size: 20px;">${entreprise.raison_sociale || "BNA Bardage"}</h2>
    <span style="font-size: 12px; color: #64748b;">Bon de commande officiel N° ${refCommande}</span>
  </div>

  <p>Bonjour ${destinataireNom},</p>
  <p>Veuillez trouver ci-joint notre bon de commande officiel <strong>${refCommande}</strong> pour le chantier <em>${commande.chantiers?.nom || "Chantier"}</em>.</p>

  ${notePersonnalisee}

  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin: 16px 0;">
    <p style="margin: 0 0 8px 0; font-weight: 600; color: #334155; font-size: 14px;">Récapitulatif :</p>
    <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px;">
      <li><strong>Désignation :</strong> ${commande.designation}</li>
      <li><strong>Quantité :</strong> ${commande.quantite ?? 1} ${commande.unite ?? "u"}</li>
      <li><strong>Date souhaitée de livraison :</strong> ${dateLivraisonTxt}</li>
    </ul>
  </div>

  <p style="font-size: 13px; color: #475569;">
    Merci de bien vouloir nous accuser réception de cette commande et nous confirmer la date de livraison.
  </p>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;" />

  <p style="margin: 0; font-size: 12px; color: #64748b;">
    <strong>${entreprise.raison_sociale || "BNA"}</strong><br/>
    ${entreprise.telephone ? `Tél : ${entreprise.telephone}<br/>` : ""}
    ${entreprise.email ? `Email : ${entreprise.email}<br/>` : ""}
  </p>
</div>
    `.trim();

    const corpsTexte = `
Bonjour ${destinataireNom},

Veuillez trouver ci-joint notre bon de commande officiel ${refCommande} pour le chantier ${commande.chantiers?.nom || "Chantier"}.

${body.message_personnalise ? `Note :\n${body.message_personnalise}\n\n` : ""}
Récapitulatif :
- Désignation : ${commande.designation}
- Quantité : ${commande.quantite ?? 1} ${commande.unite ?? "u"}
- Livraison souhaitée : ${dateLivraisonTxt}

Merci de bien vouloir nous accuser réception de cette commande et nous confirmer la date de livraison.

Cordialement,
${entreprise.raison_sociale || "BNA"}
${entreprise.telephone ? `Tél : ${entreprise.telephone}` : ""}
    `.trim();

    // 6. Envoi et enregistrement automatique dans emails_envoyes
    const envoiResultat = await emailService.sendAndRecord({
      to: destinataireEmail,
      toName: destinataireNom,
      cc: body.copies_cc,
      subject: objetEmail,
      bodyText: corpsTexte,
      bodyHtml: corpsHtml,
      attachments: [
        {
          filename: nomFichierPdf,
          content: Buffer.from(pdfBytes),
          contentType: "application/pdf",
        },
      ],
      typeDocument: "bon_commande",
      documentId: id,
      documentReference: refCommande,
      entrepriseId: tenant.entrepriseId,
    });

    if (!envoiResultat.success) {
      return NextResponse.json(
        {
          ok: false,
          error: envoiResultat.error || "Échec de l'envoi de l'email via Outlook.",
          emailRecordId: envoiResultat.emailRecordId,
        },
        { status: 502 }
      );
    }

    // 7. Mise à jour de la commande : passage en 'commandee' et date_commande
    const updatesCommande: TablesUpdate<"commandes"> = {
      statut: "commandee",
    };
    if (!commande.date_commande) {
      updatesCommande.date_commande = new Date().toISOString().slice(0, 10);
    }

    await supabase
      .from("commandes")
      .update(updatesCommande)
      .eq("id", id)
      .eq("entreprise_id", tenant.entrepriseId);

    return NextResponse.json(
      {
        ok: true,
        message: "Bon de commande envoyé avec succès au fournisseur.",
        emailRecordId: envoiResultat.emailRecordId,
        messageId: envoiResultat.messageId,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Erreur serveur POST /api/commandes/[id]/email :", err);
    return NextResponse.json(
      { ok: false, error: errorMsg || "Erreur serveur interne." },
      { status: 500 }
    );
  }
}
