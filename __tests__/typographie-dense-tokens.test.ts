// =============================================================================
// LOT 2F-1 — échelle typographique dense (`text-4xs` / `text-2xs` / `text-3xs`)
// =============================================================================
//
// Contexte. L'échelle Tailwind saute de `text-xs` (12px) à `text-sm` (14px) :
// les tailles entre 9 et 11 px n'y ont pas de cran. Elles étaient donc écrites en
// arbitraire — `text-[9px]`, `text-[10px]`, `text-[11px]` — partout. Le LOT 2A a
// déclaré les trois tokens `--text-4xs/2xs/3xs` dans `app/globals.css` sans les
// adopter nulle part ; ce lot les adopte.
//
// Mesure AVANT (balayage exhaustif de la source, pas seulement des `className`) :
//
//   text-[9px]     15 occurrences  dont 13 dans des vues d'impression
//   text-[10px]   220 occurrences  dont 66 dans des vues d'impression
//   text-[11px]   117 occurrences  dont 35 dans des vues d'impression
//   TOTAL         352
//
//   − 114 vues d'impression (interdites par le cahier des charges)
//   −   4 `espace-client`   (interdit : portail tiers)
//   = 234 occurrences converties, dans 37 fichiers.
//
// L'audit 2F avait annoncé 344 : son extracteur ne lisait que les attributs
// `className` et laissait 8 occurrences de côté. Le chiffre de 352 est celui du
// commentaire `@theme` du LOT 2A, écrit indépendamment — les deux concordent.
//
// Ce test verrouille :
//   1. la DÉCLARATION des trois tokens, et leur valeur ;
//   2. l'ÉQUIVALENCE de rendu, en interrogeant le VRAI compilateur Tailwind avec
//      le VRAI `app/globals.css` — pas une recherche de chaîne. C'est la seule
//      façon de prouver qu'un token « fonctionne » : un token non résolu par
//      Tailwind n'émet AUCUNE règle, et le remplacement d'un arbitraire par un
//      tel token SUPPRIMERAIT silencieusement le style ;
//   3. l'absence de divergence sur `line-height` (aucune des deux formes ne doit
//      émettre de clause `line-height`, sinon le lot aurait modifié les
//      interlignes existants) ;
//   4. l'ADOPTION : plus aucun arbitraire dense hors des zones exclues ;
//   5. les EXCLUSIONS : vues d'impression et `espace-client` inchangées à
//      l'octet près, vérifiées contre un commit ÉPINGLÉ.
//
// ANCRAGE. `COMMIT_AVANT_CONVERSION` est un SHA fixe, jamais `HEAD` : `HEAD`
// désigne l'état courant, donc le changement lui-même, et l'assertion
// cesserait de trouver les arbitraires le jour où la conversion serait
// committée. C'est l'incident du LOT 2E, reproduit ici sous forme de parade.
// =============================================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative } from 'node:path'

/** État du dépôt AVANT la conversion. Ne jamais remplacer par `HEAD`. */
const COMMIT_AVANT_CONVERSION = 'a04dccc24a161c8aa94f70dc897fb8c451e31bec'

const RACINE = process.cwd()

/** Arbitraire dense → token dense. L'inversion est la preuve d'équivalence. */
const PAIRES = [
  { arbitraire: 'text-[9px]', token: 'text-4xs', px: '9px', varCss: '--text-4xs' },
  { arbitraire: 'text-[10px]', token: 'text-2xs', px: '10px', varCss: '--text-2xs' },
  { arbitraire: 'text-[11px]', token: 'text-3xs', px: '11px', varCss: '--text-3xs' },
] as const

/** Zones où l'arbitraire dense est CONSERVÉ, et pourquoi. */
const MOTIF_EXCLU =
  /BonCommandePDF|DocumentPDF|FicheDebitPDF|LettreRelancePDF|PVReceptionPDF|RapportIntemperiesPDF|RapportSAVPDF|rapports\/RapportClientPrint|exports\/[A-Za-z]*PDF/

const DIRS_SOURCES = ['app', 'components', 'lib']

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
  for (const d of DIRS_SOURCES) marcher(join(RACINE, d))
  return out.sort()
}

const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf-8')
const auCommit = (chemin: string) =>
  execFileSync('git', ['-C', RACINE, 'show', `${COMMIT_AVANT_CONVERSION}:${chemin}`], {
    encoding: 'utf-8',
    maxBuffer: 1 << 28,
  })

const cssGlobal = lire('app/globals.css')
const SOURCES = fichiersSources()

// -----------------------------------------------------------------------------
// 1 — Déclaration des tokens
// -----------------------------------------------------------------------------

