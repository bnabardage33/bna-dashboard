import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { fmtEuro } from '@/lib/financeCalculs'

/**
 * LOT 2C — verrouillage de la centralisation du format monétaire sur fmtEuro().
 *
 * Contexte. Le dépôt possédait DEUX duplicatas locaux de fmtEuro()
 * (`euros()` dans components/DocumentPDF.tsx, `fmtMontant()` dans
 * app/api/dashboard-patron/route.ts) et une quarantaine de montants affichés
 * via `.toFixed(2) + " €"` — donc avec un POINT décimal et sans séparateur de
 * milliers, ce qui n'est pas du français. fmtEuro() est le formateur de
 * référence depuis le début (76 appels à HEAD, hors commentaires) : le lot a
 * supprimé les doublons et converti 55 sites, sans en créer de nouveau.
 *
 * Ce test verrouille trois choses :
 *   1. le COMPORTEMENT de fmtEuro() lui-même, valeur par valeur et point de
 *      code par point de code — c'est la source de vérité, elle ne doit pas bouger ;
 *   2. l'ABSENCE de tout doublon de formateur monétaire ;
 *   3. l'ABSENCE de formatage monétaire artisanal ailleurs, à une liste
 *      d'exceptions près — liste elle-même vérifiée, pour qu'elle ne devienne
 *      pas une zone d'impunité qui s'élargit d'elle-même.
 *
 * L'extracteur est ici en TypeScript ; un second extracteur indépendant existe en
 * Python (/tmp/opencode/2c/scan.py). Les deux ont été comparés ligne à ligne :
 * ils tombent d'accord sur les 9 sites restants, dont 7 hors périmètre. Aucun
 * des deux ne peut donc couvrir une erreur de l'autre (principe du LOT 2B).
 *
 * Sont exclus par construction : les unités non monétaires (m², ml, cm, mm, kg,
 * °, pcs) et le suffixe d'échelle `k€` des graduations de graphiques. Ce ne sont
 * pas des montants, et y appliquer fmtEuro() casserait la lecture de l'axe.
 *
 * `app/espace-client/**` est hors périmètre par décision explicite du GO
 * (portail tiers, en attente de validation produit) ; sa non-conversion est
 * verrouillée en fin de fichier pour que l'exclusion reste visible et ne
 * devienne pas un oubli.
 */

/** Les espaces typographiques d'Intl rendus lisibles, comme le fait déjà
 *  `__tests__/b10-tresorerie-widget.test.tsx` (l.102). */
const lisibles = (s: string): string => s.replace(/[\u00A0\u202F]/g, ' ')

/** Les appels réels : on ignore les lignes de commentaire, sinon un commentaire
 *  qui cite `fmtEuro()` gonflerait le décompte des conversions. */
