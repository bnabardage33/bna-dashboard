// __tests__/metre/geocodage-nominatim.test.ts
//
// Tests du géocodeur Nominatim / OpenStreetMap, partagé par l'Edge Function
// `generer-rapports-intemperies` et les routes Next (`lib/geocodageNominatim`).
//
// Le contrat vérifié est celui de l'implémentation RÉELLE : code postal exact,
// refus des résultats vides ou ambigus, validation des coordonnées. Aucun appel
// réseau réel : `fetch` est intercepté pour chaque test.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { geocoderAdresse } from "@/lib/geocodageNominatim";

type Candidat = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
  };
};

function candidat(
  lat: string | undefined,
  lon: string | undefined,
  codePostal: string | undefined,
  commune: string | undefined,
): Candidat {
  return {
    lat,
    lon,
    display_name: commune ? `${commune}, France` : undefined,
    address: {
      postcode: codePostal,
      city: commune,
    },
  };
}

function reponseJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("geocoderAdresse — Edge Function (Nominatim)", () => {
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

  it("convertit lat/lon textuels en nombres et interroge Nominatim", async () => {
        fetchMock.mockResolvedValueOnce(
      reponseJson([candidat("44.837789", "-0.57918", "33000", "Bordeaux")])
    );

    const coords = await geocoderAdresse("Place de la Bourse, 33000 Bordeaux");

    expect(coords.lat).toBeCloseTo(44.837789, 5);
    expect(coords.lon).toBeCloseTo(-0.57918, 5);

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe(
      "https://nominatim.openstreetmap.org/search"
    );
    expect(url.searchParams.get("q")).toBe(
      "Place de la Bourse, 33000 Bordeaux"
    );
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("addressdetails")).toBe("1");
    expect(url.searchParams.get("countrycodes")).toBe("fr");
  });

  it("filtre strictement sur le code postal saisi", async () => {
        fetchMock.mockResolvedValueOnce(
      reponseJson([
        candidat("44.82672", "-0.18542", "44100", "Nantes"),
        candidat("45.13705", "-0.44409", "33920", "Saint-Savin"),
      ])
    );

    const coords = await geocoderAdresse(
      "8 hameau des Tilleuls, 33920 Saint-Savin"
    );

    expect(coords.lat).toBeCloseTo(45.13705, 5);
    expect(coords.lon).toBeCloseTo(-0.44409, 5);
  });

  it("refuse quand aucun candidat ne porte le code postal saisi", async () => {
        fetchMock.mockResolvedValueOnce(
      reponseJson([candidat("47.218371", "-1.553621", "44100", "Nantes")])
    );

    await expect(geocoderAdresse("8 hameau des Tilleuls, 33920")).rejects.toThrow(
      "Aucun lieu au code postal 33920"
    );
  });

  it("refuse une réponse vide", async () => {
        fetchMock.mockResolvedValueOnce(reponseJson([]));

    await expect(
      geocoderAdresse("Rue Inexistante Sans Issue 99999")
    ).rejects.toThrow("Adresse introuvable");
  });

  it("refuse plusieurs communes quand aucun code postal ne tranche", async () => {
        fetchMock.mockResolvedValueOnce(
      reponseJson([
        candidat("44.837789", "-0.57918", "33000", "Bordeaux"),
        candidat("44.842", "-0.645", "33700", "Mérignac"),
      ])
    );

    await expect(geocoderAdresse("Avenue de la République")).rejects.toThrow(
      "Adresse ambiguë"
    );
  });

  it("refuse plusieurs communes même avec un code postal commun", async () => {
        fetchMock.mockResolvedValueOnce(
      reponseJson([
        candidat("44.837789", "-0.57918", "33000", "Bordeaux"),
        candidat("44.838", "-0.58", "33000", "Le Bouscat"),
      ])
    );

    await expect(
      geocoderAdresse("Avenue de la République, 33000")
    ).rejects.toThrow("Adresse ambiguë");
  });

  it("propage les erreurs HTTP (429 et 5xx)", async () => {
    
    fetchMock.mockResolvedValueOnce(reponseJson({}, 429));
    await expect(geocoderAdresse("1 rue X, 33000 Bordeaux")).rejects.toThrow(
      "Géocodage Nominatim (429)"
    );

    fetchMock.mockResolvedValueOnce(reponseJson({}, 503));
    await expect(geocoderAdresse("1 rue X, 33000 Bordeaux")).rejects.toThrow(
      "Géocodage Nominatim (503)"
    );
  });

  it("propage une erreur réseau inattendue", async () => {
        fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));

    await expect(geocoderAdresse("1 rue X, 33000 Bordeaux")).rejects.toThrow(
      "ECONNRESET"
    );
  });

  it("refuse des coordonnées absentes ou non finies", async () => {
    
    fetchMock.mockResolvedValueOnce(
      reponseJson([candidat(undefined, undefined, "33000", "Bordeaux")])
    );
    await expect(geocoderAdresse("Rue X, Bordeaux")).rejects.toThrow(
      "Coordonnées de géocodage invalides"
    );

    fetchMock.mockResolvedValueOnce(
      reponseJson([candidat("nord", "ouest", "33000", "Bordeaux")])
    );
    await expect(geocoderAdresse("Rue X, Bordeaux")).rejects.toThrow(
      "Coordonnées de géocodage invalides"
    );
  });

  it("refuse une adresse vide sans appel réseau", async () => {
    
    await expect(geocoderAdresse("   ")).rejects.toThrow("Adresse vide");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
