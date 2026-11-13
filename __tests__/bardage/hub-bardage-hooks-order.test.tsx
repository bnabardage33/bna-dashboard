// __tests__/bardage/hub-bardage-hooks-order.test.tsx
//
// Tests de non-régression et de robustesse pour l'ordre des Hooks React dans HubBardageContenu (page.tsx) :
// 1. Premier chargement du Hub Bardage (état initial loading = true).
// 2. Chargement des données du chantier après le premier rendu (transition loading: true -> false).
// 3. Navigation entre les huit modules du Hub Bardage.
// 4. Ouverture du module Calepinage avec transmission de configTechniqueInitiale.
// 5. Modification des dimensions et synchronisation des surfaces sans boucle infinie.
// 6. Navigation aller-retour vers un autre module puis réouverture du Calepinage.
// 7. Montage et transitions sous React StrictMode (double-invocation sans violation de hooks).
// 8. Analyse structurelle garantissant l'absence totale de hooks après un return conditionnel.

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import React, { StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import fs from "fs";
import path from "path";

// Navigation state mockée
let currentModuleParam: string | null = null;
const routerPushMock = vi.fn((url: string) => {
  const match = url.match(/module=([a-z_]+)/);
  currentModuleParam = match ? match[1] : null;
});
const routerReplaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "chantier-bardage-test" }),
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === "module" ? currentModuleParam : null),
  }),
}));

// Mock Supabase hoisted
const mockChantierData = {
  id: "chantier-bardage-test",
  nom: "Chantier Résidence Les Pins",
  client_id: "client-123",
  statut: "en_cours",
  code_acces: "ABCD12",
  materiau_structurel: "bois",
  moyen_acces: "echafaudage",
  zone_vent: 2,
  surface_m2: 120,
  quantite_coupes_ml: 45,
  singularites_nb: 4,
  type_isolant: "laine_verre",
  epaisseur_isolant_mm: 120,
  surface_paquet_m2: 3.5,
  zone_vent_rive: true,
  coef_perte_rendement: 1.15,
  horaires: "8h-17h",
  checklist: { etape1: true, etape2: false },
  clients: { nom: "M. Dupont", societe: "Dupont SARL" },
};

let resolveChantierPromise: ((data: unknown) => void) | null = null;
let delayChantierLoading = false;

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(() =>
        Promise.resolve({
          data: { adresse: "10 rue de l'Entreprise", code_postal: "75001", ville: "Paris" },
          error: null,
        })
      );
      builder.single = vi.fn(() => {
        if (table === "chantiers") {
          if (delayChantierLoading) {
            return new Promise((resolve) => {
              resolveChantierPromise = (data) => resolve({ data, error: null });
            });
          }
          return Promise.resolve({ data: mockChantierData, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (table === "devis") {
          return Promise.resolve(resolve({ data: [{ id: "dev-1", numero: "DEV-001" }], error: null }));
        }
        if (table === "pointages") {
          return Promise.resolve(resolve({ data: [{ heures: 35 }], error: null }));
        }
        return Promise.resolve(resolve({ data: [], error: null }));
      };
      return builder;
    },
  },
}));

// Spies sur les modules enfants
const calepinagePropsSpy = {
  lastProps: null as Record<string, unknown> | null,
  renderCount: 0,
};

vi.mock("@/components/bardage/hub/BardageCalepinageModule", () => ({
  default: (props: Record<string, unknown>) => {
    calepinagePropsSpy.lastProps = props;
    calepinagePropsSpy.renderCount++;
    return (
      <div id="module-calepinage-mock">
        <span>Module Calepinage</span>
        <button
          id="btn-simuler-sync"
          onClick={() => {
            const onSurfacesSync = props.onSurfacesSync as (s: number, c: number, sing: number) => void;
            onSurfacesSync?.(140, 50, 6);
          }}
        >
          Simuler Sync
        </button>
      </div>
    );
  },
}));

