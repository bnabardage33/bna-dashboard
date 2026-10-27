// @vitest-environment node
//
// Tests unitaires de `app/api/chantiers/[id]/terrasse/route.ts` (Étapes 2B & 2D) :
//   1. Construction du payload (POST insert / update avec sélections et quantités)
//   2. Sécurité des références catalogue (UUID, isolation entreprise_id, catégories, exclusion main_oeuvre)
//   3. Reconstruction serveur des prix catalogue (sans faire confiance au client, maintien après rechargement)
//   4. Restitution des sélections (GET) et conservation de `resultats_techniques`
//   5. Respect strict du périmètre `entreprise_id` et gestion des configurations anciennes
//   6. Vérification statique de la migration additive 20261022

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/chantiers/[id]/terrasse/route";
import { calculerTerrasse } from "@/lib/terrasse/calculs";
import type {
  ChantierTerrasseConfig,
  ResultatCalculTerrasse,
} from "@/lib/terrasse/types";

const ENTREPRISE_ID = "11111111-1111-4111-8111-111111111111";
const AUTRE_ENTREPRISE_ID = "99999999-9999-4999-8999-999999999999";
const CHANTIER_ID = "22222222-2222-4222-8222-222222222222";
const TERRASSE_ID = "33333333-3333-4333-8333-333333333333";

const LAME_ID = "aaaa1111-1111-4111-8111-111111111111";
const CLIP_ID = "bbbb2222-2222-4222-8222-222222222222";
const LAMBOURDE_ID = "cccc3333-3333-4333-8333-333333333333";
const PLOT_ID = "dddd4444-4444-4444-8444-444444444444";

const LAME_AUTRE_ENT_ID = "aaaa9999-9999-4999-8999-999999999999";
const ACC_AUTRE_ENT_ID = "bbbb9999-9999-4999-8999-999999999999";
const ACC_PRESTATION_MO_ID = "eeee5555-5555-4555-8555-555555555555";
const UUID_INEXISTANT = "ffff6666-6666-4666-8666-666666666666";

type LigneLameCatalogue = {
  id: string;
  entreprise_id: string;
  designation: string | null;
  prix_unitaire_lame: number | null;
  prix_m2_ht: number | null;
};

type LigneAccessoireCatalogue = {
  id: string;
  entreprise_id: string;
  categorie: string | null;
  type_cout: string | null;
  designation: string | null;
  conditionnement: string | null;
  prix_conditionnement: number | null;
  unite_mesure: string | null;
  pu_ht?: number | null;
  pu_revient?: number | null;
};

