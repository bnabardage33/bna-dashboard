// @vitest-environment node
//
// O3-B5 — Tests d'isolation multi-entreprises de la consolidation Espace Client.
//
// Ces tests exécutent les VRAIES routes (`/api/chat-client-summary` derrière une
// session, `/api/espace-client/:code/chat-summary` derrière un `code_acces`) et
// le VRAI cœur `traiterConsolidation`, avec un mini-PostgREST en mémoire qui
// APPLIQUE réellement les filtres `.eq()` et qui REFUSE les INSERT sans
// `entreprise_id` (contrainte NOT NULL de la production). Seuls le transport
// (`@/lib/supabaseAdmin`), la session (`@/lib/auth`, `@/lib/supabase/server`) et
// le réseau Groq sont remplacés.
//
// Objectif : prouver que le `chantierId` fourni dans le corps de la requête ne
// peut PAS choisir le tenant, et qu'aucune donnée d'une autre entreprise n'atteint
// Groq, la note, la notification ni la réponse HTTP.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// --- Tenants de test (UUID valides : les gardes fail-closed les exigent) ---

const BNA = '11111111-1111-4111-8111-111111111111'
const TEST = '22222222-2222-4222-8222-222222222222'
const INCONNUE = '33333333-3333-4333-8333-333333333333'

const CH_BNA = '11111111-aaaa-4111-8111-111111111111'
const CH_TEST = '22222222-bbbb-4222-8222-222222222222'
// Clé d'une conversation inexistante : force la branche d'INSERT de la note.
const CH_INCONNUE_TEST = '22222222-cccc-4222-8222-2222222222cc'

// Marqueurs de PII : leur présence dans une sortie prouve une fuite.
const PII_BNA = 'PII_BNA_7f3a91'
const PII_TEST = 'PII_TEST_c40d28'

// --- État mutable partagé par le harnais ---

type MiniRow = Record<string, unknown>
type Filtre = { col: string; op: 'eq' | 'is' | 'ilike' | 'in'; val: unknown }
type Exec = {
  verb: 'select' | 'insert' | 'update' | 'delete'
  table: string
  projection: string | null
  filtres: Filtre[]
  row?: MiniRow
}

const etat = vi.hoisted(() => ({
  tables: {} as Record<string, MiniRow[]>,
  execLog: [] as Array<Record<string, unknown>>,
  groqCalls: [] as string[],
  user: null as { app_metadata?: Record<string, unknown> } | null,
  sessionActive: true,
  // Simule un serveur non coopératif : la table est renvoyée en ignorant le
  // filtre `entreprise_id` (défi de la revalidation fail-closed).
  tablesIgnorantLeFiltre: [] as string[],
  // Simule une panne d'écriture sur une table (défi du contrôle d'erreur).
  tablesRefusantInsert: [] as string[],
}))

function reset(): void {
  etat.tables = {
    chantiers: [
      { id: CH_BNA, code_acces: 'CODE-BNA', client_nom: 'CLIENT BNA', entreprise_id: BNA },
      { id: CH_TEST, code_acces: 'CODE-TEST', client_nom: 'CLIENT TEST', entreprise_id: TEST },
    ],
    espace_client_conversations: [
      {
        cle: CH_BNA,
        entreprise_id: BNA,
        client_nom: 'CLIENT BNA',
        messages_session: [
          { role: 'user', content: `${PII_BNA} le client BNA reclame un rendez vous urgent demain matin chantier nord` },
        ],
        resumes_sessions: [],
        resume_global: null,
      },
      {
        cle: CH_TEST,
        entreprise_id: TEST,
        client_nom: 'CLIENT TEST',
        messages_session: [
          { role: 'user', content: `${PII_TEST} le client TEST signale une infiltration d eau signalée par le voisin` },
        ],
        resumes_sessions: [],
        resume_global: null,
      },
    ],
    notes_patron: [
      // Note legacy BNA, sans `espace_client_id` : le balayage legacy ne doit
      // jamais y toucher depuis un tenant TEST.
      { id: 'note-legacy-bna', titre: 'Résumé Espace Web — ancien BNA', contenu: 'historique BNA', entreprise_id: BNA, espace_client_id: null, created_at: '2026-01-01T00:00:00Z' },
      // Note legacy TEST.
      { id: 'note-legacy-test', titre: 'Résumé Espace Web — ancien TEST', contenu: 'historique TEST', entreprise_id: TEST, espace_client_id: null, created_at: '2026-02-01T00:00:00Z' },
    ],
    notifications: [],
    profiles: [
      // Le patron BNA est créé AVANT le patron TEST : sans filtre tenant,
      // `destinatairePatron` l'aurait renvoyé pour un chantier TEST.
      { id: 'patron-bna', full_name: 'Gaël', role: 'admin', created_at: '2026-01-01T00:00:00Z', entreprise_id: BNA },
      { id: 'patron-test', full_name: 'Patron TEST', role: 'admin', created_at: '2026-06-01T00:00:00Z', entreprise_id: TEST },
    ],
  }
  etat.execLog = []
  etat.groqCalls = []
  etat.user = { app_metadata: { entreprise_id: TEST } }
  etat.sessionActive = true
  etat.tablesIgnorantLeFiltre = []
  etat.tablesRefusantInsert = []
}

