// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OutlookProvider } from "@/lib/email/providers/outlook";
import { EmailService } from "@/lib/email/service";
import { genererBonCommandePdf } from "@/lib/email/documents/bonCommandePdf";
import type { IEmailProvider, EmailPayload } from "@/lib/email/types";

describe("Architecture Email Professionnelle - V1 Outlook", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("OutlookProvider", () => {
    it("déclare le nom de provider 'outlook'", () => {
      const provider = new OutlookProvider();
      expect(provider.name).toBe("outlook");
    });

    it("rapporte un statut non-configuré si les variables d'environnement manquent", async () => {
      delete process.env.EMAIL_OUTLOOK_USER;
      delete process.env.EMAIL_OUTLOOK_PASSWORD;

      const provider = new OutlookProvider();
      const status = await provider.getStatus();
      expect(status.isConfigured).toBe(false);
      expect(status.providerName).toBe("outlook");
      expect(status.details).toContain("absent");
    });

    it("rapporte un statut configuré quand EMAIL_OUTLOOK_USER et PASSWORD sont présents", async () => {
      process.env.EMAIL_OUTLOOK_USER = "artisan@outlook.com";
      process.env.EMAIL_OUTLOOK_PASSWORD = "secret_app_password";
      process.env.EMAIL_SENDER_NAME = "BNA Bardage Test";

      const provider = new OutlookProvider();
      const status = await provider.getStatus();
      expect(status.isConfigured).toBe(true);
      expect(status.senderEmail).toBe("artisan@outlook.com");
      expect(status.senderName).toBe("BNA Bardage Test");
    });

    it("refuse l'envoi et renvoie une erreur explicite si les identifiants manquent", async () => {
      delete process.env.EMAIL_OUTLOOK_USER;
      delete process.env.EMAIL_OUTLOOK_PASSWORD;

      const provider = new OutlookProvider();
      const payload: EmailPayload = {
        to: "fournisseur@test.com",
        subject: "Bon de commande",
        typeDocument: "bon_commande",
        entrepriseId: "00000000-0000-0000-0000-000000000001",
      };

      const result = await provider.sendMail(payload);
      expect(result.success).toBe(false);
      expect(result.provider).toBe("outlook");
      expect(result.error).toContain("EMAIL_OUTLOOK_USER");
    });

    it("valide l'adresse email destinataire (refuse une chaîne invalide sans @)", async () => {
      process.env.EMAIL_OUTLOOK_USER = "artisan@outlook.com";
      process.env.EMAIL_OUTLOOK_PASSWORD = "app_password_16char";

      const provider = new OutlookProvider();
      const payload: EmailPayload = {
        to: "adresse_invalide",
        subject: "Bon de commande",
        typeDocument: "bon_commande",
        entrepriseId: "00000000-0000-0000-0000-000000000001",
      };

      const result = await provider.sendMail(payload);
      expect(result.success).toBe(false);
      expect(result.error).toContain("invalide");
    });
  });

  describe("Générateur PDF Bon de Commande (pdf-lib)", () => {
    it("génère un document PDF binaire valide (en-tête %PDF-)", async () => {
      const pdfBytes = await genererBonCommandePdf({
        commande: {
          id: "c1234567-89ab-cdef-0123-456789abcdef",
          created_at: "2026-10-11T12:00:00Z",
          date_commande: "2026-10-11",
          date_livraison_prevue: "2026-10-20",
          designation: "Tasseaux 27x40 sapin traité classe 2",
          quantite: 150,
          unite: "ml",
          montant_ht: 380.5,
        },
        fournisseur: {
          nom: "Point P Bois",
          contact: "Marc Dupuis",
          telephone: "01 23 45 67 89",
          email: "marc.dupuis@pointp.fr",
          conditions_paiement: "30 jours fin de mois",
        },
        chantier: {
          nom: "Résidence Les Pins",
          adresse: "12 rue des Pins, 75000 Paris",
          clientNom: "M. Martin",
        },
        entreprise: {
          raison_sociale: "BNA Bardage",
          siret: "123 456 789 00012",
          telephone: "06 00 00 00 00",
          email: "contact@bna-bardage.fr",
          adresse: "10 Avenue du Bâtiment",
          code_postal: "75011",
          ville: "Paris",
          assurance: null,
          iban: null,
          bic: null,
          mentions_legales: null,
          logo_url: null,
        },
      });

      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(500);

      // En-tête PDF magique : %PDF-
      const header = Buffer.from(pdfBytes.slice(0, 5)).toString("utf-8");
      expect(header).toBe("%PDF-");
    });

    it("génère un PDF valide avec plusieurs lignes de commande et caractères spéciaux sans planter", async () => {
      const pdfBytes = await genererBonCommandePdf({
        commande: {
          id: "c2234567-89ab-cdef-0123-456789abcdef",
          designation: "Commande globale lot bardage",
          lignes: [
            { designation: "Panneaux Trespa Meteon 8mm Gris", quantite: 45, unite: "m²", montant_ht: 2500 },
            { designation: "Vis inox A2 laquées RAL 7016 — boîte de 500", quantite: 2, unite: "bte", montant_ht: 120 },
            { designation: "Équerres d'ossature 80x80", quantite: 200, unite: "u", montant_ht: 350 },
          ],
        },
        fournisseur: {
          nom: "Fournisseur Spécialisé",
        },
      });

      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      const header = Buffer.from(pdfBytes.slice(0, 5)).toString("utf-8");
      expect(header).toBe("%PDF-");
    });
  });

  describe("EmailService Orchestrator", () => {
    it("permet l'enregistrement et la résolution interchangeable de providers", () => {
      const service = new EmailService();

      const mockProvider: IEmailProvider = {
        name: "test-provider",
        async sendMail() {
          return { success: true, provider: "test-provider", messageId: "msg-123" };
        },
        async verifyConfiguration() {
          return true;
        },
        async getStatus() {
          return { isConfigured: true, providerName: "test-provider" };
        },
      };

      service.registerProvider(mockProvider);
      expect(service.getProvider("test-provider")).toBe(mockProvider);
      expect(service.getProvider("outlook")).toBeDefined();
    });

    it("lève une erreur claire si un provider inconnu est demandé", () => {
      const service = new EmailService();
      expect(() => service.getProvider("inconnu")).toThrowError('non configuré ou non reconnu');
    });

    it("historise le statut 'en_cours' puis met à jour vers 'envoye' avec messageId", async () => {
      const service = new EmailService();

      const mockProvider: IEmailProvider = {
        name: "mock-outlook",
        async sendMail() {
          return { success: true, provider: "mock-outlook", messageId: "OUTLOOK-MSG-999" };
        },
        async verifyConfiguration() {
          return true;
        },
        async getStatus() {
          return { isConfigured: true, providerName: "mock-outlook" };
        },
      };

      service.registerProvider(mockProvider);

      const insertedRows: unknown[] = [];
      const updatedRows: { id: string; data: unknown }[] = [];

      const mockSupabase = {
        from: (table: string) => {
          expect(table).toBe("emails_envoyes");
          return {
            insert: (data: unknown) => {
              insertedRows.push(data);
              return {
                select: () => ({
                  single: async () => ({
                    data: { id: "email-uuid-123" },
                    error: null,
                  }),
                }),
              };
            },
            update: (data: unknown) => ({
              eq: async (_col: string, val: string) => {
                updatedRows.push({ id: val, data });
                return { error: null };
              },
            }),
          };
        },
      };

      const result = await service.sendAndRecord(
        {
          to: "fournisseur@bna.fr",
          subject: "Bon de commande BC-1234",
          typeDocument: "bon_commande",
          documentId: "cmd-uuid-456",
          entrepriseId: "00000000-0000-0000-0000-000000000001",
          attachments: [
            {
              filename: "Bon_de_Commande.pdf",
              content: Buffer.from("%PDF-mock"),
            },
          ],
        },
        {
          providerName: "mock-outlook",
          supabaseClient: mockSupabase,
        }
      );

      expect(result.success).toBe(true);
      expect(result.emailRecordId).toBe("email-uuid-123");
      expect(result.messageId).toBe("OUTLOOK-MSG-999");

      // Vérification insertion statut 'en_cours'
      expect(insertedRows.length).toBe(1);
      const inserted = insertedRows[0] as { statut: string; type_document: string; has_attachment: boolean };
      expect(inserted.statut).toBe("en_cours");
      expect(inserted.type_document).toBe("bon_commande");
      expect(inserted.has_attachment).toBe(true);

      // Vérification mise à jour statut 'envoye'
      expect(updatedRows.length).toBe(1);
      const updated = updatedRows[0];
      expect(updated.id).toBe("email-uuid-123");
      const updatedData = updated.data as { statut: string; message_id_externe: string };
      expect(updatedData.statut).toBe("envoye");
      expect(updatedData.message_id_externe).toBe("OUTLOOK-MSG-999");
    });

    it("historise le statut 'erreur' avec erreur_detail en cas d'échec d'envoi", async () => {
      const service = new EmailService();

      const mockFailingProvider: IEmailProvider = {
        name: "mock-failing",
        async sendMail() {
          return {
            success: false,
            provider: "mock-failing",
            error: "Connexion SMTP refusée (535 Authentication failed)",
          };
        },
        async verifyConfiguration() {
          return false;
        },
        async getStatus() {
          return { isConfigured: false, providerName: "mock-failing" };
        },
      };

      service.registerProvider(mockFailingProvider);

      const updatedRows: { id: string; data: unknown }[] = [];

      const mockSupabase = {
        from: () => ({
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: { id: "email-uuid-fail" },
                error: null,
              }),
            }),
          }),
          update: (data: unknown) => ({
            eq: async (_col: string, val: string) => {
              updatedRows.push({ id: val, data });
              return { error: null };
            },
          }),
        }),
      };

      const result = await service.sendAndRecord(
        {
          to: "fournisseur@bna.fr",
          subject: "Bon de commande",
          typeDocument: "bon_commande",
          entrepriseId: "00000000-0000-0000-0000-000000000001",
        },
        {
          providerName: "mock-failing",
          supabaseClient: mockSupabase,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("535 Authentication failed");

      expect(updatedRows.length).toBe(1);
      const updatedData = updatedRows[0].data as { statut: string; erreur_detail: string };
      expect(updatedData.statut).toBe("erreur");
      expect(updatedData.erreur_detail).toContain("535 Authentication failed");
    });
  });
});
