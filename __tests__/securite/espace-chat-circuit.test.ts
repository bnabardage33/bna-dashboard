// @vitest-environment node
//
// Test d'intégration du circuit chat Espace Client SANS environnement réel :
// la VRAIE route /api/espace-client/:code/chat (scopée au code d'accès) et la
// route de consolidation /api/chat-client-summary sont importées et exécutées,
// avec un mock Supabase en mémoire qui rejoue fidèlement la logique SQL des
// fonctions serveur (append/consolider, upsert note, index unique) et un stub
// Groq déterministe. L'anonymisation est neutralisée (identité) car elle requiert
// le réseau. L'architecture n'est pas modifiée : seul le module @/lib/supabaseAdmin
// est remplacé par le test.
//
// Limite assumée (documentée, non masquée) : le mock ne rejoue pas la
// sérialisation réelle de pg_advisory_xact_lock (PostgreSQL) ; les règles
// anti-écrasement (clear conditionnel) sont en revanche répliquées à l'identique.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { estimerTokensMessages } from '../../lib/espace-chat-utils'

// --- Stub Supabase : réplique de la logique de la migration SQL ---

type MiniRow = Record<string, unknown>
type MessageSa = { role: 'user' | 'assistant'; content: string }

// O3-B5 : forme d'une erreur renvoyée par le client Supabase, et journal des
// `.eq()` émis afin de prouver le scopage dans les assertions.
type MiniError = { code?: string; message: string }
type EqJournal = Array<{ table: string; colonne: string; valeur: unknown }>

const holder = vi.hoisted(() => ({
  supabase: undefined as unknown,
}))

// Proxy délégant : chaque accès à supabaseAdmin.* redirige vers le stub courant.
// Compatible avec le SSR transform de vitest (pas de piège de materialisation).
const delegue = new Proxy({}, {
  get(_cible: {}, cle: string | symbol): unknown {
    if (typeof cle === 'symbol') return undefined
    const source = holder.supabase as Record<string, unknown> | undefined
    if (!source) return undefined
    return source[cle]
  },
})

vi.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: delegue }))

// Les routes de chat exigent désormais une session (lib/auth.ts) : dans ce
// test d'intégration (sans navigateur ni cookies), on simule une session valide
// pour continuer à exercer la logique métier du circuit vis-à-vis de l'IA.
vi.mock('@/lib/auth', () => ({
  verifierSession: async () => ({ authentifie: true }),
}))

// L'anonymisation PII (anonymizeText) interroge l'API Supabase au runtime :
// neutralisée ici (identité) pour ne pas dépendre du réseau dans le test.
vi.mock('@/lib/anonymizeText', () => ({
  anonymizeText: async (text: string) => ({ anonymizedText: text, mapping: {} }),
  deanonymizeText: (text: string) => text,
}))

let nextId = 0
function uid(prefix: string): string {
  nextId += 1
  return `${prefix}${nextId}`
}

function cleConv(row: MiniRow): string {
  return String(row.cle)
}

function convParCle(db: MiniRow[], cle: string): MiniRow | null {
  return db.find((r) => r.cle === cle) ?? null
}

class FakeQuery {
  private filters: Array<(r: MiniRow) => boolean> = []
  private sorter: ((a: MiniRow, b: MiniRow) => number) | null = null
  private lim: number | null = null
  private pendingUpdate: MiniRow | null = null
  private pendingDelete = false
  private erreurSimulee: MiniError | null = null

  constructor(
    private table: string,
    private store: { rows: MiniRow[] },
    private journal?: EqJournal,
    private options?: { erreurSelect?: MiniError | null }
  ) {
    this.erreurSimulee = options?.erreurSelect ?? null
  }

  select(_colonnes?: string): this {
    return this
  }

  eq(col: string, v: unknown): this {
    // O3-B5 : chaque `.eq()` émis est journalisé pour que les tests puissent
    // vérifier le scopage réel plutôt que le supposer.
    this.journal?.push({ table: this.table, colonne: col, valeur: v })
    this.filters.push((r) => r[col] === v)
    return this
  }

  is(col: string, v: unknown): this {
    this.filters.push((r) => (v === null ? r[col] == null : r[col] === v))
    return this
  }

  ilike(col: string, pattern: string): this {
    const re = new RegExp('^' + pattern.replaceAll('%', '.*') + '$', 'i')
    this.filters.push((r) => typeof r[col] === 'string' && re.test(String(r[col])))
    return this
  }

  in(col: string, valeurs: unknown[]): this {
    this.filters.push((r) => valeurs.includes(r[col]))
    return this
  }

  gte(col: string, v: unknown): this {
    this.filters.push((r) => (r[col] as number) >= (v as number))
    return this
  }

  order(col: string, opts: { ascending?: boolean }): this {
    const asc = opts?.ascending !== false
    this.sorter = (a, b) => {
      const va = a[col] as string | number | null
      const vb = b[col] as string | number | null
      if (va == null && vb == null) return 0
      if (va == null) return asc ? 1 : -1
      if (vb == null) return asc ? -1 : 1
      if (typeof va === 'string' && typeof vb === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va)
      const premier = (va as number) - (vb as number)
      return asc ? premier : -premier
    }
    return this
  }

  limit(n: number): this {
    this.lim = n
    return this
  }

  private run(): MiniRow[] {
    let resultat = this.store.rows.filter((r) => this.filters.every((f) => f(r)))
    if (this.sorter) resultat = [...resultat].sort(this.sorter)
    if (this.lim !== null) resultat = resultat.slice(0, this.lim)
    return resultat
  }

  then(resolve: (value: { data: MiniRow[] | null; error: MiniError | null }) => void): void {
    const lignes = this.run()
    // O3-B5 : le mock peut simuler une erreur serveur sur une lecture.
    if (this.erreurSimulee) {
      resolve({ data: null, error: this.erreurSimulee })
      return
    }
    if (this.pendingDelete) {
      const cibles = new Set(lignes.map((r) => r.id))
      this.store.rows = this.store.rows.filter((r) => !cibles.has(r.id))
      resolve({ data: null, error: null })
      return
    }
    if (this.pendingUpdate !== null) {
      lignes.forEach((r) => Object.assign(r, this.pendingUpdate))
      resolve({ data: null, error: null })
      return
    }
    resolve({ data: lignes, error: null })
  }

  async maybeSingle(): Promise<{ data: MiniRow | null; error: null }> {
    return { data: this.run()[0] ?? null, error: null }
  }

