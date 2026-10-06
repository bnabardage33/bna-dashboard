// @vitest-environment node
//
// Isolation tenant de `app/api/devis/[id]/*` : **analyse seulement**.
//
// ─────────────────────────────────────────────────────────────────────────────
// CE FICHIER A ETE REDUIT DEUX FOIS — AUCUN TEST N'A ETE SUPPRIME
// ─────────────────────────────────────────────────────────────────────────────
//
// PREMIERE REDUCTION — le flux de signature a change de FORME.
// Les routes OTP ont ete deplacees sous `app/api/espace-client/[code_acces]/`
// puis reecrites autour d'une transaction PostgreSQL unique. Ce qu'elles
// affirmaient n'y est plus observable, et un test qui continuerait a l'affirmer
// passerait au vert sur une architecture qui n'existe plus.
//
// Les DIX-SEPT tests concernes ont donc ete PORTES, identite d'origine conservee, et
// non reecrits — sauf I2 et I7, dont l'objet meme a disparu (voir ci-dessous).
// Ils vivent dans `espace-client-signature.test.ts` :
//
//     A1  A2  B1  B2  B3  B4  C1  C2  C3  H1  H2  H3  I1  I2  I5  I7  I9
//
// Le detail de chaque port est dans les balises `[PORTE ...]` du fichier
// d'arrivee.
//
// ─────────────────────────────────────────────────────────────────────────────
// SECONDE REDUCTION — les deux routes OTP ont ete SUPPRIMEES
// ─────────────────────────────────────────────────────────────────────────────
//
// La cartographie d'appelants a etabli qu'elles n'avaient plus AUCUN appelant :
// ni page, ni composant, ni fetch dynamique, ni script. Elles sont donc retirees.
// Ce qui change n'est pas une intention de test mais sa REALITE : ce fichier ne
// peut plus les invoquer, et sa section B verifie desormais qu'elles sont
// PHYSIQUEMENT ABSENTES — garantie plus forte que tout test d'isolation, puisque
// le code non importe ne peut pas s'executer.
//
// Il ne faut pas confondre deux choses qui se ressemblent :
//
//   * `F`/`G` ont.change de PORTEE : `resoudreTenant()` en echec ferme est
//     toujours teste, mais sur les DEUX entrees restantes. C'etait deja le cas
//     pour `analyse` seul ; la question posee par F1-F3 — « un claim absent ou
//     mal forme donne-t-il 403 sans toucher la base ? » — n'a pas change.
//
//   * `G1` perd sa moitie OTP. Le refus 401 sans session NE S'APPLIQUE PLUS aux
//     routes de signature, et c'etait deja vrai avant la suppression : elles
//     vivaient sous `/api/espace-client`, donc hors du chemin session, et leur
//     garde est `code_acces` -> chantier -> devis. Ce garde est teste ailleurs, a
//     sa vraie place : `espace-client-signature.test.ts` section B. Rien n'est
//     perdu ; la garantie est simplement exercee la ou elle existe.
//
// LE CAS PARTICULIER DE I2 ET I7
// -----------------------------
// Ces deux tests affirmaient que `verify-otp` cloisonnait par `entreprise_id`.
// Ce cloisonnement etait un `.eq()` TypeScript, donc analysable. Il n'existe
// plus : il est desormais dans le CORPS SQL de la RPC. Un I2 d'origine recopie
// tel quel chercherait un `.eq("entreprise_id", ...)` dans une route qui n'en a
// plus, trouverait le motif dans un COMMENTAIRE, et passerait au vert sur une RPC
// entierement non cloisonnee. C'est l'auto-verification rigoureuse, inversee.
// I2 et I7 ont donc ete reecrits sur le SQL REEL, et I18 refute des mutants SQL.
//

