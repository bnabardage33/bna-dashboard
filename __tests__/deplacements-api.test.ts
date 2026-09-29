import { describe, it, expect, vi, beforeEach } from "vitest";
import { getEntrepriseCouranteId, verifierChantier, lireTarifCommercial } from "../app/api/deplacements/utils";

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() }
  })
}));

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnValue({
  eq: mockEq,
  maybeSingle: () => mockMaybeSingle()
});

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: (...args: any[]) => mockSelect(...args),
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) }) }) }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn() }) })
    })
  }
}));

describe("Utils de l'API Déplacements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getEntrepriseCouranteId extrait correctement l'entreprise_id", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { app_metadata: { entreprise_id: "ent-123" } } } });
    const id = await getEntrepriseCouranteId();
    expect(id).toBe("ent-123");
  });

  it("verifierChantier vérifie l'appartenance", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "chantier-456" }, error: null });
    const res = await verifierChantier("chantier-456", "ent-123");
    expect(res).toBe(true);
    expect(mockEq).toHaveBeenCalledWith("id", "chantier-456");
    expect(mockEq).toHaveBeenCalledWith("entreprise_id", "ent-123");
  });

  it("lireTarifCommercial renvoie 1.00 par défaut si non configuré", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await lireTarifCommercial("ent-123");
    expect(res).toBe(1.00);
  });
  
  it("lireTarifCommercial renvoie la valeur configurée", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { valeur: 1.50 }, error: null });
    const res = await lireTarifCommercial("ent-123");
    expect(res).toBe(1.50);
  });
});

import { POST as LierPOST } from "../app/api/deplacements/[id]/lier/route";
import { DELETE as DeleteDeplacement } from "../app/api/deplacements/[id]/route";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifierSession } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  verifierSession: vi.fn()
}));

const mockRpc = vi.fn();
(supabaseAdmin as any).rpc = mockRpc;

describe("API Liaison au Devis (LOT 6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifierSession as any).mockResolvedValue({ authentifie: true });
    mockGetUser.mockResolvedValue({ data: { user: { app_metadata: { entreprise_id: "ent-123" } } } });
  });

  it("POST /lier - lier_deplacement_devis appelé avec succès", async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, devis_id: "dev-999" }, error: null });
    
    const req = new NextRequest("http://localhost/api/deplacements/dep-1/lier", {
      method: "POST",
      body: JSON.stringify({ devis_id: "dev-999" })
    });
    
    const res = await LierPOST(req, { params: { id: "dep-1" } });
    expect(res.status).toBe(200);
    
    const json = await res.json();
    expect(json).toEqual({ ok: true, devis_id: "dev-999" });
    expect(mockRpc).toHaveBeenCalledWith("lier_deplacement_devis", {
      p_deplacement_id: "dep-1",
      p_devis_id: "dev-999",
      p_entreprise_id: "ent-123"
    });
  });

  it("POST /lier - traduit HTTP_409_CONFLICT", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Erreur serveur: HTTP_409_CONFLICT" } });
    
    const req = new NextRequest("http://localhost/api/deplacements/dep-1/lier", {
      method: "POST",
      body: JSON.stringify({ devis_id: "dev-999" })
    });
    
    const res = await LierPOST(req, { params: { id: "dep-1" } });
    expect(res.status).toBe(409);
    
    const json = await res.json();
    expect(json.error).toMatch(/déjà lié/);
  });
});

describe("API Suppression Immutabilité (LOT 4 corrigé)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifierSession as any).mockResolvedValue({ authentifie: true });
    mockGetUser.mockResolvedValue({ data: { user: { app_metadata: { entreprise_id: "ent-123" } } } });
  });

  it("DELETE - 403 si devis_id est renseigné", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "dep-1", devis_id: "dev-999" }, error: null });
    
    const req = new NextRequest("http://localhost/api/deplacements/dep-1", { method: "DELETE" });
    const res = await DeleteDeplacement(req, { params: { id: "dep-1" } });
    
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/déjà lié/);
    
    // Le delete ne doit PAS avoir été appelé
    // Dans notre mock from() global:
    const deleteSpy = (supabaseAdmin as any).from().delete;
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
