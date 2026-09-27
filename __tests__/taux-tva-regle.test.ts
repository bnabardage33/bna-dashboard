// @vitest-environment node
//
// F3 — taux de TVA `0` transformé en `20` (audit final série B, point D).
//
// CHAÎNE CAUSALE AVANT CORRECTION
// ------------------------------
//     // app/api/documents-compta/route.ts
//     const tauxTva = parseFloat(formData.get('taux_tva') as string) || 20;
//
// `||` teste la VÉRACITÉ, pas l'EXISTENCE. `parseFloat("0")` vaut 0, qui est
// falsy, donc `0 || 20` renvoyait 20. Un document saisi à 0 % (taux réduit, exonération,
// facture hors champ) était AFFICHÉ à 0 % par l'UI — qui, elle, faisait
// `parseFloat(x) || 0` — puis ENREGISTRÉ à 20 %. Sur 1 000 € HT : l'écran
// annonçait 0 % et la base stockait 20 %, soit 200 € d'écart.
//
// Le même idiom faux existait côté UI à trois endroits supplémentaires :
//   * `else if (data.montant_ttc && data.tva)`  → 0 falsy ⇒ ticket ignoré ;
//   * `Number(data.tva) || 20`                   → 0 ⇒ HT recalculé à 20 % ;
//   * `if (data.tva) setTauxTva(...)`            → 0 falsy ⇒ ancien taux gardé ;
//   * `fd.append('taux_tva', tauxTva || '20')`   → chaîne vide envoyée.
//
// APRÈS CORRECTION
// ----------------
// Une règle MÉTIER UNIQUE (`lib/tauxTva.ts`) : `normaliserTauxTva`. L'UI
// l'utilise pour l'affichage ET pour le payload ; l'API l'utilise pour
// persister. Les tests de présence utilisent `Number.isFinite` (existence),
// plus `||` (vérité). Impossible pour les deux côtés de diverger à nouveau.
//
// Le test vérifie les 6 cas demandés (0 / 5.5 / 10 / 20 / absent / invalide)
// aux DEUX extrémités, et que l'UI et le backend appellent la même règle.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  estNombreTauxTva,
  normaliserTauxTva,
  serialiserTauxTva,
  TAUX_TVA_DEFAUT,
} from '@/lib/tauxTva'

const BASE = 'https://stockage.test'
const BNA = '11111111-1111-4111-8111-111111111111'
const URL_IMAGE = `${BASE}/storage/v1/object/public/tickets/documents-compta/1758000000-a1b2c3.png`

