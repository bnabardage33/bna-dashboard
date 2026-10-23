// @vitest-environment node
//
// Non-régression de la route `app/api/catalogue-terrasse/route.ts` :
// le paramètre `compatibleWith`, lorsqu'il est utilisé, doit renvoyer les
// accessoires MATÉRIELS compatibles avec la lame — et EXCLURE les prestations
// de main-d'œuvre (`type_cout === "main_oeuvre"`), même lorsque leur
// `materiel_compatibles` désigne la même lame / le même type de matière.
//
// Le filtrage est délégué au module partagé `lib/terrasse/compatAccessoires`
// (le même que le client) : ce test verrouille le CONTRAT DE LA ROUTE —
// paramètre résolu, tenant appliqué, prédateur `entreprise_id` posé — pour
// qu'une régression (filtre oublié, prédateur lâché) échoue ici.
//
// Sans `compatibleWith`, la route ne filtre PAS (le client opère son propre
// tri) : c'est le comportement actuel, documenté par un test dédié.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/catalogue-terrasse/route";

const ENTREPRISE_ID = "11111111-1111-4111-8111-111111111111";
const LAME_ID = "22222222-2222-4222-8222-222222222222";

// ── Stub du client Supabase (chaîne de requête minimale) ─────────────────────
//
// La route n'utilise que : `from(table).select(...).eq(...).order(...)`
// (thenable) et `.maybeSingle()`. Chaque appel à `from()` crée une chaîne
// neuve qui résout selon la table interrogée ; `etat` piloté par les tests.

type LigneAccessoire = {
  id: string;
  entreprise_id: string;
  type_cout: string | null;
  categorie: string;
  materiel_compatibles: unknown;
  prix_conditionnement: number | null;
};

const etat = vi.hoisted(() => ({
  /** Lignes renvoyées par `select *` sur `catalogue_terrasse_accessoires`. */
  accessoires: [] as unknown[],
  /** Lignes renvoyées par l'interrogation des lames. */
  lames: [] as unknown[],
  /** Résultat de `.maybeSingle()` pour la résolution de `compatibleWith`. */
  lameUnique: null as unknown,
  /** Erreurs Supabase à injecter (clé : nom de la table). */
  erreurs: {} as Record<string, { message: string } | null>,
  /** Dernier prédicat `eq` appliqué par table, pour vérifier le tenant. */
  predicatesEq: {} as Record<string, Array<[string, unknown]>>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const enregistrerEq = (colonne: string, valeur: unknown) => {
        (etat.predicatesEq[table] ??= []).push([colonne, valeur]);
        return chain;
      };
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn((colonne: string, valeur: unknown) => enregistrerEq(colonne, valeur));
      chain.order = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({
        data: etat.lameUnique,
        error: etat.erreurs[table] ?? null,
      }));
      // Thenable : résout selon la table, comme le ferait Supabase.
      chain.then = (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown
      ) =>
        Promise.resolve({
          data: table === "catalogue_terrasse_accessoires" ? etat.accessoires : etat.lames,
          error: etat.erreurs[table] ?? null,
        }).then(onFulfilled, onRejected);
      return chain;
    },
  })),
}));

// ── Stub du tenant : échec fermé ailleurs, succès contrôlé ici ───────────────
const resoudreTenant = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tenant", () => ({ resoudreTenant }));

/** Catalogue de référence : matières ET prestations, toutes compatibles COMPOSITE. */
function catalogueMixte(): LigneAccessoire[] {
  return [
    {
      id: "00000000-0000-4000-8000-00000000clip",
      entreprise_id: ENTREPRISE_ID,
      type_cout: "matiere",
      categorie: "CLIP",
      materiel_compatibles: ["COMPOSITE"],
      prix_conditionnement: 12.5,
    },
    {
      id: "00000000-0000-4000-8000-00000000pre1",
      entreprise_id: ENTREPRISE_ID,
      type_cout: "main_oeuvre",
      categorie: "CLIP",
      materiel_compatibles: ["COMPOSITE"],
      prix_conditionnement: 999,
    },
    {
      id: "00000000-0000-4000-8000-00000000lam1",
      entreprise_id: ENTREPRISE_ID,
      type_cout: "matiere",
      categorie: "LAMBOURDE",
      materiel_compatibles: ["COMPOSITE"],
      prix_conditionnement: 40,
    },
    {
      // Prestation identifiée par l'identifiant de la LAME (pas le type) :
      // l'exclusion ne doit pas dépendre de la forme de l'entrée.
      id: "00000000-0000-4000-8000-00000000pre2",
      entreprise_id: ENTREPRISE_ID,
      type_cout: "main_oeuvre",
      categorie: "PLOT",
      materiel_compatibles: [LAME_ID],
      prix_conditionnement: 888,
    },
  ];
}