vi.mock("@/components/bardage/hub/BardageGeneralDeplacementsModule", () => ({
  default: () => <div id="module-general-mock">Module Général</div>,
}));
vi.mock("@/components/bardage/hub/BardageAvancementModule", () => ({
  default: () => <div id="module-avancement-mock">Module Avancement</div>,
}));
vi.mock("@/components/bardage/hub/BardageHeuresModule", () => ({
  default: () => <div id="module-heures-mock">Module Heures</div>,
}));
vi.mock("@/components/bardage/hub/BardageMeteoModule", () => ({
  default: () => <div id="module-meteo-mock">Module Météo</div>,
}));
vi.mock("@/components/bardage/hub/BardagePhotosNotesModule", () => ({
  default: () => <div id="module-photos-mock">Module Photos</div>,
}));
vi.mock("@/components/bardage/hub/BardageRapportClientModule", () => ({
  default: () => <div id="module-rapport-mock">Module Rapport</div>,
}));
vi.mock("@/components/bardage/hub/BardageDocumentsModule", () => ({
  default: () => <div id="module-documents-mock">Module Documents</div>,
}));

import ChantierDetailPage from "@/app/terrain/chantier/[id]/page";

// Gestionnaire de racines React 19
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

afterEach(() => {
  while (racines.length) {
    const r = racines.pop() as Root;
    act(() => r.unmount());
  }
  while (conteneurs.length) conteneurs.pop()?.remove();
  currentModuleParam = null;
  delayChantierLoading = false;
  resolveChantierPromise = null;
  calepinagePropsSpy.lastProps = null;
  calepinagePropsSpy.renderCount = 0;
  vi.clearAllMocks();
});

