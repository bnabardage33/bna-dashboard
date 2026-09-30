// O3-B9 / 13e producteur — `app/bureau/documents-compta` : remontée des erreurs.
//
// La VRAIE page est montée sur DOM réel (`createRoot` + `act`), et le réseau est
// simulé au niveau `fetch` — c'est-à-dire à la frontière exacte que le
// navigateur'utilise. Les composants sont atteints par leurs BALISES et leurs
// CLICS, jamais par un accès interne.
//
// Ce fichier couvre les trois défauts CÔTÉ UI que le mini-audit a identifiés :
//
//   P1) `loadData` ignorait le code HTTP du GET. La route étant désormais
//       fail-closed (403 sans contexte), l'écran affichait « Aucun document
//       enregistré » — un mensonge : la liste n'avait jamais été lue.
//   P2) `handleDelete` IGNORAIT la réponse du DELETE. Un 404 (document d'un
//       autre tenant) ou un 500 se traduisait par un simple rechargement de la
//       liste, sans aucune information.
//   P3) Les bandeaux d'erreur ET de succès vivaient dans le bloc de l'onglet
//       « scanner ». La suppression se déclenche depuis l'onglet « documents » :
//       l'erreur était donc écrite dans l'état mais jamais affichée.
//
// Le bandeau est désormais unique et hors onglets (P3) : le test le prouve en
// affichant l'erreur alors que l'onglet actif est « documents ».

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";

type Reponse = { ok: boolean; status: number; json: () => Promise<unknown> };

interface Reponses {
  getDocuments: Reponse;
  getListes: Reponse;
  post: Reponse;
  delete: Reponse;
}

let reponses: Reponses = {} as Reponses;
let appelsFetch: Array<{ url: string; methode: string }> = [];

function rep(code: number, body: unknown): Reponse {
  return { ok: code >= 200 && code < 300, status: code, json: async () => body };
}

const DOC = {
  id: "44444444-4444-4444-8444-444444444441",
  type: "bl",
  date: "2026-09-20",
  note: "Facture",
  montant_ht: 1000,
  taux_tva: 20,
  montant_tva: 200,
  montant_ttc: 1200,
  url_image: "https://stockage.test/tickets/documents-compta/bna.png",
  chantier_id: null,
  fournisseur_id: null,
  categorie: "materiaux",
  chantiers: null,
  fournisseurs: null,
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: () => Promise.resolve({ data: null, error: null }),
    }),
  },
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => createElement("img", props),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/bureau/documents-compta",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

let conteneur: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  appelsFetch = [];
  reponses = {
    getDocuments: rep(200, { documents: [] }),
    getListes: rep(200, { chantiers: [], fournisseurs: [] }),
    post: rep(200, { document: DOC }),
    delete: rep(200, { ok: true }),
  };

  vi.stubGlobal("fetch", async (url: string, init?: { method?: string }) => {
    const methode = init?.method ?? "GET";
    appelsFetch.push({ url: String(url), methode });
    if (methode === "DELETE") return reponses.delete;
    if (methode === "POST") return reponses.post;
    return String(url).includes("chantiers-fournisseurs")
      ? reponses.getListes
      : reponses.getDocuments;
  });
  vi.stubGlobal("confirm", () => true);
  vi.stubGlobal("open", () => null);
  URL.createObjectURL = () => "blob:test";

  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
});

afterEach(async () => {
  await act(async () => root.unmount());
  conteneur.remove();
  vi.unstubAllGlobals();
});

async function monter(): Promise<void> {
  const mod = (await import("@/app/bureau/documents-compta/page")) as {
    default: () => unknown;
  };
  await act(async () => {
    root.render(createElement(mod.default as never));
  });
}

function texte(): string {
  return conteneur.textContent ?? "";
}

