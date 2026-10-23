// Tests du géocodage de la route météo /api/meteo/intemperies.
//
// La route ne géocode plus elle-même : elle délègue à
// `lib/meteoLocalisation.ts` (code postal exact, refus de l'ambiguïté). On
// exerce donc la route entière via un faux Supabase et un faux fetch, et on
// observe le lieu que voit l'utilisateur.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Deux homonymes dont l'importance est quasi identique (écart 2,4e-7). Seul le
// code postal les départage : c'est exactement ce que le correctif doit faire.
// Le second candidat porte le code postal saisi (33920) ; le premier, plus
// « important » aux yeux de Nominatim, porte un AUTRE code postal et doit être
// écarté. Aucune des deux entrées ne doit être le point retenu par défaut.
const CANDIDAT_MAUVAIS_CP = {
  lat: "44.8267278",
  lon: "-0.1854268",
  importance: 0.053397347219043226,
  display_name: "Hameau des Tilleuls, Commune-Fantome, 44100, France",
  address: { postcode: "44100", city: "Commune-Fantome", country: "France" },
};
const CANDIDAT_BON_CP = {
  lat: "45.1370583",
  lon: "-0.4440939",
  importance: 0.053397109178301636,
  display_name: "Hameau des Tilleuls, Saint-Savin, Blaye, Gironde, 33920, France",
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

type ChantierMeteoReponse = {
  lat: number;
  lng: number;
  geocoded: boolean;
  erreurLocalisation: string | null;
  jours: Array<{ intemperie: boolean; raisons: string[] }>;
};

async function routeMeteo(
  adresseChantier: string,
  candidats: unknown[] = [CANDIDAT_MAUVAIS_CP, CANDIDAT_BON_CP],
): Promise<{ chantier: ChantierMeteoReponse | null; urls: string[] }> {
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

  const urls: string[] = [];
  mockFetch.mockImplementation((url: string) => {
    urls.push(url);
    if (url.includes("nominatim")) {
      return Promise.resolve({ ok: true, json: async () => candidats });
    }
    // Open-Meteo : réponse minimale valide, la météo n'est pas l'objet du test.
    return Promise.resolve({
      ok: true,
      json: async () => ({
        daily: {
          time: [
            "2026-10-01",
            "2026-10-02",
            "2026-10-03",
            "2026-10-04",
          ],
          precipitation_sum: [0, 0, 0, 0],
          wind_speed_10m_max: [0, 0, 0, 0],
          temperature_2m_min: [10, 10, 10, 10],
        },
      }),
    });
  });

  const { GET } = await import("@/app/api/meteo/intemperies/route");
  const res = await GET(new Request("http://localhost/api/meteo/intemperies") as never);
  const json = (await res.json()) as { chantiers: ChantierMeteoReponse[] };

  return { chantier: json.chantiers?.[0] ?? null, urls };
}

describe("geocodage de la route meteo", () => {
  it("retient l'homonyme dont le code postal correspond, malgre une importance plus faible", async () => {
    const { chantier } = await routeMeteo("8 hameau des Tilleuls, 33920");
    expect(chantier?.geocoded).toBe(true);
    // Le second candidat (code postal 33920) et non le premier, plus important.
    expect(chantier?.lat).toBeCloseTo(45.1370583, 4);
  });

  it("demande plusieurs candidats avec addressdetails pour pouvoir filtrer", async () => {
    const { urls } = await routeMeteo("8 hameau des Tilleuls, 33920");
    const urlNominatim = urls.find((u) => u.includes("nominatim")) ?? null;
    expect(urlNominatim).not.toBeNull();
    // limit=1 rendait tout filtrage par code postal impossible.
    expect(urlNominatim).toContain("limit=5");
    expect(urlNominatim).toContain("addressdetails=1");
    expect(urlNominatim).toContain("countrycodes=fr");
  });

  it("conserve l'adresse saisie et n'ajoute que la contrainte de pays", async () => {
    const { urls } = await routeMeteo("12 rue des Lilas, 33000 Bordeaux");
    const urlNominatim = urls.find((u) => u.includes("nominatim")) ?? "";
    // L'adresse est transmise TELLE QUELLE : le pays est contraint par
    // `countrycodes=fr`, pas par un « , France » ajouté à la requête.
    expect(new URL(urlNominatim).searchParams.get("q")).toBe(
      "12 rue des Lilas, 33000 Bordeaux"
    );
    expect(urlNominatim).toContain("countrycodes=fr");
  });

  it("ne choisit AUCUN lieu quand aucun candidat ne porte le code postal saisi", async () => {
    // Tous les candidats sont hors code postal : plus de « premier résultat »
    // silencieux, on refuse.
    const { chantier } = await routeMeteo("8 hameau des Tilleuls, 33920", [
      CANDIDAT_MAUVAIS_CP,
    ]);
    expect(chantier?.geocoded).toBe(false);
    expect(chantier?.lat).toBe(0);
    expect(chantier?.erreurLocalisation).toContain("33920");
    // Aucune météo inventée, et surtout aucune intempérie déclarée à tort.
    expect(chantier?.jours[0].intemperie).toBe(false);
  });

  it("ne choisit AUCUN lieu quand plusieurs candidats partagent le code postal", async () => {
    const AUTRE_COMMUNE_MEME_CP = {
      ...CANDIDAT_BON_CP,
      lat: "45.2000000",
      lon: "-0.5000000",
      display_name: "Hameau des Tilleuls, Commune-Voisine, Gironde, 33920, France",
      address: { postcode: "33920", city: "Commune-Voisine", country: "France" },
    };
    const { chantier } = await routeMeteo("8 hameau des Tilleuls, 33920", [
      CANDIDAT_BON_CP,
      AUTRE_COMMUNE_MEME_CP,
    ]);
    expect(chantier?.geocoded).toBe(false);
    expect(chantier?.erreurLocalisation).toContain("ambigu");
  });
});
