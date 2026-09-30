// O3-B10 — Tests comportementaux de TresorerieWidget (le CHEMIN APPELANT)
// ============================================================================
//
// Le hook `useParametreFinance` est testé dans `b10-usefinance.test.tsx`. Ce
// fichier couvre ce qui restait à prouver : ce que fait l'INTERFACE quand
// l'écriture échoue.
//
// Le défaut visible par l'utilisateur n'était pas « l'upsert échoue » mais
// « l'interface dit que ça a réussi » : `handleSave` faisait
// `setIsEditing(false)` inconditionnellement, l'aperçu optimiste affichait le
// nouveau montant, et le tout disparaissait au rechargement. Un montant
// financier non persisté était présenté comme enregistré.
//
// On monte donc le VRAI composant sur un DOM réel, avec `@/lib/supabase`
// entièrement simulé : aucun réseau, aucun DML, aucun secret.
//
// Infrastructure : `@testing-library/react@9.5.0` est inutilisable (React 19).
// On passe par `createRoot` + `act`, comme en O3-B8/B9.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";

const BNA = "11111111-1111-4111-8111-111111111111";

type Upsert = { table: string; payload: Record<string, unknown>; onConflict: string | undefined };

let upserts: Upsert[] = [];
let erreurUpsert: { message: string } | null = null;
let lignesParam: { valeur: number }[] = [];
let session: { user: { app_metadata: Record<string, unknown> } | null };

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: session.user }, error: null }),
    },
    from: (table: string) => {
      const etat: Record<string, unknown> = {};
      etat.upsert = (payload: unknown, opts?: { onConflict?: string }) => {
        upserts.push({
          table,
          payload: payload as Record<string, unknown>,
          onConflict: opts?.onConflict,
        });
        return Promise.resolve({ data: null, error: erreurUpsert });
      };
      etat.insert = () => Promise.resolve({ data: null, error: null });
      etat.update = () => Promise.resolve({ data: null, error: null });
      etat.delete = () => Promise.resolve({ data: null, error: null });
      etat.maybeSingle = async () => ({ data: lignesParam[0] ?? null, error: null });
      etat.single = async () => ({ data: lignesParam[0] ?? null, error: null });
      etat.then = (r: (v: { data: unknown; error: unknown }) => unknown) =>
        r({ data: [], error: null });

      // Le composant monte le VRAI `useTresorerie`, dont les requêtes
      // chaînent `.select().in().gte().lte().not()` sur `factures` et
      // `commandes`. Énumérer ces méthodes une par une les fait toutes
      // oublier au premier `.not()` oublié : le `Proxy` renvoie la chaîne pour
      // TOUTE méthode de filtrage, présente ou future. Seuls les symboles
      // restent `undefined`, sinon le `thenable` se ferait passer pour un
      // itérable.
      const etatChaine: Record<string, unknown> = new Proxy(etat, {
        get(cible, prop) {
          if (typeof prop === "symbol" || prop in cible) return cible[prop as string];
          return () => etatChaine;
        },
      });
      return etatChaine;
    },
  },
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
  upserts = [];
  erreurUpsert = null;
  lignesParam = [{ valeur: 2500 }];
  session = { user: { app_metadata: { entreprise_id: BNA } } };
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
});

afterEach(() => {
  act(() => root.unmount());
  conteneur.remove();
});

/** Le texte, normalisé : `Intl` fr-FR insère des espaces insécables. */
function texte(): string {
  return (conteneur.textContent ?? "").replace(/[\u00a0\u202f]/g, " ");
}