// --- Mini-PostgREST : applique les filtres, impose entreprise_id NOT NULL ---

const holder = vi.hoisted(() => ({ client: undefined as unknown }))

const delegue = new Proxy(
  {},
  {
    get(_t: {}, cle: string | symbol): unknown {
      if (typeof cle === 'symbol') return undefined
      return (holder.client as Record<string, unknown> | undefined)?.[cle]
    },
  }
)

vi.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: delegue }))

vi.mock('@/lib/auth', () => ({
  verifierSession: async () =>
    etat.sessionActive
      ? { authentifie: true }
      : { authentifie: false, reponse: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: etat.user } }) } }),
}))

class MiniQuery {
  private filtres: Filtre[] = []
  private projection: string | null = null
  private lim: number | null = null
  private tri: { col: string; asc: boolean } | null = null
  private patch: MiniRow | null = null
  private supprimer = false

  constructor(private table: string) {}

  select(cols?: string): this {
    this.projection = cols ?? null
    return this
  }
  eq(col: string, val: unknown): this {
    this.filtres.push({ col, op: 'eq', val })
    return this
  }
  is(col: string, val: unknown): this {
    this.filtres.push({ col, op: 'is', val })
    return this
  }
  ilike(col: string, pattern: string): this {
    this.filtres.push({ col, op: 'ilike', val: pattern })
    return this
  }
  in(col: string, vals: unknown[]): this {
    this.filtres.push({ col, op: 'in', val: vals })
    return this
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.tri = { col, asc: opts?.ascending !== false }
    return this
  }
  limit(n: number): this {
    this.lim = n
    return this
  }
  update(patch: MiniRow): this {
    this.patch = patch
    return this
  }
  delete(): this {
    this.supprimer = true
    return this
  }

  private log(verb: Exec['verb'], filtres: Filtre[], row?: MiniRow): void {
    etat.execLog.push({
      verb,
      table: this.table,
      projection: this.projection,
      filtres,
      row,
    } as unknown as Record<string, unknown>)
  }

  private run(): MiniRow[] {
    const source = etat.tables[this.table] ?? []
    const aveugle = etat.tablesIgnorantLeFiltre.includes(this.table)
    const utiles = aveugle ? this.filtres.filter((f) => f.col !== 'entreprise_id') : this.filtres
    let out = source.filter((r) =>
      utiles.every((f) => {
        if (f.op === 'eq') return r[f.col] === f.val
        if (f.op === 'is') return f.val === null ? r[f.col] == null : r[f.col] === f.val
        if (f.op === 'in') return Array.isArray(f.val) && f.val.includes(r[f.col])
        const re = new RegExp('^' + String(f.val).replaceAll('%', '.*') + '$', 'i')
        return typeof r[f.col] === 'string' && re.test(String(r[f.col]))
      })
    )
    if (this.tri) {
      const { col, asc } = this.tri
      out = [...out].sort((a, b) => {
        const va = String(a[col] ?? '')
        const vb = String(b[col] ?? '')
        return asc ? va.localeCompare(vb) : vb.localeCompare(va)
      })
    }
    if (this.lim !== null) out = out.slice(0, this.lim)
    return out
  }

  then(resolve: (v: { data: MiniRow[] | null; error: { message: string } | null }) => void): void {
    this.log(this.supprimer ? 'delete' : this.patch !== null ? 'update' : 'select', this.filtres)
    const lignes = this.run()
    if (this.supprimer) {
      const ids = new Set(lignes.map((r) => r.id))
      etat.tables[this.table] = (etat.tables[this.table] ?? []).filter((r) => !ids.has(r.id))
      resolve({ data: null, error: null })
      return
    }
    if (this.patch !== null) {
      lignes.forEach((r) => Object.assign(r, this.patch))
      resolve({ data: null, error: null })
      return
    }
    resolve({ data: lignes, error: null })
  }

  async maybeSingle(): Promise<{ data: MiniRow | null; error: { message: string } | null }> {
    this.log('select', this.filtres)
    return { data: this.run()[0] ?? null, error: null }
  }

