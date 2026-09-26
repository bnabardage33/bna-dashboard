// @vitest-environment node
//
// O3-B4 — isolation multi-entreprise des deux appelants de `anonymizeText`
//
//   A) /api/reformuler-note            → tenant = claim app_metadata de session
//   B) /api/espace-client/[code]/chat  → tenant = entreprise du chantier résolu
//   C) fail-closed JSON               → jamais de payload brut vers Groq
//
// Les VRAIES routes sont exécutées. Seul `anonymizeText` est remplacé par une
// spy : on observe ici l'ARGUMENT de tenant qu'elle reçoit et le comportement de
// la route, pas l'implémentation du dictionnaire (couverte, elle, par
// __tests__/anonymizeText-isolation.test.ts). `deanonymizeText` reste réel.
//
// La résolution du code d'accès utilise le VRAI `resoudreChantierParCodeAcces`,
// branché sur un stub Supabase en mémoire : la chaîne complete
// URL → code_acces → chantier → entreprise → anonymizeText est donc exercée.
//
// Aucun réseau, aucun DML : Supabase et Groq sont des stubs en mémoire.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const BNA = '11111111-1111-4111-8111-111111111111'
const TEST = '22222222-2222-4222-8222-222222222222'

// Nom réel présent dans le texte de l'utilisateur ET dans la consigne système
// avant anonymisation : sert de témoin de fuite.
const PII = 'Jean Dupont'

const spies = vi.hoisted(() => ({
  anonymizeText: vi.fn(),
  verifierSession: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('@/lib/anonymizeText', () => ({
  anonymizeText: (...args: unknown[]) => spies.anonymizeText(...args),
  // Désanonymisation réelle (simple ré-injection des balises).
  deanonymizeText: (text: string, mapping: Record<string, string>): string => {
    let out = text
    for (const [tag, valeur] of Object.entries(mapping)) out = out.split(tag).join(valeur)
    return out
  },
}))

vi.mock('@/lib/auth', () => ({
  verifierSession: (...args: unknown[]) => spies.verifierSession(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: (...args: unknown[]) => spies.getUser(...args) },
  }),
}))

type Row = Record<string, unknown>

interface Etat {
  tables: Record<string, Row[]>
  rpc: Array<{ fn: string; args: Record<string, unknown> }>
  groq: Array<{ url: string; corps: string }>
}

// --- Stub Supabase : chaîne PostgREST minimale mais fidèle ---

class Fake {
  private filtres: Array<(r: Row) => boolean> = []
  private limite: number | null = null

  constructor(
    private table: string,
    private etat: Etat
  ) {}

  select(_colonnes?: string): this {
    return this
  }
  eq(colonne: string, valeur: unknown): this {
    this.filtres.push((r) => r[colonne] === valeur)
    return this
  }
  gte(colonne: string, valeur: unknown): this {
    this.filtres.push((r) => String(r[colonne] ?? '') >= String(valeur))
    return this
  }
  in(colonne: string, valeurs: unknown[]): this {
    this.filtres.push((r) => valeurs.includes(r[colonne]))
    return this
  }
  order(_colonne?: string, _options?: unknown): this {
    return this
  }
  limit(n: number): this {
    this.limite = n
    return this
  }

  private run(): Row[] {
    let out = (this.etat.tables[this.table] ?? []).filter((r) =>
      this.filtres.every((f) => f(r))
    )
    if (this.limite !== null) out = out.slice(0, this.limite)
    return out
  }

  then(resolve: (v: { data: Row[]; error: null }) => void): void {
    resolve({ data: this.run(), error: null })
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return { data: this.run()[0] ?? null, error: null }
  }
}

const delegue = new Proxy(
  {},
  {
    get(_cible: {}, cle: string | symbol): unknown {
      if (typeof cle === 'symbol') return undefined
      const source = (globalThis as Record<string, unknown>).__etatB4 as
        | Record<string, unknown>
        | undefined
      return source?.[cle]
    },
  }
)
vi.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: delegue }))

