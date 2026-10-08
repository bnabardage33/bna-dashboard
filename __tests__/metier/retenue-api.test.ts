import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks Supabase & Auth ───────────────────────────────────────────────────
const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockAdminFrom(...args),
  },
}));

const mockResoudreTenant = vi.fn();
vi.mock("@/lib/tenant", () => ({
  resoudreTenant: () => mockResoudreTenant(),
}));

// ── Handlers API testés ────────────────────────────────────────────────────
import { POST as CalculerFacturePOST } from "@/app/api/factures/calculer/route";
import { GET as FacturesGET, POST as FacturesPOST } from "@/app/api/factures/route";
import { GET as FactureDetailGET, PATCH as FacturePATCH, DELETE as FactureDELETE } from "@/app/api/factures/[id]/route";
import { GET as RetenueChantierGET } from "@/app/api/chantiers/[id]/retenue-garantie/route";
import { POST as LibererRetenuePOST } from "@/app/api/chantiers/[id]/retenue-garantie/liberer/route";

describe("PHASE 4 — Intégration API / Routes Retenue de Garantie V2.1", () => {
  const TENANT_ID = "11111111-1111-4111-a111-111111111111";
  const CHANTIER_ID = "22222222-2222-4222-a222-222222222222";
  const PV_ID = "33333333-3333-4333-a333-333333333333";
  const FACTURE_ID = "44444444-4444-4444-a444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", app_metadata: { entreprise_id: TENANT_ID } } },
      error: null,
    });
    mockResoudreTenant.mockResolvedValue({ ok: true, entrepriseId: TENANT_ID });
  });

  // =========================================================================
  // 1. POST /api/factures/calculer (Simulation financière & multi-TVA)
  // =========================================================================
  describe("1. POST /api/factures/calculer", () => {
    it("calcule fidèlement une facture multi-TVA avec retenue de 5 %", async () => {
      const body = {
        lignes: [
          { designation: "Pose carrelage", qte: 10, pu_ht: 50, tva_pct: 10 },
          { designation: "Fourniture matériel", qte: 1, pu_ht: 1000, tva_pct: 20 },
        ],
        retenue_garantie_pct: 5,
      };

      const req = new NextRequest("http://localhost/api/factures/calculer", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const res = await CalculerFacturePOST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.total_ht).toBe(1500); // 500 + 1000
      expect(json.data.total_tva).toBe(250); // 50 + 200
      expect(json.data.total_ttc).toBe(1750); // 550 + 1200
      expect(json.data.montant_retenue_ht).toBe(75); // 25 + 50
      expect(json.data.montant_retenue_ttc).toBe(87.5); // 27.50 + 60.00
      expect(json.data.net_a_payer_ttc).toBe(1662.5); // 1750 - 87.5
      expect(json.data.tranches).toHaveLength(2);
    });

    it("calcule une situation d'avancement au prorata si avancement_pct est fourni", async () => {
      const body = {
        lignes: [{ designation: "Gros œuvre", qte: 1, pu_ht: 10000, tva_pct: 20 }],
        retenue_garantie_pct: 5,
        avancement_pct: 50,
      };

      const req = new NextRequest("http://localhost/api/factures/calculer", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const res = await CalculerFacturePOST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.total_ht).toBe(5000);
      expect(json.data.total_ttc).toBe(6000);
      expect(json.data.montant_retenue_ttc).toBe(300);
      expect(json.data.net_a_payer_ttc).toBe(5700);
    });

    it("rejette avec HTTP 400 si retenue_garantie_pct > 5 % (plafond légal)", async () => {
      const body = {
        lignes: [{ qte: 1, pu_ht: 100 }],
        retenue_garantie_pct: 6.5,
      };

      const req = new NextRequest("http://localhost/api/factures/calculer", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const res = await CalculerFacturePOST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toMatch(/plafond légal de 5 %/);
    });

    it("rejette avec HTTP 400 si retenue_garantie_pct est négatif", async () => {
      const body = {
        lignes: [{ qte: 1, pu_ht: 100 }],
        retenue_garantie_pct: -1,
      };

      const req = new NextRequest("http://localhost/api/factures/calculer", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const res = await CalculerFacturePOST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/ne peut être négatif/);
    });

    it("rejette avec HTTP 400 si lignes n'est pas un tableau", async () => {
      const req = new NextRequest("http://localhost/api/factures/calculer", {
        method: "POST",
        body: JSON.stringify({ lignes: "invalide" }),
      });

      const res = await CalculerFacturePOST(req);
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 2. POST & GET /api/factures (Émission sécurisée et consultation)
  // =========================================================================
  describe("2. POST /api/factures — Émission sécurisée avec retenue", () => {
    it("refuse avec 401 si session absente", async () => {
      mockResoudreTenant.mockResolvedValue({
        ok: false,
        reponse: new Response(JSON.stringify({ error: "Session requise" }), { status: 401 }),
      });

      const req = new NextRequest("http://localhost/api/factures", {
        method: "POST",
        body: JSON.stringify({ numero: "FAC-001" }),
      });

      const res = await FacturesPOST(req);
      expect(res.status).toBe(401);
    });

    it("refuse avec 400 si champs obligatoires absents", async () => {
      const req = new NextRequest("http://localhost/api/factures", {
        method: "POST",
        body: JSON.stringify({ numero: "", client_id: "" }),
      });

      const res = await FacturesPOST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/numéro de facture est obligatoire/);
    });

    it("refuse avec 404 si le chantier n'appartient pas au tenant", async () => {
      mockAdminFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      const req = new NextRequest("http://localhost/api/factures", {
        method: "POST",
        body: JSON.stringify({
          numero: "FAC-001",
          client_id: "cli-1",
          chantier_id: "autre-chantier",
          lignes: [{ qte: 1, pu_ht: 100 }],
        }),
      });

      const res = await FacturesPOST(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toMatch(/Chantier introuvable/);
    });

    it("refuse avec 409 si le numéro existe déjà", async () => {
      // 1er appel adminFrom (chantier ok), 2e appel (facture existe déjà)
      mockAdminFrom
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: CHANTIER_ID, entreprise_id: TENANT_ID }, error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "fac-existante" }, error: null }),
        });

      const req = new NextRequest("http://localhost/api/factures", {
        method: "POST",
        body: JSON.stringify({
          numero: "FAC-DOUBLON",
          client_id: "cli-1",
          chantier_id: CHANTIER_ID,
          lignes: [{ qte: 1, pu_ht: 100 }],
        }),
      });

      const res = await FacturesPOST(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toMatch(/existe déjà/);
    });

    it("émet avec succès la facture et fige les colonnes financières et de retenue", async () => {
      mockAdminFrom
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: CHANTIER_ID, entreprise_id: TENANT_ID }, error: null }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        });

      const mockInsertResult = {
        id: FACTURE_ID,
        numero: "FAC-2026-001",
        entreprise_id: TENANT_ID,
        chantier_id: CHANTIER_ID,
        montant_retenue_ht: 50,
        montant_retenue_ttc: 60,
        net_a_payer_ttc: 1140,
        retenue_garantie_pct: 5,
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: mockInsertResult, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

      mockFrom.mockReturnValue({
        insert: mockInsert,
      });

      const req = new NextRequest("http://localhost/api/factures", {
        method: "POST",
        body: JSON.stringify({
          numero: "FAC-2026-001",
          client_id: "cli-1",
          chantier_id: CHANTIER_ID,
          retenue_garantie_pct: 5,
          tva_defaut_pct: 20,
          lignes: [{ designation: "Lot Maçonnerie", qte: 10, pu_ht: 100, tva_pct: 20 }],
        }),
      });

      const res = await FacturesPOST(req);
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.id).toBe(FACTURE_ID);

      // Vérification du payload injecté
      const insertArg = mockInsert.mock.calls[0][0];
      expect(insertArg.entreprise_id).toBe(TENANT_ID);
      expect(insertArg.retenue_garantie_pct).toBe(5);
      expect(insertArg.montant_retenue_ht).toBe(50);
      expect(insertArg.montant_retenue_ttc).toBe(60);
      expect(insertArg.net_a_payer_ttc).toBe(1140);
    });
  });

  // =========================================================================
  // 3. PATCH /api/factures/[id] — Invariant d'immutabilité financière
  // =========================================================================
  describe("3. PATCH /api/factures/[id] — Immutabilité financière", () => {
    it("interdit la modification rétroactive de montant_retenue_ttc ou net_a_payer_ttc", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: FACTURE_ID,
            entreprise_id: TENANT_ID,
            montant_retenue_ttc: 60,
            net_a_payer_ttc: 1140,
            statut: "emise",
          },
          error: null,
        }),
      });

      const req = new NextRequest(`http://localhost/api/factures/${FACTURE_ID}`, {
        method: "PATCH",
        body: JSON.stringify({
          montant_retenue_ttc: 0, // tentative illégale de falsifier la retenue
        }),
      });

      const res = await FacturePATCH(req, { params: Promise.resolve({ id: FACTURE_ID }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/champ financier 'montant_retenue_ttc' est immuable/);
    });

    it("autorise la mise à jour du statut vers 'annulee'", async () => {
      const mockUpdateSingle = vi.fn().mockResolvedValue({
        data: { id: FACTURE_ID, statut: "annulee" },
        error: null,
      });

      mockFrom
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: FACTURE_ID, entreprise_id: TENANT_ID, statut: "emise" },
            error: null,
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: mockUpdateSingle,
                }),
              }),
            }),
          }),
        });

      const req = new NextRequest(`http://localhost/api/factures/${FACTURE_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ statut: "annulee" }),
      });

      const res = await FacturePATCH(req, { params: Promise.resolve({ id: FACTURE_ID }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.statut).toBe("annulee");
    });
  });

  // =========================================================================
  // 4. GET /api/chantiers/[id]/retenue-garantie (Consultation d'état)
  // =========================================================================
  describe("4. GET /api/chantiers/[id]/retenue-garantie", () => {
    it("renvoie l'état complet du compte, les factures et l'éligibilité des PV", async () => {
      // Mock des 4 lectures séquentielles (chantier, compte, liberations, factures, pv_receptions)
      mockFrom
        // 1) chantier
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: CHANTIER_ID, nom: "Chantier Bâtiment A", entreprise_id: TENANT_ID },
            error: null,
          }),
        })
        // 2) chantier_retenues_garantie
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "crg-1",
              chantier_id: CHANTIER_ID,
              entreprise_id: TENANT_ID,
              montant_retenu_cumule_ht: 500,
              montant_retenu_cumule_ttc: 600,
              montant_libere_cumule_ttc: 0,
              montant_restant_a_liberer_ttc: 600,
              statut: "en_cours",
            },
            error: null,
          }),
        })
        // 3) retenues_liberations
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        // 4) factures
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [{ id: FACTURE_ID, numero: "FAC-1", montant_retenue_ttc: 600 }],
            error: null,
          }),
        })
        // 5) pv_receptions
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [{ id: PV_ID, numero: "PVR-001", statut: "reserves_levees" }],
            error: null,
          }),
        });

      const req = new NextRequest(`http://localhost/api/chantiers/${CHANTIER_ID}/retenue-garantie`);
      const res = await RetenueChantierGET(req, { params: Promise.resolve({ id: CHANTIER_ID }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.synthese.montant_retenu_cumule_ttc).toBe(600);
      expect(json.data.synthese.montant_restant_a_liberer_ttc).toBe(600);
      expect(json.data.synthese.peut_liberer_reserves).toBe(true);
      expect(json.data.synthese.pv_purges_count).toBe(1);
    });

    it("refuse avec 404 si le chantier n'appartient pas au tenant", async () => {
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      const req = new NextRequest(`http://localhost/api/chantiers/${CHANTIER_ID}/retenue-garantie`);
      const res = await RetenueChantierGET(req, { params: Promise.resolve({ id: CHANTIER_ID }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toMatch(/Chantier introuvable/);
    });
  });

  // =========================================================================
  // 5. POST /api/chantiers/[id]/retenue-garantie/liberer (Appel RPC)
  // =========================================================================
  describe("5. POST /api/chantiers/[id]/retenue-garantie/liberer", () => {
    it("refuse avec 400 si montant <= 0", async () => {
      const req = new NextRequest(`http://localhost/api/chantiers/${CHANTIER_ID}/retenue-garantie/liberer`, {
        method: "POST",
        body: JSON.stringify({ montant_ttc: 0, motif: "levee_reserves" }),
      });

      const res = await LibererRetenuePOST(req, { params: Promise.resolve({ id: CHANTIER_ID }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/strictement positif/);
    });

    it("refuse avec 400 si motif 'levee_reserves' sans pv_reception_id", async () => {
      const req = new NextRequest(`http://localhost/api/chantiers/${CHANTIER_ID}/retenue-garantie/liberer`, {
        method: "POST",
        body: JSON.stringify({
          montant_ttc: 300,
          motif: "levee_reserves",
          pv_reception_id: null,
        }),
      });

      const res = await LibererRetenuePOST(req, { params: Promise.resolve({ id: CHANTIER_ID }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/PV de réception avec réserves levées est obligatoire/);
    });

    it("traduit l'erreur RPC 'superieur au montant restant' en HTTP 422", async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "montant demande (1000 €) superieur au montant restant a liberer (600 €)" },
      });

      const req = new NextRequest(`http://localhost/api/chantiers/${CHANTIER_ID}/retenue-garantie/liberer`, {
        method: "POST",
        body: JSON.stringify({
          montant_ttc: 1000,
          motif: "levee_reserves",
          pv_reception_id: PV_ID,
        }),
      });

      const res = await LibererRetenuePOST(req, { params: Promise.resolve({ id: CHANTIER_ID }) });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toMatch(/Solde insuffisant/);
    });

    it("traduit l'erreur RPC 'impossible de liberer au motif de levee_reserves' en HTTP 422", async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "impossible de liberer au motif de levee_reserves : le pv est actuellement avec_reserves" },
      });

      const req = new NextRequest(`http://localhost/api/chantiers/${CHANTIER_ID}/retenue-garantie/liberer`, {
        method: "POST",
        body: JSON.stringify({
          montant_ttc: 300,
          motif: "levee_reserves",
          pv_reception_id: PV_ID,
        }),
      });

      const res = await LibererRetenuePOST(req, { params: Promise.resolve({ id: CHANTIER_ID }) });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toMatch(/réserves du PV ne sont pas encore levées/);
    });

    it("exécute avec succès la libération via la RPC transactionnelle", async () => {
      const mockResultRpc = {
        success: true,
        liberation_id: "lib-999",
        montant_libere_ttc: 600,
        montant_libere_ht: 500,
        nouveau_restant_ttc: 0,
        statut: "liberee_totalement",
      };

      mockRpc.mockResolvedValue({ data: mockResultRpc, error: null });

      const req = new NextRequest(`http://localhost/api/chantiers/${CHANTIER_ID}/retenue-garantie/liberer`, {
        method: "POST",
        body: JSON.stringify({
          montant_ttc: 600,
          motif: "levee_reserves",
          pv_reception_id: PV_ID,
          observations: "Levée totale suite à visite de fin de chantier",
        }),
      });

      const res = await LibererRetenuePOST(req, { params: Promise.resolve({ id: CHANTIER_ID }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.success).toBe(true);
      expect(json.data.nouveau_restant_ttc).toBe(0);
      expect(json.data.statut).toBe("liberee_totalement");

      // Vérification des arguments passés à la RPC (aucun paramètre tenant injecté, déduit du JWT)
      expect(mockRpc).toHaveBeenCalledWith("liberer_retenue_garantie_rpc", {
        p_chantier_id: CHANTIER_ID,
        p_montant_ttc: 600,
        p_motif: "levee_reserves",
        p_pv_reception_id: PV_ID,
        p_observations: "Levée totale suite à visite de fin de chantier",
        p_document_ref: null,
      });

      const rpcArgs = mockRpc.mock.calls[0][1];
      expect(rpcArgs).not.toHaveProperty("p_entreprise_id");
    });
  });
});
