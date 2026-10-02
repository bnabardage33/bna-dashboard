// __tests__/ui/palette-premium.test.ts
// Charte graphique BNA Bardage — la palette est-elle vraiment appliquée ?
// ============================================================================
//
// POURQUOI CE TEST
//
// Une charte graphique ne tient pas dans les composants : la quasi-totalite
// des couleurs y sont des CLASSES Tailwind (`bg-red-600`, `text-gray-400`).
// Le test `red-600` ne verrait donc rien.
//
// D'ou la mecanique employee : la palette est redefinie dans le bloc `@theme`
// de `app/globals.css`, sur les MEMES noms de classes que le depot emploie
// deja. Les ~190 `bg-red-600`, ~525 `text-gray-400` et ~498 `border-white`
// suivent la nouvelle palette sans qu'un seul de leurs fichiers soit edite.
// C'est ce qui permet de changer les couleurs sans toucher au layout, aux
// grilles, aux espacements ni a l'ordre des blocs.
//
// Ce test verrouille les trois moities de ce contrat :
//
//   1. la palette centrale est bien celle de la charte, valeur par valeur ;
//   2. le mecanisme qui fait suivre les composants existe toujours, et les
//      classes sur lesquelles il agit sont toujours employees ;
//   3. la palette migree ne s'est pas propagatee la ou elle ne devait pas
//      aller — portail client et couleurs metier sont intacts.
//
// CE QUE CE TEST NE FAIT PAS
//
// Il ne verifie pas le rendu : jsdom ne resout ni la cascade CSS ni les
// variables, et les tests existants (`surface-primitive`) ont deja montre
// qu'un test de rendu de couleur ici ne prouverait rien. Il lit les sources.
// La seule verite de rendu est le build, dont le CSS genere est inspecte a
// la main apres coup.

// ── Lecture des sources ─────────────────────────────────────────────────────

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const CSS = readFileSync('app/globals.css', 'utf8')

/**
 * Le code sans ses commentaires.
 *
 * Indispensable ici : ces tests decrivent precisement les valeurs qu'ils
 * protègent, donc un `grep` brut les voit dans leur propre documentation et
 * conclut que la palette n'a pas migree.
 */