describe('2F-1 · déclaration des tokens denses', () => {
  for (const { token, px, varCss } of PAIRES) {
    it(`${varCss} est déclaré à ${px} dans app/globals.css`, () => {
      // La déclaration doit exister ET porter exactement la valeur attendue :
      // une valeur divergente passerait le test « le token existe » tout en
      // changeant le rendu de 234 sites.
      const m = cssGlobal.match(new RegExp(`${varCss}\\s*:\\s*([^;]+);`))
      expect(m, `${varCss} absent de app/globals.css`).not.toBeNull()
      expect(m![1].trim()).toBe(px)
    })

    it(`${token} est l'utilitaire déduit de ${varCss}`, () => {
      // Le nom de l'utilitaire est le suffixe du nom de la variable : c'est ce
      // contrat de nommage de Tailwind qui fait que `text-2xs` existe.
      expect(token).toBe('text-' + varCss.replace('--text-', ''))
    })
  }
})

// -----------------------------------------------------------------------------
// 2 & 3 — Équivalence de rendu, mesurée par le vrai compilateur
// -----------------------------------------------------------------------------

/**
 * Compile les classes demandées avec le VRAI `app/globals.css`.
 *
 * Un compilateur NEUF à chaque appel : `compile()` conserve un état de design
 * system qui fuit d'un `build()` à l'autre. Réutiliser une instance pour deux
 * compilations produit des règles fantômes — c'est-à-dire des « différences »
 * qui n'existent pas, et inversement des égalités qui n'existent plus. Ce défaut
 * a été observé pendant la construction de ce lot.
 */
