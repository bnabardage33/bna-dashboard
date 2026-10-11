// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/commandes/[id]/email/route";

const mockResoudreTenant = vi.fn();
vi.mock("@/lib/tenant", () => ({
  resoudreTenant: () => mockResoudreTenant(),
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockCreateClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));

const mockSendAndRecord = vi.fn();
vi.mock("@/lib/email/service", () => ({
  emailService: {
    sendAndRecord: (...args: unknown[]) => mockSendAndRecord(...args),
  },
}));

vi.mock("@/lib/email/documents/bonCommandePdf", () => ({
  genererBonCommandePdf: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70, 45])),
}));

describe("Route API /api/commandes/[id]/email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/commandes/[id]/email", () => {
    it("échoue fermé si non authentifié (401)", async () => {
      mockResoudreTenant.mockResolvedValue({
        ok: false,
        reponse: new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 }),
      });

      const req = new NextRequest("http://localhost:3000/api/commandes/cmd-123/email");
      const res = await GET(req, { params: Promise.resolve({ id: "cmd-123" }) });

      expect(res.status).toBe(401);
    });

    it("renvoie l'historique des emails envoyés pour le tenant", async () => {
      mockResoudreTenant.mockResolvedValue({
        ok: true,
        entrepriseId: "00000000-0000-0000-0000-000000000001",
      });

      const mockEmails = [
        {
          id: "email-1",
          destinataire_email: "fournisseur@test.com",
          statut: "envoye",
          envoye_le: "2026-10-11T14:00:00Z",
        },
      ];

      mockCreateClient.mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockEmails, error: null }),
              }),
            }),
          }),
        }),
      });

      const req = new NextRequest("http://localhost:3000/api/commandes/cmd-123/email");
      const res = await GET(req, { params: Promise.resolve({ id: "cmd-123" }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data).toEqual(mockEmails);
    });
  });

  describe("POST /api/commandes/[id]/email", () => {
    it("échoue fermé si non authentifié (401)", async () => {
      mockResoudreTenant.mockResolvedValue({
        ok: false,
        reponse: new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 }),
      });

      const req = new NextRequest("http://localhost:3000/api/commandes/cmd-123/email", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await POST(req, { params: Promise.resolve({ id: "cmd-123" }) });

      expect(res.status).toBe(401);
    });

    it("renvoie 404 si la commande n'appartient pas au tenant", async () => {
      mockResoudreTenant.mockResolvedValue({
        ok: true,
        entrepriseId: "00000000-0000-0000-0000-000000000001",
      });

      mockCreateClient.mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      });

      const req = new NextRequest("http://localhost:3000/api/commandes/cmd-inexistante/email", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await POST(req, { params: Promise.resolve({ id: "cmd-inexistante" }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain("introuvable");
    });

    it("renvoie 400 si aucun email destinataire n'est fourni et le fournisseur n'en a pas", async () => {
      mockResoudreTenant.mockResolvedValue({
        ok: true,
        entrepriseId: "00000000-0000-0000-0000-000000000001",
      });

      const commandeSansEmail = {
        id: "c1234567-89ab-cdef-0123-456789abcdef",
        designation: "Matériaux",
        fournisseurs: {
          nom: "Fournisseur Sans Email",
          email: null,
        },
        chantiers: null,
      };

      mockCreateClient.mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: commandeSansEmail, error: null }),
              }),
            }),
          }),
        }),
      });

      const req = new NextRequest("http://localhost:3000/api/commandes/c123/email", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await POST(req, { params: Promise.resolve({ id: "c123" }) });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("manquante ou invalide");
    });

    it("génère le PDF, appelle emailService.sendAndRecord et met à jour le statut commande", async () => {
      mockResoudreTenant.mockResolvedValue({
        ok: true,
        entrepriseId: "00000000-0000-0000-0000-000000000001",
      });

      const commandeValide = {
        id: "c1234567-89ab-cdef-0123-456789abcdef",
        designation: "Tasseaux 27x40",
        quantite: 50,
        unite: "ml",
        montant_ht: 120,
        statut: "a_commander",
        date_commande: null,
        fournisseurs: {
          nom: "Point P",
          contact: "Jean",
          email: "pointp@test.com",
        },
        chantiers: {
          nom: "Chantier A",
          clients: { nom: "Client X" },
        },
      };

      const mockUpdateCommande = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      mockCreateClient.mockResolvedValue({
        from: (table: string) => {
          if (table === "commandes") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: commandeValide, error: null }),
                  }),
                }),
              }),
              update: mockUpdateCommande,
            };
          }
          if (table === "entreprises") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { raison_sociale: "BNA Bardage", email: "contact@bna.fr" },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      mockSendAndRecord.mockResolvedValue({
        success: true,
        provider: "outlook",
        emailRecordId: "rec-uuid-999",
        messageId: "MSG-OUTLOOK-SUCCESS",
      });

      const req = new NextRequest("http://localhost:3000/api/commandes/c123/email", {
        method: "POST",
        body: JSON.stringify({
          destinataire_email: "fournisseur@test.com",
          message_personnalise: "Livraison urgente merci",
        }),
      });

      const res = await POST(req, {
        params: Promise.resolve({ id: "c1234567-89ab-cdef-0123-456789abcdef" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.emailRecordId).toBe("rec-uuid-999");

      // Vérifie que sendAndRecord a été appelé avec les bons paramètres
      expect(mockSendAndRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "fournisseur@test.com",
          typeDocument: "bon_commande",
          documentReference: "BC-C1234567",
          attachments: expect.arrayContaining([
            expect.objectContaining({
              filename: "Bon_de_Commande_BC-C1234567.pdf",
              contentType: "application/pdf",
            }),
          ]),
        })
      );

      // Vérifie que la commande est passée en statut 'commandee'
      expect(mockUpdateCommande).toHaveBeenCalledWith(
        expect.objectContaining({
          statut: "commandee",
        })
      );
    });
  });
});
