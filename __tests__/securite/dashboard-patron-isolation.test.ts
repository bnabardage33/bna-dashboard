// @vitest-environment node
//
// O3-B7 — `app/api/dashboard-patron` : isolation tenant et intégrité des paramètres
//
// La VRAIE route est exécutée. Seuls `verifierSession` et le client Supabase SSR
// sont remplacés par des spies/stubs en mémoire : aucun réseau, aucun DML.
//
// Couverture :
//   A) ISOLATION (prouve la correction O3-A2, jusqu'ici sans aucun test)
//   B) D1 — une colonne NON fournie ne doit jamais être écrasée
//   C) D2 — validation numérique stricte (Number.isFinite)
//   D) D3 — 400 sur corps vide / JSON invalide / corps non-objet
//   E) NON-RÉGRESSION du parcours nominal réellement appelé par la page
//
// Point technique central de B) : le stub d'upsert applique de VRAIES sémantiques
// SQL (`insert … on conflict (entreprise_id) do update`), c'est-à-dire qu'il ne
// remplace la ligne qu'avec les colonnes EFFECTIVEMENT présentes dans le corps.
// C'est ce qui rend détectable la régression « `charges_fixes_mensuelles ?? 0` » :
// avec elle, la valeur 100 du tenant disparaît ; sans elle, elle survit.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const BNA = '11111111-1111-4111-8111-111111111111'
const TEST = '22222222-2222-4222-8222-222222222222'
const AUTRE = '33333333-3333-4333-8333-333333333333'

const spies = vi.hoisted(() => ({
  verifierSession: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  verifierSession: (...args: unknown[]) => spies.verifierSession(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: (...args: unknown[]) => spies.getUser(...args) },
    from: (table: string) => {
      const depuis = (globalThis as Record<string, unknown>).__dpFrom as (
        t: string
      ) => unknown
      return depuis(table)
    },
  }),
}))

type Row = Record<string, unknown>

interface Etat {
  tables: Record<string, Row[]>
  /** Une entrée par appel à `.from(table)`. */
  fromCalls: string[]
  /** Une entrée par lecture : table + filtres appliqués. */
  selects: Array<{ table: string; filtres: Array<[string, unknown]> }>
  /** Une entrée par écriture : table + corps exact envoyé. */
  upserts: Array<{ table: string; payload: Row; options: Row }>
  /** Erreur simulée sur le prochain upsert. */
  erreurUpsert: { message: string } | null
}

class Fake {
  private filtres: Array<[string, unknown]> = []

  constructor(
    private table: string,
    private etat: Etat
  ) {}

  select(_colonnes?: string): this {
    return this
  }

  eq(colonne: string, valeur: unknown): this {
    this.filtres.push([colonne, valeur])
    return this
  }

  private run(): Row[] {
    this.etat.selects.push({ table: this.table, filtres: this.filtres.map((f) => [f[0], f[1]]) })
    return (this.etat.tables[this.table] ?? []).filter((r) =>
      this.filtres.every(([c, v]) => r[c] === v)
    )
  }

  single(): Promise<{ data: Row | null; error: null }> {
    return Promise.resolve({ data: this.run()[0] ?? null, error: null })
  }

  then(resolve: (v: { data: Row[]; error: null }) => void): void {
    resolve({ data: this.run(), error: null })
  }
}

function installerSupabase(etat: Etat): void {
  installerUpsert(etat)
}

/**
 * Sémantique réelle de `insert … on conflict (entreprise_id) do update` :
 * la ligne existante est remplacée par le fusionné, donc une colonne ABSENTE
 * du corps conserve sa valeur. C'est le comportement de PostgreSQL, et c'est
 * précisément ce que la route doit retrouver.
 */
function appliquerUpsert(etat: Etat, table: string, payload: Row): void {
  const lignes = etat.tables[table] ?? (etat.tables[table] = [])
  const idx = lignes.findIndex((r) => r.entreprise_id === payload.entreprise_id)
  if (idx >= 0) lignes[idx] = { ...lignes[idx], ...payload }
  else lignes.push({ id: `gen-${lignes.length + 1}`, ...payload })
}

