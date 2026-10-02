// =============================================================================
// LOT 2E — primitive `FloatingActionButton`
// =============================================================================
//
// Contexte. Le LOT 2E audite les 294 `<button>` du dépôt, hors vues d'impression
// et hors `espace-client`. Conclusion de l'audit : AUCUNE primitive `Button`
// générique n'est justifiée. Les 238 `className` en dur se répartissent en 176
// variantes exactes, soit 1,35 par variante, dont 151 à usage unique ; la plus
// grosse famille par fonction (le bouton d'action rouge) compte 44 occurrences
// pour 23 variantes qui diffèrent sur 14 axes indépendants. Une prop `variant`
// devrait porter ces 14 axes : ce serait la liste de classes recopiée.
//
// Une seule famille franchit le seuil : 7 boutons flottants, dans 7 fichiers,
// avec un `className` rigoureusement identique. C'est ce que ce lot extrait, et
// rien d'autre.
//
// Ce test verrouille :
//   1. le RENDU : la classe émise, `aria-label`, `children`, le passe-plat ;
//   2. l'INTERDICTION de `className` (lue dans la source, pas dans le rendu) ;
//   3. l'ÉQUIVALENCE : la classe constante du composant est exactement celle
//      qu'il y avait AVANT la conversion sur chacun des 7 sites — comparaison
//      faite sur un commit de référence ÉPINGLÉ, jamais sur `HEAD` (voir
//      `COMMIT_AVANT_CONVERSION` : `HEAD` désigne l'état courant, donc le
//      changement lui-même, et l'assertion cessait de trouver le bouton le
//      jour où la conversion a été committée) ;
//   4. l'INVENTAIRE : 7 appels, et plus aucun bouton flottant en littéral ;
//   5. ce que l'audit a écarté, pour qu'un lot ultérieur ne le redécouvre pas
//      en croyant innover.
//
// L'extracteur est en TypeScript ; un second, indépendant, existe en Python
// (/tmp/opencode/2e/candidats.py). Aucun des deux ne peut couvrir une erreur de
// l'autre (principe du LOT 2B).
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { createRoot, type Root } from 'react-dom/client'
import { act, type ReactElement } from 'react'
import { FloatingActionButton } from '@/components/ui/FloatingActionButton'

/**
 * Rendu sans `@testing-library/react` : sur React 19 cette bibliothèque appelle
 * `reactDom.render`, supprimé depuis la 18 (`_reactDom.default.render is not a
 * function`). Les tests existants montent avec `createRoot` + `act` ; on fait
 * pareil plutôt que d'ajouter une dépendance.
 */
const racines: Root[] = []
const conteneurs: HTMLElement[] = []

const ENV = globalThis as unknown as {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}

function rendre(element: ReactElement): HTMLElement {
  const conteneur = document.createElement('div')
  document.body.appendChild(conteneur)
  let racine!: Root
  act(() => {
    racine = createRoot(conteneur)
  })
  act(() => {
    racine.render(element)
  })
  racines.push(racine)
  conteneurs.push(conteneur)
  return conteneur
}

beforeAll(() => {
  ENV.IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  while (racines.length) {
    const r = racines.pop()!
    act(() => {
      r.unmount()
    })
  }
  while (conteneurs.length) conteneurs.pop()!.remove()
})

afterAll(() => {
  delete ENV.IS_REACT_ACT_ENVIRONMENT
})

// -----------------------------------------------------------------------------
// Inventaire des sites : liste EXPLICITE de chemins, jamais une sous-chaîne.
// -----------------------------------------------------------------------------

const SITES = [
  'app/bureau/clients/page.tsx',
  'app/bureau/devis-factures/page.tsx',
  'app/bureau/factures/page.tsx',
  'app/bureau/fin-chantier/page.tsx',
  'app/bureau/fournisseurs/page.tsx',
  'app/terrain/chantier/page.tsx',
  'app/terrain/notes/page.tsx',
]

const RACINE = process.cwd()
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf-8')
const sourceComposant = lire('components/ui/FloatingActionButton.tsx')

/** Classe émise par la primitive, lue dans sa source — jamais recopiée ici. */
function classeDuComposant(): string {
  const m = sourceComposant.match(
    /const HABILLAGE\s*=\s*\n?\s*'([^']+)'/
  )
  expect(m, 'la constante HABILLAGE doit être lisible dans la source').toBeTruthy()
  return m![1]
}

/** Début de la classe littérale du bouton flottant, telle qu'elle est avant conversion. */
const DEBUT_CLASSE_FAB = 'fixed bottom-4 right-4 z-40 flex h-14 w-14'