const APPEL_REEL = /(?<![\w])fmtEuro\(/
function appelsReels(src: string): number {
  let n = 0
  for (const l of src.split('\n')) {
    const t = l.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue
    n += (l.match(new RegExp(APPEL_REEL, 'g')) || []).length
  }
  return n
}

function fichiersTs(repertoires: string[]): string[] {
  const sortie: string[] = []
  const descendre = (dir: string) => {
    for (const entree of readdirSync(dir)) {
      const chemin = join(dir, entree)
      if (statSync(chemin).isDirectory()) {
        descendre(chemin)
      } else if (/\.tsx?$/.test(entree)) {
        sortie.push(chemin)
      }
    }
  }
  for (const r of repertoires) descendre(r)
  return sortie.sort()
}

const SOURCES = fichiersTs(['app', 'components', 'lib'])

/**
 * Chaque source n'est lue QU'UNE fois, et le résultat est mémoïsé.
 *
 * Ce test parcourt ~500 fichiers et, sans cache, les relisait 5 à 6 fois
 * (une passe de scan, puis une par test). Ces lectures étant SYNCHRONES, elles
 * alourdissaient la suite complète — 254 s contre 206 s au HEAD, avec un écart
 * suffisant à décaler l'ordonnancement des workers. Or le dépôt porte une
 * course latente sans rapport avec ce lot : un `setTimeout(3000)` de
 * app/(dashboard)/finance/saisie/depense/page.tsx survit au démontage du jsdom
 * et finit par lever « window is not defined » (lot 2C, investigation du
 * 2026-09-27). Un test de conformité n'a pas à devenir le révélateur d'une
 * course qu'il n'a pas causée : on paie la lecture une fois.
 */
const CACHE = new Map<string, string>()
function lire(chemin: string): string {
  let s = CACHE.get(chemin)
  if (s === undefined) {
    s = readFileSync(chemin, 'utf-8')
    CACHE.set(chemin, s)
  }
  return s
}
const HORS_PERIMETRE = 'app/espace-client/'

// --- les exceptions, motivées une par une ------------------------------------

interface Exception {
  fichier: string
  /** Fragment distinctif qui doit TOUJOURS être présent : si le code change,
   *  la liste devient périmée et le test le signale au lieu de tolérer. */
  extrait: string
  motif: string
  sites: number
}

const EXCEPTIONS: Exception[] = [
  {
    fichier: 'app/bureau/fournisseurs/page.tsx',
    extrait: '{kpis.achatsEngages.toFixed(0)} €',
    motif:
      'KPI compact : toFixed(0) est un choix de densité assumé (tuile courte), pas ' +
      'une incohérence de format. fmtEuro() imposerait « ,00 » et allongerait la ' +
      'tuile — c’est un choix de design, hors périmètre de D1. À arbitrer par le produit',
    sites: 2,
  },
]

// --- extracteur ---------------------------------------------------------------

/**
 * ⚠ Piège corrigé ici et dans l'extracteur Python : après l'appel de formatage,
 * la ligne contient presque toujours l'accolade fermante du template avant
 * l'unité ou avant le suffixe d'échelle (`}k€`, `} ml`). Tester le suffixe sur
 * la suite BRUTE ne reconnaît donc ni `k€` ni `ml` : la suite commence par `}`.
 * Les deux extracteurs avaient ce même angle mort et concordaient donc à tort.
 * On retire l'accolade fermante avant de tester.
 */
const ACCOLADE_FERMANTE = /^\s*\}?\s*/
const SUFFIXE_ECHELLE = /^[kM]\s*€/
const UNITE_NON_MONETAIRE = /^(m²|ml|cm|mm|kg|%|°|pcs)\b/i
const APPEL = /\.(?:toFixed\(\s*\d*\s*\)|toLocaleString\([^)]*\))/g
const FENETRE_EURO = 30

interface Site {
  fichier: string
  ligne: number
  extrait: string
}

/**
 * Retrouve les montants dont la mise en forme est écrite à la main : un appel
 * `.toFixed(n)` ou `.toLocaleString(...)` suivi, à moins de 30 caractères, d'un
 * signe euro. Sont exclus le suffixe d'échelle `k€` des graduations de
 * graphiques et les unités non monétaires (m², ml, cm, mm, kg, °, pcs).
 */
function sitesArtisanaux(chemin: string, src: string): Site[] {
  const trouves: Site[] = []
  src.split('\n').forEach((ligne, i) => {
    for (const m of ligne.matchAll(APPEL)) {
      const reste = ligne.slice(m.index + m[0].length).replace(ACCOLADE_FERMANTE, '')
      if (SUFFIXE_ECHELLE.test(reste)) continue
      if (UNITE_NON_MONETAIRE.test(reste)) continue
      if (!reste.slice(0, FENETRE_EURO).includes('€')) continue
      const debut = Math.max(0, m.index - 60)
      trouves.push({
        fichier: chemin,
        ligne: i + 1,
        extrait: ligne
          .slice(debut, m.index + m[0].length + FENETRE_EURO)
          .replace(/[ \t]+/g, ' ')
          .trim(),
      })
    }
  })
  return trouves
}

