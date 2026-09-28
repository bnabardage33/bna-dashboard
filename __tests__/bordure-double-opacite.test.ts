// =============================================================================
// LOT 2F-2 — `border-white/10/50` : classe Tailwind inexistante
// =============================================================================
//
// Le défaut. Une classe Tailwind n'accepte qu'UN modulateur d'opacité. La classe
// `border-white/10/50` en contient deux : Tailwind n'en émet AUCUNE règle.
//
// Conséquence mesurée. Le reset de Tailwind (`*, ::after, ::before { border: 0
// solid }`) ne fixe pas `border-color`, qui reste à sa valeur initiale
// `currentColor`. La classe `border` (ou `border-t`, `border-b`) pose ensuite
// `border-style` et `border-width: 1px`, mais aucune classe `border-*` n'étant
// valide, la bordure s'affiche donc à la COULEUR DU TEXTE, en pleine
// intensité. Sur une application en thème sombre, c'est un trait quasi blanc.
//
// Ce que la sonde Tailwind 4.3.3 répond, sur le vrai `app/globals.css` :
//
//   border-white/10/50   AUCUNE REGLE
//   border-white/10      border-color: color-mix(in srgb, #fff 10%, transparent)
//
// Correction retenue : `border-white/10`, la classe déjà dominante du dépôt
// (284 occurrences). Elle est bien émise par Tailwind, et elle correspond à ce
// que ces six sites sont : des cartes et des filets de séparation discrets.
// Choisir `border-white/50` aurait été recevable au plan syntaxique mais aurait
// introduit un niveau d'opacité présent nulle part ailleurs sur des filets de
// ce type.
//
// CE QUI RESTE OUVERT, ET QUE CE TEST EMPÊCHE D'OUBLIER. Le même défaut existe
// ailleurs, et ce lot n'a PAS mandat pour le corriger :
//
//   border-white/10/60   14 occurrences   (6 fichiers)
//   border-white/10/80    5 occurrences   (1 fichier)
//   border-white/10/40    1 occurrence    (1 fichier)
//   bg-white/10/60        2 occurrences   (1 fichier)   <- FOND, pas bordure
//                        ---
//                        22 occurrences
//
// Elles sont comptées et verrouillées en fin de fichier. `bg-white/10/60` est le
// cas le plus différent : faute de règle émise, le fond reste à sa valeur
// initiale `transparent`, et le corriger ferait APPARAÎTRE un fond blanc à 10 %
// là où il n'y a rien aujourd'hui. Ce n'est pas la même correction que pour une
// bordure, et cela demande un arbitrage à part.
// =============================================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RACINE = process.cwd()
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf-8')
const cssGlobal = lire('app/globals.css')

const SITES_CORRIGES = [
  'app/bureau/sav/page.tsx',
  'app/bureau/portails-clients/page.tsx',
  'app/(dashboard)/finance/components/TresorerieWidget.tsx',
  'app/(dashboard)/finance/components/UrsaafWidget.tsx',
  'components/CommandeModal.tsx',
]

/**
 * Classe à double opacité : couleur, puis `/`, puis deux nombres.
 *
 * Le séparateur après le nom de couleur est forcément `/`, jamais `-` : sinon
 * `border-cyan-500/30` (couleur `cyan`, nuance `500`, opacité `30`) serait pris
 * pour une double opacité. C'est exactement le faux positif que ce motif avait
 * donné au premier essai, sur `app/espace-client/[code_acces]/page.tsx`.
 */