  async insert(ligne: MiniRow): Promise<{ data: MiniRow | null; error: { message: string } | null }> {
    this.log('insert', this.filtres, ligne)
    // Panne d'écriture simulée : l'INSERT part mais la base refuse.
    if (etat.tablesRefusantInsert.includes(this.table)) {
      return { data: null, error: { message: 'database write failure (simulée)' } }
    }
    // Contrainte réelle : `notes_patron` et `notifications` ont
    // `entreprise_id` NOT NULL et aucun trigger ne le dérive.
    const exigeTenant = this.table === 'notes_patron' || this.table === 'notifications'
    if (exigeTenant && (typeof ligne.entreprise_id !== 'string' || ligne.entreprise_id === '')) {
      return { data: null, error: { message: 'null value in column "entreprise_id" violates not-null constraint' } }
    }
    const maintenue = { id: `gen-${(etat.tables[this.table] ?? []).length + 1}`, created_at: '2026-03-01T00:00:00Z', ...ligne }
    etat.tables[this.table] = [...(etat.tables[this.table] ?? []), maintenue]
    return { data: maintenue, error: null }
  }
}

function installerClient(): void {
  holder.client = {
    from: (table: string) => new MiniQuery(table),
    rpc: async (fn: string) => {
      if (fn === 'espace_client_consolider') return { data: { ok: true }, error: null }
      if (fn === 'espace_client_append') return { data: { ok: true }, error: null }
      return { data: { ok: false, erreur: fn }, error: null }
    },
  }
}

function installerGroq(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('groq.com')) {
      const corps = JSON.parse(String(init?.body)) as { messages?: Array<{ role: string; content: string }> }
      const dernier = [...(corps.messages ?? [])].reverse().find((m) => m.role === 'user')
      const contenu = String(dernier?.content ?? '')
      etat.groqCalls.push(contenu)
      // Le stub reproduit le comportement du vrai Groq sur deux signaux : un
      // client mécontent (sentiment négatif) et une demande de rappel en
      // attente. C'est ce qui déclenche la notification dans le code de prod.
      const colere = contenu.toLowerCase().includes('mécontent')
      const rappel = contenu.toLowerCase().includes('rappel')
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  resume_session: '- session condensée',
                  resume_global: {
                    texte: 'résumé condensé',
                    sentiment_global: colere ? 'negatif' : 'neutre',
                    demandes_en_attente: rappel ? ['Rappeler le client'] : [],
                    points_cles: [],
                  },
                }),
              },
            },
          ],
        }),
        { status: 200 }
      )
    }
    return new Response('{}', { status: 200 })
  }) as typeof fetch
}

// --- Helpers ---

