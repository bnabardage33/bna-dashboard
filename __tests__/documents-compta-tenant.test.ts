// @vitest-environment node
//
// O3-B9 / 13e producteur — `app/api/documents-compta` : isolation tenant.
//
// La VRAIE route est exécutée (GET, POST, DELETE). Seuls le client Supabase SSR
// (session) et `supabaseAdmin` (service_role + Storage) sont remplacés par des
// stubs en mémoire : aucun réseau, aucun DML, aucun secret.
//
// Couverture :
//   A) POST    — `entreprise_id` transmis, issu du claim, fail-closed, chantier
//                optionnel accepté, aucun cast `TablesInsert` ;
//   B) GET     — prédicat `entreprise_id` obligatoire, fail-closed, zéro fuite ;
//   C) DELETE  — prédicat `id` + `entreprise_id`, fail-closed, 404 hors tenant ;
//   D) STORAGE — compensation de l'upload si l'insert échoue, et réciproque ;
//   E) Miroir  — l'échec de `depenses_chantier` n'est plus masqué en 2xx.
//
// Fidélité du stub, condition de validité de ces tests :
//   * `insert().select().single()` RENVOIE la ligne écrite, comme PostgREST ;
//   * `insert()` seul résout avec `{ error }` SANS lever, comme PostgREST ;
//   * `.eq()` est un prédicat RÉELlement appliqué aux lignes : c'est ce qui rend
//     détectable la suppression du filtre `entreprise_id` (le mutant supprime
//     alors la ligne de l'autre tenant, et le test le voit).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BNA = '11111111-1111-4111-8111-111111111111'
const TEST = '22222222-2222-4222-8222-222222222222'
const BASE = 'https://stockage.test'

// Ids de lignes : de VRAIS UUID. La route refuse un identifiant mal formé
// (400) avant toute requête — des fixtures en `doc-bna` seraient rejetées à
// tort et masqueraient les défauts qu'on cherche ici.
const DOC_BNA = '44444444-4444-4444-8444-444444444441'
const DOC_TEST = '44444444-4444-4444-8444-444444444442'
const CH_BNA = '55555555-5555-4555-8555-555555555551'
const CH_TEST = '55555555-5555-4555-8555-555555555552'
const FR_BNA = '66666666-6666-4666-8666-666666666661'
const FR_TEST = '66666666-6666-4666-8666-666666666662'

const spies = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: (...a: unknown[]) => spies.getUser(...a) },
  }),
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...a: unknown[]) => spies.from(...a),
    storage: {
      from: (bucket: string) => ({
        upload: async (chemin: string, _buf: unknown, opts: unknown) => {
          etat.uploads.push({ bucket, chemin, opts: opts as Record<string, unknown> })
          return { error: etat.erreurUpload }
        },
        remove: async (chemins: string[]) => {
          etat.removes.push({ bucket, chemins })
          return { error: etat.erreurRemove }
        },
        getPublicUrl: (chemin: string) => ({
          data: { publicUrl: `${BASE}/${bucket}/${chemin}` },
        }),
      }),
    },
  },
}))

type Row = Record<string, unknown>
interface Etat {
  tables: Record<string, Row[]>
  /** Une entrée par appel à `.from(table)`. */
  fromCalls: string[]
  /** Une entrée par lecture : table + prédicats réellement appliqués. */
  selects: Array<{ table: string; filtres: Array<[string, unknown]> }>
  /** Une entrée par écriture : table + corps exact envoyé. */
  inserts: Array<{ table: string; payload: Row }>
  /** Une entrée par suppression : table + prédicats réellement appliqués. */
  deletes: Array<{ table: string; filtres: Array<[string, unknown]> }>
  uploads: Array<{ bucket: string; chemin: string; opts: Record<string, unknown> }>
  removes: Array<{ bucket: string; chemins: string[] }>
  erreurUpload: { message: string } | null
  erreurRemove: { message: string } | null
  /** Erreur à renvoyer sur le prochain insert de cette table. */
  erreurInsert: { table: string; message: string } | null
  erreurSelect: { table: string; message: string } | null
}

