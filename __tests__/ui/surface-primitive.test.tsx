// =============================================================================
// LOT 2D — primitive `Surface` : habillage de carte centralisé
// =============================================================================
//
// Contexte. Sur les 159 éléments au fond de base `#1E1E1E` du périmètre (hors
// les 8 vues d'impression et le portail `espace-client`), 95 portaient le même
// habillage de carte : un arrondi, `border border-white/10`, et ce fond. C'est le
// seul groupe réellement homogène du dépôt, et le seul que ce lot extrait — 91 de
// ces 95 étant des conteneurs neutres. `Surface` définit l'habillage une fois ;
// le fond passe par le token `--color-surface` du LOT 2A, dont la valeur est
// identique au littéral.
//
// Ce test verrouille quatre choses :
//   1. `cn()` — y compris ce qu'il NE fait PAS ;
//   2. le rendu de `Surface` — classes émises, `radius`, `as`, passe-plat ;
//   3. l'INVENTAIRE : 91 appels, et plus aucune carte en littéral dans le
//      périmètre ;
//   4. la chaîne de substitution du fond, du littéral jusqu'à la valeur du
//      token, car c'est le seul endroit où la conversion pouvait changer une
//      couleur sans qu'on le voie.
//
// L'extracteur est ici en TypeScript ; un second extracteur indépendant existe
// en Python (/tmp/opencode/2d/preuve-equivalence.py), comparé site à site. Aucun
// des deux ne peut donc couvrir une erreur de l'autre (principe du LOT 2B).
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { createRoot, type Root } from 'react-dom/client'
import { act, type ReactElement } from 'react'
import { cn } from '@/lib/cn'
import { Surface } from '@/components/ui/Surface'

/**
 * Rendu sans `@testing-library/react` : cette version du dépôt tourne sur React
 * 19, où la bibliothèque appelle `reactDom.render`, supprimé depuis la 18 — elle
 * échoue par `_reactDom.default.render is not a function`. Les tests existants
 * (`b9-dashboard-accueil`, `b10-tresorerie-widget`) montent donc leur arbre avec
 * `createRoot` + `act` ; on fait pareil plutôt que d'ajouter une dépendance.
 */
const racines: Root[] = []
const conteneurs: HTMLElement[] = []

// `act` n'est un silence que si l'environnement se déclare compatible ; sinon
// React prévient à chaque appel. Même geste que les tests existants.
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
  return conteneur.firstElementChild as HTMLElement
}

beforeAll(() => {
  ENV.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  delete ENV.IS_REACT_ACT_ENVIRONMENT
})

afterEach(() => {
  while (racines.length) {
    const r = racines.pop() as Root
    act(() => r.unmount())
  }
  while (conteneurs.length) conteneurs.pop()?.remove()
})

// ── Le périmètre, redéfini ici indépendamment de celui du convertisseur ──────

const REPERTOIRES = ['app', 'components']

/** Les 8 vues d'impression, par nom de fichier — jamais par sous-chaîne. */
const PDF = new Set([
  'BonCommandePDF.tsx',
  'DocumentPDF.tsx',
  'FicheDebitPDF.tsx',
  'LettreRelancePDF.tsx',
  'PVReceptionPDF.tsx',
  'RapportIntemperiesPDF.tsx',
  'RapportSAVPDF.tsx',
  'RapportClientPrint.tsx',
])

/** Ce que `Surface` définit : l'habillage d'origine, au fond près. */
const HABILLAGE_ATTENDU = ['border', 'border-white/10', 'bg-surface']
const RAYONS_ATTENDUS: Record<string, string> = {
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
}
const FOND_LITTERAL = '#1E1E1E'

/**
 * Les 4 cartes que le lot a laissé en littéral, et pourquoi.
 *
 * Les convertir exigerait un type de props polymorphe (`<T extends ElementType>`
 * générique) : `href` sur un `<Link>`, `onSubmit` sur un `<form>`. C'est
 * précisément la machinerie que ce lot s'interdit d'introduire sans preuve, et
 * quatre appels ne la justifient pas. La liste est vérifiée pour que l'exclusion
 * reste visible et ne devienne pas un oubli.
 */