function post(url: string, body: unknown): NextRequest {
  return new NextRequest('http://x' + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function exec(verb: Exec['verb'], table: string): Exec[] {
  return (etat.execLog as unknown as Exec[]).filter((e) => e.verb === verb && e.table === table)
}

function corps(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>
}

const MESSAGES_DEMO = [
  { role: 'user', content: 'le chantier avance bien et le client est satisfait du rendu final' },
]

// =====================================================================
// A. /api/chat-client-summary — le tenant vient du CLAIM de session
// =====================================================================

describe('A. /api/chat-client-summary — tenant issu du claim', () => {
  beforeEach(() => {
    reset()
    installerClient()
    installerGroq()
  })

  it('A1. le tenant du claim est appliqué à la lecture des conversations', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    const { POST } = await import('../app/api/chat-client-summary/route')
    const res = await POST(post('/api/chat-client-summary', { chantierId: CH_TEST, messages: MESSAGES_DEMO }))
    expect(res.status).toBe(200)
    const lecture = exec('select', 'espace_client_conversations')[0]
    expect(lecture).toBeDefined()
    expect(lecture.filtres).toContainEqual({ col: 'entreprise_id', op: 'eq', val: TEST })
  })

  it('A2. un chantierId HOSTILE dans le body ne change pas le tenant', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    const { POST } = await import('../app/api/chat-client-summary/route')
    // `chantierId` pointe la conversation BNA ; le tenant reste TEST.
    const res = await POST(post('/api/chat-client-summary', { chantierId: CH_BNA, messages: MESSAGES_DEMO }))
    const charge = await corps(res)

    const lecture = exec('select', 'espace_client_conversations')[0]
    expect(lecture.filtres).toContainEqual({ col: 'entreprise_id', op: 'eq', val: TEST })
    // Aucune PII BNA ne doit fuiter.
    expect(JSON.stringify(charge)).not.toContain(PII_BNA)
    expect(etat.groqCalls.join(' ')).not.toContain(PII_BNA)
    // Aucune note BNA créée ni modifiée.
    expect(etat.tables.notes_patron.filter((n) => n.entreprise_id === BNA && n.epingle === true)).toHaveLength(0)
  })

  it('A3. entreprise_id non-UUID → 403, et AUCUNE requête émise', async () => {
    etat.user = { app_metadata: { entreprise_id: 'pas-un-uuid' } }
    const { POST } = await import('../app/api/chat-client-summary/route')
    const res = await POST(post('/api/chat-client-summary', { chantierId: CH_BNA, messages: MESSAGES_DEMO }))
    expect(res.status).toBe(403)
    expect(etat.execLog).toHaveLength(0)
    expect(etat.groqCalls).toHaveLength(0)
  })

  it('A4. entreprise_id absent du claim → 403', async () => {
    etat.user = { app_metadata: {} }
    const { POST } = await import('../app/api/chat-client-summary/route')
    const res = await POST(post('/api/chat-client-summary', { messages: MESSAGES_DEMO }))
    expect(res.status).toBe(403)
    expect(etat.execLog).toHaveLength(0)
  })

  it('A5. entreprise_id non-string (null / nombre) → 403', async () => {
    for (const valeur of [null, 42, { a: 1 }, [TEST]]) {
      etat.user = { app_metadata: { entreprise_id: valeur } }
      const { POST } = await import('../app/api/chat-client-summary/route')
      const res = await POST(post('/api/chat-client-summary', { messages: MESSAGES_DEMO }))
      expect(res.status).toBe(403)
    }
    expect(etat.execLog).toHaveLength(0)
  })

  it('A6. le tenant est résolu AVANT la lecture du corps (body piégé sans effet)', async () => {
    etat.user = { app_metadata: {} }
    const { POST } = await import('../app/api/chat-client-summary/route')
    // Corps hostile qui tente d'imposer un tenant.
    const res = await POST(
      post('/api/chat-client-summary', { entrepriseId: BNA, entreprise_id: BNA, chantierId: CH_BNA })
    )
    expect(res.status).toBe(403)
    expect(etat.execLog).toHaveLength(0)
  })

  it('A7. sans session → 401, aucun travail', async () => {
    etat.sessionActive = false
    const { POST } = await import('../app/api/chat-client-summary/route')
    const res = await POST(post('/api/chat-client-summary', { messages: MESSAGES_DEMO }))
    expect(res.status).toBe(401)
    expect(etat.execLog).toHaveLength(0)
  })

  it('A8. un « entrepriseId » hostile dans le body est IGNORÉ (mutation M3)', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    // État BNA de référence (fixture : 1 note legacy BNA, 0 notification).
    const notesBnaAvant = etat.tables.notes_patron.filter((n) => n.entreprise_id === BNA).length
    const notifsBnaAvant = etat.tables.notifications.filter((n) => n.entreprise_id === BNA).length
    const { POST } = await import('../app/api/chat-client-summary/route')
    // Le corps tente d'imposer le tenant BNA par tous les alias possibles.
    const res = await POST(
      post('/api/chat-client-summary', {
        messages: MESSAGES_DEMO,
        chantierId: CH_BNA,
        entrepriseId: BNA,
        entreprise_id: BNA,
        entreprise: BNA,
        client: BNA,
      })
    )
    const charge = await corps(res)

    // Le tenant appliqué reste celui du claim.
    expect(exec('select', 'espace_client_conversations')[0].filtres).toContainEqual({
      col: 'entreprise_id',
      op: 'eq',
      val: TEST,
    })
    // Aucune requête n'est scopée sur le tenant usurpé.
    const faux = (etat.execLog as unknown as Exec[]).filter((e) =>
      e.filtres.some((f) => f.col === 'entreprise_id' && f.val === BNA)
    )
    expect(faux).toHaveLength(0)
    expect(JSON.stringify(charge)).not.toContain(PII_BNA)
    expect(etat.groqCalls.join(' ')).not.toContain(PII_BNA)
    // Aucune écriture nouvelle dans le tenant BNA (la fixture est intacte).
    expect(etat.tables.notes_patron.filter((n) => n.entreprise_id === BNA)).toHaveLength(notesBnaAvant)
    expect(etat.tables.notifications.filter((n) => n.entreprise_id === BNA)).toHaveLength(notifsBnaAvant)
  })
})

// =====================================================================
// B. Route publique — le tenant vient du CHANTIER résolu par code_acces
// =====================================================================