/**
 * Chaîne PostgREST simulée. Toutes les méthodes renvoient `this` et l'objet est
 * alorsable : `await q`, `await q.single()`, `q.insert(x).select().single()` et
 * `q.delete().eq(...).eq(...)` fonctionnent tous avec la même instance.
 */
class Fake {
  private filtres: Array<[string, unknown]> = []
  private resultat: { data: unknown; error: { message: string } | null } | null = null
  private modeDelete = false

  constructor(
    private table: string,
    private etat: Etat
  ) {}

  select(_colonnes?: string): this {
    return this
  }

  order(_colonne?: string, _opts?: unknown): this {
    return this
  }

  eq(colonne: string, valeur: unknown): this {
    this.filtres.push([colonne, valeur])
    return this
  }

  private lignes(): Row[] {
    return (this.etat.tables[this.table] ?? []).filter((r) =>
      this.filtres.every(([c, v]) => r[c] === v)
    )
  }

  private executerSelect(): { data: unknown; error: { message: string } | null } {
    if (this.etat.erreurSelect?.table === this.table) {
      const e = this.etat.erreurSelect
      this.etat.erreurSelect = null
      return { data: null, error: e }
    }
    this.etat.selects.push({
      table: this.table,
      filtres: this.filtres.map((f) => [f[0], f[1]] as [string, unknown]),
    })
    return { data: this.lignes(), error: null }
  }

  insert(payload: Row): this {
    const e = this.etat.erreurInsert
    if (e && e.table === this.table) {
      this.etat.erreurInsert = null
      this.resultat = { data: null, error: e }
      return this
    }
    const lignes = (this.etat.tables[this.table] ??= [])
    const ligne: Row = { id: `${this.table}-${lignes.length + 1}`, ...payload }
    lignes.push(ligne)
    this.etat.inserts.push({ table: this.table, payload })
    // PostgREST : `insert().select()` renvoie les lignes écrites.
    this.resultat = { data: [ligne], error: null }
    return this
  }

  delete(): this {
    // NE PAS enregistrer ici : PostgREST s'écrit
    // `.delete().eq(…).eq(…)`, donc les prédicats sont posés APRÈS l'appel.
    // Enregistrer tout de suite produirait un journal vide — c'est-à-dire un
    // test incapable de voir la disparition d'un `.eq('entreprise_id', …)`.
    this.modeDelete = true
    return this
  }

  private executerDelete(): { data: null; error: null } {
    const cible = this.lignes()
    this.etat.deletes.push({
      table: this.table,
      filtres: this.filtres.map((f) => [f[0], f[1]] as [string, unknown]),
    })
    const table = this.etat.tables[this.table] ?? []
    this.etat.tables[this.table] = table.filter((r) => !cible.includes(r))
    return { data: null, error: null }
  }

  private resoudre(): { data: unknown; error: { message: string } | null } {
    if (this.modeDelete) return this.executerDelete()
    return this.resultat ?? this.executerSelect()
  }

  single(): Promise<{ data: Row | null; error: { message: string } | null }> {
    const r = this.resoudre()
    const data = Array.isArray(r.data) ? (r.data[0] ?? null) : null
    return Promise.resolve({ data, error: r.error })
  }

  maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }> {
    return this.single()
  }

  then(resolve: (v: { data: unknown; error: { message: string } | null }) => void): void {
    resolve(this.resoudre())
  }
}

let etat: Etat

function creerEtat(): Etat {
  return {
    tables: {
      documents_compta: [
        {
          id: DOC_BNA,
          entreprise_id: BNA,
          chantier_id: null,
          url_image: `${BASE}/tickets/documents-compta/bna.png`,
          date: '2026-09-20',
        },
        {
          id: DOC_TEST,
          entreprise_id: TEST,
          chantier_id: null,
          url_image: `${BASE}/tickets/documents-compta/test.png`,
          date: '2026-09-21',
        },
      ],
      chantiers: [
        { id: CH_BNA, entreprise_id: BNA, nom: 'Chantier BNA' },
        { id: CH_TEST, entreprise_id: TEST, nom: 'Chantier TEST' },
      ],
      fournisseurs: [
        { id: FR_BNA, entreprise_id: BNA, nom: 'Fournisseur BNA' },
        { id: FR_TEST, entreprise_id: TEST, nom: 'Fournisseur TEST' },
      ],
      depenses_chantier: [],
    },
    fromCalls: [],
    selects: [],
    inserts: [],
    deletes: [],
    uploads: [],
    removes: [],
    erreurUpload: null,
    erreurRemove: null,
    erreurInsert: null,
    erreurSelect: null,
  }
}