  async insert(ligne: MiniRow): Promise<{ data: MiniRow | null; error: MiniError | null }> {
    // O3-B5 — le mock applique désormais les contraintes de la vraie base sur
    // les tables à `entreprise_id NOT NULL`. Auparavant l'INSERT sans
    // `entreprise_id` aboutissait dans le tableau et les tests passaient alors que
    // la production échouait silencieusement (faux vert).
    const exigeTenant = this.table === 'notes_patron' || this.table === 'notifications'
    if (exigeTenant && (typeof ligne.entreprise_id !== 'string' || ligne.entreprise_id === '')) {
      return {
        data: null,
        error: {
          code: '23502',
          message: `null value in column "entreprise_id" of relation "${this.table}" violates not-null constraint`,
        },
      }
    }
    const maintenue: MiniRow = {
      ...ligne,
      id: ligne.id ?? uid('row-'),
      created_at: ligne.created_at ?? new Date().toISOString(),
      updated_at: ligne.updated_at ?? new Date().toISOString(),
    }
    this.store.rows.push(maintenue)
    return { data: maintenue, error: null }
  }

  update(patch: MiniRow): this {
    this.pendingUpdate = patch
    return this
  }

  delete(): this {
    this.pendingDelete = true
    return this
  }
}

interface CircuitState {
  convRows: MiniRow[]
  noteRows: MiniRow[]
  notifRows: MiniRow[]
  chantierRows: MiniRow[]
  profileRows: MiniRow[]
  // O3-B5 : journal des `.eq()` émis (preuve de scopage) + erreurs simulables.
  eqJournal: EqJournal
  erreurSelectProfiles: MiniError | null
  erreurSelectConversations: MiniError | null
  // O3-B6 : erreurs RPC simulables + résultat non confirmé (charge utile sans
  // `id` : le RPC n'a alors confirmé aucune écriture).
  erreurAppend: MiniError | null
  erreurConsolider: MiniError | null
  appendSansId: boolean
  erreurSelectSessions: MiniError | null
  chantierReads: number
  basculeApresLecture: { id: string; entreprise_id: string } | null
  groqCalls: { endpoint: 'chat' | 'resume'; body: { messages: Array<{ role: string; content: string }> } }[]
  groqFail: boolean
  supabase: {
    from: (table: string) => FakeQuery
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: MiniRow | null; error: MiniError | null }>
  }
}

type ResultatRpc = { data: MiniRow | null; error: MiniError | null }

function refusSql(message: string): ResultatRpc {
  // `raise exception ... using errcode = 'check_violation'` → SQLSTATE 23514.
  // Le client Supabase ne lève pas : il résout `{ error }`.
  return { data: null, error: { code: '23514', message } }
}

// O3-B6 — Réplique fidèle des garde-fous de la migration
// 20260925_o3b6_isolation_espace_client_rpc.sql. AVANT, ce mock acceptait
// n'importe quel `p_chantier_id` et n'appliquait aucun contrôle de cohérence :
// les tests passaient donc même sans la moindre protection (faux vert aggravé —
// les 8 chantiers de fixture partageaient un seul tenant, voir `setCircuit`).
function appliquerAppend(
  store: { rows: MiniRow[] },
  args: Record<string, unknown>,
  chantiers: MiniRow[],
  options: { sansId?: boolean } = {}
): ResultatRpc {
  const cle = String(args.p_cle)
  const messages = Array.isArray(args.p_messages) ? args.p_messages : []
  const existante = store.rows.find((r) => r.cle === cle)
  const maintenant = new Date().toISOString()

  // Garde 1 — sans chantier, il n'y a pas de tenant : refus.
  if (args.p_chantier_id === null || args.p_chantier_id === undefined) {
    return refusSql('espace_client_append: chantier absent')
  }

  // Garde 2 — chantier inexistant ou sans entreprise : refus.
  const parent = chantiers.find((c) => c.id === args.p_chantier_id)
  if (!parent || typeof parent.entreprise_id !== 'string' || parent.entreprise_id === '') {
    return refusSql('espace_client_append: chantier introuvable ou sans entreprise')
  }

  // Garde 3 — cohérence de la ligne déjà présente sous cette `cle` : ni
  // changement de chantier, ni changement d'entreprise. C'est ce qui bloque le
  // rattachement d'une conversation existante à un autre tenant via
  // `on conflict (cle) do update`.
  if (existante) {
    if (
      existante.chantier_id !== args.p_chantier_id ||
      existante.entreprise_id !== parent.entreprise_id
    ) {
      return refusSql('espace_client_append: cle deja utilisee par un autre chantier')
    }
  }

  let ligne: MiniRow
  if (!existante) {
    // Le trigger SQL `tg_set_entreprise_par_chantier()` dérive l'entreprise du
    // chantier parent. Le mock rejoue ce comportement, sinon la ligne créée
    // n'aurait pas d'entreprise et toute lecture scopée échouerait.
    ligne = {
      id: uid('conv-'),
      cle,
      chantier_id: args.p_chantier_id ?? null,
      entreprise_id: parent.entreprise_id,
      client_nom: args.p_client_nom ?? null,
      session_id_en_cours: args.p_session_id ?? null,
      messages_session: messages,
      session_demarree_le: maintenant,
      resumes_sessions: [],
      resume_global: null,
      updated_at: maintenant,
    }
    store.rows.push(ligne)
  } else {
    existante.messages_session = [...(existante.messages_session as MiniRow[]), ...messages]
    existante.client_nom = args.p_client_nom ?? existante.client_nom
    existante.session_id_en_cours = args.p_session_id ?? existante.session_id_en_cours
    existante.updated_at = maintenant
    ligne = existante
  }

  // O3-B6 (F6) : `{ ok: true, id }` est la seule preuve d'écriture acceptée par
  // la route. `options.sansId` simule un retour incomplet.
  if (options.sansId) return { data: { ok: true }, error: null }
  return { data: { ok: true, id: ligne.id }, error: null }
}

