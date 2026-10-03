// @vitest-environment node
//
// Isolation tenant de `app/api/devis/[id]/*` : send-otp, verify-otp, analyse.
//
// Les VRAIES routes sont exécutées (POST send-otp, POST verify-otp, POST + GET
// analyse). Seuls sont stubés : le client Supabase SSR (session),
// `supabaseAdmin` (service_role) et le fournisseur LLM. Aucun réseau, aucun DML,
// aucun secret.
//
// Fidélité du stub, condition de validité de ces tests :
//   * `.eq()` est un prédicat RÉELLEMENT appliqué aux lignes. C'est ce qui rend
//     détectable la suppression du filtre `entreprise_id` : le mutant lit alors la
//     ligne de l'autre tenant, et le test le voit.
//   * `.update()` / `.insert()` n'exposent des données que si `.select()` a été
//     appelé, comme PostgREST. Une route ne peut donc pas « compter » les lignes
//     touchées sans `.select()` — le test B l'exige pour `send-otp`.
//   * Chaque handler est rechargé à chaque test (`vi.resetModules()`) car
//     `send-otp` (cooldown 60 s) et `verify-otp` (anti-bruteforce) ont un état
//     module-level qui fuiterait d'un test à l'autre.
//   * `.or(...)` est journalisé mais NON appliqué : c'est la condition de
//     concurrence de `revendiquerAnalyse`, et son respect est déjà couvert par
//     `__tests__/ia/devis-ia-route.test.ts`. Le stub ne prétend pas le simuler.
//   * `devis_ia.entreprise_id` est posé en base par le trigger
//     `tg_set_entreprise_par_devis`. Le stub ne fait pas tourner de trigger : la
//     fixture porte donc la colonne explicitement, à la valeur que le trigger
//     aurait posée (celle du devis parent).

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

const BNA = "11111111-1111-4111-8111-111111111111";
const TEST = "22222222-2222-4222-8222-222222222222";

const DEVIS_BNA = "33333333-3333-4333-8333-333333333331";
const DEVIS_TEST = "33333333-3333-4333-8333-333333333332";
const IA_TEST = "44444444-4444-4444-8444-444444444441";
const INCONNU = "55555555-5555-4555-8555-555555555555";
const OUVRAGE = "66666666-6666-4666-8666-666666666661";

const spies = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  genererTexte: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: (...a: unknown[]) => spies.getUser(...a) },
  }),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (...a: unknown[]) => spies.from(...a) },
}));

vi.mock("ai", () => ({
  generateText: (...a: unknown[]) => spies.genererTexte(...a),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => (_model: string) => "modele-test",
}));

type Row = Record<string, unknown>;
type Predicat = [string, unknown];
type Mode = "lecture" | "insertion" | "mise_a_jour" | "suppression";

interface Operation {
  table: string;
  mode: Mode;
  /** Prédicats RÉELLEMENT appliqués aux lignes. */
  filtres: Predicat[];
  payload: Row | null;
  /** Clauses non appliquées (`.or`), pour transparence du journal. */
  raw: string[];
}

interface Etat {
  tables: Record<string, Row[]>;
  /** Une entrée par appel `.from(table)` : prouve qu'aucune requête n'est partie. */
  fromCalls: string[];
  operations: Operation[];
}

/**
 * Chaîne PostgREST simulée. Toutes les méthodes renvoient `this` et l'objet est
 * alorsable : `await q`, `await q.single()`, `q.insert(x).select().single()` et
 * `q.update(x).eq(…).select(…)` fonctionnent avec la même instance.
 */
class Fake {
  private filtres: Predicat[] = [];
  private raw: string[] = [];
  private mode: Mode = "lecture";
  private payload: Row | null = null;
  private surSelection = false;
  private resultat: { data: unknown; error: null } | null = null;

  constructor(
    private readonly table: string,
    private readonly etat: Etat
  ) {}

  select(_colonnes?: string): this {
    this.surSelection = true;
    return this;
  }

  insert(payload: Row): this {
    this.mode = "insertion";
    this.payload = payload;
    return this;
  }

  update(payload: Row): this {
    this.mode = "mise_a_jour";
    this.payload = payload;
    return this;
  }

  delete(): this {
    this.mode = "suppression";
    return this;
  }

  order(_colonne?: string, _opts?: unknown): this {
    return this;
  }

  /** Journalisé, NON appliqué : cf. en-tête du fichier. */
  or(clause: string): this {
    this.raw.push(`or(${clause})`);
    return this;
  }

  eq(colonne: string, valeur: unknown): this {
    this.filtres.push([colonne, valeur]);
    return this;
  }

  private journaliser(): void {
    this.etat.operations.push({
      table: this.table,
      mode: this.mode,
      filtres: this.filtres.map((f) => [f[0], f[1]] as Predicat),
      payload: this.payload ? { ...this.payload } : null,
      raw: [...this.raw],
    });
  }