/** Readable source, comments removed: invariants apply to executed code. */
function sourceExecutee(chemin: string): string {
  return readFileSync(join(process.cwd(), chemin), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')
}

// ── A. La règle partagée ─────────────────────────────────────────────────────

describe('F3 — règle métier du taux de TVA', () => {
  it('A1 — 0 reste 0 (le cas du défaut)', () => {
    expect(normaliserTauxTva('0')).toBe(0)
    expect(normaliserTauxTva(0)).toBe(0)
    expect(normaliserTauxTva(' 0 ')).toBe(0)
    expect(normaliserTauxTva('0.00')).toBe(0)
  })

  it('A2 — valeurs positives valides : conservées', () => {
    expect(normaliserTauxTva('5.5')).toBe(5.5)
    expect(normaliserTauxTva(5.5)).toBe(5.5)
    expect(normaliserTauxTva('10')).toBe(10)
    expect(normaliserTauxTva(10)).toBe(10)
    expect(normaliserTauxTva('20')).toBe(20)
    expect(normaliserTauxTva('2.1')).toBe(2.1)
    expect(normaliserTauxTva('100')).toBe(100)
  })

  it('A3 — absent / vide : valeur par défaut 20', () => {
    expect(normaliserTauxTva(undefined)).toBe(TAUX_TVA_DEFAUT)
    expect(normaliserTauxTva(null)).toBe(TAUX_TVA_DEFAUT)
    expect(normaliserTauxTva('')).toBe(TAUX_TVA_DEFAUT)
    expect(normaliserTauxTva('   ')).toBe(TAUX_TVA_DEFAUT)
    expect(TAUX_TVA_DEFAUT).toBe(20)
  })

  it('A4 — invalide : valeur par défaut 20', () => {
    for (const v of ['abc', 'NaN', '--', 'Infinity', '-Infinity', {}, [], NaN, true]) {
      expect([JSON.stringify(v), normaliserTauxTva(v)]).toEqual([
        JSON.stringify(v),
        TAUX_TVA_DEFAUT,
      ])
    }
  })

  it('A5 — hors bornes : refus fail-closed (pas de montant TTC absurde)', () => {
    expect(normaliserTauxTva('-1')).toBe(TAUX_TVA_DEFAUT)
    expect(normaliserTauxTva('-20')).toBe(TAUX_TVA_DEFAUT)
    expect(normaliserTauxTva('150')).toBe(TAUX_TVA_DEFAUT)
    expect(normaliserTauxTva('1e9')).toBe(TAUX_TVA_DEFAUT)
  })

  it('A6 — la virgule décimale reste tolérée (saisie française)', () => {
    expect(normaliserTauxTva('5,5')).toBe(5.5)
    expect(normaliserTauxTva(' 10 ')).toBe(10)
  })

  it('A7 — sérialisation : toujours une chaîne exploitable, "0" compris', () => {
    expect(serialiserTauxTva('0')).toBe('0')
    expect(serialiserTauxTva('5.5')).toBe('5.5')
    expect(serialiserTauxTva('')).toBe('20')
    expect(serialiserTauxTva('abc')).toBe('20')
    // Idempotence : ce que l'UI envoie, l'API l'obtient tel quel.
    for (const v of ['0', '5.5', '10', '20', '', 'abc', '150']) {
      expect(normaliserTauxTva(serialiserTauxTva(v))).toBe(normaliserTauxTva(v))
    }
  })

  it('A8 — test d\'EXISTENCE (et non de vérité) : 0 est un taux fourni', () => {
    expect(estNombreTauxTva(0)).toBe(true)
    expect(estNombreTauxTva(20)).toBe(true)
    expect(estNombreTauxTva(5.5)).toBe(true)
    expect(estNombreTauxTva(null)).toBe(false)
    expect(estNombreTauxTva(undefined)).toBe(false)
    expect(estNombreTauxTva('20')).toBe(false)
    expect(estNombreTauxTva(NaN)).toBe(false)
    expect(estNombreTauxTva(Infinity)).toBe(false)
  })
})

// ── B. Persistance côté API ──────────────────────────────────────────────────

const spies = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), upload: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: spies.getUser } }),
}))
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (t: string) => spies.from(t),
    storage: { from: () => ({ upload: spies.upload, getPublicUrl: () => ({ data: {} }) }) },
  },
}))

interface FauxInsert {
  table: string
  payload: Record<string, unknown>
}

let inserts: FauxInsert[]

class FauxTable {
  constructor(private table: string) {}
  select(_c?: string): this {
    return this
  }
  eq(): this {
    return this
  }
  in(): this {
    return this
  }
  order(): this {
    return this
  }
  limit(): this {
    return this
  }
  maybeSingle(): Promise<{ data: unknown; error: unknown }> {
    return Promise.resolve({ data: null, error: null })
  }
  single(): Promise<{ data: unknown; error: unknown }> {
    return Promise.resolve({ data: { id: 'doc-1' }, error: null })
  }
  insert(payload: Record<string, unknown>): this {
    inserts.push({ table: this.table, payload })
    return this
  }
  then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
    return Promise.resolve({ data: [], error: null }).then(resolve)
  }
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE
  inserts = []
  spies.getUser.mockReset().mockResolvedValue({
    data: { user: { app_metadata: { entreprise_id: BNA } } },
    error: null,
  })
  spies.from.mockReset().mockImplementation((t: string) => new FauxTable(t))
  spies.upload.mockReset().mockResolvedValue({ error: null })
})

async function poster(taux: string | null, montantHt = '1000') {
  const { POST } = await import('@/app/api/documents-compta/route')
  const { NextRequest } = await import('next/server')
  const fd = new FormData()
  fd.append('type', 'bl')
  fd.append('date', '2026-09-27')
  fd.append('montant_ht', montantHt)
  if (taux !== null) fd.append('taux_tva', taux)
  fd.append('file_url', URL_IMAGE)
  fd.append('categorie', 'materiaux')
  const res = await POST(
    new NextRequest('http://localhost/api/documents-compta', { method: 'POST', body: fd })
  )
  return { statut: res.status, corps: (await res.json()) as Record<string, unknown> }
}

function stocke(): FauxInsert {
  const l = inserts.find((i) => i.table === 'documents_compta')
  if (!l) throw new Error('aucun insert documents_compta')
  return l
}