// O3-B6 — `espace_client_consolider` ne reçoit pas de chantier : le garde
// confronte l'entreprise de la LIGNE visée à celle de son chantier parent, et
// s'exécute AVANT toute écriture. Sans lui, un tenant pouvait écraser
// `resume_global`, injecter dans `resumes_sessions` et purger `messages_session`
// de la conversation d'un autre tenant.
function appliquerConsolider(
  store: { rows: MiniRow[] },
  args: Record<string, unknown>,
  chantiers: MiniRow[]
): ResultatRpc {
  const cle = String(args.p_cle)
  const existante = store.rows.find((r) => r.cle === cle)
  if (!existante) {
    return { data: { ok: false, erreur: 'conversation_inconnue' }, error: null }
  }
  if (existante.chantier_id === null || existante.chantier_id === undefined) {
    return refusSql('espace_client_consolider: conversation sans chantier')
  }
  const parent = chantiers.find((c) => c.id === existante.chantier_id)
  if (!parent || parent.entreprise_id !== existante.entreprise_id) {
    return refusSql('espace_client_consolider: incoherence entreprise conversation')
  }
  const presentes = Array.isArray(existante.messages_session) ? existante.messages_session.length : 0
  const calcules = Number(args.p_nb_messages_calcules ?? 0)
  const resume = args.p_resume_global ?? existante.resume_global ?? null
  const sessions = Array.isArray(existante.resumes_sessions) ? existante.resumes_sessions : []

  if (args.p_resume_session !== null && args.p_resume_session !== undefined) {
    sessions.push(args.p_resume_session)
  }
  existante.resume_global = resume
  existante.resumes_sessions = sessions
  existante.updated_at = new Date().toISOString()

  const resultat: MiniRow = { ok: true, id: existante.id }
  if (presentes === calcules) {
    existante.messages_session = []
    resultat.cleared = true
  } else {
    resultat.cleared = false
    resultat.messages_calcules = calcules
    resultat.messages_presents = presentes
  }
  return { data: resultat, error: null }
}

function fakeCondenser(parsed: { resume_global?: unknown; messages?: MessageSa[] }): {
  resume_session: string
  resume_global: {
    texte: string
    sentiment_global: string
    demandes_en_attente: string[]
    points_cles: string[]
  }
} {
  const prec = (parsed.resume_global ?? {}) as { texte?: unknown }
  const prevTxt = typeof prec.texte === 'string' ? prec.texte : ''
  const messages = parsed.messages ?? []
  const fragments = messages.map((m) => String(m.content ?? '').slice(0, 30))
  const marqueur = 'AJOUT[' + fragments.join(' ⟩ ') + ']'
  const texte = prevTxt !== '' ? prevTxt + ' | ' + marqueur : marqueur
  const tout = messages.map((m) => String(m.content ?? '').toLowerCase()).join(' ')
  const colere = tout.includes('🔥colere')
  const rappel = tout.includes('📌rappel')
  const piecesCles = messages
    .map((m) => String(m.content ?? ''))
    .filter((c) => c.includes('🧩'))
    .slice(0, 3)
  return {
    resume_session: 'S(' + fragments.join(', ') + ')',
    resume_global: {
      texte,
      sentiment_global: colere ? 'negatif' : 'neutre',
      demandes_en_attente: rappel ? ['Rappeler le client'] : [],
      points_cles: piecesCles,
    },
  }
}

// O3-B4 : `resoudreChantierParCodeAcces` est fail-closed — un chantier sans
// `entreprise_id` exploitable (UUID) est rejeté (403). Les fixtures doivent donc
// porter une entreprise valide, sans quoi plus aucune de ces routes ne répond.
const ENTREPRISE_TEST = '22222222-2222-4222-8222-222222222222'
const ENTREPRISE_BNA = '11111111-1111-4111-8111-111111111111'
// O3-B6 : troisième tenant, jamais présent dans `profiles`. Il sert à prouver
// qu'une conversation rattachée à un chantier de ce tenant n'est ni lue ni
// consolidée depuis BNA ou TEST.
const ENTREPRISE_AUTRE = '33333333-3333-4333-8333-333333333333'

function setCircuit(): CircuitState {
  const etat: CircuitState = {
    convRows: [],
    noteRows: [],
    notifRows: [],
    chantierRows: [
      // O3-B6 : fixtures BI-TENANT. Auparavant les 8 chantiers partageaient
      // `ENTREPRISE_TEST` : aucun scénario ne pouvait donc distinguer un chemin
      // correctement scopé d'un chemin qui aurait lu/écrit sans filtre tenant —
      // les tests passaient y compris avec toutes les protections supprimées.
      // Les quatre premiers chantiers sont BNA, les quatre suivants TEST.
      { id: 'chantier-1', code_acces: 'ACCES-1', client_nom: 'CLIENT-1', entreprise_id: ENTREPRISE_BNA, created_at: '2026-01-01T00:00:00Z' },
      { id: 'chantier-2', code_acces: 'ACCES-2', client_nom: 'CLIENT-2', entreprise_id: ENTREPRISE_BNA, created_at: '2026-01-01T00:00:00Z' },
      { id: 'chantier-3', code_acces: 'ACCES-3', client_nom: 'CLIENT-3', entreprise_id: ENTREPRISE_BNA, created_at: '2026-01-01T00:00:00Z' },
      { id: 'chantier-4', code_acces: 'ACCES-4', client_nom: 'CLIENT-4', entreprise_id: ENTREPRISE_BNA, created_at: '2026-01-01T00:00:00Z' },
      { id: 'chantier-5', code_acces: 'ACCES-5', client_nom: 'CLIENT-5', entreprise_id: ENTREPRISE_TEST, created_at: '2026-01-01T00:00:00Z' },
      { id: 'chantier-6', code_acces: 'ACCES-6', client_nom: 'CLIENT-6', entreprise_id: ENTREPRISE_TEST, created_at: '2026-01-01T00:00:00Z' },
      { id: 'chantier-7', code_acces: 'ACCES-7', client_nom: 'CLIENT-7', entreprise_id: ENTREPRISE_TEST, created_at: '2026-01-01T00:00:00Z' },
      { id: 'chantier-8', code_acces: 'ACCES-8', client_nom: 'CLIENT-8', entreprise_id: ENTREPRISE_TEST, created_at: '2026-01-01T00:00:00Z' },
      // Chantier de l'entreprise tierce : sert aux scénarios d'incohérence
      // chantier_id / entreprise_id (F2).
      { id: 'chantier-9', code_acces: 'ACCES-9', client_nom: 'CLIENT-9', entreprise_id: ENTREPRISE_AUTRE, created_at: '2026-01-01T00:00:00Z' },
    ],
    // O3-B5 : le destinataire doit être résolu DANS le tenant. Deux profils
    // coexistent, dont un patron BNA créé AVANT le compte TEST : sans le filtre
    // `.eq("entreprise_id", …)`, `destinatairePatron` aurait renvoyé le mauvais.
    profileRows: [
      { id: 'patron-bna', full_name: 'Gaël', role: 'admin', created_at: '2026-01-01T00:00:00Z', entreprise_id: ENTREPRISE_BNA },
      { id: 'patron-test', full_name: 'Patron TEST', role: 'admin', created_at: '2026-02-01T00:00:00Z', entreprise_id: ENTREPRISE_TEST },
    ],
    eqJournal: [],
    erreurSelectProfiles: null,
    erreurSelectConversations: null,
    erreurAppend: null,
    erreurConsolider: null,
    appendSansId: false,
    erreurSelectSessions: null,
    chantierReads: 0,
    basculeApresLecture: null,
    groqCalls: [],
    groqFail: false,
    supabase: undefined as unknown as CircuitState['supabase'],
  }

  etat.supabase = {
    from(table: string): FakeQuery {
      if (table === 'espace_client_conversations' || table === 'conv') {
        return new FakeQuery(table, { rows: etat.convRows }, etat.eqJournal, {
          erreurSelect: etat.erreurSelectConversations,
        })
      }
      if (table === 'notes_patron') return new FakeQuery(table, { rows: etat.noteRows }, etat.eqJournal)
      if (table === 'notifications' || table === 'notifs') return new FakeQuery(table, { rows: etat.notifRows }, etat.eqJournal)
      if (table === 'chantiers') {
        // Vue dérivée : la bascule de tenant ne s'applique qu'APRÈS la première
        // lecture, sinon `resoudreChantierParCodeAcces` elle-même verrait déjà la
        // nouvelle valeur et le test ne prouverait rien (voir 11c).
        const vue = {
          get rows(): MiniRow[] {
            etat.chantierReads += 1
            const bascule = etat.basculeApresLecture
            if (!bascule || etat.chantierReads <= 1) return etat.chantierRows
            return etat.chantierRows.map((c) =>
              c.id === bascule.id ? { ...c, entreprise_id: bascule.entreprise_id } : c
            )
          },
        }
        return new FakeQuery(table, vue, etat.eqJournal)
      }
      if (table === 'profiles') {
        return new FakeQuery(table, { rows: etat.profileRows }, etat.eqJournal, {
          erreurSelect: etat.erreurSelectProfiles,
        })
      }
      return new FakeQuery(table, { rows: [] }, etat.eqJournal)
    },
    async rpc(fn: string, args: Record<string, unknown>): Promise<ResultatRpc> {
      if (fn === 'espace_client_append') {
        // O3-B6 : le client Supabase RÉSOUT l'erreur, il ne lève pas. Le mock
        // rend donc la même forme que la vraie base, `{ data, error }`.
        if (etat.erreurAppend) return { data: null, error: etat.erreurAppend }
        return appliquerAppend({ rows: etat.convRows }, args, etat.chantierRows, {
          sansId: etat.appendSansId,
        })
      }
      if (fn === 'espace_client_consolider') {
        if (etat.erreurConsolider) return { data: null, error: etat.erreurConsolider }
        return appliquerConsolider({ rows: etat.convRows }, args, etat.chantierRows)
      }
      return { data: { ok: false, erreur: `fonction_rpc_inconnue:${fn}` }, error: null }
    },
  }

  holder.supabase = etat.supabase
  return etat
}