// ── Stub du client Supabase ──────────────────────────────────────────────────
const etat = vi.hoisted(() => ({
  chantier: null as { id: string; nom: string; clients?: { nom: string } } | null,
  terrasse: null as Record<string, unknown> | null,
  reservations: [] as Array<Record<string, unknown>>,
  catalogueLames: [] as LigneLameCatalogue[],
  catalogueAccessoires: [] as LigneAccessoireCatalogue[],
  erreurs: {} as Record<string, { message: string } | null>,
  predicatesEq: {} as Record<string, Array<[string, unknown]>>,
  dernierInsertTerrasse: null as Record<string, unknown> | null,
  dernierUpdateTerrasse: null as Record<string, unknown> | null,
  dernierInsertReservations: null as unknown[] | null,
  idCreeLorsInsert: "33333333-3333-4333-8333-333333333333",
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      let mode: "select" | "insert" | "update" | "delete" = "select";
      const filtresLocaux: Array<[string, unknown]> = [];
      const chain: Record<string, unknown> = {};

      const enregistrerEq = (colonne: string, valeur: unknown) => {
        (etat.predicatesEq[table] ??= []).push([colonne, valeur]);
        filtresLocaux.push([colonne, valeur]);
        return chain;
      };

      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn((colonne: string, valeur: unknown) =>
        enregistrerEq(colonne, valeur)
      );
      chain.order = vi.fn(() => chain);
      chain.limit = vi.fn(() => chain);

      chain.insert = vi.fn((payload: unknown) => {
        mode = "insert";
        if (table === "chantier_terrasses") {
          etat.dernierInsertTerrasse = payload as Record<string, unknown>;
        } else if (table === "chantier_terrasse_reservations") {
          etat.dernierInsertReservations = payload as unknown[];
        }
        return chain;
      });

      chain.update = vi.fn((payload: unknown) => {
        mode = "update";
        if (table === "chantier_terrasses") {
          etat.dernierUpdateTerrasse = payload as Record<string, unknown>;
        }
        return chain;
      });

      chain.delete = vi.fn(() => {
        mode = "delete";
        return chain;
      });

      chain.single = vi.fn(async () => {
        if (table === "chantiers") {
          return {
            data: etat.chantier,
            error:
              etat.erreurs.chantiers ??
              (etat.chantier ? null : { message: "Not found" }),
          };
        }
        if (table === "chantier_terrasses" && mode === "insert") {
          return {
            data: etat.erreurs.chantier_terrasses
              ? null
              : { id: etat.idCreeLorsInsert },
            error: etat.erreurs.chantier_terrasses ?? null,
          };
        }
        return { data: null, error: null };
      });

      chain.maybeSingle = vi.fn(async () => {
        if (table === "chantier_terrasses") {
          return {
            data: etat.terrasse,
            error: etat.erreurs.chantier_terrasses ?? null,
          };
        }
        if (table === "catalogue_terrasse_lames") {
          if (etat.erreurs.catalogue_terrasse_lames) {
            return { data: null, error: etat.erreurs.catalogue_terrasse_lames };
          }
          const trouve =
            etat.catalogueLames.find((row) =>
              filtresLocaux.every(
                ([col, val]) => (row as Record<string, unknown>)[col] === val
              )
            ) ?? null;
          return { data: trouve, error: null };
        }
        if (table === "catalogue_terrasse_accessoires") {
          if (etat.erreurs.catalogue_terrasse_accessoires) {
            return {
              data: null,
              error: etat.erreurs.catalogue_terrasse_accessoires,
            };
          }
          const trouve =
            etat.catalogueAccessoires.find((row) =>
              filtresLocaux.every(
                ([col, val]) => (row as Record<string, unknown>)[col] === val
              )
            ) ?? null;
          return { data: trouve, error: null };
        }
        return { data: null, error: null };
      });

      chain.then = (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown
      ) => {
        if (table === "chantier_terrasse_reservations" && mode === "select") {
          return Promise.resolve({
            data: etat.reservations,
            error: etat.erreurs.chantier_terrasse_reservations ?? null,
          }).then(onFulfilled, onRejected);
        }
        return Promise.resolve({
          data: null,
          error: etat.erreurs[table] ?? null,
        }).then(onFulfilled, onRejected);
      };

      return chain;
    },
  })),
}));

const resoudreTenant = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tenant", () => ({ resoudreTenant }));

function paramsRoute(id = CHANTIER_ID) {
  return { params: Promise.resolve({ id }) };
}

function requeteGet(id = CHANTIER_ID): NextRequest {
  return new NextRequest(`http://localhost/api/chantiers/${id}/terrasse`);
}

