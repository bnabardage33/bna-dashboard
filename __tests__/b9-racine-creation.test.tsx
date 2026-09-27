// O3-B9 — Tests comportementaux des créations UI sur TABLES RACINES
// ============================================================================
//
// Ces tests EXÉCUTENT réellement le handler de chaque page sur un DOM réel,
// avec `@/lib/supabase` mocké, puis inspectent la valeur TRANSMISE à Supabase.
//
// Pourquoi ne pas se contenter d'un invariant de source : le défaut B9 était
// invisible au `tsc` précisément parce qu'un `as TablesInsert<…>` le
// neutralisait. Relire le fichier ne prouve que la FORME du code ; il faut
// capturer la valeur réellement écrite pour prouver le COMPORTEMENT.
//
// `resoudreContexteEntreprise` n'est PAS mocké : on veut couvrir le vrai
// câblage page → résolveur → garde `estUuid` → payload. Seul `@/lib/supabase`
// est mocké, et c'est lui que le résolveur lit.
//
// Infrastructure : `@testing-library/react@9.5.0` est inutilisable (React 19).
// On passe par `createRoot` + `act`, comme en O3-B8.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";

const BNA = "11111111-1111-4111-8111-111111111111";
const TEST = "22222222-2222-4222-8222-222222222222";
const CHANTIER_ID = "b6242309-0000-4000-8000-000000000001";
const CLIENT_ID = "66084d5c-0000-4000-8000-000000000002";

type Resolution = { data: unknown[]; error: { message: string } | null };

/** Inserts réellement tentés, par table. */
let inserts: Record<string, unknown>[] = [];

/** Erreurs renvoyées par le mock, par table (pour tester les rejets). */
let erreursInsert: Record<string, { message: string } | null> = {};

/** Lignes renvoyées par `.select()` après un insert (documents-compta). */
let lignesApresInsert: unknown[] = [];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: session.user }, error: null }),
    },
    rpc: async () => ({ data: "SAV-2026-001", error: null }),
    from: (table: string) => {
      const etat: Record<string, unknown> = {
        insert: (payload: unknown) => {
          const erreur = erreursInsert[table] ?? null;
          if (!erreur) {
            const lignes = Array.isArray(payload) ? payload : [payload];
            for (const p of lignes) inserts.push({ __table: table, ...(p as object) });
          }
          const promesse = Promise.resolve({ data: lignesApresInsert, error: erreur });
          // `documents_compta` enchaîne `.insert().select().single()`.
          (promesse as unknown as Record<string, unknown>).select = () => {
            const p2 = Promise.resolve({ data: lignesApresInsert, error: erreur });
            (p2 as unknown as Record<string, unknown>).single = async () => ({
              data: lignesApresInsert[0] ?? null,
              error: erreur,
            });
            return p2;
          };
          return promesse;
        },
        update: () => Promise.resolve({ data: null, error: null }),
        delete: () => Promise.resolve({ data: null, error: null }),
        upsert: () => Promise.resolve({ data: null, error: null }),
      };
      etat.select = () => etat;
      etat.order = () => etat;
      etat.eq = () => etat;
      etat.neq = () => etat;
      etat.in = () => etat;
      etat.limit = () => etat;
      etat.maybeSingle = async () => ({ data: null, error: null });
      etat.single = async () => {
        // `sav/[id]` charge son ticket par `.single()` : sans ligne, le bouton
        // « Générer Devis » n'est jamais rendu.
        if (table === "tickets_sav") {
          return {
            data: {
              id: paramsSav.id,
              type_sinistre: "Infiltration",
              description: "Reprise de bardage",
              sous_garantie: false,
              chantier_id: CHANTIER_ID,
              // `setTicket({ ...data })` REMPLACE l'objet entier : les objets
              // imbriqués doivent venir du mock, sinon `ticket.photos.avant`
              // explose au rendu.
              photos: { client: null, avant: null, apres: null },
              clients: { id: CLIENT_ID, nom: "Client Test" },
              chantiers: {
                id: CHANTIER_ID,
                nom: "Chantier Test",
                client_id: CLIENT_ID,
                adresse_chantier: "1 rue du test",
                clients: { id: CLIENT_ID, nom: "Client Test", societe: "SCI TEST" },
              },
            },
            error: null,
          };
        }
        return { data: lignesApresInsert[0] ?? null, error: null };
      };
      // `chantiers` doit renvoyer une ligne : sans elle, le `<select>` du
      // formulaire de note ne contient que l'option vide.
      etat.then = (r: (v: Resolution) => unknown) =>
        r({
          data:
            table === "chantiers"
              ? [{ id: CHANTIER_ID, nom: "Chantier Test" }]
              : table === "clients"
                ? [{ id: CLIENT_ID, nom: "Client Test", societe: "SCI TEST" }]
                : [],
          error: null,
        });
      return etat;
    },
  },
}));

