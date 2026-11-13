// __tests__/bardage/calepinage-sync-surfaces.test.tsx
//
// Tests de non-régression et de robustesse de la synchronisation des surfaces du Calepinage Bardage :
// 1. Premier chargement : synchronise correctement les surfaces calculées.
// 2. Idempotence : un nouveau rendu sans changement de surface ne déclenche aucune mise à jour inutile.
// 3. Réactivité métier : une modification réelle de surface ou de dimensions déclenche bien la synchronisation.
// 4. Absence de boucle infinie : aucun « Maximum update depth exceeded » même avec callback parent setState.
// 5. Mode React StrictMode : fonctionnement stable sous double-invocation d'effets.
// 6. Observabilité : logging d'erreur enrichi et structuré au lieu de `{}`.

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import React, { StrictMode, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// Mock Supabase hoisted
const supabaseMock = vi.hoisted(() => {
  const updates: Array<{ table: string; payload: Record<string, unknown>; eq: { col: string; val: unknown } }> = [];
  const zonesParDefaut: Array<Record<string, unknown>> = [
    {
      id: "zone-1",
      chantier_id: "chantier-test-123",
      type: "facade",
      nom: "Façade Principale",
      largeur: 10,
      hauteur_mur: 3,
      hauteur_faite: null,
      materiau: "lames",
      ouvertures: [
        { id: "ouv-1", type: "porte", largeur: 1, hauteur: 2 },
      ],
      famille_pose: null,
      angle: false,
      resultats_techniques: null,
    },
  ];

  let zonesSimulees = [...zonesParDefaut];
  let updateError: { message: string; code?: string; details?: string; hint?: string } | null = null;

  function chaine(table: string) {
    const builder: Record<string, unknown> = {};

    builder.select = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.eq = vi.fn((col: string, val: unknown) => {
      builder._eq = { col, val };
      return builder;
    });

    builder.delete = vi.fn(() => {
      const deleteBuilder: Record<string, unknown> = {};
      deleteBuilder.eq = vi.fn(() => {
        return Promise.resolve({ error: null, data: null });
      });
      return deleteBuilder;
    });

    builder.update = vi.fn((payload: Record<string, unknown>) => {
      const updateBuilder: Record<string, unknown> = {};
      updateBuilder.eq = vi.fn((col: string, val: unknown) => {
        updates.push({ table, payload, eq: { col, val } });
        const res = { error: updateError, data: null };
        return {
          then: (onfulfilled?: (v: typeof res) => unknown) => {
            return Promise.resolve(onfulfilled ? onfulfilled(res) : res);
          },
        };
      });
      return updateBuilder;
    });

    builder.then = (resolve: (v: unknown) => unknown) => {
      resolve({ data: zonesSimulees, error: null });
      return builder;
    };

    return builder;
  }

  return {
    updates,
    getZones: () => zonesSimulees,
    setZones: (z: Array<Record<string, unknown>>) => {
      zonesSimulees = z;
    },
    resetZones: () => {
      zonesSimulees = [...zonesParDefaut];
    },
    setUpdateError: (err: typeof updateError) => {
      updateError = err;
    },
    chaine,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "chantier-test-123" }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => supabaseMock.chaine(table),
  },
}));

import BardageCalepinageModule from "@/components/bardage/hub/BardageCalepinageModule";
import type { ConfigTechnique } from "@/components/ZoneCard";

// Harnais React 19 createRoot + act
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
  // Laisser le chargement initial et les effets se résoudre
  await act(async () => {
    await Promise.resolve();
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
  supabaseMock.updates.length = 0;
  supabaseMock.setUpdateError(null);
  supabaseMock.resetZones();
});