describe('B. /api/espace-client/:code/chat-summary — tenant issu du chantier', () => {
  beforeEach(() => {
    reset()
    installerClient()
    installerGroq()
  })

  it('B1. le tenant appliqué est celui du chantier résolu par code_acces', async () => {
    const { POST } = await import('../app/api/espace-client/[code_acces]/chat-summary/route')
    const res = await POST(post('/api/espace-client/CODE-TEST/chat-summary', { messages: MESSAGES_DEMO }), {
      params: Promise.resolve({ code_acces: 'CODE-TEST' }),
    })
    expect(res.status).toBe(200)
    const lecture = exec('select', 'espace_client_conversations')[0]
    expect(lecture.filtres).toContainEqual({ col: 'entreprise_id', op: 'eq', val: TEST })
  })

  it('B2. un chantier BNA via son code_accès reçoit le tenant BNA', async () => {
    const { POST } = await import('../app/api/espace-client/[code_acces]/chat-summary/route')
    const res = await POST(post('/api/espace-client/CODE-BNA/chat-summary', { messages: MESSAGES_DEMO }), {
      params: Promise.resolve({ code_acces: 'CODE-BNA' }),
    })
    expect(res.status).toBe(200)
    expect(exec('select', 'espace_client_conversations')[0].filtres).toContainEqual({
      col: 'entreprise_id',
      op: 'eq',
      val: BNA,
    })
  })

  it('B3. le body ne peut PAS modifier le tenant', async () => {
    const { POST } = await import('../app/api/espace-client/[code_acces]/chat-summary/route')
    const res = await POST(
      post('/api/espace-client/CODE-TEST/chat-summary', {
        messages: MESSAGES_DEMO,
        entrepriseId: BNA,
        entreprise_id: BNA,
        clientName: 'CLIENT BNA INJECTE',
      }),
      { params: Promise.resolve({ code_acces: 'CODE-TEST' }) }
    )
    const charge = await corps(res)
    expect(exec('select', 'espace_client_conversations')[0].filtres).toContainEqual({
      col: 'entreprise_id',
      op: 'eq',
      val: TEST,
    })
    // Le clientName du chantier prime sur celui du body.
    const note = etat.tables.notes_patron.find((n) => n.epingle === true)
    expect(String(note?.contenu ?? '')).not.toContain('CLIENT BNA INJECTE')
    expect(JSON.stringify(charge)).not.toContain(PII_BNA)
  })

  it('B4. code d\'accès inconnu → 403 générique, aucun travail', async () => {
    const { POST } = await import('../app/api/espace-client/[code_acces]/chat-summary/route')
    const res = await POST(post('/api/espace-client/INCONNU/chat-summary', { messages: MESSAGES_DEMO }), {
      params: Promise.resolve({ code_acces: 'INCONNU' }),
    })
    expect(res.status).toBe(403)
    expect(etat.execLog.filter((e) => (e as unknown as Exec).table === 'espace_client_conversations')).toHaveLength(0)
  })

  it('B5. chantier SANS entreprise_id exploitable → 403 identique au code inconnu', async () => {
    etat.tables.chantiers = [{ id: CH_BNA, code_acces: 'CODE-ORPHELIN', client_nom: 'X', entreprise_id: null }]
    const { POST } = await import('../app/api/espace-client/[code_acces]/chat-summary/route')
    const res = await POST(post('/api/espace-client/CODE-ORPHELIN/chat-summary', { messages: MESSAGES_DEMO }), {
      params: Promise.resolve({ code_acces: 'CODE-ORPHELIN' }),
    })
    expect(res.status).toBe(403)
    expect((await corps(res)).error).toBe("Code d'accès invalide")
  })
})

// =====================================================================
// C. Isolation effective — dans les deux sens
// =====================================================================

describe('C. Cloisonnement effectif des conversations', () => {
  beforeEach(() => {
    reset()
    installerClient()
    installerGroq()
  })

  it('C1. un tenant TEST ne charge JAMAIS la conversation BNA (clé étrangère)', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    const { POST } = await import('../app/api/chat-client-summary/route')
    const res = await POST(post('/api/chat-client-summary', { chantierId: CH_BNA, messages: MESSAGES_DEMO }))
    const charge = await corps(res)

    expect(JSON.stringify(charge)).not.toContain(PII_BNA)
    expect(etat.groqCalls.join(' ')).not.toContain(PII_BNA)
    // Le résumé produit ne provient que des messages postés par l'appelant.
    expect(etat.groqCalls.join(' ')).toContain('le chantier avance bien')
  })

  it('C2. un tenant BNA ne charge JAMAIS la conversation TEST', async () => {
    etat.user = { app_metadata: { entreprise_id: BNA } }
    const { POST } = await import('../app/api/chat-client-summary/route')
    const res = await POST(post('/api/chat-client-summary', { chantierId: CH_TEST, messages: MESSAGES_DEMO }))
    const charge = await corps(res)

    expect(JSON.stringify(charge)).not.toContain(PII_TEST)
    expect(etat.groqCalls.join(' ')).not.toContain(PII_TEST)
  })

  it('C3. le balayage legacy ne touche que les notes du tenant courant', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    const { POST } = await import('../app/api/chat-client-summary/route')
    await POST(post('/api/chat-client-summary', { chantierId: CH_TEST, messages: MESSAGES_DEMO }))

    const legacy = exec('select', 'notes_patron').filter((e) => e.filtres.some((f) => f.op === 'ilike'))
    expect(legacy.length).toBeGreaterThan(0)
    for (const e of legacy) {
      expect(e.filtres).toContainEqual({ col: 'entreprise_id', op: 'eq', val: TEST })
    }
    // La note legacy BNA n'est ni supprimée, ni adoptée.
    const bna = etat.tables.notes_patron.find((n) => n.id === 'note-legacy-bna')
    expect(bna?.espace_client_id).toBeNull()
    // La note legacy TEST, elle, a été adoptée.
    const test = etat.tables.notes_patron.find((n) => n.id === 'note-legacy-test')
    expect(test?.espace_client_id).toBe(CH_TEST)
  })
})

