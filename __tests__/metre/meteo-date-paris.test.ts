// __tests__/metre/meteo-date-paris.test.ts
//
// Non-régression du calendrier « métier » (Europe/Paris).
//
// `new Date().toISOString().slice(0, 10)` renvoie la date UTC. En hiver (UTC+1),
// entre 00:00 et 01:00 heure de Paris l'horloge UTC est encore la VEILLE : la
// fenêtre demandée à VisualCrossing commençait la veille et la journée du jour
// n'était pas demandée. Les tests ci-dessous se placent à cet instant précis.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { dateParis, dateParisDans } from "@/lib/dateParis";

// La route appelle `verifierSession()` (cookies `next/headers`) : hors requête
// elle répondrait 401 avant d'atteindre la météo. On neutralise ce garde — sa
// sécurité est testée ailleurs — et la résolution d'adresse, pour observer
// uniquement la fenêtre de dates envoyée à VisualCrossing.
vi.mock("@/lib/auth", () => ({
  verifierSession: async () => ({ authentifie: true }),
}));

vi.mock("@/lib/meteoLocalisation", () => ({
  resoudreLocalisationMeteo: async () => ({
    ok: true,
    data: {
      lat: 44.84,
      lon: -0.58,
      libelle: "Bordeaux, 33000",
      codePostal: "33000",
    },
  }),
}));

// ─── Le calendrier lui-même ──────────────────────────────────────────────────

describe("dateParis — calendrier Europe/Paris", () => {
  it("à 00:30 heure de Paris, c'est DÉJÀ le lendemain (et non la veille UTC)", () => {
    // 23:30Z le 1er janvier = 00:30 le 2 janvier à Paris (UTC+1).
    expect(dateParis(new Date("2026-01-01T23:30:00Z"))).toBe("2026-01-02");
    // 22:30Z le 1er janvier = 23:30 le 1er janvier à Paris : même journée.
    expect(dateParis(new Date("2026-01-01T22:30:00Z"))).toBe("2026-01-01");
  });

  it("été (UTC+2) : 22:30Z le 1er juillet = 00:30 le 2 juillet à Paris", () => {
    expect(dateParis(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
    // 21:30Z = 23:30 à Paris : encore le 1er.
    expect(dateParis(new Date("2026-07-01T21:30:00Z"))).toBe("2026-07-01");
  });

  it("dateParisDans décale de jours PLEINS avant de formater", () => {
    const base = new Date("2026-01-01T23:30:00Z"); // 2 janvier à Paris
    expect(dateParisDans(0, base)).toBe("2026-01-02");
    expect(dateParisDans(4, base)).toBe("2026-01-06");
    expect(dateParisDans(-1, base)).toBe("2026-01-01");
  });
});

// ─── Route /api/meteo : la fenêtre demandée est parisienne ───────────────────

type Reponse = { match: RegExp; status?: number; body: unknown };

let reponses: Reponse[] = [];
let appels: string[] = [];

const NOMINATIM = {
  lat: "44.84",
  lon: "-0.58",
  display_name: "Bordeaux, Gironde, France",
  address: { postcode: "33000", city: "Bordeaux" },
};

const VC_OK = {
  days: [
    {
      datetime: "2026-01-02",
      tempmax: 12,
      tempmin: 4,
      temp: 8,
      windspeed: 10,
      windgust: 20,
      precip: 0,
      icon: "partly-cloudy-day",
      conditions: "Partiellement nuageux",
      hours: [
        { datetime: "12:00", temp: 8, windspeed: 10, windgust: 20, precip: 0 },
      ],
    },
  ],
  currentConditions: { temp: 8, icon: "partly-cloudy-day" },
};

function installerFetch() {
  vi.stubGlobal("fetch", async (entree: unknown) => {
    const url = String(entree);
    appels.push(url);
    for (const r of reponses) {
      if (r.match.test(url)) {
        return {
          ok: (r.status ?? 200) < 400,
          status: r.status ?? 200,
          json: async () => r.body,
          text: async () => JSON.stringify(r.body),
        };
      }
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "not found",
    };
  });
}

beforeEach(() => {
  appels = [];
  reponses = [];
  process.env.VISUALCROSSING_API_KEY = "cle-de-test";
  installerFetch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("/api/meteo — fenêtre VisualCrossing en date parisienne", () => {
  it("à 00:30 heure de Paris, la fenêtre commence AUJOURD'HUI, pas la veille UTC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T23:30:00Z"));

    reponses = [
      { match: /nominatim\.openstreetmap\.org/, body: NOMINATIM },
      { match: /visualcrossing\.com/, body: VC_OK },
    ];

    const { GET } = await import("@/app/api/meteo/route");
    const res = await GET(
      new Request(
        "http://localhost/api/meteo?location=" + encodeURIComponent("33000 Bordeaux"),
      ) as never,
    );
    expect(res.status).toBe(200);

    const vc = appels.find((u) => u.includes("visualcrossing.com")) ?? "";
    // 2 janvier → 6 janvier en calendrier parisien.
    expect(vc).toContain("/2026-01-02/2026-01-06");
    // La veille UTC ne doit jamais servir de borne de départ.
    expect(vc).not.toContain("/2026-01-01/");
  });
});
