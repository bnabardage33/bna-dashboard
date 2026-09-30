// __tests__/searchnav-hooks.test.tsx
// O3-B6 — SearchNav : Rules of Hooks + navigations /espace-client <-> /bureau
// ============================================================================
//
// POURQUOI CE TEST
//
// `components/SearchNav.tsx` montait un `if (isClientPage) return null;`
// AVANT ses deux `useEffect`. Le nombre de hooks dépendait donc de `pathname`,
// or `usePathname()` change lors d'une navigation client SANS remontage du
// layout racine. Passer de `/espace-client/[code_acces]` à `/bureau/*` — cas
// réel du retour du navigateur après l'ouverture d'un lien d'espace client —
// faisait basculer `isClientPage` et React levait :
//
//     "Rendered fewer hooks than expected. This may be caused by an
//      accidental early return statement."
//
// Ce défaut n'était visible par AUCUN outil du dépôt :
//   - `eslint.config.mjs` n'active ni eslint-plugin-react ni
//     eslint-plugin-react-hooks (`rules-of-hooks` n'est donc pas vérifié) ;
//   - aucun test ne montait le composant.
//
// Le test reproduit la transition exacte et échoue sur l'ancien code.
//
// NOTE : pas de `@testing-library/react` ici — la version installée (9.5.0)
// utilise `ReactDOM.render`, supprimé en React 19. On passe par `createRoot`
// (react-dom/client) + `act` (react 19).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

// --- Mocks ------------------------------------------------------------------

let cheminCourant = "/bureau/fournisseurs";
vi.mock("next/navigation", () => ({
  usePathname: () => cheminCourant,
}));

// `next/link` exige le contexte App Router : on le remplace par une ancre.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

type Lecture = { table: string; limit: number | null };
const lectures: Lecture[] = [];
const ecritures: Array<{ table: string; lu: boolean | null }> = [];

// Stub « thenable » comme supabase-js : la lecture n'est comptabilisée qu'au
// moment où le composant `await` la chaîne — donc réellement lue.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from(table: string) {
      const builder = {
        _limit: null as number | null,
        select: () => builder,
        order: () => builder,
        limit(n: number) {
          builder._limit = n;
          return builder;
        },
        in: () => builder,
        update(valeurs: { lu?: boolean }) {
          ecritures.push({ table, lu: valeurs.lu ?? null });
          return Promise.resolve({ data: null, error: null });
        },
        insert: () => Promise.resolve({ data: null, error: null }),
        then(resolve: (v: unknown) => unknown) {
          lectures.push({ table, limit: builder._limit } satisfies Lecture);
          return resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  },
}));

import SearchNav from "@/components/SearchNav";

// --- Harnais ----------------------------------------------------------------

let naviguer: ((chemin: string) => void) | null = null;

function Harnais({ initial }: { initial: string }) {
  const [chemin, setChemin] = useState(initial);
  naviguer = setChemin;
  cheminCourant = chemin;
  return <SearchNav />;
}

let conteneur: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  lectures.length = 0;
  ecritures.length = 0;
  cheminCourant = "/bureau/fournisseurs";
  naviguer = null;
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  conteneur.remove();
  vi.useRealTimers();
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

async function monter(chemin: string) {
  await act(async () => {
    root.render(<Harnais initial={chemin} />);
  });
}

async function allerVers(chemin: string) {
  await act(async () => {
    naviguer!(chemin);
  });
}

async function avancerDeSecondes(n: number) {
  await act(async () => {
    vi.advanceTimersByTime(n * 1000);
  });
}

const nbLectures = () => lectures.length;
const cloche = () => conteneur.querySelector("button");
const badge = () => conteneur.querySelector("span")?.textContent ?? null;

// ============================================================================

