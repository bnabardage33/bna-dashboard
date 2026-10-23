// __tests__/metre/chaine-meteo-bout-en-bout.test.tsx
//
// CHAÎNE MÉTÉO COMPLÈTE — SIMULÉE, SANS RÉSEAU NI SUPABASE RÉEL.
//
// Ce test relie, dans un seul scénario, les maillons vérifiés séparément
// ailleurs :
//   1. résolution d'un chantier (Supabase simulé) ;
//   2. météo « fournisseur » (Visual Crossing simulé, `fetch` bouchonné) ;
//   3. vigilance officielle Météo-France (route interne `/api/meteo-vigilance`
//      simulée) ;
//   4. génération du rapport (route réelle `/api/rapports-intemperies/generer`) ;
//   5. affichage PDF (composant réel) ;
//   6. résumé hebdomadaire (agrégation réelle).
//
// Invariant central : la vigilance OFFICIELLE et le RISQUE TECHNIQUE restent
// DEUX informations distinctes, et une vigilance non lisible vaut « indisponible »
// — jamais un « vert » inventé.
//
// LIMITE ASSUMÉE : tout est simulé. Ce test prouve l'ENCHAÎNEMENT du code, pas
// la justesse des données météo d'un jour réel.

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, type ReactElement } from "react";

// `next/image` n'a pas d'implémentation utile sous jsdom.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src?: unknown;
    alt?: string;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === "string" ? src : ""}
      alt={alt ?? ""}
      className={className}
    />
  ),
}));

// ─── Supabase simulé (session + service_role) ────────────────────────────────

const h = vi.hoisted(() => {
  const ENTREPRISE = "11111111-1111-4111-8111-111111111111";

  const etat: {
    chantier: Record<string, unknown>;
    insertRapport: Record<string, unknown> | null;
  } = {
    chantier: {
      id: "22222222-2222-4222-8222-222222222222",
      entreprise_id: ENTREPRISE,
      nom: "Chantier Test",
      adresse_chantier: "1 Rue Test, 33000 Bordeaux",
      materiau_structurel: "metal",
      moyen_acces: "echafaudage",
      zone_vent: null,
      statut: "en_cours",
    },
    insertRapport: null,
  };

  function creerChaine(table: string) {
    const chaine: Record<string, unknown> = {};

    const resultatSelect =
      table === "chantiers"
        ? { data: [etat.chantier], error: null }
        : { data: null, error: null };

    const resultatInsert = {
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        entreprise_id: etat.chantier.entreprise_id,
        chantier_id: etat.chantier.id,
      },
      error: null,
    };

    const retour = () => chaine;
    for (const m of ["select", "eq", "neq", "gte", "lt", "order", "limit", "update"]) {
      chaine[m] = retour;
    }
    chaine.insert = (donnees: Record<string, unknown>) => {
      etat.insertRapport = donnees;
      return chaine;
    };
    chaine.maybeSingle = async () => resultatSelect;
    chaine.single = async () => resultatInsert;
    // Chaîne « thenable » : le route handler attend la requête des chantiers
    // sans `.single()` / `.maybeSingle()`.
    chaine.then = (resolve: (v: unknown) => unknown) => resolve(resultatSelect);
    return chaine;
  }

  return { ENTREPRISE, etat, creerChaine };
});

vi.mock("@/lib/auth", () => ({
  verifierSession: async () => ({ authentifie: true }),
}));

vi.mock("@/lib/meteoLocalisation", () => ({
  resoudreLocalisationMeteo: async () => ({
    ok: true,
    data: {
      lat: 44.8,
      lon: -0.5,
      libelle: "Bordeaux, 33000",
      codePostal: "33000",
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { app_metadata: { entreprise_id: h.ENTREPRISE } } },
        error: null,
      }),
    },
    from: (table: string) => h.creerChaine(table),
  }),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    rpc: async () => ({ data: "RI-2026-0001", error: null }),
  },
}));

// ─── Réponses « fournisseurs » simulées ──────────────────────────────────────