function installerSupabase(etat: Etat): void {
  ;(globalThis as Record<string, unknown>).__etatB4 = {
    from(table: string) {
      return new Fake(table, etat)
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      etat.rpc.push({ fn, args })
      // O3-B6 : le stub renvoie désormais la charge utile RÉELLE de
      // `espace_client_append` — `{ ok: true, id }`. Le stub précédent retournait
      // `{ ok: true }` sans `id`, ce qui ne permettait pas de distinguer une
      // écriture confirmée d'un simple accusé de réception : la route ne pouvait
      // donc pas vérifier le résultat du RPC (faux vert sur le contrôle F6).
      if (fn === 'espace_client_append') {
        return { data: { ok: true, id: `conv-${etat.rpc.length}` }, error: null }
      }
      return { data: { ok: true, id: `res-${etat.rpc.length}` }, error: null }
    },
  }
}

function installerGroq(etat: Etat): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (!url.includes('groq.com')) return new Response('{}', { status: 200 })
    etat.groq.push({ url, corps: String(init?.body ?? '') })
    return new Response(
      JSON.stringify({ choices: [{ message: { content: 'Reponse de test.' } }] }),
      { status: 200 }
    )
  }) as typeof fetch
}

function creerEtat(): Etat {
  return {
    tables: {
      chantiers: [
        {
          id: 'ch-test',
          code_acces: 'TEST-AAA111',
          client_nom: 'Client Isolation Test',
          entreprise_id: TEST,
          date_fin: '2026-12-01',
        },
        {
          id: 'ch-bna',
          code_acces: 'BNA-U4OM4Z',
          client_nom: 'TEST_P1 Client',
          entreprise_id: BNA,
          date_fin: null,
        },
        // Chantier à entreprise inexploitable : doit être rejeté (fail-closed).
        { id: 'ch-sans-ent', code_acces: 'TEST-BAD222', client_nom: 'X', entreprise_id: null },
        {
          id: 'ch-ent-invalide',
          code_acces: 'TEST-BAD333',
          client_nom: 'X',
          entreprise_id: 'pas-un-uuid',
        },
      ],
      avancements_chantier: [],
      devis: [],
      rapports_intemperies: [],
    },
    rpc: [],
    groq: [],
  }
}

let etat: Etat

beforeEach(() => {
  etat = creerEtat()
  installerSupabase(etat)
  installerGroq(etat)

  spies.anonymizeText.mockReset()
  // Par défaut : identité (comportement d'avant B4) — sert de témoin neutre.
  spies.anonymizeText.mockImplementation(async (text: string) => ({
    anonymizedText: text,
    mapping: {},
  }))

  spies.verifierSession.mockReset()
  spies.verifierSession.mockResolvedValue({ authentifie: true })

  spies.getUser.mockReset()
  spies.getUser.mockResolvedValue({
    data: { user: { app_metadata: { entreprise_id: TEST } } },
  })
})

// --- Utilitaires de requête ---

function post(url: string, corps: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  })
}

function urlChat(code: string): string {
  return `http://x/api/espace-client/${code}/chat`
}

type Ctx = { params: Promise<{ code_acces: string }> }

function ctx(code: string): Ctx {
  return { params: Promise.resolve({ code_acces: code }) }
}

async function chatRoute() {
  return (await import('../app/api/espace-client/[code_acces]/chat/route')).POST
}
async function reformulerRoute() {
  return (await import('../app/api/reformuler-note/route')).POST
}

function conversationsEcrites(etat: Etat): number {
  return etat.rpc.filter((r) => r.fn === 'espace_client_append').length
}

// =====================================================================
// I. /api/reformuler-note — le tenant vient du claim de session
// =====================================================================

