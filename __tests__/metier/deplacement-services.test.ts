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

  // Les deux homonymes ci-dessous sont les valeurs réellement mesurées sur
  // Nominatim pour « 8 lotissement Bellevue, 33920 ». Leur écart d'importance
  // est de 2,4e-7 : `limit=1` renvoyait Branne, à 40 km de Saint-Savin, et
  // produisait un chiffrage 4,4 fois trop élevé sans aucun signal.
  const BELLEVUE_BRANNE = {
    lat: "44.8267278",
    lon: "-0.1854268",
    type: "residential",
    importance: 0.053397347219043226,
    display_name:
      "Lotissement Bellevue, Le Plantier du Maine, Branne, Libourne, Gironde, 33420, France",
    address: { postcode: "33420", city: "Branne", country: "France" }
  };
  const BELLEVUE_SAINT_SAVIN = {
    lat: "45.1370583",
    lon: "-0.4440939",
    type: "residential",
    importance: 0.053397109178301636,
    display_name:
      "Lotissement les Portes de Bellevue, La Chaise, Saint-Savin, Blaye, Gironde, 33920, France",
    address: { postcode: "33920", city: "Saint-Savin", country: "France" }
  };

  it("retient le homonyme dont le code postal correspond à la saisie, malgré son importance plus faible", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      // Nominatim classe par importance décroissante : Branne arrive en premier.
      json: async () => [BELLEVUE_BRANNE, BELLEVUE_SAINT_SAVIN]
    });

    const result = await geocoderAdresse("8 lotissement Bellevue, 33920");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.lat).toBe(45.1370583);
      expect(result.data.codePostal).toBe("33920");
      expect(result.data.libelle).toContain("Saint-Savin");
    }
  });

  it("refuse de deviner quand aucun candidat n'est dans le code postal saisi, et nomme les codes trouvés", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [BELLEVUE_BRANNE, BELLEVUE_SAINT_SAVIN]
    });

    const result = await geocoderAdresse("8 lotissement Bellevue, 33000");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.erreur).toContain("33000");
      // Les codes réellement trouvés doivent être nommés, sinon
      // l'utilisateur ne peut pas corriger sa saisie.
      expect(result.erreur).toContain("33420");
      expect(result.erreur).toContain("33920");
    }
  });

  it("refuse une adresse sans code postal dont les candidats s'étalent sur plusieurs communes", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [BELLEVUE_BRANNE, BELLEVUE_SAINT_SAVIN]
    });

    const result = await geocoderAdresse("8 lotissement Bellevue");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.erreur).toContain("ambiguë");
      expect(result.erreur).toContain("Branne");
      expect(result.erreur).toContain("Saint-Savin");
    }
  });

  it("accepte une adresse sans code postal quand tous les candidats sont dans la même commune", async () => {
    const memeCommune = {
      ...BELLEVUE_SAINT_SAVIN,
      lat: "45.1380",
      importance: 0.01,
      display_name: "Rue Bellevue, Saint-Savin, 33920, France"
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [BELLEVUE_SAINT_SAVIN, memeCommune]
    });

    const result = await geocoderAdresse("Rue Bellevue");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.libelle).toContain("Saint-Savin");
  });

  it("demande plusieurs candidats avec addressdetails et restreint la recherche à la France", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [BELLEVUE_SAINT_SAVIN]
    });

    await geocoderAdresse("8 lotissement Bellevue, 33920");

    const url = (global.fetch as any).mock.calls[0][0] as string;
    // limit=1 rendait le filtrage par code postal impossible : il faut voir
    // tous les homonymes pour pouvoir choisir.
    expect(url).toContain("limit=5");
    expect(url).toContain("addressdetails=1");
    expect(url).toContain("countrycodes=fr");
  });
});

describe("calculerDistanceRoute (OSRM)", () => {
  it("renvoie la distance routière en mètres", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ code: "Ok", routes: [{ distance: 15500.4 }] })
    });

    const result = await calculerDistanceRoute(
      { lat: 44, lon: -0.5, libelle: "Bordeaux", codePostal: "33000" },
      { lat: 44.1, lon: -0.6, libelle: "Mérignac", codePostal: "33700" }
    );
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
