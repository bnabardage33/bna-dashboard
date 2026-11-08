import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  tenant: vi.fn(),
  appFrom: vi.fn(),
  requetes: [] as Array<{ table: string; eq: Array<[string, unknown]> }>,
  insertionFacture: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (...args: unknown[]) => mocks.adminFrom(...args) } }));
vi.mock("@/lib/tenant", () => ({ resoudreTenant: () => mocks.tenant() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (...args: unknown[]) => mocks.appFrom(...args) }) }));

import { POST } from "@/app/api/devis/route";
import { POST as POSTFacture } from "@/app/api/factures/route";

const ENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_A = "22222222-2222-4222-8222-222222222222";
const CLIENT_B = "33333333-3333-4333-8333-333333333333";
const CHANTIER_A = "44444444-4444-4444-8444-444444444444";
const CHANTIER_AUTRE = "55555555-5555-4555-8555-555555555555";
const DEVIS_A = "66666666-6666-4666-8666-666666666666";
const DEVIS_B = "77777777-7777-4777-8777-777777777777";

const clientA = { id: CLIENT_A, entreprise_id: ENT_A };
const clientB = { id: CLIENT_B, entreprise_id: "88888888-8888-4888-8888-888888888888" };
type QueryResult = { data: unknown; error: null };
type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  eq: (col: string, val: unknown) => QueryBuilder;
  maybeSingle: () => Promise<QueryResult>;
  insert: (payload: Record<string, unknown>) => QueryBuilder;
  single: () => Promise<QueryResult>;
  then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
};
let clientFixture = clientA;
let chantierFixture: Record<string, unknown> | null = { id: CHANTIER_A, entreprise_id: ENT_A, client_id: CLIENT_A, surface_m2: 20 };
let devisFixture: Record<string, unknown> | null = { id: DEVIS_A, entreprise_id: ENT_A, client_id: CLIENT_A, chantier_id: CHANTIER_A, retenue_garantie_pct: 0 };

function builder(table: string, source: "admin" | "app" = "admin") {
  const eq: Array<[string, unknown]> = [];
  const chain = {} as QueryBuilder;
  if (source === "admin") mocks.requetes.push({ table, eq });
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((col: string, val: unknown) => { eq.push([col, val]); return chain; });
  chain.maybeSingle = vi.fn(async (): Promise<QueryResult> => {
    const value = table === "clients" ? (clientFixture.id === eq.find(([col]) => col === "id")?.[1] && clientFixture.entreprise_id === eq.find(([col]) => col === "entreprise_id")?.[1] ? clientFixture : null)
      : table === "chantiers" ? (chantierFixture?.id === eq.find(([col]) => col === "id")?.[1] && chantierFixture?.entreprise_id === eq.find(([col]) => col === "entreprise_id")?.[1] ? chantierFixture : null)
      : table === "devis" ? (devisFixture?.id === eq.find(([col]) => col === "id")?.[1] && devisFixture?.entreprise_id === eq.find(([col]) => col === "entreprise_id")?.[1] ? devisFixture : null)
      : null;
    return { data: value, error: null };
  });
  chain.insert = vi.fn((payload: Record<string, unknown>) => { if (source === "app") mocks.insertionFacture = payload; return chain; });
  chain.single = vi.fn(async () => ({ data: { id: "facture-nouvelle" }, error: null }));
  chain.then = (resolve, reject) => Promise.resolve({ data: table === "catalogue_ouvrages" ? [] : [{ id: "devis-nouveau" }], error: null }).then(resolve, reject);
  return chain;
}

function request(path: string, data: Record<string, unknown>) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

function adminTable(table: string) { return builder(table); }

