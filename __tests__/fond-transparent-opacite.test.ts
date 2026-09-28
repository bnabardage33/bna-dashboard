// =============================================================================
// LOT 2G-P2 — `bg-transparent/xx` : classe Tailwind sans aucun effet
// =============================================================================
//
// LE DÉFAUT. `transparent` est le mot-clé CSS `rgb(0 0 0 / 0)` : alpha nul, et
// les trois composantes déjà à zéro. Appliquer un modificateur d'opacité à un
// fond qui est DEJA totalement transparent demande à Tailwind de mélanger cette
// couleur avec elle-même. Ce que le vrai compilateur Tailwind émet sur le
// `app/globals.css` du dépôt :
//
//   bg-transparent        background-color: transparent
//   bg-transparent/<N>    background-color: color-mix(in oklab, transparent <N>%, transparent)
//   bg-black/60           background-color: color-mix(in srgb, #000 60%, transparent)
//
// Les deux premières lignes sont le même défaut. La troisième est le CONTRÔLE
// POSITIF : elle, mélange un noir à du transparent, donc elle TEINT réellement
// le fond. C'est toute la différence entre une classe qui agit et une classe
// qui ne dit rien — et c'est pourquoi la troisième doit être retrouvée par la
// sonde, sinon la sonde est fausse.
//
// POURQUOI C'EST UN NO-OP, ET NON UNE TEINTE À 60 %. Le mélange vaut
// `color-mix(in oklab, A 60%, B)` avec A = B = `rgb(0 0 0 / 0)`. Chaque
// composante du résultat vaut `0 x 0,6 + 0 x 0,4 = 0`, et l'alpha vaut
// `0 x 0,6 + 0 x 0,4 = 0`. Le résultat est donc `rgb(0 0 0 / 0)`, c'est-à-dire
// exactement `transparent`. L'espace de mélange n'y change rien : mélanger une
// couleur avec elle-même redonne cette couleur, dans n'importe quel espace.
//
// L'opacité 100 % est le cas particulier que Tailwind ramène lui-même à
// `transparent`. Toutes les opacités intermédiaires passent par
// `color-mix(... transparent N%, transparent)`. La famille est donc entièrement
// vide d'effet, de 5 à 100.
//
// CE QUE LE LOT A FAIT. 26 occurrences remplacées par `bg-transparent`, dans
// 12 fichiers. Le CSS émis perd exactement cinq familles de règles
// (`/30 /50 /60 /80 /90`), 0 valeur existante n'est modifiée, et aucune couleur
// rendue ne change d'un iota.
//
// CE QUE CE TEST EMPÊCHE. La réintroduction de cette famille. Le risque ici est
// silentieux : puisque le rendu est identique, la faute ne se voit ni à la revue
// visuelle ni en recette, et elle se propage de fichier en fichier par
// copier-coller. Une telle classe se rencontre précisément parce qu'elle a l'air
// d'exprimer une intention — « un fond discret » — alors qu'elle n'exprime rien
// du tout. Ce qui rendrait la faute visible à l'œil serait `bg-black/60`, pas
// un `bg-transparent` suivi d'un modificateur.
//
// POURQUOI AUCUN NOM DE CLASSE COMPLET N'EST ECRIT DANS CE FICHIER. Mesuré, et
// non supposé : Tailwind v4 scanne les fichiers de test, y compris leurs
// commentaires. Une classe à modificateur écrite en toutes lettres ici — même
// dans un commentaire, même dans une chaîne — est reconnue comme une classe
// réelle et se retrouve ÉMISE dans la feuille de production. Première version de
// ce fichier : +285 octets et trois règles mortes ajoutées au CSS livré, dont
// une règle invisible à l'œil nu : elle ne figurait que dans un commentaire,
// et Tailwind l'a prise au mot. Un lot dont l'objet est de supprimer
// des règles mortes ne doit pas en introduire : les noms complets sont donc
// construits par `opacite()`, et les commentaires écrivent la famille sous la
// forme `bg-transparent/<N>`, que le scanner ne peut pas résoudre en classe.
// La feuille émise reste ainsi rigoureusement identique à celle d'avant ce test.
//
// HORS PÉRIMÈTRE DE CE LOT, ET NON TRAITÉ. Les classes à double opacité
// (`border-white/10/60`, `bg-white/10/60`) sont un AUTRE défaut : elles
// n'émettent aucune règle, et les corriger CHANGERait le rendu. Elles relèvent
// de l'arbitrage P3, laissé en attente, et sont déjà comptées et verrouillées
// par `__tests__/bordure-double-opacite.test.ts`. Ce test n'y touche pas.
// =============================================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'

const RACINE = process.cwd()
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf-8')
const cssGlobal = lire('app/globals.css')

