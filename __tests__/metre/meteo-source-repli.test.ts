// O3-B9 — Météo de l'accueil : la source était unique, et absente en local
// ============================================================================
//
// VISUALCROSSING N'EST PAS MORTE. C'est la source primaire du projet, et sa
// clé `VISUALCROSSING_API_KEY` est volontairement stockée dans les variables
// d'environnement Vercel, sans être versionnée. Sur Vercel elle répond.
//
// DÉFAUT PROUVÉ, et sa portée exacte — mesuré sur le poste de développement :
//
//   $ curl "https://weather.visualcrossing.com/…?key=$VISUALCROSSING_API_KEY"
//   HTTP 401
//   No account found with provided API key
//
// Ce 401 établit une seule chose : la clé réelle n'est pas présente EN LOCAL, où
// `.env.local` porte le placeholder `ta_cle_ici` de `.env.example`. Il ne dit
// rien de la production, et ces tests ne prétendent pas le contraire.
//
// Le défaut réel, lui, est commun aux deux environnements : `GET /api/meteo`
// n'interrogeait QUE cette source, sans aucune alternative. Hors Vercel :
// 401 -> la route répondait 502 -> `fetchMeteo` levait -> `ChantiersMeteoCards`
// absorbait l'échec dans un `catch` muet -> « Météo indisponible pour cette
// adresse » sur TOUS les chantiers, alors que la logique métier
// (lib/meteoAlerte.ts) était intacte. Le bloc météo n'était donc ni
// développable ni testable hors production.
//
// Le projet possède pourtant une seconde source, gratuite et DÉJÀ en service :
// Open-Meteo, utilisée par `/api/meteo/intemperies` et par l'Edge Function
// `generer-rapports-intemperies`. L'accueil ne l'interrogeait pas.
//
// Ces tests verrouillent le comportement attendu, séparément :
//   A. le lieu est validé (code postal) AVANT tout appel fournisseur, puis
//      VisualCrossing est tentée et prime quand elle répond ; le repli ne
//      prend le relais que sur échec, et coûte alors zéro appel inutile ;
//   B. le repli traduit Open-Meteo sans jamais inventer de chiffre.
//
// Les deux fournisseurs reçoivent les MÊMES coordonnées validées, jamais
// l'adresse en texte : aucun ne peut donc retenir une autre commune.
//
// Aucun appel réseau n'est effectué : `globalThis.fetch` est intercepté. Les
// réponses sont des FIXTURES recopiées d'une réponse Open-Meteo réelle
// (latitude 44.84, longitude -0.58, 4 jours, relevés horaires du jour).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { viderCacheLocalisation } from "@/lib/meteoLocalisation";

// La route appelle `verifierSession()`, qui lit les cookies via `next/headers`.
// Hors d'une requête, `cookies()` lève : la session serait jugée invalide et la
// route répondrait 401 AVANT d'atteindre la météo — on ne testerait alors que le
// garde d'authentification, pas le repli. On neutralise donc CE garde, et lui
// seul : la sécurité de la route n'est ni modifiée ni affaiblie, elle est
// simplement hors sujet ici. Son comportement est couvert par ailleurs.
vi.mock("@/lib/auth", () => ({
  verifierSession: async () => ({ authentifie: true }),
}));

// ─── Captures d'appel ────────────────────────────────────────────────────────

type Appel = { url: string };

let appels: Appel[] = [];

/** Réponses injectées par URL, consommées dans l'ordre des motifs. */
type Reponses = Array<{ match: RegExp; status?: number; body: unknown }>;

let reponses: Reponses = [];

