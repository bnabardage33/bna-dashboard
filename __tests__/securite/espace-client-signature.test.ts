// @vitest-environment node
//
// PORTE DES TESTS DE SIGNATURE VERS L'ARCHITECTURE RPC
// =====================================================
//
// Ces tests prennent le relais de `__tests__/securite/devis-id-tenant.test.ts`
// pour tout ce qui concernait les ANCIENNES routes
// `app/api/devis/[id]/{send,verify}-otp`. AUCUN test n'a été supprimé : les DIX-SEPT
// tests concernés sont ici, identités d'origine conservées — A1, A2, B1-B4,
// C1-C3, H1-H3, I1, I2, I5, I7, I9 — chacun sous une balise `[PORTE]`, ce qui rend le
// suivi lisible ligne à ligne. Le fichier d'origine a été réduit à ce qui
// concerne `analyse`, qui n'a pas bougé : 26 tests y restent.
//
// I2 et I7 sont les deux SEULES exceptions : leur objet, un `.eq("entreprise_id")`
// TypeScript, n'existe plus (voir « DEUX STRATES »). Ils ont été réécrits sur le
// SQL réel, et I18 refute des mutants SQL réels pour prouver qu'ils peuvent
// encore échouer.
//
// DEUX STRATES, ET POURQUOI
// -------------------------
// L'architecture a changé de forme : la signature n'est plus trois écritures
// depuis le code applicatif, mais UNE transaction PostgreSQL. Un test qui
// n'exerce que la route ne prouve donc plus la propriété qui compte — « jamais
// de preuve sans OTP consommé, jamais d'OTP consommé sans preuve ». Ces tests
// sont donc en deux strates :
//
//   * STRATE HTTP (A1, A2, B*, C*, H*, I1, I5) : la route est exécutée avec un
//     stub Supabase fail-closed, et la réponse de la RPC est programmée motif par
//     motif.
//   * STRATE SQL (I2, I7) : la construction de la transaction est vérifiée sur
//     le CORPS SQL RÉEL de la RPC, parce que c'est là qu'elle se joue désormais.
//
// L'exécution de la RPC contre un PostgreSQL réel (13 scénarios, dont deux
// courses concurrentes et un rollback vérifié) est faite par les scripts de
// preuve `preuve-rpc*.sql`, hors dépôt. Ce fichier ne prétend pas la remplacer :
// il couvre le contrat HTTP et la structure du SQL ; la preuve couvre le
// comportement de la base. Aucun des deux ne couvre l'autre.
//
// FIDÉLITÉ DU STUB, CONDITION DE VALIDITÉ DE CES TESTS
// ----------------------------------------------------
//   * `.eq()` est un prédicat RÉELLEMENT appliqué aux lignes : c'est ce qui rend
//     détectable la suppression d'un filtre. Le mutant lit alors la ligne de
//     l'autre tenant, et le test le voit.
//   * `.order({ascending:false})` trie RÉELLEMENT et `.limit(1)` tronque APRÈS
//     le tri. Sans cela « le plus récent OTP » ne serait pas testé du tout.
//   * `.rpc()` ne modifie RIEN la base : la route ne doit dépendre d'aucune
//     écriture de sa part, et un test qui l'y autoriserait masquerait une
//     régression.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { sansCommentaires } from "./_lecture-source";
import { canvasParaphe, pngDataUrl } from "./_fabrique-png";

// ── Fixture ─────────────────────────────────────────────────────────────────
const ENT_A = "11111111-1111-4111-8111-111111111111";
const ENT_B = "22222222-2222-4222-8222-222222222222";

const CHANTIER_A = "d0000000-0000-4000-8000-000000000001";
const CHANTIER_A_SANS_CLIENT = "d0000000-0000-4000-8000-000000000004";
const CHANTIER_TEL_NON_VERIFIE = "d0000000-0000-4000-8000-000000000005";
const CHANTIER_B = "d0000000-0000-4000-8000-000000000002";

const CLIENT_A = "aaaaaaaa-1111-4111-8111-111111111111";
const CLIENT_NON_VERIFIE = "cccccccc-3333-4333-8333-333333333333";

const DEVIS_A = "e0000000-0000-4000-8000-000000000001";
const DEVIS_SANS_CLIENT = "e0000000-0000-4000-8000-000000000004";
const DEVIS_TEL_NON_VERIFIE = "e0000000-0000-4000-8000-000000000005";
const DEVIS_B = "e0000000-0000-4000-8000-000000000002";
const UUID_INCONNU = "99999999-9999-4999-8999-999999999999";

const CODE_A = "CODE-A";
const CODE_B = "CODE-B";
const CODE_INCONNU = "CODE-FAUX";
const CODE_SANS_CLIENT = "CODE-SANS-CLIENT";
const CODE_TEL = "CODE-TEL";

const CODE_VALIDE = "123456";
const CODE_FAUX = "999999";
const SECRET = "secret-de-test-suffisamment-long-pour-32-octets";
/**
 * Fixture d'image de signature.
 *
 * C'ÉTAIT `"data:image/png;base64,AAECAwQFBgc="` — huit octets qui n'ont rien
 * d'un PNG. La valeur est remplacée, pas la constante : le contrôle d'intégrité
 * de la preuve graphique (`_encre-signature.ts`) décode l'image et recompte ses
 * pixels, donc une image bidon est refusée avant d'atteindre l'OTP. Vingt-trois
 * tests de ce fichier échouaient pour cette seule raison, tous pour la même
 * cause, et tous avec la même correction.
 *
 * Aucun test n'est désactivé ni affaibli : les vingt-trois vérifient toujours la
 * même propriété, avec une charge utile qui existe réellement. Le contrôle
 * d'encre a ses propres tests, dans `encre-signature.test.ts`.
 */
const IMAGE_PNG = pngDataUrl(canvasParaphe());

type Ligne = Record<string, unknown>;

let base: Record<string, Ligne[]>;
let reponseRpc: { data: unknown; error: { message: string } | null };
let appelsRpc: Array<{ nom: string; args: Record<string, unknown> }>;
/** Journal des `.eq()` : sert à prouver que la LECTURE de l'OTP est cloisonnée. */
let predicatsOtp: Array<[string, unknown]>;
/** Journal des INSERT : sert à prouver que l'ÉCRITURE est cloisonnée (A1). */
let insertions: Array<{ table: string; ligne: unknown }>;

function baseVierge() {
  return {
    chantiers: [
      { id: CHANTIER_A, code_acces: CODE_A, entreprise_id: ENT_A, client_id: CLIENT_A, client_nom: "Client A", clients: { nom: "Client A" } },
      { id: CHANTIER_A_SANS_CLIENT, code_acces: "CODE-SANS-CLIENT", entreprise_id: ENT_A, client_id: null, client_nom: "", clients: null },
      { id: CHANTIER_TEL_NON_VERIFIE, code_acces: "CODE-TEL", entreprise_id: ENT_A, client_id: CLIENT_NON_VERIFIE, client_nom: "Client C", clients: { nom: "Client C" } },
      { id: CHANTIER_B, code_acces: CODE_B, entreprise_id: ENT_B, client_id: null, client_nom: "Client B", clients: { nom: "Client B" } },
    ],
    devis: [
      { id: DEVIS_A, chantier_id: CHANTIER_A, entreprise_id: ENT_A, statut: "envoye" },
      { id: DEVIS_A_SIGNE, chantier_id: CHANTIER_A, entreprise_id: ENT_A, statut: "signe" },
      { id: DEVIS_SANS_CLIENT, chantier_id: CHANTIER_A_SANS_CLIENT, entreprise_id: ENT_A, statut: "envoye" },
      { id: DEVIS_TEL_NON_VERIFIE, chantier_id: CHANTIER_TEL_NON_VERIFIE, entreprise_id: ENT_A, statut: "envoye" },
      { id: DEVIS_B, chantier_id: CHANTIER_B, entreprise_id: ENT_B, statut: "envoye" },
    ],
    clients: [
      { id: CLIENT_A, entreprise_id: ENT_A, nom: "Client A", tel_normalise: "+33612345678", tel_verifie: true },
      { id: CLIENT_NON_VERIFIE, entreprise_id: ENT_A, nom: "Client C", tel_normalise: null, tel_verifie: false },
    ],
    devis_otp: [] as Ligne[],
  };
}

