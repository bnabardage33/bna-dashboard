import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { geocoderAdresse } from "../../lib/deplacement/geocodage";
import { calculerDistanceRoute } from "../../lib/deplacement/itineraire";
import { evaluerDistances } from "../../lib/deplacement/service";

// Mock global pour intercepter les requêtes HTTP (zéro appel réseau réel)
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("geocoderAdresse (Nominatim)", () => {
  it("gère une adresse valide avec le bon User-Agent (BNA-Dashboard/1.0)", async () => {
    const mockResponse = [{ lat: "44.837789", lon: "-0.57918" }];
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await geocoderAdresse("Bordeaux");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.lat).toBe(44.837789);
      expect(result.data.lon).toBe(-0.57918);
    }

    const callArgs = (global.fetch as any).mock.calls[0];
    const url = callArgs[0] as string;
    expect(url).toContain("nominatim.openstreetmap.org");
    expect(callArgs[1].headers["User-Agent"]).toContain("BNA-Dashboard/1.0");
  });

  it("gère une adresse introuvable", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => []
    });
    const result = await geocoderAdresse("Adresse inexistante dans le monde");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.erreur).toContain("introuvable");
  });
  
  it("gère les erreurs HTTP réseau", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500
    });
    const result = await geocoderAdresse("Test serveur crash");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.erreur).toContain("500");
  });
});

describe("calculerDistanceRoute (OSRM)", () => {
  it("renvoie la distance routière en mètres", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ code: "Ok", routes: [{ distance: 15500.4 }] })
    });

    const result = await calculerDistanceRoute({ lat: 44, lon: -0.5 }, { lat: 44.1, lon: -0.6 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe(15500.4);
    
    const callArgs = (global.fetch as any).mock.calls[0];
    expect(callArgs[0]).toContain("router.project-osrm.org");
  });
});

describe("evaluerDistances (Orchestrateur)", () => {
  it("appelle les APIs séquentiellement (avec délai) et convertit proprement les mètres en km", async () => {
    // On mock les réponses en fonction de l'URL appelée
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes("nominatim")) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ lat: "44.0", lon: "-0.5" }]
        });
      }
      if (url.includes("osrm")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ code: "Ok", routes: [{ distance: 15550 }] }) // 15.55 km
        });
      }
      return Promise.reject(new Error("URL non mockée"));
    });

    const startTime = Date.now();
    const result = await evaluerDistances("Départ", "Arrivée");
    const elapsed = Date.now() - startTime;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.distanceAllerKm).toBe(15.55);
      expect(result.data.distanceRetourKm).toBe(15.55); // Dupliqué selon les règles
    }
    
    // Vérifier que 3 appels HTTP ont bien eu lieu (2 Nominatim + 1 OSRM)
    expect((global.fetch as any).mock.calls.length).toBe(3);
    
    // Vérifier que le délai d'une seconde a bien été appliqué
    // Comme evaluerDistances possède un délai de 1100ms, l'elapsed time global doit être >= 1100ms
    expect(elapsed).toBeGreaterThanOrEqual(1100);
  });
});
