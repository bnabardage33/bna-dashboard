// O3-B9 — DashboardAccueil : insertion `notes_patron` + FIN de l'échec SILENCIEUX
// ============================================================================
//
// Défaut historique (le pire du B9, d'après l'audit) : le code était
//
//     const { data, error: err } = await supabase.from('notes_patron').insert(…);
//     if (!err && data) { … }
//     await raffraichirStats();
//   } catch (err) { setError(…); }
//
// Or l'erreur PostgREST ne lève JAMAIS d'exception : elle est renvoyée dans
// `{ error }`. Le `catch` ne se déclenchait donc pas, et le `if (!err && data)`
// ne faisait rien. Résultat : la note reformulée par l'IA disparaissait
// silencieusement, sans message ni trace.
//
// Ces tests exécutent le VRAI `handleTexteReformule` du composant (BoutonMicroNote
// est remplacé par une passerelle qui appelle le handler), puis observent ce que
// l'utilisateur voit réellement à l'écran.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";

const BNA = "11111111-1111-4111-8111-111111111111";

type Resolution = { data: unknown[]; error: { message: string } | null };

/**
 * `Promise.resolve` enrichi des méthodes de chaîne PostgREST.
 * Une `Promise` nue n'expose pas `.select()` / `.in()` : sans ce type,
 * TypeScript refuse le mock — et le mock doit pouvoir écrire ce que le
 * composant écrit.
 */
type ChainePostgREST<T> = Promise<T> & {
  select?: (...args: unknown[]) => unknown;
  in?: (...args: unknown[]) => unknown;
};

function insere<T>(valeur: T): ChainePostgREST<T> {
  return Promise.resolve(valeur) as ChainePostgREST<T>;
}

/** Inserts réellement tentés sur `notes_patron`. */
let inserts: Record<string, unknown>[] = [];

/** Erreur renvoyée par le mock PostgREST, ou `null` si l'insert réussit. */
let erreurPostgREST: { message: string } | null = null;

/** Lignes rendues par `.insert().select()`. */
let lignesRenvoyees: unknown[] = [];

/** Handler réel du composant, capturé via le mock de BoutonMicroNote. */
let onTexteReformule: ((texte: string) => void) | null = null;

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: session.user }, error: null }),
    },
    from: (table: string) => {
      const etat: Record<string, unknown> = {
        insert: (payload: unknown) => {
          if (!erreurPostgREST) {
            const lignes = Array.isArray(payload) ? payload : [payload];
            for (const p of lignes) inserts.push({ __table: table, ...(p as object) });
            // PostgREST `.insert(…).select()` renvoie les lignes ÉCRITES
            // (avec les valeurs par défaut). Reproduire ce comportement évite
            // d'avoir à maintenir un jeu de données parallèle.
            lignesRenvoyees = lignes.map((p, i) => ({
              id: `note-${i}`,
              created_at: "2026-09-26T10:00:00Z",
              ...(p as object),
            }));
          } else {
            lignesRenvoyees = [];
          }
          // Le composant enchaîne `.insert(…).select()` : la chaîne doit
          // résoudre AVEC `error` sans jamais lever d'exception.
          // `insere()` renvoie un objet étendu pour que TypeScript connaisse
          // la méthode `.select()` (une `Promise` nue ne l'a pas).
          const p = insere({ data: lignesRenvoyees, error: erreurPostgREST });
          p.select = () => insere({ data: lignesRenvoyees, error: erreurPostgREST });
          return p;
        },
        update: () => Promise.resolve({ data: null, error: null }),
        delete: () => Promise.resolve({ data: null, error: null }),
        upsert: () => Promise.resolve({ data: null, error: null }),
      };
      // `raffraichirStats` fait des `.select(…, { count, head })`.
      // `raffraichirStats` fait des `.select(…, { count, head })` puis `.in()`.
      const p = insere({ data: [], error: null, count: 0 });
      p.in = () => p;
      etat.select = () => p;
      etat.order = () => etat;
      etat.eq = () => etat;
      etat.neq = () => etat;
      etat.in = () => etat;
      etat.limit = () => etat;
      etat.maybeSingle = async () => ({ data: null, error: null });
      etat.single = async () => ({ data: null, error: null });
      etat.then = (r: (v: Resolution & { count: number }) => unknown) =>
        r({ data: [], error: null, count: 0 });
      return etat;
    },
  },
}));

// Passerelle : on ne teste pas le micro, on teste le handler du DASHBOARD.
vi.mock("@/components/BoutonMicroNote", () => ({
  default: (props: { onTexteReformule: (t: string) => void }) => {
    onTexteReformule = props.onTexteReformule;
    return createElement("div", { "data-testid": "micro-note" });
  },
}));

let session: { user: { app_metadata: Record<string, unknown> } };

