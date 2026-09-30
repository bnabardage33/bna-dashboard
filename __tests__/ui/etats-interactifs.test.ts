// =============================================================================
// LOT 2F-4 — états interactifs : le curseur des éléments réellement désactivés
// =============================================================================
//
// Ce qui a été mesuré avant d'agir, sur l'application (hors vues d'impression et
// hors `espace-client`) :
//
//   515 balises interactives : 277 `<button>`, 12 `<a>`, 158 `<input>`,
//   52 `<select>`, 16 `<textarea>`
//   `hover:`        269 occurrences
//   `disabled:`      49 occurrences
//   `transition`    142 occurrences
//   `cursor-pointer`  6 occurrences
//   éléments réellement désactivés (attribut `disabled`) : 61
//        dont 57 sans aucune classe `cursor-*` du tout
//        dont  2 portant `cursor-pointer` INCONDITIONNEL   <- les 2 sites visés
//   `disabled:cursor-not-allowed` : 9 occurrences, sur 9 sites distincts
//
// Le défaut est donc étroit et bien décrit : sur ces 2 sites, `cursor-pointer`
// s'applique aussi quand l'élément est désactivé, et l'interface promet un
// pointeur cliquable sur un bouton qui ne fait rien. Le motif de correction
// existait déjà 9 fois dans le dépôt, sous la forme
// `cursor-pointer disabled:cursor-not-allowed`.
//
// Correction : ajout de `disabled:cursor-not-allowed` sur ces 2 sites, et sur
// ces 2 sites seulement. Vérifié que la cascade limite bien l'effet à l'état
// désactivé (voir le test de spécificité plus bas) : la classe est
// inconditionnelle sur les 2 sites, mais ne s'applique qu'aux éléments
// `:disabled`.
//
// CE QUI N'A PAS ÉTÉ FAIT, ET QUE CE TEST EMPÊCHE DE FAIRE À LA VAILLE.
//
// 1. Aucun `active:` ajouté. Le lot en compte 5, tous préexistants
//    (`active:bg-white/10` ×2, `active:bg-white/5`, `active:cursor-grabbing`,
//    `active:scale-95`), et ce lot n'en a introduit AUCUN. Ajouter un effet
//    d'appui là où le dépôt n'en a jamais eu reviendrait à inventer un
//    comportement, pas à nettoyer. C'est la seule partie de 2F-4 qui aurait été
//    unauthorique, et elle est volontairement vide.
//
// 2. Aucun `cursor-not-allowed` posé sur les 57 éléments désactivés qui n'ont
//    aucune classe `cursor-*`. Ces 57 se répartissent entre `cursor-default`
//    implicite et des styles hérités ; leur curseur au repos n'a pas été mesuré
//    site par site, et ajouter une classe sans cette mesure reviendrait à
//    remplacer une incertitude par une affirmation.
//
// 3. `app/espace-client` est hors périmètre pour tout le lot : il possède son
//    propre thème clair, ses propres couleurs, et son propre curseur. Aucune de
//    ses classes n'a été touchée. C'est verrouillé plus bas.
// =============================================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RACINE = process.cwd()
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf-8')
const cssGlobal = lire('app/globals.css')

/** Les 2 sites corrigés : ils portent `disabled` ET `cursor-pointer` sans condition. */
const SITES_CORRIGES = [
  { fichier: 'app/parametres/page.tsx', ligne: 229 },
  { fichier: 'app/demo-client/page.tsx', ligne: 413 },
]