/**
 * Stub `from(table)` : sert à la fois aux lectures (chaîne PostgREST) et à
 * l'upsert. L'upsert applique de VRAIES sémantiques `on conflict do update`,
 * ce qui rend observable l'absence d'une colonne dans le corps.
 */
function installerUpsert(etat: Etat): void {
  ;(globalThis as Record<string, unknown>).__dpFrom = (table: string): unknown => {
    etat.fromCalls.push(table)
    return {
      upsert: (payload: Row, options: Row) => {
        etat.upserts.push({ table, payload, options })
        if (etat.erreurUpsert) {
          const e = etat.erreurUpsert
          etat.erreurUpsert = null
          return Promise.resolve({ data: null, error: e })
        }
        appliquerUpsert(etat, table, payload)
        return Promise.resolve({ data: null, error: null })
      },
      select: () => new Fake(table, etat),
    }
  }
}

function creerEtat(): Etat {
  return {
    tables: {
      parametres_entreprise: [
        { id: 'p-bna', entreprise_id: BNA, tresorerie_actuelle: 5000, charges_fixes_mensuelles: 0 },
        {
          id: 'p-test',
          entreprise_id: TEST,
          tresorerie_actuelle: 1000,
          // Valeur NON NULLE : c'est elle que la régression `?? 0` détruirait.
          charges_fixes_mensuelles: 100,
        },
      ],
      parametres_finance: [],
      factures: [],
      devis: [],
      depenses_chantier: [],
      documents_compta: [],
      chantiers: [],
    },
    fromCalls: [],
    selects: [],
    upserts: [],
    erreurUpsert: null,
  }
}

let etat: Etat

beforeEach(() => {
  etat = creerEtat()
  installerSupabase(etat)
  installerUpsert(etat)

  spies.verifierSession.mockReset()
  spies.verifierSession.mockResolvedValue({ authentifie: true })

  spies.getUser.mockReset()
  spies.getUser.mockResolvedValue({ data: { user: { app_metadata: { entreprise_id: BNA } } } })
})

function requete(corpsBrut: string): NextRequest {
  return new NextRequest('http://x/api/dashboard-patron', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: corpsBrut,
  })
}

function post(corps: unknown): NextRequest {
  return requete(JSON.stringify(corps))
}

async function routes() {
  return import('@/app/api/dashboard-patron/route')
}

function definirClaim(entreprise: string | null): void {
  spies.getUser.mockResolvedValue({
    data: { user: { app_metadata: { entreprise_id: entreprise } } },
  })
}

function ligne(entreprise: string): Row {
  const trouvee = etat.tables.parametres_entreprise?.find(
    (r) => r.entreprise_id === entreprise
  )
  expect(trouvee, `ligne ${entreprise} absente`).toBeDefined()
  return trouvee as Row
}

function dernierUpsert(): { table: string; payload: Row; options: Row } {
  expect(etat.upserts, 'aucun upsert enregistré').toHaveLength(1)
  return etat.upserts[0] as { table: string; payload: Row; options: Row }
}

// ===========================================================================
// A) ISOLATION — la correction O3-A2 n'était prouvée par AUCUN test (D5)
// ===========================================================================

