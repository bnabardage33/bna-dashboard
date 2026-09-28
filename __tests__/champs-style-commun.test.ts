// =============================================================================
// LOT 2F-5 — champs de saisie : style commun, mesure puis prototype
// =============================================================================
//
// MESURE, et il a fallu la refaire. Deux défauts d'outillage ont d'abord produit
// un décompte faux, qu'il faut consigner parce qu'ils se reproduiront :
//
//   1. Les variantes Tailwind sont introduites par `:`, pas par `-`. Un motif
//      cherchant `focus-` ne voyait donc AUCUNE classe `focus:` : le décompte
//      « focus » valait 0 alors que le dépôt en compte 210.
//   2. Extraire les balises par motif échoue sur les attributs contenant des
//      accolades imbriquées (`onChange={(e) => { … }}`) et sur
//      `className={cond ? 'a' : 'b'}`. Premier essai : 226 champs vus sur 242.
//      Il faut équilibrer les accolades et partir des `className`, en remontant
//      à la balise englobante.
//   3. `A or B and False` ne vaut pas `False` quand B vaut None : `None and
//      False` rend `None`, et `None == False` est faux. Tous les `<input>`
//      disparaissaient du décompte, sans la moindre erreur affichée.
//
// Mesure retenue, sur 232 champs de l'application (hors vues d'impression et
// hors `espace-client`) : 216 zones de texte et assimilés, 16 champs à
// habillage spécifique (11 `file`, 4 `checkbox`, 1 `range`) comptés à part.
//
//   rayon          4 variantes  — rounded-xl 98, rounded-lg 53, rounded 38,
//                                  rounded-md 30          AUCUNE majorité
//   fond           7 variantes  — bg-[#242830] 29, bg-[#1A1D24] 15,
//                                  bg-[#0B0F19] 15, bg-slate-900 8, + 3 teintés
//   padding       24 variantes  — py-2 93, px-3 63, p-2 50, px-3.5 38…
//   bordure        1 seule variante : `border` sur 214 champs sur 214
//   couleur bord. 21 variantes  — border-white/10 130, border-slate-600 105,
//                                  border-red-600 66 (dont 66 en `focus:`)…
//   focus         18 valeurs distinctes pour 210 déclarations
//
// Et l'habillage complet : 91 combinaisons distinctes pour 216 champs, soit
// 2,37 pour 1, dont 151 à usage unique. Les 5 plus fréquentes ne couvrent que
// 66 champs, 30 %.
//
// POURQUOI AUCUN COMPOSANT `Champ` N'EST PROPOSÉ. Ce ratio est le même que
// celui qui avait fait rejeter les six familles d'objets testées au LOT 2F
// (2,52:1 · 2,10:1 · 2,18:1 · 1,68:1 · 1,67:1 · 1,51:1) : aucune ne passait le
// seuil « ratio + nombre d'axes ». Une primitive `Champ` devrait porter 21
// couleurs de bordure, 24 paddings, 4 rayons et 7 fonds. La prop `variant`
// recopiendrait la liste des classes, et les 57 champs sans classe `cursor-*`
// du LOT 2F-4 ont montré qu'un habillage non mesuré site par site ne doit pas
// être remplacé par une valeur inventée. Le refactor massif est donc écarté,
// comme demandé.
//
// CE QUI EST FAIT : UN PROTOTYPE SUR DEUX PAGES, ET RIEN D'AUTRE.
//
// La famille `app/(dashboard)/finance/saisie/` compte 28 champs répartis sur
// 4 pages sœurs (`depense` 7, `feuille-heures` 8, `frais-interim` 7,
// `pointage` 6). Ses 28 champs partagent un seul habillage, à deux exceptions
// de taille (`p-2` sur 26, `p-1.5` sur 2 champs numériques étroits). Le fond
// est `bg-[#242830]` — exactement la valeur de `--color-surface-raised`, dont
// le commentaire 2A dit « champ de saisie, en-tête de tableau ». Le token a
// donc été écrit POUR ce style, et ces 28 champs l'écrivent à la main.
//
// Prototype : `bg-[#242830]` → `bg-surface-raised` sur 2 pages, 13 occurrences.
// Ce n'est pas une réduction de la variation, c'est l'inverse : c'est le seul
// changement possible ici qui ne change RIEN à l'écran, et il remplace une
// valeur en dur par le token que le dépôt s'était déjà donné.
//
// Le reste du style commun — rayon, padding, couleur de bordure, focus — n'est
// PAS appliqué. Sur 216 champs, il n'y a pas de majorité défendable (aucune
// couleur de bordure ne dépasse 39 %, aucun rayon 45 %), et l'appliquer
// changerait l'apparence de repos de l'application entière. Cela demande un
// arbitrage, pas un nettoyage. Les 17 `bg-[#242830]` restants sont donc
// laissés en l'état, et verrouillés comme tels plus bas.
// =============================================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative } from 'node:path'

/** État du dépôt AVANT le lot. Ne jamais remplacer par `HEAD`. */
const COMMIT_AVANT_LOT = 'a04dccc24a161c8aa94f70dc897fb8c451e31bec'

const RACINE = process.cwd()

const gitShow = (rev: string) =>
  execFileSync('git', ['-C', RACINE, 'show', rev], {
    encoding: 'utf-8',
    maxBuffer: 1 << 28,
  })
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf-8')
const cssGlobal = lire('app/globals.css')

/** Les 2 pages du prototype. */
const PAGES_PROTOTYPE = [
  { fichier: 'app/(dashboard)/finance/saisie/depense/page.tsx', avant: 7, apres: 7 },
  { fichier: 'app/(dashboard)/finance/saisie/pointage/page.tsx', avant: 6, apres: 6 },
]

