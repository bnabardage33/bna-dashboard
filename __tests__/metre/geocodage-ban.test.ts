// __tests__/metre/geocodage-ban.test.ts
//
// Tests du géocodeur de la Base Adresse Nationale, partagé par l'Edge Function
// `generer-rapports-intemperies` et le module `lib/geocodageBAN`.
//
// Le contrat vérifié est celui de l'implémentation RÉELLE : code postal exact,
// refus des résultats vides ou ambigus, validation des coordonnées. Aucun appel
// réseau réel : `fetch` est intercepté pour chaque test.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { geocoderAdresse } from "@/lib/geocodageBAN";

type Candidat = {
  geometry?: { coordinates?: [number | string, number | string] };
  properties?: {
    label?: string;
    postcode?: string;
    city?: string;
    citycode?: string;
  };
};

function candidat(
  lon: number | string | undefined,
  lat: number | string | undefined,
  codePostal: string | undefined,
  commune: string | undefined,
): Candidat {
  return {
    geometry: {
      coordinates: [lon as number, lat as number],
    },
    properties: {
      label: commune ? `${commune}, France` : undefined,
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

function reponseBAN(features: Candidat[], status = 200): Response {
  return reponseJson({ type: "FeatureCollection", features }, status);
}

describe("geocoderAdresse — BAN (api-adresse.data.gouv.fr)", () => {
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

  it("interroge la BAN et convertit lon/lat en nombres", async () => {
    fetchMock.mockResolvedValueOnce(
      reponseBAN([candidat("-0.57918", "44.837789", "33000", "Bordeaux")])
    );

    const coords = await geocoderAdresse("Place de la Bourse, 33000 Bordeaux");

    expect(coords.lat).toBeCloseTo(44.837789, 5);
    expect(coords.lon).toBeCloseTo(-0.57918, 5);

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe(
      "https://api-adresse.data.gouv.fr/search/"
    );
    expect(url.searchParams.get("q")).toBe(
      "Place de la Bourse, 33000 Bordeaux"
    );
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("filtre strictement sur le code postal saisi", async () => {
    fetchMock.mockResolvedValueOnce(
      reponseBAN([
        candidat("-0.18542", "44.82672", "44100", "Nantes"),
        candidat("-0.44409", "45.13705", "33920", "Saint-Savin"),
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
      reponseBAN([candidat("-1.553621", "47.218371", "44100", "Nantes")])
    );

    await expect(
      geocoderAdresse("8 hameau des Tilleuls, 33920")
    ).rejects.toThrow("Aucun lieu au code postal 33920");
  });

  it("refuse une réponse vide", async () => {
    fetchMock.mockResolvedValueOnce(reponseBAN([]));

    await expect(
      geocoderAdresse("Rue Inexistante Sans Issue 99999")
    ).rejects.toThrow("Adresse introuvable");
  });

  it("refuse plusieurs communes quand aucun code postal ne tranche", async () => {
    fetchMock.mockResolvedValueOnce(
      reponseBAN([
        candidat("-0.57918", "44.837789", "33000", "Bordeaux"),
        candidat("-0.645", "44.842", "33700", "Mérignac"),
      ])
    );

    await expect(geocoderAdresse("Avenue de la République")).rejects.toThrow(
      "Adresse ambiguë"
    );
  });

  it("refuse plusieurs communes même avec un code postal commun", async () => {
    fetchMock.mockResolvedValueOnce(
      reponseBAN([
        candidat("-0.57918", "44.837789", "33000", "Bordeaux"),
        candidat("-0.58", "44.838", "33000", "Le Bouscat"),
      ])
    );

    await expect(
      geocoderAdresse("Avenue de la République, 33000")
    ).rejects.toThrow("Adresse ambiguë");
  });

  it("propage les erreurs HTTP (429 et 5xx)", async () => {
    fetchMock.mockResolvedValueOnce(reponseJson({}, 429));
    await expect(geocoderAdresse("1 rue X, 33000 Bordeaux")).rejects.toThrow(
      "Géocodage BAN (429)"
    );

    fetchMock.mockResolvedValueOnce(reponseJson({}, 503));
    await expect(geocoderAdresse("1 rue X, 33000 Bordeaux")).rejects.toThrow(
      "Géocodage BAN (503)"
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
      reponseBAN([candidat(undefined, undefined, "33000", "Bordeaux")])
    );
    await expect(geocoderAdresse("Rue X, Bordeaux")).rejects.toThrow(
      "Coordonnées de géocodage invalides"
    );

    fetchMock.mockResolvedValueOnce(
      reponseBAN([candidat("nord", "ouest", "33000", "Bordeaux")])
    );
    await expect(geocoderAdresse("Rue X, Bordeaux")).rejects.toThrow(
      "Coordonnées de géocodage invalides"
    );

    fetchMock.mockResolvedValueOnce(
      reponseBAN([{ properties: { postcode: "33000", city: "Bordeaux" } }])
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
