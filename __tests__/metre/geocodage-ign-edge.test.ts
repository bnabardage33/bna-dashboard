// __tests__/metre/geocodage-ign-edge.test.ts
//
// Tests du géocodeur officiel IGN Géoplateforme (API de géocodage / BAN)
// pour l'Edge Function Supabase `generer-rapports-intemperies`.
// ZÉRO appel réseau réel : tous les appels fetch sont interceptés.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock de la dépendance HTTPS avant tout import du module Edge Function
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({}) }),
    }),
  }),
}));

// Définition de Deno pour l'import dans l'environnement Node.js/Vitest
if (typeof (globalThis as any).Deno === "undefined") {
  (globalThis as any).Deno = {
    env: {
      get: (key: string) => {
        if (key === "SUPABASE_URL") return "https://example.supabase.co";
        if (key === "SUPABASE_SERVICE_ROLE_KEY") return "service-key";
        if (key === "VISUALCROSSING_API_KEY") return "vc-key";
        if (key === "METEOFRANCE_APPLICATION_ID") return "mf-id";
        return "";
      },
    },
    serve: () => {},
  };
} else {
  (globalThis as any).Deno.serve = (globalThis as any).Deno.serve || (() => {});
}

const EDGE_FUNCTION_PATH =
  "../../supabase/functions/generer-rapports-intemperies/index";

async function chargerGeocoder(): Promise<{
  geocoderAdresse: (adresse: string) => Promise<{ lat: number; lon: number }>;
  calculerDistanceMetres: (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => number;
  estEcartStrictementInferieurA005?: (
    meilleurScore: number,
    score: number
  ) => boolean;
}> {
  if ((globalThis as any).__GEOCODER__) {
    return (globalThis as any).__GEOCODER__;
  }
  const mod = await import(/* @vite-ignore */ EDGE_FUNCTION_PATH + "?t=" + Date.now());
  (globalThis as any).__GEOCODER__ = mod;
  return mod as any;
}
function featureIgn(
  lon: number,
  lat: number,
  postcode: string,
  city?: string,
  label?: string,
  score?: any
) {
  const feat: any = {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [lon, lat], // GeoJSON convention: [lon, lat]
    },
    properties: {
      postcode,
      label: label ?? (city ? `${city} (${postcode})` : `Lieu (${postcode})`),
      type: "housenumber",
    },
  };
  if (city !== undefined) {
    feat.properties.city = city;
  }
  if (arguments.length >= 6) {
    if (score !== undefined) {
      feat.properties.score = score;
    }
  } else {
    feat.properties.score = 0.95;
  }
  return feat;
}