describe("Hub Bardage — Intégrité absolue de l'ordre des Hooks React", () => {
  it("1 & 2. Premier chargement (loading = true) puis résolution des données : aucune violation d'ordre de Hooks", async () => {
    delayChantierLoading = true;

    // Espionner les erreurs de console React (qui détecte la violation d'ordre des Hooks)
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Rendu initial : chantier en cours de chargement
    const dom = await rendre(<ChantierDetailPage />);

    // Doit afficher l'écran de chargement
    expect(dom.textContent).toContain("Chargement du Hub Bardage...");

    // Résoudre le chargement
    await act(async () => {
      resolveChantierPromise?.(mockChantierData);
      await Promise.resolve();
    });

    // Le chantier est maintenant chargé
    expect(dom.textContent).toContain("Chantier Résidence Les Pins");

    // Vérifier qu'aucune erreur React de type "Rendered more hooks" ou "order of Hooks" n'a été levée
    const reactHookErrors = consoleErrorSpy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && (
        arg.includes("order of Hooks") ||
        arg.includes("Rendered more hooks") ||
        arg.includes("Rendered fewer hooks")
      ))
    );
    expect(reactHookErrors).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });

  it("3. Navigation fluide entre les huit modules sans modification de l'ordre des Hooks", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dom = await rendre(<ChantierDetailPage />);

    const modules = [
      "general",
      "avancement",
      "calepinage",
      "heures",
      "meteo",
      "photos",
      "rapport",
      "documents",
    ] as const;

    for (const mod of modules) {
      // Simuler le passage sur le module
      currentModuleParam = mod;
      await act(async () => {
        // Déclencher un re-render avec le nouveau searchParams
        const racine = racines[0];
        racine.render(<ChantierDetailPage />);
        await Promise.resolve();
      });

      // Le module spécifique doit être présent dans le DOM
      expect(dom.querySelector(`#module-${mod}-mock`)).not.toBeNull();
    }

    // Retour à la vue d'ensemble (module = null)
    currentModuleParam = null;
    await act(async () => {
      racines[0].render(<ChantierDetailPage />);
      await Promise.resolve();
    });

    // Doit afficher la navigation par 8 cartes
    expect(dom.textContent).toContain("Hub Chantier Bardage · Vue d'ensemble");

    const hookErrors = consoleErrorSpy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("order of Hooks"))
    );
    expect(hookErrors).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });

  it("4. Ouverture du module Calepinage : transmission exacte de configTechniqueInitiale et des callbacks", async () => {
    currentModuleParam = "calepinage";
    await rendre(<ChantierDetailPage />);

    expect(calepinagePropsSpy.lastProps).not.toBeNull();
    expect(calepinagePropsSpy.lastProps?.chantierId).toBe("chantier-bardage-test");
    expect(calepinagePropsSpy.lastProps?.initialConfigTechnique).toEqual({
      type_isolant: "laine_verre",
      epaisseur_isolant_mm: 120,
      surface_paquet_m2: 3.5,
      zone_vent_rive: true,
      coef_perte_rendement: 1.15,
    });
    expect(typeof calepinagePropsSpy.lastProps?.onSurfacesSync).toBe("function");
    expect(typeof calepinagePropsSpy.lastProps?.onConfigSaved).toBe("function");
  });

  it("5. Modification des dimensions et synchronisation des surfaces : état mis à jour de manière idempotente sans boucle", async () => {
    currentModuleParam = "calepinage";
    const dom = await rendre(<ChantierDetailPage />);

    const btnSimuler = dom.querySelector("#btn-simuler-sync") as HTMLButtonElement;
    expect(btnSimuler).not.toBeNull();

    // Déclencher la synchronisation des surfaces
    await act(async () => {
      btnSimuler.click();
      await Promise.resolve();
    });

    // Re-cliquer avec les mêmes valeurs pour valider l'idempotence
    await act(async () => {
      btnSimuler.click();
      await Promise.resolve();
    });

    // Vérifier que le composant est stable et ne déclenche aucune boucle infinie
    expect(calepinagePropsSpy.renderCount).toBeLessThanOrEqual(4);
  });

  it("6. Aller-retour : navigation vers un autre module puis réouverture du Calepinage", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // 1. Ouvrir Calepinage
    currentModuleParam = "calepinage";
    const dom = await rendre(<ChantierDetailPage />);
    expect(dom.querySelector("#module-calepinage-mock")).not.toBeNull();

    // 2. Naviguer vers Météo
    currentModuleParam = "meteo";
    await act(async () => {
      racines[0].render(<ChantierDetailPage />);
      await Promise.resolve();
    });
    expect(dom.querySelector("#module-meteo-mock")).not.toBeNull();

    // 3. Revenir sur Calepinage
    currentModuleParam = "calepinage";
    await act(async () => {
      racines[0].render(<ChantierDetailPage />);
      await Promise.resolve();
    });
    expect(dom.querySelector("#module-calepinage-mock")).not.toBeNull();

    // Aucun avertissement d'ordre de hooks
    const hookErrors = consoleErrorSpy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("order of Hooks"))
    );
    expect(hookErrors).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });

  it("7. Montage React StrictMode : double-invocation des effets et transitions sans violation", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const dom = await rendre(
      <StrictMode>
        <ChantierDetailPage />
      </StrictMode>
    );

    expect(dom.textContent).toContain("Chantier Résidence Les Pins");

    const hookErrors = consoleErrorSpy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && (
        arg.includes("order of Hooks") ||
        arg.includes("Rendered more hooks") ||
        arg.includes("Rendered fewer hooks")
      ))
    );
    expect(hookErrors).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });

  it("8. Audit statique du fichier page.tsx : aucun Hook React n'est appelé après un return conditionnel", () => {
    const filePath = path.resolve(process.cwd(), "app/terrain/chantier/[id]/page.tsx");
    const source = fs.readFileSync(filePath, "utf-8");

    // Trouver le corps de HubBardageContenu
    const debutFn = source.indexOf("function HubBardageContenu()");
    const finFn = source.indexOf("export default function ChantierDetailPage()");
    expect(debutFn).toBeGreaterThan(0);
    expect(finFn).toBeGreaterThan(debutFn);

    const corpsHub = source.slice(debutFn, finFn);

    // Trouver le premier return de rendu conditionnel du composant (if (loading) { return ...)
    const premierReturnConditionnel = corpsHub.indexOf("if (loading) {");
    expect(premierReturnConditionnel).toBeGreaterThan(0);

    const partieApresPremierReturn = corpsHub.slice(premierReturnConditionnel);

    // Vérifier qu'aucun hook React standard (use[A-Z]) n'est présent après ce return conditionnel
    const hooksApresReturn = partieApresPremierReturn.match(/\buse[A-Z][A-Za-z0-9_]*\s*\(/g) || [];

    expect(
      hooksApresReturn,
      `Violation détectée : les Hooks suivants sont appelés après un return conditionnel : ${hooksApresReturn.join(", ")}`
    ).toHaveLength(0);
  });
});