const tousLesSites: Site[] = SOURCES.flatMap((f) =>
  sitesArtisanaux(f, lire(f))
)
const sitesInterdits = tousLesSites.filter((s) => !s.fichier.startsWith(HORS_PERIMETRE))
const SITES_ATTENDUS = EXCEPTIONS.reduce((n, e) => n + e.sites, 0)

// --- 1. la source de vérité ---------------------------------------------------

describe('LOT 2C — fmtEuro() reste la source de vérité', () => {
  it('formate les valeurs représentatives en français', () => {
    const attendu: Array<[number, string]> = [
      [0, '0,00 €'],
      [12.5, '12,50 €'],
      [1234.5, '1 234,50 €'],
      [1234.56, '1 234,56 €'],
      [10000, '10 000,00 €'],
      [-12.5, '-12,50 €'],
      [-1234.56, '-1 234,56 €'],
    ]
    for (const [valeur, attenduLisible] of attendu) {
      expect(lisibles(fmtEuro(valeur)), `fmtEuro(${valeur})`).toBe(attenduLisible)
    }
  })

  it('arrondit à la deuxième décimale, au plus proche', () => {
    // 0.005 -> 0.01 et non 0.00. C'est le comportement d'Intl ; il ne doit pas
    // changer sans décision produit, car un arrondi vers le zéro au lieu du plus
    // proche change un total affiché.
    expect(lisibles(fmtEuro(0.005))).toBe('0,01 €')
    expect(lisibles(fmtEuro(1 / 3))).toBe('0,33 €')
  })

  it('renvoie « 0,00 € » sur null, undefined et NaN au lieu de lever', () => {
    // C'est précisément ce que les deux doublons supprimés ne faisaient pas :
    // `euros(null)` était une TypeError. Tout site d'affichage qui reçoit une
    // valeur nullable passe maintenant par ce repli.
    expect(lisibles(fmtEuro(null))).toBe('0,00 €')
    expect(lisibles(fmtEuro(undefined))).toBe('0,00 €')
    expect(lisibles(fmtEuro(Number.NaN))).toBe('0,00 €')
  })

  it('porte le signe moins lui-même : aucun préfixe externe ne doit s y ajouter', () => {
    // Les sites d'écart (RentabiliteMainOeuvreWidget) conservent leur
    // `{x > 0 ? "+" : ""}` et ont supprimé le « - » littéral de toFixed. Si
    // fmtEuro() se mettait à présigner, on verrait « +-1 234,56 € ».
    expect(lisibles(fmtEuro(-1234.56)).startsWith('+')).toBe(false)
    expect(lisibles(fmtEuro(-1234.56))).toBe('-1 234,56 €')
    expect(lisibles(fmtEuro(1234.56)).startsWith('-')).toBe(false)
  })

  it('n autorise ni espace ordinaire ni coupure : les espaces sont insécables', () => {
    // U+202F entre les groupes de milliers, U+00A0 avant le € : un montant ne
    // doit jamais se couper en fin de ligne, en PDF comme à l'écran.
    const s = fmtEuro(1234567.89)
    expect(s).toContain('\u202F')
    expect(s).toContain('\u00A0\u20AC')
    expect(s, 'aucune espace ordinaire ne doit subsister').not.toMatch(/ /)
  })

  it('les écarts gardent leur garde de signe : jamais « +-1 234,56 € »', () => {
    // fmtEuro() porte déjà le signe moins. Les sites d'écart — qui, eux, peuvent
    // être négatifs — doivent donc conserver le ternaire qui n'ajoute le « + »
    // que sur une valeur strictement positive. Perdre cette garde, ou remplacer
    // le « - » littéral de toFixed par un « + » inconditionnel, produirait un
    // double signe à l'écran.
    //
    // Le préfixe de signe LITTÉRAL reste par ailleurs la convention du dépôt
    // ailleurs (`-{fmtEuro(sorties)}`, `+{fmtEuro(entrees)}` — 9 sites
    // antérieurs à ce lot) : c'est une présentation comptable sur des sommes dont
    // l'appelant connaît le sens du signe. On ne verrouille donc que les deux
    // écarts, là où le signe n'est pas garanti.
    const src = readFileSync(
      'app/(dashboard)/finance/components/RentabiliteMainOeuvreWidget.tsx',
      'utf-8'
    )
    expect(src).toContain('{phaseCritique.ecart > 0 ? "+" : ""}{fmtEuro(phaseCritique.ecart)}')
    expect(src).toContain('{d.ecart > 0 ? "+" : ""}{fmtEuro(d.ecart)}')
    // Le « + » inconditionnel restant porte sur la phase la plus rentable, dont
    // l'écart est positif par définition (sélection par maximum).
    expect(src).toContain('+{fmtEuro(phaseRentable.ecart)} générés')
  })
})