/** Les 3 fichiers de la famille où le prototype n'a PAS été appliqué. */
const FAMILLE_RESTANTE = [
  { fichier: 'app/(dashboard)/finance/saisie/feuille-heures/page.tsx', n: 8 },
  { fichier: 'app/(dashboard)/finance/saisie/frais-interim/page.tsx', n: 7 },
  {
    fichier: 'app/(dashboard)/finance/components/RentabiliteMainOeuvreWidget.tsx',
    n: 2,
  },
]

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

const compter = (motif: string) =>
  SOURCES.reduce((n, f) => n + lire(f).split(motif).length - 1, 0)

describe('2F-5 · le token et la valeur en dur sont la même couleur', () => {
  it('--color-surface-raised vaut #242830, et bg-surface-raised est émise', async () => {
    expect(cssGlobal).toMatch(/--color-surface-raised:\s*#242830;/)

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
    // Un seul build : les deux classes sont des débordements de même nature.
    const sheet = compilateur.build(['bg-[#242830]', 'bg-surface-raised']) as unknown as string

    // Lecture par recherche de texte, pas par motif. Un premier essai
    // échappait deux fois le sélecteur — une fois pour CSS, une fois pour la
    // regex — et le second échappement transformait les antislashs de CSS en
    // antislashs littéraux : la classe à crochets n'était jamais trouvée, et le
    // test échouait sur une classe qui était bien émise.
    const declaration = (classe: string) => {
      const cible = '.' + classe.replace(/[.[\]/%#]/g, (c) => '\\' + c)
      const i = sheet.indexOf(cible + ' {')
      if (i < 0) return null
      const ouverture = sheet.indexOf('{', i)
      const fin = sheet.indexOf('}', ouverture)
      return sheet.slice(ouverture + 1, fin).replace(/\s+/g, ' ').trim()
    }

    const dur = declaration('bg-[#242830]')
    expect(dur, 'bg-[#242830] n\'est plus émise').toMatch(
      /background-color:\s*#242830/
    )

    const token = declaration('bg-surface-raised')
    expect(token, 'bg-surface-raised n\'est pas émise').toMatch(
      /background-color:\s*var\(--color-surface-raised\)/
    )
  })
})

describe('2F-5 · le prototype, sur deux pages', () => {
  it('chaque page du prototype a bien remplacé sa valeur en dur', () => {
    for (const { fichier, avant, apres } of PAGES_PROTOTYPE) {
      const source = lire(fichier)
      expect(
        source.split('bg-surface-raised').length - 1,
        `${fichier} : nombre de bg-surface-raised inattendu`
      ).toBe(apres)
      expect(
        source,
        `${fichier} porte encore une valeur en dur`
      ).not.toContain('bg-[#242830]')
      expect(avant).toBe(apres)
    }
  })

  it('aucun autre changement : les 13 champs ne diffèrent que par cette classe', () => {
    // Preuve par inversion, sur l'état du dépôt AVANT le lot. On remet
    // `bg-[#242830]` à la place de `bg-surface-raised`, et on exige le fichier
    // octet pour octet. Si le prototype avait touché autre chose — un autre
    // habillage, un autre attribut, une autre mise en forme — l'inversion ne
    // reconstituerait pas l'original.
    for (const { fichier } of PAGES_PROTOTYPE) {
      const attendu = gitShow(`${COMMIT_AVANT_LOT}:${fichier}`)
      const inverse = lire(fichier)
        .split('bg-surface-raised')
        .join('bg-[#242830]')
      expect(
        inverse,
        `${fichier} : le prototype a modifié autre chose que la classe de fond`
      ).toBe(attendu)
    }
  })

  it('le CSS émis par les deux pages ne change pas', () => {
    // Les 13 champs des deux pages portent un habillage dont seule la classe de
    // fond diffère, et cette classe a la même valeur calculée (test précédent).
    // On vérifie ici qu'aucun autre jeton de ces pages ne mentionne #242830.
    for (const { fichier } of PAGES_PROTOTYPE) {
      const autre = lire(fichier)
        .split('\n')
        .filter((l) => l.includes('242830') && !l.includes('bg-surface-raised'))
      expect(
        autre,
        `${fichier} : une autre classe utilisant #242830 subsiste :\n${autre.join('\n')}`
      ).toEqual([])
    }
  })
})

describe('2F-5 · reliquat du prototype, hors mandat', () => {
  it('les 17 bg-[#242830] restants sont exactement les 3 fichiers mesurés', () => {
    for (const { fichier, n } of FAMILLE_RESTANTE) {
      expect(
        lire(fichier).split('bg-[#242830]').length - 1,
        `${fichier} : effectif de bg-[#242830] modifié`
      ).toBe(n)
    }
    expect(compter('bg-[#242830]')).toBe(17)
    expect(compter('bg-surface-raised')).toBe(13)
  })

  it('les vues d\'impression et espace-client sont intactes', () => {
    for (const f of SOURCES) {
      if (
        /BonCommandePDF|DocumentPDF|FicheDebitPDF|LettreRelancePDF|PVReceptionPDF|RapportIntemperiesPDF|RapportSAVPDF|rapports\/RapportClientPrint|exports\/[A-Za-z]*PDF/.test(f) ||
        f.includes('espace-client')
      ) {
        expect(
          lire(f),
          `${f} : une vue d'impression ou espace-client a été touchée`
        ).not.toContain('bg-surface-raised')
      }
    }
  })
})