const DEVIS_A_SIGNE = "e0000000-0000-4000-8000-000000000003";

/**
 * Stub PostgREST : chaîne plate, chaque maillon enregistre puis renvoie le même
 * objet. `then` rend le noeud awaitable, ce qui couvre `.order().limit()`.
 */
function depuis(table: string) {
  const predicats: Array<[string, unknown]> = [];
  let borne: number | null = null;
  let trie = false;

  const lignes = () => {
    const filtrees = predicats.every.length === 0
      ? [...base[table]]
      : base[table].filter((l) => predicats.every(([c, v]) => l[c] === v));
    const rangees = trie
      ? filtrees.slice().sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))
      : filtrees;
    return borne === null ? rangees : rangees.slice(0, borne);
  };

  const noeud = {
    eq(colonne: string, valeur: unknown) {
      predicats.push([colonne, valeur]);
      if (table === "devis_otp") predicatsOtp.push([colonne, valeur]);
      return noeud;
    },
    gte(colonne: string, valeur: unknown) {
      predicats.push([colonne, valeur]);
      return noeud;
    },
    order(_colonne: string, _options?: { ascending?: boolean }) {
      trie = true;
      return noeud;
    },
    limit(n: number) {
      borne = n;
      return noeud;
    },
    async maybeSingle() {
      const r = lignes();
      return { data: r[0] ?? null, error: null };
    },
    then(resoudre: (v: { data: Ligne[]; error: null }) => unknown) {
      return Promise.resolve({ data: lignes(), error: null }).then(resoudre);
    },
  };

  return {
    select: () => noeud,
    insert: async (ligne: unknown) => {
      insertions.push({ table, ligne });
      return { error: null };
    },
    update: async () => ({ error: null }),
  };
}

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => depuis(table),
    rpc: async (nom: string, args: Record<string, unknown>) => {
      appelsRpc.push({ nom, args });
      return reponseRpc;
    },
  },
}));

vi.mock("@/lib/otp", async () => {
  const reel = await vi.importActual<typeof import("@/lib/otp")>("@/lib/otp");
  return {
    ...reel,
    selectionnerFournisseurSms: () => ({
      nom: "console_mock" as const,
      envoyer: async () => ({ ok: true as const }),
    }),
  };
});

async function chargerVerifyOtp() {
  vi.resetModules();
  process.env.OTP_HMAC_SECRET = SECRET;
  return import("@/app/api/espace-client/[code_acces]/verify-otp/route");
}

async function chargerSendOtp() {
  vi.resetModules();
  process.env.OTP_HMAC_SECRET = SECRET;
  return import("@/app/api/espace-client/[code_acces]/send-otp/route");
}

function params(code_acces: string) {
  return { params: Promise.resolve({ code_acces }) };
}

/**
 * Signature REELLE des deux routes. Elle est ecrite explicitement plutot que
 * `{ POST: (r, p: unknown) => … }` : `unknown` en position de parametre est
 * contravariant, donc une route dont le second parametre est precise refuse de
 * s'y assigner, et le test ne compilerait pas — c'est le seul endroit du fichier
 * ou la discipline de type sert d'avertissement plutot que de nuisance.
 */
type RouteEspaceClient = {
  POST: (
    r: NextRequest,
    ctx: { params: Promise<{ code_acces: string }> }
  ) => Promise<Response>;
};