// =====================================================================
// D. Destinataire de la notification
// =====================================================================

describe('D. destinatairePatron — strictement intra-entreprise', () => {
  beforeEach(() => {
    reset()
    installerClient()
    installerGroq()
  })

  it('D1. la lecture des profils est scopée par entreprise_id', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    const { POST } = await import('../app/api/chat-client-summary/route')
    await POST(post('/api/chat-client-summary', { chantierId: CH_TEST, messages: MESSAGES_DEMO }))
    const lecture = exec('select', 'profiles')[0]
    expect(lecture).toBeDefined()
    expect(lecture.filtres).toContainEqual({ col: 'entreprise_id', op: 'eq', val: TEST })
  })

  it('D2. un chantier TEST notifie le patron TEST, jamais le patron BNA', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    // Sentiment négatif + demande en attente → une notification est émise.
    etat.tables.espace_client_conversations[1].messages_session = [
      { role: 'user', content: `${PII_TEST} le client TEST est très mécontent du retard et exige un rappel` },
    ]
    const { POST } = await import('../app/api/chat-client-summary/route')
    await POST(post('/api/chat-client-summary', { chantierId: CH_TEST, messages: MESSAGES_DEMO }))

    const notifs = etat.tables.notifications.filter((n) => n.type === 'client_alert')
    expect(notifs.length).toBeGreaterThan(0)
    for (const n of notifs) {
      expect(n.destinataire_id).toBe('patron-test')
      expect(n.entreprise_id).toBe(TEST)
    }
  })

  it('D3. un chantier BNA notifie le patron BNA', async () => {
    etat.user = { app_metadata: { entreprise_id: BNA } }
    etat.tables.espace_client_conversations[0].messages_session = [
      { role: 'user', content: `${PII_BNA} le client BNA est très mécontent du rendu et exige un rappel` },
    ]
    const { POST } = await import('../app/api/chat-client-summary/route')
    await POST(post('/api/chat-client-summary', { chantierId: CH_BNA, messages: MESSAGES_DEMO }))

    const notifs = etat.tables.notifications.filter((n) => n.type === 'client_alert')
    expect(notifs.length).toBeGreaterThan(0)
    for (const n of notifs) expect(n.destinataire_id).toBe('patron-bna')
  })
})

// =====================================================================
// E. Preuves de scoping au niveau des requêtes
// =====================================================================

describe('E. Scoping des requêtes et projections', () => {
  beforeEach(() => {
    reset()
    installerClient()
    installerGroq()
  })

  it('E1. chaque lecture tenant-sensitive porte .eq("entreprise_id", …)', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    const { POST } = await import('../app/api/chat-client-summary/route')
    await POST(post('/api/chat-client-summary', { chantierId: CH_TEST, messages: MESSAGES_DEMO }))

    for (const table of ['espace_client_conversations', 'notes_patron', 'profiles']) {
      const lectures = exec('select', table)
      expect(lectures.length).toBeGreaterThan(0)
      for (const e of lectures) {
        expect(e.filtres).toContainEqual({ col: 'entreprise_id', op: 'eq', val: TEST })
      }
    }
  })

  it('E2. entreprise_id figure dans les projections lues pour revalidation', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    const { POST } = await import('../app/api/chat-client-summary/route')
    await POST(post('/api/chat-client-summary', { chantierId: CH_TEST, messages: MESSAGES_DEMO }))

    for (const table of ['espace_client_conversations', 'notes_patron', 'profiles']) {
      const e = exec('select', table)[0]
      expect(String(e.projection)).toContain('entreprise_id')
    }
  })

  it('E3. les UPDATE/DELETE de notes portent le couple (identifiant, entreprise_id)', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    const { POST } = await import('../app/api/chat-client-summary/route')
    // Deux notes legacy TEST ⇒ suppression de l'ancienne + adoption de la récente.
    etat.tables.notes_patron.push({
      id: 'note-legacy-test-2',
      titre: 'Résumé Espace Web — encore TEST',
      contenu: 'ancien',
      entreprise_id: TEST,
      espace_client_id: null,
      created_at: '2026-01-15T00:00:00Z',
    })
    await POST(post('/api/chat-client-summary', { chantierId: CH_TEST, messages: MESSAGES_DEMO }))

    for (const verb of ['update', 'delete'] as const) {
      const e = exec(verb, 'notes_patron')[0]
      expect(e).toBeDefined()
      expect(e.filtres).toContainEqual({ col: 'entreprise_id', op: 'eq', val: TEST })
    }
  })
})

