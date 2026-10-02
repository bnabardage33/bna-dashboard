// PHASE 2 — les trois écrans vides sont devenus des redirections
// ============================================================================
//
// Ce fichier remplaçait la suite « 2F-6 », qui verrouillait l'écran
// « en cours de construction » partagé par trois routes :
//
//     app/bureau-etudes/page.tsx
//     app/chantiers/page.tsx
//     app/boite-a-outils/page.tsx
//
// Ces trois routes affichaient « Cette section est en cours de construction ».
// Elles n'avaient AUCUNE référence entrante (aucun lien, aucun test, et le
// Drawer pointait vers `/bureau` et `/terrain/chantier`, jamais vers elles) :
// elles n'étaient atteignables qu'en tapant l'URL à la main. Trois routes qui
// mentent sur l'état du produit sont pires que trois routes absentes.
//
// Elles sont donc devenues des `redirect()` vers la page qui porte réellement
// la fonction, et `components/ui/PageEnConstruction.tsx` a été supprimé : il
// n'avait plus aucun consommateur.
//
// Ce que verrouille la nouvelle suite, c'est l'invariant qui compte désormais :
// une adresseTapée à la main doit mener à la FONCTION, pas à un écran vide.
// Elle échoue sur le code d'avant, qui appelait le composant.
// ============================================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const RACINE = process.cwd()
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf-8')

/**
 * Le CODE d'un fichier, commentaires retirés.
 *
 * Les pages de redirection documentent LONGUEMENT ce qu'elles abandonnent —
 * et nomment donc forcément les composants et les libellés supprimés. Sans ce
 * filtre, la suite vérifierait ses propres commentaires et échouerait sur la
 * documentation, ce qu'elle ne peut pas faire. La suite « 2F-6 » désamorçait
 * le même piège de la même façon.
 */
const code = (chemin: string) =>
  lire(chemin)
    .replace(/\/\*[\s\S]*?\*\//g, '') // /* … */
    .replace(/^\s*\/\/.*$/gm, '') // // …
    .trim()

/**
 * Les trois anciennes adresses et la page qui porte réellement la fonction.
 * `destination` est l'URL EXISTANTE : rien n'a été renommé, ce sont les
 * anciennes adresses qui ont été abandonnées.
 */
const ROUTES_LEGACY = [
  {
    page: 'app/bureau-etudes/page.tsx',
    route: '/bureau-etudes',
    destination: '/bureau/clients',
    fonction: 'la liste des clients',
  },
  {
    page: 'app/chantiers/page.tsx',
    route: '/chantiers',
    destination: '/terrain/chantier',
    fonction: 'la liste des chantiers',
  },
  {
    page: 'app/boite-a-outils/page.tsx',
    route: '/boite-a-outils',
    destination: '/terrain/outils',
    fonction: 'les outils métier',
  },
]

describe('PHASE 2 · les trois écrans vides sont des redirections', () => {
  it('chaque route appelle redirect() vers la page qui porte la fonction', () => {
    for (const { page, destination, fonction } of ROUTES_LEGACY) {
      const source = lire(page)
      expect(source, `${page} n'importe plus redirect`).toContain('from "next/navigation"')
      expect(source, `${page} n'appelle pas redirect`).toContain('redirect(')
      expect(
        source,
        `${page} ne redirige pas vers ${destination} (la page qui porte ${fonction})`,
      ).toContain(`redirect("${destination}")`)
    }
  })

  it('aucune page ne rend plus le gabarit « en cours de construction »', () => {
    for (const { page } of ROUTES_LEGACY) {
      const source = code(page)
      expect(source, `${page} affiche encore l'écran vide`).not.toContain(
        'PageEnConstruction',
      )
      expect(source, `${page} affiche encore le libellé`).not.toContain(
        'en cours de construction',
      )
      // Le gabarit ne doit plus être recopié nulle part.
      expect(source, `${page} recopie encore le gabarit`).not.toContain('min-h-screen')
    }
  })

  it('le composant partagé a été supprimé : plus aucun consommateur', () => {
    const composant = 'components/ui/PageEnConstruction.tsx'
    expect(
      existsSync(join(RACINE, composant)),
      `${composant} existe encore alors qu'aucune page ne l'utilise`,
    ).toBe(false)
  })

  it('la redirection est aussi déclarée dans next.config.ts', () => {
    // `redirect()` sert le rendu de la page ; la config sert le cas où la
    // requête atteint la route sans passer par le rendu (lien externe mis en
    // cache, ancien signet). Les deux guarantees sont nécessaires : l'une
    // seule laisse un trou.
    const config = lire('next.config.ts')
    for (const { route, destination } of ROUTES_LEGACY) {
      expect(config, `next.config.ts ne déclare pas la source ${route}`).toContain(
        `source: "${route}"`,
      )
      expect(
        config,
        `next.config.ts ne redirige pas ${route} vers ${destination}`,
      ).toContain(`destination: "${destination}"`)
    }
  })
})

describe('PHASE 2 · les routes cockpit devenues obsolètes', () => {
  const COCKPITS = [
    { page: 'app/bureau/page.tsx', destination: '/', raison: "l'accueil est le cockpit unique" },
    { page: 'app/terrain/page.tsx', destination: '/terrain/chantier', raison: 'le cockpit Terrain a disparu' },
    { page: 'app/terrain/meteo/page.tsx', destination: '/bureau/meteo', raison: 'il ne doit rester qu\'une entrée météo' },
  ]

  it('chaque cockpit obsolète redirige vers sa destination', () => {
    for (const { page, destination, raison } of COCKPITS) {
      const source = lire(page)
      expect(source, `${page} n'appelle pas redirect (${raison})`).toContain('redirect(')
      expect(source, `${page} ne redirige pas vers ${destination} (${raison})`).toContain(
        `redirect("${destination}")`,
      )
    }
  })

  it('aucune page cockpit ne dessine plus sa propre grille de navigation', () => {
    // Les 8 tuiles « Accès rapides » de `/bureau` doublonnaient le hamburger.
    // Elles ne doivent pas réapparaître sous une autre forme.
    for (const { page } of COCKPITS) {
      const source = code(page)
      for (const interdit of ['Accès Rapides', 'ChantierHealthCard', 'Accès rapides']) {
        expect(source, `${page} a ressuscité « ${interdit} »`).not.toContain(interdit)
      }
    }
  })

  it('la redirection de /bureau et /terrain/meteo est aussi en config', () => {
    const config = lire('next.config.ts')
    for (const { destination } of COCKPITS) {
      expect(config, `next.config.ts ne redirige rien vers ${destination}`).toContain(
        `destination: "${destination}"`,
      )
    }
  })
})