// --- Stub Groq : répondeur déterministe + enregistrement des appels ---

function installerGroq(etat: CircuitState): void {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('groq.com')) {
      const corps = JSON.parse(String(init?.body)) as {
        messages?: Array<{ role: string; content: string }>
      }
      const messages = corps.messages ?? []
      const dernierUser = [...messages].reverse().find((m) => m.role === 'user')
      const estCondensation =
        dernierUser !== undefined && dernierUser.content.includes('"resume_global"')
      etat.groqCalls.push({
        endpoint: estCondensation ? 'resume' : 'chat',
        body: { messages },
      })

      if (etat.groqFail) {
        return new Response(JSON.stringify({ error: 'groq indisponible' }), { status: 500 })
      }

      if (estCondensation) {
        const parsed = JSON.parse(dernierUser.content) as {
          resume_global?: unknown
          messages?: MessageSa[]
        }
        const sortie = fakeCondenser(parsed)
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(sortie) } }] }),
          { status: 200 }
        )
      }

      const reponse = `Réponse à « ${(dernierUser?.content ?? '').slice(0, 40)} »`
      return new Response(JSON.stringify({ choices: [{ message: { content: reponse } }] }), {
        status: 200,
      })
    }
    return new Response('{}', { status: 200 })
  }
}

async function chargerRoutes(): Promise<{
  chatClient: { POST: (req: NextRequest, ctx: { params: Promise<{ code_acces: string }> }) => Promise<Response> }
  resume: { POST: (req: NextRequest, ctx: { params: Promise<{ code_acces: string }> }) => Promise<Response> }
}> {
  const chatClient = await import('../../app/api/espace-client/[code_acces]/chat/route')
  const resume = await import('../../app/api/espace-client/[code_acces]/chat-summary/route')
  return { chatClient, resume }
}