// =====================================================================
// F. INSERTs — entreprise_id présent, erreurs contrôlées
// =====================================================================

describe('F. Écritures — entreprise_id explicite et erreurs contrôlées', () => {
  beforeEach(() => {
    reset()
    installerClient()
    installerGroq()
  })

  it('F1. la note créée porte entreprise_id du tenant', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    // Aucune note préexistante ⇒ branche INSERT (pas d'adoption legacy).
    etat.tables.notes_patron = []
    const { POST } = await import('../app/api/chat-client-summary/route')
    await POST(post('/api/chat-client-summary', { chantierId: CH_INCONNUE_TEST, messages: MESSAGES_DEMO }))

    const insert = exec('insert', 'notes_patron')[0]
    expect(insert).toBeDefined()
    expect(insert.row?.entreprise_id).toBe(TEST)
    expect(etat.tables.notes_patron.find((n) => n.epingle === true)?.entreprise_id).toBe(TEST)
  })

  it('F2. la notification créée porte entreprise_id du tenant', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    etat.tables.espace_client_conversations[1].messages_session = [
      { role: 'user', content: `${PII_TEST} le client TEST est très mécontent et exige un rappel urgent` },
    ]
    const { POST } = await import('../app/api/chat-client-summary/route')
    await POST(post('/api/chat-client-summary', { chantierId: CH_TEST, messages: MESSAGES_DEMO }))

    const insert = exec('insert', 'notifications')[0]
    expect(insert).toBeDefined()
    expect(insert.row?.entreprise_id).toBe(TEST)
  })

  it('F3. un INSERT sans entreprise_id (NOT NULL) ne peut pas aboutir en 200 silencieux', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    etat.tables.notes_patron = []
    const { POST } = await import('../app/api/chat-client-summary/route')
    // Le mock applique la contrainte NOT NULL de la production. Si le code
    // rectifié ne portait pas l'entreprise, l'INSERT serait refusé : la route ne
    // doit PAS annoncer `alert_created` dans ce cas, et surtout pas le faire
    // silencieusement. Deux issues admissibles : réussite (écriture correcte) ou
    // refus franc (échec détecté) — jamais un succès mensonger sans note.
    const res = await POST(post('/api/chat-client-summary', { chantierId: CH_INCONNUE_TEST, messages: MESSAGES_DEMO }))
    const charge = await corps(res)

    const noteEcrite = etat.tables.notes_patron.some((n) => n.epingle === true)
    if (charge.status === 'alert_created') {
      // Annoncer une alerte n'a de sens que si la note existe réellement.
      expect(noteEcrite).toBe(true)
      expect(res.status).toBe(200)
    } else {
      expect(res.status).toBe(500)
      expect(noteEcrite).toBe(false)
    }
  })

  it('F4. le corps 500 ne fuit aucun détail interne', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    etat.tablesIgnorantLeFiltre = ['notes_patron']
    const { POST } = await import('../app/api/chat-client-summary/route')
    const res = await POST(post('/api/chat-client-summary', { chantierId: CH_TEST, messages: MESSAGES_DEMO }))
    expect(res.status).toBe(500)
    const charge = await corps(res)
    expect(Object.keys(charge)).toEqual(['error'])
    expect(JSON.stringify(charge)).not.toContain(PII_BNA)
    expect(JSON.stringify(charge)).not.toContain('Incohérence')
  })

  it('F5. panne d\'écriture de la NOTE → 500, jamais alert_created (mutation M7)', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    etat.tables.notes_patron = []
    etat.tablesRefusantInsert = ['notes_patron']
    const { POST } = await import('../app/api/chat-client-summary/route')
    const res = await POST(post('/api/chat-client-summary', { chantierId: CH_INCONNUE_TEST, messages: MESSAGES_DEMO }))
    const charge = await corps(res)

    expect(res.status).toBe(500)
    expect(charge.status).toBeUndefined()
    expect(charge.resume).toBeUndefined()
    expect(Object.keys(charge)).toEqual(['error'])
    // Aucune notification ne doit partir non plus : on s'arrête sur l'échec.
    expect(etat.tables.notifications).toHaveLength(0)
  })

  it('F6. panne d\'écriture de la NOTIFICATION → 500, jamais alert_created (mutation M7)', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    etat.tables.espace_client_conversations[1].messages_session = [
      { role: 'user', content: `${PII_TEST} le client TEST est très mécontent et exige un rappel urgent` },
    ]
    etat.tablesRefusantInsert = ['notifications']
    const { POST } = await import('../app/api/chat-client-summary/route')
    const res = await POST(post('/api/chat-client-summary', { chantierId: CH_TEST, messages: MESSAGES_DEMO }))
    const charge = await corps(res)

    // La note, elle, a bien pu être écrite : seule l'alerte a échoué.
    expect(etat.tables.notes_patron.some((n) => n.epingle === true)).toBe(true)
    // Mais on n'annonce PAS une alerte créée.
    expect(res.status).toBe(500)
    expect(charge.status).toBeUndefined()
    expect(Object.keys(charge)).toEqual(['error'])
    expect(JSON.stringify(charge)).not.toContain('write failure')
  })
})

