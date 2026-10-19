// __tests__/metre/meteo-vigilance-officielle.test.ts
//
// Non-régression de la SÉPARATION vigilance officielle / risque technique dans
// le générateur de rapports d'intempéries.
//
// Défaut corrigé : le niveau enregistré dans `rapports_intemperies.
// vigilance_officielle` était la plus forte des deux notions (`plusForte`), donc
// une vigilance Météo-France VERTE accompagnée d'un dépassement mesuré sur le
// chantier était stockée comme « vigilance orange ». Les deux niveaux doivent
// rester distincts, et l'absence de vigilance officielle doit s'écrire
// « indisponible » — jamais un « vert » inventé.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const ENTREPRISE = "11111111-1111-4111-8111-111111111111";

  const etat: {
    chantier: Record<string, unknown>;
    insertRapport: Record<string, unknown> | null;
  } = {
    chantier: {
      id: "22222222-2222-4222-8222-222222222222",
      entreprise_id: ENTREPRISE,
      nom: "Chantier Test",
      adresse_chantier: "1 Rue Test, 33000 Bordeaux",
      materiau_structurel: "metal",
      moyen_acces: "echafaudage",
      zone_vent: null,
      statut: "en_cours",
    },
    insertRapport: null,
  };

  function creerChaine(table: string) {
    const chaine: Record<string, unknown> = {};

    const resultatSelect =
      table === "chantiers"
        ? { data: [etat.chantier], error: null }
        : { data: null, error: null };

    const resultatInsert = {
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        entreprise_id: etat.chantier.entreprise_id,
        chantier_id: etat.chantier.id,
      },
      error: null,
    };

    const retour = () => chaine;
    for (const m of ["select", "eq", "neq", "gte", "lt", "order", "limit", "update"]) {
      chaine[m] = retour;
    }
    chaine.insert = (donnees: Record<string, unknown>) => {
      etat.insertRapport = donnees;
      return chaine;
    };
    chaine.maybeSingle = async () => resultatSelect;
    chaine.single = async () => resultatInsert;
    // Rend la chaîne « thenable » : le route handler fait `await query` sur la
    // sélection des chantiers, sans `.single()` / `.maybeSingle()`.
    chaine.then = (resolve: (v: unknown) => unknown) => resolve(resultatSelect);
    return chaine;
  }

  return { ENTREPRISE, etat, creerChaine };
});

vi.mock("@/lib/auth", () => ({
  verifierSession: async () => ({ authentifie: true }),
}));

vi.mock("@/lib/meteoLocalisation", () => ({
  resoudreLocalisationMeteo: async () => ({
    ok: true,
    data: {
      lat: 44.8,
      lon: -0.5,
      libelle: "Bordeaux, 33000",
      codePostal: "33000",
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { app_metadata: { entreprise_id: h.ENTREPRISE } } },
        error: null,
      }),
    },
    from: (table: string) => h.creerChaine(table),
  }),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    rpc: async () => ({ data: "RI-2026-0001", error: null }),
  },
}));

// ─── Météo simulée ────────────────────────────────────────────────────────────

// 36 °C avec un matériau « metal » (temp_maxi 35 °C) → risque technique ORANGE.
// Les rafales restent sous les seuils, et la pluie est nulle : le SEUL signal
// est thermique, ce qui isole bien le risque technique.
const VC_CHAUD = {
  days: [
    {
      datetime: "2026-01-02",
      tempmax: 36,
      tempmin: 20,
      temp: 36,
      windspeed: 10,
      windgust: 20,
      precip: 0,
      hours: [
        { datetime: "12:00", temp: 36, windspeed: 10, windgust: 20, precip: 0 },
        { datetime: "13:00", temp: 30, windspeed: 8, windgust: 15, precip: 0 },
      ],
    },
  ],
  currentConditions: { temp: 36 },
};

const VIGILANCE_VERTE = {
  departement: "33",
  couleurMax: "vert",
  phenomenes: [],
  misAJourLe: "2026-01-02T08:00:00Z",
};

let vigilanceReponse: { status: number; body: unknown };

function installerFetch() {
  vi.stubGlobal("fetch", async (entree: unknown) => {
    const url = String(entree);
    if (url.includes("/api/meteo-vigilance")) {
      return {
        ok: vigilanceReponse.status < 400,
        status: vigilanceReponse.status,
        json: async () => vigilanceReponse.body,
        text: async () => JSON.stringify(vigilanceReponse.body),
      };
    }
    if (url.includes("visualcrossing.com")) {
      return {
        ok: true,
        status: 200,
        json: async () => VC_CHAUD,
        text: async () => JSON.stringify(VC_CHAUD),
      };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
  });
}

async function genererUnRapport() {
  const { POST } = await import("@/app/api/rapports-intemperies/generer/route");
  const res = await POST(
    new Request("http://localhost/api/rapports-intemperies/generer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }) as never,
  );
  return { res, json: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  process.env.VISUALCROSSING_API_KEY = "cle-de-test";
  h.etat.insertRapport = null;
  vigilanceReponse = { status: 200, body: VIGILANCE_VERTE };
  installerFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("générateur d'intempéries — vigilance officielle ≠ risque technique", () => {
  it("vigilance verte + risque technique orange : les DEUX sont conservés séparément", async () => {
    const { res, json } = await genererUnRapport();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    // Ce qui est ÉCRIT en base :
    expect(h.etat.insertRapport).not.toBeNull();
    // La vigilance officielle reste VERTE — elle n'est pas « promue » orange par
    // le risque technique.
    expect(h.etat.insertRapport?.vigilance_officielle).toBe("vert");
    // Le risque technique, lui, est bien ORANGE et conservé à part.
    expect(h.etat.insertRapport?.risque_technique_niveau).toBe("orange");

    // Ce qui est renvoyé à l'écran :
    const resultats = json.resultats as Array<Record<string, unknown>>;
    expect(resultats[0]?.vigilance).toBe("vert");
  });

  it("vigilance officielle INDISPONIBLE : état explicite, jamais un « vert » inventé", async () => {
    vigilanceReponse = { status: 503, body: { error: "panne" } };

    const { res, json } = await genererUnRapport();

    // La génération n'est PAS interrompue : seul l'état de vigilance change.
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    expect(h.etat.insertRapport?.vigilance_officielle).toBe("indisponible");
    // Le risque technique est toujours mesuré et conservé.
    expect(h.etat.insertRapport?.risque_technique_niveau).toBe("orange");
    // Le motif signale l'indisponibilité au lieu de la masquer.
    expect(String(h.etat.insertRapport?.motif)).toContain("indisponible");

    const resultats = json.resultats as Array<Record<string, unknown>>;
    expect(resultats[0]?.vigilance).toBe("indisponible");
  });

  it("vigilance officielle ORANGE conservée telle quelle (même sans dépassement)", async () => {
    vigilanceReponse = {
      status: 200,
      body: {
        departement: "33",
        couleurMax: "orange",
        phenomenes: [{ id: 3, nom: "orages", couleur: "orange" }],
        misAJourLe: null,
      },
    };

    const { json } = await genererUnRapport();
    expect(h.etat.insertRapport?.vigilance_officielle).toBe("orange");
    expect((json.resultats as Array<Record<string, unknown>>)[0]?.vigilance).toBe(
      "orange",
    );
  });
});