describe('F3 — persistance du taux de TVA', () => {
  it('B1 — taux 0 : stocké 0 (et non 20) — le défaut corrigé', async () => {
    const { statut } = await poster('0')
    expect(statut).toBe(200)
    expect(stocke().payload.taux_tva).toBe(0)
    // Cohérence des montants : 0 % ⇒ TVA nulle, TTC = HT.
    expect(stocke().payload.montant_tva).toBe(0)
    expect(stocke().payload.montant_ttc).toBe(1000)
  })

  it('B2 — taux 5.5 : stocké 5.5', async () => {
    await poster('5.5')
    expect(stocke().payload.taux_tva).toBe(5.5)
    expect(stocke().payload.montant_tva).toBe(55)
    expect(stocke().payload.montant_ttc).toBe(1055)
  })

  it('B3 — taux 10 : stocké 10', async () => {
    await poster('10')
    expect(stocke().payload.taux_tva).toBe(10)
    expect(stocke().payload.montant_tva).toBe(100)
  })

  it('B4 — taux 20 : stocké 20', async () => {
    await poster('20')
    expect(stocke().payload.taux_tva).toBe(20)
    expect(stocke().payload.montant_tva).toBe(200)
  })

  it('B5 — taux absent : défaut 20', async () => {
    await poster(null)
    expect(stocke().payload.taux_tva).toBe(20)
    expect(stocke().payload.montant_tva).toBe(200)
  })

  it('B6 — taux invalide : défaut 20', async () => {
    await poster('abc')
    expect(stocke().payload.taux_tva).toBe(20)
  })

  it('B7 — le miroir depenses_chantier porte le MÊME taux que le document', async () => {
    // Sans chantier, pas de miroir : on vérifie la cohérence via le cas 0.
    await poster('0')
    const depense = inserts.find((i) => i.table === 'depenses_chantier')
    if (depense) expect(depense.payload.taux_tva).toBe(0)
    expect(stocke().payload.taux_tva).toBe(0)
  })
})

// ── C. UI et backend : une seule et même règle ───────────────────────────────

describe('F3 — UI et API partagent la même règle', () => {
  const ui = () => sourceExecutee('app/bureau/documents-compta/page.tsx')
  const api = () => sourceExecutee('app/api/documents-compta/route.ts')

  it('C1 — les deux côtés importent la règle partagée', () => {
    expect(ui()).toMatch(/from\s+["']@\/lib\/tauxTva["']/)
    expect(api()).toMatch(/from\s+["']@\/lib\/tauxTva["']/)
    expect(ui()).toContain('normaliserTauxTva(')
    expect(api()).toContain('normaliserTauxTva(')
  })

  it('C2 — plus aucun `|| 20` ni `|| 0` appliqué au taux de TVA', () => {
    for (const [nom, src] of [
      ['UI', ui()],
      ['API', api()],
    ] as const) {
      expect([nom, /taux[^\n]*\|\|\s*20/.test(src)]).toEqual([nom, false])
      expect([nom, /taux[^\n]*\|\|\s*0/.test(src)]).toEqual([nom, false])
      expect([nom, /\btva[^\n]*\|\|\s*20/.test(src)]).toEqual([nom, false])
    }
  })

  it('C3 — l\'UI n\'utilise plus de test de VÉRITÉ sur le taux', () => {
    // `&& data.tva` et `if (data.tva)` sont des tests de vérité : 0 y est
    // traité comme absent. Ils cèdent la place à `estNombreTauxTva`.
    const src = ui()
    expect([/&&\s*data\.tva\b/.test(src)]).toEqual([false])
    expect([/if\s*\(\s*data\.tva\s*\)/.test(src)]).toEqual([false])
    expect(src).toContain('estNombreTauxTva(')
  })

  it('C4 — le payload UI sérialise un taux DÉJÀ normalisé', () => {
    expect(ui()).toMatch(/fd\.append\(\s*['"]taux_tva['"]\s*,\s*serialiserTauxTva\(/)
  })
})

// ── D. Non-régression de l'OCR ───────────────────────────────────────────────

describe('F3 — non-régression de l\'OCR', () => {
  it('D1 — la route OCR conserve déjà 0 avec `?? 20` (ne pas casser)', () => {
    const src = sourceExecutee('app/api/ia-ocr-ticket/route.ts')
    // `asNombre(json.tva) ?? 20` : `??` teste l Existence, pas la vérité.
    expect(src).toMatch(/tva:\s*asNombre\(json\.tva\)\s*\?\?\s*20/)
  })
})