/** Onglet « documents » : c'est là que se trouvent le bouton et la corbeille. */
async function ongletDocuments(): Promise<void> {
  const bouton = [...conteneur.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes("Documents")
  );
  expect(bouton).toBeDefined();
  await act(async () => {
    bouton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function boutonCorbeille(): HTMLButtonElement {
  const b = conteneur.querySelector<HTMLButtonElement>('button[class*="E30613"]');
  expect(b).toBeDefined();
  return b!;
}

async function cliquerCorbeille(): Promise<void> {
  await act(async () => {
    boutonCorbeille().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// ───────────────────────────────────────────────────────────────────────────
// P1 — le GET fail-closed ne doit pas devenir « aucun document »
// ───────────────────────────────────────────────────────────────────────────

describe('P1) GET — l\'échec doit être visible, pas une liste vide', () => {
  it('P1a — GET 403 ⇒ le message de l\'API s\'affiche dans le bandeau', async () => {
    reponses.getDocuments = rep(403, { error: 'Contexte entreprise introuvable ou invalide dans votre session.' });
    await monter();

    expect(texte()).toContain('Contexte entreprise introuvable')
  })

  it('P1b — GET 403 ⇒ AUCUNE liste vide affirmée (« Aucun document enregistré »)', async () => {
    reponses.getDocuments = rep(403, { error: 'Contexte entreprise introuvable.' });
    await monter();
    await ongletDocuments();

    expect(texte()).not.toContain('Aucun document enregistré')
  })

  it('P1c — GET 500 ⇒ le message remonte aussi', async () => {
    reponses.getDocuments = rep(500, { error: 'relation "documents_compta" does not exist' });
    await monter();

    expect(texte()).toContain('relation "documents_compta" does not exist')
  })

  it('P1d — GET 200 ⇒ aucune erreur, les documents sont listés (non-régression)', async () => {
    reponses.getDocuments = rep(200, { documents: [DOC] });
    await monter();
    await ongletDocuments();

    expect(texte()).toContain('1200.00 EUR TTC')
    expect(texte()).not.toContain('Documents compta :')
  })

  it('P1e — le préfixe « Documents compta : » identifie l\'origine de l\'erreur', async () => {
    reponses.getDocuments = rep(403, { error: 'Contexte entreprise introuvable.' });
    await monter();

    expect(texte()).toContain('Documents compta :')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// P2 — le DELETE ne doit plus ignorer sa réponse
// ───────────────────────────────────────────────────────────────────────────

describe('P2) DELETE — la réponse est enfin contrôlée', () => {
  it('P2a — DELETE 404 (autre tenant) ⇒ message affiché, liste NON rafraîchie', async () => {
    reponses.getDocuments = rep(200, { documents: [DOC] });
    await monter();
    await ongletDocuments();
    const lecturesAvant = appelsFetch.filter((a) => a.methode === 'GET').length;

    reponses.delete = rep(404, { error: 'Document introuvable dans votre entreprise.' });
    await cliquerCorbeille();

    expect(texte()).toContain('Document introuvable dans votre entreprise')
    // Le message d'erreur est préfixé par le handler de suppression.
    expect(texte()).toContain('Erreur suppression')
    // Preuve du défaut P2 : l'ancien code rechargeait la liste quoi qu'il arrive.
    const lecturesApres = appelsFetch.filter((a) => a.methode === 'GET').length
    expect(lecturesApres).toBe(lecturesAvant)
  })

  it('P2b — DELETE 500 ⇒ message affiché', async () => {
    reponses.getDocuments = rep(200, { documents: [DOC] });
    await monter();
    await ongletDocuments();

    reponses.delete = rep(500, { error: 'violation de contrainte' });
    await cliquerCorbeille();

    expect(texte()).toContain('violation de contrainte')
  })

  it('P2c — DELETE 200 ⇒ aucune erreur et la liste EST rafraîchie', async () => {
    reponses.getDocuments = rep(200, { documents: [DOC] });
    await monter();
    await ongletDocuments();
    const lecturesAvant = appelsFetch.filter((a) => a.methode === 'GET').length;

    await cliquerCorbeille();

    expect(texte()).not.toContain('Erreur suppression')
    expect(appelsFetch.filter((a) => a.methode === 'GET').length).toBeGreaterThan(lecturesAvant)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// P3 — le bandeau doit exister HORS des onglets
// ───────────────────────────────────────────────────────────────────────────

describe('P3) Le bandeau est visible depuis l\'onglet « documents »', () => {
  it('P3a — une erreur de suppression s\'affiche alors que l\'onglet actif est « documents »', async () => {
    reponses.getDocuments = rep(200, { documents: [DOC] });
    await monter();
    await ongletDocuments();
    expect(texte()).toContain('Documents');

    reponses.delete = rep(403, { error: 'Contexte entreprise introuvable ou invalide dans votre session.' });
    await cliquerCorbeille();

    // L'état `error` est écrit ET rendu : avant le correctif, le texte existait
    // dans l'état mais le bandeau était dans le bloc de l'onglet « scanner ».
    expect(texte()).toContain('Erreur suppression')
    expect(texte()).toContain('Contexte entreprise introuvable ou invalide')
  })

  it('P3b — l\'erreur du GET s\'affiche dans l\'onglet « scanner » (non-régression)', async () => {
    reponses.getDocuments = rep(403, { error: 'Contexte entreprise introuvable.' });
    await monter();

    expect(texte()).toContain('Contexte entreprise introuvable')
  })
})