/** Nombre d'occurrences d'un montant — pour compter les soldes affichés. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function inputEdition(): HTMLInputElement | null {
  return conteneur.querySelector('input[type="number"]');
}

function boutonSaisir(): HTMLButtonElement | null {
  return conteneur.querySelector('button[title="Saisir le solde"]');
}

function boutonOk(): HTMLButtonElement | null {
  return [...conteneur.querySelectorAll("button")].find((b) => b.textContent?.trim() === "OK") ?? null;
}

function alerte(): string | null {
  const el = conteneur.querySelector('[role="alert"]');
  return el ? (el.textContent ?? "") : null;
}

async function monterWidget(): Promise<void> {
  const mod = (await import("@/app/(dashboard)/finance/components/TresorerieWidget")) as {
    default: () => unknown;
  };
  await act(async () => {
    root.render(createElement(mod.default as never));
  });
}

/** Saisit une valeur dans l'input React contrôlé (setter natif + événement). */
async function saisir(valeur: string): Promise<void> {
  const el = inputEdition();
  expect(el, "input d'édition introuvable").toBeTruthy();
  const proto = Object.getPrototypeOf(el as HTMLInputElement) as {
    value: string;
    [k: string]: unknown;
  };
  const descripteur = Object.getOwnPropertyDescriptor(proto, "value");
  descripteur?.set?.call(el, valeur);
  await act(async () => {
    el!.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

async function cliquer(el: Element | null, quoi: string): Promise<void> {
  expect(el, `${quoi} introuvable`).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function saisirSolde(valeur: string): Promise<void> {
  await cliquer(boutonSaisir(), "bouton de saisie");
  await saisir(valeur);
}

// ---------------------------------------------------------------------------
// A — SUCCÈS : l'interface se comporte normalement.
// ---------------------------------------------------------------------------

describe("O3-B10 — A. succès d'écriture", () => {
  it("A1 l'écriture est tentée avec le tenant et la bonne cible de conflit", async () => {
    await monterWidget();
    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");

    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe("parametres_finance");
    expect(upserts[0].payload).toEqual({ cle: "solde_bancaire", valeur: 4242, entreprise_id: BNA });
    expect(upserts[0].onConflict).toBe("entreprise_id,cle");
  });

  it("A2 l'édition se REFERME après une écriture réussie", async () => {
    await monterWidget();
    await saisirSolde("4242");
    expect(inputEdition()).toBeTruthy();

    await cliquer(boutonOk(), "bouton OK");
    expect(inputEdition(), "l'édition aurait dû se refermer").toBeNull();
  });

  it("A3 le nouveau solde est affiché après succès", async () => {
    await monterWidget();
    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");

    expect(texte()).toContain("4 242,00");
    expect(texte()).not.toContain("2 500,00");
  });

  it("A4 aucun message d'erreur n'est affiché après un succès", async () => {
    await monterWidget();
    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");

    expect(alerte()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B — ÉCHEC PostgREST : l'interface ne doit PAS prétendre que ça a réussi.
// C'est le cœur du défaut observé par l'utilisateur.
// ---------------------------------------------------------------------------

describe("O3-B10 — B. échec d'écriture (erreur PostgREST)", () => {
  beforeEach(() => {
    erreurUpsert = { message: "violation de la contrainte d unicité" };
  });

  it("B1 l'édition RESTE OUVERTE : la saisie n'est pas présentée comme acquise", async () => {
    await monterWidget();
    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");

    expect(inputEdition(), "l'édition a été refermée alors que l'écriture a échoué").toBeTruthy();
  });

  it("B2 le nouveau montant n'est PAS affiché comme enregistré", async () => {
    await monterWidget();
    expect(texte()).toContain("2 500,00");

    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");

    // Le champ de saisie contient 4242 (c'est normal : l'utilisateur le
    // saisit), mais le SOLDE AFFICHÉ doit rester l'ancien.
    expect(texte()).not.toContain("4 242,00 €");
  });

  it("B3 le solde prévisionnel n'est PAS recalculé sur une valeur fantôme", async () => {
    await monterWidget();

    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");

    // « Solde actuel » est remplacé par l'input (l'utilisateur est en cours de
    // saisie) : il ne reste donc QU'UN montant formaté, celui du solde
    // prévisionnel. S'il avait été recalculé sur 4242, il afficherait 4242.
    expect(occurrences(texte(), "4 242,00 €"), "le montant non persisté est affiché").toBe(0);
    expect(occurrences(texte(), "2 500,00 €"), "le prévisionnel n'est plus sur l'ancien solde").toBe(1);
  });

  it("B4 un message d'erreur EST affiché", async () => {
    await monterWidget();
    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");

    expect(alerte(), "aucun message d'erreur affiché").toBeTruthy();
    expect(alerte()).toMatch(/impossible/i);
  });

  it("B5 le message d'erreur cite la cause renvoyée par le serveur", async () => {
    await monterWidget();
    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");

    expect(alerte()).toMatch(/violation de la contrainte d unicité/);
  });

  it("B6 l'utilisateur peut réessayer sans rouvrir l'édition à la main", async () => {
    await monterWidget();
    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");
    expect(inputEdition()).toBeTruthy();

    // Le second essai réussit : l'échec n'a pas « grillé » le formulaire.
    erreurUpsert = null;
    await cliquer(boutonOk(), "bouton OK");

    expect(inputEdition()).toBeNull();
    expect(alerte()).toBeNull();
    expect(texte()).toContain("4 242,00");
  });

  it("B7 un message d'échec périmé ne reste pas affiché après un succès", async () => {
    await monterWidget();
    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");
    expect(alerte(), "le message d'échec devrait être visible").toBeTruthy();

    // L'utilisateur corrige et réessaie : cette fois ça passe. Le message
    // d'échec ne doit pas rester collé à l'écran — il décrit un état qui
    // n'est plus le sien.
    erreurUpsert = null;
    await cliquer(boutonOk(), "bouton OK");

    expect(alerte(), "un message d'erreur périmé reste affiché").toBeNull();
    expect(inputEdition()).toBeNull();
    expect(texte()).toContain("4 242,00");
  });
});

// ---------------------------------------------------------------------------
// C — fail-closed : sans tenant, rien n'est écrit ET rien n'est présenté.
// ---------------------------------------------------------------------------

describe("O3-B10 — C. fail-closed sans contexte entreprise", () => {
  it("C1 claim ABSENT : aucune écriture, édition ouverte, message affiché", async () => {
    session = { user: { app_metadata: {} } };
    await monterWidget();
    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");

    expect(upserts, "une écriture a été tentée sans claim").toHaveLength(0);
    expect(inputEdition()).toBeTruthy();
    expect(alerte()).toBeTruthy();
  });

  it("C2 claim MALFORMÉ : aucune écriture, message affiché", async () => {
    session = { user: { app_metadata: { entreprise_id: "pas-un-uuid" } } };
    await monterWidget();
    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");

    expect(upserts).toHaveLength(0);
    expect(inputEdition()).toBeTruthy();
    expect(alerte()).toMatch(/session|entreprise|reconnect/i);
  });

  it("C3 fail-closed : le solde affiché n'est pas modifié", async () => {
    session = { user: { app_metadata: {} } };
    await monterWidget();
    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");

    expect(texte()).toContain("2 500,00");
    expect(texte()).not.toContain("4 242,00 €");
  });
});

// ---------------------------------------------------------------------------
// D — régression : le solde reste saisissable (le cas nominal ne doit pas
// avoir été cassé par le correctif).
// ---------------------------------------------------------------------------

describe("O3-B10 — D. régression « le solde reste saisissable »", () => {
  it("D1 le solde s'affiche à l'ouverture", async () => {
    await monterWidget();
    expect(texte()).toContain("2 500,00");
    expect(boutonSaisir(), "le bouton de saisie a disparu").toBeTruthy();
  });

  it("D2 le bouton OK apparaît et l'input est pré-rempli", async () => {
    await monterWidget();
    await cliquer(boutonSaisir(), "bouton de saisie");

    expect(inputEdition()).toBeTruthy();
    expect(inputEdition()!.value).toBe("2500");
    expect(boutonOk()).toBeTruthy();
  });

  it("D3 la touche Entrée déclenche aussi l'enregistrement", async () => {
    await monterWidget();
    await saisirSolde("4242");
    await cliquer(boutonOk(), "bouton OK");
    expect(upserts).toHaveLength(1);

    // Second passage via le clavier.
    await cliquer(boutonSaisir(), "bouton de saisie");
    await saisir("777");
    const el = inputEdition()!;
    await act(async () => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(upserts).toHaveLength(2);
    expect(upserts[1].payload.valeur).toBe(777);
  });

  it("D4 une saisie non numérique n'écrit rien et ne ferme pas l'édition", async () => {
    await monterWidget();
    await cliquer(boutonSaisir(), "bouton de saisie");
    await saisir("abc");
    await cliquer(boutonOk(), "bouton OK");

    expect(upserts).toHaveLength(0);
    expect(inputEdition()).toBeTruthy();
  });

  it("D5 un solde négatif est accepté (découvert volontaire)", async () => {
    await monterWidget();
    await saisirSolde("-500");
    await cliquer(boutonOk(), "bouton OK");

    expect(upserts[0].payload.valeur).toBe(-500);
    expect(inputEdition()).toBeNull();
  });

  it("D6 un solde nul est accepté (et remplace bien la valeur)", async () => {
    await monterWidget();
    await saisirSolde("0");
    await cliquer(boutonOk(), "bouton OK");

    // 0 est un cas limite : un test naïf `if (valeur)` le laisserait passer sans
    // écrire. `updateValeur(0)` doit réellement être appelé.
    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload.valeur).toBe(0);
  });
});
