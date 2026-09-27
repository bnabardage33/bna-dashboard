// @vitest-environment node
//
// Fuite IBAN/BIC BNA — `app/api/espace-client/[code_acces]` (audit final série B).
//
// CHAÎNE CAUSALE AVANT CORRECTION
// ------------------------------
// La route résolvait l'ENTREPRISE AVANT le chantier, via une valeur CONSTANTE :
//
//     const { data: entreprise } = await supabaseAdmin
//       .from("entreprise_settings").select(SELECT_ENTREPRISE)
//       .eq("id", 1)                      // ← id de ligne FIXE, indépendant du code
//     const { data: chantiers } = … .eq("code_acces", code_acces)
//
// `SELECT_ENTREPRISE` expose `iban` et `bic`. La route est par ailleurs SANS
// session : l'accès ne repose que sur le `code_acces`. Conséquence : tout
// détenteur d'un code d'accès — y compris d'un chantier d'un AUTRE tenant —
// recevait les coordonnées bancaires de BNA. Le PDF de facture les rend
// (DocumentPDF l.252/256), donc la fuite était lisible et exploitable.
//
// APRÈS CORRECTION
// ----------------
// Le chantier est résolu EN PREMIER, l'entreprise est DÉRIVÉE de son
// `entreprise_id`, la ligne renvoyée est revalidée côté serveur, et toute
// ambiguïté est refusée. `entreprise_id` est retiré du payload public.
//
// Fidélité du stub, condition de validité de ces tests :
//   * `.eq()` est un prédicat RÉELLEMENT appliqué aux lignes — c'est ce qui
//     rend détectable le retour d'un `.eq("id", 1)` : le mutant afficherait
//     alors l'IBAN de BNA à un code d'un autre tenant, et le test le voit ;
//   * la ligne `entreprise_settings` du premier tenant est celle d'`id` 1,
//     reproduit à l'identique : c'est exactement la donnée qui fuitait.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BNA = '11111111-1111-4111-8111-111111111111'
const TEST = '22222222-2222-4222-8222-222222222222'

const IBAN_BNA = 'FR7630004000031234567890188'
const BIC_BNA = 'BNPAFRPPXXX'
const IBAN_TEST = 'FR7612345678901234567890123'

type Row = Record<string, unknown>

const spies = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: { from: (t: string) => spies.from(t) },
}))

interface Etat {
  tables: Record<string, Row[]>
  selects: Array<{ table: string; filtres: Array<[string, unknown]>; limite: number | null }>
  erreurSelect?: { table: string; message: string } | null
}

function creerEtat(): Etat {
  return {
    tables: {
      chantiers: [
        {
          id: 'ch-bna',
          code_acces: 'CODE-BNA-0001',
          nom: 'Façade nord BNA',
          adresse_chantier: '1 rue A, BNA',
          statut: 'en_cours',
          surface_m2: 120,
          created_at: '2026-01-01T00:00:00Z',
          date_debut: null,
          date_fin: null,
          client_id: 'cl-bna',
          entreprise_id: BNA,
          clients: { id: 'cl-bna', nom: 'Client BNA' },
        },
        {
          id: 'ch-test',
          code_acces: 'CODE-TEST-0002',
          nom: 'Façade sud TEST',
          adresse_chantier: '2 rue B, TEST',
          statut: 'en_cours',
          surface_m2: 80,
          created_at: '2026-02-01T00:00:00Z',
          date_debut: null,
          date_fin: null,
          client_id: 'cl-test',
          entreprise_id: TEST,
          clients: { id: 'cl-test', nom: 'Client TEST' },
        },
      ],
      // La ligne de BNA est celle d'`id` 1 : c'est celle que le `.eq("id", 1)`
      // d'origine sélectionnait, quelle que soit l'entreprise du code demandé.
      entreprise_settings: [
        {
          id: 1,
          raison_sociale: 'BNA Batiment',
          siret: '12345678900011',
          telephone: null,
          email: 'contact@bna.test',
          adresse: '1 rue A',
          code_postal: '75001',
          ville: 'Paris',
          assurance: 'AXA',
          assurance_nom: 'AXA',
          assurance_numero_police: 'POL-BNA-77',
          assurance_zone_geo: null,
          mediateur_nom: null,
          mediateur_contact: null,
          iban: IBAN_BNA,
          bic: BIC_BNA,
          mentions_legales: 'BNA',
          logo_url: null,
          entreprise_id: BNA,
        },
        {
          id: 2,
          raison_sociale: 'TEST Batiment',
          siret: '99999999900022',
          telephone: null,
          email: 'contact@test.test',
          adresse: '2 rue B',
          code_postal: '69001',
          ville: 'Lyon',
          assurance: 'MAIF',
          assurance_nom: 'MAIF',
          assurance_numero_police: 'POL-TEST-88',
          assurance_zone_geo: null,
          mediateur_nom: null,
          mediateur_contact: null,
          iban: IBAN_TEST,
          bic: 'TESTFRPPXXX',
          mentions_legales: 'TEST',
          logo_url: null,
          entreprise_id: TEST,
        },
      ],
      avancements_chantier: [],
      devis: [],
      factures: [],
      rapports_client: [],
      rapports_intemperies_jours_arretes: [],
      photos_chantier: [],
    },
    selects: [],
    erreurSelect: null,
  }
}