/**
 * Commit dont l'état constitue la référence d'équivalence : celui qui précède
 * la conversion du LOT 2E, c'est-à-dire le parent du commit qui l'introduit.
 *
 * Il est ÉPINGLÉ, et `HEAD` ne doit pas servir de référence. `HEAD` désigne
 * l'état courant, donc le changement lui-même : le jour où la conversion est
 * committée, `HEAD` ne contient plus aucun bouton flottant littéral et
 * l'assertion échoue en searches — c'est exactement ce qui s'est produit. La
 * propriété à vérifier est un fait historique (« la classe de la primitive est
 * celle que portait chaque site avant »), pas une comparaison au présent.
 */
const COMMIT_AVANT_CONVERSION = '96e502c1a6e5e183561aa98e561d5c97359b8102'

/** Contenu d'un fichier tel qu'il était avant la conversion. */
function avantConversion(chemin: string): string {
  return execFileSync('git', ['show', `${COMMIT_AVANT_CONVERSION}:${chemin}`], {
    cwd: RACINE,
    encoding: 'utf-8',
  })
}

/**
 * Index du `>` qui ferme la balise d'ouverture commencée à `i`.
 *
 * Un `onClick={() => …}` contient un `>` : une recherche de `>` par `index`
 * s'arrêterait au milieu de la balise et renverrait un attribut tronqué. D'où
 * le suivi d'état — guillemets, accent grave, accolades imbriquées.
 */
function finDeBalise(src: string, i: number): number {
  let prof = 0
  let guillemet = ''
  for (let j = i; j < src.length; j++) {
    const c = src[j]
    if (guillemet) {
      if (c === '\\') j++
      else if (c === guillemet) guillemet = ''
      continue
    }
    if (c === '"' || c === "'" || c === '`') guillemet = c
    else if (c === '{') prof++
    else if (c === '}') prof--
    else if (c === '>' && prof === 0) return j
  }
  throw new Error(`balise non fermée à partir de l'offset ${i}`)
}

/** Paires `nom` / `valeur` d'une balise, dans l'ordre, accolades respectées. */
function attributs(balise: string): Array<[string, string]> {
  const corps = balise.replace(/^<[A-Za-z][\w.]*/, '').replace(/\/?>$/, '')
  const out: Array<[string, string]> = []
  let k = 0
  while (k < corps.length) {
    if (/\s/.test(corps[k])) {
      k++
      continue
    }
    const m = /^[A-Za-z][A-Za-z0-9:_-]*/.exec(corps.slice(k))
    if (!m) {
      k++
      continue
    }
    const nom = m[0]
    k += nom.length
    while (k < corps.length && /\s/.test(corps[k])) k++
    if (corps[k] !== '=') {
      out.push([nom, '(sans valeur)'])
      continue
    }
    k++
    while (k < corps.length && /\s/.test(corps[k])) k++
    const debut = k
    if (corps[k] === '"' || corps[k] === "'") {
      const g = corps[k]
      k = corps.indexOf(g, k + 1)
      if (k === -1) throw new Error(`guillemet non fermé dans ${balise}`)
      out.push([nom, corps.slice(debut + 1, k)])
      k++
      continue
    }
    if (corps[k] === '{') {
      let prof = 1
      k++
      while (k < corps.length && prof) {
        const c = corps[k]
        if (c === '"' || c === "'" || c === '`') {
          const g = c
          k++
          while (k < corps.length && corps[k] !== g) k += corps[k] === '\\' ? 2 : 1
        } else if (c === '{') prof++
        else if (c === '}') prof--
        k++
      }
      out.push([nom, corps.slice(debut, k)])
      continue
    }
    while (k < corps.length && !/\s/.test(corps[k])) k++
    out.push([nom, corps.slice(debut, k)])
  }
  return out
}

/**
 * Attributs du bouton flottant, `className` exclu — la seule chose que ce lot
 * déplace. Avant conversion la balise s'identifie par son littéral de classe ; après le
 * lot, par le nom de la primitive. Le même extracteur sert pour les deux, ce qui
 * rend la comparaison homogène au lieu de juxtaposer deux méthodes.
 */
function attributsDeFab(src: string): Array<[string, string]> | null {
  const i = src.indexOf(`className="${DEBUT_CLASSE_FAB}`)
  const j = src.indexOf('<FloatingActionButton')
  let debut: number
  if (i !== -1) {
    // Avant conversion : remonter au `<button` qui porte cette classe.
    debut = src.lastIndexOf('<button', i)
    if (debut === -1) return null
    const fin = finDeBalise(src, debut + '<button'.length)
    // Garde : la classe doit être DANS la balise retenue, pas dans la suivante.
    if (i > fin) return null
  } else if (j !== -1) {
    debut = j
  } else {
    return null
  }
  const balise = src.slice(debut, finDeBalise(src, debut + 1) + 1)
  return attributs(balise).filter(([nom]) => nom !== 'className')
}

