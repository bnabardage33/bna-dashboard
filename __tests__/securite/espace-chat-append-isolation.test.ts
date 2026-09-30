// @vitest-environment node
//
// O3-B6 — Isolation de `espace_client_append` / `espace_client_consolider`.
//
// Ce fichier couvre les constats F1 à F4 de l'audit, en isolation du reste du
// circuit. Il est volontairement indépendant de `espace-chat-circuit.test.ts` :
// celui-ci rejoue la logique SQL pour valider le circuit de bout en bout, celui-ci
// vérifie qu'un tenant ne peut niécrire dans, ni lire, ni consolider la
// conversation d'un AUTRE, et que l'appelant applicatif ne peut pas fournir un
// tenant de son choix.
//
// Aucun accès réseau : `@/lib/supabaseAdmin` est remplacé par un store en
// mémoire, l'anonymisation PII est neutralisée (elle requiert le réseau) et Groq
// est un répondeur déterministe. Aucun DML réel n'est possible : le test n'a
// aucune connexion à la base.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'fs'

// ---------------------------------------------------------------------------
// Tenants de test
// ---------------------------------------------------------------------------

const BNA = '11111111-1111-4111-8111-111111111111'
const TEST = '22222222-2222-4222-8222-222222222222'
const TIERS = '33333333-3333-4333-8333-333333333333'

type Row = Record<string, unknown>
type SqlError = { code: string; message: string }
type RpcResult = { data: Row | null; error: SqlError | null }

const holder = vi.hoisted(() => ({ supabase: undefined as unknown }))

const delegue = new Proxy(
  {},
  {
    get(_cible: {}, cle: string | symbol): unknown {
      if (typeof cle === 'symbol') return undefined
      const source = holder.supabase as Record<string, unknown> | undefined
      return source ? source[cle] : undefined
    },
  }
)
vi.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: delegue }))

vi.mock('@/lib/anonymizeText', () => ({
  anonymizeText: async (text: string) => ({ anonymizedText: text, mapping: {} }),
  deanonymizeText: (text: string) => text,
}))

// ---------------------------------------------------------------------------
// Store en mémoire
// ---------------------------------------------------------------------------

interface Store {
  chantiers: Row[]
  conversations: Row[]
  journal: Array<{ fn: string; args: Row }>
  journalsEq: Array<{ table: string; colonne: string; valeur: unknown }>
  /** Chantier dont le `entreprise_id` est illisible à la 2ᵉ lecture seulement. */
  tenantIllisibleApres: { id: string; entreprise_id: unknown } | null
  lecturesChantier: number
  /** Erreur injectée sur l'écriture, pour tester le chemin d'échec. */
  erreurAppend: SqlError | null
  /** `true` : la fonction répond `{ ok: true }` sans `id` (résultat non confirmé). */
  appendSansId: boolean
  /**
   * Injection de panne : fait mentir le filtre `entreprise_id` de la lecture de
   * `chantiers` — la ligne est renvoyée MÊME si elle ne correspond pas, avec sa
   * vraie valeur. Modélise un transport ou une projection défaillante, seul cas
   * où la revalidation post-lecture peut Differer du filtre. C'est ce qui rend
   * cette garde non redondante.
   */
  lectureMensongere: boolean
}

let store: Store

function nouvelleConversation(
  cle: string,
  chantierId: string | null,
  entrepriseId: string,
  messages: Row[],
  resumes: Row[] = []
): Row {
  return {
    id: `conv-${cle}`,
    cle,
    chantier_id: chantierId,
    entreprise_id: entrepriseId,
    client_nom: 'Client',
    session_id_en_cours: 'session-initiale',
    session_demarree_le: '2026-09-01T00:00:00Z',
    messages_session: messages,
    resumes_sessions: resumes,
    resume_global: { texte: 'Résumé existant', sessions: 1 },
    updated_at: '2026-09-01T00:00:00Z',
  }
}

function refus(message: string): RpcResult {
  // `raise exception ... using errcode = 'check_violation'` → SQLSTATE 23514.
  // Le client Supabase ne lève pas : il résout `{ error }`.
  return { data: null, error: { code: '23514', message } }
}

/**
 * Réplique des garde-fous de `20260925_o3b6_isolation_espace_client_rpc.sql`.
 *
 *   append    : chantier obligatoire → entreprise déduite → cohérence de la ligne
 *               déjà présente sous `cle` (chantier_id ET entreprise_id).
 *   consolider: la ligne ciblée est confrontée à l'entreprise de son chantier
 *               parent, AVANT toute écriture.
 */
