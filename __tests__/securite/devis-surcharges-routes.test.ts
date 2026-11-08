// __tests__/securite/devis-surcharges-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ENT_A = "11111111-1111-4111-8111-111111111111";
const ENT_B = "22222222-2222-4222-8222-222222222222";
const CLIENT_A = "33333333-3333-4333-8333-333333333333";
const OUVRAGE_1 = "aaaa1111-1111-4111-8111-111111111111";

let tenantActif = ENT_A;

const surchargesBase: Record<string, Array<{ ouvrage_id: string; pu_ht: number | null; pu_revient: number | null }>> = {
  [ENT_A]: [
    { ouvrage_id: OUVRAGE_1, pu_ht: 65.0, pu_revient: 35.0 }, // Tarif personnalisé A
  ],
  [ENT_B]: [
    { ouvrage_id: OUVRAGE_1, pu_ht: 48.0, pu_revient: 26.0 }, // Tarif personnalisé B
  ],
};

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  requetes: [] as Array<{ table: string; eq: Array<[string, unknown]> }>,
  devisInsere: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const eqFiltres: Array<[string, unknown]> = [];
      const query: any = {
        select: (...args: any[]) => query,
        eq: (col: string, val: unknown) => {
          eqFiltres.push([col, val]);
          return query;
        },
        maybeSingle: async () => {
          mocks.requetes.push({ table, eq: [...eqFiltres] });
          if (table === "clients") {
            const entId = eqFiltres.find(([c]) => c === "entreprise_id")?.[1];
            if (entId === tenantActif) {
              return { data: { id: CLIENT_A, entreprise_id: tenantActif }, error: null };
            }
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        insert: (payload: any) => {
          mocks.devisInsere = payload;
          return {
            select: () => ({
              then: (resolve: any) => resolve({ data: [{ id: "nouveau-devis-id" }], error: null }),
            }),
          };
        },
        then: (resolve: any) => {
          mocks.requetes.push({ table, eq: [...eqFiltres] });
          if (table === "catalogue_ouvrages") {
            return resolve({
              data: [
                {
                  id: OUVRAGE_1,
                  designation: "Bardage Pin CL4",
                  description: "Essence locale",
                  unite: "m²",
                  pu_ht: 40.0, // Tarif commun de référence
                  pu_revient: 25.0,
                  type_cout: "matiere",
                },
              ],
              error: null,
            });
          }
          if (table === "catalogue_ouvrages_prix") {
            const entId = eqFiltres.find(([c]) => c === "entreprise_id")?.[1] as string;
            return resolve({
              data: surchargesBase[entId] ?? [],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        },
      };
      return query;
    },
  },
}));

vi.mock("@/lib/tenant", () => ({
  resoudreTenant: async () => ({ ok: true, entrepriseId: tenantActif }),
}));

import { POST as POSTDevis } from "@/app/api/devis/route";

describe("Intégration POST /api/devis — Isolation et Résolution des Surcharges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requetes = [];
    mocks.devisInsere = null;
  });

  it("enregistre le devis avec le tarif personnalisé du Tenant A", async () => {
    tenantActif = ENT_A;
    const req = new NextRequest("http://localhost/api/devis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        numero: "DEV-2026-001",
        client_id: CLIENT_A,
        lignes: [{ catalogue_id: OUVRAGE_1, qte: 10 }],
      }),
    });

    const res = await POSTDevis(req);
    expect(res.status).toBe(200);

    // Vérifie que catalogue_ouvrages_prix a été filtré sur ENT_A
    const querySurcharge = mocks.requetes.find((r) => r.table === "catalogue_ouvrages_prix");
    expect(querySurcharge).toBeTruthy();
    expect(querySurcharge?.eq).toContainEqual(["entreprise_id", ENT_A]);

    // Vérifie que le prix résolu correspond exactement à la surcharge de l'entreprise A (65 €)
    expect(mocks.devisInsere).toBeTruthy();
    const lignes = mocks.devisInsere?.lignes as any[];
    expect(lignes).toHaveLength(1);
    expect(lignes[0].pu_ht).toBe(65.0);
    expect(lignes[0].pu_revient).toBe(35.0);
    expect(mocks.devisInsere?.total_ht).toBe(650.0);
  });

  it("enregistre le devis avec le tarif personnalisé du Tenant B", async () => {
    tenantActif = ENT_B;
    const req = new NextRequest("http://localhost/api/devis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        numero: "DEV-2026-001",
        client_id: CLIENT_A,
        lignes: [{ catalogue_id: OUVRAGE_1, qte: 10 }],
      }),
    });

    const res = await POSTDevis(req);
    expect(res.status).toBe(200);

    // Vérifie le filtre pour le Tenant B
    const querySurcharge = mocks.requetes.find((r) => r.table === "catalogue_ouvrages_prix");
    expect(querySurcharge?.eq).toContainEqual(["entreprise_id", ENT_B]);

    // Vérifie que le tarif retenu est celui du Tenant B (48 €) et non A
    const lignes = mocks.devisInsere?.lignes as any[];
    expect(lignes[0].pu_ht).toBe(48.0);
    expect(lignes[0].pu_revient).toBe(26.0);
    expect(mocks.devisInsere?.total_ht).toBe(480.0);
  });

  it("retombe sur le tarif indicatif commun si aucune surcharge n'est définie", async () => {
    tenantActif = "99999999-9999-4999-8999-999999999999"; // Tenant sans surcharges
    const req = new NextRequest("http://localhost/api/devis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        numero: "DEV-2026-001",
        client_id: CLIENT_A,
        lignes: [{ catalogue_id: OUVRAGE_1, qte: 10 }],
      }),
    });

    const res = await POSTDevis(req);
    expect(res.status).toBe(200);

    // Tarif indicatif commun (40 €)
    const lignes = mocks.devisInsere?.lignes as any[];
    expect(lignes[0].pu_ht).toBe(40.0);
    expect(lignes[0].pu_revient).toBe(25.0);
    expect(mocks.devisInsere?.total_ht).toBe(400.0);
  });

  it("passe une ligne en À CHIFFRER si le prix est indéterminé sans écraser silencieusement", async () => {
    tenantActif = ENT_A;
    const req = new NextRequest("http://localhost/api/devis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        numero: "DEV-2026-004",
        client_id: CLIENT_A,
        lignes: [{ catalogue_id: "inconnu-id", qte: 10 }],
      }),
    });

    const res = await POSTDevis(req);
    expect(res.status).toBe(200);

    const lignes = mocks.devisInsere?.lignes as any[];
    expect(lignes[0].a_chiffrer).toBe(true);
    expect(lignes[0].pu_ht).toBeNull();
  });
});