/**
 * Assemble un nom de classe et son modificateur d'opacité sans l'écrire en
 * toutes lettres. Voir l'en-tête : un littéral complet ici produirait une règle
 * dans le CSS de production.
 */
const opacite = (base: string, n: number | string) => `${base}/${n}`

/** Les 12 fichiers où le lot a substitué la famille opaque par `bg-transparent`. */
const SITES_CORRIGES = [
  'app/(dashboard)/finance/components/TresorerieWidget.tsx',
  'app/(dashboard)/finance/saisie/feuille-heures/page.tsx',
  'app/bureau/clients/page.tsx',
  'app/bureau/devis-factures/page.tsx',
  'app/bureau/factures/page.tsx',
  'app/bureau/fin-chantier/page.tsx',
  'app/bureau/meteo/page.tsx',
  'app/bureau/sav/[id]/page.tsx',
  'app/demo-client/page.tsx',
  'app/parametres/page.tsx',
  'app/terrain/chantier/[id]/page.tsx',
  'app/terrain/notes/page.tsx',
]

/**
 * Une classe de fond transparent porteuse d'un modificateur d'opacité.
 *
 * Le préfixe de variante est inclus volontairement : `hover:` suivi de la
 * famille est une classe DISTINCTE de la forme nue, et la garde serait
 * incomplète si elle ne couvrait que cette dernière. `\d+` et non `\d{1,3}` :
 * une opacité hors bornes doit être relevée, pas ignorée.
 */
const OPACITE_SUR_TRANSPARENT = /(?:[a-z-]+:)*bg-transparent\/(\d+)/g

/** Toute famille `*-transparent/NN` : bordure, contour, division, dégradé… */
const FAMILLE_TRANSPARENT = /(?:[a-z-]+:)*[a-z-]*transparent\/(\d+)/g

/**
 * `bg-<couleur>/0` : même no-op. Mélanger une couleur avec du transparent à 0 %
 * laisse la couleur à alpha nul, soit `transparent`. La sonde l'émet d'ailleurs
 * sous la forme `color-mix(in srgb, <couleur> 0%, transparent)`.
 */
const FOND_COULEUR_A_ZERO = /(?:[a-z-]+:)*bg-[a-z]+-(?:\d{2,3}|\[[^\]]*\]|\w+)\/0(?!\d)/g

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
  for (const d of ['app', 'components', 'lib', 'hooks']) marcher(join(RACINE, d))
  return out.sort()
}

const SOURCES = fichiersSources()

/** Relevé des occurrences encore présentes, avec leur effectif. */
function occurrencesRestantes(motif: RegExp): Map<string, number> {
  const out = new Map<string, number>()
  for (const f of SOURCES) {
    for (const m of lire(f).matchAll(motif)) out.set(m[0], (out.get(m[0]) ?? 0) + 1)
  }
  return out
}

/** Liste `fichier : occurrence` des correspondances de `motif`, pour un échec lisible. */
function detail(motif: RegExp): string[] {
  const out: string[] = []
  for (const f of SOURCES) {
    for (const m of lire(f).matchAll(motif)) out.push(`${f} : ${m[0]}`)
  }
  return out
}

// -----------------------------------------------------------------------------
// 1. Ce que Tailwind émet réellement
// -----------------------------------------------------------------------------

/** Échappement regex, appliqué une seule fois. */
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Nom de classe tel que CSS l'échappe : tout caractère non alphanumérique
 * reçoit une barre oblique inverse. L'ordre compte — Tailwind sort
 * `.bg-transparent\/60`, barre comprise. Sauter cette étape fait échouer la
 * recherche sur toutes les classes à modificateur, et le contrôle positif le
 * signale immédiatement.
 */
const echapperCss = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c)

/** Corps de la règle émise pour un sélecteur de classe, ou `null` si absent. */
function corps(sheet: string, sel: string): string | null {
  const motif = new RegExp(`(?:^|[{};])\\s*\\.${echapper(echapperCss(sel))}\\s*\\{([^}]*)\\}`)
  const m = sheet.match(motif)
  return m ? m[1].trim().replace(/\s+/g, ' ') : null
}

/** Compile le CSS global et rend la feuille pour les classes demandées. */
async function feuille(classes: string[]): Promise<string> {
  const { compile } = await import('tailwindcss')
  const indexTw = join(RACINE, 'node_modules/tailwindcss/index.css')
  const compilateur = await compile(cssGlobal, {
    base: RACINE,
    loadStylesheet: async (id: string, base: string) => {
      if (id === 'tailwindcss') {
        return { path: indexTw, base: dirname(indexTw), content: readFileSync(indexTw, 'utf-8') }
      }
      const p = resolve(base, id)
      return { path: p, base: dirname(p), content: readFileSync(p, 'utf-8') }
    },
    loadModule: async () => {
      throw new Error('modules CSS non supportés par cette sonde')
    },
  })
  return compilateur.build(classes) as unknown as string
}