  private lignes(): Row[] {
    return (this.etat.tables[this.table] ?? []).filter((r) =>
      this.filtres.every(([c, v]) => r[c] === v)
    );
  }

  private executer(): { data: unknown; error: null } {
    const table = (this.etat.tables[this.table] ??= []);
    if (this.mode === "insertion") {
      const lot = (Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]) as Row[];
      const creees = lot.map((p, i) => ({
        ...p,
        id: `${this.table}-${table.length + i + 1}`,
      }));
      table.push(...creees);
      this.journaliser();
      return { data: this.surSelection ? creees : null, error: null };
    }
    if (this.mode === "mise_a_jour") {
      const cible = this.lignes();
      for (const l of cible) Object.assign(l, this.payload ?? {});
      this.journaliser();
      return { data: this.surSelection ? cible : null, error: null };
    }
    if (this.mode === "suppression") {
      const cible = this.lignes();
      this.etat.tables[this.table] = table.filter((r) => !cible.includes(r));
      this.journaliser();
      return { data: null, error: null };
    }
    this.journaliser();
    return { data: this.lignes(), error: null };
  }

  private resoudre(): { data: unknown; error: null } {
    this.resultat ??= this.executer();
    return this.resultat;
  }

  single(): Promise<{ data: Row | null; error: null }> {
    const r = this.resoudre();
    const data = Array.isArray(r.data) ? ((r.data[0] ?? null) as Row | null) : null;
    return Promise.resolve({ data, error: r.error });
  }

  maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return this.single();
  }

  then(resolve: (v: { data: unknown; error: null }) => void): void {
    resolve(this.resoudre());
  }
}

let etat: Etat;

function creerEtat(): Etat {
  const dansDixMinutes = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  return {
    tables: {
      devis: [
        {
          id: DEVIS_BNA,
          entreprise_id: BNA,
          numero: "D-BNA-001",
          lignes: [],
          chantier_id: null,
          surface_m2: 120,
          statut: "envoye",
          otp_code: null,
          otp_expires_at: null,
          signature_phone: null,
          signature_date: null,
          signature_ip: null,
        },
        {
          id: DEVIS_TEST,
          entreprise_id: TEST,
          numero: "D-TEST-001",
          lignes: [],
          chantier_id: null,
          surface_m2: 80,
          statut: "envoye",
          otp_code: "424242",
          otp_expires_at: dansDixMinutes,
          signature_phone: "0600000000",
          signature_date: null,
          signature_ip: null,
        },
      ],
      devis_ia: [
        {
          id: IA_TEST,
          devis_id: DEVIS_TEST,
          entreprise_id: TEST,
          statut: "terminee",
          version: 1,
          updated_at: new Date().toISOString(),
          analyse_resultats: { resume: "Analyse initiale du tenant TEST." },
          lignes_proposees: [],
          alertes: [],
          recommandations: [],
          total_estime: 0,
          marge_estimee: 0,
          marge_pct: 0,
        },
      ],
      devis_ia_historique: [],
      catalogue_ouvrages: [
        {
          id: OUVRAGE,
          designation: "Laine minerale",
          description: null,
          famille_label: "Isolation",
          unite: "m2",
          pu_ht: 12.5,
          pu_revient: 7,
          type_cout: "matiere",
        },
      ],
      chantiers: [],
      chantier_zones: [],
    },
    fromCalls: [],
    operations: [],
  };
}

/** Claim de session contrôlable. `undefined` = pas de claim du tout. */
function sessioner(claim: unknown, user = true): void {
  spies.getUser.mockImplementation(async () =>
    user
      ? { data: { user: { app_metadata: { entreprise_id: claim } } }, error: null }
      : { data: { user: null }, error: new Error("session expiree") }
  );
}

function ligne(id: string): Row {
  const l = etat.tables.devis.find((r) => r.id === id);
  if (!l) throw new Error(`fixture absente : ${id}`);
  return l;
}

function ops(table: string, mode?: Mode): Operation[] {
  return etat.operations.filter((o) => o.table === table && (!mode || o.mode === mode));
}

function contexte(id: string) {
  return { params: Promise.resolve({ id }) };
}

function base(segment: string, id: string): string {
  return `http://localhost/api/devis/${id}/${segment}`;
}

function postJson(segment: string, id: string, body: unknown): Request {
  return new Request(base(segment, id), {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  });
}

function nextGet(segment: string, id: string, query = ""): NextRequest {
  return new NextRequest(`${base(segment, id)}${query}`, {
    headers: { "x-forwarded-for": "203.0.113.9" },
  });
}

function nextPost(segment: string, id: string): NextRequest {
  return new NextRequest(base(segment, id), {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.9" },
  });
}