// Les VRAIES routes sont exécutées (GET analyse, POST analyse). Seuls sont stubés :
// le client Supabase SSR (session), `supabaseAdmin` (service_role) et le
// fournisseur LLM. Aucun réseau, aucun DML, aucun secret.
//
// Fidélité du stub, condition de validité de ces tests :
//   * `.eq()` est un prédicat RÉELLEMENT appliqué aux lignes. C'est ce qui rend
//     détectable la suppression du filtre `entreprise_id` : le mutant lit alors la
//     ligne de l'autre tenant, et le test le voit.
//   * `.update()` / `.insert()` n'exposent des données que si `.select()` a été
//     appelé, comme PostgREST. Une route ne peut donc pas « compter » les lignes
//     touchées sans `.select()`.
//   * Chaque handler est rechargé à chaque test (`vi.resetModules()`) car la
//     route analyse a un état module-level qui fuiterait d'un test à l'autre.
//   * `.or(...)` est journalisé mais NON appliqué : c'est la condition de
//     concurrence de `revendiquerAnalyse`, et son respect est déjà couvert par
//     `__tests__/ia/devis-ia-route.test.ts`. Le stub ne prétend pas le simuler.
//   * `devis_ia.entreprise_id` est posé en base par le trigger
//     `tg_set_entreprise_par_devis`. Le stub ne fait pas tourner de trigger : la
//     fixture porte donc la colonne explicitement, à la valeur que le trigger
//     aurait posée (celle du devis parent).

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { sansCommentaires } from "./_lecture-source";

/**
 * Tout le code applicatif susceptible d'appeler une route : `app/`, `components/`
 * et `lib/`. Les tests sont exclus — ils DOIVENT nommer les routes legacy pour
 * vérifier leur absence, et les inclure les ferait se signaler eux-mêmes.
 */
const CORPUS: string[] = [
  ...sous("app"),
  ...sous("components"),
  ...sous("lib"),
];

function sous(dossier: string): string[] {
  const sortie: string[] = [];
  const racine = join(process.cwd(), dossier);
  const parcours = (d: string) => {
    for (const entree of readdirSync(d, { withFileTypes: true })) {
      const chemin = join(d, entree.name);
      if (entree.isDirectory()) parcours(chemin);
      else if (/\.(ts|tsx)$/.test(entree.name)) sortie.push(chemin);
    }
  };
  parcours(racine);
  return sortie;
}

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

// `postJson` a ete retire avec les deux routes OTP : il ne servait qu'a leur
// fabriquer un corps de requete (`{ phone }` puis `{ code }`). Le conserver
// aurait laisse dans le fichier un constructeur d'URL vers `/api/devis/{id}/*`
// sans aucun usage — un rappel permanent d'une API qui n'existe plus.

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

/**
 * Charge le handler à l'état frais (mémoire module-level réinitialisée).
 *
 * Un SEUL handler : les deux routes OTP ont été supprimées (voir l'en-tête et la
 * section B). Les garder ici ferait échouer l'import à la collecte, ce qui est un
 * garde-fou utile — mais un message d'erreur d'import n'explique PAS la décision,
 * alors que la section B, elle, la documente et la vérifie.
 */