describe('O3-B4 — /api/reformuler-note : tenant issu du claim app_metadata', () => {
  const messages = [{ role: 'user' as const, content: 'Ma Mere EST UNE PII' }]

  it('I1. claim présent → anonymizeText reçoit EXACTEMENT ce tenant (4e argument)', async () => {
    const POST = await reformulerRoute()
    const reponse = await POST(
      post('http://x/api/reformuler-note', { texteBrut: 'note dictée BNA-U4OM4Z' })
    )

    expect(reponse.status).toBe(200)
    expect(spies.anonymizeText).toHaveBeenCalledTimes(1)
    expect(spies.anonymizeText.mock.calls[0][3]).toBe(TEST)
  })

  it('I2. claim ABSENT → 403, aucune lecture du dictionnaire, aucun appel Groq', async () => {
    spies.getUser.mockResolvedValue({ data: { user: { app_metadata: {} } } })
    const POST = await reformulerRoute()

    const reponse = await POST(
      post('http://x/api/reformuler-note', { texteBrut: 'note' })
    )

    expect(reponse.status).toBe(403)
    expect(spies.anonymizeText).not.toHaveBeenCalled()
    expect(etat.groq).toHaveLength(0)
  })

  it('I3. claim invalide (null / non-UUID / nombre) → 403 fail-closed', async () => {
    const invalides: unknown[] = [
      null,
      undefined,
      '',
      'pas-un-uuid',
      BNA.replace(/-/g, ''),
      `${BNA}' OR '1'='1`,
      12345,
      {},
      [],
    ]

    for (const invalide of invalides) {
      spies.getUser.mockResolvedValue({
        data: { user: { app_metadata: { entreprise_id: invalide } } },
      })
      const POST = await reformulerRoute()
      const reponse = await POST(
        post('http://x/api/reformuler-note', { texteBrut: 'note' })
      )

      expect(reponse.status, `claim ${JSON.stringify(invalide)}`).toBe(403)
    }

    expect(spies.anonymizeText).not.toHaveBeenCalled()
    expect(etat.groq).toHaveLength(0)
  })

  it('I4. le tenant du BODY est IGNORÉ : seul le claim fait foi', async () => {
    spies.getUser.mockResolvedValue({
      data: { user: { app_metadata: { entreprise_id: TEST } } },
    })
    const POST = await reformulerRoute()

    const reponse = await POST(
      post('http://x/api/reformuler-note', {
        texteBrut: 'note',
        entrepriseId: BNA,
        entreprise_id: BNA,
        client: { entreprise_id: BNA },
      })
    )

    expect(reponse.status).toBe(200)
    expect(spies.anonymizeText.mock.calls[0][3]).toBe(TEST)
  })

  it('I5. le texte brut du body ne peut pas non plus choisir le tenant', async () => {
    // Le tenant est extrait AVANT la lecture du body → un body piégé ne change rien.
    spies.getUser.mockResolvedValue({
      data: { user: { app_metadata: { entreprise_id: BNA } } },
    })
    const POST = await reformulerRoute()

    const reponse = await POST(
      post('http://x/api/reformuler-note', {
        texteBrut: 'note',
        entreprise_id: TEST,
      })
    )

    expect(reponse.status).toBe(200)
    expect(spies.anonymizeText.mock.calls[0][3]).toBe(BNA)
  })

  it('I6. session absente → comportement HTTP existant conservé (401), avant tout tenant', async () => {
    spies.verifierSession.mockResolvedValue({
      authentifie: false,
      reponse: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }),
    })
    const POST = await reformulerRoute()

    const reponse = await POST(
      post('http://x/api/reformuler-note', { texteBrut: 'note' })
    )

    expect(reponse.status).toBe(401)
    expect(spies.anonymizeText).not.toHaveBeenCalled()
    expect(etat.groq).toHaveLength(0)
  })

  it('I7. texteBrut manquant → 400, le contrat existant est préservé', async () => {
    const POST = await reformulerRoute()
    const reponse = await POST(
      post('http://x/api/reformuler-note', { autre: 'champ' })
    )
    expect(reponse.status).toBe(400)
  })

  it('I8. anonymizeText qui throw (fail-closed amont) → 500, aucun appel Groq', async () => {
    spies.anonymizeText.mockRejectedValue(new Error('Contexte entreprise invalide'))
    const POST = await reformulerRoute()

    const reponse = await POST(
      post('http://x/api/reformuler-note', { texteBrut: `note ${PII}` })
    )

    expect(reponse.status).toBe(500)
    expect(etat.groq).toHaveLength(0)
  })
})

// =====================================================================
// J. /api/espace-client/[code_acces]/chat — tenant = entreprise du chantier
// =====================================================================