function requetePost(body: unknown, id = CHANTIER_ID): NextRequest {
  return new NextRequest(`http://localhost/api/chantiers/${id}/terrasse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function catalogueLamesParDefaut(): LigneLameCatalogue[] {
  return [
    {
      id: LAME_ID,
      entreprise_id: ENTREPRISE_ID,
      designation: "Lame Ipé Premium 21x145",
      prix_unitaire_lame: null,
      prix_m2_ht: 120,
    },
    {
      id: LAME_AUTRE_ENT_ID,
      entreprise_id: AUTRE_ENTREPRISE_ID,
      designation: "Lame Entreprise B",
      prix_unitaire_lame: null,
      prix_m2_ht: 95,
    },
  ];
}

function catalogueAccessoiresParDefaut(): LigneAccessoireCatalogue[] {
  return [
    {
      id: CLIP_ID,
      entreprise_id: ENTREPRISE_ID,
      categorie: "CLIP",
      type_cout: "matiere",
      designation: "Boîte 100 clips inox A4",
      conditionnement: "boîte de 100",
      prix_conditionnement: 55,
      unite_mesure: "boîte",
      pu_ht: 999,
      pu_revient: 30,
    },
    {
      id: LAMBOURDE_ID,
      entreprise_id: ENTREPRISE_ID,
      categorie: "LAMBOURDE",
      type_cout: "matiere",
      designation: "Lambourde exotique 45x70 4m",
      conditionnement: "barre 4m",
      prix_conditionnement: 18,
      unite_mesure: "barre",
      pu_ht: 888,
      pu_revient: 10,
    },
    {
      id: PLOT_ID,
      entreprise_id: ENTREPRISE_ID,
      categorie: "PLOT",
      type_cout: "matiere",
      designation: "Plot réglable 40-60 mm",
      conditionnement: "unité",
      prix_conditionnement: 4.2,
      unite_mesure: "u",
      pu_ht: 777,
      pu_revient: 2.1,
    },
    {
      id: ACC_AUTRE_ENT_ID,
      entreprise_id: AUTRE_ENTREPRISE_ID,
      categorie: "CLIP",
      type_cout: "matiere",
      designation: "Clip Entreprise B",
      conditionnement: "boîte",
      prix_conditionnement: 50,
      unite_mesure: "boîte",
    },
    {
      id: ACC_PRESTATION_MO_ID,
      entreprise_id: ENTREPRISE_ID,
      categorie: "CLIP",
      type_cout: "main_oeuvre",
      designation: "Forfait pose clips invisibles",
      conditionnement: "forfait",
      prix_conditionnement: 450,
      unite_mesure: "forfait",
      pu_ht: 450,
      pu_revient: 250,
    },
  ];
}

function ligneTerrasseBase(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: TERRASSE_ID,
    chantier_id: CHANTIER_ID,
    entreprise_id: ENTREPRISE_ID,
    nom: "Terrasse Sud",
    systeme_terrasse: "bois_clip",
    zone_environnement: "normal",
    fabricant_composite: null,
    gamme_composite: null,
    longueur_m: 6.0,
    largeur_m: 4.0,
    hauteur_sol_cm: 15.0,
    type_sol: "dalle_beton",
    pente_pct: 1.5,
    essence_bois: "ipe",
    type_pose: "parallele",
    largeur_lame_mm: 145,
    epaisseur_lame_mm: 21,
    longueur_lame_m: 4.0,
    espacement_lames_mm: 5,
    type_fixation: "clips_invisibles",
    type_lambourde: "bois_exotique",
    section_largeur_mm: 45,
    section_hauteur_mm: 70,
    longueur_lambourde_m: 4.0,
    entraxe_lambourdes_cm: 40,
    double_lambourdage_aboutage: true,
    bande_etancheite_epdm: true,
    cales_isolation: true,
    type_plots: "reglables",
    entraxe_plots_cm: 60,
    hauteur_reglage_plots: "40_60",
    geotextile: true,
    presence_escalier: false,
    escalier_nb_marches: 2,
    escalier_largeur_m: 2.0,
    escalier_giron_cm: 28.0,
    escalier_hauteur_marche_cm: 16.0,
    presence_garde_corps: false,
    garde_corps_longueur_ml: 0.0,
    garde_corps_type: "bois_cables",
    garde_corps_hauteur_cm: 100,
    coef_perte_lames: 1.1,
    coef_perte_lambourdes: 1.08,
    lame_id: LAME_ID,
    clip_id: CLIP_ID,
    lambourde_id: LAMBOURDE_ID,
    plot_id: PLOT_ID,
    quantite_accessoires: { clip: 3, lambourde: 22, plot: 65 },
    resultats_techniques: null,
    created_at: "2026-10-22T10:00:00.000Z",
    updated_at: "2026-10-22T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  etat.chantier = {
    id: CHANTIER_ID,
    nom: "Villa Océan",
    clients: { nom: "Client Test" },
  };
  etat.terrasse = null;
  etat.reservations = [];
  etat.catalogueLames = catalogueLamesParDefaut();
  etat.catalogueAccessoires = catalogueAccessoiresParDefaut();
  etat.erreurs = {};
  etat.predicatesEq = {};
  etat.dernierInsertTerrasse = null;
  etat.dernierUpdateTerrasse = null;
  etat.dernierInsertReservations = null;
  resoudreTenant.mockResolvedValue({ ok: true, entrepriseId: ENTREPRISE_ID });
});

describe("POST /api/chantiers/[id]/terrasse — construction du payload", () => {
  it("inclut lame_id, clip_id, lambourde_id, plot_id et quantite_accessoires lors d'un INSERT", async () => {
    etat.terrasse = null;

    const res = await POST(
      requetePost({
        nom: "Terrasse Pin",
        longueur_m: 5,
        largeur_m: 4,
        lame_id: LAME_ID,
        clip_id: CLIP_ID,
        lambourde_id: LAMBOURDE_ID,
        plot_id: PLOT_ID,
        quantite_accessoires: { clip: 2, lambourde: 15, plot: 40 },
      }),
      paramsRoute()
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      terrasse: ChantierTerrasseConfig & {
        id: string;
        resultats_techniques: ResultatCalculTerrasse;
      };
      resultat: ResultatCalculTerrasse;
    };
    expect(json.ok).toBe(true);

    const insertPayload = etat.dernierInsertTerrasse!;
    expect(insertPayload).toBeTruthy();
    expect(insertPayload.lame_id).toBe(LAME_ID);
    expect(insertPayload.clip_id).toBe(CLIP_ID);
    expect(insertPayload.lambourde_id).toBe(LAMBOURDE_ID);
    expect(insertPayload.plot_id).toBe(PLOT_ID);
    expect(insertPayload.quantite_accessoires).toEqual({
      clip: 2,
      lambourde: 15,
      plot: 40,
    });
    expect(insertPayload).not.toHaveProperty("tarifs_catalogue");
  });

  it("met à jour lame_id, clip_id, lambourde_id, plot_id et quantite_accessoires lors d'un UPDATE", async () => {
    etat.terrasse = { id: TERRASSE_ID };

    const res = await POST(
      requetePost({
        longueur_m: 6,
        largeur_m: 4,
        lame_id: LAME_ID,
        clip_id: null,
        lambourde_id: LAMBOURDE_ID,
        plot_id: PLOT_ID,
        quantite_accessoires: { lambourde: 18, plot: 50 },
      }),
      paramsRoute()
    );

    expect(res.status).toBe(200);
    expect(etat.dernierInsertTerrasse).toBeNull();
    const updatePayload = etat.dernierUpdateTerrasse!;
    expect(updatePayload).toBeTruthy();
    expect(updatePayload.lame_id).toBe(LAME_ID);
    expect(updatePayload.clip_id).toBeNull();
    expect(updatePayload.lambourde_id).toBe(LAMBOURDE_ID);
    expect(updatePayload.plot_id).toBe(PLOT_ID);
    expect(updatePayload.quantite_accessoires).toEqual({
      lambourde: 18,
      plot: 50,
    });
  });
});

describe("Sécurité des références catalogue (Étape 2D — Section A)", () => {
  it("rejette (400) un UUID mal formé pour chaque champ (lame_id, clip_id, lambourde_id, plot_id) avant toute requête SQL", async () => {
    for (const champ of ["lame_id", "clip_id", "lambourde_id", "plot_id"] as const) {
      etat.predicatesEq = {};
      etat.dernierInsertTerrasse = null;
      etat.dernierUpdateTerrasse = null;

      const res = await POST(
        requetePost({
          longueur_m: 6,
          largeur_m: 4,
          [champ]: "pas-un-uuid-valide",
        }),
        paramsRoute()
      );

      expect(res.status, `champ ${champ} invalide doit renvoyer 400`).toBe(400);
      expect(etat.predicatesEq.chantiers).toBeUndefined();
      expect(etat.dernierInsertTerrasse).toBeNull();
      expect(etat.dernierUpdateTerrasse).toBeNull();
    }
  });

  it("rejette (400) une référence catalogue appartenant à une autre entreprise sans effectuer d'écriture", async () => {
    // Lame d'une autre entreprise
    const resLame = await POST(
      requetePost({ lame_id: LAME_AUTRE_ENT_ID }),
      paramsRoute()
    );
    expect(resLame.status).toBe(400);
    expect(etat.predicatesEq.catalogue_terrasse_lames).toContainEqual([
      "entreprise_id",
      ENTREPRISE_ID,
    ]);
    expect(etat.dernierInsertTerrasse).toBeNull();
    expect(etat.dernierUpdateTerrasse).toBeNull();

    // Accessoire (clip, lambourde, plot) d'une autre entreprise
    for (const champ of ["clip_id", "lambourde_id", "plot_id"] as const) {
      etat.predicatesEq = {};
      const resAcc = await POST(
        requetePost({ [champ]: ACC_AUTRE_ENT_ID }),
        paramsRoute()
      );
      expect(resAcc.status, `${champ} autre entreprise doit renvoyer 400`).toBe(400);
      expect(etat.predicatesEq.catalogue_terrasse_accessoires).toContainEqual([
        "entreprise_id",
        ENTREPRISE_ID,
      ]);
      expect(etat.dernierInsertTerrasse).toBeNull();
      expect(etat.dernierUpdateTerrasse).toBeNull();
    }
  });

  it("rejette (400) une référence inexistante pour chaque champ sans effectuer d'écriture", async () => {
    for (const champ of ["lame_id", "clip_id", "lambourde_id", "plot_id"] as const) {
      etat.dernierInsertTerrasse = null;
      etat.dernierUpdateTerrasse = null;

      const res = await POST(
        requetePost({ [champ]: UUID_INEXISTANT }),
        paramsRoute()
      );
      expect(res.status, `${champ} inexistant doit renvoyer 400`).toBe(400);
      expect(etat.dernierInsertTerrasse).toBeNull();
      expect(etat.dernierUpdateTerrasse).toBeNull();
    }
  });

  it("rejette (400) un accessoire de mauvaise catégorie (ex. PLOT dans clip_id, CLIP dans lambourde_id ou plot_id)", async () => {
    // PLOT_ID passé dans clip_id (attendu : CLIP)
    const resClip = await POST(
      requetePost({ clip_id: PLOT_ID }),
      paramsRoute()
    );
    expect(resClip.status).toBe(400);
    expect(etat.dernierInsertTerrasse).toBeNull();

    // CLIP_ID passé dans lambourde_id (attendu : LAMBOURDE)
    const resLamb = await POST(
      requetePost({ lambourde_id: CLIP_ID }),
      paramsRoute()
    );
    expect(resLamb.status).toBe(400);
    expect(etat.dernierInsertTerrasse).toBeNull();

    // LAMBOURDE_ID passé dans plot_id (attendu : PLOT)
    const resPlot = await POST(
      requetePost({ plot_id: LAMBOURDE_ID }),
      paramsRoute()
    );
    expect(resPlot.status).toBe(400);
    expect(etat.dernierInsertTerrasse).toBeNull();
  });

  it("rejette (400) une prestation main_oeuvre passée comme accessoire matériel", async () => {
    const res = await POST(
      requetePost({ clip_id: ACC_PRESTATION_MO_ID }),
      paramsRoute()
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/main_oeuvre/i);
    expect(etat.dernierInsertTerrasse).toBeNull();
    expect(etat.dernierUpdateTerrasse).toBeNull();
  });
});

describe("Prix catalogue côté serveur (Étape 2D — Section B)", () => {
  it("reconstruit tarifs_catalogue côté serveur sans body.tarifs_catalogue et ignore les prix falsifiés du client", async () => {
    etat.terrasse = null;

    // Le client envoie des tarifs falsifiés (1 €), mais le serveur doit charger les tarifs DB (120 €/m², 55 €, 18 €, 4.2 €)
    const res = await POST(
      requetePost({
        longueur_m: 6,
        largeur_m: 4,
        essence_bois: "ipe",
        type_fixation: "clips_invisibles",
        lame_id: LAME_ID,
        clip_id: CLIP_ID,
        lambourde_id: LAMBOURDE_ID,
        plot_id: PLOT_ID,
        tarifs_catalogue: {
          lame: { id: LAME_ID, prix_m2_ht: 1, prix_unitaire_lame: 1 },
          clip: { id: CLIP_ID, prix_conditionnement: 1 },
          lambourde: { id: LAMBOURDE_ID, prix_conditionnement: 1 },
          plot: { id: PLOT_ID, prix_conditionnement: 1 },
        },
      }),
      paramsRoute()
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      resultat: ResultatCalculTerrasse;
    };

    const lignes = json.resultat.chiffrage.lignes;
    const ligneLame = lignes.find((l) => l.code === "LAM-01");
    const ligneLambourde = lignes.find((l) => l.code === "STR-01");
    const lignePlot = lignes.find((l) => l.code === "SUP-01");
    const ligneFixation = lignes.find((l) => l.code === "FIX-02");

    // Tarifs du catalogue en base (et non les 1 € du client ni pu_revient / pu_ht)
    expect(ligneLame?.prixUnitaireHt).toBe(120);
    expect(ligneLambourde?.prixUnitaireHt).toBe(18);
    expect(lignePlot?.prixUnitaireHt).toBe(4.2);
    expect(ligneFixation?.prixUnitaireHt).toBe(55);
  });

  it("conserve l'utilisation des prix catalogue lors d'une modification de dimensions après rechargement (GET -> modification -> POST)", async () => {
    etat.terrasse = ligneTerrasseBase({
      longueur_m: 6.0,
      largeur_m: 4.0,
      lame_id: LAME_ID,
      clip_id: CLIP_ID,
      lambourde_id: LAMBOURDE_ID,
      plot_id: PLOT_ID,
    });

    // 1. Rechargement via GET
    const resGet = await GET(requeteGet(), paramsRoute());
    expect(resGet.status).toBe(200);
    const dataGet = (await resGet.json()) as {
      terrasse: ChantierTerrasseConfig;
    };

    // Le GET hydrate `tarifs_catalogue` pour que le recalcul client en mémoire conserve les prix catalogue
    const configModifieeClient: ChantierTerrasseConfig = {
      ...dataGet.terrasse,
      longueur_m: 8.0, // modification de dimension (6m -> 8m)
    };
    const apercuClient = calculerTerrasse(configModifieeClient);
    expect(
      apercuClient.chiffrage.lignes.find((l) => l.code === "LAM-01")?.prixUnitaireHt
    ).toBe(120);

    // 2. Sauvegarde via POST sans `tarifs_catalogue` dans le body
    const { tarifs_catalogue: _omit, ...bodySansTarifs } = configModifieeClient;
    void _omit;

    const resPost = await POST(requetePost(bodySansTarifs), paramsRoute());
    expect(resPost.status).toBe(200);
    const dataPost = (await resPost.json()) as {
      resultat: ResultatCalculTerrasse;
    };

    const ligneLamePost = dataPost.resultat.chiffrage.lignes.find(
      (l) => l.code === "LAM-01"
    );
    expect(ligneLamePost?.prixUnitaireHt).toBe(120);
    expect(dataPost.resultat.surfaceBruteM2).toBe(32); // 8m * 4m
  });
});

describe("GET /api/chantiers/[id]/terrasse — restitution des sélections", () => {
  it("restitue fidèlement les identifiants et quantités sélectionnés", async () => {
    etat.terrasse = ligneTerrasseBase();

    const res = await GET(requeteGet(), paramsRoute());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      existe: boolean;
      terrasse: ChantierTerrasseConfig;
      resultat: ResultatCalculTerrasse;
    };

    expect(json.existe).toBe(true);
    expect(json.terrasse.lame_id).toBe(LAME_ID);
    expect(json.terrasse.clip_id).toBe(CLIP_ID);
    expect(json.terrasse.lambourde_id).toBe(LAMBOURDE_ID);
    expect(json.terrasse.plot_id).toBe(PLOT_ID);
    expect(json.terrasse.quantite_accessoires).toEqual({
      clip: 3,
      lambourde: 22,
      plot: 65,
    });
  });

  it("assure un aller-retour POST -> GET complet sans perte des sélections ni du résultat", async () => {
    etat.terrasse = null;

    const postRes = await POST(
      requetePost({
        nom: "Terrasse Aller-Retour",
        longueur_m: 6,
        largeur_m: 4,
        essence_bois: "ipe",
        type_fixation: "clips_invisibles",
        lame_id: LAME_ID,
        clip_id: CLIP_ID,
        lambourde_id: LAMBOURDE_ID,
        plot_id: PLOT_ID,
        quantite_accessoires: { clip: 4, lambourde: 20, plot: 60 },
      }),
      paramsRoute()
    );
    expect(postRes.status).toBe(200);

    etat.terrasse = {
      id: TERRASSE_ID,
      ...etat.dernierInsertTerrasse,
    };

    const getRes = await GET(requeteGet(), paramsRoute());
    expect(getRes.status).toBe(200);
    const relu = (await getRes.json()) as {
      existe: boolean;
      terrasse: ChantierTerrasseConfig & {
        resultats_techniques: ResultatCalculTerrasse;
      };
      resultat: ResultatCalculTerrasse;
    };

    expect(relu.existe).toBe(true);
    expect(relu.terrasse.lame_id).toBe(LAME_ID);
    expect(relu.terrasse.clip_id).toBe(CLIP_ID);
    expect(relu.terrasse.lambourde_id).toBe(LAMBOURDE_ID);
    expect(relu.terrasse.plot_id).toBe(PLOT_ID);
    expect(relu.terrasse.quantite_accessoires).toEqual({
      clip: 4,
      lambourde: 20,
      plot: 60,
    });
    const ligneLameRelue = relu.resultat.chiffrage.lignes.find(
      (l) => l.code === "LAM-01"
    );
    expect(ligneLameRelue?.prixUnitaireHt).toBe(120);
    expect(
      relu.terrasse.resultats_techniques.chiffrage.lignes.find(
        (l) => l.code === "LAM-01"
      )?.prixUnitaireHt
    ).toBe(120);
  });
});

describe("Conservation de resultats_techniques", () => {
  it("stocke dans resultats_techniques un ResultatCalculTerrasse pur sans y mélanger les identifiants de sélection", async () => {
    etat.terrasse = null;

    await POST(
      requetePost({
        longueur_m: 6,
        largeur_m: 4,
        lame_id: LAME_ID,
        clip_id: CLIP_ID,
        quantite_accessoires: { clip: 2 },
      }),
      paramsRoute()
    );

    const rt = etat.dernierInsertTerrasse
      ?.resultats_techniques as Record<string, unknown>;
    expect(rt).toBeTruthy();
    expect(typeof rt.surfaceBruteM2).toBe("number");
    expect(rt).toHaveProperty("chiffrage");
    expect(typeof (rt.chiffrage as { totalHt: unknown }).totalHt).toBe("number");
    expect(rt).toHaveProperty("lames");
    expect(rt).toHaveProperty("lambourdes");
    expect(rt).toHaveProperty("plots");
    expect(rt).toHaveProperty("fixations");
    expect(rt).toHaveProperty("conformite");
    expect(rt).not.toHaveProperty("lame_id");
    expect(rt).not.toHaveProperty("clip_id");
    expect(rt).not.toHaveProperty("quantite_accessoires");
  });

  it("conserve le resultats_techniques déjà stocké lors d'un GET sur une terrasse existante", async () => {
    const resultatPersiste: ResultatCalculTerrasse = {
      surfaceBruteM2: 24,
      surfaceNetteM2: 24,
      perimetreM: 20,
      lames: {
        essence: "ipe",
        largeurMm: 145,
        epaisseurMm: 21,
        pasMm: 150,
        nbLignesLames: 27,
        lineaireMl: 162,
        surfaceACommanderM2: 26.4,
        nbLamesStandard: 45,
      },
      lambourdes: {
        entraxeCm: 40,
        entraxeMaxDtuCm: 50,
        nbRangees: 11,
        lineaireMl: 66,
        lineaireAvecChutesMl: 71.3,
        nbBarres: 18,
        sectionMm: "45x70",
        epdmMl: 71.3,
        calesIsolationNb: 121,
      },
      plots: {
        type: "reglables",
        entraxeCm: 60,
        porteeMaxAdmissibleCm: 70,
        nbPlotsParLambourde: 11,
        nbPlotsTotal: 121,
        densiteParM2: 5.0,
        geotextileM2: 0,
      },
      fixations: {
        type: "clips_invisibles",
        nbVisOuClipsTotal: 334,
        nbBoites: 4,
        clipsDepartFinNb: 22,
      },
      escalier: {
        present: false,
        nbMarches: 0,
        largeurM: 0,
        gironCm: 0,
        hauteurMarcheCm: 0,
        conformeBlondel: true,
        valeurBlondelCm: 0,
        lamesMarchesMl: 0,
        limonsNb: 0,
      },
      gardeCorps: {
        present: false,
        longueurMl: 0,
        hauteurCm: 0,
        type: "bois_cables",
        nbPoteaux: 0,
        conformeNorme: true,
      },
      conformite: {
        statutGlobal: "conforme",
        controles: [],
        nbConformes: 5,
        nbAvertissements: 0,
        nbNonConformes: 0,
      },
      chiffrage: {
        lignes: [
          {
            code: "LAM-01",
            categorie: "Platelage",
            designation: "Lame Ipé Catalogue",
            quantite: 26.4,
            unite: "m²",
            prixUnitaireHt: 135,
            totalHt: 3564,
          },
        ],
        totalHt: 4913.45,
        prixM2Ht: 204.73,
      },
      calculeA: "2026-10-22T12:00:00.000Z",
    };

    etat.terrasse = ligneTerrasseBase({
      resultats_techniques: resultatPersiste,
    });

    const res = await GET(requeteGet(), paramsRoute());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      terrasse: { resultats_techniques: ResultatCalculTerrasse };
      resultat: ResultatCalculTerrasse;
    };

    expect(json.terrasse.resultats_techniques).toEqual(resultatPersiste);
    expect(json.resultat).toEqual(resultatPersiste);
    expect(json.resultat.chiffrage.totalHt).toBe(4913.45);
  });
});

describe("Respect du périmètre entreprise_id", () => {
  it("échoue fermé (401) si le tenant n'est pas résolu, sans interroger Supabase", async () => {
    resoudreTenant.mockResolvedValue({
      ok: false,
      reponse: new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
      }),
    });

    const resGet = await GET(requeteGet(), paramsRoute());
    expect(resGet.status).toBe(401);
    expect(etat.predicatesEq.chantiers).toBeUndefined();

    const resPost = await POST(requetePost({ longueur_m: 5 }), paramsRoute());
    expect(resPost.status).toBe(401);
    expect(etat.predicatesEq.chantiers).toBeUndefined();
  });

  it("refuse (404) l'accès si le chantier n'appartient pas à l'entreprise courante", async () => {
    etat.chantier = null;

    const resGet = await GET(requeteGet(), paramsRoute());
    expect(resGet.status).toBe(404);
    expect(etat.predicatesEq.chantiers).toContainEqual([
      "entreprise_id",
      ENTREPRISE_ID,
    ]);
    expect(etat.predicatesEq.chantier_terrasses).toBeUndefined();

    const resPost = await POST(
      requetePost({ lame_id: LAME_ID }),
      paramsRoute()
    );
    expect(resPost.status).toBe(404);
    expect(etat.dernierInsertTerrasse).toBeNull();
    expect(etat.dernierUpdateTerrasse).toBeNull();
  });

  it("force entreprise_id du tenant courant et ignore tout entreprise_id forgé dans le body POST", async () => {
    etat.terrasse = null;

    const res = await POST(
      requetePost({
        entreprise_id: AUTRE_ENTREPRISE_ID,
        lame_id: LAME_ID,
      }),
      paramsRoute()
    );

    expect(res.status).toBe(200);
    expect(etat.dernierInsertTerrasse?.entreprise_id).toBe(ENTREPRISE_ID);
    expect(etat.dernierInsertTerrasse?.entreprise_id).not.toBe(
      AUTRE_ENTREPRISE_ID
    );
    expect(etat.predicatesEq.chantier_terrasses).toContainEqual([
      "entreprise_id",
      ENTREPRISE_ID,
    ]);
  });
});

describe("Gestion des valeurs nulles et des configurations anciennes", () => {
  it("renvoie une configuration par défaut avec identifiants à null et quantite_accessoires={} lorsqu'aucune terrasse n'existe", async () => {
    etat.terrasse = null;

    const res = await GET(requeteGet(), paramsRoute());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      existe: boolean;
      terrasse: ChantierTerrasseConfig;
      resultat: ResultatCalculTerrasse;
    };

    expect(json.existe).toBe(false);
    expect(json.terrasse.lame_id).toBeNull();
    expect(json.terrasse.clip_id).toBeNull();
    expect(json.terrasse.lambourde_id).toBeNull();
    expect(json.terrasse.plot_id).toBeNull();
    expect(json.terrasse.quantite_accessoires).toEqual({});
    expect(json.resultat.surfaceBruteM2).toBe(24);
  });

  it("gère une configuration ancienne (colonnes absentes/nulles et resultats_techniques null) sans erreur", async () => {
    etat.terrasse = ligneTerrasseBase({
      lame_id: undefined,
      clip_id: null,
      lambourde_id: "",
      plot_id: "   ",
      quantite_accessoires: null,
      resultats_techniques: null,
    });

    const res = await GET(requeteGet(), paramsRoute());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      existe: boolean;
      terrasse: ChantierTerrasseConfig & {
        resultats_techniques: ResultatCalculTerrasse | null;
      };
      resultat: ResultatCalculTerrasse;
    };

    expect(json.existe).toBe(true);
    expect(json.terrasse.lame_id).toBeNull();
    expect(json.terrasse.clip_id).toBeNull();
    expect(json.terrasse.lambourde_id).toBeNull();
    expect(json.terrasse.plot_id).toBeNull();
    expect(json.terrasse.quantite_accessoires).toEqual({});
    expect(json.terrasse.resultats_techniques).toBeNull();
    expect(json.resultat.surfaceBruteM2).toBe(24);
    expect(json.resultat.chiffrage.totalHt).toBeGreaterThan(0);
  });

  it("normalise les chaînes vides et quantités invalides lors d'un POST", async () => {
    etat.terrasse = null;

    const res = await POST(
      requetePost({
        lame_id: "",
        clip_id: "   ",
        lambourde_id: null,
        plot_id: undefined,
        quantite_accessoires: {
          clip: -5,
          lambourde: "12" as unknown as number,
          plot: NaN,
        },
      }),
      paramsRoute()
    );

    expect(res.status).toBe(200);
    const payload = etat.dernierInsertTerrasse!;
    expect(payload.lame_id).toBeNull();
    expect(payload.clip_id).toBeNull();
    expect(payload.lambourde_id).toBeNull();
    expect(payload.plot_id).toBeNull();
    expect(payload.quantite_accessoires).toEqual({ lambourde: 12 });
  });
});

describe("Migration SQL 20261022 — vérifications de robustesse et non-destructivité", () => {
  it("est purement additive (aucun DROP), contrôle les types/définitions et normalise quantite_accessoires", () => {
    const sql = readFileSync(
      "./supabase/migrations/20261022_add_catalogue_selections_chantier_terrasses.sql",
      "utf-8"
    );

    // Aucune instruction DROP dans le corps SQL (hors commentaires)
    const sqlSansCommentaires = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(sqlSansCommentaires).not.toMatch(/\bDROP\b/i);

    // Contrôles de types des colonnes préexistantes et normalisation de quantite_accessoires
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS lame_id UUID");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS clip_id UUID");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS lambourde_id UUID");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS plot_id UUID");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS quantite_accessoires JSONB");
    expect(sql).toContain("SET quantite_accessoires = '{}'::jsonb");
    expect(sql).toContain("ALTER COLUMN quantite_accessoires SET DEFAULT '{}'::jsonb");
    expect(sql).toContain("ALTER COLUMN quantite_accessoires SET NOT NULL");

    // Vérification par définition réelle des contraintes existantes
    expect(sql).toContain("pg_get_constraintdef");
    expect(sql).toContain("ON DELETE SET NULL");
    expect(sql).toContain("jsonb_typeof(quantite_accessoires) = 'object'");
  });
});