function rpcAppend(args: Row): RpcResult {
  if (store.erreurAppend) return { data: null, error: store.erreurAppend }

  const cle = String(args.p_cle)
  const chantierId = args.p_chantier_id
  const messages = Array.isArray(args.p_messages) ? (args.p_messages as Row[]) : []

  if (chantierId === null || chantierId === undefined) {
    return refus('espace_client_append: chantier absent')
  }
  const parent = store.chantiers.find((c) => c.id === chantierId)
  if (!parent || typeof parent.entreprise_id !== 'string' || parent.entreprise_id === '') {
    return refus('espace_client_append: chantier introuvable ou sans entreprise')
  }

  const existante = store.conversations.find((r) => r.cle === cle)
  if (existante) {
    if (
      existante.chantier_id !== chantierId ||
      existante.entreprise_id !== parent.entreprise_id
    ) {
      return refus('espace_client_append: cle deja utilisee par un autre chantier')
    }
    existante.messages_session = [...(existante.messages_session as Row[]), ...messages]
    // La branche `on conflict (cle) do update` réelle fait aussi :
    //   session_id_en_cours = coalesce(excluded.session_id_en_cours, …)
    // Sans ce coalesce, le mock ne pourrait pas prouver l'invariant F4 sur une
    // conversation déjà existante (cas le plus fréquent en production).
    if (typeof args.p_session_id === 'string' && args.p_session_id !== '') {
      existante.session_id_en_cours = args.p_session_id
    }
    existante.updated_at = '2026-09-25T00:00:00Z'
  } else {
    const creee = nouvelleConversation(
      cle,
      String(chantierId),
      parent.entreprise_id as string,
      messages
    )
    // L'INSERT réel écrit `session_id_en_cours` (cf. 20260912 l.124-126).
    // Omettre ce colonne rendrait le mock incapable de prouver l'invariant F4.
    creee.session_id_en_cours = (args.p_session_id as string | null) ?? null
    store.conversations.push(creee)
  }

  if (store.appendSansId) return { data: { ok: true }, error: null }
  return { data: { ok: true, id: `conv-${cle}` }, error: null }
}

function rpcConsolider(args: Row): RpcResult {
  const cle = String(args.p_cle)
  const existante = store.conversations.find((r) => r.cle === cle)
  if (!existante) {
    return { data: { ok: false, erreur: 'conversation_inconnue' }, error: null }
  }
  if (existante.chantier_id === null || existante.chantier_id === undefined) {
    return refus('espace_client_consolider: conversation sans chantier')
  }
  const parent = store.chantiers.find((c) => c.id === existante.chantier_id)
  if (!parent || parent.entreprise_id !== existante.entreprise_id) {
    return refus('espace_client_consolider: incoherence entreprise conversation')
  }

  const presentes = (existante.messages_session as Row[]).length
  const calcules = Number(args.p_nb_messages_calcules ?? 0)
  existante.resume_global = args.p_resume_global ?? existante.resume_global
  if (args.p_resume_session !== null && args.p_resume_session !== undefined) {
    existante.resumes_sessions = [
      ...(existante.resumes_sessions as Row[]),
      args.p_resume_session as Row,
    ]
  }
  const vide = presentes === calcules
  if (vide) existante.messages_session = []
  return { data: { ok: true, id: existante.id, cleared: vide }, error: null }
}

// Chaîne PostgREST minimale : `.select().eq()…` puis exécution.
class Select {
  private filtres: Array<(r: Row) => boolean> = []
  private mentirSur: string[] = []
  constructor(private table: string) {}

  select(_colonnes?: string): this {
    return this
  }
  eq(colonne: string, valeur: unknown): this {
    store.journalsEq.push({ table: this.table, colonne, valeur })
    if (this.table === 'chantiers' && colonne === 'entreprise_id' && store.lectureMensongere) {
      // Filtre neutralisé : la ligne remonte malgré la non-correspondance.
      this.filtres.push(() => true)
      this.mentirSur.push(colonne)
      return this
    }
    this.filtres.push((r) => r[colonne] === valeur)
    return this
  }
  in(_colonne: string, _valeurs: unknown[]): this {
    return this
  }
  gte(_colonne: string, _valeur: unknown): this {
    return this
  }
  order(_colonne?: string, _options?: unknown): this {
    return this
  }
  limit(_n: number): this {
    return this
  }

  private run(): Row[] {
    if (this.table === 'chantiers') {
      store.lecturesChantier += 1
      const bascule = store.tenantIllisibleApres
      const base =
        bascule && store.lecturesChantier > 1
          ? store.chantiers.map((c) =>
              c.id === bascule.id ? { ...c, entreprise_id: bascule.entreprise_id } : c
            )
          : store.chantiers
      const retenues = base.filter((r) => this.filtres.every((f) => f(r)))
      // Lecture mensongère : la ligne est servie avec une AUTRE entreprise que
      // celle filtrée. C'est l'unique situation où filtre et revalidation
      // divergent — la revalidation existe précisément pour cela.
      if (this.mentirSur.includes('entreprise_id')) {
        return retenues.map((r) => ({ ...r, entreprise_id: TIERS }))
      }
      return retenues
    }
    const table =
      this.table === 'espace_client_conversations' || this.table === 'conv'
        ? store.conversations
        : []
    return table.filter((r) => this.filtres.every((f) => f(r)))
  }
  then(resolve: (v: { data: Row[] | null; error: SqlError | null }) => void): void {
    resolve({ data: this.run(), error: null })
  }