// =====================================================================
// G. Fail-closed
// =====================================================================

describe('G. Fail-closed', () => {
  beforeEach(() => {
    reset()
    installerClient()
    installerGroq()
  })

  it('G1. entrepriseId invalide passé AU CŒUR → refus, aucune requête, aucun Groq', async () => {
    const { traiterConsolidation } = await import('../lib/espace-chat-summary.server')
    for (const invalide of ['', ' ', 'pas-un-uuid', '11111111-1111-4111-8111', null as unknown as string, undefined as unknown as string]) {
      await expect(traiterConsolidation({ chantierId: CH_BNA, messages: MESSAGES_DEMO }, invalide)).rejects.toThrow(
        /Contexte entreprise invalide/
      )
    }
    expect(etat.execLog).toHaveLength(0)
    expect(etat.groqCalls).toHaveLength(0)
  })

  it('G2. serveur non coopératif : ligne hors entreprise sur les conversations → refus', async () => {
    // La table est renvoyée en ignorant le filtre : seule la revalidation
    // fail-closed peut encore arrêter la fuite.
    etat.tablesIgnorantLeFiltre = ['espace_client_conversations']
    const { traiterConsolidation } = await import('../lib/espace-chat-summary.server')
    await expect(traiterConsolidation({ chantierId: CH_BNA, messages: MESSAGES_DEMO }, TEST)).rejects.toThrow(
      /Incoherence|Incohérence/
    )
    expect(etat.groqCalls).toHaveLength(0)
  })

  it('G3. serveur non coopératif : note hors entreprise → refus', async () => {
    etat.tablesIgnorantLeFiltre = ['notes_patron']
    const { traiterConsolidation } = await import('../lib/espace-chat-summary.server')
    await expect(traiterConsolidation({ chantierId: CH_TEST, messages: MESSAGES_DEMO }, TEST)).rejects.toThrow(
      /Incoherence|Incohérence/
    )
  })

  it('G4. serveur non coopératif : profil hors entreprise → refus', async () => {
    etat.tablesIgnorantLeFiltre = ['profiles']
    const { traiterConsolidation } = await import('../lib/espace-chat-summary.server')
    await expect(traiterConsolidation({ chantierId: CH_TEST, messages: MESSAGES_DEMO }, TEST)).rejects.toThrow(
      /Incoherence|Incohérence/
    )
  })

  it('G5. une ligne sans entreprise_id est refusée (null ≠ tenant attendu)', async () => {
    etat.tables.espace_client_conversations = [
      { cle: CH_TEST, entreprise_id: null, messages_session: [{ role: 'user', content: `${PII_TEST} donnee sans entreprise` }] },
    ]
    etat.tablesIgnorantLeFiltre = ['espace_client_conversations']
    const { traiterConsolidation } = await import('../lib/espace-chat-summary.server')
    await expect(traiterConsolidation({ chantierId: CH_TEST, messages: MESSAGES_DEMO }, TEST)).rejects.toThrow(
      /Incoherence|Incohérence/
    )
    expect(etat.groqCalls).toHaveLength(0)
  })

  it('G6. aucune donnée étrangère n\'atteint Groq, même en cas de fuite de filtre', async () => {
    etat.user = { app_metadata: { entreprise_id: TEST } }
    etat.tablesIgnorantLeFiltre = ['espace_client_conversations']
    const { POST } = await import('../app/api/chat-client-summary/route')
    const res = await POST(post('/api/chat-client-summary', { chantierId: CH_BNA, messages: MESSAGES_DEMO }))
    expect(res.status).toBe(500)
    expect(etat.groqCalls).toHaveLength(0)
  })

  it('G7. un tenant inconnu mais valide ne charge rien', async () => {
    etat.user = { app_metadata: { entreprise_id: INCONNUE } }
    const { POST } = await import('../app/api/chat-client-summary/route')
    const res = await POST(post('/api/chat-client-summary', { chantierId: CH_BNA, messages: MESSAGES_DEMO }))
    const charge = await corps(res)
    expect(res.status).toBe(200)
    expect(JSON.stringify(charge)).not.toContain(PII_BNA)
    expect(etat.tables.notes_patron.every((n) => n.entreprise_id === INCONNUE || n.entreprise_id === BNA || n.entreprise_id === TEST)).toBe(true)
  })
})