describe('LOT 2E — FloatingActionButton', () => {
  describe('rendu', () => {
    it('émet exactement la classe HABILLAGE, sans rien y ajouter', () => {
      const c = rendre(
        <FloatingActionButton onClick={() => {}} aria-label="Créer une note">
          +
        </FloatingActionButton>
      )
      const bouton = c.querySelector('button')!
      expect(bouton.className).toBe(classeDuComposant())
    })

    it('rend un <button>, pas un div ni un span', () => {
      const c = rendre(
        <FloatingActionButton onClick={() => {}} aria-label="Créer un devis">
          +
        </FloatingActionButton>
      )
      expect(c.querySelector('button')).toBeTruthy()
      expect(c.querySelector('div')).toBeNull()
    })

    it('reporte aria-label sur le bouton', () => {
      const c = rendre(
        <FloatingActionButton onClick={() => {}} aria-label="Ajouter un client">
          +
        </FloatingActionButton>
      )
      expect(c.querySelector('button')!.getAttribute('aria-label')).toBe(
        'Ajouter un client'
      )
    })

    it('rend les enfants, icône ou texte', () => {
      const c1 = rendre(
        <FloatingActionButton onClick={() => {}} aria-label="Créer une note">
          <span data-testid="glyphe">+</span>
        </FloatingActionButton>
      )
      expect(c1.querySelector('[data-testid="glyphe"]')!.textContent).toBe('+')

      const c2 = rendre(
        <FloatingActionButton onClick={() => {}} aria-label="Créer un chantier">
          <svg data-testid="icone" />
        </FloatingActionButton>
      )
      expect(c2.querySelector('[data-testid="icone"]')).toBeTruthy()
    })

    it('déclenche le onClick fourni', () => {
      let appels = 0
      const c = rendre(
        <FloatingActionButton
          onClick={() => {
            appels += 1
          }}
          aria-label="Créer une facture"
        >
          +
        </FloatingActionButton>
      )
      const bouton = c.querySelector('button')!
      act(() => {
        bouton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(appels).toBe(1)
    })

    it("n'ajoute pas de type : la valeur par défaut reste submit, comme avant", () => {
      const c = rendre(
        <FloatingActionButton onClick={() => {}} aria-label="Ajouter un chantier">
          +
        </FloatingActionButton>
      )
      // Aucun des 7 sites d'origine n'était dans un <form> : la valeur par
      // défaut est inoffensive, et la fixer serait un changement de
      // comportement non demandé par ce lot.
      expect(c.querySelector('button')!.getAttribute('type')).toBeNull()
    })

    it("n'émet pas de style inline, pour que la classe reste Tailwind", () => {
      const c = rendre(
        <FloatingActionButton onClick={() => {}} aria-label="Créer un PV">
          +
        </FloatingActionButton>
      )
      expect(c.querySelector('button')!.getAttribute('style')).toBeNull()
    })
  })

  describe('contraintes de la surface publique', () => {
    it("la prop className n'est pas acceptée", () => {
      // Vérifié dans la source : `className` est retiré du type par `Omit`, et
      // le composant ne le mentionne nulle part ailleurs que dans son type.
      const sansType = sourceComposant.replace(/\/\*[\s\S]*?\*\//g, '')
      expect(sansType).toMatch(/Omit<[\s\S]*?'className'/)
      // Le seul `className=` du composant est celui du `<button>` interne.
      const emissions = sansType.match(/className=/g) ?? []
      expect(emissions.length).toBe(1)
    })

    it("aria-label est déclaré obligatoire dans le type", () => {
      expect(sourceComposant).toMatch(/'aria-label':\s*string/)
    })

    it('le type dérive bien des props natives du <button>', () => {
      expect(sourceComposant).toMatch(/ComponentPropsWithoutRef<'button'>/)
    })
  })

  describe("équivalence avec l'état d'avant la conversion", () => {
    it('le commit de référence est bien accessible', () => {
      // Garde-fou : si l'ancre disparaît — clone superficiel, `git gc` — le
      // test doit échouer bruyamment, pas comparer des chaînes vides et
      // valider une absence de bouton flottant.
      expect(() =>
        execFileSync('git', ['cat-file', '-e', COMMIT_AVANT_CONVERSION], {
          cwd: RACINE,
        })
      ).not.toThrow()
    })

    it("la classe du composant est celle des 7 sites d'origine, au caractère près", () => {
      const actuel = classeDuComposant()
      for (const chemin of SITES) {
        const avant = avantConversion(chemin)
        // Avant la conversion, la classe est écrite en dur, sur une seule ligne.
        const m = avant.match(
          /className="(fixed bottom-4 right-4 z-40 flex h-14 w-14[^"]*)"/
        )
        expect(m, `${chemin} : bouton flottant introuvable avant la conversion`).toBeTruthy()
        expect(m![1], `${chemin} : la classe a changé`).toBe(actuel)
      }
    })

    it('chaque site conserve exactement les attributs de sa balise d’origine', () => {
      // On compare la LISTE COMPLÈTE des attributs de la balise — `className`
      // mis à part, qui est la seule chose que ce lot déplace. Une assertion
      // qui visait la première ligne `onClick` du fichier ne vérifierait rien :
      // six des sept fichiers ont plusieurs boutons, et une régression
      // supprimant le `onClick` du bouton flottant passerait quand même.
      for (const chemin of SITES) {
        const avant = avantConversion(chemin)
        const a = attributsDeFab(avant)
        const b = attributsDeFab(lire(chemin))
        expect(a, `${chemin} : bouton flottant introuvable avant la conversion`).not.toBeNull()
        expect(b, `${chemin} : primitive introuvable`).not.toBeNull()
        expect(b, `${chemin} : attributs modifiés`).toEqual(a)

        const etiquette = b!.find(([nom]) => nom === 'aria-label')
        expect(etiquette, `${chemin} : aria-label absent`).toBeTruthy()
        expect(etiquette![1].length, `${chemin} : aria-label vide`).toBeGreaterThan(0)
      }
    })
  })

  describe('inventaire', () => {
    it('les 7 sites utilisent la primitive', () => {
      for (const chemin of SITES) {
        const src = lire(chemin)
        const appels = src.match(/<FloatingActionButton(?=[\s>])/g) ?? []
        expect(appels.length, `${chemin} : ${appels.length} appel(s)`).toBe(1)
        expect(src, `${chemin} : import manquant`).toContain(
          'FloatingActionButton'
        )
        expect(src, `${chemin} : fermant manquant`).toContain(
          '</FloatingActionButton>'
        )
      }
    })

    it("plus aucune classe de bouton flottant en littéral dans le dépôt", () => {
      for (const chemin of SITES) {
        expect(
          lire(chemin),
          `${chemin} : la classe littérale a survécu`
        ).not.toContain('fixed bottom-4 right-4 z-40 flex h-14 w-14')
      }
    })

    it('aucun fichier hors des 7 sites n’utilise la primitive', () => {
      const attendu = new Set(SITES)
      const trouves: string[] = []
      for (const chemin of lireArborescence()) {
        if (!/\.tsx$/.test(chemin)) continue
        // Le fichier de test cite lui-même la balise : ce n'est pas un usage.
        if (chemin.startsWith('__tests__/')) continue
        if (lire(chemin).includes('<FloatingActionButton')) trouves.push(chemin)
      }
      expect(trouves.sort()).toEqual([...attendu].sort())
    })
  })

  describe('ce que l’audit a écarté, et qui doit le rester', () => {
    it("les 11 boutons de fermeture de modale ne sont PAS factorisés", () => {
      // Décision tracée : leur classe ne fait que 63 caractères, leurs 11
      // gestionnaires diffèrent tous, et aucun ne porte d'aria-label. Les
      // factoriser figerait ce défaut d'accessibilité. Lot à part.
      const cible =
        'rounded-lg p-1.5 text-gray-400 hover:bg-[#1E1E1E] hover:text-white'
      let n = 0
      for (const chemin of lireArborescence()) {
        if (!/\.tsx$/.test(chemin)) continue
        if (lire(chemin).includes(`className="${cible}"`)) n += 1
      }
      expect(n, 'le nombre de fermetures de modale a changé').toBe(7)
    })

    it("aucune primitive Button générique n'a été introduite", () => {
      // Le LOT 2E ne doit pas avoir glissé vers une taxonomie de variants :
      // 1,35 occurrence par variante ne le justifie pas.
      const existe = lireArborescence().some(
        (c) => /components\/ui\/Button\.tsx$/.test(c)
      )
      expect(existe).toBe(false)
    })
  })
})

/** Tous les .tsx du dépôt, hors node_modules, .next et .git. */
function lireArborescence(): string[] {
  const out: string[] = []
  const pile = [RACINE]
  while (pile.length) {
    const dir = pile.pop()!
    let entrees: string[]
    try {
      entrees = readdirSync(dir)
    } catch {
      continue
    }
    for (const e of entrees) {
      if (e === 'node_modules' || e === '.next' || e === '.git') continue
      const chemin = join(dir, e)
      let st
      try {
        st = statSync(chemin)
      } catch {
        continue
      }
      if (st.isDirectory()) pile.push(chemin)
      else out.push(chemin.replace(`${RACINE}/`, ''))
    }
  }
  return out
}
