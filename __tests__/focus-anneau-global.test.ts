// =============================================================================
// LOT 2F-3 — anneau de focus global et rayons
// =============================================================================
//
// Le défaut. `app/globals.css` déclarait, dans une règle `:focus-visible` :
//
//     outline: 2px solid var(--color-brand);
//     outline-offset: 2px;
//     border-radius: 4px;        ← celle-ci
//
// La règle est écrite HORS de tout `@layer`. Or les déclarations non couchées
// appartiennent à une couche implicite finale, de priorité supérieure à toutes
// les couches nommées (CSS Cascade Level 5, §6.4.4). `:focus-visible` et
// `.rounded-xl` ont la même spécificité (0,1,0) : la couche tranche, et c'est
// donc `border-radius: 4px` qui gagne.
//
// Résultat : au moment du focus, 433 éléments focalisables de l'application
// voyaient leur rayon remplacé par 4 px — dont 21 boutons ronds
// (`rounded-full`) qui perdaient leur circularité, et 203 cartes `rounded-xl`.
//
// Le correctif est le retrait de la SEULE déclaration `border-radius`. Les
// deux déclarations d'`outline` restent inchangées, et la règle reste non
// couchée.
//
// Pourquoi ne pas avoir déplacé la règle dans `@layer base`, solution
// apparemment plus propre ? Parce qu'elle aurait alors perdu contre
// `.outline-none`, qui émet `outline-style: none` et sert 120 fois dans le
// dépôt (31 fichiers). L'anneau de focus aurait disparu de ces 120 sites. La
// cascade est un système à sens unique : donner le dessus à la couche layered
// sur le rayon coûte l'anneau de focus. D'où le retrait surgical.
//
// Ce test verrouille :
//   1. que la règle ne déclare AUCUN `border-radius` ;
//   2. qu'elle reste non couchée, et le reste de son contenu ;
//   3. que, pour chaque rayon du dépôt, la classe de l élément l'emporte au
//      focus — la cascade étant recalculée, pas supposée correcte ;
//   4. que `.outline-none` reste vaincu par la règle (l'anneau ne peut pas
//      disparaître en silence).
// =============================================================================

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postcss from 'postcss'

const RACINE = process.cwd()
const cssGlobal = readFileSync(join(RACINE, 'app/globals.css'), 'utf-8')

/** Les rayons émis par Tailwind dans le dépôt. */
const RAYONS = ['rounded', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-full']

/**
 * Compile avec le VRAI `app/globals.css`.
 *
 * Un compilateur neuf à chaque appel : `compile()` conserve un état de design
 * system qui fuit d'un `build()` à l'autre. Ce défaut a été observé pendant la
 * construction du LOT 2F et produisait des règles fantômes.
 */
async function compiler(): Promise<ReturnType<typeof import('tailwindcss')['compile']>> {
  const { compile } = await import('tailwindcss')
  const path = await import('node:path')
  const indexTw = path.join(RACINE, 'node_modules/tailwindcss/index.css')
  return compile(cssGlobal, {
    base: RACINE,
    loadStylesheet: async (id: string, base: string) => {
      if (id === 'tailwindcss') {
        return {
          path: indexTw,
          base: path.dirname(indexTw),
          content: readFileSync(indexTw, 'utf-8'),
        }
      }
      const p = path.resolve(base, id)
      return { path: p, base: path.dirname(p), content: readFileSync(p, 'utf-8') }
    },
    loadModule: async () => {
      throw new Error('modules CSS non supportés par cette sonde')
    },
  })
}

type Regle = { selecteur: string; couche: string | null; corps: string; ordre: number }

function toutesRegles(css: string): Regle[] {
  const out: Regle[] = []
  let ordre = 0
  postcss.parse(css).walkRules((r) => {
    // `parent` est optionnel sur une règle et peut valoir une racine, qui ne
    // porte ni `name` ni `params`. Le test ne s'intéresse qu'aux règles
    // effectivement posées dans une couche (`@layer`), d'où le test de type.
    const parent = r.parent as
      | { type?: string; name?: string; params?: string }
      | undefined
    out.push({
      selecteur: r.selector.trim(),
      couche:
        parent && parent.type === 'atrule' && parent.name
          ? `@${parent.name} ${parent.params ?? ''}`
          : null,
      // Un nœud peut être une déclaration ou un at-rule ; seules les
      // déclarations portent `prop` et `value`.
      corps: (r.nodes ?? [])
        .map((n) => {
          const d = n as { prop?: string; value?: string }
          return `${d.prop}: ${d.value}`
        })
        .join(' ; '),
      ordre: ordre++,
    })
  })
  return out
}

/**
 * Calcule le `border-radius` effectif d'un élément portant `classeRayon` et
 * focalisé, en appliquant la cascade pour des déclarations normales.
 *
 * Spécificité : `:focus-visible` est une pseudo-classe, soit (0,1,0), exactement
 * comme une classe simple. Elle ne départage donc rien. Restent la couche, puis
 * l'ordre d'émission.
 */
function rayonAuFocus(css: string, classeRayon: string): { gagnant: string; valeur: string } | null {
  const regles = toutesRegles(css)
  const candidates = regles
    .map((r) => {
      const decl = r.corps.split(' ; ').find((d) => d.startsWith('border-radius:'))
      if (!decl) return null
      const applicable = r.selecteur === ':focus-visible' || r.selecteur === '.' + classeRayon
      if (!applicable) return null
      return { ...r, valeur: decl.replace('border-radius:', '').trim() }
    })
    .filter((x): x is Regle & { valeur: string } => x !== null)

  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    // Couche non nommée = couche implicite finale = priorité maximale.
    const ra = a.couche === null ? Number.MAX_SAFE_INTEGER : 0
    const rb = b.couche === null ? Number.MAX_SAFE_INTEGER : 0
    return rb - ra || b.ordre - a.ordre
  })
  return { gagnant: candidates[0].selecteur, valeur: candidates[0].valeur }
}