describe('2G-P2 · ce que Tailwind émet réellement', () => {
  it('la sonde retrouve bien une classe qui agit (contrôle positif)', async () => {
    const sheet = await feuille(['bg-black/60'])
    // Sans ce contrôle, une sonde qui ne trouverait RIEN passerait tous les
    // tests suivants en annonçant à tort que tout est absent du CSS.
    expect(corps(sheet, 'bg-black/60'), 'la sonde ne retrouve pas bg-black/60 : elle est fausse').not.toBeNull()
    expect(corps(sheet, 'bg-black/60')).toMatch(/#000 60%, transparent/)
  })

  it('la forme à opacité n\'est qu\'un mélange de transparent avec lui-même', async () => {
    const cible = opacite('bg-transparent', 60)
    const sheet = await feuille(['bg-transparent', cible])

    const nu = corps(sheet, 'bg-transparent')
    expect(nu, 'bg-transparent n\'est pas émise').toBe('background-color: transparent;')

    const sale = corps(sheet, cible)
    expect(sale, `${cible} n'est plus émise : le diagnostic du lot est caduc`).not.toBeNull()
    expect(sale).toBe('background-color: color-mix(in oklab, transparent 60%, transparent);')
  })

  it('toute opacité intermédiaire est vide d\'effet, 100 % mis à part', async () => {
    const valeurs = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95]
    const sheet = await feuille(valeurs.map((n) => opacite('bg-transparent', n)))

    for (const n of valeurs) {
      const v = corps(sheet, opacite('bg-transparent', n))
      expect(v, `l'opacité ${n} n'est pas émise`).not.toBeNull()
      // Les deux termes du mélange doivent être `transparent` : c'est
      // exactement la condition qui rend la classe sans effet.
      expect(v, `l'opacité ${n} ne mélange plus transparent avec transparent`).toBe(
        `background-color: color-mix(in oklab, transparent ${n}%, transparent);`,
      )
    }

    // 100 % est ramené par Tailwind à la forme nue : également sans effet.
    const plein = await feuille([opacite('bg-transparent', 100)])
    expect(corps(plein, opacite('bg-transparent', 100))).toBe('background-color: transparent;')
  })
})

// -----------------------------------------------------------------------------
// 2. La garde
// -----------------------------------------------------------------------------

describe('2G-P2 · plus aucune classe de fond transparent à opacité', () => {
  it('aucune occurrence de la famille dans l\'application', () => {
    const restants = detail(OPACITE_SUR_TRANSPARENT)
    expect(
      restants,
      `la famille est revenue ; la classe est sans effet mais semble dire quelque chose :\n${restants.join('\n')}`,
    ).toEqual([])
  })

  it('les 12 fichiers corrigés portent bien bg-transparent', () => {
    for (const f of SITES_CORRIGES) {
      expect(
        lire(f),
        `${f} ne porte plus bg-transparent : la substitution a été annulée`,
      ).toMatch(/(?:^|[^/0-9])bg-transparent(?:[^/0-9]|$)/)
    }
  })
})

// -----------------------------------------------------------------------------
// 3. Le reliquat, compté et verrouillé
// -----------------------------------------------------------------------------

describe('2G-P2 · reliquat de la famille transparent, hors mandat', () => {
  it('la famille *-transparent/xx est entièrement vide', () => {
    // Vrai à la mesure : 0 pour `border-`, `ring-`, `divide-`, `from-`, etc.
    // Verrouillé pour que l'apparition d'une de ces formes soit signalée.
    const parClasse = occurrencesRestantes(FAMILLE_TRANSPARENT)
    expect([...parClasse.entries()].sort(), 'une famille *-transparent/xx est apparue').toEqual([])
  })

  it('aucun fond de couleur à 0 % non plus', () => {
    const parClasse = occurrencesRestantes(FOND_COULEUR_A_ZERO)
    expect([...parClasse.entries()].sort(), 'un fond à 0 % est apparu').toEqual([])
  })

  it('le périmètre scanné n\'a pas silencieusement rétréci', () => {
    // Un dossier renommé ou retiré ferait disparaître le garde-fou sans qu'aucune
    // assertion ne le remarque : le test passerait toujours, en ne scannant plus
    // rien. On exige donc que chacun des quatre dossiers soit représenté.
    for (const d of ['app', 'components', 'lib', 'hooks']) {
      const n = SOURCES.filter((f) => f.startsWith(d + '/')).length
      expect(n, `${d} n'est plus scanné : le garde-fou ne couvre plus rien`).toBeGreaterThan(0)
    }
    // Plancher, et non égalité : ajouter un fichier est normal et ne doit pas
    // faire échouer ce test. Seule une DISPARITION doit être signalée.
    expect(SOURCES.length, 'le périmètre scanné a rétréci').toBeGreaterThanOrEqual(176)
  })
})
