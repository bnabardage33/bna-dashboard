import nodemailer, { type SendMailOptions } from "nodemailer";
import type {
  IEmailProvider,
  EmailPayload,
  EmailSendResult,
  EmailProviderStatus,
} from "../types";

export class OutlookProvider implements IEmailProvider {
  public readonly name = "outlook";

  private getTransporter() {
    const user = process.env.EMAIL_OUTLOOK_USER;
    const pass = process.env.EMAIL_OUTLOOK_PASSWORD;

    if (!user || !pass) {
      throw new Error(
        "Identifiants Outlook manquants : définissez EMAIL_OUTLOOK_USER et EMAIL_OUTLOOK_PASSWORD."
      );
    }

    const host = process.env.EMAIL_OUTLOOK_HOST || "smtp-mail.outlook.com";
    const port = Number(process.env.EMAIL_OUTLOOK_PORT) || 587;

    return nodemailer.createTransport({
      host,
      port,
      secure: false, // STARTTLS sur le port 587
      auth: {
        user,
        pass,
      },
      tls: {
        ciphers: "SSLv3",
        rejectUnauthorized: process.env.NODE_ENV === "production",
      },
    });
  }

  async verifyConfiguration(): Promise<boolean> {
    const user = process.env.EMAIL_OUTLOOK_USER;
    const pass = process.env.EMAIL_OUTLOOK_PASSWORD;

    if (!user || !pass) {
      return false;
    }

    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return true;
    } catch (err) {
      console.warn("Vérification configuration Outlook échouée :", err);
      return false;
    }
  }

  async getStatus(): Promise<EmailProviderStatus> {
    const user = process.env.EMAIL_OUTLOOK_USER;
    const pass = process.env.EMAIL_OUTLOOK_PASSWORD;
    const isConfigured = Boolean(user && pass);

    return {
      isConfigured,
      providerName: this.name,
      senderEmail: user || undefined,
      senderName: process.env.EMAIL_SENDER_NAME || "BNA Bardage",
      details: isConfigured
        ? `Outlook SMTP configuré (${user})`
        : "EMAIL_OUTLOOK_USER ou EMAIL_OUTLOOK_PASSWORD absent",
    };
  }

  async sendMail(payload: EmailPayload): Promise<EmailSendResult> {
    try {
      const user = process.env.EMAIL_OUTLOOK_USER;
      const pass = process.env.EMAIL_OUTLOOK_PASSWORD;

      if (!user || !pass) {
        return {
          success: false,
          provider: this.name,
          error:
            "Configuration Outlook manquante : EMAIL_OUTLOOK_USER et EMAIL_OUTLOOK_PASSWORD requis.",
        };
      }

      if (!payload.to || !payload.to.includes("@")) {
        return {
          success: false,
          provider: this.name,
          error: `Adresse email destinataire invalide : "${payload.to}"`,
        };
      }

      const transporter = this.getTransporter();

      const fromAddress = user;
      const fromName =
        payload.from?.name || process.env.EMAIL_SENDER_NAME || "BNA Bardage";
      const fromHeader = `"${fromName.replace(/"/g, "")}" <${fromAddress}>`;

      const toHeader = payload.toName
        ? `"${payload.toName.replace(/"/g, "")}" <${payload.to.trim()}>`
        : payload.to.trim();

      const mailOptions: SendMailOptions = {
        from: fromHeader,
        to: toHeader,
        cc: payload.cc && payload.cc.length > 0 ? payload.cc : undefined,
        replyTo: payload.replyTo || fromAddress,
        subject: payload.subject,
        text: payload.bodyText,
        html: payload.bodyHtml,
        attachments: payload.attachments?.map((att) => ({
          filename: att.filename,
          content: Buffer.isBuffer(att.content)
            ? att.content
            : Buffer.from(att.content),
          contentType: att.contentType,
        })),
      };

      const info = await transporter.sendMail(mailOptions);

      return {
        success: true,
        provider: this.name,
        messageId: info.messageId,
      };
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : String(err);
      console.error("Erreur OutlookProvider.sendMail :", errorMsg);
      return {
        success: false,
        provider: this.name,
        error: errorMsg,
      };
    }
  }
}
