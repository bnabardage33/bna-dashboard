// Tests de `lib/meteoLocalisation.ts` — résolution unique et réutilisée du lieu
// d'un chantier, partagée par les fournisseurs météo.
//
// Le point clé : une adresse n'est résolue qu'UNE fois, et un échec transitoire
// n'est pas mis en cache (sinon un chantier resterait sans météo jusqu'au
// redémarrage du serveur).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resoudreLocalisationMeteo,
  pointPourFournisseur,
  viderCacheLocalisation,
} from "@/lib/meteoLocalisation";

const BON_CP = [
  {
    lat: "45.1370583",
    lon: "-0.4440939",
    display_name: "Hameau des Tilleuls, Saint-Savin, Gironde, 33920, France",
    address: { postcode: "33920", city: "Saint-Savin" },
  },
];

const originalFetch = global.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  viderCacheLocalisation();
  mockFetch = vi.fn();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("resoudreLocalisationMeteo", () => {
  it("résout l'adresse par le code postal exact", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => BON_CP });

    const result = await resoudreLocalisationMeteo("8 hameau des Tilleuls, 33920");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.lat).toBe(45.1370583);
      expect(result.data.codePostal).toBe("33920");
    }
  });

  it("réutilise le même point pour une adresse déjà résolue (un seul appel réseau)", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => BON_CP });

    await resoudreLocalisationMeteo("8 hameau des Tilleuls, 33920");
    await resoudreLocalisationMeteo("8 Hameau des Tilleuls, 33920");
    // La casse est normalisée : la seconde résolution est servie par le cache.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("ne met PAS en cache un échec transitoire", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // Nominatim muet
      .mockResolvedValueOnce({ ok: true, json: async () => BON_CP });

    const premier = await resoudreLocalisationMeteo("8 hameau des Tilleuls, 33920");
    expect(premier.ok).toBe(false);

    // Le second essai doit réellement rappeler Nominatim, pas resservir l'échec.
    const second = await resoudreLocalisationMeteo("8 hameau des Tilleuls, 33920");
    expect(second.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("une adresse vide est refusée sans appel réseau", async () => {
    const result = await resoudreLocalisationMeteo("   ");
    expect(result.ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuse un lieu ambigu plutôt que de prendre le premier", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { ...BON_CP[0], display_name: "A, Commune-A, 33920", address: { postcode: "33920", city: "Commune-A" } },
        { ...BON_CP[0], display_name: "B, Commune-B, 33920", address: { postcode: "33920", city: "Commune-B" } },
      ],
    });

    const result = await resoudreLocalisationMeteo("8 hameau des Tilleuls, 33920");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.erreur).toContain("ambigu");
  });
});

describe("pointPourFournisseur", () => {
  it("produit le format `lat,lon` attendu par VisualCrossing", () => {
    expect(pointPourFournisseur({ lat: 45.1370583, lon: -0.4440939 })).toBe(
      "45.1370583,-0.4440939"
    );
  });
});