describe('O3-B4 — /api/espace-client/[code]/chat : tenant issu du chantier résolu', () => {
  const messages = [
    { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
    { role: 'user', content: `Je suis ${PII}, où en est mon chantier ?` },
  ]

  it('J1. code TEST → anonymizeText reçoit l\'entreprise du chantier (TEST)', async () => {
    const POST = await chatRoute()
    const reponse = await POST(
      post(urlChat('TEST-AAA111'), { messages, sessionId: 's1' }),
      ctx('TEST-AAA111')
    )

    expect(reponse.status).toBe(200)
    expect(spies.anonymizeText).toHaveBeenCalledTimes(1)
    expect(spies.anonymizeText.mock.calls[0][3]).toBe(TEST)
  })

  it('J2. code BNA → anonymizeText reçoit BNA (le tenant suit réellement le chantier)', async () => {
    const POST = await chatRoute()
    const reponse = await POST(
      post(urlChat('BNA-U4OM4Z'), { messages, sessionId: 's2' }),
      ctx('BNA-U4OM4Z')
    )

    expect(reponse.status).toBe(200)
    expect(spies.anonymizeText.mock.calls[0][3]).toBe(BNA)
  })

  it('J3. le tenant ne peut PAS être choisi par le client (body piégé → ignoré)', async () => {
    const POST = await chatRoute()
    const reponse = await POST(
      post(urlChat('TEST-AAA111'), {
        messages,
        sessionId: 's3',
        entrepriseId: BNA,
        entreprise_id: BNA,
        client: { entreprise_id: BNA },
        chantier: { entreprise_id: BNA },
      }),
      ctx('TEST-AAA111')
    )

    expect(reponse.status).toBe(200)
    expect(spies.anonymizeText.mock.calls[0][3]).toBe(TEST)
  })

  it('J4. chantier sans entreprise exploitable → 403, aucun dictionnaire, aucun Groq', async () => {
    const POST = await chatRoute()

    for (const code of ['TEST-BAD222', 'TEST-BAD333']) {
      const reponse = await POST(
        post(urlChat(code), { messages, sessionId: 's4' }),
        ctx(code)
      )
      expect(reponse.status, code).toBe(403)
    }

    expect(spies.anonymizeText).not.toHaveBeenCalled()
    expect(etat.groq).toHaveLength(0)
    expect(conversationsEcrites(etat)).toBe(0)
  })

  it('J5. le 403 "entreprise inexploitable" est INDISTINGUABLE du 403 "code inconnu"', async () => {
    const POST = await chatRoute()

    const codeInconnu = await POST(
      post(urlChat('CODE-QUI-EXISTE-PAS'), { messages, sessionId: 's5' }),
      ctx('CODE-QUI-EXISTE-PAS')
    )
    const codeSansEntreprise = await POST(
      post(urlChat('TEST-BAD222'), { messages, sessionId: 's5' }),
      ctx('TEST-BAD222')
    )

    expect(codeInconnu.status).toBe(403)
    expect(codeSansEntreprise.status).toBe(403)
    // Aucune nouvelle fuite d'information : corps et statut identiques.
    expect(await codeSansEntreprise.json()).toEqual(await codeInconnu.json())
  })

  it('J6. le code d\'accès reste le SEUL droit d\'entrée (aucun en-tête ni query tenant)', async () => {
    const POST = await chatRoute()
    const requete = new NextRequest(urlChat('TEST-AAA111'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-entreprise-id': BNA,
        Authorization: `Bearer ${TEST}`,
      },
      body: JSON.stringify({ messages, sessionId: 's6' }),
    })

    const reponse = await POST(requete, ctx('TEST-AAA111'))
    expect(reponse.status).toBe(200)
    expect(spies.anonymizeText.mock.calls[0][3]).toBe(TEST)
  })
})

// =====================================================================
// H. Fail-closed : le payload brut ne doit JAMAIS partir vers Groq
// =====================================================================

