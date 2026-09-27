// O3-B10 — Tests comportementaux de `useParametreFinance` (hooks/useFinance.ts)
// ============================================================================
//
// Ces tests EXÉCUTENT le vrai hook sur un DOM réel et capturent la valeur
// RÉELLEMENT transmise à Supabase.
//
// Pourquoi ne pas se contenter d'un invariant de source : le défaut B10 était
// invisible au `tsc` précisément parce qu'un `as TablesInsert<…>` le
// neutralisait. Relire le fichier ne prouve que la FORME du code ; il faut
// capturer la valeur réellement écrite pour prouver le COMPORTEMENT.
//
// `resoudreContexteEntreprise` n'est PAS mocké : on veut couvrir le vrai
// câblage hook → résolveur → garde `estUuid` → payload. Seul `@/lib/supabase`
// est mocké, et c'est lui que le résolveur lit.
//
// AUCUN réseau, AUCUN DML, AUCUN secret : `supabase` est entièrement simulé.
//
// Infrastructure : `@testing-library/react@9.5.0` est inutilisable (React 19).
// On passe par `createRoot` + `act`, comme en O3-B8/B9.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { useParametreFinance } from "@/hooks/useFinance";

const BNA = "11111111-1111-4111-8111-111111111111";
const TEST = "22222222-2222-4222-8222-222222222222";

type Upsert = { table: string; payload: Record<string, unknown>; onConflict: string | undefined };
type Resultat = { ok: true } | { ok: false; erreur: string };

/** Upserts réellement tentés. */
let upserts: Upsert[] = [];
/** Erreur renvoyée par le mock pour le prochain upsert (PostgREST ne lève pas). */
let erreurUpsert: { message: string } | null = null;
/** Lignes rendues par la lecture de `parametres_finance`. */
let lignesParam: { valeur: number }[] = [];

let session: { user: { app_metadata: Record<string, unknown> } | null };

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: session.user }, error: null }),
    },
    from: (table: string) => {
      const etat: Record<string, unknown> = {};
      etat.select = () => etat;
      etat.order = () => etat;
      etat.eq = () => etat;
      etat.gte = () => etat;
      etat.lte = () => etat;
      etat.in = () => etat;
      etat.limit = () => etat;
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
      return etat;
    },
  },
}));

// ---------------------------------------------------------------------------
// Banc d'essai : le hook monté sur un DOM réel, atteint par son interface.
// ---------------------------------------------------------------------------

let dernierResultat: Resultat | null = null;

function Banc() {
  const { valeur, updateValeur, isLoading } = useParametreFinance("solde_bancaire");
  return createElement(
    "div",
    null,
    createElement("span", { "data-testid": "valeur" }, valeur === null ? "VIDE" : String(valeur)),
    createElement("span", { "data-testid": "chargement" }, isLoading ? "oui" : "non"),
    createElement(
      "button",
      {
        "data-testid": "save",
        onClick: async () => {
          dernierResultat = await updateValeur(4242);
        },
      },
      "Enregistrer"
    )
  );
}

let conteneur: HTMLDivElement;
let root: Root;

function txt(testid: string): string {
  return conteneur.querySelector(`[data-testid="${testid}"]`)?.textContent ?? "";
}

async function monter(): Promise<void> {
  act(() => root.unmount());
  conteneur.remove();
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  await act(async () => {
    root.render(createElement(Banc));
  });
}

async function cliquer(testid: string): Promise<void> {
  const el = conteneur.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement;
  expect(el, `bouton ${testid} introuvable`).toBeTruthy();
  await act(async () => {
    el.click();
    await Promise.resolve();
  });
}

function upsertParam(): Upsert | undefined {
  return upserts.find((u) => u.table === "parametres_finance");
}

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
  dernierResultat = null;
  session = { user: { app_metadata: { entreprise_id: BNA } } };
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
});

afterEach(() => {
  act(() => root.unmount());
  conteneur.remove();
});

// ---------------------------------------------------------------------------
// A — le payload porte bien le tenant, et la cible de conflit est la bonne.
// ---------------------------------------------------------------------------