let conteneur: HTMLDivElement;
let root: Root;
let alertes: string[] = [];
let erreursConsole: unknown[][] = [];

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(async () => {
  inserts = [];
  erreurPostgREST = null;
  lignesRenvoyees = [];
  onTexteReformule = null;
  alertes = [];
  erreursConsole = [];
  session = { user: { app_metadata: { entreprise_id: BNA } } };
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    erreursConsole.push(args);
  });
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  vi.stubGlobal("alert", (m: unknown) => alertes.push(String(m)));
  const mod = (await import("@/components/DashboardAccueil")) as {
    default: (p: unknown) => unknown;
  };
  await act(async () => {
    root.render(
      createElement(mod.default as never, {
        notesInitiales: [],
        statsInitiales: { notes: 0, chantiers: 0, devis: 0 },
      }),
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  conteneur.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Déclenche le vrai `handleTexteReformule`. */
async function reformuler(texte = "Texte reformulé par l'IA"): Promise<void> {
  expect(onTexteReformule, "le handler doit être câblé sur BoutonMicroNote").toBeTypeOf(
    "function",
  );
  await act(async () => {
    await (onTexteReformule as (t: string) => void)(texte);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// A. Entreprise transmise
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B9 — DashboardAccueil : notes_patron (table racine)", () => {
  it("insère la note avec l'entreprise du CLAIM", async () => {
    await reformuler();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].entreprise_id).toBe(BNA);
    expect(inserts[0].contenu).toBe("Texte reformulé par l'IA");
    expect(alertes).toEqual([]);
  });

  it("affiche la note enregistrée dans la liste (comportement nominal préservé)", async () => {
    await reformuler("Compte-rendu chantier nord");
    expect(conteneur.textContent).toMatch(/Compte-rendu chantier nord/);
  });

  it("FAIL-CLOSED : claim absent → AUCUNE écriture ET un message à l'écran", async () => {
    session = { user: { app_metadata: {} } };
    await reformuler();
    expect(inserts).toHaveLength(0);
    // Le bandeau d'erreur EXISTE déjà dans le composant (l.169) : on ne l'a pas
    // créé pour B9, on l'utilise. C'est ce qui distingue « échec visible » de
    // « échec silencieux ».
    expect(conteneur.textContent).toMatch(/entreprise/i);
    expect(erreursConsole.length).toBeGreaterThan(0);
  });

  it("FAIL-CLOSED : claim malformé → AUCUNE écriture", async () => {
    session = { user: { app_metadata: { entreprise_id: "pas-un-uuid" } } };
    await reformuler();
    expect(inserts).toHaveLength(0);
    expect(conteneur.textContent).toMatch(/entreprise/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B. FIN DE L'ÉCHEC SILENCIEUX (GO point 3)
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B9 — DashboardAccueil : l'erreur PostgREST n'est plus silencieuse", () => {
  it("erreur renvoyée par PostgREST → message VISIBLE à l'utilisateur", async () => {
    // C'est exactement le cas que l'ancien code perdait : pas d'exception, donc
    // jamais de `catch`, donc rien ne s'affichait.
    erreurPostgREST = { message: "null value in column entreprise_id violates not-null constraint" };
    await reformuler();
    expect(inserts).toHaveLength(0);
    expect(conteneur.textContent).toMatch(/entreprise_id/);
    expect(conteneur.textContent).toMatch(/violates not-null/);
  });

  it("erreur PostgREST → trace journalisée (console.error)", async () => {
    erreurPostgREST = { message: "boom" };
    await reformuler();
    expect(erreursConsole.length).toBeGreaterThan(0);
  });

  it("erreur PostgREST → aucune fausse note ajoutée à l'écran", async () => {
    erreurPostgREST = { message: "boom" };
    await reformuler();
    expect(conteneur.textContent).not.toMatch(/Texte reformulé par l'IA/);
  });

  it("RÉGRESSION : le `catch` reste armé pour une vraie exception (l. throw)", async () => {
    // Preuve que la correction n'a pas REMPLACÉ le `catch` par le `if (err)` :
    // on fait lever l'insert lui-même et on vérifie que le chemin d'exception
    // continue d'être traité.
    const mod = await import("@/lib/supabase");
    const from = mod.supabase.from as unknown as (t: string) => Record<string, unknown>;
    const vrai = from.bind(mod.supabase);
    (mod.supabase as unknown as { from: unknown }).from = (t: string) => {
      if (t === "notes_patron") throw new Error("exception réseau");
      return vrai(t);
    };
    await reformuler();
    expect(conteneur.textContent).toMatch(/exception réseau/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// C. Non-régression du comportement IA
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B9 — DashboardAccueil : le fonctionnement de l'IA est intact", () => {
  it("le libellé d'attente revient dans son état initial après échec", async () => {
    erreurPostgREST = { message: "boom" };
    await reformuler();
    // `isSavingNote` doit repasser à `false` : le `finally` court malgré le
    // `return` du garde fail-closed / du `if (err)`.
    expect(conteneur.textContent).toMatch(/Appuyez pour parler/);
    expect(conteneur.textContent).not.toMatch(/Enregistrement de la note/);
  });

  it("le libellé d'attente revient dans son état initial après refus de contexte", async () => {
    session = { user: { app_metadata: {} } };
    await reformuler();
    expect(conteneur.textContent).toMatch(/Appuyez pour parler/);
  });

  it("succès : le libellé d'attente revient aussi", async () => {
    await reformuler();
    expect(conteneur.textContent).toMatch(/Appuyez pour parler/);
  });
});