describe("O3-B6 / SearchNav — Rules of Hooks", () => {
  it("la transition /espace-client → /bureau ne lève AUCUNE erreur React", async () => {
    // C'est LE test de régression : sur l'ancien code, cet aller-retour levait
    // « Rendered fewer hooks than expected ».
    await monter("/espace-client/CODE-ACCES");
    await expect(allerVers("/bureau/fournisseurs")).resolves.toBeUndefined();
    await expect(allerVers("/espace-client/CODE-ACCES")).resolves.toBeUndefined();
    await expect(allerVers("/bureau/clients")).resolves.toBeUndefined();
    await expect(allerVers("/demo-client")).resolves.toBeUndefined();
    await expect(allerVers("/terrain")).resolves.toBeUndefined();
  });

  it("encaisse plusieurs allers-retours répétés sans se déstabiliser", async () => {
    await monter("/espace-client/CODE-ACCES");
    for (let i = 0; i < 5; i++) {
      await allerVers("/bureau/fournisseurs");
      await allerVers("/espace-client/CODE-ACCES");
    }
    expect(cloche()).toBeNull(); // on a fini sur une page client
    await allerVers("/bureau/fournisseurs");
    expect(cloche()).not.toBeNull();
  });

  it("ne rend RIEN sur les pages client, ni cloche ni badge", async () => {
    await monter("/espace-client/CODE-ACCES");
    expect(cloche()).toBeNull();
    expect(badge()).toBeNull();
    expect(conteneur.innerHTML).toBe("");

    await allerVers("/demo-client");
    expect(cloche()).toBeNull();
    expect(conteneur.innerHTML).toBe("");
  });

  it("rend la cloche et la recherche sur les pages bureau", async () => {
    await monter("/bureau/fournisseurs");
    expect(cloche()).not.toBeNull();
    expect(conteneur.querySelector("input")?.getAttribute("placeholder")).toBe("Rechercher...");
  });

  it("ne s'applique qu'aux préfixes client (garde non surchargée)", async () => {
    for (const chemin of ["/", "/bureau", "/terrain/chantier/abc", "/bureau-clients", "/login"]) {
      await monter(chemin);
      expect(cloche(), `attendu sur ${chemin}`).not.toBeNull();
    }
  });
});

describe("O3-B6 / SearchNav — comportement fonctionnel préservé", () => {
  it("ne lit AUCUNE notification sur une page client", async () => {
    await monter("/espace-client/CODE-ACCES");
    expect(nbLectures()).toBe(0);
    await avancerDeSecondes(120);
    expect(nbLectures()).toBe(0);
  });

  it("lit au montage puis toutes les 30 s sur une page bureau", async () => {
    await monter("/bureau/fournisseurs");
    expect(nbLectures()).toBe(1);
    expect(lectures[0]).toEqual({ table: "notifications", limit: 20 });

    await avancerDeSecondes(29);
    expect(nbLectures()).toBe(1);
    await avancerDeSecondes(1);
    expect(nbLectures()).toBe(2);
    await avancerDeSecondes(60);
    expect(nbLectures()).toBe(4);
  });

  it("ARRÊTE le polling en sortant vers une page client, et le REPREND au retour", async () => {
    await monter("/bureau/fournisseurs");
    expect(nbLectures()).toBe(1);

    await allerVers("/espace-client/CODE-ACCES");
    expect(cloche()).toBeNull();
    await avancerDeSecondes(120);
    expect(nbLectures()).toBe(1); // intervalle nettoyé

    await allerVers("/bureau/fournisseurs");
    expect(cloche()).not.toBeNull();
    expect(nbLectures()).toBe(2); // lecture immédiate au retour
    await avancerDeSecondes(30);
    expect(nbLectures()).toBe(3); // polling relancé
  });

  it("n'installe l'écouteur de clic QUE sur les pages bureau", async () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    try {
      await monter("/espace-client/CODE-ACCES");
      expect(add).not.toHaveBeenCalledWith("mousedown", expect.any(Function));

      await allerVers("/bureau/fournisseurs");
      expect(add).toHaveBeenCalledWith("mousedown", expect.any(Function));

      await allerVers("/espace-client/CODE-ACCES");
      expect(remove).toHaveBeenCalledWith("mousedown", expect.any(Function));
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it("démonte proprement depuis une page client comme depuis une page bureau", async () => {
    // Un return null AVANT les hooks laissait les effets sans possibility de
    // nettoyage cohérent : on vérifie qu'aucune erreur ne survit au unmount.
    await monter("/bureau/fournisseurs");
    await expect(
      act(async () => {
        root.unmount();
      })
    ).resolves.toBeUndefined();
    root = createRoot(conteneur);
    await monter("/espace-client/CODE-ACCES");
    await expect(
      act(async () => {
        root.unmount();
      })
    ).resolves.toBeUndefined();
  });
});

describe("O3-B6 / SearchNav — la lecture reste une lecture navigateur", () => {
  it("lit la table par le client navigateur, sans aucun appel HTTP", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await monter("/bureau/fournisseurs");
      await avancerDeSecondes(30);
      expect(lectures.length).toBeGreaterThan(0);
      expect(lectures.every((l) => l.table === "notifications")).toBe(true);
      // Aucun appel HTTP : le composant n'a jamais utilisé de route API pour la
      // notification (O3-B6/N3 — route orpheline confirmée, désormais supprimée).
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
