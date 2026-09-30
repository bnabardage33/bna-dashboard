// O3-B9-bis — Tables ENFANT : le mode « sans chantier » doit SURVIVRE au correctif
// ============================================================================
//
// Le cas B9-bis est distinct du B9 racine, et la distinction est tout le sujet de
// ce fichier.
//
// Sur une table ENFANT (`depenses_chantier`, `frais_interim`, `commandes`), le
// trigger `tg_set_entreprise_par_chantier()` dérive `entreprise_id` du chantier
// — MAIS c'est un NO-OP silencieux lorsque `chantier_id IS NULL` :
//
//     if new.chantier_id is not null then … end if;
//            ↑ rien ne se passe, aucune erreur
//
// Or trois écrans OFFRENT explicitement le fonctionnement sans chantier :
//   • dépense        « -- Sans affectation -- »
//   • frais d'intérim « -- Sans affectation -- »
//   • commandes      « -- Chantier (optionnel) -- »
//
// C'est une règle métier EXISTANTE. Rendre le chantier obligatoire serait une
// décision produit : ces tests vérifient donc qu'elle est PRÉSERVÉE, pas
// supprimée.
//
// Le correctif fournit `entreprise_id` depuis le claim dans CE SEUL cas, et
// laisse le trigger faire son travail quand le chantier est présent.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";

const BNA = "11111111-1111-4111-8111-111111111111";
const CHANTIER_ID = "b6242309-0000-4000-8000-000000000001";
const FOURNISSEUR_ID = "77000000-0000-4000-8000-000000000001";

/**
 * `Promise.resolve` enrichi des méthodes de chaîne PostgREST : une `Promise`
 * nue n'expose pas `.select()`.
 */
type ChainePostgREST<T> = Promise<T> & { select?: (...args: unknown[]) => unknown };

function insere<T>(valeur: T): ChainePostgREST<T> {
  return Promise.resolve(valeur) as ChainePostgREST<T>;
}

/** Inserts réellement tentés. */
let inserts: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: session.user }, error: null }),
    },
    from: (table: string) => {
      const etat: Record<string, unknown> = {
        insert: (payload: unknown) => {
          const lignes = Array.isArray(payload) ? payload : [payload];
          for (const p of lignes) inserts.push({ __table: table, ...(p as object) });
          const p = insere({ data: lignes, error: null });
          p.select = () => insere({ data: lignes, error: null });
          return p;
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
      etat.single = async () => ({ data: null, error: null });
      etat.then = (r: (v: unknown) => unknown) =>
        r({
          data:
            table === "chantiers"
              ? [{ id: CHANTIER_ID, nom: "Chantier Test", clients: { nom: "Cli" } }]
              : table === "fournisseurs"
                ? [{ id: FOURNISSEUR_ID, nom: "Fournisseur Test" }]
                : [],
          error: null,
        });
      return etat;
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/x",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "x" }),
}));

let session: { user: { app_metadata: Record<string, unknown> } };

let conteneur: HTMLDivElement;
let root: Root;
let alertes: string[] = [];
let messagesAffiche: string[] = [];

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  inserts = [];
  alertes = [];
  messagesAffiche = [];
  session = { user: { app_metadata: { entreprise_id: BNA } } };
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  vi.stubGlobal("alert", (m: unknown) => alertes.push(String(m)));
});

afterEach(() => {
  act(() => root.unmount());
  conteneur.remove();
  vi.unstubAllGlobals();
});

async function monter(modPath: string): Promise<void> {
  const mod = (await import(modPath)) as { default: () => unknown };
  await act(async () => {
    root.render(createElement(mod.default as never));
  });
}

function insert(table: string): Record<string, unknown>[] {
  return inserts.filter((i) => i.__table === table);
}