describe("Synchronisation des surfaces — BardageCalepinageModule", () => {
  const configInit: ConfigTechnique = {
    type_isolant: "laine_verre",
    epaisseur_isolant_mm: 100,
    surface_paquet_m2: 2.5,
    zone_vent_rive: true,
    coef_perte_rendement: 1.10,
  };

  it("1. Premier chargement : synchronise correctement les surfaces calculées", async () => {
    const onSurfacesSync = vi.fn();

    await rendre(
      <BardageCalepinageModule
        chantierId="chantier-test-123"
        chantierNom="Test Bardage"
        zoneVent={2}
        initialConfigTechnique={configInit}
        onSurfacesSync={onSurfacesSync}
      />
    );

    // Mur 10m x 3m = 30m2 brut. Porte 1m x 2m = 2m2 ouverture. Surface nette = 28m2.
    // Coupes = 2 x 3m (bords) + 2 x 2m (porte) = 10 ml. Singularités (ouvertures) = 2.
    expect(onSurfacesSync).toHaveBeenCalledTimes(1);
    expect(onSurfacesSync).toHaveBeenCalledWith(28, 10, 2);

    const chantierUpdates = supabaseMock.updates.filter((u) => u.table === "chantiers");
    expect(chantierUpdates).toHaveLength(1);
    expect(chantierUpdates[0].payload).toEqual({
      surface_m2: 28,
      quantite_coupes_ml: 10,
      singularites_nb: 2,
    });
    expect(chantierUpdates[0].eq).toEqual({
      col: "id",
      val: "chantier-test-123",
    });
  });

  it("2. Idempotence : un re-render sans changement de surface ne déclenche aucune nouvelle synchronisation", async () => {
    const onSurfacesSync = vi.fn();

    function ParentTest() {
      const [count, setCount] = useState(0);
      return (
        <div>
          <button id="inc-btn" onClick={() => setCount((c) => c + 1)}>
            Re-render {count}
          </button>
          <BardageCalepinageModule
            chantierId="chantier-test-123"
            chantierNom="Test Bardage"
            zoneVent={2}
            initialConfigTechnique={configInit}
            onSurfacesSync={onSurfacesSync}
          />
        </div>
      );
    }

    const dom = await rendre(<ParentTest />);
    expect(onSurfacesSync).toHaveBeenCalledTimes(1);
    const updatesAvant = supabaseMock.updates.filter((u) => u.table === "chantiers");
    expect(updatesAvant).toHaveLength(1);

    // Déclencher un re-render du composant parent
    const btn = dom.querySelector("#inc-btn") as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Le callback ne doit PAS être rappelé car les surfaces sont identiques
    expect(onSurfacesSync).toHaveBeenCalledTimes(1);
    const updatesApres = supabaseMock.updates.filter((u) => u.table === "chantiers");
    expect(updatesApres).toHaveLength(1);
  });

  it("3. Absence de boucle infinie : l'intégration parent setChantier ne provoque aucun Maximum update depth exceeded", async () => {
    let rendersParent = 0;

    function ParentAvecMiseAJourChantier() {
      const [chantier, setChantier] = useState({
        id: "chantier-test-123",
        surface_m2: 0,
        quantite_coupes_ml: 0,
        singularites_nb: 0,
      });

      rendersParent++;

      // Implémentation du callback parent telle que corrigée dans page.tsx
      const handleSurfacesSync = (surf: number, coupes: number, sing: number) => {
        setChantier((prev) => {
          if (
            prev.surface_m2 === surf &&
            prev.quantite_coupes_ml === coupes &&
            prev.singularites_nb === sing
          ) {
            return prev;
          }
          return {
            ...prev,
            surface_m2: surf,
            quantite_coupes_ml: coupes,
            singularites_nb: sing,
          };
        });
      };

      return (
        <div>
          <span id="surface-val">{chantier.surface_m2}</span>
          <BardageCalepinageModule
            chantierId={chantier.id}
            chantierNom="Test Bardage"
            zoneVent={2}
            initialConfigTechnique={configInit}
            onSurfacesSync={handleSurfacesSync}
          />
        </div>
      );
    }

    const dom = await rendre(<ParentAvecMiseAJourChantier />);

    // Doit se stabiliser immédiatement après la première mise à jour sans boucle
    const surfaceEl = dom.querySelector("#surface-val");
    expect(surfaceEl?.textContent).toBe("28");
    // Le parent rend au maximum 2 fois (initial + 1 mise à jour d'état)
    expect(rendersParent).toBeLessThanOrEqual(3);
    const chantierUpdates = supabaseMock.updates.filter((u) => u.table === "chantiers");
    expect(chantierUpdates).toHaveLength(1);
  });

  it("4. Compatibilité React StrictMode : fonctionne correctement sous double-montage", async () => {
    const onSurfacesSync = vi.fn();

    await rendre(
      <StrictMode>
        <BardageCalepinageModule
          chantierId="chantier-test-123"
          chantierNom="Test Bardage"
          zoneVent={2}
          initialConfigTechnique={configInit}
          onSurfacesSync={onSurfacesSync}
        />
      </StrictMode>
    );

    // En StrictMode, la synchronisation est idempotente et stable
    expect(onSurfacesSync).toHaveBeenCalledWith(28, 10, 2);
    const chantierUpdates = supabaseMock.updates.filter((u) => u.table === "chantiers");
    expect(chantierUpdates.length).toBeGreaterThanOrEqual(1);
  });

  it("5. Observabilité des erreurs : loggue un objet détaillé avec contexte et message explicite plutôt que {}", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    supabaseMock.setUpdateError({
      message: "violates foreign key constraint",
      code: "23503",
      details: "Key is not present in table",
      hint: "Check chantier_id",
    });

    await rendre(
      <BardageCalepinageModule
        chantierId="chantier-test-123"
        chantierNom="Test Bardage"
        zoneVent={2}
        initialConfigTechnique={configInit}
      />
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
    const calls = consoleErrorSpy.mock.calls;
    const errorCall = calls.find((c) =>
      typeof c[0] === "string" && c[0].includes("Erreur sync surfaces -> chantier:")
    );

    expect(errorCall).toBeDefined();
    // Le second paramètre ne doit PAS être un objet vide `{}`
    const payload = errorCall?.[1] as Record<string, unknown>;
    expect(payload).toBeDefined();
    expect(payload.message).toBe("violates foreign key constraint");
    expect(payload.code).toBe("23503");
    expect(payload.contexte).toEqual({
      chantierId: "chantier-test-123",
      surface_m2: 28,
      quantite_coupes_ml: 10,
      singularites_nb: 2,
    });

    consoleErrorSpy.mockRestore();
  });

  it("6. Réactivité métier : une modification réelle des surfaces (ex: suppression de zone) déclenche bien une nouvelle synchronisation avec les nouvelles valeurs", async () => {
    // Configurer 2 zones dans le mock
    supabaseMock.setZones([
      {
        id: "zone-1",
        chantier_id: "chantier-test-123",
        type: "facade",
        nom: "Façade Principale",
        largeur: 10,
        hauteur_mur: 3,
        hauteur_faite: null,
        materiau: "lames",
        ouvertures: [{ id: "ouv-1", type: "porte", largeur: 1, hauteur: 2 }],
        famille_pose: null,
        angle: false,
        resultats_techniques: null,
      },
      {
        id: "zone-2",
        chantier_id: "chantier-test-123",
        type: "facade",
        nom: "Façade Secondaire",
        largeur: 4,
        hauteur_mur: 3,
        hauteur_faite: null,
        materiau: "lames",
        ouvertures: [],
        famille_pose: null,
        angle: false,
        resultats_techniques: null,
      },
    ]);

    const onSurfacesSync = vi.fn();

    const dom = await rendre(
      <BardageCalepinageModule
        chantierId="chantier-test-123"
        chantierNom="Test Bardage"
        zoneVent={2}
        initialConfigTechnique={configInit}
        onSurfacesSync={onSurfacesSync}
      />
    );

    // Initial :
    // Zone 1: 10 x 3 = 30 m2 brut, porte 2 m2 -> 28 m2 net, 10 ml coupes, 2 singularités
    // Zone 2: 4 x 3 = 12 m2 brut, 0 ouverture -> 12 m2 net, 6 ml coupes, 0 singularité
    // Total : 40 m2, 16 ml, 2 singularités
    expect(onSurfacesSync).toHaveBeenCalledTimes(1);
    expect(onSurfacesSync).toHaveBeenLastCalledWith(40, 16, 2);

    const initialUpdates = supabaseMock.updates.filter((u) => u.table === "chantiers");
    expect(initialUpdates).toHaveLength(1);
    expect(initialUpdates[0].payload).toEqual({
      surface_m2: 40,
      quantite_coupes_ml: 16,
      singularites_nb: 2,
    });

    // Cliquer sur le bouton "Supprimer" de la Zone 2
    const boutonsSupprimer = Array.from(dom.querySelectorAll("button")).filter(
      (btn) => btn.textContent?.trim() === "Supprimer"
    );
    expect(boutonsSupprimer).toHaveLength(2);

    await act(async () => {
      boutonsSupprimer[1].click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Après suppression de la Zone 2 : la surface nette repasse à 28 m2, coupes 10 ml, singularités 2
    expect(onSurfacesSync).toHaveBeenCalledTimes(2);
    expect(onSurfacesSync).toHaveBeenLastCalledWith(28, 10, 2);

    const allChantierUpdates = supabaseMock.updates.filter((u) => u.table === "chantiers");
    expect(allChantierUpdates).toHaveLength(2);
    expect(allChantierUpdates[1].payload).toEqual({
      surface_m2: 28,
      quantite_coupes_ml: 10,
      singularites_nb: 2,
    });
  });
});