describe('O3-B7 · A — isolation tenant', () => {
  it('A1. GET sans claim : 403 et AUCUNE requête base', async () => {
    definirClaim(null)
    const { GET } = await routes()
    const r = await GET()
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ error: 'Contexte entreprise introuvable.' })
    // Zéro fuite : pas la moindre lecture tentée.
    expect(etat.fromCalls).toEqual([])
    expect(etat.selects).toEqual([])
  })

  it('A2. POST sans claim : 403 et AUCUNE écriture', async () => {
    definirClaim(null)
    const { POST } = await routes()
    const r = await POST(post({ tresorerie_actuelle: 42 }))
    expect(r.status).toBe(403)
    expect(etat.upserts).toEqual([])
    expect(ligne(BNA).tresorerie_actuelle).toBe(5000)
  })

  it('A3. GET claim BNA : les 6 lectures portent le filtre entreprise du claim', async () => {
    const { GET } = await routes()
    const r = await GET()
    expect(r.status).toBe(200)
    expect(etat.selects.length).toBeGreaterThanOrEqual(6)
    for (const lecture of etat.selects) {
      const filtre = lecture.filtres.find(([c]) => c === 'entreprise_id')
      expect(filtre, `lecture ${lecture.table} sans filtre entreprise`).toBeDefined()
      expect(filtre?.[1]).toBe(BNA)
    }
    // Aucun filtre ne désigne un autre tenant.
    for (const lecture of etat.selects) {
      for (const [, valeur] of lecture.filtres) {
        expect([BNA, 'solde_bancaire']).toContain(valeur)
      }
    }
  })

  it('A4. GET claim TEST : symétrique, jamais de donnée BNA', async () => {
    definirClaim(TEST)
    etat.tables.factures = [
      { id: 'f-bna', entreprise_id: BNA, numero: 'F-BNA', statut: 'payee', lignes: [] },
    ]
    etat.tables.chantiers = [
      { id: 'ch-bna', entreprise_id: BNA, nom: 'Chantier BNA', prix_vente_ht: 1000 },
    ]
    const { GET } = await routes()
    const r = await GET()
    expect(r.status).toBe(200)
    const corps = (await r.json()) as Record<string, unknown>
    for (const lecture of etat.selects) {
      const filtre = lecture.filtres.find(([c]) => c === 'entreprise_id')
      expect(filtre?.[1]).toBe(TEST)
    }
    // Aucune trace du tenant BNA dans la réponse servie à TEST.
    expect(JSON.stringify(corps)).not.toContain('F-BNA')
    expect(JSON.stringify(corps)).not.toContain('Chantier BNA')
    expect(corps.parametres).toEqual({
      tresorerie_actuelle: 1000,
      charges_fixes_mensuelles: 100,
    })
  })

  it('A5. POST claim TEST : le corps porte le tenant du claim et AUCUNE constante BNA', async () => {
    definirClaim(TEST)
    const { POST } = await routes()
    const r = await POST(post({ tresorerie_actuelle: 2500 }))
    expect(r.status).toBe(200)
    const { payload } = dernierUpsert()
    expect(payload.entreprise_id).toBe(TEST)
    // Balayage profond : aucun UUID BNA, où qu'il soit dans le corps.
    expect(JSON.stringify(payload)).not.toContain(BNA)
    // Et la ligne BNA est intacte.
    expect(ligne(BNA).tresorerie_actuelle).toBe(5000)
    expect(ligne(TEST).tresorerie_actuelle).toBe(2500)
  })

  it('A6. POST : le conflit porte bien sur entreprise_id (déduit de la policy RLS)', async () => {
    const { POST } = await routes()
    await POST(post({ tresorerie_actuelle: 1 }))
    expect(dernierUpsert().table).toBe('parametres_entreprise')
    expect(dernierUpsert().options.onConflict).toBe('entreprise_id')
  })
})

// ===========================================================================
// B) D1 — une colonne non fournie ne doit JAMAIS être écrasée
// ===========================================================================