  async maybeSingle(): Promise<{ data: Row | null; error: SqlError | null }> {
    return { data: this.run()[0] ?? null, error: null }
  }
}

function installerSupabase(): void {
  holder.supabase = {
    from(table: string) {
      return new Select(table)
    },
    async rpc(fn: string, args: Row): Promise<RpcResult> {
      store.journal.push({ fn, args })
      if (fn === 'espace_client_append') return rpcAppend(args)
      if (fn === 'espace_client_consolider') return rpcConsolider(args)
      return { data: null, error: { code: '42883', message: `fonction inconnue : ${fn}` } }
    },
  }
}

// ---------------------------------------------------------------------------
// Utilitaires de requête
// ---------------------------------------------------------------------------

async function routeChat() {
  return (await import('../../app/api/espace-client/[code_acces]/chat/route')).POST
}

function post(code: string, corps: unknown): NextRequest {
  return new NextRequest(`http://x/api/espace-client/${code}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  })
}

function ctx(code: string) {
  return { params: Promise.resolve({ code_acces: code }) }
}

const ECHANGE = [
  { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
  { role: 'user', content: 'Où en est mon chantier ?' },
]

/**
 * `sessionId` réellement émis par le navigateur : `app/espace-client/[code_acces]/
 * page.tsx` appelle `crypto.randomUUID()` au chargement. Cette constante doit
 * rester ACCEPTÉ TEL QUEL par la route — c'est la garantie que la substitution
 * d'identifiant n'introduit aucun changement de comportement pour le vrai client.
 */
const UUID_CLIENT = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

function installerGroq(): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('groq.com')) {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Tout va bien.' } }] }),
        { status: 200 }
      )
    }
    return new Response('{}', { status: 200 })
  }) as typeof fetch
}

function instantane(row: Row): string {
  return JSON.stringify({
    messages_session: row.messages_session,
    resumes_sessions: row.resumes_sessions,
    resume_global: row.resume_global,
    entreprise_id: row.entreprise_id,
    chantier_id: row.chantier_id,
  })
}

beforeEach(() => {
  store = {
    chantiers: [
      { id: 'ch-bna', code_acces: 'BNA-0001', client_nom: 'Client BNA', entreprise_id: BNA },
      { id: 'ch-test', code_acces: 'TEST-0001', client_nom: 'Client TEST', entreprise_id: TEST },
      { id: 'ch-tiers', code_acces: 'TIER-0001', client_nom: 'Client TIERS', entreprise_id: TIERS },
    ],
    conversations: [],
    journal: [],
    journalsEq: [],
    tenantIllisibleApres: null,
    lecturesChantier: 0,
    erreurAppend: null,
    appendSansId: false,
    lectureMensongere: false,
  }
  installerSupabase()
  installerGroq()
})

// ===========================================================================

describe('O3-B6 · F1 — contrat de privilèges SQL', () => {
  const sql = readFileSync(
    './supabase/migrations/20260925_o3b6_isolation_espace_client_rpc.sql',
    'utf-8'
  )

  it('l\'exécution est réservée à service_role sur LES DEUX fonctions', () => {
    for (const sig of [
      'public.espace_client_append(text, uuid, text, text, jsonb)',
      'public.espace_client_consolider(text, text, integer, jsonb, jsonb)',
    ]) {
      expect(sql).toContain(`revoke all on function ${sig} from public;`)
      expect(sql).toContain(`revoke all on function ${sig} from anon;`)
      expect(sql).toContain(`revoke all on function ${sig} from authenticated;`)
      expect(sql).toContain(`grant execute on function ${sig} to service_role;`)
    }
  })

  it('les signatures ne gagnent AUCUN paramètre tenant (le tenant est déduit du chantier)', () => {
    // La consigne GO imposait de ne pas ajouter `p_entreprise_id` sans nécessité
    // démontrée : un paramètre fourni par l'appelant serait une NOUVELLE source
    // de tenant incohérente, donc une régression, pas un gain.
    const corpsFonctions = sql.split('$$').filter((_s, i) => i % 2 === 1).join('$$')
    expect(corpsFonctions).not.toContain('p_entreprise_id')
  })

  it('la migration ne modifie ni table, ni donnée, ni RLS, ni trigger', () => {
    const topLevel = sql
      .split('$$')
      .filter((_s, i) => i % 2 === 0)
      .join('\n')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('--'))
    for (const ligne of topLevel) {
      expect(ligne).not.toMatch(/^(insert|update|delete|drop|alter|truncate)\b/i)
      expect(ligne).not.toMatch(/^create (table|policy|trigger|index)\b/i)
    }
  })
})

// ===========================================================================

describe('O3-B6 · F1/F2 — isolation bidirectionnelle BNA ↔ TEST', () => {
  it('A. BNA écrit, TEST ne peut pas lire ni écraser la conversation de BNA', async () => {
    // Conversation préexistante belonging à BNA.
    store.conversations.push(
      nouvelleConversation('ch-bna', 'ch-bna', BNA, [
        { role: 'user', content: 'Demande privée de BNA' },
      ])
    )
    const avantBna = instantane(store.conversations[0])

    const POST = await routeChat()
    const r = await POST(
      post('TEST-0001', { messages: ECHANGE, sessionId: 'session-test' }),
      ctx('TEST-0001')
    )
    expect(r.status).toBe(200)

    // 1. La conversation BNA est INTACTE : ni purge, ni écrasement, ni changement
    //    de tenant, même si TEST a tenté d'écrire sous la même `cle`.
    expect(instantane(store.conversations[0])).toBe(avantBna)
    expect(store.conversations[0].entreprise_id).toBe(BNA)

    // 2. Le tenant TEST a obtenu SA PROPRE conversation, distincte.
    const propreTest = store.conversations.find((c) => c.entreprise_id === TEST)
    expect(propreTest).toBeDefined()
    expect(propreTest?.cle).toBe('ch-test')
    expect(JSON.stringify(propreTest?.messages_session)).not.toContain('BNA')
  })

  it('B. TEST écrit d\'abord, BNA ne peut pas lire ni écraser la conversation de TEST', async () => {
    store.conversations.push(
      nouvelleConversation('ch-test', 'ch-test', TEST, [
        { role: 'user', content: 'Demande privée de TEST' },
      ])
    )
    const avantTest = instantane(store.conversations[0])

    const POST = await routeChat()
    const r = await POST(
      post('BNA-0001', { messages: ECHANGE, sessionId: 'session-bna' }),
      ctx('BNA-0001')
    )
    expect(r.status).toBe(200)

    expect(instantane(store.conversations[0])).toBe(avantTest)
    expect(store.conversations[0].entreprise_id).toBe(TEST)

    const propreBna = store.conversations.find((c) => c.entreprise_id === BNA)
    expect(propreBna).toBeDefined()
    expect(JSON.stringify(propreBna?.messages_session)).not.toContain('TEST')
  })

  it('C. tentative de mise à jour d\'une conversation étrangère : refusée, 500, zéro altération', async () => {
    store.conversations.push(
      nouvelleConversation('ch-bna', 'ch-bna', BNA, [
        { role: 'user', content: 'Confidentiel BNA' },
      ])
    )
    const avant = instantane(store.conversations[0])

    // Le client TEST tente explicitement de viser la conversation de BNA.
    // Ni `chantierId`, ni `entrepriseId` du corps ne sont pris en compte : le
    // serveur résout le chantier depuis le code d'accès.
    const POST = await routeChat()
    const r = await POST(
      post('TEST-0001', {
        messages: ECHANGE,
        sessionId: 'session-pirate',
        chantierId: 'ch-bna',
        entrepriseId: BNA,
        cle: 'ch-bna',
        p_chantier_id: 'ch-bna',
      }),
      ctx('TEST-0001')
    )
    expect(r.status).toBe(200)

    // Ce qui part réellement dans le RPC : le chantier RÉSOLU, jamais celui du corps.
    const append = store.journal.find((c) => c.fn === 'espace_client_append')
    expect(append?.args.p_chantier_id).toBe('ch-test')
    expect(append?.args.p_cle).toBe('ch-test')

    // Et la conversation de BNA n'a pas bougé d'un octet.
    expect(instantane(store.conversations[0])).toBe(avant)
    expect(store.conversations.filter((c) => c.entreprise_id === BNA)).toHaveLength(1)
  })

  it('D. incohérence chantier_id / entreprise_id : la ligne écrite par la B6 est refusée', async () => {
    // Ligne volontairement corrompue : `entreprise_id` ne correspond plus au
    // chantier parent. Le garde SQL doit refuser l'append ET la consolidation
    // AVANT toute écriture.
    const corrompue = nouvelleConversation('ch-bna', 'ch-bna', TIERS, [
      { role: 'user', content: 'Message empoisonné' },
    ])
    store.conversations.push(corrompue)
    const avant = instantane(corrompue)

    const appendDirect = store.journal // journal vierge : appel direct au RPC
    expect(appendDirect).toHaveLength(0)

    const r1 = await (holder.supabase as { rpc: (f: string, a: Row) => Promise<RpcResult> }).rpc(
      'espace_client_append',
      { p_cle: 'ch-bna', p_chantier_id: 'ch-bna', p_messages: [{ role: 'user', content: 'x' }] }
    )
    expect(r1.error?.code).toBe('23514')
    expect(r1.error?.message).toMatch(/cle deja utilisee par un autre chantier/)

    const r2 = await (holder.supabase as { rpc: (f: string, a: Row) => Promise<RpcResult> }).rpc(
      'espace_client_consolider',
      { p_cle: 'ch-bna', p_nb_messages_calcules: 1, p_resume_global: { texte: 'INJECTION' } }
    )
    expect(r2.error?.code).toBe('23514')
    expect(r2.error?.message).toMatch(/incoherence entreprise conversation/)

    // Aucune des deux opérations n'a modifié la ligne.
    expect(instantane(corrompue)).toBe(avant)
    expect(JSON.stringify(corrompue)).not.toContain('INJECTION')
  })

  it('E. conversation sans chantier : la consolidation est refusée avant l\'écriture', async () => {
    const orpheline = nouvelleConversation('orpheline', null, BNA, [
      { role: 'user', content: 'Message sans parent' },
    ])
    store.conversations.push(orpheline)
    const avant = instantane(orpheline)

    const r = await (holder.supabase as { rpc: (f: string, a: Row) => Promise<RpcResult> }).rpc(
      'espace_client_consolider',
      { p_cle: 'orpheline', p_nb_messages_calcules: 1, p_resume_global: { texte: 'INJECTION' } }
    )
    expect(r.error?.code).toBe('23514')
    expect(r.error?.message).toMatch(/conversation sans chantier/)
    expect(instantane(orpheline)).toBe(avant)
  })

  it('F. append sans chantier : refus (aucun tenant inductible)', async () => {
    const r = await (holder.supabase as { rpc: (f: string, a: Row) => Promise<RpcResult> }).rpc(
      'espace_client_append',
      { p_cle: 'sans-chantier', p_messages: [{ role: 'user', content: 'x' }] }
    )
    expect(r.error?.code).toBe('23514')
    expect(r.error?.message).toMatch(/chantier absent/)
    expect(store.conversations).toHaveLength(0)
  })

  it('G. append sur un chantier inexistant ou sans entreprise : refus', async () => {
    const inexistant = await (
      holder.supabase as { rpc: (f: string, a: Row) => Promise<RpcResult> }
    ).rpc('espace_client_append', { p_cle: 'k', p_chantier_id: 'ch-inexistant' })
    expect(inexistant.error?.message).toMatch(/introuvable ou sans entreprise/)

    store.chantiers.push({ id: 'ch-vide', code_acces: 'VIDE-1', entreprise_id: null })
    const sansEntreprise = await (
      holder.supabase as { rpc: (f: string, a: Row) => Promise<RpcResult> }
    ).rpc('espace_client_append', { p_cle: 'k', p_chantier_id: 'ch-vide' })
    expect(sansEntreprise.error?.message).toMatch(/introuvable ou sans entreprise/)
    expect(store.conversations).toHaveLength(0)
  })
})

// ===========================================================================

describe('O3-B6 · appelant sans tenant autorisé', () => {
  it('H. code d\'accès inconnu ou chantier sans entreprise : 403 et ZÉRO appel RPC', async () => {
    store.chantiers.push({
      id: 'ch-sans-entreprise',
      code_acces: 'ORPHELIN-1',
      client_nom: 'X',
      entreprise_id: null,
    })
    store.chantiers.push({
      id: 'ch-entreprise-invalide',
      code_acces: 'ORPHELIN-2',
      client_nom: 'X',
      entreprise_id: 'pas-un-uuid',
    })

    const POST = await routeChat()
    for (const code of ['INCONNU', 'ORPHELIN-1', 'ORPHELIN-2']) {
      const r = await POST(post(code, { messages: ECHANGE, sessionId: 's-12345678' }), ctx(code))
      expect(r.status, code).toBe(403)
      expect(await r.json()).toEqual({ error: "Code d'accès invalide" })
    }
    // Un code vide ou seulement blanc est un 400 explicite, avant même la
    // résolution : il ne donne pas lieu à une requête base.
    for (const code of ['', '   ']) {
      const vide = await POST(post(code || 'INCONNU', { messages: ECHANGE }), ctx(code))
      expect(vide.status, JSON.stringify(code)).toBe(400)
    }

    // Preuve : aucune écriture n'a été tentée, ni conversation créée.
    expect(store.journal).toHaveLength(0)
    expect(store.conversations).toHaveLength(0)
  })

  it('I. le tenant du RPC est TOUJOURS celui du chantier résolu, jamais celui du corps', async () => {
    const POST = await routeChat()
    for (const [code, attendu] of [
      ['BNA-0001', 'ch-bna'],
      ['TEST-0001', 'ch-test'],
      ['TIER-0001', 'ch-tiers'],
    ] as const) {
      const r = await POST(
        post(code, {
          messages: ECHANGE,
          sessionId: 'session-1234',
          chantierId: 'ch-bna',
          entreprise_id: TEST,
          code_acces: 'TEST-0001',
        }),
        ctx(code)
      )
      expect(r.status).toBe(200)
      const append = store.journal.filter((c) => c.fn === 'espace_client_append').pop()
      expect(append?.args.p_chantier_id).toBe(attendu)
      const ligne = store.conversations.find((c) => c.cle === attendu)
      expect(ligne?.entreprise_id).toBe(
        store.chantiers.find((c) => c.id === attendu)?.entreprise_id
      )
    }
  })
})

// ===========================================================================

describe('O3-B6 · F3/F6 — erreurs RPC et résultat non confirmé', () => {
  it('J. erreur SQL de l\'append → 500 générique, aucun texte renvoyé', async () => {
    store.erreurAppend = { code: '08006', message: 'connection failure' }
    const POST = await routeChat()

    const r = await POST(post('BNA-0001', { messages: ECHANGE, sessionId: 'session-erreur' }), ctx('BNA-0001'))

    // AVANT O3-B6 : `200 { texte }` — l'échange était perdu, silencieusement.
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'Erreur serveur' })
    expect(store.conversations).toHaveLength(0)
  })

  it('K. violation du garde SQL (incohérence) → 500, journalisée comme telle', async () => {
    // Le garde SQL lève : la route ne doit ni l'avaler, ni le déguiser en panne.
    const violation: SqlError = {
      code: '23514',
      message: 'espace_client_append: cle deja utilisee par un autre chantier',
    }
    store.erreurAppend = violation
    const POST = await routeChat()

    const r = await POST(post('BNA-0001', { messages: ECHANGE, sessionId: 'session-violation' }), ctx('BNA-0001'))
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'Erreur serveur' })
  })

  it('K2. l\'erreur du RPC est réellement extraite et QUALIFIÉE (pas avalée)', async () => {
    // La distinction entre « violation d'invariant d'isolation » et « panne » n'est
    // pas observable par le statut HTTP (les deux donnent 500) : elle ne l'est que
    // par le journal. Ce test est donc ce qui rend la branche `{ error }`
    // réellement porteuse — sans lui, supprimer l'extraction de `{ error }` ne
    // changerait rien de testable.
    const journalise: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      journalise.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    })
    try {
      const POST = await routeChat()

      // 1. Garde d'isolation déclenchée → qualifiée comme telle.
      journalise.length = 0
      store.erreurAppend = {
        code: '23514',
        message: 'espace_client_append: cle deja utilisee par un autre chantier',
      }
      const r1 = await POST(post('BNA-0001', { messages: ECHANGE, sessionId: 'session-v1' }), ctx('BNA-0001'))
      expect(r1.status).toBe(500)
      const viole = journalise.filter((m) =>
        /VIOLATION D'ISOLATION|garde SQL d'isolation/.test(m)
      )
      expect(viole.length, journalise.join(' || ')).toBeGreaterThan(0)

      // 2. Panne réseau → journalisée comme panne, PAS comme une violation.
      journalise.length = 0
      store.erreurAppend = { code: '08006', message: 'connection failure' }
      const r2 = await POST(post('BNA-0001', { messages: ECHANGE, sessionId: 'session-p1' }), ctx('BNA-0001'))
      expect(r2.status).toBe(500)
      expect(journalise.length).toBeGreaterThan(0)
      expect(journalise.some((m) => /a échoué/.test(m))).toBe(true)
      expect(journalise.some((m) => /VIOLATION D'ISOLATION|garde SQL d'isolation/.test(m))).toBe(
        false
      )
      // Le message serveur d'erreur est conservé tel quel : pas de simple « 500 ».
      expect(journalise.some((m) => m.includes('connection failure'))).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('L. résultat non confirmé ({ ok: true } sans id) → 500, pas de faux succès', async () => {
    store.appendSansId = true
    const POST = await routeChat()

    const r = await POST(
      post('BNA-0001', { messages: ECHANGE, sessionId: 'session-non-confirmee' }),
      ctx('BNA-0001')
    )
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'Erreur serveur' })
  })
})

// ===========================================================================

describe('O3-B6 · F5 — revalidation du contexte de chat', () => {
  it('M. tenant illisible à la relecture → 500, aucun appel réseau, aucune écriture', async () => {
    // Le tenant est dérivé de la 1ʳᵉ lecture (résolution du code d'accès), puis
    // revalidé sur la 2ᵉ. On rend la 2ᵉ illisible : fail-closed.
    store.tenantIllisibleApres = { id: 'ch-bna', entreprise_id: 'pas-un-uuid' }
    let appelsGroq = 0
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('groq.com')) appelsGroq += 1
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
      })
    }) as typeof fetch

    const POST = await routeChat()
    const r = await POST(post('BNA-0001', { messages: ECHANGE, sessionId: 'session-1234' }), ctx('BNA-0001'))

    expect(r.status).toBe(500)
    expect(appelsGroq).toBe(0)
    expect(store.journal).toHaveLength(0)
    expect(store.conversations).toHaveLength(0)
  })

  it('M2. filtre ET revalidation divergent (lecture mensongère) → refus', async () => {
    // La revalidation n'est PAS redondante avec le filtre : elle est exactement
    // ce qui refuse une ligne dont la valeur ne correspond pas au filtre demandé
    // (transport défaillant, projection erronée, cache mal indexé). Ce scénario
    // est le seul où les deux contrôles peuvent diverger, et c'est celui qui
    // donne son sens à la garde.
    store.lectureMensongere = true
    let appelsGroq = 0
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('groq.com')) appelsGroq += 1
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
      })
    }) as typeof fetch

    const POST = await routeChat()
    const r = await POST(post('BNA-0001', { messages: ECHANGE, sessionId: 'session-1234' }), ctx('BNA-0001'))

    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'Erreur serveur' })
    expect(appelsGroq).toBe(0)
    expect(store.journal).toHaveLength(0)
    expect(store.conversations).toHaveLength(0)
  })

  it('N. les quatre lectures de contexte portent toutes le filtre entreprise_id', async () => {    const POST = await routeChat()
    const r = await POST(post('BNA-0001', { messages: ECHANGE, sessionId: 'session-1234' }), ctx('BNA-0001'))
    expect(r.status).toBe(200)

    for (const table of [
      'chantiers',
      'avancements_chantier',
      'devis',
      'rapports_intemperies',
    ]) {
      const filtres = store.journalsEq.filter(
        (e) => e.table === table && e.colonne === 'entreprise_id'
      )
      expect(filtres.length, `${table} non scopé`).toBeGreaterThan(0)
      for (const f of filtres) expect(f.valeur).toBe(BNA)
    }
  })

  it('O. la relecture de la conversation est elle aussi scopée puis revalidée', async () => {    store.conversations.push(
      nouvelleConversation('ch-bna', 'ch-bna', BNA, [{ role: 'user', content: 'm' }])
    )
    const POST = await routeChat()
    const r = await POST(post('BNA-0001', { messages: ECHANGE, sessionId: 'session-1234' }), ctx('BNA-0001'))
    expect(r.status).toBe(200)

    const lecturesConv = store.journalsEq.filter(
      (e) => e.table === 'espace_client_conversations' && e.colonne === 'entreprise_id'
    )
    expect(lecturesConv.length).toBeGreaterThan(0)
    for (const f of lecturesConv) expect(f.valeur).toBe(BNA)
  })
})

// ===========================================================================

describe('O3-B6 · parcours nominal — le chatbot n\'est pas dégradé', () => {
  it('S. chaîne complète : message client → IA → réponse IA → persistance → 200 → affichage', async () => {
    // Test de non-régression explicite, poste par poste. Le parcours nominal ne
    // doit différer en RIEN de ce qu'il était avant O3-B6.
    let appelsGroq = 0
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('groq.com')) {
        appelsGroq += 1
        return new Response(
          JSON.stringify({ choices: [{ message: { content: 'Tout va bien.' } }] }),
          { status: 200 }
        )
      }
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    const POST = await routeChat()
    const r = await POST(
      post('BNA-0001', { messages: ECHANGE, sessionId: UUID_CLIENT }),
      ctx('BNA-0001')
    )

    // 1. Retour HTTP : 200.
    expect(r.status).toBe(200)
    // 2. La réponse IA atteint bien le client (le `else` de la page → pas de
    //    message « problème de connexion » affiché au client).
    const corps = (await r.json()) as Record<string, unknown>
    expect(corps.texte).toBe('Tout va bien.')
    expect(corps.error).toBeUndefined()
    // 3. L'IA a été appelée une fois, pas deux.
    expect(appelsGroq).toBe(1)
    // 4. Persistance : exactement UN append, et la ligne existe.
    const appends = store.journal.filter((c) => c.fn === 'espace_client_append')
    expect(appends).toHaveLength(1)
    const ligne = store.conversations.find((c) => c.cle === 'ch-bna')
    expect(ligne).toBeDefined()
    // 5. L'énoncé du client ET la réponse de l'IA sont mémorisés.
    const memorises = ligne?.messages_session as Array<{ role: string; content: string }>
    expect(memorises).toHaveLength(2)
    expect(memorises[0]).toEqual({ role: 'user', content: ECHANGE[1].content })
    expect(memorises[1]).toEqual({ role: 'assistant', content: 'Tout va bien.' })
    // 6. Tenant correct, inchangé.
    expect(ligne?.entreprise_id).toBe(BNA)
    // 7. AUCUNE substitution de sessionId sur le parcours nominal : le client
    //    conserve exactement l'identifiant qu'il a envoyé, donc la consolidation
    //    de fin de session fonctionne comme avant.
    expect(appends[0].args.p_session_id).toBe(UUID_CLIENT)
    expect(ligne?.session_id_en_cours).toBe(UUID_CLIENT)
    // Et la colonne a bien été écrite — pas seulement transmise au RPC.
    expect(Object.keys(ligne ?? {})).toContain('session_id_en_cours')
  })

  it('T. le parcours nominal ne journalise AUCUNE erreur (aucune perte silencieuse)', async () => {
    // C\'est l\'invariant central de O3-B6 : plus jamais de `200 { texte }` avec
    // une erreur d\'écriture tapie derrière. Un `200` implique donc, par
    // construction, qu\'aucune erreur n\'a été produite sur le chemin.
    const journalise: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      journalise.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    })
    try {
      const POST = await routeChat()
      const r = await POST(
        post('BNA-0001', { messages: ECHANGE, sessionId: UUID_CLIENT }),
        ctx('BNA-0001')
      )
      expect(r.status).toBe(200)
      expect(journalise, journalise.join(' || ')).toEqual([])
      expect(store.conversations).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('U. l\'échec de persistance ne renvoie JAMAIS `texte` : pas de faux succès client', async () => {
    // Le message tapé par le client reste affiché côté page (ajout optimiste),
    // mais l\'IA ne renvoie rien : afficher une réponse « like » un échange
    // mémorisé serait le mensonge que O3-B6 supprime. Vérifié dans les deux sens :
    // erreur SQL (J) et résultat non confirmé (L).
    for (const casser of [
      () => { store.erreurAppend = { code: '08006', message: 'connection failure' } },
      () => { store.appendSansId = true },
    ]) {
      store.conversations = []
      store.journal = []
      store.erreurAppend = null
      store.appendSansId = false
      casser()

      const POST = await routeChat()
      const r = await POST(
        post('BNA-0001', { messages: ECHANGE, sessionId: UUID_CLIENT }),
        ctx('BNA-0001')
      )
      const corps = (await r.json()) as Record<string, unknown>
      expect(corps.texte).toBeUndefined()
      expect(corps).toEqual({ error: 'Erreur serveur' })
    }
  })
})

// ===========================================================================

describe('O3-B6 · F4 — sessionId', () => {
  it('P. un sessionId déjà consommé n\'est jamais mémorisé comme session courante', async () => {
    store.conversations.push(
      nouvelleConversation(
        'ch-bna',
        'ch-bna',
        BNA,
        [{ role: 'user', content: 'ancien' }],
        [{ session_id: 'session-deja-consolidee', resume_session: 'S(ancien)' }]
      )
    )
    const POST = await routeChat()
    const r = await POST(
      post('BNA-0001', { messages: ECHANGE, sessionId: 'session-deja-consolidee' }),
      ctx('BNA-0001')
    )
    expect(r.status).toBe(200)

    const append = store.journal.find((c) => c.fn === 'espace_client_append')
    const stocke = String(append?.args.p_session_id)
    expect(stocke).not.toBe('session-deja-consolidee')
    expect(stocke).toMatch(/^srv-/)
    // L'invariant porte sur la DONNÉE persistée, pas seulement sur l'argument
    // transmis : la ligne ne doit pas non plus conserver l'étiquette consommée.
    const ligne = store.conversations.find((c) => c.cle === 'ch-bna')
    expect(ligne?.session_id_en_cours).toBe(stocke)
    expect(ligne?.session_id_en_cours).not.toBe('session-deja-consolidee')
  })

  it('Q. un sessionId légitime, encore disponible, est conservé tel quel (idempotence)', async () => {
    const POST = await routeChat()
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    const r = await POST(post('BNA-0001', { messages: ECHANGE, sessionId: uuid }), ctx('BNA-0001'))
    expect(r.status).toBe(200)
    const append = store.journal.find((c) => c.fn === 'espace_client_append')
    expect(append?.args.p_session_id).toBe(uuid)
  })

  it('R. sessionId malformé, absent, trop long ou hostile : jamais propagé au RPC', async () => {
    const cas: Array<{ nom: string; value?: unknown }> = [
      { nom: 'absent' },
      { nom: 'null', value: null },
      { nom: 'nombre', value: 42 },
      { nom: 'objet', value: { a: 1 } },
      { nom: 'vide', value: '  ' },
      { nom: 'trop court', value: 'ab' },
      { nom: 'trop long', value: 'x'.repeat(4000) },
      { nom: 'injection SQL', value: "'; drop table public.espace_client_conversations; --aaa" },
    ]
    const POST = await routeChat()
    for (const c of cas) {
      const corps: Record<string, unknown> = { messages: ECHANGE }
      if ('value' in c) corps.sessionId = c.value
      const r = await POST(post('BNA-0001', corps), ctx('BNA-0001'))
      expect(r.status, c.nom).toBe(200)
      const append = store.journal.filter((x) => x.fn === 'espace_client_append').pop()
      const stocke = String(append?.args.p_session_id)
      expect(stocke, c.nom).toMatch(/^srv-[a-z0-9]+-[a-z0-9]+$/)
      expect(stocke.length, c.nom).toBeLessThanOrEqual(64)
    }
  })
})