// --- 2. plus de doublon --------------------------------------------------------

describe('LOT 2C — aucun doublon de formateur monétaire', () => {
  it('un seul `style: currency` dans tout le dépôt : celui de la référence', () => {
    const sites: string[] = []
    for (const f of SOURCES) {
      lire(f)
        .split('\n')
        .forEach((l, i) => {
          if (/style:\s*['"]currency['"]/.test(l)) sites.push(`${f}:${i + 1}`)
        })
    }
    expect(sites).toEqual(['lib/financeCalculs.ts:257'])
  })

  it('les doublons euros() et fmtMontant() ont disparu', () => {
    const definitions: string[] = []
    for (const f of SOURCES) {
      lire(f)
        .split('\n')
        .forEach((l) => {
          if (/^\s*(export\s+)?(function|const)\s+(euros|fmtMontant)\b/.test(l)) {
            definitions.push(`${f}: ${l.trim()}`)
          }
        })
    }
    expect(definitions).toEqual([])
  })

  it('financeCalculs reste importable côté serveur', () => {
    // app/api/dashboard-patron/route.ts importe désormais fmtEuro : le module ne
    // doit rien tirer qui suppose le DOM.
    const src = lire('lib/financeCalculs.ts')
    expect(src).not.toMatch(/^\s*['"]use client['"]/m)
    const imports = src.match(/^import[\s\S]*?from\s*['"][^'"]+['"]/gm) || []
    expect(imports.length, 'financeCalculs ne doit importer que des types').toBeGreaterThan(0)
    for (const i of imports) {
      expect(i, `import non-type dans financeCalculs : ${i}`).toMatch(/@\/types\//)
    }
  })
})

// --- 3. plus de formatage artisanal -------------------------------------------

describe('LOT 2C — plus aucun formatage monétaire artisanal', () => {
  it('les 55 conversions du lot sont en place', () => {
    const appels = SOURCES.reduce((n, f) => n + appelsReels(lire(f)), 0)
    const importateurs = SOURCES.filter((f) =>
      /import\s*\{[^}]*\bfmtEuro\b/.test(lire(f))
    )
    // 76 appels réels à HEAD, + 55 convertis ici = 131, puis + 5 dans
    // components/FraisDeplacementTab.tsx (5 `.toFixed(2) + " €"` convertis) =
    // 136, puis − 1 en PHASE 2 = 135. Les 15 fichiers qui importaient fmtEuro
    // à HEAD, + 11 dans ce lot = 26, + 1 (FraisDeplacementTab) = 27, puis
    // − 1 en PHASE 2 = 26.
    //
    // PHASE 2 : `app/bureau/page.tsx` est devenu une redirection vers `/`. Ce
    // cockpit était le dernier à porter à la fois un `fmtEuro()` (le montant
    // des factures en retard, ligne 63) et l'import correspondant : les deux
    // disparaissent avec lui. Aucun autre fichier n'est affecté, et le bloc
    // « Chiffres clés » de l'accueil n'affiche que des compteurs, jamais des
    // montants — donc aucun formatage monétaire n'a été perdu en route.
    //
    // PHASE 5 : + 1 importateur (`components/RetenueGarantieChantier.tsx`) = 27,
    // et + 19 appels réels (17 dans RetenueGarantieChantier, 2 dans factures) = 154.
    //
    // Ces deux nombres sont un DÉCOMPTE DE LOT, pas un contrat : toute conversion
    // correcte ultérieure les déplace mécaniquement. Le contrat de fond est
    // « ne subsistent que les exceptions documentées », vérifié plus bas — c'est
    // lui qui a Tickets, et lui qui était rouge avant cette conversion.
    expect(appels, 'nb total d’appels réels à fmtEuro()').toBe(154)
    expect(importateurs.length, 'nb de fichiers qui importent fmtEuro').toBe(27)
  })

  it('la référence définit fmtEuro() une seule fois, et l’exporte', () => {
    // 26 fichiers importent fmtEuro ; celui-ci ne s'importe pas lui-même, il
    // définit. Une seconde définition ailleurs pourrait diverger en silence de
    // la source de vérité : on verrouille qu'il n'en existe aucune autre.
    const src = lire('lib/financeCalculs.ts')
    expect(
      src.split('\n').filter((l) => /export\s+function\s+fmtEuro\b/.test(l))
    ).toHaveLength(1)
    for (const f of SOURCES) {
      if (f === 'lib/financeCalculs.ts') continue
      expect(
        /export\s+(function|const)\s+fmtEuro\b/.test(lire(f)),
        `définition concurrente de fmtEuro dans ${f}`
      ).toBe(false)
    }
  })

  it('ne subsistent que les exceptions documentées', () => {
    expect(
      sitesInterdits.length,
      'nb de sites hors exceptions (attendu ' + SITES_ATTENDUS + ')'
    ).toBe(SITES_ATTENDUS)
    for (const site of sitesInterdits) {
      const connue = EXCEPTIONS.some((e) => e.fichier === site.fichier)
      expect(
        connue,
        `exception non documentée : ${site.fichier}:${site.ligne}\n  ${site.extrait}`
      ).toBe(true)
    }
  })

  it('chaque exception documentée existe encore (liste pas périmée)', () => {
    for (const e of EXCEPTIONS) {
      const src = lire(e.fichier)
      expect(src, `exception introuvable : ${e.fichier}`).toContain(e.extrait)
      expect(
        sitesArtisanaux(e.fichier, src).length,
        `nb de sites pour ${e.fichier} (déclaré ${e.sites})`
      ).toBe(e.sites)
    }
  })

  it('le scan détecte bien une violation : anti-vacuité', () => {
    // Un test de conformité qui passe sans avoir jamais rien détecté ne vaut
    // rien. On le soumet une source qui VIOLLE le contrat, construite en mémoire :
    // aucune relecture de disque, donc c'est bien le détecteur qui est éprouvé.
    const mauvaise = [
      '<span>{totalHT.toFixed(2)} €</span>', // à convertir
      '<span>{marge.toFixed(2)} €</span>', // à convertir
      'afficherToast(`${montantHT.toLocaleString("fr-FR")}€`)', // à convertir
      '<p>{surface.toFixed(2)} m²</p>', // surface : hors contrat
      '<p>{taux.toFixed(1)} %</p>', // pourcentage : hors contrat
      'tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`}', // échelle : hors contrat
      '<p>{lineaire.toFixed(1)} ml</p>', // mètre linéaire : hors contrat
      '<p>{total.toFixed(2)} €</p>', // à convertir
    ].join('\n')
    expect(sitesArtisanaux('memoire.tsx', mauvaise).map((t) => t.ligne)).toEqual([1, 2, 3, 8])
  })

  it('espace-client reste intact : 7 sites, volontairement non convertis', () => {
    // Portail tiers, en attente de validation produit. On verrouille que
    // l'exclusion tient, pour qu'un lot ultérieur ne la contourne pas par
    // megarde en « centralisant au passage ».
    const f = 'app/espace-client/[code_acces]/page.tsx'
    const src = lire(f)
    expect(sitesArtisanaux(f, src)).toHaveLength(7)
    expect(src, 'espace-client ne doit pas importer fmtEuro').not.toContain('fmtEuro')
    expect(tousLesSites.filter((s) => s.fichier.startsWith(HORS_PERIMETRE))).toHaveLength(7)
  })
})