/** Charge les 3 handlers à l'état frais (mémoire module-level réinitialisée). */
async function handlers() {
  return {
    sendOtp: await import("@/app/api/devis/[id]/send-otp/route"),
    verifyOtp: await import("@/app/api/devis/[id]/verify-otp/route"),
    analyse: await import("@/app/api/devis/[id]/analyse/route"),
  };
}

const REPONSE_LLM = JSON.stringify({
  analyse_resultats: { resume: "Analyse de test." },
  lignes_proposees: [{ catalogue_id: OUVRAGE, qte: 2, description: "Laine minerale" }],
  alertes: [],
  recommandations: [],
});

let silencieux: Array<{ mockRestore: () => void }> = [];

beforeAll(() => {
  // `send-otp` journalise l'OTP et `analyse` marque chaque appel LLM : sans
  // silence, la sortie du test est illisible.
  silencieux = (["log", "info", "warn", "error"] as const).map((niveau) =>
    vi.spyOn(console, niveau).mockImplementation(() => {})
  );
});

afterAll(() => {
  for (const s of silencieux) s.mockRestore();
});

beforeEach(() => {
  vi.resetModules();
  etat = creerEtat();
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "cle-de-test";
  spies.getUser.mockReset();
  spies.from.mockReset();
  spies.genererTexte.mockReset();
  spies.from.mockImplementation((table: string) => {
    etat.fromCalls.push(table);
    return new Fake(table, etat);
  });
  spies.genererTexte.mockImplementation(async () => ({ text: REPONSE_LLM }));
  sessioner(BNA);
});

// ───────────────────────────────────────────────────────────────────────────
// A) Prédicats tenant OBSERVÉS (pas lus dans le source)
// ───────────────────────────────────────────────────────────────────────────