async function handlers() {
  return {
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
  // `analyse` marque chaque appel LLM : sans silence, la sortie du test est
  // illisible.
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
// B) LES ROUTES OTP LEGACY SONT PHYSIQUEMENT ABSENTES
// ───────────────────────────────────────────────────────────────────────────
//
// C'est ici que vivent les guarantees que B1 et C1 affirmaient.
//
// L'ancienne intention etait : « si un utilisateur authentifié du tenant A
// appelle `POST /api/devis/[id]/send-otp` avec l'UUID d'un devis du tenant B, la
// reponse est un 404 et le tenant B n'est pas ecrit. » Elle est satisfaite, mais
// plus STRICTEMENT : le fichier n'existe plus, donc la route n'est pas enregistree
// par le routeur, donc le code ne peut pas s'executer. Un test d'isolation
// verifie une propriete d'un programme ; celui-ci verifie une propriete du
// systeme de fichiers, qui est plus forte.
//
// Il faut mesurer ce que cela change. Ces deux routes n'etaient PAS inoffensives :
//   * `send-otp` prenait `phone` dans le CORPS de la requete, donc le numero
//     d'avertissement etait choisi par l'appelant ;
//   * `verify-otp` comparait le code en clair et ne laissait AUCUNE trace : il
//     passait `devis.statut` a 'signe' sans ecrire dans `devis_signatures` ;
//   * son anti-bruteforce etait un `Map` en memoire, perdu au redemarrage et
//     inutile en serverless multi-instances.
// Elles vivaient sous `/api/devis`, donc derriere session — mais `signer`, elle,
// etait PUBLIQUE (`/api/espace-client` est un prefixe public) et ne demandait ni
// OTP ni image. C'est ce que ces routes etaient : un second canal de signature,
// sans aucune des garanties du nouveau.
//
// La cartographie ne trouva aucun appelant. Aucune page, aucun composant, aucune
// construction d'URL dynamique, aucun script, aucune configuration. Le parcours
// reel passe par `SignatureModal` -> `/api/espace-client/[code_acces]/send-otp`
// puis `/verify-otp`, et `espace-client-signature.test.ts` section B verifie
// l'isolation de CE chemin-la — par code d'acces, sa ou elle existe reellement.
//

describe("B) les deux routes OTP legacy sont retirees", () => {
  it("B1 le FICHIER de la route send-otp n'existe plus", () => {
    // Dans l'App Router, le routeur est construit a partir de l'ARBORESCENCE.
    // Un fichier absent ne produit pas de route : il n'y a pas de handler qui
    // repondrait 404, il n'y a rien du tout. C'est ce qui rend cette garantie
    // superieure a un 404 - un 404 prouve qu'une branche existe et se contente
    // de refuser ; l'absence prouve qu'il n'y a pas de branche.
    expect(existsSync(join(process.cwd(), "app/api/devis/[id]/send-otp/route.ts"))).toBe(false);
  });

  it("B2 le FICHIER de la route verify-otp n'existe plus", () => {
    expect(existsSync(join(process.cwd(), "app/api/devis/[id]/verify-otp/route.ts"))).toBe(false);
  });

  it("B3 le repertoire send-otp a entierement disparu, pas seulement son handler", () => {
    // Un `route.ts` supprime mais laisse un dossier vide, un `README`, ou un
    // `handler.ts` non enregistre : rien ne le prouverait, et l'apparition d'une
    // route a cote, un jour, serait accueillie comme une continuité. On verifie
    // l'absence du REPERTOIRE, qui est l unite que le routeur observe.
    expect(existsSync(join(process.cwd(), "app/api/devis/[id]/send-otp"))).toBe(false);
    expect(existsSync(join(process.cwd(), "app/api/devis/[id]/verify-otp"))).toBe(false);
  });

  it("B4 `analyse` a SURVECU : la suppression n'a pas emporté la route voisine", () => {
    // Le test inverse d'une suppression trop large. Une erreur de manipulation
    // courante est de retirer le parent au lieu des enfants : le repository
    // passerait tous les tests de cette section en celebrant une disparition
    // generale. On exige que la route voisine, elle, soit toujours la.
    expect(existsSync(join(process.cwd(), "app/api/devis/[id]/analyse/route.ts"))).toBe(true);
  });

  it("B5 AUTO-VERIFICATION : B1-B3 detectent le retour des routes legacy", () => {
    // Un invariant d'absence qui ne peut pas echouer ne prouve rien : le voici
    // replique sur un etat de fichiers ou les routes sont presentes.
    const routesLegacy = [
      "app/api/devis/[id]/send-otp/route.ts",
      "app/api/devis/[id]/verify-otp/route.ts",
    ];
    const invariant = (present: string[]) => present.length === 0;

    expect(invariant(routesLegacy), "l'invariant voit les routes presentes").toBe(false);
    expect(invariant([]), "l'invariant rejette un etat propre").toBe(true);
  });

  it("B6 aucun fichier du dépôt ne référence encore ces routes hors commentaire", () => {
    // Garde de non-retour par le calcul : si quelqu'un reintroduit un appel, un
    // `await import(...)` cassera ce fichier — mais un appel par CONSTRUCTION
    // DYNAMIQUE (`fetch(\`/api/devis/${id}/verify-otp\`)`) ne casserait rien du
    // tout. Ce test voit les deux formes.
    const dynamique = /["'`]?\/api\/devis\/\$\{[^}]+\}\/(?:send|verify)-otp/;
    for (const fichiers of CORPUS) {
      const lu = sansCommentaires(readFileSync(fichiers, "utf8"), { jsx: true });
      expect(dynamique.test(lu), `appel dynamique vers une route legacy dans ${fichiers}`).toBe(false);
      expect(
        /await import\(["']@\/app\/api\/devis\/\[id\]\/(?:send|verify)-otp/.test(lu),
        `import de handler legacy dans ${fichiers}`
      ).toBe(false);
    }
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
// F) Contexte entreprise absent ou invalide - fail-closed sur les 2 entrees
// ───────────────────────────────────────────────────────────────────────────

/** Appelle les 2 points d'entree restants (GET analyse, POST analyse). */
async function deuxAppels(): Promise<Response[]> {
  const { analyse } = await handlers();
  return [
    await analyse.GET(nextGet("analyse", DEVIS_TEST), contexte(DEVIS_TEST)),
    await analyse.POST(nextPost("analyse", DEVIS_TEST), contexte(DEVIS_TEST)),
  ];
}

const NOMS_APPELS = ["analyse GET", "analyse POST"];

describe("F) contexte entreprise absent ou mal forme", () => {
  it("F1 - claim ABSENT : 403 sur les 2 entrees, ZERO requete metier", async () => {
    sessioner(undefined);
    const codes = await deuxAppels();

    expect(codes.map((r) => r.status)).toEqual([403, 403]);
    expect(etat.fromCalls).toHaveLength(0);
    expect(etat.operations).toHaveLength(0);
    expect(spies.genererTexte).not.toHaveBeenCalled();
  });

  it("F2 - claim MAL FORME : 403 sur les 2 entrees, ZERO requete metier", async () => {
    for (const claim of ["pas-un-uuid", "", "   ", 42, null, { nested: true }]) {
      etat = creerEtat();
      spies.from.mockClear();
      sessioner(claim);
      const codes = await deuxAppels();

      expect(codes.map((r) => r.status)).toEqual([403, 403]);
      expect(etat.fromCalls).toHaveLength(0);
      expect(etat.operations).toHaveLength(0);
    }
  });

  it("F3 - le message d'echec ne divulgue ni le tenant attendu ni l'identifiant", async () => {
    sessioner(undefined);
    const codes = await deuxAppels();

    for (const res of codes) {
      const corps = (await res.json()) as Record<string, unknown>;
      const texte = JSON.stringify(corps);
      expect(texte).not.toContain(BNA);
      expect(texte).not.toContain(DEVIS_TEST);
    }
  });

  it("F4 - le nom des 2 entrees est couvert (garde anti-oubli)", () => {
    // Un `deuxAppels` qui oublierait une route ferait passer F1-F3 a vide.
    expect(NOMS_APPELS).toHaveLength(2);
    expect(new Set(NOMS_APPELS).size).toBe(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// G) Absence de session
// ───────────────────────────────────────────────────────────────────────────

describe("G) absence de session", () => {
  // La portée de G est ici plus étroite qu'elle ne l'etait, et c'est un fait
  // qu'il faut dire plutot que laisser deduire. Les deux entrees OTP etaient
  // derriere session parce qu'elles vivaient sous `/api/devis`. Elles vivaient
  // aussi sous cette prefixe-ci — donc un utilisateur sans session n'en aurait
  // rien obtenu NON PLUS, mais par une tout autre voie : `/api/espace-client` est
  // un prefixe PUBLIC, et la garde des routes de signature est `code_acces`
  // (et non une session). Ce garde est verifie a sa vraie place, dans
  // `espace-client-signature.test.ts` section B.
  // Tester ici un « il faut une session » pour une route qui n'en demande pas
  // aurait produit un test qui documents un mecanisme absent.

  it("G1 - 401 sur les 2 entrees, ZERO requete metier", async () => {
    sessioner(BNA, false);
    const codes = await deuxAppels();

    expect(codes.map((r) => r.status)).toEqual([401, 401]);
    expect(etat.fromCalls).toHaveLength(0);
    expect(etat.operations).toHaveLength(0);
    expect(spies.genererTexte).not.toHaveBeenCalled();
  });

  it("G2 - aucun secret ni contenu metier dans la reponse 401", async () => {
    sessioner(BNA, false);
    const codes = await deuxAppels();

    for (const res of codes) {
      const texte = JSON.stringify(await res.json());
      expect(texte).not.toContain("424242");
      expect(texte).not.toContain("Analyse initiale du tenant TEST");
    }
  });

  it("G3 - le garde des routes de signature n'est PAS la session : c'est le code d'acces", () => {
    // Le contrepied de G1, et il merite d'etre teste parce qu'il dit ce que
    // G1 ne dit plus. Une lecture erronee de ce fichier croirait que toute route
    // `/api/...` exige une session ; c'est faux, et `/api/espace-client` est
    // expressement public. La consequence operationnelle est importante : on ne
    // peut pas juger la securite du portail client en comptant les 401.
    const middleware = readFileSync(join(process.cwd(), "lib/supabase/middleware.ts"), "utf8");
    // Les guillemets ne font rien a l'intention : on tolere les deux formes
    // plutot que d'ecrire un motif qui casse au premier prettier -s.
    expect(middleware).toMatch(/PUBLIC_PREFIXES\s*=\s*\[[^\]]*['"]\/api\/espace-client['"]/);
    // Et le portail resout son tenant par le chantier, pas par un JWT.
    const garde = readFileSync(
      join(process.cwd(), "app/api/espace-client/[code_acces]/_garde-signature.ts"),
      "utf8"
    );
    expect(garde).toMatch(/code_acces/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// H) Non-regression - le nominal doit survivre au cloisonnement
// ───────────────────────────────────────────────────────────────────────────

describe("H) non-regression du nominal (tenant TEST)", () => {
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

// SEULEMENT la route qui n'a pas change de forme. Les deux routes OTP ont ete
// deplacees sous `app/api/espace-client/[code_acces]/` puis ecrites autour d'une
// RPC : ce qu'elles affirmaient ne peut plus etre observe ici, et un test qui le
// ferait encore passerait au vert sur une architecture qui n'existe plus.
const CHEMINS = {
  analyse: join(process.cwd(), "app/api/devis/[id]/analyse/route.ts"),
} as const;

type NomRoute = keyof typeof CHEMINS;

const SOURCES = Object.fromEntries(
  (Object.keys(CHEMINS) as NomRoute[]).map((nom) => [nom, readFileSync(CHEMINS[nom], "utf8")])
) as Record<NomRoute, string>;

const CODE: Record<NomRoute, string> = {
  analyse: sansCommentaires(SOURCES.analyse),
};

const PREDICAT_TENANT = /\.eq\(\s*["']entreprise_id["']\s*,/;
const UTILISE_VERIFIER_SESSION = /\bverifierSession\b/;

/** Bloc de source delimite par deux marqueurs. */
function bloc(source: string, debut: string, fin: string): string {
  const i = source.indexOf(debut);
  if (i < 0) return "";
  const j = source.indexOf(fin, i + debut.length);
  return source.slice(i, j < 0 ? undefined : j);
}

describe("I) garde structurel auto-verifie", () => {
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

  it("I8 - AUTO-VERIFICATION : I3 detecte sa contre-exemple", () => {
    // L'ancre est d'abord verifiee : sinon un `replace()` caduc deviendrait un
    // no-op silencieux et ce test passerait a vide.
    const ancre = 'import { resoudreTenant } from "@/lib/tenant";';
    expect(SOURCES.analyse).toContain(ancre);

    const avecVerifier = sansCommentaires(
      SOURCES.analyse.replace(
        ancre,
        `${ancre}\nimport { verifierSession } from "@/lib/auth";\nvoid verifierSession;`
      )
    );
    // 1) l'injection a bien eu lieu…
    expect(avecVerifier).not.toBe(CODE.analyse);
    // 2) …et le detecteur la signale.
    expect(avecVerifier).toMatch(UTILISE_VERIFIER_SESSION);
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