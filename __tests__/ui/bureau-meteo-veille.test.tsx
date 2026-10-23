// __tests__/ui/bureau-meteo-veille.test.tsx
//
// VEILLE MÉTÉO INTempéries (`app/bureau/meteo/page.tsx`) — verrouils P5.
//
// Scénarios verrouillés après l'audit :
//   1. le sous-titre annonce les seuils RÉELLEMENT appliqués par la route
//      (`SEUIL_PLUIE_MM`, `SEUIL_GEL_C` partagés, et la PLAGE du barème de
//      vent matériau × accès) — plus aucun chiffre périmé recopié ;
//   2. une pluie journalière INCONNUE (`null`) s'affiche « — », jamais
//      « 0mm » (un faux signal de temps sec) ni « undefined » ;
//   3. une pluie connue s'affiche normalement.
//
// PAS de `@testing-library/react` (React 19) : harnais `createRoot` + `act`.

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SEUILS_ACCES, SEUILS_MATERIAUX } from "@/lib/meteoAlerte";
import { SEUIL_GEL_C, SEUIL_PLUIE_MM } from "@/lib/intemperiesSeuils";

// --- Fixture : réponse de /api/meteo/intemperies -----------------------------

const REPONSE = {
  jourAujourdhui: "2026-10-20",
  nbIntempries: 0,
  chantiers: [
    {
      id: "ch-1",
      nom: "Maison Dupont",
      location: "Rennes (35)",
      geocoded: true,
      erreurLocalisation: null,
      intemperieAujourdhui: false,
      intemperiesProchainesJours: false,
      emailClient: null,
      jours: [
        // Pluie INCONNUE : le route renvoie `null`, jamais 0.
        {
          date: "2026-10-20",
          pluie: null,
          vent: 12,
          tempMin: 4,
          intemperie: false,
          raisons: [],
        },
        // Pluie connue : affichée normalement.
        {
          date: "2026-10-21",
          pluie: 7.5,
          vent: 12,
          tempMin: 4,
          intemperie: false,
          raisons: [],
        },
      ],
    },
  ],
};

// --- Harnais -----------------------------------------------------------------

let conteneur: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => REPONSE })),
  );
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  conteneur.remove();
  vi.unstubAllGlobals();
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;
});

async function monter() {
  const { default: Page } = await import("@/app/bureau/meteo/page");
  await act(async () => {
    root.render(createElement(Page));
  });
}

// --- 1. Sous-titre aligné sur les seuils réels -------------------------------

describe("sous-titre — les seuils annoncés sont ceux appliqués (P5)", () => {
  it("reprend le seuil de pluie et le seuil de gel PARTAGÉS avec la route", async () => {
    await monter();
    expect(conteneur.textContent).toContain(`Pluie > ${SEUIL_PLUIE_MM} mm`);
    expect(conteneur.textContent).toContain(`Gel < ${SEUIL_GEL_C} °C`);
  });

  it("annonce la PLAGE réelle du barème de vent, dérivée des tables partagées", async () => {
    await monter();
    const seuilsM = Object.values(SEUILS_MATERIAUX).map((s) => s.vent_critique);
    const seuilsA = Object.values(SEUILS_ACCES).map((s) => s.vent_critique);
    const ventMin = Math.min(...seuilsM, ...seuilsA);
    const ventMax = Math.min(Math.max(...seuilsM), Math.max(...seuilsA));
    expect(conteneur.textContent).toContain(`${ventMin} à ${ventMax} km/h`);
  });

  it("ne garde PLUS les anciens chiffres périmés « 10mm » et « 50 km/h »", async () => {
    await monter();
    expect(conteneur.textContent).not.toContain("10mm");
    expect(conteneur.textContent).not.toContain("> 50 km/h");
  });
});

// --- 2-3. Affichage de la pluie : connue et inconnue -------------------------

describe("pluie journalière — « — » si inconnue, jamais 0mm (P5)", () => {
  it("une pluie `null` s'affiche « — », sans faux signal de temps sec", async () => {
    await monter();
    expect(conteneur.textContent).toContain("💧 —");
    expect(conteneur.textContent).not.toContain("0mm");
    expect(conteneur.textContent).not.toContain("undefined");
  });

  it("une pluie connue s'affiche avec sa valeur", async () => {
    await monter();
    expect(conteneur.textContent).toContain("💧 7.5mm");
  });
});