describe("POST /api/devis — appartenance client et cohérence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tenant.mockResolvedValue({ ok: true, entrepriseId: ENT_A });
    mocks.requetes.length = 0;
    mocks.insertionFacture = null;
    clientFixture = clientA;
    chantierFixture = { id: CHANTIER_A, entreprise_id: ENT_A, client_id: CLIENT_A, surface_m2: 20 };
    devisFixture = { id: DEVIS_A, entreprise_id: ENT_A, client_id: CLIENT_A, chantier_id: CHANTIER_A, retenue_garantie_pct: 0 };
    mocks.adminFrom.mockImplementation((table: string) => adminTable(table));
    mocks.appFrom.mockImplementation((table: string) => builder(table, "app"));
  });

  it("refuse le client d'une autre entreprise avant toute insertion", async () => {
    clientFixture = clientB;
    const response = await POST(request("/api/devis", { numero: "DEV-1", client_id: CLIENT_B }));
    expect(response.status).toBe(404);
    expect(mocks.requetes).toHaveLength(1);
    expect(mocks.requetes[0]).toEqual({ table: "clients", eq: [["id", CLIENT_B], ["entreprise_id", ENT_A]] });
  });

  it("refuse un chantier du tenant lié à un autre client", async () => {
    chantierFixture = { id: CHANTIER_A, entreprise_id: ENT_A, client_id: CLIENT_B };
    const response = await POST(request("/api/devis", { numero: "DEV-1", client_id: CLIENT_A, chantier_id: CHANTIER_A }));
    expect(response.status).toBe(400);
    expect(mocks.requetes.find((q) => q.table === "chantiers")?.eq).toEqual([["id", CHANTIER_A], ["entreprise_id", ENT_A]]);
  });

  it("conserve la création légitime pour client et chantier du même tenant", async () => {
    const response = await POST(request("/api/devis", { numero: "DEV-1", client_id: CLIENT_A, chantier_id: CHANTIER_A }));
    expect(response.status).toBe(200);
    expect(mocks.requetes.find((q) => q.table === "clients")?.eq).toEqual([["id", CLIENT_A], ["entreprise_id", ENT_A]]);
  });

  it("facture : client A, chantier A et devis A sont autorisés", async () => {
    const response = await POSTFacture(request("/api/factures", { numero: "FAC-1", client_id: CLIENT_A, chantier_id: CHANTIER_A, devis_id: DEVIS_A, lignes: [{ designation: "Pose", qte: 1, pu_ht: 100, tva_pct: 20 }] }));
    expect(response.status).toBe(201);
    expect(mocks.insertionFacture?.client_id).toBe(CLIENT_A);
    expect(mocks.requetes.filter((q) => ["clients", "chantiers", "devis"].includes(q.table)).map((q) => q.eq)).toEqual([
      [["id", CLIENT_A], ["entreprise_id", ENT_A]],
      [["id", CHANTIER_A], ["entreprise_id", ENT_A]],
      [["id", DEVIS_A], ["entreprise_id", ENT_A]],
    ]);
  });

  it("facture : client B avec chantier A est refusé", async () => {
    clientFixture = clientB;
    const response = await POSTFacture(request("/api/factures", { numero: "FAC-1", client_id: CLIENT_B, chantier_id: CHANTIER_A, lignes: [{ designation: "Pose", qte: 1, pu_ht: 100 }] }));
    expect(response.status).toBe(404);
    expect(mocks.insertionFacture).toBeNull();
    expect(mocks.requetes[0]).toEqual({ table: "clients", eq: [["id", CLIENT_B], ["entreprise_id", ENT_A]] });
  });

  it("facture sans chantier : continue de vérifier le client et refuse un devis B", async () => {
    devisFixture = { id: DEVIS_B, entreprise_id: "88888888-8888-4888-8888-888888888888", client_id: CLIENT_A, chantier_id: CHANTIER_A };
    const response = await POSTFacture(request("/api/factures", { numero: "FAC-1", client_id: CLIENT_A, devis_id: DEVIS_B, lignes: [{ designation: "Pose", qte: 1, pu_ht: 100 }] }));
    expect(response.status).toBe(404);
    expect(mocks.insertionFacture).toBeNull();
    expect(mocks.requetes.map((q) => q.table)).toEqual(["clients", "devis"]);
    expect(mocks.requetes[1].eq).toEqual([["id", DEVIS_B], ["entreprise_id", ENT_A]]);
  });

  it("facture : rejette un devis et un chantier de même tenant mais différents", async () => {
    devisFixture = { id: DEVIS_A, entreprise_id: ENT_A, client_id: CLIENT_A, chantier_id: CHANTIER_AUTRE };
    const response = await POSTFacture(request("/api/factures", { numero: "FAC-1", client_id: CLIENT_A, chantier_id: CHANTIER_A, devis_id: DEVIS_A, lignes: [{ designation: "Pose", qte: 1, pu_ht: 100 }] }));
    expect(response.status).toBe(400);
    expect(mocks.insertionFacture).toBeNull();
  });

  it("facture sans chantier : client A et devis A sont contrôlés et autorisés", async () => {
    devisFixture = { id: DEVIS_A, entreprise_id: ENT_A, client_id: CLIENT_A, chantier_id: null };
    const response = await POSTFacture(request("/api/factures", { numero: "FAC-1", client_id: CLIENT_A, devis_id: DEVIS_A, lignes: [{ designation: "Pose", qte: 1, pu_ht: 100 }] }));
    expect(response.status).toBe(201);
    expect(mocks.requetes.map((q) => q.table)).toEqual(["clients", "devis", "factures"]);
  });
});