describe('O3-B7 · B — D1 : charges_fixes_mensuelles ne doit pas être écrasée', () => {
  it('B1. le corps omettait volontairement la colonne (or c\'est le cœur du correctif)', async () => {
    definirClaim(TEST)
    const { POST } = await routes()
    const r = await POST(post({ tresorerie_actuelle: 4242 }))
    expect(r.status).toBe(200)
    const { payload } = dernierUpsert()
    // La colonne est ABSENTE du corps — pas présente à 0, pas présente à null.
    expect(Object.prototype.hasOwnProperty.call(payload, 'charges_fixes_mensuelles')).toBe(false)
    expect(payload.tresorerie_actuelle).toBe(4242)
  })

  it('B2. la valeur stockée survit à l\'enregistrement de la trésorerie (100 € conservés)', async () => {
    definirClaim(TEST)
    expect(ligne(TEST).charges_fixes_mensuelles).toBe(100)
    const { POST } = await routes()
    await POST(post({ tresorerie_actuelle: 4242 }))
    // Preuve comportementale, pas seulement structurelle : le store applique de
    // vraies sémantiques d'upsert, donc 100 doit être intact.
    expect(ligne(TEST).charges_fixes_mensuelles).toBe(100)
    expect(ligne(TEST).tresorerie_actuelle).toBe(4242)
  })

  it('B3. le tenant BNA (charges à 0) reste à 0 — aucune écriture de colonne parasite', async () => {
    const { POST } = await routes()
    await POST(post({ tresorerie_actuelle: 7500 }))
    expect(ligne(BNA).charges_fixes_mensuelles).toBe(0)
    expect(ligne(BNA).tresorerie_actuelle).toBe(7500)
  })

  it('B4. POST charges seul : tresorerie_actuelle est également préservée', async () => {
    definirClaim(TEST)
    const { POST } = await routes()
    const r = await POST(post({ charges_fixes_mensuelles: 2500 }))
    expect(r.status).toBe(200)
    expect(Object.prototype.hasOwnProperty.call(dernierUpsert().payload, 'tresorerie_actuelle')).toBe(
      false
    )
    expect(ligne(TEST).tresorerie_actuelle).toBe(1000)
    expect(ligne(TEST).charges_fixes_mensuelles).toBe(2500)
  })

  it('B5. POST des deux champs : les deux sont écrits, valeurs exactes', async () => {
    definirClaim(TEST)
    const { POST } = await routes()
    const r = await POST(post({ tresorerie_actuelle: 3333, charges_fixes_mensuelles: 1500 }))
    expect(r.status).toBe(200)
    expect(dernierUpsert().payload).toMatchObject({
      tresorerie_actuelle: 3333,
      charges_fixes_mensuelles: 1500,
    })
    expect(ligne(TEST).tresorerie_actuelle).toBe(3333)
    expect(ligne(TEST).charges_fixes_mensuelles).toBe(1500)
  })

  it('B6. la projection du GET utilise bien les charges fixes (boucle complète)', async () => {
    // Sans ce test, la colonne pourrait être lue et ignorée : la perte de D1
    // serait alors invisible depuis l'écran.
    definirClaim(TEST)
    const { GET } = await routes()
    const avant = (await (await GET()).json()) as Record<string, unknown>
    expect(avant.parametres).toEqual({
      tresorerie_actuelle: 1000,
      charges_fixes_mensuelles: 100,
    })

    const { POST } = await routes()
    const r = await POST(post({ charges_fixes_mensuelles: 2000 }))
    expect(r.status).toBe(200)

    const apres = (await (await GET()).json()) as Record<string, unknown>
    expect(apres.parametres).toEqual({
      tresorerie_actuelle: 1000,
      charges_fixes_mensuelles: 2000,
    })
    // charges/30 retirés chaque jour ⇒ (2000 - 100) retirés au bout de 30 jours.
    // `toBeCloseTo` : la balance accumule 30 divisions, l'écart d'arrondi flottant
    // est de l'ordre de 1e-12 et n'a aucune signification métier.
    expect(Number(apres.treso_j30) - Number(avant.treso_j30)).toBeCloseTo(-(2000 - 100), 6)
  })
})

// ===========================================================================
// C) D2 — validation numérique stricte
// ===========================================================================