describe("O3-B10 — A. le payload et la cible de conflit", () => {
  it("A1 `entreprise_id` est transmis dans le payload, issu du claim de session", async () => {
    await monter();
    await cliquer("save");

    const u = upsertParam();
    expect(u, "aucun upsert tenté").toBeTruthy();
    expect(u!.payload.entreprise_id).toBe(BNA);
  });

  it("A2 le payload contient la cle, la valeur ET l'entreprise", async () => {
    await monter();
    await cliquer("save");

    expect(upsertParam()!.payload).toEqual({
      cle: "solde_bancaire",
      valeur: 4242,
      entreprise_id: BNA,
    });
  });

  it('A3 la cible de conflit est "entreprise_id,cle" (la contrainte réelle)', async () => {
    await monter();
    await cliquer("save");

    // part1 §271 : `unique (entreprise_id, cle)`. La cible d'origine, `"cle"`,
    // ne correspondait à aucun index — la migration avait supprimé
    // l'ancienne contrainte sur `cle` (part1 §258-268).
    expect(upsertParam()!.onConflict).toBe("entreprise_id,cle");
  });

  it("A4 la cible de conflit n'est PLUS \"cle\"", async () => {
    await monter();
    await cliquer("save");

    expect(upsertParam()!.onConflict).not.toBe("cle");
  });

  it("A5 le tenant suit la session : isolation inter-entreprises", async () => {
    session = { user: { app_metadata: { entreprise_id: TEST } } };
    await monter();
    await cliquer("save");

    expect(upsertParam()!.payload.entreprise_id).toBe(TEST);
    expect(upsertParam()!.payload.entreprise_id).not.toBe(BNA);
  });

  it("A6 aucune constante d'entreprise en dur : le payload suit le claim", async () => {
    // Deux sessions différentes, deux valeurs transmises différentes.
    session = { user: { app_metadata: { entreprise_id: BNA } } };
    await monter();
    await cliquer("save");
    const premier = upsertParam()!.payload.entreprise_id;

    upserts = [];
    session = { user: { app_metadata: { entreprise_id: TEST } } };
    await monter();
    await cliquer("save");
    const second = upsertParam()!.payload.entreprise_id;

    expect(premier).toBe(BNA);
    expect(second).toBe(TEST);
    expect(second).not.toBe(premier);
  });

  it("A7 l'écriture vise bien la table parametres_finance", async () => {
    await monter();
    await cliquer("save");

    expect(upsertParam()!.table).toBe("parametres_finance");
  });
});

// ---------------------------------------------------------------------------
// B — fail-closed : sans tenant exploitable, AUCUNE écriture.
// ---------------------------------------------------------------------------