const EXCLUS = [
  { fichier: 'app/bureau/sav/page.tsx', balise: 'Link' },
  { fichier: 'app/terrain/outils/page.tsx', balise: 'Link' },
  { fichier: 'components/DashboardAccueil.tsx', balise: 'Link' },
  { fichier: 'components/PhotosNotes.tsx', balise: 'form' },
]

// ── Lecture des fichiers, UNE SEULE FOIS ───────────────────────────────────
// Le LOT 2C a appris à ce prix : sans cache, un test qui relit ~500 fichiers en
// synchrone alourdit la suite de plusieurs dizaines de secondes et augmente la
// probabilité d'exposer une course latente du dépôt.

const CACHE = new Map<string, string>()
function lire(fichier: string): string {
  let contenu = CACHE.get(fichier)
  if (contenu === undefined) {
    contenu = readFileSync(fichier, 'utf8')
    CACHE.set(fichier, contenu)
  }
  return contenu
}

function tsx(dossier: string): string[] {
  const trouvees: string[] = []
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) trouvees.push(...tsx(chemin))
    else if (entree.endsWith('.tsx')) trouvees.push(chemin)
  }
  return trouvees
}

const TSX = [...tsx('app'), ...tsx('components')]
  .filter((f) => !f.startsWith('app/espace-client'))
  .sort()

/** Les 8 vues d'impression, vérifiées comme telles. */
const VUES_IMPRESSION = TSX.filter((f) => PDF.has(f.split('/').pop() as string))

// ── Extracteur : ouverture d'une balise et ses attributs ────────────────────
// Les attributs sont traversée en ignorant `>` protégé par des guillemets, et le
// className peut s'étendre sur plusieurs lignes.

const OUVERTURE = /<([A-Za-z][A-Za-z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*?)className=(?:"([^"]*)"|\{`([^`]*)`\})/g

interface Carte {
  fichier: string
  ligne: number
  balise: string
  classes: string
  template: boolean
}

function cartes(): Carte[] {
  const trouvees: Carte[] = []
  for (const fichier of TSX) {
    const src = lire(fichier)
    // `exec` renvoie un tableau de correspondances : le parcourir avec `for…of`
    // it'dérerait sur ses ÉLÉMENTS (la chaîne complète en tête), pas sur
    // l'objet match. D'où la boucle `while`.
    let m: RegExpExecArray | null
    while ((m = OUVERTURE.exec(src)) !== null) {
      const classes = m[3] !== undefined ? m[3] : m[4]
      if (classes === undefined) continue
      const jetons = classes.split(/\s+/)
      const arrondi = jetons.find((t) => t === 'rounded-xl' || t === 'rounded-2xl')
      if (!arrondi) continue
      if (!jetons.includes('border-white/10')) continue
      if (!jetons.some((t) => t === 'bg-[#1E1E1E]')) continue
      trouvees.push({
        fichier,
        ligne: src.slice(0, m.index).split('\n').length,
        balise: m[1],
        classes,
        template: m[3] === undefined,
      })
    }
  }
  return trouvees
}

const CARTES = cartes()