describe('O3-B7 · C — D2 : Number.isFinite', () => {
  it('C1. Infinity (1e400) : 400, aucune écriture', async () => {
    const { POST } = await routes()
    const r = await POST(requete('{"tresorerie_actuelle":1e400}'))
    expect(r.status).toBe(400)
    expect((await r.json()).champs).toEqual(['tresorerie_actuelle'])
    expect(etat.upserts).toEqual([])
    expect(ligne(BNA).tresorerie_actuelle).toBe(5000)
  })

  it('C2. -Infinity sur charges_fixes : 400, aucune écriture', async () => {
    const { POST } = await routes()
    const r = await POST(requete('{"charges_fixes_mensuelles":-1e400}'))
    expect(r.status).toBe(400)
    expect((await r.json()).champs).toEqual(['charges_fixes_mensuelles'])
    expect(etat.upserts).toEqual([])
  })

  it('C3. Infinity sur les DEUX champs : les deux sont signalés, rien n\'est écrit', async () => {
    const { POST } = await routes()
    const r = await POST(requete('{"tresorerie_actuelle":1e400,"charges_fixes_mensuelles":-1e400}'))
    expect(r.status).toBe(400)
    expect((await r.json()).champs).toEqual([
      'tresorerie_actuelle',
      'charges_fixes_mensuelles',
    ])
    expect(etat.upserts).toEqual([])
  })

  it('C4. chaîne numérique : 400 (aucune conversion implicite)', async () => {
    const { POST } = await routes()
    const r = await POST(post({ tresorerie_actuelle: '1234' }))
    expect(r.status).toBe(400)
    expect(etat.upserts).toEqual([])
  })

  it('C5. booléen et tableau : 400', async () => {
    const { POST } = await routes()
    for (const valeur of [true, [1], {}]) {
      const r = await POST(post({ tresorerie_actuelle: valeur }))
      expect(r.status, `valeur ${JSON.stringify(valeur)}`).toBe(400)
    }
    expect(etat.upserts).toEqual([])
  })

  it('C6. un champ valide et un champ invalide : refus global (aucune écriture partielle)', async () => {
    definirClaim(TEST)
    const { POST } = await routes()
    const r = await POST(requete('{"tresorerie_actuelle":5000,"charges_fixes_mensuelles":1e400}'))
    expect(r.status).toBe(400)
    expect(etat.upserts).toEqual([])
    // Rien n'a bougé, pas même le champ valide.
    expect(ligne(TEST).tresorerie_actuelle).toBe(1000)
  })

  it('C7. 0, les décimales et un découvert négatif restent acceptés', async () => {
    definirClaim(TEST)
    const { POST } = await routes()
    for (const valeur of [0, 12.34, -500]) {
      const r = await POST(post({ tresorerie_actuelle: valeur }))
      expect(r.status, `valeur ${valeur}`).toBe(200)
    }
    expect(ligne(TEST).tresorerie_actuelle).toBe(-500)
  })
})

// ===========================================================================
// D) D3 — 400 sur corps vide / JSON invalide / corps non objet
// ===========================================================================

describe('O3-B7 · D — D3 : statuts 400', () => {
  it('D1. corps vide : 400 « JSON invalide » (et non 500)', async () => {
    const { POST } = await routes()
    const r = await POST(requete(''))
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'JSON invalide' })
    expect(etat.upserts).toEqual([])
  })

  it('D2. JSON tronqué : 400 « JSON invalide »', async () => {
    const { POST } = await routes()
    const r = await POST(requete('{"tresorerie_actuelle":'))
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'JSON invalide' })
    expect(etat.upserts).toEqual([])
  })

  it('D3. corps null : 400 « Corps JSON objet requis » (et non 500)', async () => {
    const { POST } = await routes()
    const r = await POST(requete('null'))
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'Corps JSON objet requis' })
    expect(etat.upserts).toEqual([])
  })

  it('D4. corps tableau : 400', async () => {
    const { POST } = await routes()
    const r = await POST(requete('[]'))
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'Corps JSON objet requis' })
  })

  it('D5. corps chaîne ou nombre : 400', async () => {
    const { POST } = await routes()
    for (const brut of ['"abc"', '42', 'true']) {
      const r = await POST(requete(brut))
      expect(r.status, `corps ${brut}`).toBe(400)
      expect(await r.json()).toEqual({ error: 'Corps JSON objet requis' })
    }
    expect(etat.upserts).toEqual([])
  })

  it('D6. objet sans champ exploitable : 400 « Aucun paramètre à mettre à jour » (message historique)', async () => {
    const { POST } = await routes()
    const r = await POST(post({}))
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'Aucun paramètre à mettre à jour' })
    expect(etat.upserts).toEqual([])
  })

  it('D7. champs à null : traités comme absents ⇒ 400, rien n\'est écrit', async () => {
    definirClaim(TEST)
    const { POST } = await routes()
    const r = await POST(post({ tresorerie_actuelle: null, charges_fixes_mensuelles: null }))
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'Aucun paramètre à mettre à jour' })
    expect(etat.upserts).toEqual([])
    expect(ligne(TEST).tresorerie_actuelle).toBe(1000)
    expect(ligne(TEST).charges_fixes_mensuelles).toBe(100)
  })

  it('D8. un 400 de validation n\'écrit rien, même sur le tenant du claim', async () => {
    definirClaim(TEST)
    const { POST } = await routes()
    await POST(requete(''))
    await POST(requete('null'))
    await POST(requete('{"tresorerie_actuelle":1e400}'))
    expect(etat.upserts).toEqual([])
    expect(ligne(TEST)).toMatchObject({
      tresorerie_actuelle: 1000,
      charges_fixes_mensuelles: 100,
    })
  })
})