describe('2F-3 · la règle :focus-visible', () => {
  const regles = toutesRegles(cssGlobal)
  const focus = regles.filter((r) => r.selecteur === ':focus-visible')

  it('existe et est unique', () => {
    expect(focus.length, 'la règle :focus-visible a disparu ou a été dupliquée').toBe(1)
  })

  it('ne déclare aucun border-radius', () => {
    expect(
      focus[0].corps,
      'un border-radius ici écraserait les rounded-* : c\'est le défaut du lot',
    ).not.toMatch(/border-radius/)
  })

  it('conserve l\'anneau de focus et son décalage', () => {
    expect(focus[0].corps).toContain('outline: 2px solid var(--color-brand)')
    expect(focus[0].corps).toContain('outline-offset: 2px')
  })

  it('reste hors de toute couche', () => {
    // Point vérifié ailleurs dans ce fichier : si la règle était couchée,
    // `.outline-none` l'emporterait et l'anneau disparaîtrait de 120 sites.
    expect(focus[0].couche, 'la règle a été placée dans une couche').toBeNull()
  })

  it('ne contient que les deux déclarations attendues', () => {
    expect(focus[0].corps.split(' ; ')).toEqual(['outline: 2px solid var(--color-brand)', 'outline-offset: 2px'])
  })
})

describe('2F-3 · au focus, le rayon de l\'élément l\'emporte', () => {
  it('pour chacun des six rayons, la classe de l\'élément gagne', async () => {
    const sheet = (await (await compiler()).build([...RAYONS, 'button', 'a', 'input'])) as unknown as string
    // garde-fou : une feuille vide ne prouverait rien
    expect(sheet.length, 'la feuille compilee est vide : preuve rejetée').toBeGreaterThan(1000)

    for (const r of RAYONS) {
      const res = rayonAuFocus(sheet, r)
      expect(res, `aucune règle de border-radius pour ${r}`).not.toBeNull()
      expect(
        res!.gagnant,
        `au focus, ${res!.gagnant} l'emporte sur .${r} : le rayon de l'élément est écrasé`,
      ).toBe('.' + r)
    }
  })

  it('rounded-full reste un cercle au focus', async () => {
    const sheet = (await (await compiler()).build([...RAYONS, 'button'])) as unknown as string
    const res = rayonAuFocus(sheet, 'rounded-full')!
    expect(res.valeur).toBe('calc(infinity * 1px)')
  })
})

describe('2F-3 · l\'anneau ne peut pas disparaître en silence', () => {
  it('la règle reste non couchée, donc toujours battante sur .outline-none', async () => {
    const sheet = (await (await compiler()).build(['outline-none', 'button', 'input'])) as unknown as string
    const regles = toutesRegles(sheet)
    const focus = regles.find((r) => r.selecteur === ':focus-visible')!
    const outlineNone = regles.find((r) => r.selecteur === '.outline-none')!
    expect(outlineNone, '.outline-none n\'est plus émise').toBeDefined()
    expect(focus.couche, 'la règle de focus est devenue couchée').toBeNull()
    expect(outlineNone.couche, '.outline-none est devenue non couchée').not.toBeNull()
  })
})