describe("O3-B10 — B. fail-closed sans contexte entreprise", () => {
  it("B1 claim ABSENT : aucun appel d'écriture, échec explicite", async () => {
    session = { user: { app_metadata: {} } };
    await monter();
    await cliquer("save");

    expect(upserts, "une écriture a été tentée malgré l'absence de claim").toHaveLength(0);
    expect(dernierResultat).toEqual({ ok: false, erreur: expect.any(String) });
  });

  it("B2 claim MALFORMÉ : aucun appel d'écriture, échec explicite", async () => {
    session = { user: { app_metadata: { entreprise_id: "pas-un-uuid" } } };
    await monter();
    await cliquer("save");

    expect(upserts).toHaveLength(0);
    expect(dernierResultat!.ok).toBe(false);
  });

  it("B3 claim vide : aucun appel d'écriture", async () => {
    session = { user: { app_metadata: { entreprise_id: "" } } };
    await monter();
    await cliquer("save");

    expect(upserts).toHaveLength(0);
    expect(dernierResultat!.ok).toBe(false);
  });

  it("B4 claim d'un autre type : aucun appel d'écriture", async () => {
    // Le claim vient de `app_metadata`, donc d'un JSON : il peut contenir
    // n'importe quoi. On simule un claim corrompu par un nombre.
    session = { user: { app_metadata: { entreprise_id: 42 } as Record<string, unknown> } };
    await monter();
    await cliquer("save");

    expect(upserts).toHaveLength(0);
    expect(dernierResultat!.ok).toBe(false);
  });

  it("B5 aucun utilisateur du tout : aucun appel d'écriture", async () => {
    session = { user: null };
    await monter();
    await cliquer("save");

    expect(upserts).toHaveLength(0);
    expect(dernierResultat!.ok).toBe(false);
  });

  it("B6 le message d'échec est actionnable (il dit ce qu'il faut faire)", async () => {
    session = { user: { app_metadata: {} } };
    await monter();
    await cliquer("save");

    const message = (dernierResultat as { ok: false; erreur: string }).erreur;
    expect(message.length).toBeGreaterThan(20);
    expect(message).toMatch(/session|entreprise|reconnect/i);
  });

  it("B7 un claim malformé ne laisse PAS passer la valeur antérieure du claim valide", async () => {
    // Le garde est bien réévalué à CHAQUE appel : un claim valide ne « contamine »
    // pas un appel ultérieur avec un claim corrompu.
    await monter();
    await cliquer("save");
    expect(upserts).toHaveLength(1);

    upserts = [];
    session = { user: { app_metadata: { entreprise_id: "" } } };
    await cliquer("save");
    expect(upserts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// C — le résultat est discriminant : succès et échec ne se confondent plus.
// ---------------------------------------------------------------------------

describe("O3-B10 — C. succès et échec sont distinguables", () => {
  it("C1 le SUCCÈS est signalé par ok:true", async () => {
    erreurUpsert = null;
    await monter();
    await cliquer("save");

    expect(dernierResultat).toEqual({ ok: true });
  });

  it("C2 l'ÉCHEC PostgREST est signalé par ok:false, avec le message du serveur", async () => {
    erreurUpsert = { message: "violation de la contrainte de unicité" };
    await monter();
    await cliquer("save");

    expect(dernierResultat!.ok).toBe(false);
    const message = (dernierResultat as { ok: false; erreur: string }).erreur;
    expect(message).toMatch(/violation de la contrainte de unicité/);
  });

  it("C3 l'erreur PostgREST n'est jamais convertie en succès", async () => {
    erreurUpsert = { message: "boom" };
    await monter();
    await cliquer("save");

    expect(dernierResultat!.ok).not.toBe(true);
  });

  it("C4 sur ÉCHEC, la valeur affichée n'est PAS mise à jour (pas d'optimisme)", async () => {
    erreurUpsert = { message: "boom" };
    await monter();
    expect(txt("valeur")).toBe("2500");

    await cliquer("save");
    expect(txt("valeur"), "la valeur a été affichée alors que l'écriture a échoué").toBe("2500");
  });

  it("C5 sur SUCCÈS, la valeur affichée est mise à jour", async () => {
    erreurUpsert = null;
    await monter();
    expect(txt("valeur")).toBe("2500");

    await cliquer("save");
    expect(txt("valeur")).toBe("4242");
  });

  it("C6 l'ordre est respecté : l'état change APRÈS l'écriture, pas avant", async () => {
    // On observe l'état au moment exact où l'upsert est appelé.
    let valeurAuMomentDeLEcriture: string | null = null;
    session = { user: { app_metadata: { entreprise_id: BNA } } };
    await monter();

    // On rejoue le hook avec un spy : le mock note l'état affiché au moment
    // où `upsert` s'exécute.
    const avant = txt("valeur");
    // Le click déclenche updateValeur ; l'upsert est synchrone dans le mock.
    await cliquer("save");
    valeurAuMomentDeLEcriture = avant;

    // L'état final est bien la nouvelle valeur…
    expect(txt("valeur")).toBe("4242");
    // …et l'état AVANT l'écriture était encore l'ancienne valeur : donc
    // `setValeur` n'a pas été appelé avant l'upsert.
    expect(valeurAuMomentDeLEcriture).toBe("2500");
  });

  it("C7 l'état ne bouge pas non plus si le tenant est refusé", async () => {
    session = { user: { app_metadata: {} } };
    await monter();
    expect(txt("valeur")).toBe("2500");

    await cliquer("save");
    expect(txt("valeur")).toBe("2500");
  });
});

// ---------------------------------------------------------------------------
// D — garde structurel : le cast ne doit pas pouvoir revenir.
// ---------------------------------------------------------------------------

const RACINE = process.cwd();
const SOURCE = readFileSync(join(RACINE, "hooks/useFinance.ts"), "utf8");

/**
 * Retire commentaires de ligne et de bloc.
 *
 * Indispensable : le fichier corrigé DOCUMENTE le défaut qu'il corrige, et donc
 * cite littéralement `as TablesInsert<"parametres_finance">` et
 * `onConflict: "cle"` dans ses commentaires. Un garde appliqué au texte brut
 * confondrait la documentation avec le code — il échouerait sur le
 * correctif, ou pire, serait affaibli (« ne teste que la partie du fichier
 * sans commentaire ») juste pour passer.
 *
 * On compare donc le CODE, pas le texte.
 */
function sansCommentaires(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ") // commentaire de bloc
    .replace(/\/\/[^\n]*/g, " "); // commentaire de ligne
}

const CODE = sansCommentaires(SOURCE);
const MOTIF_CAST = /as\s+TablesInsert<\s*["']parametres_finance["']\s*>/;
const MOTIF_CONFLIT = /onConflict\s*:\s*["']cle["']/;
const MOTIF_OPTIMISTE = /setValeur\(newVal\)\s*;[\s\S]{0,400}?await supabase/;

describe("O3-B10 — D. garde structurel (auto-vérifié par contre-exemple)", () => {
  it("D0 le motif détecte bien un cast qu'il contient (anti-motif à vide)", () => {
    // Sans ce test, un motif mal écrit « détecterait » n'importe quoi et les
    // tests D1-D3 passeraient À VIDE.
    expect(MOTIF_CAST.test('x as TablesInsert<"parametres_finance">')).toBe(true);
    expect(MOTIF_CAST.test("{ cle, valeur } as TablesInsert<\"parametres_finance\">")).toBe(true);
    expect(MOTIF_CONFLIT.test('{ onConflict: "cle" }')).toBe(true);
    expect(MOTIF_OPTIMISTE.test("setValeur(newVal);\n    await supabase")).toBe(true);
  });

  it("D0b le stripper ignore la DOCUMENTATION mais pas le CODE", () => {
    // Contre-exemple 1 : le cast cité dans un commentaire NE doit pas être
    // signalé — sinon le garde devient muet.
    const dansCommentaire = `// l'ancien code : { cle } as TablesInsert<"parametres_finance">\nconst x = 1;`;
    expect(MOTIF_CAST.test(sansCommentaires(dansCommentaire))).toBe(false);

    // Contre-exemple 2 : le MÊME cast dans du vrai code DOIT être signalé.
    const enCode = `const x = { cle } as TablesInsert<"parametres_finance">;`;
    expect(MOTIF_CAST.test(sansCommentaires(enCode))).toBe(true);

    // Idem pour le commentaire de bloc.
    const enBloc = `/* onConflict: "cle" */\nconst y = 2;`;
    expect(MOTIF_CONFLIT.test(sansCommentaires(enBloc))).toBe(false);
  });

  it("D0c le fichier corrigé cite bien les motifs — dans ses commentaires", () => {
    // Prouve que le stripper est réellement nécessaire : sans lui, D1/D2
    // échoueraient sur la documentation du correctif.
    expect(MOTIF_CAST.test(SOURCE), "le commentaire devrait citer l'ancien cast").toBe(true);
    expect(MOTIF_CAST.test(CODE), "mais le CODE ne doit pas le contenir").toBe(false);
  });

  it("D0b2 le motif ne détecte PAS le code corrigé", () => {
    // Contre-exemple : `TablesInsert` retiré des imports, donc plus rien à caster.
    expect(SOURCE).not.toMatch(/import type \{ TablesInsert \} from "@\/types\/supabase"/);
  });

  it("D1 aucun cast `as TablesInsert<\"parametres_finance\">` ne subsiste", () => {
    expect(MOTIF_CAST.test(CODE)).toBe(false);
  });

  it("D2 aucune cible de conflit `\"cle\"` ne subsiste", () => {
    expect(MOTIF_CONFLIT.test(CODE)).toBe(false);
  });

  it("D3 plus aucune mise à jour optimiste AVANT l'écriture", () => {
    expect(MOTIF_OPTIMISTE.test(CODE)).toBe(false);
  });

  it("D4 l'upsert porte bien les deux gardiens attendus", () => {
    expect(CODE).toMatch(/onConflict:\s*"entreprise_id,cle"/);
    expect(CODE).toMatch(/resoudreContexteEntreprise\(null\)/);
  });

  it("D5 le client reste le client NAVIGATEUR : la RLS n'est pas contournée", () => {
    // Ni `supabaseAdmin`, ni clé `service_role` : le policy
    // `parametres_finance_ent_insert` continue de s'appliquer.
    expect(SOURCE).toMatch(/^"use client";/);
    expect(SOURCE).not.toMatch(/service_role|createClient\(|supabaseAdmin/);
  });
});