function code(fichier: string): string {
  const s = readFileSync(fichier, 'utf8')
  // L'ORDRE EST ESSENTIEL : les lignes «//» d'abord, les blocs «/* */» ensuite.
  //
  // `components/Drawer.tsx` contient ce commentaire de ligne :
  //
  //     // Les six premières sont sous /finance/** et restent couvertes par
  //
  // Le glob `/finance/**` porte un `/*`. Retirer les blocs AVANT les lignes
  // fait ouvrir un commentaire à cet endroit, qui avale alors tout le reste du
  // fichier jusqu'au prochain `*/` : NAV_ITEMS et les groupes disparaissent, et
  // 10 `href` sont comptés au lieu de 27. Le contrôle « 27 routes, 6 groupes »
  // échouerait, mais surtout les contrôles de migration de palette scalleraient
  // du code qu'ils sont censés inspecter.
  const sansLignes = s.replace(/^\s*\/\/.*$/gm, '')
  return sansLignes.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Garde-fou du piege ci-dessus, evalue sur le fichier qui le contient.
 *
 * Sans lui, une regression de `code()` seECTerait sur le nombre de routes :
 * faux positif qui masque une panne reelle. La verite terrain — 27 routes et
 * 6 groupes dans le tiroir — est le contenu de `NAV_ITEMS`.
 */
it('le retrait des commentaires ne perd pas de code (ordre // puis /* */)', () => {
  const brut = readFileSync('components/Drawer.tsx', 'utf8')
  const nu = code('components/Drawer.tsx')
  expect(nu.match(/href: "/g)?.length).toBe(27)
  expect(nu.match(/children: \[/g)?.length).toBe(6)
  // Et le commentaire piége est bien celui qu'on croit.
  expect(brut).toMatch(/\/\/.*\/finance\/\*\*/)
})

/** Tous les .tsx/.ts de l'application, hors dependances. */
function sources(racines: string[]): string[] {
  const trouvees: string[] = []
  for (const racine of racines) {
    const marcher = (d: string) => {
      for (const entree of readdirSync(d, { withFileTypes: true })) {
        const chemin = join(d, entree.name)
        if (entree.isDirectory()) {
          if (entree.name !== 'node_modules') marcher(chemin)
        } else if (entree.name.endsWith('.tsx') || entree.name.endsWith('.ts')) {
          trouvees.push(chemin)
        }
      }
    }
    marcher(racine)
  }
  return trouvees
}

/**
 * `lib/` est dans le perimetre : il produit des `className` (listes de
 * controle du rapport client, entre autres). L'oublier avait laisse un fond
 * `#1A1D24` dans `lib/rapports-client.ts` alors que le reste du depot etait
 * migre — un enonce de test borne a `app/` et `components/` ne l'aurait pas
 * vu.
 */
const SOURCES = sources(['app', 'components', 'lib'])

// Le portail client garde sa propre identite claire : il est hors perimetre.
const HORS_PERIMETRE = (f: string) => f.startsWith(join('app', 'espace-client'))
const APP = SOURCES.filter((f) => !HORS_PERIMETRE(f))

// ─────────────────────────────────────────────────────────────────────────────

describe('charte graphique — la palette centrale', () => {
  /** Les 20 valeurs demandees, une par une. */
  const CHARTE: [string, string][] = [
    // Surfaces
    ['--color-surface-page', '#121212'],
    ['--color-surface', '#1E1E1E'],
    ['--color-surface-raised', '#252525'],
    ['--color-surface-drawer', '#1A1A1A'],
    // Bordures
    ['--color-border', '#2E2E2E'],
    ['--color-divider', '#3A3A3A'],
    // Marque
    ['--color-brand', '#E53935'],
    ['--color-brand-dark', '#C62828'],
    ['--color-brand-light', '#FF6F60'],
    // Encre
    ['--color-ink-title', '#F5F5F5'],
    ['--color-ink', '#E0E0E0'],
    ['--color-ink-muted', '#BDBDBD'],
    ['--color-ink-disabled', '#757575'],
    // Etats
    ['--color-state-success', '#4CAF50'],
    ['--color-state-info', '#42A5F5'],
    ['--color-state-warning', '#FB8C00'],
    ['--color-state-neutral', '#9E9E9E'],
  ]

  for (const [jeton, valeur] of CHARTE) {
    it(`${jeton} vaut ${valeur}`, () => {
      expect(CSS).toMatch(new RegExp(`${jeton}\\s*:\\s*${valeur}\\s*;`, 'i'))
    })
  }

  it('aucun fond n\'est du noir pur #000000', () => {
    expect(CSS).not.toMatch(/--color-surface(?:-page|-raised)?\s*:\s*#000000\s*;/i)
  })

  it('le texte par defaut est l\'encre principale, pas le blanc pur', () => {
    expect(CSS).toMatch(/--foreground\s*:\s*#E0E0E0\s*;/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('charte graphique — le mecanisme qui fait suivre les composants', () => {
  /**
   * Les paliers d'echelle REDEFINIS. Ce sont eux, et eux seuls, qui font
   * migrer les composants sans les editer.
   */
  const ECHELLES: [string, string][] = [
    ['--color-red-500', '#FF6F60'], // notification / variante claire
    ['--color-red-600', '#E53935'], // action principale
    ['--color-red-700', '#C62828'], // survol
    ['--color-gray-300', '#E0E0E0'], // texte principal
    ['--color-gray-400', '#BDBDBD'], // texte secondaire
    ['--color-gray-500', '#9E9E9E'], // texte discret
    ['--color-gray-600', '#757575'], // texte desactive
  ]

  for (const [jeton, valeur] of ECHELLES) {
    it(`${jeton} est redefine a ${valeur}`, () => {
      expect(CSS).toMatch(new RegExp(`${jeton}\\s*:\\s*${valeur}\\s*;`, 'i'))
    })
  }

  /**
   * Le mecanisme ne vaut que s'il reste des classes sur lesquelles agir.
   * Sans ce controle, reduire ces echelles a zero en deletant le contenu
   * laisserait le test precedent vert : c'est le piege que ces tests couvrent.
   */
  const ENCORE_EMPLOYEES: [string, RegExp][] = [
    ['bg-red-600', /\bbg-red-600\b/],
    ['bg-red-700', /\bbg-red-700\b/],
    ['border-red-600', /\bborder-red-600\b/],
    ['text-gray-300', /\btext-gray-300\b/],
    ['text-gray-400', /\btext-gray-400\b/],
    ['text-gray-500', /\btext-gray-500\b/],
    ['border-white', /\bborder-white\b/],
  ]

  for (const [classe, motif] of ENCORE_EMPLOYEES) {
    it(`${classe} est toujours employee quelque part`, () => {
      const total = APP.reduce((n, f) => n + (code(f).match(motif)?.length ?? 0), 0)
      expect(total).toBeGreaterThan(0)
    })
  }

  it('les paliers clairs de l\'echelle de gris ne sont pas redefinis', () => {
    // Ils servent le portail client et les vues d'impression, qui gardent
    // leur identite. Les redefinir les aplatirait.
    for (const palier of ['--color-gray-100', '--color-gray-200', '--color-gray-800']) {
      expect(CSS).not.toMatch(new RegExp(`${palier}\\s*:`, 'i'))
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('charte graphique — la migration est complete', () => {
  /** L'ancienne palette. Aucune de ces valeurs ne doit subsister en code. */
  const ANCIENNES: [string, RegExp][] = [
    ['#1A1D24', /#1A1D24\b/i],
    ['#0B0F19', /#0B0F19\b/i],
    ['#242830', /#242830\b/i],
    ['#2A2D35', /#2A2D35\b/i],
    ['#E30613', /#E30613\b/i],
    ['#C00510', /#C00510\b/i],
    ['#E7000B', /#E7000B\b/i],
    ['#15181E', /#15181E\b/i],
    ['#0F1115', /#0F1115\b/i],
  ]

  for (const [valeur, motif] of ANCIENNES) {
    it(`${valeur} a disparu du code de l'application`, () => {
      const coupables = APP.filter((f) => motif.test(code(f)))
      expect(coupables).toEqual([])
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────

describe('charte graphique — le perimetre n\'a pas deborde', () => {
  it('le portail client garde sa surface claire d\'origine', () => {
    const p = code(join('app', 'espace-client', '[code_acces]', 'page.tsx'))
    expect(p).toMatch(/bg-slate-50/)
    expect(p).toMatch(/bg-white/)
    expect(p).toMatch(/#111111/i)
  })

  it('le portail client garde sa marque rouge d\'origine', () => {
    const p = code(join('app', 'espace-client', '[code_acces]', 'page.tsx'))
    expect(p).toMatch(/#E30613\b/i)
  })

  it('les 4 niveaux de vigilance meteo n\'ont pas ete recolores', () => {
    // vert / jaune / orange / rouge sont une nomenclature METIER (vigilance
    // Meteo-France). Les teinter de la charte n\'aurait aucun sens.
    const p = code('components/ChantiersMeteoCards.tsx')
    expect(p).toMatch(/vert:\s*"border-emerald-500/)
    expect(p).toMatch(/jaune:\s*"border-amber-500/)
    expect(p).toMatch(/orange:\s*"border-orange-500/)
    expect(p).toMatch(/rouge:\s*"border-red-500/)
    expect(p).toMatch(/inconnu:/)
  })

  it('le module outils ne contient aucun rouge', () => {
    // §8 : ce module reste neutre. Un simple "c\'est la couleur BNA" ne
    // suffit pas a le justifier.
    const p = code(join('app', 'terrain', 'outils', 'page.tsx'))
    expect(p).not.toMatch(/red-\d{3}/)
    expect(p).not.toMatch(/#E53935|#C62828|#FF6F60/i)
  })

  it('le module outils porte le bleu d\'information', () => {
    const p = code(join('app', 'terrain', 'outils', 'page.tsx'))
    expect(p).toMatch(/#42A5F5/i)
  })

  it('le manifeste PWA affiche le nouveau fond', () => {
    // `background_color` est le fond de l'ecran de demarrage et `theme_color`
    // la couleur de la barre du systeme : ce sont les DEUX premiers pixels que
    // l'on voit de l'application installee sur un telephone. Laisses a
    // `#0B0F19`, ils montraient encore l'ancien bleu-noir a cote d'une
    // interface devenue neutre — l'application paraissait avoir deux fonds.
    const m = JSON.parse(readFileSync('public/manifest.json', 'utf8'))
    expect(m.background_color.toUpperCase()).toBe('#121212')
    expect(m.theme_color.toUpperCase()).toBe('#121212')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('charte graphique — le rouge attire sans dominer', () => {
  it('aucun titre n\'est en rouge', () => {
    // Exception documentee : `app/error.tsx` est une page d'ERREUR. Le rouge y
    // porte l\'etat critique, il n\'est pas decoratif.
    const coupables: string[] = []
    for (const f of APP) {
      if (f === join('app', 'error.tsx')) continue
      const titres = code(f).match(/<h[1-6][^>]*className="[^"]*(?:text|bg)-red-/g)
      if (titres) coupables.push(`${f} (${titres.length})`)
    }
    expect(coupables).toEqual([])
  })

  it('le texte rouge reste une exception minoritaire', () => {
    let rouge = 0
    let neutre = 0
    for (const f of APP) {
      const c = code(f)
      rouge += c.match(/\btext-red-\d{3}\b/g)?.length ?? 0
      neutre += c.match(/\btext-(?:white|gray-\d{3})\b/g)?.length ?? 0
    }
    expect(rouge).toBeGreaterThan(0) // il existe : le rouge sert encore
    expect(rouge).toBeLessThan(neutre * 0.15) // mais il ne domine pas
  })

  it('les bordures restent des gris translucides, pas du rouge', () => {
    // L'alphabetique blanc existant tombe deja dans le gris discret sur la
    // nouvelle carte : `border-white/5` -> #292929, `border-white/10` -> #343434.
    // Aucune reecriture de classe n'est donc necessaire.
    const p = code('app/terrain/outils/page.tsx')
    expect(p).toMatch(/border-white\/10/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('charte graphique — le tiroir de navigation (§6)', () => {
  const D = code('components/Drawer.tsx')

  it('le fond du tiroir est #1A1A1A', () => {
    expect(D).toMatch(/bg-\[#1A1A1A\]/)
  })

  it('l\'icone active est le rouge BNA', () => {
    expect(D).toMatch(/\?\s*"text-\[#E53935\]"\s*:\s*"text-\[#D0D0D0\]"/)
  })

  it('l\'icone inactive est #D0D0D0', () => {
    expect(D).toMatch(/"text-\[#D0D0D0\]"/)
  })

  it('le texte inactif est #BDBDBD', () => {
    expect(D).toMatch(/"text-\[#BDBDBD\]/)
  })

  it('aucune surface du tiroir n\'est rouge', () => {
    // Le rouge y est un ACCENT d\'etat actif, jamais un fond.
    expect(D).not.toMatch(/bg-red-\d{3}\b/)
    expect(D).not.toMatch(/border-red-\d{3}\b/)
  })

  it('la structure est intacte : 27 routes et 6 groupes', () => {
    expect(D.match(/href: "/g)?.length).toBe(27)
    expect(D.match(/children: \[/g)?.length).toBe(6)
  })

  it('le comportement d\'accordeon est intact', () => {
    expect(D).toMatch(/choixGroupes\.get\(item\.label\) \?\? groupeActif/)
    expect(D).toMatch(/aria-label="Ouvrir le menu"/)
    expect(D).toMatch(/aria-label="Fermer le menu"/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('charte graphique — les statuts de chantier (§9)', () => {
  const LISTE = code(join('app', 'terrain', 'chantier', 'page.tsx'))
  const PLANNING = code('components/PlanningGantt.tsx')

  it('« en cours » est le vert de succes', () => {
    expect(LISTE).toMatch(/#4CAF50/)
    expect(PLANNING).toMatch(/#4CAF50/)
  })

  it('« termine » est le neutre', () => {
    expect(LISTE).toMatch(/#9E9E9E/)
    expect(PLANNING).toMatch(/#9E9E9E/)
  })

  it('« prevu » est le bleu d\'information', () => {
    expect(LISTE).toMatch(/#42A5F5/)
    expect(PLANNING).toMatch(/#42A5F5/)
  })

  /**
   * La coherence liste / planning, VERIFIEE SUR L'ASSOCIATION et non sur la
   * simple presence de la teinte.
   *
   * Un `toContain('#4CAF50')` ne prouve rien : la couleur peut se trouver
   * n'importe ou dans le fichier, y compris sur une branche qu'on ne regarde
   * pas. On verifie donc que CHAQUE statut est associe a la bonne couleur, des
   * deux cotes. C'est cet enonce qui attrape le cas « en cours redevenu orange
   * dans le planning » : la teinte reste presente ailleurs dans le fichier, un
   * `toContain` passerait, l'association, non.
   */
  const LISTE_ATTENDUE: [string, RegExp][] = [
    ['en_cours', /ch\.statut === "en_cours"\s*\?\s*"border border-\[#4CAF50\]\/40 bg-\[#4CAF50\]\/10 text-\[#4CAF50\]"/],
    ['termine', /ch\.statut === "termine"\s*\?\s*"border border-\[#9E9E9E\]\/40 bg-\[#9E9E9E\]\/10 text-\[#9E9E9E\]"/],
    ['prevu (defaut)', /:\s*"border border-\[#42A5F5\]\/40 bg-\[#42A5F5\]\/10 text-\[#42A5F5\]"/],
  ]

  const PLANNING_ATTENDUE: [string, RegExp][] = [
    ['en_cours', /if \(ch\.statut === "en_cours"\) \{\s*bgColor = "bg-\[#4CAF50\]";\s*borderColor = "border-\[#4CAF50\]"/],
    ['termine', /else if \(ch\.statut === "termine"\) \{\s*bgColor = "bg-\[#9E9E9E\]";\s*borderColor = "border-\[#9E9E9E\]"/],
    ['prevu (defaut)', /let bgColor = "bg-\[#42A5F5\]";\s*let borderColor = "border-\[#42A5F5\]"/],
  ]

  it('la liste associe chaque statut a sa couleur §9', () => {
    for (const [statut, motif] of LISTE_ATTENDUE) {
      expect(LISTE, `liste : « ${statut} »`).toMatch(motif)
    }
  })

  it('le planning associe chaque statut a la MEME couleur', () => {
    for (const [statut, motif] of PLANNING_ATTENDUE) {
      expect(PLANNING, `planning : « ${statut} »`).toMatch(motif)
    }
  })

  /**
   * Piège : `border-[#COULEUR]/NN` ne pose que la COULEUR de bordure.
   *
   * Dans le CSS réellement émis par Tailwind 4 :
   *
   *     .border-\[#4CAF50\]/40{border-color:#4caf5066}
   *
   * et le preflight pose `*,::after,::before{border:0 solid}`. La classe de
   * STYLE `border` est donc indispensable : sans elle, la largeur vaut 0 et le
   * badge s'affiche SANS liseré. Remplacer `border-red-600/40` par
   * `border-[#4CAF50]/40` seul fait disparaitre la bordure — un shrink de 1px
   * que le diff de couleurs ne revele pas, puisque le mot `border` disparait
   * lui aussi de la chaine.
   */
  it('chaque badge conserve sa classe de style « border »', () => {
    for (const c of ['#4CAF50', '#9E9E9E', '#42A5F5']) {
      expect(LISTE).toContain(`border border-[${c}]/40`)
    }
    // Aucune forme « couleur seule » ne doit subsister sur ce badge.
    expect(LISTE).not.toMatch(/"border-\[#(?:4CAF50|9E9E9E|42A5F5)\]\//)
  })

  it('aucune des deux vues ne recycle une couleur d\'autre statut', () => {
    // Le defaut est « prevu » : un chantier « termine » ne doit surtout pas
    // retomber sur le bleu, ni « prevu » sur le neutre.
    expect(PLANNING).not.toMatch(/bg-(?:orange|green)-600/)
    expect(LISTE).not.toMatch(/bg-sky-950/)
  })

  it('aucun statut n\'est invente', () => {
    // §9 mentionne « en pause ». Cette valeur n\'existe pas dans le code :
    // les statuts sont prevu / en_cours / termine. Aucune branche n\'est ajoutee
    // pour une valeur qui ne peut pas survenir.
    expect(LISTE).not.toContain('en_pause')
    expect(PLANNING).not.toContain('en_pause')
  })

  it('le libelle du statut reste affiche tel quel', () => {
    expect(LISTE).toMatch(/ch\.statut\.replace\("_", " "\)/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le `<main>` du layout racine, et lui seul.
 *
 * On extrait la BALISE D'OUVERTURE telle qu'elle est ecrite, plutot que de
 * recopier la liste de classes en dur : le controle porte alors sur la source
 * reelle, et survit a un simple reformatage (attributs sur une ligne ou sur
 * plusieurs). Le `[\s\S]*?>` non avide s'arrete au premier `>`, et aucune
 * classe du `<main>` n'en contient.
 */
function baliseMainLayout(): string {
  const m = code('app/layout.tsx').match(/<main\b[\s\S]*?>/)
  if (!m) throw new Error('`<main>` introuvable dans app/layout.tsx')
  return m[0]
}

describe('charte graphique — le fond global et son reflet rouge', () => {
  const LAYOUT = code('app/layout.tsx')
  const MAIN = baliseMainLayout()

  it('le reflet rouge est porte par le <main> du layout partage', () => {
    // C'est LE controle demande : l'effet visuel est defini au niveau du layout
    // commun, et non dans une page. Tant qu'il reste ici, toute page du
    // dashboard en herite ; tant qu'il reste dans `app/page.tsx`, il n'existe
    // que sur `/`.
    expect(MAIN).toMatch(/bg-\[radial-gradient\(ellipse_at_top,rgba\(229,57,53,0\.15\),transparent_60%\)\]/)
  })

  it('le fond est pose sur un conteneur present sur toutes les pages', () => {
    // `<main id="main-content-wrapper">` est defini UNE seule fois, dans le
    // layout racine : c'est le seul conteneur present sur `/`, `/bureau/**`,
    // `/terrain/**` et `(dashboard)/**`. Un second `id` identique signifierait
    // que le fond n'est plus garanti sur toutes les pages.
    expect(LAYOUT.match(/id="main-content-wrapper"/g)?.length).toBe(1)
  })

  it('le layout ne declare le reflet qu\'une fois', () => {
    expect(LAYOUT.match(/radial-gradient/g)?.length).toBe(1)
  })

  it('aucune page ne porte son propre reflet (pas de duplication)', () => {
    // Le layout est le SEUL porteur autorise. Une page qui redéclarerait le
    // gradient verrait son halo se cumuler avec celui du layout — deux fois plus
    // rouge sur cette page, et invisible sur les autres.
    const coupables = APP.filter((f) => f !== join('app', 'layout.tsx'))
      .filter((f) => /radial-gradient/.test(code(f)))
    expect(coupables).toEqual([])
  })

  it('app/page.tsx ne redefinit plus le fond', () => {
    // C'etait ici que le halo vivait, en double (visiteur anonyme ET session
    // active). L'Accueil recupere le reflet par heritage, a l'identique.
    expect(code('app/page.tsx')).not.toMatch(/radial-gradient/)
  })

  it('les layouts imbriques n\'inventent pas leur propre fond', () => {
    // `/bureau/**`, `/terrain/**` et `(dashboard)/finance/**` sont transparents :
    // ils doivent heriter du layout racine, pas le concurrencer.
    for (const f of [
      join('app', 'bureau', 'layout.tsx'),
      join('app', 'terrain', 'layout.tsx'),
      join('app', '(dashboard)', 'finance', 'layout.tsx'),
    ]) {
      expect(code(f)).not.toMatch(/radial-gradient/)
    }
  })

  it('le reflet reste circonscrit, pas un grand halo qui envahit l\'ecran', () => {
    // Sans `background-size`, l'ellipse se calculerait sur la hauteur ENTIERE de
    // la page : `transparent 60%` vaudrait alors 60 % de toute la hauteur et le
    // rouge monterait jusqu'en bas. Ces trois utilitaires la bornent a 380 px,
    // en haut, une seule fois — exactement la geometrie de l'ancien
    // `div` en `absolute top-0 inset-x-0 h-[380px]`.
    expect(MAIN).toContain('ellipse_at_top')
    expect(MAIN).toContain('bg-size-[100%_380px]')
    expect(MAIN).toContain('bg-no-repeat')
    expect(MAIN).toContain('bg-top')
  })

  it('l\'opacite du reflet reste discrete', () => {
    // 0.15 : le reflet est une atmosphere, pas un aplat. Une opacite plus
    // forte contaminerait les cartes en `#1E1E1E` situees dessous.
    expect(MAIN).toMatch(/rgba\(229,57,53,0\.15\)/)
    expect(MAIN).not.toMatch(/rgba\(229,57,53,(?:0\.[2-9]|1)\)/)
  })

  it('le fond est une couche de fond, pas un div superpose', () => {
    // Aucun voile de 380 px ne subsiste dans le layout : le halo est peint par
    // le moteur SOUS tous les descendants. Il ne peut donc ni voiler une carte
    // (un `div` en `z-0`, lui, peint AU-DESSUS des fonds de blocs non
    // positionnes), ni intercepter un clic, sans avoir a ajouter
    // `pointer-events-none` ni a arbitrer un z-index.
    expect(LAYOUT).not.toMatch(/h-\[380px\]/)
  })

  it('le <main> partage conserve ses classes d\'origine, dans l\'ordre', () => {
    // Preuve que la correction est strictement un ajout de fond : ni structure,
    // ni espacement, ni grille, ni z-index du conteneur n'ont bougé.
    expect(MAIN).toContain('className="mt-4 flex-1 relative z-10 w-full overflow-x-hidden pb-12 ')
  })

  it('le fond de page #121212 reste porte par le <body>', () => {
    // Le reflet est une atmosphere par-dessus la surface ; il ne remplace pas
    // la couleur de fond, qui reste celle de la charte.
    expect(code('app/layout.tsx')).toMatch(/<body[^>]*className="[^"]*bg-\[#121212\]/)
  })

  it('l\'ancien rouge du reflet a disparu de toute l\'application', () => {
    // `rgba(227, 6, 19, ...)` = #E30613. Ecrit en `rgba()` et non en hex, il
    // avait echappe a la migration de palette : c'etait precisement la couleur
    // du halo. `code()` est indispensable ici — le commentaire du layout cite
    // cette valeur pour expliquer la migration.
    const coupables = APP.filter((f) => /227,\s*6,\s*19/.test(code(f)))
    expect(coupables).toEqual([])
  })
})
