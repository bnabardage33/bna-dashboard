// O3-B8 — Tests comportementaux de la création de chantier (page terrain)
// ============================================================================
//
// Ces tests EXÉCUTENT réellement `handleSubmit` sur un DOM réel, avec
// `@/lib/supabase` et `@/lib/contexteEntreprise` mockés, puis inspectent la
// valeur TRANSMISE à Supabase.
//
// Pourquoi ne pas se contenter d'un invariant de source : le défaut B8 était
// invisible au `tsc` précisément parce qu'un cast le neutralisait. Relire le
// fichier ne prouve que la FORME du code ; il faut capturer la valeur réellement
// écrite pour prouver le COMPORTEMENT.
//
// Infrastructure : `@testing-library/react@9.5.0` est inutilisable ici
// (`ReactDOM.render` a été retiré de React 19). On passe par `createRoot` +
// `act`, comme dans `searchnav-hooks.test.tsx`.
//
// Le résolveur `resoudreContexteEntreprise` n'est PAS mocké : on veut couvrir le
// vrai câblage page → résolveur → garde `estUuid` → payload. Seul
// `@/lib/supabase` est mocké, et il est lu par le résolveur.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { createElement } from "react";

const BNA = "11111111-1111-4111-8111-111111111111";
const TEST = "22222222-2222-4222-8222-222222222222";
const CLIENT_ID = "66084d5c-0000-4000-8000-000000000001";

/** Forme de la résolution d'une requête PostgREST simulée. */
type Resolution = {
  data: unknown[];
  error: { message: string } | null;
};

/** Inserts réellement tentés, par table. */
let inserts: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: session.user }, error: null }),
    },
    from: (table: string) => {
      const etat: Record<string, unknown> = {
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ __table: table, ...payload });
          return Promise.resolve({ data: null, error: null });
        },
        update: () => Promise.resolve({ data: null, error: null }),
        delete: () => Promise.resolve({ data: null, error: null }),
      };
      etat.select = () => etat;
      etat.order = () => etat;
      etat.or = () => etat;
      etat.neq = () => etat;
      etat.eq = () => etat;
      etat.maybeSingle = async () => ({ data: null, error: null });
      etat.single = async () => ({ data: null, error: null });
      // `clients` doit renvoyer une ligne : sans elle, le `<select>` du
      // formulaire ne contient que l'option vide et `handleSubmit` sort
      // immédiatement (`if (!clientId) return`).
      etat.then = (r: (v: Resolution) => unknown) =>
        r({
          data:
            table === "clients"
              ? [{ id: CLIENT_ID, nom: "Client Test", societe: "SCI TEST" }]
              : [],
          error: null,
        });
      return etat;
    },
  },
}));

// Session simulée : c'est elle qui alimente `app_metadata.entreprise_id`,
// lu par le VRAI `resoudreContexteEntreprise`.
let session: { user: { app_metadata: Record<string, unknown> } };

vi.mock("@/components/PlanningGantt", () => ({ default: () => null }));

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
  alertes = [];
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

function insertChantiers(): Record<string, unknown>[] {
  return inserts.filter((i) => i.__table === "chantiers");
}

/**
 * Rend la page, ouvre le modal de création, sélectionne un client et soumet.
 * Renvoie le nombre d'inserts `chantiers` observés.
 */
async function soumettreFormulaire(): Promise<Record<string, unknown>[]> {
  const { default: Page } = await import("@/app/terrain/chantier/page");
  await act(async () => {
    root.render(createElement(Page));
  });

  // 1. Ouvrir le bottom-sheet (le formulaire n'existe pas avant).
  const fab = document.querySelector(
    'button[aria-label="Ajouter un chantier"]',
  ) as HTMLButtonElement;
  expect(fab, "le bouton d'ouverture du formulaire doit exister").toBeTruthy();
  await act(async () => {
    fab.click();
  });

  const form = document.querySelector("form") as HTMLFormElement;
  expect(form, "le formulaire doit être monté après ouverture du modal").toBeTruthy();

  // 2. Sélectionner un client : `handleSubmit` sort immédiatement si clientId est vide.
  const select = form.querySelector("select") as HTMLSelectElement;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(select, CLIENT_ID);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // 3. Soumettre.
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  return insertChantiers();
}