// 36 °C avec un matériau « metal » (temp_maxi 35 °C) → risque technique ORANGE.
// Rafales sous les seuils et pluie nulle : le seul signal est thermique.
const VC_CHAUD = {
  days: [
    {
      datetime: "2026-01-02",
      tempmax: 36,
      tempmin: 20,
      temp: 36,
      windspeed: 10,
      windgust: 20,
      precip: 0,
      hours: [
        { datetime: "12:00", temp: 36, windspeed: 10, windgust: 20, precip: 0 },
        { datetime: "13:00", temp: 30, windspeed: 8, windgust: 15, precip: 0 },
      ],
    },
  ],
  currentConditions: { temp: 36 },
};

const VIGILANCE_VERTE = {
  departement: "33",
  couleurMax: "vert",
  phenomenes: [],
  misAJourLe: "2026-01-02T08:00:00Z",
};

let vigilanceReponse: { status: number; body: unknown };

function installerFetch() {
  vi.stubGlobal("fetch", async (entree: unknown) => {
    const url = String(entree);
    if (url.includes("/api/meteo-vigilance")) {
      return {
        ok: vigilanceReponse.status < 400,
        status: vigilanceReponse.status,
        json: async () => vigilanceReponse.body,
        text: async () => JSON.stringify(vigilanceReponse.body),
      };
    }
    if (url.includes("visualcrossing.com")) {
      return {
        ok: true,
        status: 200,
        json: async () => VC_CHAUD,
        text: async () => JSON.stringify(VC_CHAUD),
      };
    }
    // Aucun autre appel réseau n'est attendu : on n'échoue pas brutalement,
    // on renvoie un 404 (comme le harnais du test de génération existant).
    return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
  });
}

async function generer(): Promise<Record<string, unknown>> {
  const { POST } = await import("@/app/api/rapports-intemperies/generer/route");
  const res = await POST(
    new Request("http://localhost/api/rapports-intemperies/generer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }) as never,
  );
  return (await res.json()) as Record<string, unknown>;
}

// ─── Harnais de rendu (React 19 : createRoot + act, sans RTL) ────────────────

const racines: Root[] = [];
const conteneurs: HTMLElement[] = [];
const ENV = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };

async function rendre(element: ReactElement): Promise<HTMLElement> {
  const conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  let racine!: Root;
  act(() => {
    racine = createRoot(conteneur);
  });
  await act(async () => {
    racine.render(element);
  });
  racines.push(racine);
  conteneurs.push(conteneur);
  return conteneur;
}

beforeAll(() => {
  ENV.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete ENV.IS_REACT_ACT_ENVIRONMENT;
});

// ─── Adaptateurs : ligne écrite -> composants d'affichage ────────────────────

import RapportIntemperiesPDF, {
  type RapportIntemperiesData,
} from "@/components/RapportIntemperiesPDF";
import type { Entreprise } from "@/types/entreprise";
import { agregerIntemperiesSemaine } from "@/lib/intemperiesSemaine";
import { dateParis } from "@/lib/dateParis";

const ENTREPRISE: Entreprise = {
  raison_sociale: "BNA",
  siret: "12345678900011",
  telephone: "0556000000",
  email: "contact@bna.fr",
  adresse: "1 rue du Test",
  code_postal: "33000",
  ville: "Bordeaux",
  assurance: "AXA",
  iban: "FR7612345678901234567890123",
  bic: "AGRIFRPP",
  mentions_legales: null,
  logo_url: null,
};

const CHANTIER = {
  nom: "Chantier Test",
  adresse: "1 Rue Test",
  code_postal: "33000",
  ville: "Bordeaux",
};

function versRapportPDF(
  ligne: Record<string, unknown>,
  creeLe: string,
): RapportIntemperiesData {
  return {
    numero: String(ligne.numero),
    cree_le: creeLe,
    cree_par: ligne.cree_par === "manuel" ? "manuel" : "auto",
    vigilance_officielle: ligne.vigilance_officielle as RapportIntemperiesData["vigilance_officielle"],
    jour_arrete: ligne.jour_arrete as boolean,
    a_valider: ligne.a_valider as boolean,
    pluie_continue: ligne.pluie_continue as boolean,
    motif: String(ligne.motif),
    risque_technique_niveau: (ligne.risque_technique_niveau as string) ?? null,
    risque_technique_motif: (ligne.risque_technique_motif as string) ?? null,
    temp_max: (ligne.temp_max as number) ?? null,
    rafales_max: (ligne.rafales_max as number) ?? null,
    pluie_cumul: (ligne.pluie_cumul as number) ?? null,
    materiau: (ligne.materiau as string) ?? null,
    acces: (ligne.acces as string) ?? null,
    departement: (ligne.departement as string) ?? null,
    mesures_prises: null,
    heures: ligne.releve_horaire as RapportIntemperiesData["heures"],
  };
}