/** Les appels à `<Surface>` du périmètre. */
function appelsSurface(): { fichier: string; ligne: number; brut: string }[] {
  const trouves: { fichier: string; ligne: number; brut: string }[] = []
  for (const fichier of TSX) {
    const src = lire(fichier)
    const re = /<Surface\b((?:[^>"']|"[^"]*"|'[^']*')*?)(?:\/>|>)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      trouves.push({ fichier, ligne: src.slice(0, m.index).split('\n').length, brut: m[1] })
    }
  }
  return trouves
}

const APPELS = appelsSurface()

// =============================================================================

describe('LOT 2D — cn()', () => {
  it('accole les classes et retire les valeurs vides', () => {
    expect(cn('a', 'b')).toBe('a b')
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('aplati les tableaux imbriqués', () => {
    expect(cn('a', ['b', ['c', false, 'd']])).toBe('a b c d')
  })

  it("n'accepte pas un nombre comme classe", () => {
    // Rendu tel quel dans le DOM par React : la laisser passer polluerait le
    // className sans erreur visible.
    expect(cn('a', 42 as unknown as string)).toBe('a')
  })

  it('NE résout PAS les conflits Tailwind — et c\'est délibéré', () => {
    // Un état n'est pas une valeur : un résolveur « la dernière l'emporte »
    // effacerait le survol du bouton d'action. `cn` n'a pas ce pouvoir, donc
    // `tailwind-merge` reste indispensable le jour où il sera ajouté.
    expect(cn('bg-red-600', 'hover:bg-red-700')).toBe('bg-red-600 hover:bg-red-700')
    // Deux rayons complémentaires : le second ne redéfinit qu'un angle.
    expect(cn('rounded-2xl', 'rounded-bl-sm')).toBe('rounded-2xl rounded-bl-sm')
    // Deux fonds de base :Tailwind tranchera sur l'ordre du CSS, pas nous.
    expect(cn('bg-surface', 'bg-[#1E1E1E]')).toBe('bg-surface bg-[#1E1E1E]')
  })

  it("ne déduplique rien et ne réordonne rien", () => {
    expect(cn('p-4', 'p-4')).toBe('p-4 p-4')
    expect(cn('b', 'a')).toBe('b a')
  })
})

describe('LOT 2D — Surface', () => {
  it('émet l\'habillage et l\'arrondi par défaut', () => {
    const el = rendre(<Surface>x</Surface>)
    expect(el.tagName).toBe('DIV')
    expect(el.className.split(/\s+/).sort())
      .toEqual([...HABILLAGE_ATTENDU, 'rounded-xl'].sort())
  })

  it('applique radius="2xl" et n\'émet JAMAIS deux rayons', () => {
    const classes = rendre(<Surface radius="2xl">x</Surface>).className.split(/\s+/)
    expect(classes).toContain('rounded-2xl')
    // Le composant pourrait émettre `rounded-xl rounded-2xl` et laisser Tailwind
    // trancher sur l'ordre du CSS ; il ne le fait pas.
    expect(classes).not.toContain('rounded-xl')
    expect(classes.filter((c) => c.startsWith('rounded-'))).toHaveLength(1)
  })

  it('ajoute le className reçu APRÈS l\'habillage', () => {
    const classes = rendre(<Surface className="p-4 shadow-lg">x</Surface>)
      .className.split(/\s+/)
    expect(classes).toContain('p-4')
    expect(classes).toContain('shadow-lg')
    expect(classes).toHaveLength(HABILLAGE_ATTENDU.length + 3)
  })

  it('rend la balise demandée via `as`', () => {
    expect(rendre(<Surface as="section">x</Surface>).tagName).toBe('SECTION')
  })

  it('passe le reste des props et les enfants', () => {
    const el = rendre(
      <Surface id="carte-1" data-testid="carte">
        <span>contenu</span>
      </Surface>,
    )
    expect(el.id).toBe('carte-1')
    expect(el.dataset.testid).toBe('carte')
    expect(el.textContent).toBe('contenu')
  })

  it('n\'ajoute AUCUNE classe vide', () => {
    const classes = rendre(<Surface>x</Surface>).className.split(/\s+/)
    expect(classes.every((c) => c.length > 0)).toBe(true)
  })
})

describe('LOT 2D — inventaire de la conversion', () => {
  it('le périmètre contient bien les 8 vues d\'impression, exclues', () => {
    expect(VUES_IMPRESSION).toHaveLength(8)
  })

  it('98 cartes ont été converties', () => {
    // 96 après la suppression de ChantierHealthCard (− 2 appels, − 1 fichier).
    // + 2 avec la météo générale restaurée : la page `/terrain/meteo` retrouve
    // sa carte et le bloc d'accueil `MeteoGeneraleAccueil` en ajoute une.
    // Bilan : 98 appels sur 28 fichiers.
    expect(APPELS).toHaveLength(98)
    expect(new Set(APPELS.map((a) => a.fichier)).size).toBe(28)
  })

  it('il ne reste AUCUNE carte en littéral dans le périmètre', () => {
    // Seuls les 4 sites documentés dans EXCLUS peuvent conserver l'habillage
    // écrit à la main — et aucun n'est un div ou un section.
    const residuels = CARTES
    expect(residuels).toHaveLength(EXCLUS.length)
    for (const { fichier, balise, ligne } of residuels) {
      const attendu = EXCLUS.find((e) => e.fichier === fichier)
      expect(attendu, `${fichier}:${ligne} conserve l'habillage sans être dans EXCLUS`)
        .toBeDefined()
      expect(balise, `${fichier}:${ligne} est un <${balise}>, pas un conteneur neutre`)
        .toBe(attendu?.balise)
    }
  })

  it('chaque appel porte le fond par token, jamais en littéral', () => {
    // Seules les classes de BASE comptent. Un `hover:bg-[#1E1E1E]` est un
    // ÉTAT, pas une valeur : il peut légitimement rester en littéral, et
    // `--color-surface` valant `#1E1E1E`, les deux donnent la même couleur.
    // Confondre les deux ferait crier à tort sur 4 cartes sur 91.
    for (const { fichier, ligne, brut } of APPELS) {
      const deBase = (brut.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/) || [])
        .slice(1)
        .join(' ')
        .split(/\s+/)
        .filter((t) => t.length > 0 && !t.includes(':'))
      const fond = deBase.find((t) => t.startsWith('bg-['))
      expect(
        fond,
        `${fichier}:${ligne} conserve le fond de base en littéral (${fond}) ` +
        'alors que le token existe',
      ).toBeUndefined()
    }
  })

  it('un template littéral reste un template littéral', () => {
    // Régression réelle : convertir `` className={`…${état}`} `` en
    // `className="…${état}"` garde exactement les mêmes « mots » — donc les
    // mêmes classes — mais rend l'expression inerte. L'animation du chatbot
    // disparaît, et ni `tsc` ni une comparaison de jetons ne le voient.
    for (const { fichier, ligne, brut } of APPELS) {
      if (!brut.includes('${')) continue
      expect(
        brut.includes('className={`'),
        `${fichier}:${ligne} a une interpolation hors template littéral`,
      ).toBe(true)
    }
  })

  it('le rayon demandé existe dans la table du composant', () => {
    for (const { fichier, ligne, brut } of APPELS) {
      const r = brut.match(/radius="([^"]+)"/)
      if (!r) continue
      expect(
        Object.keys(RAYONS_ATTENDUS),
        `${fichier}:${ligne} demande radius="${r[1]}"`,
      ).toContain(r[1])
    }
  })
})

describe('LOT 2D — la chaîne de substitution du fond', () => {
  it('le composant définit exactement l\'habillage d\'origine', () => {
    const src = lire('components/ui/Surface.tsx')
    const h = src.match(/const HABILLAGE = '([^']*)'/)
    expect(h).not.toBeNull()
    expect((h as RegExpMatchArray)[1].split(/\s+/).sort())
      .toEqual([...HABILLAGE_ATTENDU].sort())
  })

  it('le token porte la valeur exacte du littéral remplacé', () => {
    // Le seul maillon où une couleur pouvait changer sans qu'on le voie.
    const css = lire('app/globals.css')
    const t = css.match(/--color-surface\s*:\s*(#[0-9A-Fa-f]+)\s*;/)
    expect(t).not.toBeNull()
    expect((t as RegExpMatchArray)[1].toUpperCase()).toBe(FOND_LITTERAL)
  })

  it('le fond n\'est pas une des autres surfaces du thème', () => {
    // `bg-surface-page` (#121212) et `bg-surface-raised` (#252525) sont des
    // couleurs réelles du thème : les substituer à la carte au lieu de
    // `--color-surface` changerait l'écran sans casser aucune assertion.
    const css = lire('app/globals.css')
    for (const nom of ['surface-page', 'surface-raised']) {
      const v = css.match(new RegExp(`--color-${nom}\\s*:\\s*(#[0-9A-Fa-f]+)`))
      expect(v).not.toBeNull()
      expect((v as RegExpMatchArray)[1].toUpperCase())
        .not.toBe(FOND_LITTERAL)
    }
  })

  it('aucune vue d\'impression ni espace-client n\'utilise Surface', () => {
    for (const f of [...VUES_IMPRESSION, 'app/espace-client/[code_acces]/page.tsx']) {
      expect(lire(f), `${f} ne doit pas utiliser Surface`).not.toContain('ui/Surface')
    }
  })
})