/** Claim de session contrôlable. `undefined` = pas de claim du tout. */
function sessioner(claim: unknown, user = true): void {
  spies.getUser.mockImplementation(async () =>
    user
      ? { data: { user: { app_metadata: { entreprise_id: claim } } }, error: null }
      : { data: { user: null }, error: new Error('session expirée') }
  )
}

function corps(body: unknown): Record<string, unknown> {
  return body as Record<string, unknown>
}

function predicats(op: { table: string; filtres: Array<[string, unknown]> }, table: string) {
  return op.table === table ? op.filtres : undefined
}

function formData(sansChantier = true): FormData {
  const fd = new FormData()
  fd.append('file', new File([Buffer.from('image-fake')], 'bl.png', { type: 'image/png' }))
  fd.append('type', 'bl')
  fd.append('date', '2026-09-26')
  fd.append('note', 'Facture fournisseur')
  fd.append('montant_ht', '1000')
  fd.append('taux_tva', '20')
  if (!sansChantier) fd.append('chantier_id', CH_BNA)
  fd.append('categorie', 'materiaux')
  return fd
}

function post(fd: FormData): NextRequest {
  return new NextRequest('http://localhost/api/documents-compta', { method: 'POST', body: fd })
}

function del(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/documents-compta?id=${id}`, {
    method: 'DELETE',
  })
}

const route = {
  get: async () => (await import('@/app/api/documents-compta/route')).GET(),
  post: async (fd: FormData) =>
    (await import('@/app/api/documents-compta/route')).POST(post(fd)),
  delete: async (id: string) =>
    (await import('@/app/api/documents-compta/route')).DELETE(del(id)),
}

beforeEach(() => {
  etat = creerEtat()
  spies.getUser.mockReset()
  spies.from.mockReset()
  spies.from.mockImplementation((table: string) => {
    etat.fromCalls.push(table)
    return new Fake(table, etat)
  })
  sessioner(BNA)
})

// ───────────────────────────────────────────────────────────────────────────
// A) POST
// ───────────────────────────────────────────────────────────────────────────

describe('A) POST — entreprise_id', () => {
  it('A1 — transmet entreprise_id issu du claim, SANS chantier', async () => {
    sessioner(BNA)
    const res = await route.post(formData(true))

    expect(res.status).toBe(200)
    const inserts = etat.inserts.filter((i) => i.table === 'documents_compta')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].payload.entreprise_id).toBe(BNA)
  })

  it('A2 — le claim n’est JAMAIS remplacé par un tenant en dur (isolation 2 passes)', async () => {
    sessioner(BNA)
    await route.post(formData(true))
    sessioner(TEST)
    await route.post(formData(true))

    const inserts = etat.inserts.filter((i) => i.table === 'documents_compta')
    expect(inserts.map((i) => i.payload.entreprise_id)).toEqual([BNA, TEST])
  })

  it('A3 — contexte ABSENT ⇒ fail-closed 403, AUCUNE écriture, AUCUN upload', async () => {
    sessioner(undefined)
    const res = await route.post(formData(true))

    expect(res.status).toBe(403)
    expect(etat.inserts).toHaveLength(0)
    expect(etat.uploads).toHaveLength(0)
  })

  it('A4 — contexte MAL FORMÉ ⇒ fail-closed 403, AUCUNE écriture', async () => {
    sessioner('pas-un-uuid')
    const res = await route.post(formData(true))

    expect(res.status).toBe(403)
    expect(etat.inserts).toHaveLength(0)
  })

  it('A5 — claim vide / espace ⇒ fail-closed 403', async () => {
    for (const claim of ['', '   ', 42, null, { nested: true }]) {
      etat = creerEtat()
      sessioner(claim)
      const res = await route.post(formData(true))
      expect(res.status).toBe(403)
      expect(etat.inserts).toHaveLength(0)
    }
  })

  it('A6 — session absente ⇒ 401, AUCUNE écriture', async () => {
    sessioner(BNA, false)
    const res = await route.post(formData(true))

    expect(res.status).toBe(401)
    expect(etat.inserts).toHaveLength(0)
  })

  it('A7 — chantier ABSENT : accepté, `chantier_id` reste null (règle métier)', async () => {
    sessioner(BNA)
    const res = await route.post(formData(true))

    expect(res.status).toBe(200)
    const payload = etat.inserts.find((i) => i.table === 'documents_compta')!.payload
    expect(payload.chantier_id).toBeNull()
    expect(payload.entreprise_id).toBe(BNA)
  })

  it('A8 — chantier PRÉSENT : accepté, et le miroir `depenses_chantier` part', async () => {
    sessioner(BNA)
    const res = await route.post(formData(false))

    expect(res.status).toBe(200)
    const tables = etat.inserts.map((i) => i.table)
    expect(tables).toContain('depenses_chantier')
  })

  it('A9 — chantier d’un AUTRE tenant ⇒ refus 400, aucune écriture (trigger qui réécrirait)', async () => {
    sessioner(BNA)
    const fd = formData(true)
    fd.append('chantier_id', CH_TEST)
    const res = await route.post(fd)

    expect(res.status).toBe(400)
    expect(etat.inserts).toHaveLength(0)
    expect(etat.uploads).toHaveLength(0)
  })

  it('A10 — fournisseur d’un AUTRE tenant ⇒ refus 400', async () => {
    sessioner(BNA)
    const fd = formData(true)
    fd.append('fournisseur_id', FR_TEST)
    const res = await route.post(fd)

    expect(res.status).toBe(400)
    expect(etat.inserts).toHaveLength(0)
  })

  it('A11 — le cast `as TablesInsert` a disparu de l’insert documents_compta', async () => {
    // Témoin : la garde de type structurelle du §E.
    const src = readFileSync(
      join(process.cwd(), 'app/api/documents-compta/route.ts'),
      'utf8'
    )
    const bloc = src.slice(src.indexOf(".from('documents_compta')", src.indexOf('export async function POST')))
    expect(bloc.slice(0, bloc.indexOf('.select()'))).not.toMatch(/as TablesInsert</)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// B) GET
// ───────────────────────────────────────────────────────────────────────────

describe('B) GET — scoping', () => {
  it('B1 — la lecture porte obligatoirement `.eq("entreprise_id", …)`', async () => {
    sessioner(BNA)
    await route.get()

    const f = predicats(etat.selects[0], 'documents_compta')
    expect(f).toBeDefined()
    expect(f).toEqual([['entreprise_id', BNA]])
  })

  it('B2 — ne renvoie que les documents du tenant (lecture inter-tenant impossible)', async () => {
    sessioner(BNA)
    const res = corps(await (await route.get()).json())

    const ids = (res.documents as Row[]).map((d) => d.id)
    expect(ids).toEqual([DOC_BNA])
    expect(ids).not.toContain(DOC_TEST)
  })

  it('B3 — le tenant TEST ne voit que son document (2e passage, journal remis à zéro)', async () => {
    sessioner(TEST)
    const res = corps(await (await route.get()).json())

    const ids = (res.documents as Row[]).map((d) => d.id)
    expect(ids).toEqual([DOC_TEST])
  })

  it('B4 — contexte absent ⇒ 403 et ZÉRO requête sur documents_compta', async () => {
    sessioner(undefined)
    const res = await route.get()

    expect(res.status).toBe(403)
    expect(etat.selects).toHaveLength(0)
    expect(etat.fromCalls).not.toContain('documents_compta')
  })

  it('B5 — contexte mal formé ⇒ 403 et zéro requête', async () => {
    sessioner('xyz')
    const res = await route.get()

    expect(res.status).toBe(403)
    expect(etat.selects).toHaveLength(0)
  })

  it('B6 — session absente ⇒ 401 et zéro requête', async () => {
    sessioner(BNA, false)
    const res = await route.get()

    expect(res.status).toBe(401)
    expect(etat.selects).toHaveLength(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// C) DELETE
// ───────────────────────────────────────────────────────────────────────────

describe('C) DELETE — scoping', () => {
  it('C1 — la lecture ET la suppression portent `id` + `entreprise_id`', async () => {
    sessioner(BNA)
    const res = await route.delete(DOC_BNA)

    expect(res.status).toBe(200)
    expect(predicats(etat.selects[0], 'documents_compta')).toEqual([
      ['id', DOC_BNA],
      ['entreprise_id', BNA],
    ])
    expect(predicats(etat.deletes[0], 'documents_compta')).toEqual([
      ['id', DOC_BNA],
      ['entreprise_id', BNA],
    ])
  })

  it('C2 — document d’un AUTRE tenant ⇒ 404 et la ligne SURVIT', async () => {
    sessioner(BNA)
    const res = await route.delete(DOC_TEST)

    expect(res.status).toBe(404)
    expect(etat.deletes).toHaveLength(0)
    expect(etat.tables.documents_compta.map((d) => d.id)).toContain(DOC_TEST)
  })

  it('C3 — aucun fichier d’un autre tenant n’est touché', async () => {
    sessioner(BNA)
    await route.delete(DOC_TEST)

    expect(etat.removes).toHaveLength(0)
  })

  it('C4 — contexte absent ⇒ 403, ZÉRO suppression, ZÉRO requête', async () => {
    sessioner(undefined)
    const res = await route.delete(DOC_BNA)

    expect(res.status).toBe(403)
    expect(etat.deletes).toHaveLength(0)
    expect(etat.selects).toHaveLength(0)
  })

  it('C5 — un id mal formé ⇒ 400 sans requête', async () => {
    sessioner(BNA)
    const res = await route.delete('pas-un-uuid')

    expect(res.status).toBe(400)
    expect(etat.selects).toHaveLength(0)
    expect(etat.deletes).toHaveLength(0)
  })

  it('C6 — le tenant TEST supprime le sien (non-régression du nominal)', async () => {
    sessioner(TEST)
    const res = await route.delete(DOC_TEST)

    expect(res.status).toBe(200)
    expect(etat.tables.documents_compta.map((d) => d.id)).toEqual([DOC_BNA])
  })
})

// ───────────────────────────────────────────────────────────────────────────
// D) STORAGE — cohérence en cas d'échec
// ───────────────────────────────────────────────────────────────────────────

describe('D) Storage — pas d’orphelin', () => {
  it('D1 — échec INSERT après upload ⇒ le fichier Stocké est COMPENSÉ (supprimé)', async () => {
    sessioner(BNA)
    etat.erreurInsert = {
      table: 'documents_compta',
      message: 'null value in column "entreprise_id" violates not-null constraint',
    }
    const res = await route.post(formData(true))

    expect(res.status).toBe(500)
    expect(etat.uploads).toHaveLength(1)
    expect(etat.removes).toHaveLength(1)
    // Le chemin compensé est EXACTEMENT celui qui a été uploadé.
    expect(etat.removes[0].chemins).toEqual([etat.uploads[0].chemin])
    expect(etat.removes[0].bucket).toBe(etat.uploads[0].bucket)
  })

  it('D2 — échec INSERT ⇒ aucune ligne documents_compta (état cohérent)', async () => {
    sessioner(BNA)
    etat.erreurInsert = { table: 'documents_compta', message: 'boom' }
    await route.post(formData(true))

    expect(
      etat.tables.documents_compta.filter((d) => String(d.id).startsWith('documents_compta-'))
    ).toHaveLength(0)
  })

  it('D3 — échec UPLOAD ⇒ aucun document en base ET aucune compensation inutile', async () => {
    sessioner(BNA)
    etat.erreurUpload = { message: 'bucket plein' }
    const res = await route.post(formData(true))

    expect(res.status).toBe(500)
    expect(etat.inserts).toHaveLength(0)
    expect(etat.removes).toHaveLength(0)
  })

  it('D4 — `file_url` fourni (OCR) ⇒ AUCUN upload et AUCUNE compensation', async () => {
    // Le serveur ne possède pas ce fichier : il ne doit surtout pas le supprimer.
    sessioner(BNA)
    const fd = formData(true)
    fd.append('file_url', `${BASE}/tickets/ia-ocr/existe.jpg`)
    etat.erreurInsert = { table: 'documents_compta', message: 'boom' }
    const res = await route.post(fd)

    expect(res.status).toBe(500)
    expect(etat.uploads).toHaveLength(0)
    expect(etat.removes).toHaveLength(0)
  })

  it('D5 — le chemin uploadé est unique (deux envois ne se collisionnent pas)', async () => {
    sessioner(BNA)
    await route.post(formData(true))
    await route.post(formData(true))

    expect(etat.uploads).toHaveLength(2)
    expect(etat.uploads[0].chemin).not.toBe(etat.uploads[1].chemin)
  })

  it('D6 — DELETE supprime le fichier du document EFFECTIVEMENT supprimé', async () => {
    sessioner(BNA)
    await route.delete(DOC_BNA)

    expect(etat.removes).toHaveLength(1)
    expect(etat.removes[0].chemins).toEqual(['documents-compta/bna.png'])
  })
})

// ───────────────────────────────────────────────────────────────────────────
// E) Miroir `depenses_chantier` — plus d'erreur masquée
// ───────────────────────────────────────────────────────────────────────────

describe('E) Miroir depenses_chantier', () => {
  it('E1 — échec du miroir ⇒ 500 EXPLICITE, jamais un 2xx', async () => {
    sessioner(BNA)
    etat.erreurInsert = { table: 'depenses_chantier', message: 'dépense refusée' }
    const res = await route.post(formData(false))

    expect(res.status).toBe(500)
    const body = corps(await res.json())
    expect(String(body.error)).toContain('dépense miroir')
    expect(String(body.error)).toContain('dépense refusée')
  })

  it('E2 — échec du miroir ⇒ le document reste bien créé (l’erreur est partielle)', async () => {
    sessioner(BNA)
    etat.erreurInsert = { table: 'depenses_chantier', message: 'dépense refusée' }
    const res = await route.post(formData(false))

    const body = corps(await res.json())
    expect(body.data).not.toBeNull()
    expect(etat.tables.documents_compta).toHaveLength(3)
  })

  it('E3 — le miroir n’est créé que si un chantier est présent', async () => {
    sessioner(BNA)
    await route.post(formData(true))

    expect(etat.inserts.map((i) => i.table)).not.toContain('depenses_chantier')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// F) Garde structurel — AUTO-VÉRIFIÉ
//
// Un test de source peut « détecter » n'importe quoi si son motif est mal
// écrit : les 6 tests F1-F6 passeraient alors À VIDE. Chaque motif est donc
// confronté à un contre-exemple construit DANS le test (F3, F6) : le motif doit
// le signaler. C'est la condition pour que ces tests valent quelque chose.
//
// Ces tests ne remplacent pas A-G : ils ferment la porte à une réintroduction
// qui laisserait le comportement nominal intact (par exemple réintroduire un
// `as TablesInsert` ou remplacer le claim par une constante).
// ───────────────────────────────────────────────────────────────────────────

const CHEMIN_ROUTE = join(process.cwd(), 'app/api/documents-compta/route.ts')
const sourceRoute = readFileSync(CHEMIN_ROUTE, 'utf8')

/** Extrait le corps d'un handler exporté, du `export` au suivant. */
function blocHandler(nom: string, source = sourceRoute): string {
  const debut = source.indexOf(`export async function ${nom}`)
  if (debut < 0) return ''
  const suite = source.indexOf('\nexport ', debut + 1)
  return source.slice(debut, suite < 0 ? source.length : suite)
}

const PREDICAT_TENANT = /\.eq\(\s*['"]entreprise_id['"]\s*,/
const PREDICAT_TENANT_G = /\.eq\(\s*['"]entreprise_id['"]\s*,/g
const UTILISE_VERIFIER_SESSION = /verifierSession/
/** Retire `//` et `/* *\/` : un nom cité en commentaire n'est pas un usage. */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
const routeSansCommentaires = sansCommentaires(sourceRoute)

describe('F) Garde structurel auto-vérifié', () => {
  it('F1 — le GET porte .eq("entreprise_id", …)', () => {
    expect(blocHandler('GET')).toMatch(PREDICAT_TENANT)
  })

  it('F2 — le DELETE porte .eq("entreprise_id", …) sur la LECTURE et sur la SUPPRESSION', () => {
    const bloc = blocHandler('DELETE')
    expect(bloc.match(PREDICAT_TENANT_G) ?? []).toHaveLength(2)
  })

  it('F3 — AUTO-VÉRIFICATION : F1 et F2 détectent une copie réellement non scopée', () => {
    // Contre-exemples : on retire le prédicat de la VRAIE source.
    const getSans = blocHandler('GET').replace(/[ \t]*\.eq\(\s*['"]entreprise_id['"]\s*,[^\n]*\n/g, '\n')
    const delSans = blocHandler('DELETE').replace(/[ \t]*\.eq\(\s*['"]entreprise_id['"]\s*,[^\n]*\n/g, '\n')

    // 1) le motif a bien retiré quelque chose…
    expect(getSans).not.toBe(blocHandler('GET'))
    expect(delSans).not.toBe(blocHandler('DELETE'))
    // 2) …et le détecteur le voit (sinon F1/F2 passeraient à vide).
    expect(getSans).not.toMatch(PREDICAT_TENANT)
    expect(delSans.match(PREDICAT_TENANT_G) ?? []).toHaveLength(0)
  })

  it('F4 — le POST fournit explicitement entreprise_id dans le payload documents_compta', () => {
    const bloc = blocHandler('POST')
    const insert = bloc.slice(bloc.indexOf(".from('documents_compta')"))
    expect(insert.slice(0, insert.indexOf('.select()'))).toMatch(/entreprise_id:\s*entrepriseId/)
  })

  it('F5 — AUCUN cast `as TablesInsert<"documents_compta">` dans toute la route', () => {
    expect(routeSansCommentaires).not.toMatch(/as TablesInsert<"documents_compta">/)
  })

  it('F6 — `verifierSession` n’est PLUS utilisé (elle ne fournit aucun tenant)', () => {
    // Le nom est cité dans un commentaire de la route : c'est le CODE, commentaires
    // retirés, qui doit être exempt. Sans ce filtre, F6 échouerait pour une
    // raison purement documentaire.
    expect(routeSansCommentaires).not.toMatch(UTILISE_VERIFIER_SESSION)
  })

  it('F7 — AUTO-VÉRIFICATION : F5 et F6 détectent leurs contre-exemples', () => {
    const avecCast = sansCommentaires(
      sourceRoute.replace(
        "        categorie,\n        entreprise_id: entrepriseId,\n      })",
        '        categorie,\n      } as TablesInsert<"documents_compta">)'
      )
    )
    expect(avecCast).toMatch(/as TablesInsert<"documents_compta">/)

    const avecVerifier = sansCommentaires(
      sourceRoute.replace(
        "import { createClient } from '@/lib/supabase/server';",
        "import { createClient } from '@/lib/supabase/server';\nimport { verifierSession } from '@/lib/auth';"
      )
    )
    expect(avecVerifier).toMatch(UTILISE_VERIFIER_SESSION)
  })

  it('F8 — le tenant n’est jamais écrit en dur (aucun UUID littéral dans la route)', () => {
    const litteraux = sourceRoute.match(
      /['"][0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}['"]/gi
    )
    expect(litteraux).toBeNull()
  })
})