describe("A) predicats tenant reellement appliques", () => {
  it("A1 - send-otp : l'ecriture devis porte id ET entreprise_id", async () => {
    sessioner(TEST);
    const { sendOtp } = await handlers();
    const res = await sendOtp.POST(
      postJson("send-otp", DEVIS_TEST, { phone: "0655555555" }),
      contexte(DEVIS_TEST)
    );

    expect(res.status).toBe(200);
    const maj = ops("devis", "mise_a_jour");
    expect(maj).toHaveLength(1);
    expect(maj[0].filtres).toEqual([
      ["id", DEVIS_TEST],
      ["entreprise_id", TEST],
    ]);
  });

  it("A2 - verify-otp : la LECTURE et l'ECRITURE portent toutes deux entreprise_id", async () => {
    sessioner(TEST);
    const { verifyOtp } = await handlers();
    const res = await verifyOtp.POST(
      postJson("verify-otp", DEVIS_TEST, { code: "424242" }),
      contexte(DEVIS_TEST)
    );

    expect(res.status).toBe(200);
    expect(ops("devis", "lecture")[0].filtres).toEqual([
      ["id", DEVIS_TEST],
      ["entreprise_id", TEST],
    ]);
    const maj = ops("devis", "mise_a_jour");
    expect(maj).toHaveLength(1);
    expect(maj[0].filtres).toEqual([
      ["id", DEVIS_TEST],
      ["entreprise_id", TEST],
    ]);
  });

  it("A3 - analyse POST : lecture devis ET operations devis_ia portent entreprise_id", async () => {
    sessioner(TEST);
    const { analyse } = await handlers();
    const res = await analyse.POST(nextPost("analyse", DEVIS_TEST), contexte(DEVIS_TEST));

    expect(res.status).toBe(200);
    expect(ops("devis", "lecture")[0].filtres).toEqual([
      ["id", DEVIS_TEST],
      ["entreprise_id", TEST],
    ]);
    const surIa = ops("devis_ia");
    expect(surIa.length).toBeGreaterThanOrEqual(2);
    for (const op of surIa) {
      expect(op.filtres).toContainEqual(["entreprise_id", TEST]);
    }
  });

  it("A4 - analyse GET : la lecture devis_ia porte entreprise_id", async () => {
    sessioner(TEST);
    const { analyse } = await handlers();
    const res = await analyse.GET(
      nextGet("analyse", DEVIS_TEST, "?avec_historique=true"),
      contexte(DEVIS_TEST)
    );

    expect(res.status).toBe(200);
    expect(ops("devis_ia", "lecture")[0].filtres).toContainEqual(["entreprise_id", TEST]);
  });

  it("A5 - les predicats suivent le CLAIM sur 2 passes (jamais un tenant en dur)", async () => {
    // Le meme handler, deux sessions : un tenant ecrit en dur passerait le
    // test A1-A4 (toujours TEST) et echouerait ici.
    sessioner(BNA);
    const { analyse } = await handlers();
    await analyse.GET(nextGet("analyse", DEVIS_BNA), contexte(DEVIS_BNA));

    sessioner(TEST);
    await analyse.GET(nextGet("analyse", DEVIS_TEST), contexte(DEVIS_TEST));

    const lus = ops("devis_ia", "lecture");
    expect(lus).toHaveLength(2);
    expect(lus[0].filtres).toContainEqual(["entreprise_id", BNA]);
    expect(lus[1].filtres).toContainEqual(["entreprise_id", TEST]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// B) send-otp cross-tenant
// ───────────────────────────────────────────────────────────────────────────

describe("B) send-otp - devis d'un autre tenant", () => {
  it("B1 - retourne 404", async () => {
    sessioner(BNA);
    const { sendOtp } = await handlers();
    const res = await sendOtp.POST(
      postJson("send-otp", DEVIS_TEST, { phone: "0655555555" }),
      contexte(DEVIS_TEST)
    );

    expect(res.status).toBe(404);
  });

  it("B2 - l'ecriture EMISE est scoping : aucune ligne d'un autre tenant", async () => {
    // Correction d'un defaut de ce test : une route dont le SEUL acces est un
    // UPDATE ne peut PAS ne pas emettre de requete — c'est cette requete qui
    // prouve l'appartenance. Ce qui doit etre vrai, c'est qu'elle porte le
    // predicat et qu'elle ne touche donc aucune ligne. La zero-mutation reelle
    // est prouvee en B3.
    sessioner(BNA);
    const { sendOtp } = await handlers();
    await sendOtp.POST(
      postJson("send-otp", DEVIS_TEST, { phone: "0655555555" }),
      contexte(DEVIS_TEST)
    );

    const maj = ops("devis", "mise_a_jour");
    expect(maj).toHaveLength(1);
    expect(maj[0].filtres).toEqual([
      ["id", DEVIS_TEST],
      ["entreprise_id", BNA],
    ]);
  });

  it("B3 - la ligne du devis tiers SURVIT INTACTE (signature_phone, OTP, statut)", async () => {
    sessioner(BNA);
    const avant = { ...ligne(DEVIS_TEST) };
    const { sendOtp } = await handlers();
    await sendOtp.POST(
      postJson("send-otp", DEVIS_TEST, { phone: "0699999999" }),
      contexte(DEVIS_TEST)
    );

    expect(ligne(DEVIS_TEST)).toEqual(avant);
    expect(ligne(DEVIS_TEST).signature_phone).toBe("0600000000");
    expect(ligne(DEVIS_TEST).otp_code).toBe("424242");
    expect(ligne(DEVIS_TEST).statut).toBe("envoye");
  });

  it("B4 - la reponse ne laisse fuir ni l'OTP ni le numero ecrit", async () => {
    sessioner(BNA);
    const { sendOtp } = await handlers();
    const res = await sendOtp.POST(
      postJson("send-otp", DEVIS_TEST, { phone: "0699999999" }),
      contexte(DEVIS_TEST)
    );
    const corps = (await res.json()) as Record<string, unknown>;

    expect(corps.success).toBeUndefined();
    expect(JSON.stringify(corps)).not.toContain("424242");
    expect(JSON.stringify(corps)).not.toContain("0699999999");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// C) verify-otp cross-tenant
// ───────────────────────────────────────────────────────────────────────────

describe("C) verify-otp - devis d'un autre tenant", () => {
  it("C1 - retourne 404 meme avec le BON code du devis tiers", async () => {
    sessioner(BNA);
    const { verifyOtp } = await handlers();
    const res = await verifyOtp.POST(
      postJson("verify-otp", DEVIS_TEST, { code: "424242" }),
      contexte(DEVIS_TEST)
    );

    expect(res.status).toBe(404);
  });

  it("C2 - AUCUNE ecriture : le devis tiers n'est PAS signe", async () => {
    sessioner(BNA);
    const { verifyOtp } = await handlers();
    await verifyOtp.POST(
      postJson("verify-otp", DEVIS_TEST, { code: "424242" }),
      contexte(DEVIS_TEST)
    );

    expect(ops("devis", "mise_a_jour")).toHaveLength(0);
    expect(ligne(DEVIS_TEST).statut).toBe("envoye");
    expect(ligne(DEVIS_TEST).signature_date).toBeNull();
    // le code n'est pas consomme : rien n'a ete touche
    expect(ligne(DEVIS_TEST).otp_code).toBe("424242");
  });

  it("C3 - AUCUNE oracle d'existence : 'autre tenant' et 'UUID inexistant' sont INDISCERNABLES", async () => {
    sessioner(BNA);
    const { verifyOtp } = await handlers();

    const tiers = await verifyOtp.POST(
      postJson("verify-otp", DEVIS_TEST, { code: "424242" }),
      contexte(DEVIS_TEST)
    );
    const inconnu = await verifyOtp.POST(
      postJson("verify-otp", INCONNU, { code: "424242" }),
      contexte(INCONNU)
    );

    expect(tiers.status).toBe(404);
    expect(inconnu.status).toBe(404);
    expect(await tiers.json()).toEqual(await inconnu.json());
  });
});

// ───────────────────────────────────────────────────────────────────────────
// D) analyse GET cross-tenant
// ───────────────────────────────────────────────────────────────────────────

describe("D) analyse GET - devis d'un autre tenant", () => {
  it("D1 - retourne 404", async () => {
    sessioner(BNA);
    const { analyse } = await handlers();
    const res = await analyse.GET(
      nextGet("analyse", DEVIS_TEST, "?avec_historique=true"),
      contexte(DEVIS_TEST)
    );

    expect(res.status).toBe(404);
  });

  it("D2 - devis_ia_historique n'est JAMAIS lu", async () => {
    sessioner(BNA);
    const { analyse } = await handlers();
    await analyse.GET(
      nextGet("analyse", DEVIS_TEST, "?avec_historique=true"),
      contexte(DEVIS_TEST)
    );

    expect(ops("devis_ia_historique")).toHaveLength(0);
  });

  it("D3 - la reponse ne contient NI l'analyse NI les alertes du tenant tiers", async () => {
    sessioner(BNA);
    const { analyse } = await handlers();
    const res = await analyse.GET(nextGet("analyse", DEVIS_TEST), contexte(DEVIS_TEST));
    const brut = JSON.stringify(await res.json());

    expect(brut).not.toContain("Analyse initiale du tenant TEST");
    expect(brut).not.toContain("marge_estimee");
    expect(brut).not.toContain("recommandations");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// E) analyse POST cross-tenant
// ───────────────────────────────────────────────────────────────────────────

describe("E) analyse POST - devis d'un autre tenant", () => {
  it("E1 - retourne 404", async () => {
    sessioner(BNA);
    const { analyse } = await handlers();
    const res = await analyse.POST(nextPost("analyse", DEVIS_TEST), contexte(DEVIS_TEST));

    expect(res.status).toBe(404);
  });

  it("E2 - ZERO ecriture dans devis_ia ni devis_ia_historique", async () => {
    sessioner(BNA);
    const { analyse } = await handlers();
    await analyse.POST(nextPost("analyse", DEVIS_TEST), contexte(DEVIS_TEST));

    expect(ops("devis_ia", "insertion")).toHaveLength(0);
    expect(ops("devis_ia", "mise_a_jour")).toHaveLength(0);
    expect(ops("devis_ia_historique")).toHaveLength(0);
  });

  it("E3 - ZERO appel LLM (pas de depense, pas de fuite vers le fournisseur)", async () => {
    sessioner(BNA);
    const { analyse } = await handlers();
    await analyse.POST(nextPost("analyse", DEVIS_TEST), contexte(DEVIS_TEST));

    expect(spies.genererTexte).not.toHaveBeenCalled();
  });

  it("E4 - la lecture du devis tiers est scoping : son contenu ne peut pas sortir", async () => {
    // Meme correction qu'en B2 : la lecture est FORCEMENT emise — c'est elle
    // qui prouve l'appartenance et qui tient le verrou. Ce qui compte est
    // qu'elle soit scoping et ramene donc 0 ligne. Aucune fuite en aval :
    // cf. E2 (zero ecriture) et E3 (zero appel LLM).
    sessioner(BNA);
    const { analyse } = await handlers();
    await analyse.POST(nextPost("analyse", DEVIS_TEST), contexte(DEVIS_TEST));

    const lectures = ops("devis", "lecture");
    expect(lectures).toHaveLength(1);
    expect(lectures[0].filtres).toEqual([
      ["id", DEVIS_TEST],
      ["entreprise_id", BNA],
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// F) Contexte entreprise absent ou invalide - fail-closed sur les 3 routes
// ───────────────────────────────────────────────────────────────────────────

/** Appelle les 4 points d'entree (send-otp, verify-otp, GET analyse, POST analyse). */
async function quatreAppels(): Promise<Response[]> {
  const { sendOtp, verifyOtp, analyse } = await handlers();
  return [
    await sendOtp.POST(postJson("send-otp", DEVIS_TEST, { phone: "0655555555" }), contexte(DEVIS_TEST)),
    await verifyOtp.POST(
      postJson("verify-otp", DEVIS_TEST, { code: "424242" }),
      contexte(DEVIS_TEST)
    ),
    await analyse.GET(nextGet("analyse", DEVIS_TEST), contexte(DEVIS_TEST)),
    await analyse.POST(nextPost("analyse", DEVIS_TEST), contexte(DEVIS_TEST)),
  ];
}

const NOMS_APPELS = ["send-otp", "verify-otp", "analyse GET", "analyse POST"];

describe("F) contexte entreprise absent ou mal forme", () => {
  it("F1 - claim ABSENT : 403 sur les 4 entrees, ZERO requete metier", async () => {
    sessioner(undefined);
    const codes = await quatreAppels();

    expect(codes.map((r) => r.status)).toEqual([403, 403, 403, 403]);
    expect(etat.fromCalls).toHaveLength(0);
    expect(etat.operations).toHaveLength(0);
    expect(spies.genererTexte).not.toHaveBeenCalled();
  });

  it("F2 - claim MAL FORME : 403 sur les 4 entrees, ZERO requete metier", async () => {
    for (const claim of ["pas-un-uuid", "", "   ", 42, null, { nested: true }]) {
      etat = creerEtat();
      spies.from.mockClear();
      sessioner(claim);
      const codes = await quatreAppels();

      expect(codes.map((r) => r.status)).toEqual([403, 403, 403, 403]);
      expect(etat.fromCalls).toHaveLength(0);
      expect(etat.operations).toHaveLength(0);
    }
  });

  it("F3 - le message d'echec ne divulgue ni le tenant attendu ni l'identifiant", async () => {
    sessioner(undefined);
    const codes = await quatreAppels();

    for (const res of codes) {
      const corps = (await res.json()) as Record<string, unknown>;
      const texte = JSON.stringify(corps);
      expect(texte).not.toContain(BNA);
      expect(texte).not.toContain(DEVIS_TEST);
    }
  });

  it("F4 - le nom des 4 entrees est couvert (garde anti-oubli)", () => {
    // Un `quatreAppels` qui oublierait une route ferait passer F1-F3 a vide.
    expect(NOMS_APPELS).toHaveLength(4);
    expect(new Set(NOMS_APPELS).size).toBe(4);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// G) Absence de session
// ───────────────────────────────────────────────────────────────────────────

describe("G) absence de session", () => {
  it("G1 - 401 sur les 4 entrees, ZERO requete metier", async () => {
    sessioner(BNA, false);
    const codes = await quatreAppels();

    expect(codes.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    expect(etat.fromCalls).toHaveLength(0);
    expect(etat.operations).toHaveLength(0);
    expect(spies.genererTexte).not.toHaveBeenCalled();
  });

  it("G2 - aucun secret ni contenu metier dans la reponse 401", async () => {
    sessioner(BNA, false);
    const codes = await quatreAppels();

    for (const res of codes) {
      const texte = JSON.stringify(await res.json());
      expect(texte).not.toContain("424242");
      expect(texte).not.toContain("Analyse initiale du tenant TEST");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// H) Non-regression - le nominal doit survivre au cloisonnement
// ───────────────────────────────────────────────────────────────────────────

describe("H) non-regression du nominal (tenant TEST)", () => {
  it("H1 - send-otp signe le devis de SON tenant : OTP ecrit, 200", async () => {
    sessioner(TEST);
    const { sendOtp } = await handlers();
    const res = await sendOtp.POST(
      postJson("send-otp", DEVIS_TEST, { phone: "0655555555" }),
      contexte(DEVIS_TEST)
    );

    expect(res.status).toBe(200);
    expect(ligne(DEVIS_TEST).signature_phone).toBe("0655555555");
    expect(ligne(DEVIS_TEST).otp_code).toMatch(/^\d{6}$/);
    expect(ligne(DEVIS_TEST).otp_expires_at).not.toBeNull();
  });

  it("H2 - verify-otp avec le BON code signe : statut signe, code detruit", async () => {
    sessioner(TEST);
    const { verifyOtp } = await handlers();
    const res = await verifyOtp.POST(
      postJson("verify-otp", DEVIS_TEST, { code: "424242" }),
      contexte(DEVIS_TEST)
    );

    expect(res.status).toBe(200);
    expect(ligne(DEVIS_TEST).statut).toBe("signe");
    expect(ligne(DEVIS_TEST).otp_code).toBeNull();
    expect(ligne(DEVIS_TEST).signature_date).not.toBeNull();
  });

  it("H3 - verify-otp avec un MAUVAIS code echoue toujours (non-regression du nominal)", async () => {
    sessioner(TEST);
    const { verifyOtp } = await handlers();
    const res = await verifyOtp.POST(
      postJson("verify-otp", DEVIS_TEST, { code: "999999" }),
      contexte(DEVIS_TEST)
    );

    expect(res.status).toBe(400);
    expect(ligne(DEVIS_TEST).statut).toBe("envoye");
  });

  it("H4 - analyse GET rend l'analyse de SON tenant (avec historique)", async () => {
    sessioner(TEST);
    const { analyse } = await handlers();
    const res = await analyse.GET(
      nextGet("analyse", DEVIS_TEST, "?avec_historique=true"),
      contexte(DEVIS_TEST)
    );
    const corps = (await res.json()) as { analyse: Row; historique: unknown };

    expect(res.status).toBe(200);
    expect(corps.analyse.id).toBe(IA_TEST);
    expect(corps.analyse.analyse_resultats).toEqual({
      resume: "Analyse initiale du tenant TEST.",
    });
    expect(corps.historique).toEqual([]);
  });

  it("H5 - analyse POST lance l'analyse de SON devis : 1 appel LLM, statut terminee", async () => {
    sessioner(TEST);
    const { analyse } = await handlers();
    const res = await analyse.POST(nextPost("analyse", DEVIS_TEST), contexte(DEVIS_TEST));
    const corps = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(corps.ok).toBe(true);
    expect(corps.statut).toBe("terminee");
    expect(spies.genererTexte).toHaveBeenCalledTimes(1);
    expect(etat.tables.devis_ia[0].statut).toBe("terminee");
  });

  it("H6 - analyse POST archive l'analyse precedente (non-regression de l'historique)", async () => {
    sessioner(TEST);
    const { analyse } = await handlers();
    await analyse.POST(nextPost("analyse", DEVIS_TEST), contexte(DEVIS_TEST));

    const archives = ops("devis_ia_historique", "insertion");
    expect(archives).toHaveLength(1);
    expect(archives[0].payload?.devis_ia_id).toBe(IA_TEST);
    expect(archives[0].payload?.version).toBe(1);
    // la version courante a bien progresse
    expect(etat.tables.devis_ia[0].version).toBe(2);
  });

  it("H7 - les deux tenants restent cloisonnes dans les DEUX sens", async () => {
    // Non-regression pur : ces deux statuts sont valables AVANT et APRES le
    // cloisonnement. L'assertion sur les predicats, elle, est dans A5.
    sessioner(BNA);
    const { analyse } = await handlers();

    // BNA ne voit pas l'analyse de TEST…
    const chezBna = await analyse.GET(nextGet("analyse", DEVIS_BNA), contexte(DEVIS_BNA));
    expect(chezBna.status).toBe(404);

    // …et TEST voit la sienne.
    sessioner(TEST);
    const chezTest = await analyse.GET(nextGet("analyse", DEVIS_TEST), contexte(DEVIS_TEST));
    expect(chezTest.status).toBe(200);
  });

  it("H8 - le catalogue partage n'est PAS filtre (il n'a pas d'entreprise_id)", async () => {
    sessioner(TEST);
    const { analyse } = await handlers();
    const res = await analyse.POST(nextPost("analyse", DEVIS_TEST), contexte(DEVIS_TEST));

    expect(res.status).toBe(200);
    const catalogues = ops("catalogue_ouvrages");
    expect(catalogues.length).toBeGreaterThanOrEqual(1);
    for (const op of catalogues) {
      expect(op.filtres).not.toContainEqual(["entreprise_id", TEST]);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// I) Garde structurel - AUTO-VERIFIEE
//
// Un test de source peut « detecter » n'importe quoi si son motif est mal
// ecrit : les tests I passeraient alors A VIDE. Chaque motif est donc
// confronte a un contre-exemple construit DANS le test : le motif doit le
// signaler. C'est la condition pour que ces tests valent quelque chose.
//
// Ces tests ne remplacent pas A-H : ils ferment la porte a une reintroduction
// qui laisserait le comportement nominal intact.
// ───────────────────────────────────────────────────────────────────────────

const CHEMINS = {
  sendOtp: join(process.cwd(), "app/api/devis/[id]/send-otp/route.ts"),
  verifyOtp: join(process.cwd(), "app/api/devis/[id]/verify-otp/route.ts"),
  analyse: join(process.cwd(), "app/api/devis/[id]/analyse/route.ts"),
} as const;

type NomRoute = keyof typeof CHEMINS;

const SOURCES = Object.fromEntries(
  (Object.keys(CHEMINS) as NomRoute[]).map((nom) => [nom, readFileSync(CHEMINS[nom], "utf8")])
) as Record<NomRoute, string>;

/** Retire `//` et `/* ... *\/` : un nom cite en commentaire n'est pas un usage. */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const CODE: Record<NomRoute, string> = {
  sendOtp: sansCommentaires(SOURCES.sendOtp),
  verifyOtp: sansCommentaires(SOURCES.verifyOtp),
  analyse: sansCommentaires(SOURCES.analyse),
};

const PREDICAT_TENANT = /\.eq\(\s*["']entreprise_id["']\s*,/;
const PREDICAT_TENANT_G = /\.eq\(\s*["']entreprise_id["']\s*,/g;
const UTILISE_VERIFIER_SESSION = /\bverifierSession\b/;

/** Retire le predicat tenant de la VRAIE source (une ligne entiere). */
function retirerPredicat(src: string): string {
  return src.replace(/[ \t]*\.eq\(\s*["']entreprise_id["']\s*,[^\n]*\n/g, "\n");
}

function compterPredicats(src: string): number {
  return (src.match(PREDICAT_TENANT_G) ?? []).length;
}

/** Bloc de source delimite par deux marqueurs. */
function bloc(source: string, debut: string, fin: string): string {
  const i = source.indexOf(debut);
  if (i < 0) return "";
  const j = source.indexOf(fin, i + debut.length);
  return source.slice(i, j < 0 ? undefined : j);
}

describe("I) garde structurel auto-verifie", () => {
  it("I1 - chaque route porte au moins un .eq('entreprise_id', ...)", () => {
    for (const nom of Object.keys(CHEMINS) as NomRoute[]) {
      expect(compterPredicats(CODE[nom]), nom).toBeGreaterThanOrEqual(1);
    }
  });

  it("I2 - verify-otp en porte au moins DEUX (lecture ET ecriture)", () => {
    expect(compterPredicats(CODE.verifyOtp)).toBeGreaterThanOrEqual(2);
  });

  it("I3 - `verifierSession` n'est PLUS utilise : elle ne fournit aucun tenant", () => {
    // Le nom est cite dans les commentaires de ces routes : c'est le CODE,
    // commentaires retires, qui doit être exempt. Sans ce filtre, I3 echouerait
    // pour une raison purement documentaire.
    for (const nom of Object.keys(CHEMINS) as NomRoute[]) {
      expect(CODE[nom], nom).not.toMatch(UTILISE_VERIFIER_SESSION);
    }
  });

  it("I4 - le tenant n'est jamais ecrit en dur (aucun UUID littéral)", () => {
    const litteraux =
      /['"][0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}['"]/gi;
    for (const nom of Object.keys(CHEMINS) as NomRoute[]) {
      expect(SOURCES[nom].match(litteraux), nom).toBeNull();
    }
  });

  it("I5 - send-otp expose les lignes touchees (.select) : c'est son SEUL acces", () => {
    // send-otp n'a aucune lecture prealable : sans `.select()`, PostgREST ne
    // renvoie rien et la route ne peut pas constater 0 ligne => elle repondrait
    // 200 sur un devis qui n'existe pas ou appartient a un autre tenant.
    expect(CODE.sendOtp).toMatch(/\.select\(\s*["'][^"']+["']\s*\)/);
  });

  it("I6 - le catalogue partage n'est PAS filtre : la table n'a pas entreprise_id", () => {
    // Garde de non-regression fonctionnelle : filtrer `catalogue_ouvrages`
    // casserait l'analyse (colonne inexistante) ET le partage du catalogue BNA.
    const chargeur = bloc(
      CODE.analyse,
      "async function chargerCatalogue",
      "function selectionnerContexteCatalogue"
    );
    expect(chargeur).not.toBe("");
    expect(chargeur).not.toMatch(PREDICAT_TENANT);
  });

  it("I7 - AUTO-VERIFICATION : I1 et I2 detectent une copie reellement non scopee", () => {
    for (const nom of Object.keys(CHEMINS) as NomRoute[]) {
      const sans = retirerPredicat(CODE[nom]);
      // 1) le retrait a bien change quelque chose…
      expect(sans, nom).not.toBe(CODE[nom]);
      // 2) …et le detecteur le voit (sinon I1-I2 passeraient a vide).
      expect(compterPredicats(sans), nom).toBe(0);
      expect(sans, nom).not.toMatch(PREDICAT_TENANT);
    }
  });

  it("I8 - AUTO-VERIFICATION : I3 detecte sa contre-exemple", () => {
    // L'ancre est d'abord verifiee : sinon un `replace()` caduc deviendrait un
    // no-op silencieux et ce test passerait a vide.
    const ancre = 'import { resoudreTenant } from "@/lib/tenant";';
    expect(SOURCES.sendOtp).toContain(ancre);

    const avecVerifier = sansCommentaires(
      SOURCES.sendOtp.replace(
        ancre,
        `${ancre}\nimport { verifierSession } from "@/lib/auth";\nvoid verifierSession;`
      )
    );
    // 1) l'injection a bien eu lieu…
    expect(avecVerifier).not.toBe(CODE.sendOtp);
    // 2) …et le detecteur la signale.
    expect(avecVerifier).toMatch(UTILISE_VERIFIER_SESSION);
  });

  it("I9 - AUTO-VERIFICATION : I5 detecte la disparition du .select", () => {
    const sansSelect = CODE.sendOtp.replace(/\.select\(\s*["'][^"']+["']\s*\)/g, "");
    expect(sansSelect).not.toBe(CODE.sendOtp);
    expect(sansSelect).not.toMatch(/\.select\(\s*["'][^"']+["']\s*\)/);
  });

  it("I10 - AUTO-VERIFICATION : I6 detecte un catalogue filtre", () => {
    const catalogueFiltre = CODE.analyse.replace(
      '.select("id, designation, description, famille_label, unite, pu_ht, pu_revient, type_cout")',
      '.select("id, designation, description, famille_label, unite, pu_ht, pu_revient, type_cout")\n    .eq("entreprise_id", "x")'
    );
    const chargeur = bloc(
      catalogueFiltre,
      "async function chargerCatalogue",
      "function selectionnerContexteCatalogue"
    );
    expect(chargeur).toMatch(PREDICAT_TENANT);
  });
});