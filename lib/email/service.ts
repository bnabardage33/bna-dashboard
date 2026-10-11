import { OutlookProvider } from "./providers/outlook";
import type {
  IEmailProvider,
  EmailPayload,
  EmailSendResult,
} from "./types";
import type { TablesInsert, TablesUpdate } from "@/types/supabase";

async function getDbClient(injectedClient?: unknown) {
  if (injectedClient) return injectedClient;
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  return supabaseAdmin;
}

export class EmailService {
  private providers: Map<string, IEmailProvider> = new Map();

  constructor() {
    this.registerProvider(new OutlookProvider());
  }

  public registerProvider(provider: IEmailProvider) {
    this.providers.set(provider.name, provider);
  }

  public getProvider(name = "outlook"): IEmailProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider email "${name}" non configuré ou non reconnu.`);
    }
    return provider;
  }

  /**
   * Envoie un email via le provider spécifié et historise la transaction
   * dans la table multi-tenant `emails_envoyes`.
   */
  public async sendAndRecord(
    payload: EmailPayload,
    options?: {
      providerName?: string;
      // Client Supabase optionnel pour injection (ex: tests ou RLS spécifique)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabaseClient?: any;
    }
  ): Promise<EmailSendResult & { emailRecordId?: string }> {
    const providerName = options?.providerName || "outlook";
    const provider = this.getProvider(providerName);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: any = await getDbClient(options?.supabaseClient);

    const hasAttachment = Boolean(payload.attachments && payload.attachments.length > 0);
    const firstAttachment = payload.attachments?.[0];
    const totalSize = payload.attachments?.reduce((sum, att) => {
      const len = att.content
        ? (att.content as Buffer).byteLength || (att.content as unknown as { length?: number }).length || 0
        : 0;
      return sum + len;
    }, 0);

    let emailRecordId: string | undefined;

    // 1. Initialiser la trace avec statut 'en_cours'
    try {
      const recordToInsert: TablesInsert<"emails_envoyes"> = {
        entreprise_id: payload.entrepriseId,
        type_document: payload.typeDocument,
        document_id: payload.documentId || null,
        document_reference: payload.documentReference || null,
        destinataire_email: payload.to,
        destinataire_nom: payload.toName || null,
        copies_cc: payload.cc || null,
        expediteur_email: payload.from?.email || process.env.EMAIL_OUTLOOK_USER || "inconnu@outlook.com",
        expediteur_nom: payload.from?.name || process.env.EMAIL_SENDER_NAME || "BNA Bardage",
        objet: payload.subject,
        corps_resume: payload.bodyText ? payload.bodyText.slice(0, 500) : null,
        has_attachment: hasAttachment,
        nom_piece_jointe: firstAttachment ? firstAttachment.filename : null,
        taille_piece_jointe_octets: totalSize ?? null,
        provider: provider.name,
        statut: "en_cours",
        envoye_par_user_id: payload.userId || null,
      };

      const { data: inserted, error: insertError } = await db
        .from("emails_envoyes")
        .insert(recordToInsert)
        .select("id")
        .single();

      if (!insertError && inserted) {
        emailRecordId = inserted.id;
      } else if (insertError) {
        console.warn("Avertissement: Impossible d'initialiser emails_envoyes:", insertError.message);
      }
    } catch (err) {
      console.warn("Exception lors de l'initialisation de emails_envoyes:", err);
    }

    // 2. Envoi effectif de l'email
    const sendResult = await provider.sendMail(payload);

    // 3. Mise à jour du statut final ('envoye' ou 'erreur')
    if (emailRecordId) {
      try {
        const updateData: TablesUpdate<"emails_envoyes"> = {
          statut: sendResult.success ? "envoye" : "erreur",
          message_id_externe: sendResult.messageId || null,
          erreur_detail: sendResult.error || null,
          envoye_le: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        await db
          .from("emails_envoyes")
          .update(updateData)
          .eq("id", emailRecordId);
      } catch (err) {
        console.error("Échec de mise à jour du statut dans emails_envoyes:", err);
      }
    }

    return {
      ...sendResult,
      emailRecordId,
    };
  }
}

export const emailService = new EmailService();