// ===========================================================================
// E) NON-RÉGRESSION — le parcours réellement appelé par la page
// ===========================================================================

describe('O3-B7 · E — parcours nominal (inchange)', () => {
  it('E1. la forme exacte envoyée par la page : 200 { ok: true }, une écriture', async () => {
    // app/bureau/dashboard-patron/page.tsx l.87-90 :
    //   body: JSON.stringify({ tresorerie_actuelle: val })
    const { POST } = await routes()
    const r = await POST(post({ tresorerie_actuelle: 12345.67 }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
    expect(etat.upserts).toHaveLength(1)
    expect(dernierUpsert().payload.tresorerie_actuelle).toBe(12345.67)
    expect(typeof dernierUpsert().payload.updated_at).toBe('string')
  })

  it('E2. GET : réponse 200 et structure inchangée', async () => {
    const { GET } = await routes()
    const r = await GET()
    expect(r.status).toBe(200)
    const corps = (await r.json()) as Record<string, unknown>
    for (const cle of [
      'parametres',
      'ca_encaisse_mois',
      'ca_en_attente',
      'depenses_a_payer',
      'treso_j15',
      'treso_j30',
      'projection',
      'alertes',
      'top_chantiers_rentables',
      'top_chantiers_pertes',
    ]) {
      expect(corps, `clé ${cle} absente`).toHaveProperty(cle)
    }
    expect(Array.isArray(corps.projection)).toBe(true)
    expect((corps.projection as number[]).length).toBe(30)
  })

  it('E3. erreur base à l\'écriture : 500 inchangé', async () => {
    etat.erreurUpsert = { message: 'conflit de RLS' }
    const { POST } = await routes()
    const r = await POST(post({ tresorerie_actuelle: 10 }))
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'conflit de RLS' })
  })

  it('E4. session absente : 401 renvoyé par verifierSession, route non atteinte', async () => {
    spies.verifierSession.mockResolvedValue({
      authentifie: false,
      reponse: new Response('{}', { status: 401 }),
    })
    const { POST } = await routes()
    const r = await POST(post({ tresorerie_actuelle: 10 }))
    expect(r.status).toBe(401)
    expect(etat.upserts).toEqual([])
  })

  it('E5. le tenant AUTRE est traité comme les autres (aucun cas particulier BNA)', async () => {
    definirClaim(AUTRE)
    const { POST } = await routes()
    const r = await POST(post({ tresorerie_actuelle: 777 }))
    expect(r.status).toBe(200)
    expect(dernierUpsert().payload.entreprise_id).toBe(AUTRE)
    // La ligne créée ne contient que la colonne fournie (+ horodatage + clé).
    const { payload } = dernierUpsert()
    expect(Object.keys(payload).sort()).toEqual([
      'charges_fixes_mensuelles',
      'entreprise_id',
      'id',
      'tresorerie_actuelle',
      'updated_at',
    ].filter((k) => k in payload).sort())
  })
})
