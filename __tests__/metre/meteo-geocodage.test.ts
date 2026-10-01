// Tests du géocodage de la route météo /api/meteo/intemperies.
//
// `geocoderAdresse` est locale à la route et n'est pas exportée : on exerce
// donc la route entière via un faux Supabase et un faux fetch, et on observe
// la latitude retenue. C'est ce que voit l'utilisateur.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Valeurs réelles mesurées sur Nominatim pour « 8 lotissement Bellevue, 33920 ».
// Importance quasi identique (écart 2,4e-7), 40 km d'écart : c'est le cas qui
// faisait afficher la météo de Branne pour un chantier à Saint-Savin.
const BELLEVUE_BRANNE = {
  lat: "44.8267278",
  lon: "-0.1854268",
  importance: 0.053397347219043226,
  display_name: "Lotissement Bellevue, Branne, Libourne, Gironde, 33420, France",
  address: { postcode: "33420", city: "Branne", country: "France" },
};
const BELLEVUE_SAINT_SAVIN = {
  lat: "45.1370583",
  lon: "-0.4440939",
  importance: 0.053397109178301636,
  display_name:
    "Lotissement les Portes de Bellevue, Saint-Savin, Blaye, Gironde, 33920, France",
  address: { postcode: "33920", city: "Saint-Savin", country: "France" },
};

const ENTREPRISE = "11111111-1111-4111-8111-111111111111";
const originalFetch = global.fetch;

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  mockFetch = vi.fn();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/supabase/server");
  vi.doUnmock("@/lib/supabaseAdmin");
});

/**
 * Chaîne de `.eq()/.select()` à trous : la route enchaîne plusieurs filtres
 * puis attend le résultat. Chaque maillon doit donc être `thenable`, sinon
 * `await` renvoie l'objet lui-même et le test voit un chantier absent.
 */
function chaineTerminale(valeur: unknown): unknown {
  const noeud: Record<string, unknown> = {
    then: (r: (v: unknown) => void) => r(valeur),
  };
  for (const methode of ["eq", "in", "order", "gte", "lte"]) {
    noeud[methode] = () => noeud;
  }
  noeud.limit = () => noeud;
  noeud.maybeSingle = () => Promise.resolve(valeur);
  noeud.single = () => Promise.resolve(valeur);
  return noeud;
}

async function routeMeteo(adresseChantier: string): Promise<{
  lat: number | null;
  urlNominatim: string | null;
}> {
  const chantier = {
    id: "c-1",
    client_id: "cl-1",
    entreprise_id: ENTREPRISE,
    nom: "TEST_P1",
    adresse_chantier: adresseChantier,
    client_nom: "Client Test",
    moyen_acces: "echafaudage",
    materiau_structurel: "bois",
  };
  const client = {
    id: "cl-1",
    entreprise_id: ENTREPRISE,
    email: null,
    societe: null,
    nom: "Client Test",
  };

  const fauxSupabase = {
    auth: {
      getUser: async () => ({
        data: {
          user: { id: "u-1", app_metadata: { entreprise_id: ENTREPRISE } },
        },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table === "chantiers") {
        return { select: () => chaineTerminale({ data: [chantier], error: null }) };
      }
      if (table === "clients") {
        return { select: () => chaineTerminale({ data: [client], error: null }) };
      }
      return { select: () => chaineTerminale({ data: [], error: null }) };
    },
  };

  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => fauxSupabase,
  }));
  vi.doMock("@/lib/supabaseAdmin", () => ({
    supabaseAdmin: {
      from: () => ({ select: () => chaineTerminale({ data: [], error: null }) }),
    },
  }));

  mockFetch.mockImplementation((url: string) => {
    if (url.includes("nominatim")) {
      return Promise.resolve({
        ok: true,
        json: async () => [BELLEVUE_BRANNE, BELLEVUE_SAINT_SAVIN],
      });
    }
    // Open-Meteo : réponse minimale valide, la météo n'est pas l'objet du test.
    return Promise.resolve({
      ok: true,
      json: async () => ({
        daily: {
          time: ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"],
          precipitation_sum: [0, 0, 0, 0],
          wind_speed_10m_max: [0, 0, 0, 0],
          temperature_2m_min: [10, 10, 10, 10],
        },
      }),
    });
  });

  const { GET } = await import("@/app/api/meteo/intemperies/route");
  const res = await GET(new Request("http://localhost/api/meteo/intemperies") as never);
  const corps = (await res.json()) as { chantiers?: { lat: number }[] };

  const appel = mockFetch.mock.calls.find((c: unknown[]) =>
    String(c[0]).includes("nominatim")
  );

  return {
    lat: corps.chantiers?.[0]?.lat ?? null,
    urlNominatim: appel ? (appel[0] as string) : null,
  };
}

describe("geocodage de la route meteo", () => {
  it("retient l'homonyme dont le code postal correspond, malgre une importance plus faible", async () => {
    const { lat } = await routeMeteo("8 lotissement Bellevue, 33920");
    // Saint-Savin (45,137) et non Branne (44,827).
    expect(lat).toBeCloseTo(45.1370583, 4);
  });

  it("demande plusieurs candidats avec addressdetails pour pouvoir filtrer", async () => {
    const { urlNominatim } = await routeMeteo("8 lotissement Bellevue, 33920");
    expect(urlNominatim).not.toBeNull();
    // limit=1 rendait tout filtrage par code postal impossible.
    expect(urlNominatim).toContain("limit=5");
    expect(urlNominatim).toContain("addressdetails=1");
    expect(urlNominatim).toContain("countrycodes=fr");
  });

  it("conserve l'adresse saisie et n'ajoute que la contrainte de pays", async () => {
    const { urlNominatim } = await routeMeteo("12 rue des Lilas, 33000 Bordeaux");
    expect(decodeURIComponent(urlNominatim ?? "")).toContain(
      "12 rue des Lilas, 33000 Bordeaux, France"
    );
  });
});