async function cssEmis(classes: string[]): Promise<string> {
  const { compile } = await import('tailwindcss')
  const path = await import('node:path')
  const RACINE_ABS = RACINE
  const indexTw = path.join(RACINE_ABS, 'node_modules/tailwindcss/index.css')
  const compilateur = await compile(cssGlobal, {
    base: RACINE_ABS,
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
  return compilateur.build(classes) as unknown as string
}

/** Corps des règles déclaratives portant CE sélecteur exactement. */
function corpsRegle(css: string, selecteur: string): string[] {
  // Le sélecteur doit être échappé comme Tailwind l'échappe : `text-[10px]`
  // devient `text-\[10px\]` dans le CSS produit.
  const sel = '.' + selecteur.replace(/[.[\]/%#]/g, (c) => '\\' + c)
  const motif = new RegExp('(^|[{}])\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g')
  const trouvees: string[] = []
  let m: RegExpExecArray | null
  while ((m = motif.exec(css)) !== null) {
    const corps = m[2].trim().replace(/\s+/g, ' ')
    if (corps) trouvees.push(corps)
  }
  return trouvees
}

describe('2F-1 · équivalence de rendu mesurée par Tailwind', () => {
  for (const { arbitraire, token, px } of PAIRES) {
    it(`${token} émet exactement ce que ${arbitraire} émettait`, async () => {
      const css = await cssEmis([arbitraire, token])

      // garde-fou : une sonde qui ne trouve rien ne prouve rien
      const corpsArbitraire = corpsRegle(css, arbitraire)
      expect(
        corpsArbitraire.length,
        `la sonde ne trouve aucune règle pour ${arbitraire} : preuve rejetée`,
      ).toBeGreaterThan(0)

      const corpsToken = corpsRegle(css, token)
      // Un token non résolu n'émet RIEN. Sans cette assertion, un token cassé
      // passerait silencieusement en effaçant 234 corps de texte.
      expect(
        corpsToken.length,
        `${token} n'émet aucune règle : le remplacer supprimerait le style`,
      ).toBeGreaterThan(0)

      // Même jeu de propriétés, mêmes valeurs une fois la variable résolue.
      const resoudre = (c: string) => c.replace(/var\(--text-(2xs|3xs|4xs)\)/g, px)
      expect(resoudre(corpsToken.join(' ; '))).toBe(corpsArbitraire.join(' ; '))

      // La valeur résolue de la variable doit être celle de l'arbitraire.
      const m = css.match(new RegExp(`${'--text-' + token.replace('text-', '')}\\s*:\\s*([^;]+);`))
      expect(m, `la variable de ${token} n'est pas émise dans :root`).not.toBeNull()
      expect(m![1].trim()).toBe(px)
    })

    it(`${token} n'introduit aucune clause line-height`, async () => {
      // Chose à surveiller : `text-xs` émet
      //   line-height: var(--tw-leading, var(--text-xs--line-height))
      // Un token qui émettrait un `line-height` modifierait les interlignes
      // existants. L'arbitraire n'en émet pas : le token ne doit pas en émettre.
      const css = await cssEmis([token, arbitraire])
      for (const sel of [token, arbitraire]) {
        for (const corps of corpsRegle(css, sel)) {
          expect(corps, `${sel} émet une clause line-height`).not.toMatch(/line-height/)
        }
      }
    })
  }
})

// -----------------------------------------------------------------------------
// 4 — Adoption : plus aucun arbitraire dense hors des zones exclues
// -----------------------------------------------------------------------------

describe('2F-1 · adoption complète hors zones exclues', () => {
  it('les 234 occurrences hors exclusions sont toutes converties', () => {
    const restants: string[] = []
    let converties = 0
    for (const f of SOURCES) {
      const src = lire(f)
      const exclu = MOTIF_EXCLU.test(f) || f.includes('espace-client')
      for (const { arbitraire, token } of PAIRES) {
        const n = src.split(arbitraire).length - 1
        if (n === 0) continue
        if (exclu) continue
        restants.push(`${f} : ${n} × ${arbitraire}`)
        converties += n
      }
    }
    expect(
      restants,
      `des tailles denses en arbitraire subsistent hors périmètre :\n${restants.join('\n')}`,
    ).toEqual([])
    expect(converties).toBe(0)
  })

  it('les tokens denses sont effectivement présents', () => {
    // Contrôle de non-vacuité : l'assertion ci-dessus passerait aussi sur un
    // dépôt vide. On vérifie que le lot a bien produit 234 usages.
    let total = 0
    const parToken = new Map<string, number>()
    for (const f of SOURCES) {
      if (MOTIF_EXCLU.test(f) || f.includes('espace-client')) continue
      const src = lire(f)
      for (const { token } of PAIRES) {
        const n = src.split(token).length - 1
        total += n
        parToken.set(token, (parToken.get(token) ?? 0) + n)
      }
    }
    expect(total).toBe(234)
    expect(parToken.get('text-4xs')).toBe(2)
    expect(parToken.get('text-2xs')).toBe(151)
    expect(parToken.get('text-3xs')).toBe(81)
  })

  it('aucun site n\'émite à la fois un token dense et son arbitraire', () => {
    // Un élément portant les deux verrait la Cascade trancher par ordre
    // d'émission CSS, pas par intention.
    for (const f of SOURCES) {
      for (const ligne of lire(f).split('\n')) {
        for (const { arbitraire, token } of PAIRES) {
          if (ligne.includes(arbitraire) && new RegExp(`(?<![-\\w])${token}`).test(ligne)) {
            throw new Error(`${f} porte ${token} et ${arbitraire} sur la même ligne`)
          }
        }
      }
    }
  })
})

// -----------------------------------------------------------------------------
// 5 — Exclusions : impressions et espace-client intacts
// -----------------------------------------------------------------------------

describe('2F-1 · exclusions respectées', () => {
  it('les vues d\'impression sont inchangées à l\'octet près', () => {
    // La liste n'est PAS figée dans le test : un nouveau fichier d'impression
    // s'y ajoutera tout seul. Ce qui est figé, c'est le nombre d'occurrences
    // d'arbitraire dense qui doivent y subsister — sans quoi le test
    // s'appliquerait à zéro fichier et passerait à vide.
    const vues = SOURCES.filter((f) => MOTIF_EXCLU.test(f))
    expect(vues.length, 'aucune vue d\'impression détectée').toBeGreaterThan(0)
    let occurrences = 0
    for (const f of vues) {
      expect(lire(f), `${f} a été modifié`).toBe(auCommit(f))
      for (const { arbitraire } of PAIRES) occurrences += lire(f).split(arbitraire).length - 1
    }
    expect(occurrences).toBe(114)
  })

  it('espace-client est inchangé à l\'octet près', () => {
    // Cinq fichiers portent « espace-client » dans leur chemin, dont quatre
    // routes d'API. Tous sont vérifiés ; les arbitraires denses n'en sont que
    // dans la page.
    const fichiers = SOURCES.filter((f) => f.includes('espace-client'))
    expect(fichiers.length, 'aucun fichier espace-client détecté').toBeGreaterThan(0)
    let occurrences = 0
    for (const f of fichiers) {
      expect(lire(f), `${f} a été modifié`).toBe(auCommit(f))
      for (const { arbitraire } of PAIRES) occurrences += lire(f).split(arbitraire).length - 1
    }
    expect(occurrences).toBe(4)
  })

  it('le commit de référence est bien un ancêtre de HEAD', () => {
    // `merge-base --is-ancestor` ne produit AUCUNE sortie : il ne renvoie 0 que
    // si le commit est un ancêtre, et sort en code 1 sinon. Tester « il n'a pas
    // levé » est donc la seule forme vérifiable — une assertion sur la valeur de
    // retour serait vide, puisque `execFileSync` lève au moindre échec.
    let code = 0
    try {
      execFileSync('git', ['-C', RACINE, 'merge-base', '--is-ancestor', COMMIT_AVANT_CONVERSION, 'HEAD'], {
        stdio: 'pipe',
      })
    } catch {
      code = 1
    }
    expect(code, `${COMMIT_AVANT_CONVERSION} n'est pas un ancêtre de HEAD`).toBe(0)
  })
})