let etat: Etat

/** Constructeur de requête : les prédicats sont APPLIQUÉS, pas mémorisés seuls. */
class Faux {
  private filtres: Array<[string, unknown]> = []
  private limite: number | null = null

  constructor(private table: string) {}

  select(_colonnes?: string): this {
    return this
  }

  eq(colonne: string, valeur: unknown): this {
    this.filtres.push([colonne, valeur])
    return this
  }

  in(colonne: string, valeurs: unknown[]): this {
    this.filtres.push([colonne, `in:${valeurs.join(',')}`])
    return this
  }

  limit(n: number): this {
    this.limite = n
    return this
  }

  /** Tri : sans effet ici, les tables de test sont déjà ordonnées. */
  order(_colonne?: string, _opts?: unknown): this {
    return this
  }

  single(): Promise<{ data: unknown; error: unknown }> {
    return this.exec()
  }

  private exec(): Promise<{ data: unknown; error: unknown }> {
    if (etat.erreurSelect?.table === this.table) {
      const e = etat.erreurSelect
      etat.erreurSelect = null
      return Promise.resolve({ data: null, error: { message: e.message } })
    }
    const lignes = (etat.tables[this.table] ?? []).filter((r) =>
      this.filtres.every(([c, v]) => {
        if (typeof v === 'string' && v.startsWith('in:')) {
          return (v.slice(3).split(',') as unknown[]).includes(r[c])
        }
        return r[c] === v
      })
    )
    etat.selects.push({
      table: this.table,
      filtres: this.filtres.map((f) => [f[0], f[1]] as [string, unknown]),
      limite: this.limite,
    })
    return Promise.resolve({
      data: this.limite === null ? lignes : lignes.slice(0, this.limite),
      error: null,
    })
  }

  then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
    return this.exec().then(resolve)
  }
}

function sourceRoute(): string {
  return readFileSync(
    join(process.cwd(), 'app/api/espace-client/[code_acces]/route.ts'),
    'utf8'
  )
}

/**
 * Source SANS les commentaires (lignes entières `//` et blocs `/* *\/`).
 *
 * Nécessaire parce que la route DOCUMENTE le défaut qu'elle corrige : le
 * commentaire rappelle l'ancien `.eq("id", 1)`. Un invariant portant sur le
 * code exécutable ne doit pas être faussé par la prose qui explique le correctif.
 * Les commentaires de fin de ligne sont conservés : le matcher ne peut pas les
 * distinguer d'un `//` à l'intérieur d'une chaîne littérale sans analyseur.
 */
function sourceExecutee(): string {
  return sourceRoute()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')
}

async function appelerGet(code: string): Promise<{
  statut: number
  corps: Record<string, unknown>
}> {
  const { GET } = await import('@/app/api/espace-client/[code_acces]/route')
  const res = await GET({} as never, { params: Promise.resolve({ code_acces: code }) })
  return { statut: res.status, corps: (await res.json()) as Record<string, unknown> }
}

function predicats(table: string): Array<[string, unknown]> | undefined {
  return etat.selects.find((s) => s.table === table)?.filtres
}

beforeEach(() => {
  etat = creerEtat()
  spies.from.mockReset()
  spies.from.mockImplementation((t: string) => new Faux(t))
})

// ── A. Le code d'accès désigne BIEN son entreprise ────────────────────────────

describe('Fuite IBAN/BIC — l\'entreprise est dérivée du code d\'accès', () => {
  it('A1 — code BNA : renvoie l\'IBAN/BIC de BNA (comportement légitime conservé)', async () => {
    const { statut, corps } = await appelerGet('CODE-BNA-0001')
    expect(statut).toBe(200)
    const ent = corps.entreprise as Record<string, unknown>
    expect(ent.iban).toBe(IBAN_BNA)
    expect(ent.bic).toBe(BIC_BNA)
    expect(ent.raison_sociale).toBe('BNA Batiment')
  })

  it('A2 — code d\'un AUTRE tenant : AUCUNE donnée bancaire de BNA', async () => {
    const { statut, corps } = await appelerGet('CODE-TEST-0002')
    expect(statut).toBe(200)

    // L'IBAN de BNA ne doit apparaître NI dans l'entreprise NI ailleurs.
    const serialise = JSON.stringify(corps)
    expect(serialise).not.toContain(IBAN_BNA)
    expect(serialise).not.toContain(BIC_BNA)
    expect(serialise).not.toContain('POL-BNA-77')

    const ent = corps.entreprise as Record<string, unknown>
    expect(ent.iban).toBe(IBAN_TEST)
    expect(ent.raison_sociale).toBe('TEST Batiment')
  })

  it('A3 — la requête entreprise_settings est filtrée par le tenant du chantier', async () => {
    await appelerGet('CODE-TEST-0002')
    const f = predicats('entreprise_settings')
    expect(f).toBeDefined()
    // Le chantier est résolu AVANT l'entreprise : le prédicat porte le UUID
    // du chantier, jamais un identifiant de ligne ni une constante.
    expect(f).toContainEqual(['entreprise_id', TEST])
    expect(f).not.toContainEqual(['id', 1])
    expect(f?.some(([c]) => c === 'entreprise_id')).toBe(true)
  })
})