async function saisir(el: Element, valeur: string): Promise<void> {
  const proto =
    el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : el.tagName === "SELECT"
        ? window.HTMLSelectElement.prototype
        : el.tagName === "TEXT"
          ? window.HTMLInputElement.prototype
          : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(el, valeur);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function soumettre(form: Element): Promise<void> {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

/** Sélectionne un `<select>` par le texte de son option vide. */
function selectParOptionVide(form: Element, libelle: string): HTMLSelectElement {
  const sel = [...form.querySelectorAll("select")].find((s) =>
    s.textContent?.includes(libelle),
  );
  if (!sel) throw new Error(`<select> « ${libelle} » introuvable`);
  return sel as HTMLSelectElement;
}

// ════════════════════════════════════════════════════════════════════════════
// depenses_chantier — finance/saisie/depense
// ════════════════════════════════════════════════════════════════════════════

/** Saisit une dépense. `chantierId` = "" reproduit l'option « Sans affectation ». */
async function saisirDepense(chantierId: string): Promise<void> {
  await monter("@/app/(dashboard)/finance/saisie/depense/page");
  const form = conteneur.querySelector("form")!;
  expect(form, "le formulaire de dépense doit être monté").toBeTruthy();
  await saisir(selectParOptionVide(form, "Sans affectation"), chantierId);
  const montant = form.querySelector('input[type="number"][required]')!;
  await saisir(montant, "1200");
  await soumettre(form);
}

describe("O3-B9-bis — depenses_chantier (écran « Saisie dépense »)", () => {
  it("NON-RÉGRESSION : l'option « -- Sans affectation -- » EXISTE toujours", async () => {
    await monter("@/app/(dashboard)/finance/saisie/depense/page");
    const form = conteneur.querySelector("form")!;
    const sel = selectParOptionVide(form, "Sans affectation");
    // Le chantier n'est PAS `required` : le rendre obligatoire serait un
    // changement produit, interdit ici.
    expect(sel.hasAttribute("required")).toBe(false);
    expect(sel.querySelector('option[value=""]')).toBeTruthy();
  });

  it("mode SANS chantier : l'écriture est tentée ET entreprise_id est fourni", async () => {
    await saisirDepense("");
    const ins = insert("depenses_chantier");
    expect(ins).toHaveLength(1);
    expect(ins[0].chantier_id).toBeNull();
    // C'est le cœur du correctif : sans chantier, le trigger ne pose RIEN.
    expect(ins[0].entreprise_id).toBe(BNA);
    expect(alertes).toEqual([]);
  });

  it("mode AVEC chantier : entreprise_id est OMIS (le trigger reste maître)", async () => {
    await saisirDepense(CHANTIER_ID);
    const ins = insert("depenses_chantier");
    expect(ins).toHaveLength(1);
    expect(ins[0].chantier_id).toBe(CHANTIER_ID);
    // Point de non-régression du mécanisme existant : si on posait l'entreprise
    // ici, on court-circuiterait le trigger et on casserait la cohérence
    // chantier ↔ entreprise (règle produit décrite dans lib/contexteEntreprise).
    expect("entreprise_id" in ins[0]).toBe(false);
  });

  it("FAIL-CLOSED : sans chantier ET sans claim → AUCUNE écriture", async () => {
    session = { user: { app_metadata: {} } };
    await saisirDepense("");
    expect(inserts).toHaveLength(0);
    // L'échec doit être REMONTÉ : la page possède déjà un état d'erreur.
    expect(conteneur.textContent).toMatch(/entreprise/i);
  });

  it("avec chantier ET sans claim : l'écriture reste possible (le trigger suffit)", async () => {
    session = { user: { app_metadata: {} } };
    await saisirDepense(CHANTIER_ID);
    const ins = insert("depenses_chantier");
    expect(ins).toHaveLength(1);
    expect(ins[0].chantier_id).toBe(CHANTIER_ID);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// frais_interim (+ dépense miroir) — finance/saisie/frais-interim
// ════════════════════════════════════════════════════════════════════════════

/** Saisit une ligne d'intérim. */
async function saisirInterim(chantierId: string): Promise<void> {
  await monter("@/app/(dashboard)/finance/saisie/frais-interim/page");
  const form = conteneur.querySelector("form")!;
  expect(form, "le formulaire d'intérim doit être monté").toBeTruthy();
  await saisir(selectParOptionVide(form, "Sans affectation"), chantierId);
  const textes = form.querySelectorAll('input[type="text"]');
  await saisir(textes[0], "Adecco"); // agence
  await saisir(textes[1], "Gaël Martin"); // intérimaire
  await saisir(form.querySelectorAll('input[type="number"]')[0], "2500"); // salaire brut
  await soumettre(form);
}

describe("O3-B9-bis — frais_interim + dépense miroir (écran « Frais d'intérim »)", () => {
  it("NON-RÉGRESSION : « -- Sans affectation -- » existe et n'est pas required", async () => {
    await monter("@/app/(dashboard)/finance/saisie/frais-interim/page");
    const form = conteneur.querySelector("form")!;
    const sel = selectParOptionVide(form, "Sans affectation");
    expect(sel.hasAttribute("required")).toBe(false);
  });

  it("mode SANS chantier : l'insert PRINCIPAL reçoit entreprise_id", async () => {
    // Site le plus grave du B9-bis : sans cette valeur, la saisie d'intérim
    // sans chantier est ENTIÈREMENT bloquée.
    await saisirInterim("");
    const ins = insert("frais_interim");
    expect(ins).toHaveLength(1);
    expect(ins[0].chantier_id).toBeNull();
    expect(ins[0].entreprise_id).toBe(BNA);
  });

  it("mode SANS chantier : la DÉPENSE MIROIR reçoit aussi entreprise_id", async () => {
    // L'insert miroir ne montrait qu'un `console.error` : l'utilisateur croyait
    // sa dépense sous-traitance enregistrée alors qu'elle ne l'était pas.
    await saisirInterim("");
    const dep = insert("depenses_chantier");
    expect(dep).toHaveLength(1);
    expect(dep[0].entreprise_id).toBe(BNA);
    expect(dep[0].chantier_id).toBeNull();
    expect(dep[0].nature).toBe("sous_traitance");
  });

  it("mode AVEC chantier : les DEUX inserts omettent entreprise_id (trigger)", async () => {
    await saisirInterim(CHANTIER_ID);
    for (const t of ["frais_interim", "depenses_chantier"]) {
      const ins = insert(t);
      expect(ins, `${t} doit être écrit`).toHaveLength(1);
      expect(ins[0].chantier_id).toBe(CHANTIER_ID);
      expect("entreprise_id" in ins[0], `${t} ne doit pas porter entreprise_id`).toBe(false);
    }
  });

  it("FAIL-CLOSED : sans chantier ET sans claim → AUCUNE écriture des deux côtés", async () => {
    session = { user: { app_metadata: {} } };
    await saisirInterim("");
    expect(inserts).toHaveLength(0);
    expect(conteneur.textContent).toMatch(/entreprise/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// commandes — bureau/fournisseurs
// ════════════════════════════════════════════════════════════════════════════

/** Saisit une commande simple. */
async function saisirCommande(chantierId: string): Promise<void> {
  await monter("@/app/bureau/fournisseurs/page");
  const ouverture = [...conteneur.querySelectorAll("button")].find((b) =>
    /Nouvelle Commande/i.test(b.textContent ?? ""),
  ) as HTMLButtonElement;
  expect(ouverture, "le bouton d'ouverture du modal commande doit exister").toBeTruthy();
  await act(async () => {
    ouverture.click();
  });
  const form = [...conteneur.querySelectorAll("form")].find((f) =>
    f.querySelector('input[placeholder*="Désignation"]'),
  );
  expect(form, "le formulaire de commande doit être monté").toBeTruthy();
  await saisir(selectParOptionVide(form!, "Chantier (optionnel)"), chantierId);
  await saisir(form!.querySelector('input[placeholder*="Désignation"]')!, "Bardage Douglas");
  await soumettre(form!);
}

describe("O3-B9-bis — commandes (modal « Nouvelle commande »)", () => {
  it("NON-RÉGRESSION : « -- Chantier (optionnel) -- » existe et n'est pas required", async () => {
    await monter("@/app/bureau/fournisseurs/page");
    const ouverture = [...conteneur.querySelectorAll("button")].find((b) =>
      /Nouvelle Commande/i.test(b.textContent ?? ""),
    ) as HTMLButtonElement;
    await act(async () => {
      ouverture.click();
    });
    const sel = selectParOptionVide(conteneur, "Chantier (optionnel)");
    expect(sel.hasAttribute("required")).toBe(false);
  });

  it("mode SANS chantier : la commande reçoit entreprise_id", async () => {
    await saisirCommande("");
    const ins = insert("commandes");
    expect(ins).toHaveLength(1);
    expect(ins[0].chantier_id).toBeNull();
    expect(ins[0].entreprise_id).toBe(BNA);
  });

  it("mode AVEC chantier : entreprise_id est OMIS (trigger maître)", async () => {
    await saisirCommande(CHANTIER_ID);
    const ins = insert("commandes");
    expect(ins).toHaveLength(1);
    expect(ins[0].chantier_id).toBe(CHANTIER_ID);
    expect("entreprise_id" in ins[0]).toBe(false);
  });

  it("FAIL-CLOSED : sans chantier ET sans claim → AUCUNE commande", async () => {
    session = { user: { app_metadata: {} } };
    await saisirCommande("");
    expect(inserts).toHaveLength(0);
    expect(alertes.some((a) => /entreprise/i.test(a))).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Propriétés transverses
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B9-bis — propriétés transverses", () => {
  it("aucun écran B9-bis ne rend le chantier obligatoire", async () => {
    // Balayage explicite : le GO interdit de casser la règle métier, et un
    // `<select required>` la casserait silencieusement pour tous les tenants.
    for (const mod of [
      "@/app/(dashboard)/finance/saisie/depense/page",
      "@/app/(dashboard)/finance/saisie/frais-interim/page",
    ]) {
      act(() => root.unmount());
      conteneur.remove();
      conteneur = document.createElement("div");
      document.body.appendChild(conteneur);
      root = createRoot(conteneur);
      await monter(mod);
      for (const sel of conteneur.querySelectorAll("select")) {
        const libelle = sel.closest("div")?.textContent ?? "";
        if (/Chantier/i.test(libelle) || sel.textContent?.includes("Sans affectation")) {
          expect(sel.hasAttribute("required"), `${mod} : chantier rendu required`).toBe(
            false,
          );
        }
      }
    }
  });

  it("isolation : la valeur provient du claim, jamais d'une constante", async () => {
    session = { user: { app_metadata: { entreprise_id: BNA } } };
    await saisirDepense("");
    expect(insert("depenses_chantier")[0].entreprise_id).toBe(BNA);
    inserts = [];
    session = {
      user: {
        app_metadata: { entreprise_id: "22222222-2222-4222-8222-222222222222" },
      },
    };
    await saisirDepense("");
    expect(insert("depenses_chantier")[0].entreprise_id).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
  });
});