describe("geocoderAdresse — IGN Géoplateforme (Edge Function)", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("convertit correctement les coordonnées GeoJSON [lon, lat] en { lat, lon }", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    // Coordonnées de Bordeaux : lon = -0.57918, lat = 44.837789
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [featureIgn(-0.57918, 44.837789, "33000", "Bordeaux")],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const coords = await geocoderAdresse("Place de la Bourse, 33000 Bordeaux");

    expect(coords.lat).toBeCloseTo(44.837789, 5);
    expect(coords.lon).toBeCloseTo(-0.57918, 5);

    // Vérifie l'URL appelée
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://data.geopf.fr/geocodage/search");
    expect(url.searchParams.get("index")).toBe("address");
    expect(url.searchParams.get("postcode")).toBe("33000");
  });

  it("filtre strictement par code postal exact quand plusieurs candidats sont retournés", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            featureIgn(-0.18542, 44.82672, "44100", "Commune-Invalide"),
            featureIgn(-0.44409, 45.13705, "33920", "Saint-Savin"),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const coords = await geocoderAdresse("8 hameau des Tilleuls, 33920 Saint-Savin");
    expect(coords.lat).toBeCloseTo(45.13705, 5);
    expect(coords.lon).toBeCloseTo(-0.44409, 5);
  });

  it("rejette si aucun résultat ne correspond au code postal saisi", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [featureIgn(-0.18542, 44.82672, "44100", "Nantes")],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(
      geocoderAdresse("8 hameau des Tilleuls, 33920")
    ).rejects.toThrow("Aucun lieu au code postal 33920");
  });

  it("rejette si les résultats sont vides", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(
      geocoderAdresse("Rue Inexistante Sans Issue 99999")
    ).rejects.toThrow("Adresse introuvable");
  });

  it("rejette si les résultats pointent vers plusieurs communes distinctes (ambiguïté)", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            featureIgn(-0.5, 44.8, "33000", "Bordeaux"),
            featureIgn(-0.6, 44.9, "33700", "Mérignac"),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("Avenue de la République")).rejects.toThrow(
      "Adresse ambiguë"
    );
  });

  it("rejette si les coordonnées géographiques sont absentes ou invalides", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: ["invalide", null] },
              properties: { postcode: "33000", city: "Bordeaux" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(
      geocoderAdresse("Place de la Bourse, 33000 Bordeaux")
    ).rejects.toThrow("Coordonnées de géocodage invalides ou absentes");
  });

  it("gère l'erreur HTTP 429 (limite de débit)", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response("Too Many Requests", { status: 429 })
    );

    await expect(geocoderAdresse("Place de la Bourse, 33000 Bordeaux")).rejects.toThrow(
      "limite de débit atteinte (429)"
    );
  });

  it("gère l'erreur HTTP 5xx (panne service IGN)", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response("Service Unavailable", { status: 503 })
    );

    await expect(geocoderAdresse("Place de la Bourse, 33000 Bordeaux")).rejects.toThrow(
      "Service de géocodage IGN Géoplateforme indisponible (503)"
    );
  });

  it("gère le délai d'attente dépassé (timeout AbortError)", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockImplementationOnce(() => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      return Promise.reject(abortError);
    });

    await expect(geocoderAdresse("Place de la Bourse, 33000 Bordeaux")).rejects.toThrow(
      "délai d'attente dépassé (timeout)"
    );
  });

  it("gère une erreur réseau inattendue", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockRejectedValueOnce(new Error("Connection reset by peer"));

    await expect(geocoderAdresse("Place de la Bourse, 33000 Bordeaux")).rejects.toThrow(
      "Erreur réseau géocodage IGN Géoplateforme"
    );
  });

  it("rejette les coordonnées dont la latitude est hors limites [-90, 90]", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [featureIgn(-0.5, 95.5, "33000", "Bordeaux")],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(
      geocoderAdresse("Place de la Bourse, 33000 Bordeaux")
    ).rejects.toThrow("Coordonnées de géocodage");
  });

  it("rejette les coordonnées dont la longitude est hors limites [-180, 180]", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [featureIgn(185.0, 44.8, "33000", "Bordeaux")],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(
      geocoderAdresse("Place de la Bourse, 33000 Bordeaux")
    ).rejects.toThrow("Coordonnées de géocodage");
  });

  it("calculerDistanceMetres : calcule la distance orthodromique exacte au mètre près", async () => {
    const { calculerDistanceMetres } = await chargerGeocoder();
    // 0.0036° lat à Bordeaux = ~400.3 mètres
    const d400 = calculerDistanceMetres(44.837789, -0.57918, 44.837789 + 0.0036, -0.57918);
    expect(Math.round(d400)).toBe(400);

    // 0.0054° lat à Bordeaux = ~600.5 mètres
    const d600 = calculerDistanceMetres(44.837789, -0.57918, 44.837789 + 0.0054, -0.57918);
    expect(Math.round(d600)).toBe(600);
  });

  it("seuil 500 m : accepte deux candidats concurrents dans la même commune distants de moins de 500 m (~400 m)", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            // Deux points distants de ~400 m (même secteur), scores proches (0.85 vs 0.84)
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue des Lilas 33000 Bordeaux", 0.85),
            featureIgn(-0.57918, 44.837789 + 0.0036, "33000", "Bordeaux", "20 Rue des Lilas 33000 Bordeaux", 0.84),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const coords = await geocoderAdresse("Rue des Lilas, 33000 Bordeaux");
    expect(coords.lat).toBeCloseTo(44.837789, 5);
    expect(coords.lon).toBeCloseTo(-0.57918, 5);
  });

  it("seuil 500 m : rejette deux candidats concurrents dans la même commune distants de plus de 500 m (~600 m)", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            // Deux points distants de ~600 m (> 500 m), scores proches (0.85 vs 0.84)
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "Rue des Lilas 33000 Bordeaux", 0.85),
            featureIgn(-0.57918, 44.837789 + 0.0054, "33000", "Bordeaux", "Allée des Lilas 33000 Bordeaux", 0.84),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("Lilas, 33000 Bordeaux")).rejects.toThrow(
      "Adresse ambiguë au sein de la commune"
    );
  });

  it("accepte le meilleur candidat au sein d'une même commune quand un candidat surpasse nettement les autres", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "12 Rue des Lilas 33000 Bordeaux", 0.95),
            featureIgn(-0.55000, 44.855000, "33000", "Bordeaux", "Avenue des Lilas 33000 Bordeaux", 0.40),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const coords = await geocoderAdresse("12 Rue des Lilas, 33000 Bordeaux");
    expect(coords.lat).toBeCloseTo(44.837789, 5);
    expect(coords.lon).toBeCloseTo(-0.57918, 5);
  });

  it("rejette explicitement une adresse vide ou composée uniquement d'espaces sans appel réseau", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    await expect(geocoderAdresse("")).rejects.toThrow("Adresse vide");
    await expect(geocoderAdresse("   \t  \n ")).rejects.toThrow("Adresse vide");

    // Aucun appel réseau ne doit avoir été effectué
    expect(fetchMock.mock.calls.length).toBe(0);
  });

  it("sécurité score : rejette si un score de candidat est absent lors de l'arbitrage intra-commune", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue des Lilas 33000 Bordeaux", 0.95),
            featureIgn(-0.57918, 44.837789 + 0.0036, "33000", "Bordeaux", "20 Rue des Lilas 33000 Bordeaux", undefined),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("Rue des Lilas, 33000 Bordeaux")).rejects.toThrow(
      "Score de pertinence IGN invalide ou absent"
    );
  });

  it("sécurité score : rejette si un score de candidat est non numérique", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue des Lilas 33000 Bordeaux", 0.95),
            featureIgn(-0.57918, 44.837789 + 0.0036, "33000", "Bordeaux", "20 Rue des Lilas 33000 Bordeaux", "invalide"),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("Rue des Lilas, 33000 Bordeaux")).rejects.toThrow(
      "Score de pertinence IGN invalide ou absent"
    );
  });

  it("sécurité score : rejette si un score de candidat est non fini (NaN ou Infinity)", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue des Lilas 33000 Bordeaux", 0.95),
            featureIgn(-0.57918, 44.837789 + 0.0036, "33000", "Bordeaux", "20 Rue des Lilas 33000 Bordeaux", NaN),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("Rue des Lilas, 33000 Bordeaux")).rejects.toThrow(
      "Score de pertinence IGN invalide ou absent"
    );
  });

  it("sécurité score : rejette si un score de candidat est hors plage attendue (< 0 ou > 1)", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue des Lilas 33000 Bordeaux", 0.95),
            featureIgn(-0.57918, 44.837789 + 0.0036, "33000", "Bordeaux", "20 Rue des Lilas 33000 Bordeaux", 1.8),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("Rue des Lilas, 33000 Bordeaux")).rejects.toThrow(
      "Score de pertinence IGN invalide ou absent"
    );
  });

  it("multi-candidats : détecte l'ambiguïté portée par un 3e candidat éloigné avec un score concurrent", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            // c0 et c1 proches (~111 m), scores 0.95 et 0.94
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue des Lilas 33000 Bordeaux", 0.95),
            featureIgn(-0.57918, 44.837789 + 0.001, "33000", "Bordeaux", "20 Rue des Lilas 33000 Bordeaux", 0.94),
            // c2 éloigné (~1670 m > 500 m), score concurrent 0.93 (écart 0.02 < 0.05)
            featureIgn(-0.57918, 44.837789 + 0.015, "33000", "Bordeaux", "Lieu-dit Les Lilas 33000 Bordeaux", 0.93),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("Rue des Lilas, 33000 Bordeaux")).rejects.toThrow(
      "Adresse ambiguë au sein de la commune"
    );
  });

  it("multi-candidats : rejette si le troisième candidat a un score invalide", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue des Lilas 33000 Bordeaux", 0.95),
            featureIgn(-0.57918, 44.837789 + 0.001, "33000", "Bordeaux", "20 Rue des Lilas 33000 Bordeaux", 0.90),
            featureIgn(-0.57918, 44.837789 + 0.015, "33000", "Bordeaux", "Autre Rue 33000 Bordeaux", undefined),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("Rue des Lilas, 33000 Bordeaux")).rejects.toThrow(
      "Score de pertinence IGN invalide ou absent"
    );
  });

  it("multi-candidats : trie explicitement par score décroissant avant arbitrage", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            // Premier candidat envoyé avec score plus faible (0.80)
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "Mauvais Candidat 33000 Bordeaux", 0.80),
            // Second candidat avec score plus élevé (0.95, écart 0.15 >= 0.05 => dominant)
            featureIgn(-0.55000, 44.855000, "33000", "Bordeaux", "Meilleur Candidat 33000 Bordeaux", 0.95),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const coords = await geocoderAdresse("Rue des Lilas, 33000 Bordeaux");
    expect(coords.lat).toBeCloseTo(44.855000, 5);
    expect(coords.lon).toBeCloseTo(-0.55000, 5);
  });

  it("seuil strict de distance : accepte à exactement 500 mètres (<= 500 m)", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    const dLat500 = (500 / 6371000) * (180 / Math.PI);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue A 33000 Bordeaux", 0.85),
            featureIgn(-0.57918, 44.837789 + dLat500, "33000", "Bordeaux", "20 Rue A 33000 Bordeaux", 0.84),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const coords = await geocoderAdresse("Rue A, 33000 Bordeaux");
    expect(coords.lat).toBeCloseTo(44.837789, 5);
  });

  it("seuil strict de distance : rejette à plus de 500 mètres (> 500 m)", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    const dLat501 = (501 / 6371000) * (180 / Math.PI);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue A 33000 Bordeaux", 0.85),
            featureIgn(-0.57918, 44.837789 + dLat501, "33000", "Bordeaux", "Allée A 33000 Bordeaux", 0.84),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("Rue A, 33000 Bordeaux")).rejects.toThrow(
      "Adresse ambiguë au sein de la commune"
    );
  });

  it("seuil strict de score : écart strictement inférieur à 0.05 est concurrent (rejet si distant)", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            // Écart de 0.04 (< 0.05), distants de ~1100 m
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue A 33000 Bordeaux", 0.85),
            featureIgn(-0.57918, 44.837789 + 0.01, "33000", "Bordeaux", "Allée B 33000 Bordeaux", 0.81),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("Rue A, 33000 Bordeaux")).rejects.toThrow(
      "Adresse ambiguë au sein de la commune"
    );
  });

  it("seuil strict de score : écart exactement égal à 0.05 n'est pas concurrent (accepté sans ambiguïté)", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            // Écart exact de 0.05 (0.85 - 0.80) : non concurrent
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue A 33000 Bordeaux", 0.85),
            featureIgn(-0.57918, 44.837789 + 0.01, "33000", "Bordeaux", "Allée B 33000 Bordeaux", 0.80),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const coords = await geocoderAdresse("Rue A, 33000 Bordeaux");
    expect(coords.lat).toBeCloseTo(44.837789, 5);
  });

  it("multi-candidats : accepte quand un candidat domine nettement plusieurs autres candidats", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue Principale 33000 Bordeaux", 0.95),
            featureIgn(-0.55000, 44.855000, "33000", "Bordeaux", "Rue Secondaire 33000 Bordeaux", 0.70),
            featureIgn(-0.54000, 44.860000, "33000", "Bordeaux", "Impasse Tertiaire 33000 Bordeaux", 0.65),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const coords = await geocoderAdresse("Rue Principale, 33000 Bordeaux");
    expect(coords.lat).toBeCloseTo(44.837789, 5);
    expect(coords.lon).toBeCloseTo(-0.57918, 5);
  });

  it("multi-candidats : un candidat à score faible distant ne bloque pas l'arbitrage de candidats proches", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            // c0 et c1 proches (~111 m), scores 0.95 et 0.94
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue des Lilas 33000 Bordeaux", 0.95),
            featureIgn(-0.57918, 44.837789 + 0.001, "33000", "Bordeaux", "20 Rue des Lilas 33000 Bordeaux", 0.94),
            // c2 très éloigné (~5 km), mais score très faible 0.30 (écart 0.65 >= 0.05 => éliminé de l'arbitrage)
            featureIgn(-0.57918, 44.837789 + 0.045, "33000", "Bordeaux", "Zone Éloignée 33000 Bordeaux", 0.30),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const coords = await geocoderAdresse("Rue des Lilas, 33000 Bordeaux");
    expect(coords.lat).toBeCloseTo(44.837789, 5);
  });

  it("sécurité commune : rejette si le champ city est absent dans la réponse IGN", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            // city absent (undefined)
            featureIgn(-0.57918, 44.837789, "33000", undefined as any, "10 Rue des Lilas 33000 Bordeaux", 0.95),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("10 Rue des Lilas, 33000 Bordeaux")).rejects.toThrow(
      "Commune non identifiable dans la réponse IGN"
    );
  });

  it("estEcartStrictementInferieurA005 : comparaison décimale exacte sans arrondi ni approximation IEEE 754", async () => {
    const { estEcartStrictementInferieurA005 } = await chargerGeocoder();
    expect(typeof estEcartStrictementInferieurA005).toBe("function");

    // Exactement égal à 0.05 -> non concurrent (false)
    expect(estEcartStrictementInferieurA005!(0.85, 0.80)).toBe(false);
    expect(estEcartStrictementInferieurA005!(0.95, 0.90)).toBe(false);
    expect(estEcartStrictementInferieurA005!(0.75, 0.70)).toBe(false);

    // Inférieur à 0.05 -> concurrent (true)
    expect(estEcartStrictementInferieurA005!(0.85, 0.801)).toBe(true);

    // Légèrement inférieur à 0.05 (0.0499997) -> concurrent (true)
    expect(estEcartStrictementInferieurA005!(0.85, 0.8000003)).toBe(true);

    // Légèrement supérieur à 0.05 (0.0500003) -> non concurrent (false)
    expect(estEcartStrictementInferieurA005!(0.85, 0.7999997)).toBe(false);

    // Bornes 0 et 1
    expect(estEcartStrictementInferieurA005!(1.0, 0.95)).toBe(false);
    expect(estEcartStrictementInferieurA005!(1.0, 0.9500001)).toBe(true);
    expect(estEcartStrictementInferieurA005!(0.05, 0.0)).toBe(false);
    expect(estEcartStrictementInferieurA005!(0.0499997, 0.0)).toBe(true);
    expect(estEcartStrictementInferieurA005!(0.0500003, 0.0)).toBe(false);
  });

  it("seuil strict de score : écart légèrement inférieur à 0.05 (0.0499997) déclenche l'ambiguïté à > 500 m", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            // Écart de 0.0499997 (< 0.05), distants de ~1100 m
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue A 33000 Bordeaux", 0.85),
            featureIgn(-0.57918, 44.837789 + 0.01, "33000", "Bordeaux", "Allée B 33000 Bordeaux", 0.8000003),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("Rue A, 33000 Bordeaux")).rejects.toThrow(
      "Adresse ambiguë au sein de la commune"
    );
  });

  it("seuil strict de score : écart légèrement supérieur à 0.05 (0.0500003) n'est pas concurrent à > 500 m", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            // Écart de 0.0500003 (>= 0.05), distants de ~1100 m
            featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue A 33000 Bordeaux", 0.85),
            featureIgn(-0.57918, 44.837789 + 0.01, "33000", "Bordeaux", "Allée B 33000 Bordeaux", 0.7999997),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const coords = await geocoderAdresse("Rue A, 33000 Bordeaux");
    expect(coords.lat).toBeCloseTo(44.837789, 5);
  });

  it("estEcartStrictementInferieurA005 : cas requis (0.0499997, 0.05, 0.0500003)", async () => {
    const { estEcartStrictementInferieurA005 } = await chargerGeocoder();
    expect(typeof estEcartStrictementInferieurA005).toBe("function");

    expect(estEcartStrictementInferieurA005!(0.0499997, 0)).toBe(true);
    expect(estEcartStrictementInferieurA005!(0.05, 0)).toBe(false);
    expect(estEcartStrictementInferieurA005!(0.0500003, 0)).toBe(false);
  });

  it("estEcartStrictementInferieurA005 : notation scientifique et valeurs équivalentes", async () => {
    const { estEcartStrictementInferieurA005 } = await chargerGeocoder();
    expect(typeof estEcartStrictementInferieurA005).toBe("function");

    // 5e-2 = 0.05
    expect(estEcartStrictementInferieurA005!(5e-2, 0)).toBe(false);
    // 4.99997e-2 = 0.0499997
    expect(estEcartStrictementInferieurA005!(4.99997e-2, 0)).toBe(true);
    // 5.00003e-2 = 0.0500003
    expect(estEcartStrictementInferieurA005!(5.00003e-2, 0)).toBe(false);

    // Valeurs équivalentes en notation différente
    expect(estEcartStrictementInferieurA005!(0.85, 8.5e-1 - 5e-2 + 1e-3)).toBe(true); // 0.85 vs 0.801
    expect(estEcartStrictementInferieurA005!(1e0, 9.5e-1)).toBe(false);
    expect(estEcartStrictementInferieurA005!(1e0, 9.500001e-1)).toBe(true);
  });

  it("estEcartStrictementInferieurA005 : bornes 0 et 1", async () => {
    const { estEcartStrictementInferieurA005 } = await chargerGeocoder();
    expect(typeof estEcartStrictementInferieurA005).toBe("function");

    expect(estEcartStrictementInferieurA005!(0, 0)).toBe(true);
    expect(estEcartStrictementInferieurA005!(1, 1)).toBe(true);
    expect(estEcartStrictementInferieurA005!(1, 0)).toBe(false);
    expect(estEcartStrictementInferieurA005!(0.05, 0)).toBe(false);
    expect(estEcartStrictementInferieurA005!(0, 0.05)).toBe(false);
  });

  it("estEcartStrictementInferieurA005 : arguments invalides hors contrat", async () => {
    const { estEcartStrictementInferieurA005 } = await chargerGeocoder();
    expect(typeof estEcartStrictementInferieurA005).toBe("function");

    expect(() => estEcartStrictementInferieurA005!(NaN as any, 0.5)).toThrow();
    expect(() => estEcartStrictementInferieurA005!(Infinity as any, 0.5)).toThrow();
    expect(() => estEcartStrictementInferieurA005!(-Infinity as any, 0.5)).toThrow();
    expect(() => estEcartStrictementInferieurA005!(-0.01, 0.5)).toThrow();
    expect(() => estEcartStrictementInferieurA005!(1.01, 0.5)).toThrow();
    expect(() => estEcartStrictementInferieurA005!(-0, 0.5)).toThrow(RangeError);
    expect(() => estEcartStrictementInferieurA005!("0.05" as any, 0.5)).toThrow();
    expect(estEcartStrictementInferieurA005!(0, 0.5)).toBe(false);
    expect(estEcartStrictementInferieurA005!(0, 0)).toBe(true);
  });

  it("estEcartStrictementInferieurA005 : cas obligatoires (diff 0 < 0.05, scientique, bornes)", async () => {
    const { estEcartStrictementInferieurA005 } = await chargerGeocoder();
    expect(typeof estEcartStrictementInferieurA005).toBe("function");

    expect(estEcartStrictementInferieurA005!(0.85, 0.8000003)).toBe(true);
    expect(estEcartStrictementInferieurA005!(0.85, 0.8)).toBe(false);
    expect(estEcartStrictementInferieurA005!(0.85, 0.7999997)).toBe(false);
    expect(estEcartStrictementInferieurA005!(1, 0.95)).toBe(false);
    expect(estEcartStrictementInferieurA005!(1, 0.9500001)).toBe(true);
    expect(estEcartStrictementInferieurA005!(0.05, 0)).toBe(false);
    expect(estEcartStrictementInferieurA005!(0.8, 0.8)).toBe(true);
    expect(estEcartStrictementInferieurA005!(1e-7, 0)).toBe(true);
    expect(estEcartStrictementInferieurA005!(5e-2, 0)).toBe(false);
    expect(estEcartStrictementInferieurA005!(4.99997e-2, 0)).toBe(true);
    expect(estEcartStrictementInferieurA005!(0.85, 8.000003e-1)).toBe(true);
    expect(estEcartStrictementInferieurA005!(1e0, 9.5e-1)).toBe(false);
  });

  it("sécurité score : candidat unique avec score valide accepté", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue A 33000 Bordeaux", 0.95)],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const coords = await geocoderAdresse("10 Rue A, 33000 Bordeaux");
    expect(coords.lat).toBeCloseTo(44.837789, 5);
  });

  it("sécurité score : candidat unique avec score absent rejeté", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [(() => { const f = featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue A 33000 Bordeaux"); delete (f.properties as any).score; return f; })()],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("10 Rue A, 33000 Bordeaux")).rejects.toThrow(
      "Score de pertinence IGN invalide ou absent"
    );
  });

  it("sécurité score : candidat unique avec score null rejeté", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue A 33000 Bordeaux", null)],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("10 Rue A, 33000 Bordeaux")).rejects.toThrow(
      "Score de pertinence IGN invalide ou absent"
    );
  });

  it("sécurité score : candidat unique avec score chaîne rejeté", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue A 33000 Bordeaux", "0.9")],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("10 Rue A, 33000 Bordeaux")).rejects.toThrow(
      "Score de pertinence IGN invalide ou absent"
    );
  });

  it("sécurité score : candidat unique avec score négatif rejeté", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue A 33000 Bordeaux", -0.1)],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("10 Rue A, 33000 Bordeaux")).rejects.toThrow(
      "Score de pertinence IGN invalide ou absent"
    );
  });

  it("sécurité score : candidat unique avec score supérieur à 1 rejeté", async () => {
    const { geocoderAdresse } = await chargerGeocoder();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [featureIgn(-0.57918, 44.837789, "33000", "Bordeaux", "10 Rue A 33000 Bordeaux", 1.1)],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(geocoderAdresse("10 Rue A, 33000 Bordeaux")).rejects.toThrow(
      "Score de pertinence IGN invalide ou absent"
    );
  });
});