function requete(url: string): NextRequest {
  return new NextRequest(`http://localhost/api/catalogue-terrasse${url}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  etat.accessoires = [];
  etat.lames = [];
  etat.lameUnique = null;
  etat.erreurs = {};
  etat.predicatesEq = {};
  resoudreTenant.mockResolvedValue({ ok: true, entrepriseId: ENTREPRISE_ID });
});

describe("GET /api/catalogue-terrasse — compatibleWith exclut les prestations", () => {
  it("ne renvoie que les accessoires matériels compatibles (catalogue mixte)", async () => {
    etat.accessoires = catalogueMixte();
    etat.lameUnique = { id: LAME_ID, type_material: "COMPOSITE" };

    const res = await GET(requete(`?type=accessoires&compatibleWith=${LAME_ID}`));
    expect(res.status).toBe(200);
    const corps = (await res.json()) as { accessoires: LigneAccessoire[] };

    // Seules les deux matières compatibles subsistent…
    expect(corps.accessoires.map((a) => a.id)).toEqual([
      "00000000-0000-4000-8000-00000000clip",
      "00000000-0000-4000-8000-00000000lam1",
    ]);
    // …et AUCUNE ligne de main-d'œuvre, même compatible par identifiant de lame.
    expect(corps.accessoires.every((a) => a.type_cout !== "main_oeuvre")).toBe(true);
  });

  it("écrit la requête d'accessoires avec le prédicat tenant", async () => {
    etat.accessoires = catalogueMixte();
    etat.lameUnique = { id: LAME_ID, type_material: "COMPOSITE" };

    await GET(requete(`?type=accessoires&compatibleWith=${LAME_ID}`));

    const predicates = etat.predicatesEq["catalogue_terrasse_accessoires"] ?? [];
    expect(predicates).toContainEqual(["entreprise_id", ENTREPRISE_ID]);
  });

  it("réutilise la lame déjà scopée au tenant (prédicat entreprise_id)", async () => {
    etat.accessoires = catalogueMixte();
    etat.lameUnique = { id: LAME_ID, type_material: "COMPOSITE" };

    await GET(requete(`?type=accessoires&compatibleWith=${LAME_ID}`));

    const predicates = etat.predicatesEq["catalogue_terrasse_lames"] ?? [];
    expect(predicates).toContainEqual(["id", LAME_ID]);
    expect(predicates).toContainEqual(["entreprise_id", ENTREPRISE_ID]);
  });

  it("échoue fermé : lame absente du tenant ⇒ liste vide", async () => {
    etat.accessoires = catalogueMixte();
    etat.lameUnique = null; // `.maybeSingle()` ne trouve rien (hors tenant)

    const res = await GET(requete(`?type=accessoires&compatibleWith=${LAME_ID}`));
    expect(res.status).toBe(200);
    const corps = (await res.json()) as { accessoires: LigneAccessoire[] };
    expect(corps.accessoires).toEqual([]);
  });

  it("refuse un compatibleWith non-UUID (400)", async () => {
    const res = await GET(requete("?type=accessoires&compatibleWith=pas-uuid"));
    expect(res.status).toBe(400);
    // Échec fermé avant toute requête base.
    expect(etat.predicatesEq["catalogue_terrasse_accessoires"]).toBeUndefined();
  });
});

describe("GET /api/catalogue-terrasse — sans compatibleWith (comportement inchangé)", () => {
  it("ne filtre pas : matières ET prestations sont renvoyées telles quelles", async () => {
    etat.accessoires = catalogueMixte();

    const res = await GET(requete("?type=accessoires"));
    expect(res.status).toBe(200);
    const corps = (await res.json()) as { accessoires: LigneAccessoire[] };
    // Contrat actuel : sans `compatibleWith`, la route ne décide pas de la
    // nature du coût — c'est le client (configurateur, catalogue) qui écarte
    // les prestations. Un changement de ce contrat casserait ce test.
    expect(corps.accessoires).toHaveLength(4);
    expect(corps.accessoires.some((a) => a.type_cout === "main_oeuvre")).toBe(true);
    // Aucune résolution de lame inutile.
    expect(etat.predicatesEq["catalogue_terrasse_lames"]).toBeUndefined();
  });

  it("renvoie lames + accessoires lorsque `type` est omis", async () => {
    etat.lames = [{ id: LAME_ID, type_material: "COMPOSITE" }];
    etat.accessoires = catalogueMixte();

    const res = await GET(requete(""));
    expect(res.status).toBe(200);
    const corps = (await res.json()) as { lames: unknown[]; accessoires: LigneAccessoire[] };
    expect(corps.lames).toHaveLength(1);
    expect(corps.accessoires).toHaveLength(4);
  });
});

describe("GET /api/catalogue-terrasse — garde-fous d'entrée", () => {
  it("refuse un `type` inconnu (400)", async () => {
    const res = await GET(requete("?type=bogus"));
    expect(res.status).toBe(400);
  });

  it("échoue fermé sans tenant valide (401/403, aucune requête base)", async () => {
    resoudreTenant.mockResolvedValue({
      ok: false,
      reponse: new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 }),
    });
    const res = await GET(requete("?type=accessoires"));
    expect([401, 403]).toContain(res.status);
    expect(etat.predicatesEq["catalogue_terrasse_accessoires"]).toBeUndefined();
  });
});