// ── B. Fail-closed ───────────────────────────────────────────────────────────

describe('Fuite IBAN/BIC — comportement fail-closed', () => {
  it('B1 — code inconnu : 404, et l\'entreprise n\'est même pas demandée', async () => {
    const { statut, corps } = await appelerGet('CODE-QUI-EXISTE-PAS')
    expect(statut).toBe(404)
    expect(corps.entreprise).toBeUndefined()
    expect(predicats('entreprise_settings')).toBeUndefined()
  })

  it('B2 — code ambigu (2 chantiers) : refus, aucun dossier renvoyé', async () => {
    etat.tables.chantiers.push({
      ...(etat.tables.chantiers[0] as Row),
      id: 'ch-doublon',
      entreprise_id: TEST,
    })
    const { statut, corps } = await appelerGet('CODE-BNA-0001')
    expect(statut).toBe(404)
    expect(corps.entreprise).toBeUndefined()
    expect(corps.chantier).toBeUndefined()
    expect(predicats('entreprise_settings')).toBeUndefined()
  })

  it('B3 — ligne entreprise incohérente avec le chantier : ignorée', async () => {
    // Simulation d'un prédicat `.eq()` altéré : la ligne de BNA est renvoyée
    // pour le chantier de TEST. La revalidation serveur doit la rejeter.
    const vraiEq = Faux.prototype.eq
    Faux.prototype.eq = function (colonne: string, valeur: unknown) {
      if (colonne === 'entreprise_id') return vraiEq.call(this, 'entreprise_id', BNA)
      return vraiEq.call(this, colonne, valeur)
    }
    try {
      const { statut, corps } = await appelerGet('CODE-TEST-0002')
      expect(statut).toBe(200)
      // Aucune donnée d'entreprise ne doit sortir.
      expect(corps.entreprise).toBeNull()
      expect(JSON.stringify(corps)).not.toContain(IBAN_BNA)
    } finally {
      Faux.prototype.eq = vraiEq
    }
  })

  it('B4 — tenant sans paramètres d\'entreprise : bloc vide, portail fonctionnel', async () => {
    etat.tables.entreprise_settings = []
    const { statut, corps } = await appelerGet('CODE-BNA-0001')
    expect(statut).toBe(200)
    // Pas de repli permissif : aucune donnée d'entreprise d'un autre tenant…
    expect(corps.entreprise).toBeNull()
    expect(JSON.stringify(corps)).not.toContain(IBAN_BNA)
    // …mais le dossier du chantier reste servi.
    expect((corps.chantier as Record<string, unknown>).nom).toBe('Façade nord BNA')
  })

  it('B5 — erreur de lecture entreprise_settings : pas de repli sur une autre ligne', async () => {
    etat.erreurSelect = { table: 'entreprise_settings', message: 'connexion perdue' }
    const { statut, corps } = await appelerGet('CODE-BNA-0001')
    expect(statut).toBe(200)
    expect(corps.entreprise).toBeNull()
    expect(JSON.stringify(corps)).not.toContain(IBAN_BNA)
  })

  it('B6 — chantier sans entreprise_id exploitable : refus', async () => {
    etat.tables.chantiers = [
      { ...(etat.tables.chantiers[0] as Row), entreprise_id: null },
    ]
    const { statut, corps } = await appelerGet('CODE-BNA-0001')
    expect(statut).toBe(404)
    expect(corps.entreprise).toBeUndefined()
    expect(predicats('entreprise_settings')).toBeUndefined()
  })
})

// ── C. Aucune constante de tenant, aucune fuite dans le payload ───────────────

describe('Fuite IBAN/BIC — invariants de source', () => {
  it('C1 — le code exécuté ne sélectionne plus par id de ligne fixe', () => {
    expect(sourceExecutee()).not.toMatch(/\.eq\(\s*["']id["']\s*,\s*\d+\s*\)/)
  })

  it('C2 — aucun UUID en dur dans le code exécuté', () => {
    const uuidEnDur = sourceExecutee().match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi
    )
    expect(uuidEnDur ?? []).toEqual([])
  })

  it('C3 — entreprise_id est retiré du payload public (chantier ET entreprise)', async () => {
    const { corps } = await appelerGet('CODE-BNA-0001')
    expect(corps.entreprise).not.toBeNull()
    expect((corps.entreprise as Record<string, unknown>).entreprise_id).toBeUndefined()
    expect((corps.chantier as Record<string, unknown>).entreprise_id).toBeUndefined()
  })

  it('C4 — le chantier est résolu AVANT les paramètres entreprise', async () => {
    await appelerGet('CODE-BNA-0001')
    const ordre = etat.selects.map((s) => s.table)
    expect(ordre.indexOf('chantiers')).toBe(0)
    expect(ordre.indexOf('entreprise_settings')).toBeGreaterThan(ordre.indexOf('chantiers'))
  })
})