function installerFetch() {
  vi.stubGlobal("fetch", async (entree: unknown) => {
    const url = String(entree);
    appels.push({ url });
    for (const r of reponses) {
      if (r.match.test(url)) {
        return {
          ok: (r.status ?? 200) < 400,
          status: r.status ?? 200,
          json: async () => r.body,
        };
      }
    }
    // Toute destination non prévue est un échec franc, jamais un `{}` silencieux
    // qui ferait croire à une météo vide mais réelle.
    return { ok: false, status: 599, json: async () => ({}) };
  });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Body Nominatim : un seul candidat, code postal concordant. */
const NOMINATIM = [
  {
    lat: "44.8400000",
    lon: "-0.5800000",
    display_name: "8 Lotissement Bellevue, 33920 Saint-Savin",
    address: { postcode: "33920", city: "Saint-Savin" },
  },
];

/**
 * Open-Meteo en forme `hourly` + `daily`. Reproduit la structure réelle du
 * service, y compris le fait que `current` ne porte QUE la température et le
 * code météo — d'où l'obligation de reconstruire le jour depuis `hourly`.
 */
const OPEN_METEO = {
  current: { temperature_2m: 20.5, weather_code: 3 },
  hourly: {
    // 24 relevés du jour courant : la route découpe la journée en
    // 6h-13h et 13h-19h, il en faut assez pour que les deux fenêtres soient
    // réellement peuplées.
    time: [
      "2026-10-01T00:00", "2026-10-01T06:00", "2026-10-01T07:00",
      "2026-10-01T12:00", "2026-10-01T13:00", "2026-10-01T15:00",
      "2026-10-01T18:00", "2026-10-01T23:00",
      "2026-10-02T00:00", "2026-10-03T00:00", "2026-10-04T00:00",
    ],
    temperature_2m: [16.2, 17.0, 19.0, 20.5, 20.9, 20.4, 19.5, 17.2, 13.1, 17.1, 16.8],
    precipitation: [0.7, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.1],
    wind_speed_10m: [10.8, 9, 8, 10, 11, 9, 8, 7, 10.2, 6.6, 11.7],
    wind_gusts_10m: [27, 22, 20, 25, 26, 24, 21, 19, 18, 13.3, 22],
  },
  daily: {
    time: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
    temperature_2m_max: [20.9, 23.9, 22.6, 21.7],
    temperature_2m_min: [15.4, 13.1, 17.1, 16.8],
    weather_code: [0, 3, 80, 3],
    precipitation_sum: [0.7, 0, 0.78, 0.1],
    wind_speed_10m_max: [12, 10.2, 6.6, 11.7],
    wind_gusts_10m_max: [27, 18, 13.3, 22],
  },
};

const VC_OK = {
  days: [
    {
      datetime: "2026-10-01",
      tempmax: 22,
      tempmin: 12,
      temp: 19,
      windspeed: 8,
      windgust: 20,
      precip: 0,
      icon: "partly-cloudy-day",
      conditions: "Partiellement nuageux",
      hours: [{ datetime: "07:00", temp: 19, windspeed: 8, windgust: 20, precip: 0 }],
    },
  ],
  currentConditions: { temp: 19, icon: "partly-cloudy-day" },
};

const ADRESSE = "8 lotissement Bellevue, 33920 Saint-Savin";

// ─── Harnais ─────────────────────────────────────────────────────────────────

/**
 * Clé VisualCrossing de test.
 *
 * Le poste n'a pas de `.env.local` chargé par Vitest : sans cette variable, la
 * route court-circuite VisualCrossing dès `essayerVisualCrossing` et n'essaie
 * jamais le fournisseur. Les tests qui vérifient l'ORDRE des sources et la
 * conservation de VisualCrossing measuringaient donc un chemin qui n'existait
 * pas. On fixe donc une clé non vide, et on la restaure.
 */
const CLE_VC = "cle-de-test-visuallycrossing";

beforeEach(() => {
  appels = [];
  reponses = [];
  // Le cache de résolution vit dans un module singleton : sans ce vidage, une
  // adresse déjà résolue par un test précédent ne rappellerait pas Nominatim et
  // fausserait l'observation de l'ordre des appels.
  viderCacheLocalisation();
  process.env.VISUALCROSSING_API_KEY = CLE_VC;
  installerFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (process.env.VISUALCROSSING_API_KEY === CLE_VC) {
    delete process.env.VISUALCROSSING_API_KEY;
  }
});

/**
 * Route `/api/meteo` avec VisualCrossing rendu inopérant.
 *
 * `surchargeOpenMeteo` REMPLACE la réponse Open-Meteo. On ne peut pas se
 * contenter d'ajouter une entrée : `installerFetch` renvoie le PREMIER motif
 * qui correspond, donc une entrée ajoutée plus bas serait ignorée — et le test
 * passerait sans jamais avoir simulé la panne.
 */
async function getAvecRepli(surchargeOpenMeteo?: { status?: number; body: unknown }) {
  reponses = [
    { match: /visualcrossing\.com/, status: 401, body: { error: "No account found" } },
    { match: /nominatim\.openstreetmap\.org/, body: NOMINATIM },
    surchargeOpenMeteo
      ? { match: /api\.open-meteo\.com/, ...surchargeOpenMeteo }
      : { match: /api\.open-meteo\.com/, body: OPEN_METEO },
  ];
  const { GET } = await import("@/app/api/meteo/route");
  const res = await GET(
    new Request("http://localhost/api/meteo?location=" + encodeURIComponent(ADRESSE)) as never,
  );
  return { res, json: (await res.json()) as Record<string, unknown> };
}

// ════════════════════════════════════════════════════════════════════════════
// A. La route doit survivre à l'échec de VisualCrossing
// ════════════════════════════════════════════════════════════════════════════

describe("api/meteo — le repli Open-Meteo est utilisé quand VisualCrossing échoue", () => {
  it("VisualCrossing 401 → la route répond 200 avec une vraie prévision", async () => {
    const { res, json } = await getAvecRepli();

    expect(res.status).toBe(200);
    // Le point central du correctif : hors Vercel, VisualCrossing échoue, et la
    // route rendait 502 — donc 502 sur toute la météo de l'accueil en local.
    expect(json.error).toBeUndefined();
    expect(json.source).toBe("open-meteo");
    expect(json.tempActuelle).toBe(21); // 20.5 arrondi par la route
  });

  it("Open-Meteo est réellement interrogé (le repli n'est pas un court-circuit)", async () => {
    await getAvecRepli();
    expect(appels.some((a) => a.url.includes("api.open-meteo.com"))).toBe(true);
  });

  it("valide d'abord le lieu, puis tente VisualCrossing avant Open-Meteo", async () => {
    await getAvecRepli();
    const iNom = appels.findIndex((a) => a.url.includes("nominatim"));
    const iVc = appels.findIndex((a) => a.url.includes("visualcrossing.com"));
    const iOm = appels.findIndex((a) => a.url.includes("api.open-meteo.com"));
    expect(iNom).toBeGreaterThanOrEqual(0);
    expect(iVc).toBeGreaterThan(iNom);
    expect(iOm).toBeGreaterThan(iVc);
  });

  it("les deux fournisseurs reçoivent les MÊMES coordonnées validées, jamais l'adresse", async () => {
    await getAvecRepli();
    const vc = appels.find((a) => a.url.includes("visualcrossing.com"))?.url ?? "";
    const om = appels.find((a) => a.url.includes("api.open-meteo.com"))?.url ?? "";

    // Coordonnées issues du code postal (fixture Nominatim : 44.84, -0.58).
    expect(vc).toContain("44.84,-0.58");
    expect(om).toContain("latitude=44.84");
    expect(om).toContain("longitude=-0.58");

    // VisualCrossing ne reçoit plus l'adresse : il ne peut donc plus retenir
    // une autre commune de sa propre initiative.
    expect(decodeURIComponent(vc)).not.toContain("Bellevue");
    expect(decodeURIComponent(vc)).not.toContain("Saint-Savin");
  });

  it("VisualCrossing qui RÉPOND est conservé, et le repli n'est pas appelé", async () => {
    reponses = [
      { match: /visualcrossing\.com/, body: VC_OK },
      { match: /nominatim\.openstreetmap\.org/, body: NOMINATIM },
      { match: /api\.open-meteo\.com/, body: OPEN_METEO },
    ];
    const { GET } = await import("@/app/api/meteo/route");
    const res = await GET(
      new Request("http://localhost/api/meteo?location=" + encodeURIComponent(ADRESSE)) as never,
    );
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.source).toBe("visualcrossing");
    // Sans cela, on payerait un appel gratuit inutile à chaque chantier.
    expect(appels.some((a) => a.url.includes("api.open-meteo.com"))).toBe(false);
  });

  it("clé VisualCrossing ABSENTE → repli, sans erreur 500", async () => {
    const cle = process.env.VISUALCROSSING_API_KEY;
    delete process.env.VISUALCROSSING_API_KEY;
    try {
      reponses = [
        { match: /nominatim\.openstreetmap\.org/, body: NOMINATIM },
        { match: /api\.open-meteo\.com/, body: OPEN_METEO },
      ];
      const { GET } = await import("@/app/api/meteo/route");
      const res = await GET(
        new Request("http://localhost/api/meteo?location=" + encodeURIComponent(ADRESSE)) as never,
      );
      const json = (await res.json()) as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(json.source).toBe("open-meteo");
    } finally {
      if (cle !== undefined) process.env.VISUALCROSSING_API_KEY = cle;
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B. Le repli traduit la réponse SANS rien inventer
// ════════════════════════════════════════════════════════════════════════════

describe("lib/meteoOpenMeteo — traduction fidèle, aucun chiffre fabriqué", () => {
  it("J+1 à J+3 portent LEURS propres agrégats, pas ceux d'aujourd'hui", async () => {
    const { json } = await getAvecRepli();
    const jours = json.prochainsJours as Array<Record<string, number>>;

    // Régression du faux chiffre le plus vicieux : l'implémentation naïve
    // recyclait le tempmax d'aujourd'hui pour les jours suivants, et
    // l'accueil aurait affiché « 21 °C demain » trois fois de suite.
    expect(jours).toHaveLength(3);
    expect(jours[0].tempMax).toBe(24);
    expect(jours[0].tempMin).toBe(13);
    expect(jours[1].tempMax).toBe(23);
    expect(jours[1].tempMin).toBe(17);
    expect(jours[2].tempMax).toBe(22);
    expect(jours[2].tempMin).toBe(17);
  });

  it("les conditions de chaque jour suivent son propre code WMO", async () => {
    const { json } = await getAvecRepli();
    const jours = json.prochainsJours as Array<Record<string, string>>;
    // 3 = Couvert, 80 = averses de pluie. Si le code du jour courant (0,
    // « Ensoleillé ») était réutilisé, les trois jours afficheraient « Ensoleillé ».
    expect(jours.map((j) => j.conditions)).toEqual([
      "Couvert",
      "Averses de pluie légères",
      "Couvert",
    ]);
  });

  it("le cumul de pluie du jour vient des relevés horaires", async () => {
    const { json } = await getAvecRepli();
    // 0.7 + 0 = 0.7 mm, pas 0 : un cumul forcé à 0 se lirait « ciel dégagé ».
    expect(json.cumulPluie).toBe(0.7);
  });

  it("J+1 à J+3 portent leur cumul JOURNALIER de pluie, jamais une re-somme", async () => {
    const { json } = await getAvecRepli();
    const jours = json.prochainsJours as Array<Record<string, number>>;
    // `precipitation_sum` est DÉJÀ un cumul de journée : [0.7, 0, 0.78, 0.1]
    // pour J, J+1, J+2, J+3. On recopie donc 0, 0.8 (0.78 arrondi à 0,1 mm,
    // comme le reste de la route) et 0.1 — et surtout PAS 0.7 (aujourd'hui) ni
    // une somme des relevés horaires.
    expect(jours[0].cumulPluie).toBe(0);
    expect(jours[1].cumulPluie).toBe(0.8);
    expect(jours[2].cumulPluie).toBe(0.1);
    expect(jours.map((j) => j.cumulPluie)).not.toContain(0.7);
  });

  it("matin et après-midi sont découpés sur les heures du jour", async () => {
    const { json } = await getAvecRepli();
    const matin = json.matin as Record<string, number>;
    const apres = json.apresMidi as Record<string, number>;

    // Fenêtres 6h-13h et 13h-19h. Une fenêtre qui mordrait sur la nuit
    // décalerait le risque sur la mauvaise période de travail.
    // matin      : 06(17.0) 07(19.0) 12(20.5) -> moyenne 18.8 -> 19 ; rafale 25
    // après-midi : 13(20.9) 15(20.4) 18(19.5) -> moyenne 20.3 -> 20 ; rafale 26
    expect(matin.temp).toBe(19);
    expect(matin.rafales).toBe(25);
    expect(apres.temp).toBe(20);
    expect(apres.rafales).toBe(26);
  });

  it("un jour SANS agrégat `daily` est OMIS, pas rempli avec le maxi d'aujourd'hui", async () => {
    const { json } = await getAvecRepli({ body: { ...OPEN_METEO, daily: undefined } });
    // La régression la plus vicieuse : recycler le tempmax du jour sur J+1..J+3
    // afficherait « 21 °C demain » trois fois de suite. Aucune agrégat, aucune
    // journée annoncée.
    expect(json.prochainsJours).toEqual([]);
  });

  it("SANS `daily`, le jour courant retombe sur SES relevés horaires", async () => {
    const { json } = await getAvecRepli({ body: { ...OPEN_METEO, daily: undefined } });
    // Repli légitime : min/max déduits des relevés du jour (15.4 absent du
    // fixture horaire, on vérifie le max issu de 20.9 a round-trip par le
    // chemin horaire -> 20.9 arrondi à 21).
    expect(json.tempMaxJour).toBe(21);
    expect(json.tempMinJour).toBe(16);
  });
});

describe("lib/meteoOpenMeteo — échec franc plutôt que zéros", () => {
  it("Open-Meteo en erreur → la route répond 502 et ne renvoie AUCUNE météo", async () => {
    const { res, json } = await getAvecRepli({ status: 503, body: { error: true } });
    // L'état vide doit être explicite : renvoyer `matin: {temp: 0, rafales: 0}`
    // ferait afficher « 0 km/h » sur la carte, c'est-à-dire une météo INVENTÉE.
    expect(res.status).toBe(502);
    expect(json.tempActuelle).toBeUndefined();
    expect(json.cumulPluie).toBeUndefined();
  });

  it("géocodage impossible → 422 (lieu non validé), aucun fournisseur appelé", async () => {
    reponses = [
      { match: /nominatim\.openstreetmap\.org/, body: [] },
      { match: /visualcrossing\.com/, status: 401, body: {} },
      { match: /api\.open-meteo\.com/, body: OPEN_METEO },
    ];
    const { GET } = await import("@/app/api/meteo/route");
    const res = await GET(
      new Request("http://localhost/api/meteo?location=" + encodeURIComponent(ADRESSE)) as never,
    );
    const json = (await res.json()) as Record<string, unknown>;
    // Refus explicite : on n'affiche pas la météo d'un lieu choisi par défaut.
    expect(res.status).toBe(422);
    expect(json.localisation).toBe(false);
    expect(json.tempActuelle).toBeUndefined();
    // Et on n'a même pas interrogé un fournisseur sur une adresse non validée.
    expect(appels.some((a) => a.url.includes("visualcrossing.com"))).toBe(false);
    expect(appels.some((a) => a.url.includes("api.open-meteo.com"))).toBe(false);
  });

  it("code postal incompatible → 422, la commune n'est pas choisie au hasard", async () => {
    reponses = [
      {
        match: /nominatim\.openstreetmap\.org/,
        body: [
          {
            lat: "44.0000000",
            lon: "-0.5000000",
            display_name: "Hameau des Tilleuls, Ailleurs, 44100, France",
            address: { postcode: "44100", city: "Ailleurs" },
          },
        ],
      },
    ];
    const { GET } = await import("@/app/api/meteo/route");
    const res = await GET(
      new Request("http://localhost/api/meteo?location=" + encodeURIComponent(ADRESSE)) as never,
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(422);
    expect(json.localisation).toBe(false);
    expect(String(json.error)).toContain("33920");
    expect(appels.some((a) => a.url.includes("visualcrossing.com"))).toBe(false);
    expect(appels.some((a) => a.url.includes("api.open-meteo.com"))).toBe(false);
  });

  it("adresse vide → `null` sans appel réseau", async () => {
    const { fetchDonneesOpenMeteo } = await import("@/lib/meteoOpenMeteo");
    expect(await fetchDonneesOpenMeteo("   ")).toBeNull();
    expect(appels).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// C. Table WMO : données de présentation, jamais de décision
// ════════════════════════════════════════════════════════════════════════════

describe("lib/meteoOpenMeteo — table WMO", () => {
  it("couvre les codes usuels et ne renvoie jamais undefined", async () => {
    const { libelleConditionsWmo, emojiWmo } = await import("@/lib/meteoOpenMeteo");
    expect(libelleConditionsWmo(0)).toBe("Ensoleillé");
    expect(libelleConditionsWmo(61)).toBe("Pluie légère");
    expect(libelleConditionsWmo(95)).toBe("Orage");
    // Un code hors table, un `null` et un `NaN` : trois cas qui ne doivent
    // produire ni `undefined` (affiché « undefined » à l'écran) ni un crash.
    for (const c of [999, null, undefined, Number.NaN]) {
      expect(libelleConditionsWmo(c as number)).toBe("Nuageux");
      expect(emojiWmo(c as number)).toBe("☁️");
    }
  });
});