const DOUBLE_OPACITE = /\b[a-z]+(?:-[a-z]+)*-(?:[a-z]+|\[#[0-9A-Fa-f]{3,8}\])\/(\d{1,3})\/(\d{1,3})\b/g

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

/** Classe de bordure à double opacité encore présente, avec son effectif. */
function occurrencesRestantes(motif: RegExp): Map<string, number> {
  const out = new Map<string, number>()
  for (const f of SOURCES) {
    for (const m of lire(f).matchAll(motif)) {
      out.set(m[0], (out.get(m[0]) ?? 0) + 1)
    }
  }
  return out
}

describe('2F-2 · la classe remplacante est réellement émise par Tailwind', () => {
  it('border-white/10 est émise, border-white/10/50 ne l\'est pas', async () => {
    const { compile } = await import('tailwindcss')
    const path = await import('node:path')
    const indexTw = path.join(RACINE, 'node_modules/tailwindcss/index.css')
    const compilateur = await compile(cssGlobal, {
      base: RACINE,
      loadStylesheet: async (id: string, base: string) => {
        if (id === 'tailwindcss') {
          return { path: indexTw, base: path.dirname(indexTw), content: readFileSync(indexTw, 'utf-8') }
        }
        const p = path.resolve(base, id)
        return { path: p, base: path.dirname(p), content: readFileSync(p, 'utf-8') }
      },
      loadModule: async () => {
        throw new Error('modules CSS non supportés par cette sonde')
      },
    })
    // Un seul build : les deux classes sont desbordures de même nature.
    const sheet = compilateur.build(['border', 'border-t', 'border-b', 'border-white/10', 'border-white/10/50']) as unknown as string
    const corps = (sel: string) => {
      const e = '.' + sel.replace(/[.[\]/%#]/g, (c) => '\\' + c)
      const m = sheet.match(new RegExp('(^|[{}])\\s*' + e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'))
      return m ? m[2].trim().replace(/\s+/g, ' ') : null
    }

    const avant = corps('border-white/10/50')
    expect(avant, 'border-white/10/50 émettrait une règle : le diagnostic du lot est caduc').toBeNull()

    const apres = corps('border-white/10')
    expect(apres, 'border-white/10 n\'est pas émise : le correctif ne_peut pas fonctionner').not.toBeNull()
    expect(apres).toMatch(/border-color/)

    // La couleur doit être un blanc à 10 %, pas une reprise de currentColor.
    expect(apres).toMatch(/#fff 10%/)
  })
})

describe('2F-2 · les six sites corrigés', () => {
  it('plus aucune occurrence de border-white/10/50 dans l\'application', () => {
    const restants: string[] = []
    for (const f of SOURCES) {
      const n = lire(f).split('border-white/10/50').length - 1
      if (n > 0) restants.push(`${f} : ${n}`)
    }
    expect(restants, `border-white/10/50 subsiste :\n${restants.join('\n')}`).toEqual([])
  })

  it('les cinq fichiers portent bien border-white/10', () => {
    for (const f of SITES_CORRIGES) {
      expect(lire(f), `${f} ne porte pas border-white/10`).toContain('border-white/10')
    }
  })

  it('aucune ligne des fichiers corrigés ne porte de classe à double opacité', () => {
    for (const f of SITES_CORRIGES) {
      for (const ligne of lire(f).split('\n')) {
        expect(ligne, `${f} : classe à double opacité`).not.toMatch(/\/(\d{1,3})\/\d{1,3}\b/)
      }
    }
  })
})

// -----------------------------------------------------------------------------
// Le reliquat, compté et verrouillé
// -----------------------------------------------------------------------------

describe('2F-2 · reliquat à double opacité, hors mandat', () => {
  it('les 22 occurrences restantes sont exactement celles mesurées', () => {
    const parClasse = occurrencesRestantes(DOUBLE_OPACITE)
    const attendu = new Map([
      ['border-white/10/60', 14],
      ['border-white/10/80', 5],
      ['border-white/10/40', 1],
      ['bg-white/10/60', 2],
    ])
    expect([...parClasse.entries()].sort()).toEqual([...attendu.entries()].sort())

    const total = [...parClasse.values()].reduce((a, b) => a + b, 0)
    expect(total).toBe(22)
  })

  it('aucune n\'est dans une vue d\'impression ou espace-client', () => {
    // Si l'une l'était, le décompte ci-dessus changerait de périmètre : mieux
    // vaut le dire explicitement que le laisser passer inaperçu.
    const interdit =
      /BonCommandePDF|DocumentPDF|FicheDebitPDF|LettreRelancePDF|PVReceptionPDF|RapportIntemperiesPDF|RapportSAVPDF|rapports\/RapportClientPrint|exports\/[A-Za-z]*PDF/
    for (const f of SOURCES) {
      if (interdit.test(f) || f.includes('espace-client')) {
        for (const m of lire(f).matchAll(DOUBLE_OPACITE)) {
          throw new Error(`${f} : ${m[0]} — le décompte du reliquat est faux`)
        }
      }
    }
  })
})
