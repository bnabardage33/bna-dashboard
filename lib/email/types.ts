export interface EmailAttachment {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
}

export interface EmailPayload {
  to: string;
  toName?: string;
  cc?: string[];
  replyTo?: string;
  from?: {
    email: string;
    name: string;
  };
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: EmailAttachment[];
  typeDocument: "bon_commande" | "devis" | "rapport_intemperie" | "technique" | "autre";
  documentId?: string;
  documentReference?: string;
  entrepriseId: string;
  userId?: string;
}

export interface EmailSendResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

export interface EmailProviderStatus {
  isConfigured: boolean;
  providerName: string;
  senderEmail?: string;
  senderName?: string;
  details?: string;
}

export interface IEmailProvider {
  readonly name: string;
  sendMail(payload: EmailPayload): Promise<EmailSendResult>;
  verifyConfiguration(): Promise<boolean>;
  getStatus(): Promise<EmailProviderStatus>;
}