/** Session simulée : c'est elle qui alimente `app_metadata.entreprise_id`. */
let session: { user: { app_metadata: Record<string, unknown> } };

// `sav/[id]` est une page dynamique : on lui fournit un id et un routeur.
let paramsSav: { id: string };
let pushes: string[] = [];
vi.mock("next/navigation", () => ({
  useParams: () => paramsSav,
  useRouter: () => ({ push: (u: string) => pushes.push(u) }),
  usePathname: () => "/bureau/sav/x",
  useSearchParams: () => new URLSearchParams(),
}));

let conteneur: HTMLDivElement;
let root: Root;
let alertes: string[] = [];

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  inserts = [];
  erreursInsert = {};
  lignesApresInsert = [];
  alertes = [];
  pushes = [];
  paramsSav = { id: "ticket-1" };
  session = { user: { app_metadata: { entreprise_id: BNA } } };
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  vi.stubGlobal("alert", (m: unknown) => {
    alertes.push(String(m));
  });
});

afterEach(() => {
  act(() => root.unmount());
  conteneur.remove();
  vi.unstubAllGlobals();
});

/** Remonte une page neuve (utile pour l'isolation inter-tenant). */
async function monter(modPath: string): Promise<void> {
  act(() => root.unmount());
  conteneur.remove();
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  const mod = (await import(modPath)) as { default: () => unknown };
  await act(async () => {
    root.render(createElement(mod.default as never));
  });
}

function insert(table: string): Record<string, unknown>[] {
  return inserts.filter((i) => i.__table === table);
}