/** Motif des variantes `active:`, sans confondre `active:` et `peer-active:`. */
const ACTIVE = /(?<![\w:-])active:[a-zA-Z0-9./[\]#%_-]+/g

function fichiersSources(): string[] {
  const out: string[] = []
  const marcher = (abs: string) => {
    for (const nom of readdirSync(abs)) {
      if (nom === 'node_modules' || nom === '.next') continue
      const chemin = join(abs, nom)
      if (statSync(chemin).isDirectory()) marcher(chemin)
      else if (/\.tsx?$/.test(nom)) out.push(relative(RACINE, chemin))
    }
  }
  for (const d of ['app', 'components', 'lib']) marcher(join(RACINE, d))
  return out.sort()
}

const SOURCES = fichiersSources()

function balises(ligne: string): string[] {
  return lire(ligne.split(':')[0])
    .split('\n')
    .map((l, i) => [i + 1, l] as const)
    .filter(([n]) => n === Number(ligne.split(':')[1]))
    .map(([, l]) => l)
}

describe('2F-4 · les deux sites corrigés portent bien la classe', () => {
  it('chaque site a bien cursor-pointer ET disabled:cursor-not-allowed', () => {
    for (const { fichier, ligne } of SITES_CORRIGES) {
      const source = balises(`${fichier}:${ligne}`).join('\n')
      expect(source, `${fichier}:${ligne} ne porte pas cursor-pointer`).toContain('cursor-pointer')
      expect(
        source,
        `${fichier}:${ligne} ne porte pas disabled:cursor-not-allowed`
      ).toContain('disabled:cursor-not-allowed')
    }
  })

  it('ce sont bien deux éléments RÉELLEMENT désactivables', () => {
    // Une classe `disabled:` sur un élément qui ne peut jamais être désactivé
    // ne ferait rien. On vérifie que l'attribut est là.
    for (const { fichier } of SITES_CORRIGES) {
      const source = lire(fichier)
      expect(source, `${fichier} ne comporte aucun attribut disabled`).toMatch(/disabled=/)
    }
    // Le second site est un bouton dont l'activation dépend de l'état du champ.
    const demo = balises('app/demo-client/page.tsx:412').join('\n')
    expect(demo, 'le bouton de /demo-client a perdu sa condition de désactivation')
      .toMatch(/disabled=\{!inputValue\.trim\(\) \|\| isLoading\}/)
  })

  it('les deux sites étaient bien les seuls éléments désactivés portant cursor-pointer', () => {
    // On recompte : un bouton réellement désactivé qui porterait
    // `cursor-pointer` sans `disabled:cursor-not-allowed` serait un troisième
    // site oublié.
    //
    // Deux pièges, tous deux rencontrés. `\bdisabled\b` trouve le mot dans
    // `disabled:opacity-50` du `className` et croyait donc que le bouton était
    // désactivable : il faut un attribut, pas un mot. Et `espace-client` est
    // hors mandat pour tout le lot, il a donc son propre test ci-dessous —
    // l'inclure ici rendrait ce décompte faux.
    const ATTRIBUT_DISABLED = /(?<![\w:.-])disabled(?=[=\s>/])/
    const oublies: string[] = []
    for (const f of SOURCES) {
      if (f.includes('espace-client')) continue
      for (const m of lire(f).matchAll(/<button\b[^>]*>/g)) {
        const balise = m[0]
        if (!ATTRIBUT_DISABLED.test(balise)) continue
        const tokens = (balise.match(/className\s*=\s*"([^"]*)"/)?.[1] ?? '').split(/\s+/)
        if (
          tokens.includes('cursor-pointer') &&
          !tokens.includes('disabled:cursor-not-allowed')
        ) {
          oublies.push(`${f} : ${balise.replace(/\s+/g, ' ').slice(0, 120)}`)
        }
      }
    }
    expect(
      oublies,
      `des boutons désactivés portent encore un curseur cliquable :\n${oublies.join('\n')}`
    ).toEqual([])
  })

  it('espace-client conserve exactement un site non traité, par mandat', () => {
    // `app/espace-client` est exclu du LOT 2F : thème clair, jeu de couleurs
    // propre, curseur propre. Le site ci-dessous a été TROUVÉ par le décompte
    // ci-dessus puis laissé tel quel, délibérément. Il est nommé ici pour que
    // son exclusion soit un choix consigné et non un oubli.
    const fichier = 'app/espace-client/[code_acces]/page.tsx'
    const source = lire(fichier)
    const ATTRIBUT_DISABLED = /(?<![\w:.-])disabled(?=[=\s>/])/
    // L'attribut et le `className` sont sur des lignes différentes : il faut
    // raisonner sur la balise entière, pas sur une ligne. Une première version
    // testait ligne par ligne et ne trouvait rien, sans signaler d'erreur.
    const sites: number[] = []
    for (const m of source.matchAll(/<button\b[^>]*>/g)) {
      const balise = m[0]
      if (!ATTRIBUT_DISABLED.test(balise)) continue
      const tokens = (balise.match(/className\s*=\s*"([^"]*)"/)?.[1] ?? '').split(/\s+/)
      if (tokens.includes('cursor-pointer') && !tokens.includes('disabled:cursor-not-allowed')) {
        sites.push(source.slice(0, m.index).split('\n').length)
      }
    }
    expect(sites, 'le site espace-client a changé : le mandat ou le périmètre a bougé').toEqual([831])
    expect(lire(fichier), 'espace-client ne doit porter aucun disabled:cursor-not-allowed').not.toContain(
      'disabled:cursor-not-allowed'
    )
  })
})

describe('2F-4 · la classe n\'agit que sur l\'état désactivé', () => {
  it('le sélecteur émis porte bien :disabled, et bat .cursor-pointer', async () => {
    const { compile } = await import('tailwindcss')
    const path = await import('node:path')
    const indexTw = path.join(RACINE, 'node_modules/tailwindcss/index.css')
    const compilateur = await compile(cssGlobal, {
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
    const sheet = compilateur.build([
      'cursor-pointer',
      'disabled:cursor-not-allowed',
    ]) as unknown as string

    const selecteurs = [...sheet.matchAll(/^\s*(\.[^\s{]+)\s*\{/gm)].map((m) => m[1])
    const desactive = selecteurs.find((s) => s.includes('cursor-not-allowed'))
    expect(desactive, 'disabled:cursor-not-allowed n\'est pas émise').toBeDefined()
    expect(
      desactive,
      'la classe n\'est pas restreinte à l\'état désactivé : elle changerait le curseur au repos'
    ).toMatch(/:disabled\s*$/)
    expect(selecteurs, '.cursor-pointer n\'est plus émise').toContain('.cursor-pointer')

    // Spécificité comparée. `.disabled\:cursor-not-allowed:disabled` = une classe
    // + une pseudo-classe, soit (0,2,0). `.cursor-pointer` = une classe, soit
    // (0,1,0). Les deux sont dans la même couche `utilities`, donc c'est la
    // spécificité qui départage, et c'est bien la variante désactivée qui gagne.
    const specificite = (sel: string) => (sel.match(/\.[^\s:]+|:{1,2}[a-z-]+/g) ?? []).length
    expect(specificite(desactive as string)).toBeGreaterThan(specificite('.cursor-pointer'))
  })
})

describe('2F-4 · ce qui n\'a pas été fait', () => {
  it('aucune classe active: n\'a été introduite par ce lot', () => {
    // Les 5 `active:` du dépôt sont préexistants. Ce test verrouille le
    // décompte pour qu'un ajout ultérieur se voie.
    const total = SOURCES.reduce(
      (n, f) => n + [...lire(f).matchAll(ACTIVE)].length,
      0
    )
    expect(total).toBe(5)
  })

  it('espace-client est intact : ni active: ni cursor-not-allowed ajoutés', () => {
    const fichier = 'app/espace-client/[code_acces]/page.tsx'
    const source = lire(fichier)
    expect([...source.matchAll(ACTIVE)].length, 'espace-client a reçu un active:').toBe(0)
    expect(source, 'espace-client a reçu un disabled:cursor-not-allowed').not.toContain(
      'disabled:cursor-not-allowed'
    )
  })

  it('les 11 occurrences attendues, réparties sur 9 fichiers, sont inchangées', () => {
    const parFichier = new Map<string, number>()
    for (const f of SOURCES) {
      const n = lire(f).split('disabled:cursor-not-allowed').length - 1
      if (n > 0) parFichier.set(f, n)
    }
    const attendu = new Map<string, number>([
      ['app/bureau/devis-factures/page.tsx', 1],
      ['app/bureau/factures/page.tsx', 1],
      ['app/bureau/sav/[id]/page.tsx', 1],
      ['app/demo-client/page.tsx', 1],
      ['app/parametres/page.tsx', 1],
      ['components/CommandeModal.tsx', 1],
      ['components/RapportClient.tsx', 3],
      ['components/RapportsIntemperiesListe.tsx', 1],
      ['components/ZoneCard.tsx', 1],
    ])
    expect([...parFichier.entries()].sort()).toEqual([...attendu.entries()].sort())
    expect([...parFichier.values()].reduce((a, b) => a + b, 0)).toBe(11)
  })
})