function postBody(url: string, payload: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function parseReponse(reponse: Response): Promise<Record<string, unknown>> {
  return reponse.json()
}

// --- Scénarios ---

describe('Circuit chat Espace Client (simulé, sans environnement réel)', () => {
  let etat: CircuitState
  let routes: Awaited<ReturnType<typeof chargerRoutes>>

  beforeEach(async () => {
    etat = setCircuit()
    installerGroq(etat)
    routes = await chargerRoutes()
  })

  it('1. session → messages → fermeture → UNE seule note', async () => {
    const cle = 'chantier-1'
    const session = 'session-1'
    const greeting: MessageSa = { role: 'assistant', content: 'Bonjour je peux vous aider ?' }
    const corps2 = [
      greeting,
      { role: 'user', content: 'Où en est mon chantier en ce moment ?' },
    ]

    const r1 = await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-1/chat', {
        messages: corps2,
        sessionId: session,
      }),
        { params: Promise.resolve({ code_acces: 'ACCES-1' }) }
    )
    expect(r1.status).toBe(200)

    const corps3 = [
      ...corps2,
      { role: 'assistant', content: 'Réponse à « Où en est mon chantier »' },
      { role: 'user', content: 'Merci, et les finitions sont prévues quand ?' },
    ]
    const r2 = await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-1/chat', {
        messages: corps3,
        sessionId: session,
      }),
        { params: Promise.resolve({ code_acces: 'ACCES-1' }) }
    )
    expect(r2.status).toBe(200)

    const ligne = convParCle(etat.convRows, cle)
    expect(ligne).not.toBeNull()
    expect((ligne?.messages_session as MessageSa[]).length).toBe(4)

    const rep = await parseReponse(
      await routes.resume.POST(
        postBody('http://x/api/espace-client/ACCES-1/chat-summary', {
          messages: corps3,
          sessionId: session,
        }),
          { params: Promise.resolve({ code_acces: 'ACCES-1' }) }
      )
    )
    expect(rep.status).toBe('alert_created')
    expect(rep.sessions).toBe(1)

    const notes = etat.noteRows.filter((n) => n.espace_client_id === cle)
    expect(notes.length).toBe(1)
    const stockees = etat.convRows.find((c) => c.cle === cle)
    expect((stockees?.messages_session as MessageSa[]).length).toBe(0)
  })

  it('2. réouverture même chantier → nouvelle session → fusion avec la mémoire', async () => {
    const cle = 'chantier-2'
    const corps1 = [
      { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
      { role: 'user', content: 'Demande sur les délais du bardage 🧩' },
    ]
    await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-2/chat', {
        messages: corps1,
        sessionId: 'session-2a',
      }),
        { params: Promise.resolve({ code_acces: 'ACCES-2' }) }
    )
    const rep1 = await parseReponse(
      await routes.resume.POST(
        postBody('http://x/api/espace-client/ACCES-2/chat-summary', {
          messages: corps1,
          sessionId: 'session-2a',
        }),
          { params: Promise.resolve({ code_acces: 'ACCES-2' }) }
      )
    )
    expect(rep1.status).toBe('alert_created')

    // réouverture → NOUVELLE session (même chantier/cle, nouveau sessionId)
    const corps2 = [
      { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
      { role: 'user', content: 'J’ai réfléchi à la couleur, on peut en parler ? 🔥COLERE' },
    ]
    await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-2/chat', {
        messages: corps2,
        sessionId: 'session-2b',
      }),
        { params: Promise.resolve({ code_acces: 'ACCES-2' }) }
    )
    const rep2 = await parseReponse(
      await routes.resume.POST(
        postBody('http://x/api/espace-client/ACCES-2/chat-summary', {
          messages: corps2,
          sessionId: 'session-2b',
        }),
          { params: Promise.resolve({ code_acces: 'ACCES-2' }) }
      )
    )
    expect(rep2.status).toBe('alert_created')
    expect(rep2.sessions).toBe(2)

    const ligne = convParCle(etat.convRows, cle)
    expect((ligne?.resumes_sessions as MiniRow[]).length).toBe(2)

    // fusion : le résumé global contient la trace des DEUX sessions
    const resume = (ligne?.resume_global as { texte: string })
    expect(resume.texte).toContain('Demande sur les délais')
    expect(resume.texte).toContain('réfléchi à la couleur')

    // toujours UNE seule note (upsert par cle)
    const notes = etat.noteRows.filter((n) => n.espace_client_id === cle)
    expect(notes.length).toBe(1)

    // notif mécontentement créée pour la session négative
    const notifs = etat.notifRows.filter((n) => n.titre === '🔴 Client mécontent (Espace Web)')
    expect(notifs.length).toBeGreaterThanOrEqual(1)
  })

  it('3. conversation banale → aucun appel LLM de consolidation et aucune note', async () => {
    const cle = 'chantier-3'
    const avant = etat.groqCalls.filter((c) => c.endpoint === 'resume').length

    const rep = await parseReponse(
      await routes.resume.POST(
        postBody('http://x/api/espace-client/ACCES-3/chat-summary', {
          messages: [
            { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
            { role: 'user', content: 'bonjour au revoir' },
          ],
          sessionId: 'session-3',
        }),
          { params: Promise.resolve({ code_acces: 'ACCES-3' }) }
      )
    )
    expect(rep.status).toBe('ras')

    const apres = etat.groqCalls.filter((c) => c.endpoint === 'resume').length
    expect(apres).toBe(avant)
    expect(etat.noteRows.filter((n) => n.espace_client_id === cle).length).toBe(0)
  })

  it('4. session > 6000 tokens → découpage en plusieurs blocs, aucune perte', async () => {
    const cle = 'chantier-4'
    const grosA = 'MARQUEUR_A_' + 'x'.repeat(9000)
    const grosB = 'MARQUEUR_B_' + 'y'.repeat(9000)
    const grosC = 'MARQUEUR_C_' + 'z'.repeat(9000)

    const etape1 = [
      { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
      { role: 'user', content: grosA },
    ]
    const etape2 = [
      { role: 'assistant', content: 'Réponse à « MARQUEUR_A »' },
      { role: 'user', content: grosB },
    ]
    const etape3 = [
      { role: 'assistant', content: 'Réponse à « MARQUEUR_B »' },
      { role: 'user', content: grosC },
    ]

    for (const paquet of [etape1, etape2, etape3]) {
      const r = await routes.chatClient.POST(
        postBody('http://x/api/espace-client/ACCES-4/chat', {
          messages: paquet,
          sessionId: 'session-4',
        }),
          { params: Promise.resolve({ code_acces: 'ACCES-4' }) }
      )
      expect(r.status).toBe(200)
    }

    const ligne = convParCle(etat.convRows, cle)
    expect((ligne?.messages_session as MessageSa[]).length).toBe(6)

    const rep = await parseReponse(
      await routes.resume.POST(
        postBody('http://x/api/espace-client/ACCES-4/chat-summary', {
          messages: [
            etape1[0],
            etape3[1] as MessageSa,
            etape2[1] as MessageSa,
            etape2[0] as MessageSa,
            etape3[0] as MessageSa,
            etape1[1] as MessageSa,
          ],
          sessionId: 'session-4',
        }),
          { params: Promise.resolve({ code_acces: 'ACCES-4' }) }
      )
    )
    expect(rep.status).toBe('alert_created')

    const appelsResume = etat.groqCalls.filter((c) => c.endpoint === 'resume')
    // plusieurs blocs → plusieurs appels de condensation
    expect(appelsResume.length).toBeGreaterThanOrEqual(2)

    // chaque bloc reçu par le LLM reste sous le budget tokens
    for (const appel of appelsResume) {
      const msgs = appel.body.messages.filter(
        (m) => typeof m.content === 'string'
      ) as MessageSa[]
      const tokens = estimerTokensMessages(msgs)
      if (msgs.length > 1) {
        expect(tokens).toBeLessThanOrEqual(6000)
      }
    }

    // aucune perte : les 3 marqueurs figurent dans le résumé global final
    const finale = (convParCle(etat.convRows, cle)?.resume_global as { texte: string }).texte
    expect(finale).toContain('MARQUEUR_A')
    expect(finale).toContain('MARQUEUR_B')
    expect(finale).toContain('MARQUEUR_C')

    // mémoire brute vidée après consolidation
    expect((convParCle(etat.convRows, cle)?.messages_session as MessageSa[]).length).toBe(0)
  })

  it('5. fermeture répétée → pas de doublon (note unique, pas de re-consolidation)', async () => {
    const cle = 'chantier-5'
    const session = 'session-5'
    const corps = [
      { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
      { role: 'user', content: 'Mon chantier est en retard ?' },
    ]
    await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-5/chat', {
        messages: corps,
        sessionId: session,
      }),
        { params: Promise.resolve({ code_acces: 'ACCES-5' }) }
    )

    const r1 = await parseReponse(
      await routes.resume.POST(
        postBody('http://x/api/espace-client/ACCES-5/chat-summary', {
          messages: corps,
          sessionId: session,
        }),
          { params: Promise.resolve({ code_acces: 'ACCES-5' }) }
      )
    )
    expect(r1.status).toBe('alert_created')

    const appelleAvant = etat.groqCalls.filter((c) => c.endpoint === 'resume').length
    // double clic / fermeture répétée avec la même session
    const r2 = await parseReponse(
      await routes.resume.POST(
        postBody('http://x/api/espace-client/ACCES-5/chat-summary', {
          messages: corps,
          sessionId: session,
        }),
          { params: Promise.resolve({ code_acces: 'ACCES-5' }) }
      )
    )
    expect(r2.status).toBe('deja_consolide')

    const appelleApres = etat.groqCalls.filter((c) => c.endpoint === 'resume').length
    expect(appelleApres).toBe(appelleAvant)

    const notes = etat.noteRows.filter((n) => n.espace_client_id === cle)
    expect(notes.length).toBe(1)

    const ligne = convParCle(etat.convRows, cle)
    expect((ligne?.resumes_sessions as MiniRow[]).length).toBe(1)
  })

  it('6. erreur Groq pendant le chat → aucun message perdu', async () => {
    const cle = 'chantier-6'
    const session = 'session-6'
    const critique =
      'Message critique à conserver absolument : où aller chercher mon acompte et quels documents ? ' +
      'détail supplémentaire long '.repeat(6) +
      ' 🔥COLERE'
    const corps = [
      { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
      { role: 'user', content: critique },
    ]

    etat.groqFail = true
    const r = await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-6/chat', {
        messages: corps,
        sessionId: session,
      }),
        { params: Promise.resolve({ code_acces: 'ACCES-6' }) }
    )
    expect(r.status).toBe(502)

    // le message utilisateur est mémorisé malgré l'échec
    const ligne = convParCle(etat.convRows, cle)
    expect(ligne).not.toBeNull()
    expect((ligne?.messages_session as MessageSa[]).length).toBe(1)
    expect((ligne?.messages_session as MessageSa[])[0].content).toContain('conserver absolument')

    // reprise : le résumé suivant contient bien le message (aucune perte)
    etat.groqFail = false
    const rep = await parseReponse(
      await routes.resume.POST(
        postBody('http://x/api/espace-client/ACCES-6/chat-summary', {
          messages: corps,
          sessionId: session,
        }),
          { params: Promise.resolve({ code_acces: 'ACCES-6' }) }
      )
    )
    expect(rep.status).toBe('alert_created')
    expect((convParCle(etat.convRows, cle)?.resume_global as { texte: string }).texte).toContain(
      'conserver'
    )
    // et la demande de rappel codée dans le message est remontée au patron
    expect(etat.notifRows.filter((n) => n.titre === '🔴 Client mécontent (Espace Web)').length).toBe(1)
  })

  it('7. interruption de session (pas de clôture) → mémoire conservée puis ré-consolidée', async () => {
    const cle = 'chantier-7'

    await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-7/chat', {
        messages: [
          { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
          { role: 'user', content: 'Premier échange de la session interrompue' },
        ],
        sessionId: 'session-7-initiale',
      }),
        { params: Promise.resolve({ code_acces: 'ACCES-7' }) }
    )
    // l’utilisateur ferme la page sans clôture : rien n’est perdu (le POST
    // mémorise user + réponse assistant)
    let ligne = convParCle(etat.convRows, cle)
    expect((ligne?.messages_session as MessageSa[]).length).toBe(2)

    // réouverture plus tard : nouvelle session, nouvel échange
    await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-7/chat', {
        messages: [
          { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
          { role: 'user', content: 'Suite du sujet après interruption' },
        ],
        sessionId: 'session-7-suite',
      }),
        { params: Promise.resolve({ code_acces: 'ACCES-7' }) }
    )
    ligne = convParCle(etat.convRows, cle)
    expect((ligne?.messages_session as MessageSa[]).length).toBe(4)

    // clôture : les deux échanges sont consolidés en une seule fois
    const rep = await parseReponse(
      await routes.resume.POST(
        postBody('http://x/api/espace-client/ACCES-7/chat-summary', {
          messages: [],
          sessionId: 'session-7-suite',
        }),
          { params: Promise.resolve({ code_acces: 'ACCES-7' }) }
      )
    )
    expect(rep.status).toBe('alert_created')
    const resume = (convParCle(etat.convRows, cle)?.resume_global as { texte: string }).texte
    expect(resume).toContain('Premier échange')
    expect(resume).toContain('Suite du sujet')
    expect((convParCle(etat.convRows, cle)?.messages_session as MessageSa[]).length).toBe(0)
  })

  it('8. concurrence : append pendant la consolidation ne perd rien (anti-écrasement)', async () => {
    const sup = etat.supabase
    const cle = 'chantier-8'
    // O3-B6 : `p_chantier_id` est désormais obligatoire — sans chantier, le
    // tenant est indéductible et la fonction refuse (F2). L'ancien test
    // l'omettait : il aurait donc obtenu un refus, pas une conversation.
    const append = (contenu: string) =>
      sup.rpc('espace_client_append', {
        p_cle: cle,
        p_chantier_id: 'chantier-8',
        p_client_nom: 'CLIENT-8',
        p_session_id: 'session-conc',
        p_messages: [{ role: 'user', content: contenu }],
      })

    const r1 = await append('m1')
    expect(r1.error).toBeNull()
    const r2 = await append('m2')
    expect(r2.error).toBeNull()
    const r3 = await append('m3')
    expect(r3.error).toBeNull()
    const r4 = await append('m4')
    expect(r4.error).toBeNull()

    // pendant que le LLM consolidait (compte calculé = 3), un nouveau message
    // arrive : on simule le délai entre le calcul du compte et l'application
    const resultat = await sup.rpc('espace_client_consolider', {
      p_cle: cle,
      p_session_id: 's-conc',
      p_nb_messages_calcules: 3,
      p_resume_global: { texte: 'R1' },
      p_resume_session: { session_id: 's-conc' },
    })
    expect(resultat.data?.cleared).toBe(false)
    // la mémoire brute est conservée (m4 pas perdu)
    expect((convParCle(etat.convRows, cle)?.messages_session as MessageSa[]).length).toBe(4)
    // le résumé global est tout de même mis à jour
    expect((convParCle(etat.convRows, cle)?.resume_global as { texte: string }).texte).toBe('R1')

    // une seconde consolidation avec le compte à jour purge bien
    const second = await sup.rpc('espace_client_consolider', {
      p_cle: cle,
      p_session_id: 's-conc',
      p_nb_messages_calcules: 4,
      p_resume_global: { texte: 'R2' },
      p_resume_session: { session_id: 's-conc' },
    })
    expect(second.data?.cleared).toBe(true)
    expect((convParCle(etat.convRows, cle)?.messages_session as MessageSa[]).length).toBe(0)
    expect((convParCle(etat.convRows, cle)?.resume_global as { texte: string }).texte).toBe('R2')
  })

  // -------------------------------------------------------------------------
  // O3-B6 — Scénarios d'isolation ajoutés. Les huit scénarios ci-dessus
  // s'exécutaient tous dans un tenant unique : ils neRaise donc aucun écart
  // entre un chemin scopé et un chemin non scopé.
  // -------------------------------------------------------------------------

  it('9. bidirectionnel : deux entreprises, deux conversations, deux notes, deux patrons', async () => {
    const corpsBna = [
      { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
      { role: 'user', content: 'Question BNA sur le bardage' },
    ]
    const corpsTest = [
      { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
      { role: 'user', content: 'Question TEST sur les finitions' },
    ]

    // BNA parle…
    const rb = await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-1/chat', { messages: corpsBna, sessionId: 'session-bna' }),
      { params: Promise.resolve({ code_acces: 'ACCES-1' }) }
    )
    expect(rb.status).toBe(200)
    // …TEST aussi, en parallèle.
    const rt = await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-5/chat', { messages: corpsTest, sessionId: 'session-test' }),
      { params: Promise.resolve({ code_acces: 'ACCES-5' }) }
    )
    expect(rt.status).toBe(200)

    // Deux conversations distinctes, chacune dans SON tenant.
    const convBna = convParCle(etat.convRows, 'chantier-1')
    const convTest = convParCle(etat.convRows, 'chantier-5')
    expect(convBna?.entreprise_id).toBe(ENTREPRISE_BNA)
    expect(convTest?.entreprise_id).toBe(ENTREPRISE_TEST)
    // Aucun mélange : le contenu BNA n'apparaît pas chez TEST, et réciproquement.
    expect(JSON.stringify(convTest?.messages_session)).toContain('finitions')
    expect(JSON.stringify(convTest?.messages_session)).not.toContain('bardage')
    expect(JSON.stringify(convBna?.messages_session)).toContain('bardage')
    expect(JSON.stringify(convBna?.messages_session)).not.toContain('finitions')

    // Clôture de la seule conversation BNA : elle ne doit toucher que BNA.
    const repBna = await parseReponse(
      await routes.resume.POST(
        postBody('http://x/api/espace-client/ACCES-1/chat-summary', {
          messages: corpsBna,
          sessionId: 'session-bna',
        }),
        { params: Promise.resolve({ code_acces: 'ACCES-1' }) }
      )
    )
    expect(repBna.status).toBe('alert_created')

    const notesBna = etat.noteRows.filter((n) => n.espace_client_id === 'chantier-1')
    const notesTest = etat.noteRows.filter((n) => n.espace_client_id === 'chantier-5')
    expect(notesBna.length).toBe(1)
    expect(notesBna[0].entreprise_id).toBe(ENTREPRISE_BNA)
    expect(notesTest.length).toBe(0)
    // La mémoire brute TEST est intacte : la consolidation BNA ne l'a pas purgée.
    // (Le POST mémorise l'énoncé du client ET la réponse de l'IA : 2 messages.)
    expect((convTest?.messages_session as MessageSa[]).length).toBe(2)
    expect(convTest?.resume_global).toBeNull()
  })

  it('10. bidirectionnel : une alerte d\'un tenant ne part jamais chez un patron d\'un autre', async () => {
    // `chantier-9` appartient à ENTREPRISE_AUTRE, tenant pour lequel AUCUN patron
    // n'est enregistré. Le message est négatif (`🔥COLERE`) donc une notification
    // doit être créée — et son `destinataire_id` doit rester `null` (le tenant
    // attendu n'a personne), au lieu de retomber sur Gaël (BNA) ou sur le patron
    // TEST comme le faisait `destinatairePatron()` avant son scopage (O3-B5).
    const corps = [
      { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
      { role: 'user', content: 'Je suis très mécontent de ce chantier 🔥COLERE' },
    ]
    const r = await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-9/chat', { messages: corps, sessionId: 'session-autre' }),
      { params: Promise.resolve({ code_acces: 'ACCES-9' }) }
    )
    expect(r.status).toBe(200)
    expect(convParCle(etat.convRows, 'chantier-9')?.entreprise_id).toBe(ENTREPRISE_AUTRE)

    const rep = await parseReponse(
      await routes.resume.POST(
        postBody('http://x/api/espace-client/ACCES-9/chat-summary', {
          messages: corps,
          sessionId: 'session-autre',
        }),
        { params: Promise.resolve({ code_acces: 'ACCES-9' }) }
      )
    )
    expect(rep.status).toBe('alert_created')

    // La note reste dans SON tenant.
    const notes = etat.noteRows.filter((n) => n.espace_client_id === 'chantier-9')
    expect(notes.length).toBe(1)
    expect(notes[0].entreprise_id).toBe(ENTREPRISE_AUTRE)

    // La notification reste dans SON tenant et ne nomme PERSONNE.
    const notifs = etat.notifRows.filter((n) => n.titre === '🔴 Client mécontent (Espace Web)')
    expect(notifs.length).toBe(1)
    expect(notifs[0].entreprise_id).toBe(ENTREPRISE_AUTRE)
    expect(notifs[0].destinataire_id).toBeNull()
    // Explicitement : ni Gaël (BNA) ni le patron TEST.
    expect(notifs[0].destinataire_id).not.toBe('patron-bna')
    expect(notifs[0].destinataire_id).not.toBe('patron-test')
  })

  it('11. F3 — échec d\'écriture du RPC : 500 explicite, plus de faux 200', async () => {
    const avant = etat.convRows.length
    etat.erreurAppend = { code: '08006', message: 'connection failure' }

    const r = await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-1/chat', {
        messages: [
          { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
          { role: 'user', content: 'Message qui ne sera pas mémorisé' },
        ],
        sessionId: 'session-echec',
      }),
      { params: Promise.resolve({ code_acces: 'ACCES-1' }) }
    )

    // AVANT la correction O3-B6 : `200 { texte }`. L'utilisateur et le patron
    // croyaient l'échange mémorisé ; il ne l'était pas.
    expect(r.status).toBe(500)
    const corps = (await r.json()) as Record<string, unknown>
    expect(corps.texte).toBeUndefined()
    expect(corps).toEqual({ error: 'Erreur serveur' })
    expect(etat.convRows.length).toBe(avant)
  })

  it('11b. F6 — RPC qui répond { ok: true } SANS id : écriture non confirmée → 500', async () => {
    // Le client ne lève pas, la fonction « réussit » : seule la vérification de la
    // charge utile distingue un vrai succès d'un succès seulement annoncé. Sans
    // ce contrôle, un `{ ok: true }` tronqué passerait pour une mémorisation
    // réussie et le client recevrait un 200 alors que rien n'est garanti.
    etat.appendSansId = true

    const r = await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-1/chat', {
        messages: [
          { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
          { role: 'user', content: 'Écriture non confirmée' },
        ],
        sessionId: 'session-non-confirmee',
      }),
      { params: Promise.resolve({ code_acces: 'ACCES-1' }) }
    )
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'Erreur serveur' })
  })

  it('11c. F5 — revalidation du contexte : chantier déplacé de tenant → 500, Groq jamais appelé', async () => {
    // Rupture d'invariant : le tenant est dérivé de la PREMIÈRE lecture du
    // chantier (via le code d'accès), puis contrôlé par la relecture de
    // `chargerContexte`. On fait diverger les deux : fail-closed, aucun appel
    // réseau, aucune écriture.
    etat.basculeApresLecture = { id: 'chantier-1', entreprise_id: ENTREPRISE_TEST }
    const avantGroq = etat.groqCalls.length

    const r = await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-1/chat', {
        messages: [
          { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
          { role: 'user', content: 'Question après bascule de tenant' },
        ],
        sessionId: 'session-bascule',
      }),
      { params: Promise.resolve({ code_acces: 'ACCES-1' }) }
    )
    expect(r.status).toBe(500)
    expect(etat.groqCalls.length).toBe(avantGroq)
    expect(etat.convRows.length).toBe(0)
    // Et chaque lecture de contexte a bien porté le filtre tenant (F5) : les
    // quatre tables lues par `chargerContexte` sont scopées par `entreprise_id`.
    const tablesContexte = [
      'chantiers',
      'avancements_chantier',
      'devis',
      'rapports_intemperies',
    ]
    for (const table of tablesContexte) {
      const filtres = etat.eqJournal.filter((e) => e.table === table && e.colonne === 'entreprise_id')
      expect(filtres.length, `${table} doit être filtré par entreprise_id`).toBeGreaterThan(0)
      for (const f of filtres) expect(f.valeur).toBe(ENTREPRISE_BNA)
    }
  })

  it('12. F4 — un sessionId déjà consommé n\'est jamais réémis, et reste clos comme avant', async () => {
    // Rappel du constat affiné pendant la correction : le contrôle
    // `sessionDejaConsolide` de O3-B5 exige `stockes.length === 0`. Un client
    // malveillant ne peut donc PAS forcer `deja_consolide` tant que sa
    // conversation contient des messages non consolidés — l'auto-DoS est déjà
    // fermée en amont. Le risque résiduel est un invariant de données, pas une
    // indisponibilité : `session_id_en_cours` ne doit jamais valoir un
    // `session_id` déjà présent dans `resumes_sessions`, sinon la même étiquette
    // désigne deux sessions distinctes dans le dossier du patron.
    const corps = [
      { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
      { role: 'user', content: 'Première session à consolider' },
    ]
    await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-1/chat', { messages: corps, sessionId: 'session-orig' }),
      { params: Promise.resolve({ code_acces: 'ACCES-1' }) }
    )
    const premier = await parseReponse(
      await routes.resume.POST(
        postBody('http://x/api/espace-client/ACCES-1/chat-summary', {
          messages: corps,
          sessionId: 'session-orig',
        }),
        { params: Promise.resolve({ code_acces: 'ACCES-1' }) }
      )
    )
    expect(premier.status).toBe('alert_created')

    const consommes = (convParCle(etat.convRows, 'chantier-1')?.resumes_sessions as MiniRow[]).map(
      (s) => s.session_id
    )
    expect(consommes).toEqual(['session-orig'])

    // Nouvelle session, mais le client réinjecte l'identifiant DÉJÀ CONSOMMÉ.
    const corps2 = [
      { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
      { role: 'user', content: 'Deuxième session qui doit être consolidée' },
    ]
    const r2 = await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-1/chat', {
        messages: corps2,
        sessionId: 'session-orig',
      }),
      { params: Promise.resolve({ code_acces: 'ACCES-1' }) }
    )
    expect(r2.status).toBe(200)

    const conv = convParCle(etat.convRows, 'chantier-1')
    const courant = String(conv?.session_id_en_cours)
    // L'invariant : l'identifiant mémorisé n'est PAS celui qui est déjà consumed.
    expect(courant).not.toBe('session-orig')
    expect(courant).toMatch(/^srv-/)
    expect(consommes).not.toContain(courant)
  })

  it('12b. F4 — sessionId malformé, absent ou absurdement long : substitué, jamais propagé', async () => {
    const corps = [
      { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
      { role: 'user', content: 'Question avec sessionId douteux' },
    ]
    const cas: Array<{ nom: string; corps: Record<string, unknown> }> = [
      { nom: 'absent', corps: { messages: corps } },
      { nom: 'null', corps: { messages: corps, sessionId: null } },
      { nom: 'chaîne vide', corps: { messages: corps, sessionId: '   ' } },
      { nom: 'trop court', corps: { messages: corps, sessionId: 'ab' } },
      { nom: 'trop long', corps: { messages: corps, sessionId: 'x'.repeat(5000) } },
      { nom: 'caractères interdits', corps: { messages: corps, sessionId: "a'.drop table--xx" } },
    ]

    for (const [i, c] of cas.entries()) {
      const r = await routes.chatClient.POST(
        postBody('http://x/api/espace-client/ACCES-1/chat', c.corps),
        { params: Promise.resolve({ code_acces: 'ACCES-1' }) }
      )
      expect(r.status, c.nom).toBe(200)
      const courant = String(convParCle(etat.convRows, 'chantier-1')?.session_id_en_cours)
      // Jamais le token du client : toujours un identifiant serveur bien formé.
      expect(courant, c.nom).toMatch(/^srv-[a-z0-9]+-[a-z0-9]+$/)
      expect(String(c.corps.sessionId ?? '').slice(0, 4), c.nom).not.toBe(courant.slice(0, 4))
      expect(i).toBeGreaterThanOrEqual(0)
    }

    // Et l'identifiant légitime du navigateur (un `crypto.randomUUID()`) est
    // conservé tel quel : l'idempotence d'une session réelle n'est pas cassée.
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    const rOk = await routes.chatClient.POST(
      postBody('http://x/api/espace-client/ACCES-1/chat', { messages: corps, sessionId: uuid }),
      { params: Promise.resolve({ code_acces: 'ACCES-1' }) }
    )
    expect(rOk.status).toBe(200)
    expect(convParCle(etat.convRows, 'chantier-1')?.session_id_en_cours).toBe(uuid)
  })
})