// ─── Cycle de vie ────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.VISUALCROSSING_API_KEY = "cle-de-test";
  h.etat.insertRapport = null;
  vigilanceReponse = { status: 200, body: VIGILANCE_VERTE };
  installerFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  while (racines.length) {
    const r = racines.pop() as Root;
    act(() => r.unmount());
  }
  while (conteneurs.length) conteneurs.pop()?.remove();
});

// ─── Scénarios ───────────────────────────────────────────────────────────────

describe("chaîne météo bout en bout (simulée)", () => {
  it("chantier → météo → vigilance verte → génération → PDF → résumé restent cohérents", async () => {
    const json = await generer();

    // 1. La génération a bien abouti.
    expect(json.success).toBe(true);
    const ligne = h.etat.insertRapport as Record<string, unknown>;
    expect(ligne).not.toBeNull();

    // 2. Sa vigilance officielle est VERTE et son risque technique ORANGE,
    //    conservés séparément (aucune promotion de l'une par l'autre).
    expect(ligne.vigilance_officielle).toBe("vert");
    expect(ligne.risque_technique_niveau).toBe("orange");

    // 3. Le document restitue les deux niveaux distinctement.
    const conteneur = await rendre(
      <RapportIntemperiesPDF
        rapport={versRapportPDF(ligne, "2026-01-02T10:00:00Z")}
        entreprise={ENTREPRISE}
        chantier={CHANTIER}
      />,
    );
    const texte = conteneur.textContent ?? "";
    expect(texte).toContain("Pas de vigilance"); // officielle verte
    expect(texte).toContain("Dépassement important mesuré"); // risque technique
    expect(texte).not.toContain("Vigilance orange"); // pas de promotion

    // 4. Le résumé hebdomadaire relit la même valeur sans inventer de couleur.
    const jour = dateParis(new Date());
    const resume = agregerIntemperiesSemaine(
      [
        {
          cree_le: `${jour}T09:00:00Z`,
          jour_arrete: ligne.jour_arrete as boolean,
          motif: String(ligne.motif),
          vigilance_officielle: String(ligne.vigilance_officielle),
        },
      ],
      jour,
      jour,
    );
    expect(resume.vigilanceMax).toBe("vert");
  });

  it("vigilance indisponible : l'état reste explicite jusqu'au PDF et au résumé", async () => {
    vigilanceReponse = { status: 503, body: { error: "panne" } };

    const json = await generer();
    expect(json.success).toBe(true);

    const ligne = h.etat.insertRapport as Record<string, unknown>;
    expect(ligne.vigilance_officielle).toBe("indisponible");
    // Le risque technique, lui, reste mesuré.
    expect(ligne.risque_technique_niveau).toBe("orange");

    const conteneur = await rendre(
      <RapportIntemperiesPDF
        rapport={versRapportPDF(ligne, "2026-01-02T10:00:00Z")}
        entreprise={ENTREPRISE}
        chantier={CHANTIER}
      />,
    );
    const texte = conteneur.textContent ?? "";
    expect(texte).toContain("Vigilance officielle indisponible");
    expect(texte).toContain("Dépassement important mesuré");

    const jour = dateParis(new Date());
    const resume = agregerIntemperiesSemaine(
      [
        {
          cree_le: `${jour}T09:00:00Z`,
          jour_arrete: ligne.jour_arrete as boolean,
          motif: String(ligne.motif),
          vigilance_officielle: String(ligne.vigilance_officielle),
        },
      ],
      jour,
      jour,
    );
    expect(resume.vigilanceMax).toBe("indisponible");
  });
});