function post(route: RouteEspaceClient, chemin: string, body: unknown, code_acces = CODE_A) {
  const requete = new NextRequest(`http://localhost/api/espace-client/${code_acces}/${chemin}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.5" },
    body: JSON.stringify(body),
  });
  return route.POST(requete, params(code_acces));
}

function corps(surcharge: Record<string, unknown> = {}) {
  return {
    devisId: DEVIS_A,
    code: CODE_VALIDE,
    signatureImage: IMAGE_PNG,
    mentionBonPourAccord: true,
    ...surcharge,
  };
}

function ajoutOtp(surcharge: Partial<Ligne> = {}): Ligne {
  const ligne: Ligne = {
    id: "aaaaaaaa-4444-4444-8444-444444444441",
    devis_id: DEVIS_A,
    entreprise_id: ENT_A,
    code_hmac: null,
    expires_at: new Date(Date.now() + 9 * 60_000).toISOString(),
    consumed_at: null,
    tentatives: 0,
    verrouille_jusqua: null,
    ip: null,
    created_at: new Date().toISOString(),
    ...surcharge,
  };
  base.devis_otp.push(ligne);
  return ligne;
}

/** Programme le SUCCÈS de la transaction atomique. */
function rpcReussit() {
  reponseRpc = {
    data: {
      ok: true,
      signature_id: "ffffffff-5555-4555-8555-555555555555",
      signed_at: "2026-10-04T07:00:00Z",
      devis_empreinte_sha256: "a".repeat(64),
    },
    error: null,
  };
}

/** Programme un refus METIER : la RPC RETOURNE, elle ne leve pas. */
function rpcRefuse(motif: string) {
  reponseRpc = { data: { ok: false, motif }, error: null };
}

beforeEach(() => {
  base = baseVierge();
  appelsRpc = [];
  predicatsOtp = [];
  insertions = [];
  reponseRpc = { data: { ok: false, motif: "intrant" }, error: null };
});

beforeAll(() => {
  process.env.OTP_HMAC_SECRET = SECRET;
});

// ── A) Prédicats tenant RÉELLEMENT appliqués ────────────────────────────────

describe("A) predicats tenant reellement appliques", () => {
  it("A1 [PORTE] send-otp : l'ecriture OTP porte devis_id ET entreprise_id", async () => {
    const route = await chargerSendOtp();
    const r = await post(route, "send-otp", { devisId: DEVIS_A });

    expect(r.status).toBe(200);
    expect(insertions).toHaveLength(1);
    expect(insertions[0].table).toBe("devis_otp");
    const ecrit = insertions[0].ligne as Record<string, unknown>;
    // Les DEUX colonnes, pas seulement `devis_id`. C'est ce qui garantit que le
    // tenant de la ligne OTP ne peut pas diverger de celui du devis — le trigger
    // `tg_devis_otp_coherence` le réécrit depuis `devis`, mais la route n'a pas à
    // compter sur ce trigger pour être correcte.
    expect(ecrit.devis_id).toBe(DEVIS_A);
    expect(ecrit.entreprise_id).toBe(ENT_A);
    // ET le code en clair n'a aucun champ possible dans cette écriture.
    expect(ecrit).not.toHaveProperty("code");
    expect(ecrit).not.toHaveProperty("otp_code");
  });

  it("A1 bis send-otp : le tenant ecrit S'ILV de la chaine de confiance, jamais du body", async () => {
    const route = await chargerSendOtp();
    // Le navigateur tente d'imposer son tenant ET son client : les deux doivent
    // etre IGNORES, pas seulement surchauffés. C'est la garantie structurelle.
    const r = await post(route, "send-otp", {
      devisId: DEVIS_A,
      entreprise_id: ENT_B,
      client_id: CLIENT_NON_VERIFIE,
      phone: "+33000000000",
    });

    expect(r.status).toBe(200);
    expect(insertions[0].ligne).toMatchObject({ entreprise_id: ENT_A });
  });

  it("A2 [PORTE] verify-otp : la LECTURE de l'OTP porte entreprise_id, et la RPC recoit le tenant DERIVE", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    rpcReussit();

    await post(route, "verify-otp", corps());

    // Couche 1 : la lecture applicative est cloisonnée par les DEUX prédicats.
    expect(predicatsOtp).toEqual(
      expect.arrayContaining([
        ["devis_id", DEVIS_A],
        ["entreprise_id", ENT_A],
      ])
    );
    // Couche 2 : la RPC reçoit le code d'accès, jamais un `entreprise_id` — elle
    // le dérive. La liste des paramètres ci-dessous est donc fermée : y ajouter
    // `p_entreprise_id` ferait échouer ce test.
    expect(Object.keys(appelsRpc[0].args).sort()).toEqual([
      "p_code_acces",
      "p_code_hmac_attendu",
      "p_devis_id",
      "p_ip",
      "p_mention_acord",
      "p_otp_id",
      "p_signature_image",
      "p_user_agent",
    ]);
  });
});

// ── B) verify-otp — cloisonnement de la chaîne de confiance ──────────────────

describe("B) verify-otp - code d'acces et chaines de confiance", () => {
  it("B1 [PORTE] code d'acces INVALIDE : 403 et ZERO appel metier", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    const r = await post(route, "verify-otp", corps(), CODE_INCONNU);

    expect(r.status).toBe(403);
    expect(appelsRpc).toHaveLength(0);
    expect(predicatsOtp).toHaveLength(0);
  });

  it("B1 bis code d'acces VIDE : 403, jamais de requete", async () => {
    const route = await chargerVerifyOtp();
    const r = await post(route, "verify-otp", corps(), "   ");

    expect(r.status).toBe(403);
    expect(appelsRpc).toHaveLength(0);
  });

  it("B2 [PORTE] devis d'un AUTRE TENANT : 404 et ZERO ecriture", async () => {
    const route = await chargerVerifyOtp();
    // Le client du tenant B a son propre code d'accès. On présente le code d'A
    // avec le devis de B : c'est l'inversion de toute la surface d'attaque.
    ajoutOtp({ devis_id: DEVIS_B, entreprise_id: ENT_B, code_hmac: null });
    const r = await post(route, "verify-otp", corps({ devisId: DEVIS_B }), CODE_A);

    expect(r.status).toBe(404);
    expect(appelsRpc).toHaveLength(0);
    expect(insertions).toHaveLength(0);
    expect(base.devis.find((d) => d.id === DEVIS_B)?.statut).toBe("envoye");
  });

  it("B3 [PORTE] devis d'un AUTRE CHANTIER du meme tenant : 404, ZERO ecriture", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    // Devis de l'entreprise B, présenté avec le code d'accès de l'entreprise A.
    // Le double prédicat le refuse, alors que le tenant seul l'aurait accepté.
    const r = await post(route, "verify-otp", corps({ devisId: DEVIS_B }), CODE_A);

    expect(r.status).toBe(404);
    expect(appelsRpc).toHaveLength(0);
  });

  it("B4 [PORTE] la reponse ne laisse fuir NI l'OTP NI son condensat NI l'empreinte", async () => {
    const route = await chargerVerifyOtp();
    const secretConnu = "c".repeat(64);
    ajoutOtp({ code_hmac: secretConnu });

    for (const motif of ["otp_code", "otp_expire", "otp_consomme", "intrant"]) {
      rpcRefuse(motif);
      const r = await post(route, "verify-otp", corps({ code: CODE_FAUX }));
      const texte = await r.text();
      expect(texte, motif).not.toContain(CODE_VALIDE);
      expect(texte, motif).not.toContain(CODE_FAUX);
      expect(texte, motif).not.toContain(secretConnu);
    }
  });

  it("C1 [PORTE] 'autre tenant' et 'UUID inexistant' sont INDISCERNABLES", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    const tiers = await post(route, "verify-otp", corps({ devisId: DEVIS_B }));
    const inexistant = await post(route, "verify-otp", corps({ devisId: UUID_INCONNU }));

    expect(tiers.status).toBe(inexistant.status);
    expect(await tiers.text()).toBe(await inexistant.text());
  });

  it("C2 [PORTE] 'devis d'un autre chantier' et 'devis sans client' sont INDISCERNABLES", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    const tiers = await post(route, "verify-otp", corps({ devisId: DEVIS_B }));
    const autre = await post(route, "verify-otp", corps({ devisId: DEVIS_SANS_CLIENT }));

    expect(tiers.status).toBe(autre.status);
    expect(await tiers.text()).toBe(await autre.text());
  });

  it("C3 [PORTE] ZERO appel a la RPC sur toute la famille des refus d'appartenance", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    for (const devisId of [DEVIS_B, UUID_INCONNU, DEVIS_SANS_CLIENT]) {
      await post(route, "verify-otp", corps({ devisId }));
    }
    // La RPC n'est atteinte qu'`apres` la chaine de confiance : la lui faire
    // serait lui donner un oracle d'existence a elle-meme.
    expect(appelsRpc).toHaveLength(0);
  });
});

// ── D) Selecting de l'OTP courant, expiration, rejeu ─────────────────────────

describe("D) OTP courant, expiration, rejeu", () => {
  it("D1 un OTP ANCIER est invalide des qu'un OTP plus recent existe (la RPC tranche)", async () => {
    const route = await chargerVerifyOtp();
    const ancien = ajoutOtp({ created_at: new Date(Date.now() - 300_000).toISOString(), code_hmac: null });
    const nouveau = ajoutOtp({ id: "aaaaaaaa-4444-4444-8444-444444444442", code_hmac: null });

    rpcRefuse("otp_perime");
    const r = await post(route, "verify-otp", corps());

    expect(r.status).toBe(400);
    expect(await r.text()).toContain("Code non valide");
    // Le refus est INDISTINCT d'un mauvais code : « périmé » ne doit pas
    // apprendre au client qu'un nouveau code existe.
    expect(appelsRpc[0].args.p_otp_id).toBe(nouveau.id);
    expect(ancien.id).not.toBe(appelsRpc[0].args.p_otp_id);
  });

  it("D2 la route selectionne le PLUS RECENT, pas le premier trouve", async () => {
    const route = await chargerVerifyOtp();
    // Insérés dans l'ordre inverse de leur ancienneté : un `limit(1)` SANS tri
    // prendrait le premier, c'est-à-dire le plus ancien. Le test détecte donc
    // une régression du `.order({ascending:false})`.
    ajoutOtp({ id: "aaaaaaaa-4444-4444-8444-444444444443", created_at: new Date(Date.now() - 600_000).toISOString(), code_hmac: null });
    ajoutOtp({ id: "aaaaaaaa-4444-4444-8444-444444444442", created_at: new Date(Date.now() - 10_000).toISOString(), code_hmac: null });
    const recent = ajoutOtp({ id: "aaaaaaaa-4444-4444-8444-444444444444", created_at: new Date().toISOString(), code_hmac: null });

    rpcReussit();
    await post(route, "verify-otp", corps());

    expect(appelsRpc[0].args.p_otp_id).toBe(recent.id);
  });

  it("D3 OTP EXPIRE : refus, et la RPC n'est PAS atteinte (rien a committer)", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ expires_at: new Date(Date.now() - 1_000).toISOString(), code_hmac: null });

    const r = await post(route, "verify-otp", corps());

    expect(r.status).toBe(400);
    expect(await r.text()).toContain("Code non valide");
    // Court-circuit volontaire : un code expiré n'incrémente rien, donc
    // l'aller-retour en base serait inutile. C'est le SEUL motif de court-circuit
    // autorisé, et le test D8 vérifie le cas opposé.
    expect(appelsRpc).toHaveLength(0);
  });

  it("D4 OTP CONSOMME : refus, meme avec le BON code", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ consumed_at: new Date().toISOString(), code_hmac: null });

    const r = await post(route, "verify-otp", corps());

    expect(r.status).toBe(400);
    expect(appelsRpc).toHaveLength(0);
  });

  it("D5 OTP VERROUILLE ou EPURISE : refus", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ verrouille_jusqua: new Date(Date.now() + 600_000).toISOString(), code_hmac: null });
    const verrouille = await post(route, "verify-otp", corps());

    base = baseVierge();
    ajoutOtp({ tentatives: 5, code_hmac: null });
    const epuise = await post(route, "verify-otp", corps());

    expect(verrouille.status).toBe(400);
    expect(epuise.status).toBe(400);
    expect(appelsRpc).toHaveLength(0);
  });

  it("D6 aucun Retry-After : la reponse ne doit rien dire de la duree de vie du code", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ verrouille_jusqua: new Date(Date.now() + 600_000).toISOString(), code_hmac: null });

    const r = await post(route, "verify-otp", corps());

    // Un en-tête temporel permettrait de mesurer la fenêtre de validité et de rejouer
    // la fenêtre plus tard. Sa présence serait une fuite : on vérifie son ABSENCE.
    expect(r.headers.get("retry-after")).toBeNull();
  });

  it("D7 AUCUN OTP pour ce devis : refus UNIFORME, et la RPC n'est pas atteinte", async () => {
    const route = await chargerVerifyOtp();
    const r = await post(route, "verify-otp", corps());
    const texte = await r.text();

    expect(r.status).toBe(400);
    expect(texte).toContain("Code non valide");
    // `introuvable` n'incrémente rien : court-circuit. La conséquence de
    // sécurité est ce qui compte — « aucun code émis » et « mauvais code »
    // doivent être IMPOSSIBLES à distinguer, donc produire la même réponse ET le
    // même nombre d'appels en base.
    expect(appelsRpc).toHaveLength(0);

    base = baseVierge();
    ajoutOtp({ code_hmac: "e".repeat(64) });
    rpcRefuse("otp_code");
    const mauvais = await post(route, "verify-otp", corps({ code: CODE_FAUX }));
    expect(await mauvais.text()).toBe(texte);
  });

  it("D8 MAUVAIS code : la RPC EST atteinte, sinon l'increment ne serait jamais committe", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: "d".repeat(64) });
    rpcRefuse("otp_code");

    const r = await post(route, "verify-otp", corps({ code: CODE_FAUX }));

    expect(r.status).toBe(400);
    // POINT CRITIQUE : sur un mauvais code, la route DOIT atteindre la RPC.
    // C'est la RPC qui incrémente `tentatives` et qui COMMITTE cet incrément ;
    // revenir ici autoriserait un nombre illimité d'essais.
    expect(appelsRpc).toHaveLength(1);
    expect(appelsRpc[0].args.p_code_hmac_attendu).not.toBe("d".repeat(64));
  });

  it("D9 REJEU : le 2e appel apres succes est refuse par la RPC", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    rpcReussit();
    const premier = await post(route, "verify-otp", corps());
    expect(premier.status).toBe(200);

    // La RPC rejoue la même transaction : l'OTP est consommé, le statut est
    // `signe`. Elle refuse. La route rend le refus uniforme.
    rpcRefuse("otp_consomme");
    const second = await post(route, "verify-otp", corps());
    expect(second.status).toBe(400);

    rpcRefuse("devis_clot");
    const troisieme = await post(route, "verify-otp", corps());
    expect(troisieme.status).toBe(400);
    expect(await second.text()).toBe(await troisieme.text());
  });

  it("D10 DOUBLE SOUMISSION CONCURRENTE : la RPC est l'arbitre, la route n'ecrit rien", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    rpcReussit();

    const [a, b] = await Promise.all([
      post(route, "verify-otp", corps()),
      post(route, "verify-otp", corps()),
    ]);

    // La route n'écrit JAMAIS : les deux appels ne peuvent pas produire deux
    // preuves, quelle que soit la réponse de la RPC. L'unicité est une
    // propriété de la transaction, pas du code applicatif.
    expect(insertions).toHaveLength(0);
    expect(base.devis.find((d) => d.id === DEVIS_A)?.statut).toBe("envoye");
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });
});

// ── E) Nominal, consentement, preuve ─────────────────────────────────────────

describe("E) nominal et preuve", () => {
  it("H1 [PORTE] verify-otp nominal : succes et RIEN n'est ecrit par la route", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    rpcReussit();

    const r = await post(route, "verify-otp", corps());
    const json = await r.json();

    expect(r.status).toBe(200);
    expect(json.success).toBe(true);
    // La route n'écrit RIEN : la transaction est dans la base. Un test qui
    // autoriserait la route à écrire masquerait une régression d'atomicité.
    expect(insertions).toHaveLength(0);
    expect(base.devis.find((d) => d.id === DEVIS_A)?.statut).toBe("envoye");
  });

  it("H2 [PORTE] un MAUVAIS code echoue TOUJOURS (non-regression du nominal)", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: "f".repeat(64) });
    rpcRefuse("otp_code");

    const r = await post(route, "verify-otp", corps({ code: CODE_FAUX }));

    expect(r.status).toBe(400);
    expect(await r.text()).toContain("Code non valide");
  });

  it("H3 [PORTE] la reponse de succes porte l'empreinte et l'instant, rien de plus", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    rpcReussit();

    const json = await (await post(route, "verify-otp", corps())).json();

    expect(Object.keys(json).sort()).toEqual([
      "devisEmpreinteSha256",
      "signatureId",
      "signedAt",
      "success",
    ]);
    expect(json.devisEmpreinteSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("E1 l'EMPREINTE vient de la base, jamais du navigateur", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    rpcReussit();

    // Le navigateur tente d'imposer sa propre empreinte ET son propre signataire.
    const json = await (await post(route, "verify-otp", corps({
      devisEmpreinteSha256: "0".repeat(64),
      empreinte: "0".repeat(64),
      signataire: "Quelqu'un d'autre",
      signe_par: "artisan",
      telephone_source: "saisi_par_le_navigateur",
    }))).json();

    expect(json.devisEmpreinteSha256).toBe("a".repeat(64));
    // Et surtout : rien de tout cela n'atteint la base.
    expect(JSON.stringify(appelsRpc[0].args)).not.toContain("0".repeat(64));
    expect(Object.keys(appelsRpc[0].args)).not.toContain("p_devis_empreinte_sha256");
    expect(Object.keys(appelsRpc[0].args)).not.toContain("p_signataire");
  });

  it("E2 le nom du signataire et le telephone NE SONT PAS transmis", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    rpcReussit();
    await post(route, "verify-otp", corps({ phone: "+33000000000", telephone: "+33000000000" }));

    const args = appelsRpc[0].args;
    // La RPC les DÉRIVE de `chantiers -> clients`. Les recevoir serait
    // exactement ce que la phase 3 interdit.
    expect(args.p_signataire_nom).toBeUndefined();
    expect(args.p_telephone).toBeUndefined();
    expect(args.p_entreprise_id).toBeUndefined();
    expect(args.p_client_id).toBeUndefined();
    expect(args.p_chantier_id).toBeUndefined();
    expect(args.p_statut).toBeUndefined();
    expect(args.p_signe_par).toBeUndefined();
    expect(args.p_telephone_source).toBeUndefined();
  });

  it("E3 la case 'bon pour accord' est EXIGEE, et son TEXTE n'est pas transmis", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    rpcReussit();

    const avecCase = await post(route, "verify-otp", corps());
    expect(avecCase.status).toBe(200);
    expect(appelsRpc[0].args.p_mention_acord).toBe(true);

    // Le texte de la mention est écrit PAR LA RPC : le navigateur ne peut pas
    // le remplacer par une phrase vide, ni par une formule réductrice.
    expect(Object.keys(appelsRpc[0].args)).not.toContain("p_mention_texte");
  });

  it("E4 mention non cochee : refus AVANT toute ecriture, OTP intact", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });

    const r = await post(route, "verify-otp", corps({ mentionBonPourAccord: false }));

    expect(r.status).toBe(400);
    expect(await r.text()).toBe(JSON.stringify({ error: "Signature invalide" }));
    // Refus de FORME : la RPC n'est pas atteinte, donc aucun risque de consommer
    // un code valide sur une soumission de toute façon rejetée.
    expect(appelsRpc).toHaveLength(0);
  });

  it("E5 image absente, mal prefixee ou trop grosse : refus de forme", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });

    for (const image of [undefined, "", "pas-une-image", "data:text/html;base64,AAA", "A".repeat(300000)]) {
      const r = await post(route, "verify-otp", corps({ signatureImage: image }));
      expect(r.status, String(image).slice(0, 24)).toBe(400);
      expect(await r.text()).toBe(JSON.stringify({ error: "Signature invalide" }));
    }
    expect(appelsRpc).toHaveLength(0);
  });

  it("E6 code mal forme : refus, et AUCUN HMAC n'est calcule", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    rpcReussit();

    for (const code of [undefined, 123456, "12345", "abcdef", "1234567", ""]) {
      const r = await post(route, "verify-otp", corps({ code }));
      expect(r.status, String(code)).toBe(400);
    }
    // Jamais atteint : sur un code mal formé, aucun condensat ne part vers la
    // base — il n'y a donc rien à comparer, et rien à exposer.
    expect(appelsRpc).toHaveLength(0);
  });

  it("E7 devis DEJA SIGNE : refuse AVANT la lecture de l'OTP", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    rpcReussit();

    const r = await post(route, "verify-otp", corps({ devisId: DEVIS_A_SIGNE }));

    expect(r.status).toBe(409);
    expect(await r.text()).toBe(JSON.stringify({ error: "Ce devis est déjà signé" }));
    // Le garde-fou est dans `_garde-signature` ET dans la RPC. Ce test prouve
    // le premier ; la preuve SQL prouve le second. Aucun des deux ne suffit seul.
    expect(appelsRpc).toHaveLength(0);
  });

  it("E8 CLIENT ABSENT du chantier : 409", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ devis_id: DEVIS_SANS_CLIENT, code_hmac: null });
    rpcReussit();

    // On présente le code d'accès DU CHANTIER de ce devis : le 409 doit venir
    // de l'absence de client, pas d'un simple échec de cloisonnement.
    const r = await post(route, "verify-otp", corps({ devisId: DEVIS_SANS_CLIENT }), CODE_SANS_CLIENT);

    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("Aucun client associé à ce chantier");
    expect(appelsRpc).toHaveLength(0);
  });

  it("E9 TELEPHONE NON VERIFIE : 409, avec le message dedie", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ devis_id: DEVIS_TEL_NON_VERIFIE, code_hmac: null });
    rpcReussit();

    const r = await post(route, "verify-otp", corps({ devisId: DEVIS_TEL_NON_VERIFIE }), CODE_TEL);

    expect(r.status).toBe(409);
    expect((await r.json()).error).toContain("n'est pas vérifié");
    expect(appelsRpc).toHaveLength(0);
  });
});

// ── F) Rollback : aucune demi-écriture ne peut sortir ────────────────────────

describe("F) rollback et echec technique", () => {
  it("F1 une ERREUR de la RPC donne 500 et ne laisse rien derriere elle", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    reponseRpc = { data: null, error: { message: "violation de contrainte sur devis_signatures" } };

    const r = await post(route, "verify-otp", corps());
    const json = await r.json();

    expect(r.status).toBe(500);
    // Le détail PostgREST est journalisé mais JAMAIS renvoyé : il peut contenir
    // un nom de colonne, une contrainte, voire la forme de la requête.
    expect(JSON.stringify(json)).not.toContain("contrainte");
    expect(json.error).toBe("Erreur interne");
    expect(insertions).toHaveLength(0);
  });

  it("F2 une REPONSE malformee de la RPC ne cree pas de preuve fantome", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });
    // Réponse sans `ok`, et sans motif : ni succès ni refus identifiable.
    reponseRpc = { data: { signature_id: "forge" }, error: null };

    const r = await post(route, "verify-otp", corps());

    // Fail-closed : le `default` de `reponsePourMotif` attrape tout motif
    // inconnu, y compris l'absence totale de motif.
    expect(r.status).toBe(400);
    expect(await r.text()).toContain("Code non valide");
  });

  it("F3 chaque MOTIF de la RPC a une reponse definie, et le reste est indistinct", async () => {
    const route = await chargerVerifyOtp();
    ajoutOtp({ code_hmac: null });

    // Liste fermée des motifs émis par la RPC. C'est le contrat ; tout motif
    // hors liste doit tomber dans le refus uniforme, jamais dans une fuite.
    const CONTRAT: Record<string, number> = {
      intrant: 404,
      client_absent: 409,
      tel_non_verifie: 409,
      image_invalide: 400,
      mention_absente: 400,
      devis_clot: 400,
      otp_perime: 400,
      otp_absent: 400,
      otp_expire: 400,
      otp_consomme: 400,
      otp_verrouille: 400,
      otp_tentatives: 400,
      otp_code: 400,
      otp_indisponible: 400,
    };

    for (const [motif, statut] of Object.entries(CONTRAT)) {
      rpcRefuse(motif);
      const r = await post(route, "verify-otp", corps());
      expect(r.status, motif).toBe(statut);
    }

    // Hors contrat : le refus uniforme, jamais un 200 ni un 500.
    for (const motif of ["inconnu", "", null, undefined, "__proto__"]) {
      reponseRpc = { data: motif === undefined ? null : { ok: false, motif }, error: null };
      const r = await post(route, "verify-otp", corps());
      expect(r.status, String(motif)).toBe(400);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// I) GARDES STRUCTURELS AUTO-VÉRIFIÉS
// ═════════════════════════════════════════════════════════════════════════════
// Ces tests ne remplacent pas A-H : ils ferment la porte à une réintroduction qui
// laisserait le comportement nominal intact.
//
// I1, I2, I5, I7 et I9 sont les tests du fichier d'origine, PORTÉS. Le plus
// important d'entre eux est I2 : dans l'ancienne architecture, le cloisonnement
// de `verify-otp` était un `.eq("entreprise_id")` en TypeScript, donc testable
// par analyse de source. Il n'existe plus : le cloisonnement est désormais dans
// le CORPS SQL de la RPC. Un I2 qui continuerait à chercher un
// `.eq("entreprise_id")` passerait au vert sur une RPC entièrement
// uncloisonnée — c'est-à-dire exactement l'auto-vérification inversée.
//
// I2 teste donc la VRAIE implémentation SQL, et I18 refute des mutants SQL réels
// plutôt que des mutants TypeScript. Ce n'est pas un détail de forme : c'est ce
// qui donne au test sa valeur.
// ────────────────────────────────────────────────────────────────────────────

const CHEMINS = {
  garde: join(process.cwd(), "app/api/espace-client/[code_acces]/_garde-signature.ts"),
  sendOtp: join(process.cwd(), "app/api/espace-client/[code_acces]/send-otp/route.ts"),
  verifyOtp: join(process.cwd(), "app/api/espace-client/[code_acces]/verify-otp/route.ts"),
  migration: join(process.cwd(), "supabase/migrations/20261003_devis_signature_provenance.sql"),
} as const;

type NomFichier = keyof typeof CHEMINS;

const SOURCES = Object.fromEntries(
  (Object.keys(CHEMINS) as NomFichier[]).map((n) => [n, readFileSync(CHEMINS[n], "utf8")])
) as Record<NomFichier, string>;

const CODE: Record<NomFichier, string> = {
  garde: sansCommentaires(SOURCES.garde),
  sendOtp: sansCommentaires(SOURCES.sendOtp),
  verifyOtp: sansCommentaires(SOURCES.verifyOtp),
  migration: SOURCES.migration,
};

/** Corps de la fonction RPC, entre `as $bna$` et le `$bna$` final. */
function corpsRpc(src: string): string {
  // `$bna$` délimite le corps de PLUSIEURS fonctions de cette migration (les
  // triggers comes en premier). Chercher le premier `as $bna$` ne prendrait donc
  // pas la RPC mais un trigger, et tous les tests SQL porteraient sur le mauvais
  // texte tout en passant au vert. On s'ancre sur le NOM de la fonction.
  const debut = src.indexOf("create or replace function public.signature_devis_valider_otp");
  if (debut < 0) return "";
  const i = src.indexOf("as $bna$", debut);
  if (i < 0) return "";
  const j = src.indexOf("$bna$;", i);
  return j < 0 ? "" : src.slice(i, j);
}

const RPC = corpsRpc(SOURCES.migration);

const PREDICAT_TENANT = /\.eq\(\s*["']entreprise_id["']\s*,/;
const PREDICAT_TENANT_G = /\.eq\(\s*["']entreprise_id["']\s*,/g;

function compterPredicats(src: string): number {
  return (src.match(PREDICAT_TENANT_G) ?? []).length;
}

/** Retire un prédicat `.eq("entreprise_id", …)` de la VRAIE source. */
function retirerPredicat(src: string): string {
  return src.replace(/[ \t]*\.eq\(\s*["']entreprise_id["']\s*,[^\n]*\n/g, "\n");
}

describe("I) gardes structurels auto-verifies", () => {
  it("I1 le garde PARTAGE porte les predicats, et les DEUX routes l'importent", () => {
    // La partition ne vit plus dans chaque route mais dans UN fichier commun.
    // Un test qui exigerait un `.eq("entreprise_id")` dans `send-otp` passerait
    // alors que la route ne filtre plus rien — d'où l'invariant réel vérifié ici :
    // les prédicats sont dans le garde, et les deux routes l'utilisent.
    expect(compterPredicats(CODE.garde)).toBeGreaterThanOrEqual(2);
    for (const nom of ["sendOtp", "verifyOtp"] as NomFichier[]) {
      expect(CODE[nom], nom).toMatch(/from ["']\.\.\/_garde-signature["']/);
      expect(CODE[nom], nom).toMatch(/autoriserSignature\(/);
    }
    // Et le garde teste bien les DEUX prédicats : chantier ET tenant.
    expect(CODE.garde).toMatch(/\.eq\(["']chantier_id["']/);
    expect(CODE.garde).toMatch(/\.eq\(["']entreprise_id["']/);
  });

  it("I2 [PORTE] la RPC cloisonne BIEN code_acces -> chantier -> devis, avec entreprise_id", () => {
    expect(RPC).toContain("from public.chantiers c");
    // Le devis est retenu par le chantier du code d'accès…
    expect(RPC).toMatch(/and\s+d\.chantier_id\s*=\s*v_chantier_id/);
    // …ET par le tenant de ce chantier. Les DEUX prédicats, dans le MÊME SELECT :
    // c'est ce qui rend l'opération atomique.
    expect(RPC).toMatch(/and\s+d\.entreprise_id\s*=\s*v_entreprise_id/);

    // Et la consommation de l'OTP est rejouée avec les deux, comme barrière
    // atomique : sans elle, une écriture concurrente entre la lecture et ici
    // pourrait consommer un OTP d'un autre devis.
    expect(RPC).toMatch(/and\s+o\.devis_id\s*=\s*p_devis_id/);
    expect(RPC).toMatch(/and\s+o\.entreprise_id\s*=\s*v_entreprise_id/);
  });

  it("I2 bis le tenant de la PREUVE est celui du chantier, jamais celui recu", () => {
    // `entreprise_id` est écrit depuis `v_entreprise_id`, dérivé du chantier.
    expect(RPC).toMatch(/values\s*\(\s*v_devis\.id,\s*v_entreprise_id,/);
    // Et aucun paramètre de fonction ne s'appelle `p_entreprise_id` : le
    // navigateur n'a aucun moyen de proposer un tenant.
    const params = SOURCES.migration.slice(
      SOURCES.migration.indexOf("signature_devis_valider_otp("),
      SOURCES.migration.indexOf("returns jsonb")
    );
    expect(params).not.toContain("p_entreprise_id");
    expect(params).not.toContain("p_client_id");
    expect(params).not.toContain("p_chantier_id");
    expect(params).not.toContain("p_signataire");
    expect(params).not.toContain("p_statut");
    expect(params).not.toContain("p_telephone");
    expect(params).not.toContain("p_empreinte");
    expect(params).not.toContain("p_signe_par");
  });

  it("I5 [PORTE I5+I9] verify-otp lit l'OTP avec un .select() EXPLICITE : c'est son seul acces", () => {
    expect(CODE.verifyOtp).toMatch(/\.from\(\s*["']devis_otp["']\s*\)\s*\.select\(/);
    // Aucune écriture directe : la route ne fait ni insert, ni update, ni delete.
    // C'est ce qui garantit qu'aucune demi-signature ne peut en sortir.
    expect(CODE.verifyOtp).not.toMatch(/\.from\(\s*["']devis_otp["']\s*\)\s*\.(insert|update|upsert|delete)\b/);
    expect(CODE.verifyOtp).not.toMatch(/\.from\(\s*["']devis_signatures["']\s*\)\s*\.(insert|update|upsert|delete)\b/);
  });

  it("I7 [PORTE] AUTO-VERIFICATION : I2 detecte une RPC reellement non cloisonnee", () => {
    // Contre-exemple SQL construit À PARTIR DE LA VRAIE FONCTION : on retire le
    // prédicat de tenant de la sélection du devis, on retire celui de la
    // consommation, et on vérifie que les quatre assertions d'I2 tombent.
    const mutant = RPC.replace(
      /and\s+d\.entreprise_id\s*=\s*v_entreprise_id/,
      "and d.id is not null"
    ).replace(/and\s+o\.entreprise_id\s*=\s*v_entreprise_id/, "and o.id is not null");

    expect(RPC).toMatch(/and\s+d\.entreprise_id\s*=\s*v_entreprise_id/);
    expect(mutant).not.toMatch(/and\s+d\.entreprise_id\s*=\s*v_entreprise_id/);
    expect(mutant).not.toMatch(/and\s+o\.entreprise_id\s*=\s*v_entreprise_id/);
  });

  it("I8 la RPC selectionne le DERNIER OTP et le VERROILLE (anti-rejeu, anti-course)", () => {
    expect(RPC).toMatch(/order by\s+o\.created_at desc\s*\n\s*limit 1\s*\n\s*for update/);
    // `for update` sérialise deux soumissions concurrentes AVANT le compteur,
    // sinon deux transactions pourraient lire le même `tentatives`.
    expect(RPC).toMatch(/for update/);
    // Et un `p_otp_id` qui n'est pas la ligne la plus récente est refusé SANS
    // incrémenter : sinon quiconque détient le code d'accès pourrait brûler
    // les tentatives du client légitime avec des codes périmés (DoS).
    expect(RPC).toMatch(/is distinct from p_otp_id/);
  });

  it("I9 la RPC est SECURITY DEFINER, sur un search_path qui resout pgcrypto", () => {
    expect(SOURCES.migration).toMatch(/security definer/);
    // `digest()` vient de pgcrypto, installé dans le schéma `extensions` (vérifié
    // en base). Avec `search_path = public` seul, la fonction serait ACCEPTÉE à la
    // création — PL/pgSQL ne résout pas les appels — puis ÉCHOUERAIT à la
    // première invocation, en production.
    expect(SOURCES.migration).toMatch(/set search_path = public, extensions/);
  });

  it("I10 les droits d'EXECUTION de la RPC sont retires puis restreints a service_role", () => {
    const bloc = SOURCES.migration.slice(
      SOURCES.migration.indexOf("-- 8.3"),
      SOURCES.migration.indexOf("-- 9) ANNULATION")
    );
    // `create function` accorde EXECUTE à `public` — qui inclut `anon` et
    // `authenticated` — par défaut. Sans REVOKE, n'importe quel visiteur
    // pourrait appeler la fonction via /rest/v1/rpc/.
    expect(bloc).toMatch(/revoke all on function public\.signature_devis_valider_otp[\s\S]*from public;/);
    expect(bloc).toMatch(/revoke all on function public\.signature_devis_valider_otp[\s\S]*from anon;/);
    expect(bloc).toMatch(/revoke all on function public\.signature_devis_valider_otp[\s\S]*from authenticated;/);
    expect(bloc).toMatch(/grant execute on function public\.signature_devis_valider_otp[\s\S]*to service_role;/);
  });

  it("I11 la PREUVE est en ecriture.service_role SEULEMENT, lecture pour anon", () => {
    // Le §7.3 accorde provisoirement l'écriture à `anon`, le §7.4 la retire.
    // L'ETAT FINAL est ce qui compte : c'est le derniermot, et il doit être
    // SELECT-seulement pour le navigateur. Écrire le contrôle sur tout le
    // fichier le ferait échouer sur un GRANT intermédiaire déjà révoqué — donc
    // on vérifie que le révoque BIEN SUIT l'octroi.
    const i73 = SOURCES.migration.indexOf("-- 7.3");
    const i74 = SOURCES.migration.indexOf("-- 7.4");
    const i8 = SOURCES.migration.indexOf("-- 8.1");
    expect(i73).toBeGreaterThan(-1);
    expect(i74).toBeGreaterThan(i73);
    expect(i8).toBeGreaterThan(i74);
    const final = SOURCES.migration.slice(i74, i8);

    expect(final).toMatch(/revoke all on table public\.devis_signatures from anon, authenticated;/);
    expect(final).toMatch(/grant select on table public\.devis_signatures to anon, authenticated;/);
    // Un droit d'écriture direct depuis le navigateur serait un chemin de forge
    // qui court-circuite OTP, canvas et empreinte.
    expect(final).not.toMatch(/to anon, authenticated, service_role;/);
    // Et l'écriture reste possible par la RPC, dont le propriétaire porte les
    // droits de table — c'est pourquoi service_role garde le CRUD.
    expect(final).toMatch(
      /grant select, insert, update, delete on table public\.devis_signatures\s*\n\s*to service_role;/
    );
    // `devis_otp`, lui, reste hors d'atteinte du navigateur : aucun octroi.
    expect(final).not.toMatch(/devis_otp[^;]*to anon/);
  });

  it("I11 bis le fichier ne CONTRADIT PAS sa propre section 7.3 sur les droits de la preuve", () => {
    // LE TEST QUI MANQUAIT, et il manquait parce que l'état final était bon.
    //
    // I11 vérifie l'état FINAL (`revoke` puis `grant`, dans le §7.4). Il ne
    // vérifiait pas que le reste du fichier ne disait pas autre chose. Il disait
    // autre chose : le §7.3 accordait CRU sur `devis_signatures` à `anon` et
    // `authenticated`, puis le §7.4 le retirait. L'état final était correct ;
    // le texte était faux.
    //
    // Un fichier qui se contredit sur le point le plus sensible de la migration
    // est un fichier dont la garantie dépend de l'ordre de lecture. Ce test
    // interdit qu'une section accorde à `anon` ou `authenticated` un droit
    // d'écriture sur la table de preuve — quel que soit l'endroit.
    const sansGrantPreuve = /grant[^;]*\bon\s+(?:table\s+)?(?:public\.)?devis_signatures\s*\n?\s*to\s+(?:anon|authenticated)/gi;
    const occurrences: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = sansGrantPreuve.exec(SOURCES.migration)) !== null) occurrences.push(m[0]);
    // SELECT seul reste nécessaire (le lecteur navigateur de devis-factures).
    for (const occurrence of occurrences) {
      expect(occurrence, `droit d'ecriture sur la table de preuve accorde au navigateur :\n${occurrence}`)
        .toMatch(/grant\s+select\s+on/i);
    }

    // Et, symétriquement : `devis_otp` ne doit recevoir AUCUN octroi pour un
    // rôle navigateur, nulle part dans le fichier.
    expect(SOURCES.migration).not.toMatch(/grant[^;]*devis_otp\s*\n?\s*to\s+(?:anon|authenticated)/gi);
  });

  it("I11 ter AUTO-VERIFICATION : I11 bis detecte la section 7.3 fautive d'origine", () => {
    // La version exacte du fichier avant nettoyage, sertie telle quelle :
    //     grant select, insert, update, delete on table public.devis_signatures
    //       to anon, authenticated, service_role;
    const fautive =
      "grant select, insert, update, delete on table public.devis_signatures\n" +
      "  to anon, authenticated, service_role;\n";

    const invariant = (texte: string) => {
      const out: string[] = [];
      let m: RegExpExecArray | null;
      const re = /grant[^;]*\bon\s+(?:table\s+)?(?:public\.)?devis_signatures\s*\n?\s*to\s+(?:anon|authenticated)/gi;
      while ((m = re.exec(texte)) !== null) out.push(m[0]);
      return out.every((o) => /grant\s+select\s+on/i.test(o));
    };

    expect(invariant(fautive), "l'invariant ne voit pas la section 7.3 fautive").toBe(false);
    expect(invariant(SOURCES.migration), "l'invariant rejette le fichier corrige").toBe(true);
  });

  it("I12 l'empreinte est CALCULEE en SQL et le statut en est EXCLU", () => {
    expect(RPC).toMatch(/digest\(v_version::text,\s*'sha256'\)/);
    expect(RPC).toMatch(/v_empreinte\s*:=\s*encode\(digest\(/);
    // `statut` est change a 'signe' par la meme transaction : l'inclure
    // rendrait l'empreinte non reproductible APRES signature, et la detection
    // de modification — le seul but de la colonne — impossible.
    // L'exclusion se verifie dans l'OBJET lui-meme, delimite par son
    // `jsonb_build_object(` et le `);` qui le ferme. Chercher dans tout le corps
    // confondrait le code avec les colonnes citees dans les commentaires.
    const iObj = RPC.indexOf("v_version := jsonb_build_object(");
    const iFin = RPC.indexOf("v_empreinte := encode", iObj);
    expect(iObj).toBeGreaterThan(-1);
    expect(iFin).toBeGreaterThan(iObj);
    const objet = RPC.slice(iObj, iFin);

    expect(objet).not.toMatch(/'statut'/);
    for (const exclue of [
      "signature_image",
      "telephone_source",
      "devis_empreinte_sha256",
      "otp_code",
      "otp_expires_at",
      "signature_date",
      "signature_ip",
      "signature_phone",
      "created_at",
    ]) {
      expect(objet, exclue).not.toMatch(new RegExp(`'${exclue}'`));
    }
    // Et les colonnes de contenu, elles, sont bien presentes.
    for (const incluse of ["numero", "lignes", "total_ht", "objet", "client_id", "entreprise_id"]) {
      expect(objet, incluse).toMatch(new RegExp(`'${incluse}',`));
    }
  });

  it("I13 le chemin des REFUS OTP RETOURNE et ne leve jamais", () => {
    // Un `raise exception` apres l'increment de `tentatives` annulerait cet
    // increment par rollback : le verrou anti-force brute ne survivrait a aucun
    // refus. Le refus metier doit donc RETOURNER ; l'echec technique seul LEVE.
    //
    // On isole le bloc entre la detection de la non-correspondance et le retour
    // du motif : c'est le SEUL endroit ou la transaction ecrit sans consommer.
    // La recherche du motif part de la detection, pas du debut du corps : le
    // commentaire d'introduction de la fonction ENUMERE les motifs, donc une
    // recherche globale tomberait sur la documentation et le bloc serait vide.
    const iDetection = RPC.indexOf("o.code_hmac = p_code_hmac_attendu");
    // On cherche le RETURN ENTIER : couper au debut du motif exclurait de la
    // tranche le texte qu'on veut justement verifier.
    const RETOUR = "return jsonb_build_object('ok', false, 'motif', 'otp_code')";
    const iRetour = RPC.indexOf(RETOUR, iDetection);
    expect(iDetection).toBeGreaterThan(-1);
    expect(iRetour).toBeGreaterThan(iDetection);
    // La tranche INCLUT le retour : c'est lui qu'on verifie.
    const blocRefus = RPC.slice(iDetection, iRetour + RETOUR.length);

    // L'increment, puis le verrou AU SEUIL DANS LE MEME UPDATE, puis le retour.
    // L'ordre importe : un verrou pose par un second UPDATE resterait lui aussi
    // au commit, mais deux ecritures ouvriraient une fenetre entre elles.
    expect(blocRefus).toMatch(
      /update public\.devis_otp o\s*\n\s*set tentatives\s*=\s*coalesce\(o\.tentatives, 0\) \+ 1,/
    );
    expect(blocRefus).toMatch(/verrouille_jusqua = case/);
    expect(blocRefus).toMatch(/when coalesce\(o\.tentatives, 0\) \+ 1 >= 5/);
    expect(blocRefus).toMatch(/then now\(\) \+ interval '10 minutes'/);
    expect(blocRefus).toMatch(/return jsonb_build_object\('ok', false, 'motif', 'otp_code'\)/);
    // Le bloc se TERMINE sur ce retour : rien d'autre ne les separe.
    expect(blocRefus.length).toBe(iRetour + RETOUR.length - iDetection);
    // Aucun LEVE sur ce chemin : c'est la condition de survie de l'increment.
    expect(blocRefus).not.toMatch(/raise/);
    // Et aucun UPDATE de `consumed_at` : un code faux ne doit JAMAIS etre
    // consomme, sinon un attaquant grillerait le code legitime du client.
    expect(blocRefus).not.toMatch(/consumed_at/);
  });

  it("I14 la consommation et l'ecriture de la preuve sont DANS la meme transaction", () => {
    // Trois écritures, un seul corps de fonction : c'est la transaction qui les
    // rend indivisibles, pas l'ordre du code.
    expect(RPC).toMatch(/update public\.devis_otp[\s\S]*consumed_at\s*=\s*now\(\)/);
    expect(RPC).toMatch(/insert into public\.devis_signatures/);
    expect(RPC).toMatch(/update public\.devis\s*\n\s*set statut = 'signe'/);
    // Et l'ecriture du statut est elle-meme gardee : une preuve sans statut
    // laisserait le devis re-signable, donc on annule TOUT plutot que de
    // valider une preuve orpheline.
    expect(RPC).toMatch(/mise a jour du statut sans effet[\s\S]*using errcode/);
  });

  it("I15 les index correspondent aux requetes REELLEMENT emises", () => {
    expect(SOURCES.migration).toMatch(
      /create index if not exists devis_otp_devis_recent_idx\s*\n\s*on public\.devis_otp \(devis_id, created_at desc\);/
    );
    expect(SOURCES.migration).toMatch(
      /create index if not exists devis_signatures_devis_idx\s*\n\s*on public\.devis_signatures \(devis_id, signed_at desc\);/
    );
    // La route trie sur `created_at desc` : c'est le premier terme après égalité,
    // donc le `limit 1` s'arrête après une entrée.
    expect(CODE.verifyOtp).toMatch(/order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/);
  });

  it("I17 AUTO-VERIFICATION du stripper : un glob dans un commentaire n'avale rien", () => {
    // Ce test porte sur l'OUTILLAGE de test lui-meme, ce qui est inhabituel et
    // deliberé : le stripper avait un defaut capable de desactiver des tests de
    // securite sans le moindre signal, et rien ne l'aurait revele.
    const piege = [
      "// un glob : `/api/devis/*`, dont `analyse`",
      "const garde = require('./_garde-signature');",
      "/* un vrai bloc */",
      "const requete = 'https://exemple.test/a//b';",
    ].join("\n");

    const sorti = sansCommentaires(piege);

    // Le code survit...
    expect(sorti).toContain("require('./_garde-signature')");
    // ...et le commentaire a disparu.
    expect(sorti).not.toContain("glob");
    expect(sorti).not.toContain("un vrai bloc");
    // Un `//` DANS une chaine n'ouvre pas un commentaire : c'est le second piege
    // du stripper par regex, et il se presente dans les URL.
    expect(sorti).toContain("'https://exemple.test/a//b'");
    // Le nombre de lignes est preserve : sans cela tous les numeros de ligne de
    // ce fichier seraient decales par rapport aux sources.
    expect(sorti.split("\n")).toHaveLength(4);
  });

  it("I18 AUTO-VERIFICATION : I2,I7,I9,I10 detectent une RPC reellement degradee", () => {
    // Un lot de mutants appliques au SQL REAL, et non a une approximation. Le
    // motif est toujours le meme : on retire ou on change une garantie de la
    // VRAIE fonction, puis on exige que les assertions tombent. Un test
    // structurel qui ne peut pas etre casse n'est pas un test.
    const mutants: Array<{ nom: string; source: string; mutant: string; attendu: RegExp[] }> = [
      {
        nom: "predicat de tenant retire sur le devis",
        source: RPC,
        mutant: RPC.replace(/and d\.entreprise_id = v_entreprise_id/, "and d.id is not null"),
        attendu: [/and\s+d\.entreprise_id\s*=\s*v_entreprise_id/],
      },
      {
        nom: "predicat de tenant retire sur la consommation",
        source: RPC,
        mutant: RPC.replace(/and o\.entreprise_id = v_entreprise_id/, "and o.id is not null"),
        attendu: [/and\s+o\.entreprise_id\s*=\s*v_entreprise_id/],
      },
      {
        nom: "verrou de ligne retire",
        source: RPC,
        // La forme AVEC le point-virgule : le commentaire de la section cite
        // lui aussi `for update` en prose, et une assertion trop large verrait
        // passer un mutant qui a pourtant supprime le verrou reel.
        mutant: RPC.replace("     for update;", ""),
        attendu: [/for update;/],
      },
      {
        nom: "selection du dernier OTP supprimee",
        source: RPC,
        mutant: RPC.replace(/order by o\.created_at desc\n   limit 1/, ""),
        attendu: [/order by\s+o\.created_at desc\s*\n\s*limit 1\s*\n\s*for update/],
      },
      {
        nom: "le refus devient un LEVE, ce qui annule l'increment",
        source: RPC,
        mutant: RPC.replace(
          "return jsonb_build_object('ok', false, 'motif', 'otp_code');",
          "raise exception 'code faux';"
        ),
        attendu: [/not\.toMatch\(\/raise\)/],
      },
      {
        nom: "search_path sans extensions : digest() echouerait en production",
        source: SOURCES.migration,
        mutant: SOURCES.migration.replace("set search_path = public, extensions", "set search_path = public"),
        attendu: [/set search_path = public, extensions/],
      },
      {
        nom: "EXECUTE accorde a anon",
        source: SOURCES.migration,
        mutant: SOURCES.migration.replace(
          /revoke all on function public\.signature_devis_valider_otp\([\s\S]*?\)\n  from anon;/,
          ""
        ),
        attendu: [/from anon;/],
      },
      {
        nom: "mention requee au lieu d'ecrite par la fonction",
        source: RPC,
        mutant: RPC.replace("'Bon pour accord',", "p_mention_texte,"),
        attendu: [/'Bon pour accord'/],
      },
    ];

    for (const { nom, source, mutant, attendu } of mutants) {
      // Le mutant doit reellement differer de sa source : sinon la substitution
      // n'a pas trouve son motif et le test ne verifierait strictement rien.
      expect(mutant.length, `mutant vide : ${nom}`).toBeGreaterThan(0);
      expect(mutant, `substitution sans effet : ${nom}`).not.toBe(source);
      for (const re of attendu) {
        expect(mutant, `mutant non detecte : ${nom}`).not.toMatch(re);
      }
    }
    // Et la source reelle satisfait toujours toutes ces assertions : c'est ce qui
    // garantit que les mutants ci-dessus sont des mutants, pas des requirements
    // que le code ne respecte pas.
    expect(RPC).toMatch(/and\s+d\.entreprise_id\s*=\s*v_entreprise_id/);
    expect(RPC).toMatch(/and\s+o\.entreprise_id\s*=\s*v_entreprise_id/);
    expect(RPC).toMatch(/for update/);
    expect(RPC).toMatch(/'Bon pour accord'/);
    expect(SOURCES.migration).toMatch(/set search_path = public, extensions/);
  });

  it("I19 AUTO-VERIFICATION [PORTE I9] : le detecteur de .select() peut encore echouer", () => {
    // Ancien I9, porte tel quel. Un motif d'analyse de source peut disparaitre
    // sans que rien ne le remarque : si `.select()` disparaissait de `verify-otp`,
    // PostgREST ne renverrait rien, la route ne pourrait pas constater 0 ligne,
    // et repondrait 200 sur un devis introuvable ou d'un autre tenant. Le test
    // I5 doit donc etre capable de voir cette disparition.
    const sansSelect = CODE.verifyOtp.replace(/\.select\(\s*["'][^"']+["']\s*\)/g, "");
    expect(sansSelect).not.toBe(CODE.verifyOtp);
    expect(sansSelect).not.toMatch(/\.select\(\s*["'][^"']+["']\s*\)/);
    // Et l'inverse : le motif doit rester present dans la source REELLE, sinon
    // l'auto-verification porterait sur un motif qui n'existe plus.
    expect(CODE.verifyOtp).toMatch(/\.select\(\s*["'][^"']+["']\s*\)/);
  });

  it("I16 aucun journal ne contient de code, de condensat, de numero ni d'image", () => {
    for (const nom of ["garde", "sendOtp", "verifyOtp"] as NomFichier[]) {
      const lignes = SOURCES[nom].split("\n");
      lignes.forEach((ligne, i) => {
        const estJournal = /console\.(log|error|warn|info|debug)\(/.test(ligne);
        if (!estJournal) return;
        // Aucun secret ni donnee personnelle dans un journal. Le HMAC, le code
        // en clair, le telephone et l'image de signature sont verifiables
        // caracter par caracter.
        expect(ligne, `${nom}:${i + 1}`).not.toMatch(/\bcode\b/i);
        expect(ligne, `${nom}:${i + 1}`).not.toMatch(/hmac|condensat_d|signature_image|tel_normalise/i);
      });
    }
  });
});