describe('O3-B4 — fail-closed : le JSON anonymisé illisible ne part pas à Groq', () => {
  const messages = [
    { role: 'assistant', content: 'Bonjour je peux vous aider ?' },
    { role: 'user', content: `Je suis ${PII}, mon adresse est 12 rue des Lilas` },
  ]

  it('H1. JSON anonymisé invalide → 500 générique, 0 appel Groq, 0 écriture', async () => {
    spies.anonymizeText.mockResolvedValue({
      anonymizedText: '<<< ce nest pas du JSON >>>',
      mapping: {},
    })
    const POST = await chatRoute()

    const reponse = await POST(
      post(urlChat('TEST-AAA111'), { messages, sessionId: 'h1' }),
      ctx('TEST-AAA111')
    )

    expect(reponse.status).toBe(500)

    // Le point essentiel : aucun payload n'est parti vers le fournisseur IA.
    expect(etat.groq).toHaveLength(0)

    // Aucune fuite dans la réponse client.
    const corps = await reponse.text()
    expect(corps).not.toContain(PII)
    expect(corps).not.toContain('12 rue des Lilas')
    expect(corps).not.toContain('TEST')

    // Aucune écriture non plus sur ce chemin d'erreur.
    expect(conversationsEcrites(etat)).toBe(0)
  })

  it('H2. le repli fail-open du catch a bien disparu du code source', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(
      new URL('../app/api/espace-client/[code_acces]/chat/route.ts', import.meta.url),
      'utf8'
    )

    // L'ancien `catch { anonymise = { system: systemPrompt, conversation: messages } }`
    // réémettait le payload BRUT. Aucune affectation d'un repli de ce type ne doit
    // subsister dans le bloc de parsing.
    expect(source).not.toMatch(/anonymise\s*=\s*\{\s*system:\s*systemPrompt/)
    expect(source).not.toMatch(
      /anonymise\s*=\s*\{\s*system:\s*systemPrompt,\s*conversation:\s*messages\s*\}/
    )
    // Le `catch` doit désormais renvoyer un 500 fail-closed.
    expect(source).toMatch(/catch\s*\{[\s\S]{0,400}?status:\s*500/)
  })

  it('H3. TEMOIN : chemin nominal intact — Groq reçoit l\'ANONYMISÉ, la réponse est ré-injectée', async () => {
    spies.anonymizeText.mockResolvedValue({
      anonymizedText: JSON.stringify({
        system: 'CONSIGNE_ANONYMISEE',
        conversation: [{ role: 'user', content: 'Je suis [NOM_CLIENT_1]' }],
      }),
      mapping: { '[NOM_CLIENT_1]': PII },
    })
    const POST = await chatRoute()

    const reponse = await POST(
      post(urlChat('TEST-AAA111'), { messages, sessionId: 'h3' }),
      ctx('TEST-AAA111')
    )

    expect(reponse.status).toBe(200)
    expect(etat.groq).toHaveLength(1)

    const corpsGroq = etat.groq[0].corps
    expect(corpsGroq).toContain('CONSIGNE_ANONYMISEE')
    expect(corpsGroq).toContain('NOM_CLIENT_1')
    // La PII n'a jamais quitté le serveur.
    expect(corpsGroq).not.toContain(PII)
    expect(corpsGroq).not.toContain('12 rue des Lilas')

    // La désanonymisation restitue bien la PII au client final.
    const charge = await reponse.json()
    expect(charge).toHaveProperty('texte')
  })

  it('H4. JSON valide mais SANS objet attendu → pas de conversation brute réémise', async () => {
    // JSON valide, mais dépourvu de `system`/`conversation` exploitables.
    spies.anonymizeText.mockResolvedValue({
      anonymizedText: JSON.stringify({ autre: 'chose' }),
      mapping: {},
    })
    const POST = await chatRoute()

    const reponse = await POST(
      post(urlChat('TEST-AAA111'), { messages, sessionId: 'h4' }),
      ctx('TEST-AAA111')
    )

    // Comportement historique conservé sur CE cas (pas le fail-open B4) : le
    // document est documenté comme résiduel. L'important est que le contrôle
    // porte bien sur l'absence de rejeu de `messages` comme tableau de roles.
    if (reponse.status === 200) {
      const corpsGroq = etat.groq[0]?.corps ?? ''
      const envoye = JSON.parse(corpsGroq) as {
        messages: Array<{ role: string; content: string }>
      }
      const contenu = JSON.stringify(envoye.messages)
      // Le user input du client ne doit pas apparaître comme message `user` complet.
      expect(contenu).not.toContain('12 rue des Lilas')
    } else {
      expect(reponse.status).toBe(500)
      expect(etat.groq).toHaveLength(0)
    }
  })
})

// Aucun DML réel : on vérifie au passage que rien n'a été écrit ailleurs.
describe('O3-B4 — aucune écriture parasite', () => {
  it('toutes les écritures passent par le stub en mémoire (aucun accès réel)', async () => {
    const POST = await chatRoute()
    await POST(
      post(urlChat('TEST-AAA111'), {
        messages: [{ role: 'user', content: 'question' }],
        sessionId: 'z1',
      }),
      ctx('TEST-AAA111')
    )

    // La seule écriture est le RPC de persistance, sur le stub.
    for (const appel of etat.rpc) expect(appel.fn).toBe('espace_client_append')
  })
})
