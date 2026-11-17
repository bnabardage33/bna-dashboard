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
  installerFetch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("/api/meteo — fenêtre Open-Meteo en fuseau Europe/Paris", () => {
  it("interroge Open-Meteo en timezone=Europe/Paris sur 7 jours sans jamais appeler VisualCrossing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T23:30:00Z"));

    reponses = [
      { match: /nominatim\.openstreetmap\.org/, body: NOMINATIM },
      {
        match: /api\.open-meteo\.com/,
        body: {
          current: { temperature_2m: 12, weather_code: 1, time: "2026-01-02T00:30" },
          hourly: {
            time: Array.from({ length: 24 }, (_, h) => `2026-01-02T${String(h).padStart(2, "0")}:00`),
            temperature_2m: Array(24).fill(12),
            precipitation: Array(24).fill(0),
            wind_speed_10m: Array(24).fill(10),
            wind_gusts_10m: Array(24).fill(15),
          },
          daily: {
            time: ["2026-01-02"],
            temperature_2m_max: [14],
            temperature_2m_min: [6],
            weather_code: [1],
            precipitation_sum: [0],
            wind_speed_10m_max: [10],
            wind_gusts_10m_max: [15],
          },
        },
      },
    ];

    const { GET } = await import("@/app/api/meteo/route");
    const res = await GET(
      new Request(
        "http://localhost/api/meteo?location=" + encodeURIComponent("33000 Bordeaux"),
      ) as never,
    );
    expect(res.status).toBe(200);

    const om = appels.find((u) => u.includes("api.open-meteo.com")) ?? "";
    expect(om).toContain("timezone=Europe%2FParis");
    expect(om).toContain("forecast_days=7");
    expect(appels.some((u) => u.includes("visualcrossing.com"))).toBe(false);
  });
});