/** Saisit une valeur dans un champ React contrôlé. */
async function saisir(el: Element, valeur: string): Promise<void> {
  const proto =
    el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : el.tagName === "SELECT"
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(el, valeur);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function soumettre(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

// ════════════════════════════════════════════════════════════════════════════
// notes_patron — app/terrain/notes
// ════════════════════════════════════════════════════════════════════════════

/** Rend la page notes, ouvre le bottom-sheet, saisit un contenu et soumet. */
async function soumettreNoteTerrain(): Promise<Record<string, unknown>[]> {
  await monter("@/app/terrain/notes/page");
  // Le formulaire de création vit dans un bottom-sheet : il n'existe pas avant.
  const ouverture = [...document.querySelectorAll("button")].find((b) =>
    /Rédiger ou dicter une note|Nouvelle Note/i.test(b.textContent ?? ""),
  ) as HTMLButtonElement;
  expect(ouverture, "le bouton d'ouverture du bottom-sheet doit exister").toBeTruthy();
  await act(async () => {
    ouverture.click();
  });
  const forms = [...document.querySelectorAll("form")];
  // Le formulaire de CRÉATION est celui qui contient la textarea `required`
  // de saisie (l'autre est le formulaire d'édition d'une note existante).
  const form = forms.find((f) =>
    f.querySelector('textarea[placeholder*="Tapez votre note"]'),
  ) as HTMLFormElement;
  expect(form, "le formulaire de création de note doit être monté").toBeTruthy();
  const zone = form.querySelector('textarea[placeholder*="Tapez votre note"]')!;
  await saisir(zone, "Contrôle O3-B9");
  await soumettre(form);
  return insert("notes_patron");
}

describe("O3-B9 — notes_patron (page terrain) : table racine", () => {
  it("insère la note avec l'entreprise du CLAIM, sans constante en dur", async () => {
    const ins = await soumettreNoteTerrain();
    expect(ins).toHaveLength(1);
    expect(ins[0].entreprise_id).toBe(BNA);
    expect(ins[0].contenu).toBe("Contrôle O3-B9");
    expect(ins[0].entreprise_id).not.toBe(TEST);
    expect(alertes).toEqual([]);
  });

  it("FAIL-CLOSED : claim absent → AUCUNE écriture", async () => {
    session = { user: { app_metadata: {} } };
    expect(await soumettreNoteTerrain()).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("FAIL-CLOSED : claim malformé → AUCUNE écriture", async () => {
    session = { user: { app_metadata: { entreprise_id: "BNA-NOT-A-UUID" } } };
    expect(await soumettreNoteTerrain()).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("FAIL-CLOSED : le refus est SIGNALÉ (jamais un échec silencieux)", async () => {
    session = { user: { app_metadata: {} } };
    await soumettreNoteTerrain();
    expect(alertes).toHaveLength(1);
    expect(alertes[0]).toMatch(/entreprise/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// clients — app/bureau/clients
// ════════════════════════════════════════════════════════════════════════════

async function soumettreClient(): Promise<Record<string, unknown>[]> {
  await monter("@/app/bureau/clients/page");
  // Le bouton d'ouverture porte `aria-label="Ajouter un client"`.
  const fab = document.querySelector(
    'button[aria-label="Ajouter un client"]',
  ) as HTMLButtonElement;
  expect(fab, "le bouton d'ouverture du formulaire client doit exister").toBeTruthy();
  await act(async () => {
    fab.click();
  });
  const form = document.querySelector("form") as HTMLFormElement;
  expect(form, "le formulaire client doit être monté").toBeTruthy();
  // `handleSubmit` sort immédiatement si `nom` est vide.
  const champNom = form.querySelector(
    'input[placeholder*="Jean Dupont"], input[placeholder*="M. et Mme"]',
  )!;
  await saisir(champNom, "Client O3-B9");
  await soumettre(form);
  return insert("clients");
}

describe("O3-B9 — clients (page bureau) : table racine", () => {
  it("insère le client avec l'entreprise du CLAIM", async () => {
    const ins = await soumettreClient();
    expect(ins).toHaveLength(1);
    expect(ins[0].entreprise_id).toBe(BNA);
    expect(ins[0].nom).toBe("Client O3-B9");
    expect(alertes).toEqual([]);
  });

  it("FAIL-CLOSED : claim absent → AUCUNE écriture", async () => {
    session = { user: { app_metadata: {} } };
    expect(await soumettreClient()).toHaveLength(0);
    expect(inserts).toHaveLength(0);
    expect(alertes[0]).toMatch(/entreprise/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// fournisseurs — app/bureau/fournisseurs
// ════════════════════════════════════════════════════════════════════════════

async function soumettreFournisseur(): Promise<Record<string, unknown>[]> {
  await monter("@/app/bureau/fournisseurs/page");
  // Le formulaire n'existe qu'après ouverture du modal.
  const ouverture = [...document.querySelectorAll("button")].find((b) =>
    /Nouveau Fournisseur/i.test(b.textContent ?? ""),
  ) as HTMLButtonElement;
  expect(ouverture, "le bouton d'ouverture du modal fournisseur doit exister").toBeTruthy();
  await act(async () => {
    ouverture.click();
  });
  const forms = [...document.querySelectorAll("form")];
  // `creerFournisseur` est le handler du formulaire qui porte le champ `fNom`.
  const form = forms.find((f) => f.querySelector('input[placeholder*="Nom"]')) as
    | HTMLFormElement
    | undefined;
  expect(form, "le formulaire fournisseur doit être monté").toBeTruthy();
  const champNom = form!.querySelector('input[placeholder*="Nom"]')!;
  await saisir(champNom, "Fournisseur O3-B9");
  await soumettre(form!);
  return insert("fournisseurs");
}

describe("O3-B9 — fournisseurs (page bureau) : table racine", () => {
  it("insère le fournisseur avec l'entreprise du CLAIM", async () => {
    const ins = await soumettreFournisseur();
    expect(ins).toHaveLength(1);
    expect(ins[0].entreprise_id).toBe(BNA);
    expect(ins[0].nom).toBe("Fournisseur O3-B9");
    expect(alertes).toEqual([]);
  });

  it("FAIL-CLOSED : claim absent → AUCUNE écriture", async () => {
    session = { user: { app_metadata: {} } };
    expect(await soumettreFournisseur()).toHaveLength(0);
    expect(inserts).toHaveLength(0);
    expect(alertes[0]).toMatch(/entreprise/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// fournisseurs — app/bureau/documents-compta (flux OCR)
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B9 — fournisseurs (documents-compta, flux OCR) : table racine", () => {
  beforeEach(() => {
    // L'OCR renvoie un fournisseur INCONNU → l'UI propose « + Créer ».
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ fournisseur_nom: "Fournisseur OCR Inconnu" }),
      })),
    );
  });

  async function declencherOcrProposerUnknown(): Promise<HTMLButtonElement> {
    await monter("@/app/bureau/documents-compta/page");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input, "le champ fichier doit être monté").toBeTruthy();
    const fichier = new File(["x"], "ticket.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [fichier], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // Le bouton « + Créer » n'apparaît qu'une fois `fpPropose` positionné.
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /Créer/.test(b.textContent ?? ""),
    ) as HTMLButtonElement;
    expect(btn, "le bouton de création du fournisseur OCR doit apparaître").toBeTruthy();
    return btn;
  }

  it("crée le fournisseur OCR avec l'entreprise du CLAIM", async () => {
    const btn = await declencherOcrProposerUnknown();
    lignesApresInsert = [{ id: "four-1", nom: "Fournisseur OCR Inconnu" }];
    await act(async () => {
      btn.click();
    });
    const ins = insert("fournisseurs");
    expect(ins).toHaveLength(1);
    expect(ins[0].entreprise_id).toBe(BNA);
    expect(ins[0].nom).toBe("Fournisseur OCR Inconnu");
  });

  it("FAIL-CLOSED : claim absent → AUCUNE écriture, et l'erreur est affichée", async () => {
    session = { user: { app_metadata: {} } };
    const btn = await declencherOcrProposerUnknown();
    await act(async () => {
      btn.click();
    });
    expect(insert("fournisseurs")).toHaveLength(0);
    expect(inserts).toHaveLength(0);
    // L'échec doit être VISIBLE dans la page (pas un simple console.error).
    expect(document.body.textContent).toMatch(/entreprise/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// devis — app/bureau/sav/[id]
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B9 — devis (page SAV) : table racine", () => {
  beforeEach(() => {
    // La page charge le ticket via `.from("tickets_sav")` ; le mock renvoie une
    // ligne pour que le handler de création de devis soit atteignable.
    lignesApresInsert = [];
  });

  async function monterSavEtCreerDevis(): Promise<void> {
    await monter("@/app/bureau/sav/[id]/page");
    // `window.prompt` collecte le montant HT demandé par la page.
    vi.stubGlobal("prompt", () => "150.50");
    // Le bouton n'est rendu que si le ticket n'est PAS sous garantie.
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /Générer Devis/i.test(b.textContent ?? ""),
    ) as HTMLButtonElement | undefined;
    expect(btn, "le bouton « Générer Devis » doit exister").toBeTruthy();
    await act(async () => {
      btn!.click();
    });
  }

  it("insère le devis avec l'entreprise du CLAIM (et non via le chantier)", async () => {
    await monterSavEtCreerDevis();
    const ins = insert("devis");
    expect(ins).toHaveLength(1);
    // Point clé du B9 : `devis` n'a AUCUN trigger. Le `chantier_id` présent ne
    // peut pas aider — la valeur doit venir du claim.
    expect(ins[0].entreprise_id).toBe(BNA);
    expect(ins[0].entreprise_id).not.toBe(TEST);
  });

  it("FAIL-CLOSED : claim absent → AUCUNE écriture de devis", async () => {
    session = { user: { app_metadata: {} } };
    await monterSavEtCreerDevis();
    expect(insert("devis")).toHaveLength(0);
    expect(alertes.some((a) => /entreprise/i.test(a))).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ISOLATION INTER-TENANT (toutes racines)
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B9 — isolation inter-tenant sur les tables racines", () => {
  it("notes_patron : BNA puis TEST n'empruntent jamais l'identité de l'autre", async () => {
    session = { user: { app_metadata: { entreprise_id: BNA } } };
    const a = await soumettreNoteTerrain();
    expect(a[0].entreprise_id).toBe(BNA);

    // `inserts` est un journal CUMULATIF : sans cette remise à zéro, `b[0]`
    // serait encore la première écriture et le test passerait à vide.
    inserts = [];
    session = { user: { app_metadata: { entreprise_id: TEST } } };
    const b = await soumettreNoteTerrain();
    expect(b[0].entreprise_id).toBe(TEST);

    expect(a[0].entreprise_id).not.toBe(TEST);
    expect(b[0].entreprise_id).not.toBe(BNA);
  });

  it("clients : la valeur écrite est bien celle du claim, pas un littéral", async () => {
    session = { user: { app_metadata: { entreprise_id: TEST } } };
    const ins = await soumettreClient();
    expect(ins[0].entreprise_id).toBe(TEST);
  });
});