// ════════════════════════════════════════════════════════════════════════════
// CAS NOMINAL
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B8 — création nominale (page terrain)", () => {
  it("insère UN chantier avec l'entreprise du claim, et sans cast ni constante", async () => {
    const ins = await soumettreFormulaire();

    expect(ins).toHaveLength(1);
    expect(ins[0].entreprise_id).toBe(BNA);
    expect(ins[0].client_id).toBe(CLIENT_ID);
    // Aucune valeur en dur n'a pu se substituer au claim.
    expect(ins[0].entreprise_id).not.toBe(TEST);
    expect(alertes).toEqual([]);
  });

  it("le chantier créé conserve les colonnes métier du formulaire", async () => {
    const ins = await soumettreFormulaire();
    expect(ins).toHaveLength(1);
    expect(ins[0].statut).toBe("prevu");
    // Le code d'accès garde son format d'origine (inchangé par B8).
    expect(ins[0].code_acces).toMatch(/^BNA-[A-Z0-9]{6}$/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FAIL-CLOSED
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B8 — fail-closed quand le contexte entreprise est absent ou invalide", () => {
  it("claim ABSENT → aucune écriture whatsoever", async () => {
    session = { user: { app_metadata: {} } };
    const ins = await soumettreFormulaire();
    expect(inserts, "aucune table ne doit être écrite").toHaveLength(0);
    expect(ins).toHaveLength(0);
  });

  it("claim NULL → aucune écriture whatsoever", async () => {
    session = { user: { app_metadata: { entreprise_id: null } } };
    const ins = await soumettreFormulaire();
    expect(inserts).toHaveLength(0);
    expect(ins).toHaveLength(0);
  });

  it("claim MALFORMÉ (non-UUID) → aucune écriture whatsoever", async () => {
    session = { user: { app_metadata: { entreprise_id: "BNA-NOT-A-UUID" } } };
    const ins = await soumettreFormulaire();
    expect(inserts).toHaveLength(0);
    expect(ins).toHaveLength(0);
  });

  it("le refus est SIGNALÉ à l'utilisateur (jamais un échec silencieux)", async () => {
    session = { user: { app_metadata: {} } };
    await soumettreFormulaire();
    expect(alertes).toHaveLength(1);
    expect(alertes[0]).toMatch(/entreprise/i);
  });

  it("le refus ne laisse PAS le bouton de soumission bloqué", async () => {
    session = { user: { app_metadata: {} } };
    await soumettreFormulaire();

    // Le refus doit remetre `creationEnCours` à false. Sinon le bouton reste
    // `disabled` avec le libellé « Création... » et l'utilisateur ne peut plus
    // réessayer — un échec de contexte deviendrait un blocage définitif.
    // On observe donc l'effet réel (attribut `disabled` + libellé), pas la
    // simple présence d'un appel dans le code.
    const form = document.querySelector("form") as HTMLFormElement;
    expect(form, "le modal doit rester ouvert après un refus").toBeTruthy();
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled, "le bouton ne doit pas rester désactivé").toBe(false);
    expect(btn.textContent).toContain("Enregistrer");
    expect(btn.textContent).not.toContain("Création...");
  });

  it("une seconde tentative reste possible après un refus", async () => {
    session = { user: { app_metadata: {} } };
    await soumettreFormulaire();

    const form = document.querySelector("form") as HTMLFormElement;
    const select = form.querySelector("select") as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(select, CLIENT_ID);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    // Toujours aucun écrit, mais un NOUVEAU refus : l'utilisateur est informé
    // à chaque tentative au lieu d'être laissé devant un bouton mort.
    expect(inserts).toHaveLength(0);
    expect(alertes.length).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ISOLATION INTER-TENANT
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B8 — isolation inter-tenant", () => {
  it("BNA n'écrit jamais sous l'identifiant TEST, et réciproquement", async () => {
    // Passe 1 : tenant BNA.
    session = { user: { app_metadata: { entreprise_id: BNA } } };
    const insBna = await soumettreFormulaire();
    expect(insBna).toHaveLength(1);
    expect(insBna[0].entreprise_id).toBe(BNA);

    // Passe 2 : tenant TEST, sur une page neuve.
    act(() => root.unmount());
    conteneur.remove();
    conteneur = document.createElement("div");
    document.body.appendChild(conteneur);
    root = createRoot(conteneur);
    inserts = [];
    session = { user: { app_metadata: { entreprise_id: TEST } } };
    const insTest = await soumettreFormulaire();
    expect(insTest).toHaveLength(1);
    expect(insTest[0].entreprise_id).toBe(TEST);

    // Aucune des deux écritures n'a emprunté l'identité de l'autre.
    expect(insBna[0].entreprise_id).not.toBe(TEST);
    expect(insTest[0].entreprise_id).not.toBe(BNA);
  });

  it("la valeur écrite est bien celle du claim, et non un littéral du dépôt", async () => {
    session = { user: { app_metadata: { entreprise_id: TEST } } };
    const ins = await soumettreFormulaire();
    const valeurs = Object.entries(ins[0]).map(([, v]) => v);
    for (const v of valeurs) {
      if (typeof v === "string") {
        // Ni l'UUID BNA ni l'UUID TEST ne doivent apparaître en dur ailleurs.
        if (v !== TEST) {
          expect(v).not.toBe(BNA);
        }
      }
    }
  });
});
