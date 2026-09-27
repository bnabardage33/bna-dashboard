import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * LOT 2B / 2B bis — verrouillage du contraste des boutons rouges.
 *
 * Le test relit les sources TSX, détermine pour chaque element les classes
 * RÉELLEMENT co-appliquées (parties inconditionnelles + branches de ternaire)
 * et vérifie le contraste texte/fond, etat par etat (repos, hover, focus,
 * active) selon le seuil WCAG 2.1 AA pour du texte normal : 4.5:1.
 *
 * Portefeuille de couleurs : Tailwind v4 émet de l'oklch, pas de l'hex.
 * Les valeurs ci-dessous sont les sRGB équivalents de la version INSTALLÉE
 * (4.3.3), vérifiés par aller-retour oklch <-> sRGB sur 4 références.
 * ⚠ Si Tailwind est mis à jour, ces valeurs sont à re-dériver : le test le
 * signale explicitement (voir « le portefeuille correspond à Tailwind 4.3.3 »).
 *
 * Périmètre : les elements portant un fond rouge quelque part. Pour chacun, on
 * compare le contraste dans CHAQUE état où fond et texte sont déterminables.
 * Le fond est résolu état par état comme le texte : un bouton peut basculer sur
 * un fond clair au survol (AvancementFacades : red-600 -> gray-300) et alors
 * assombrir son texte. Résoudre le fond « au repos » pendant qu'on lit le texte
 * « au survol » comparerait deux choses jamais affichées ensemble.
 *
 * Limite assumée : les fonds opaques non listés dans FONDS_SUIVIS — dont les
 * arbitraires à modificateur d'opacité (`bg-[#1A1D24]/80`), qui exigent de
 * composer avec l'arrière-plan — sont ignorés, pas devinés. Les cas réels de
 * cette catégorie sont verrouillés par des tests ciblés en fin de fichier.
 */

// --- couleurs (sRGB resolu depuis l'oklch de Tailwind 4.3.3) ---
const COUL = {
  'red-500': '#FB2C36',
  'red-600': '#E7000B',
  'red-700': '#C10007',
  'slate-950': '#020618',
  'slate-900': '#0F172A',
  'gray-400': '#99A1AF',
  'gray-300': '#D1D5DC',
  'white': '#FFFFFF',
  // token de marque du LOT 2A (app/globals.css : --color-brand)
  'brand': '#E30613',
} as const

/** Fonds opaques suivis. `brand` = bg-[#E30613]. */
const FONDS_SUIVIS = ['red-500', 'red-600', 'red-700', 'brand', 'gray-300'] as const
/** Déclenche le contrôle : l'element porte un fond rouge dans un etat. */
const FONDS_ROUGE = ['red-500', 'red-600', 'red-700'] as const
const TEINTES_TEXTE = ['slate-950', 'slate-900', 'gray-400', 'gray-300', 'white'] as const
/** Teintes trop claires pour tenir sur les rouges de l'échelle. */
const TEXTES_CLAIRS = ['white', 'gray-300', 'gray-400'] as const
const SEUIL_AA = 4.5

// --- maths WCAG ---
const canal = (v: number) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = (hex: string) => {
  const h = hex.replace('#', '')
  const r = canal(parseInt(h.slice(0, 2), 16))
  const g = canal(parseInt(h.slice(2, 4), 16))
  const b = canal(parseInt(h.slice(4, 6), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contraste = (fg: string, bg: string) => {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

// --- lecture des sources ---
function fichiersTsx(repertoire: string): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(repertoire)) {
    const chemin = join(repertoire, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersTsx(chemin))
    else if (entree.endsWith('.tsx')) sortie.push(chemin)
  }
  return sortie
}

/** Valeur d'un attribut className= ; renvoie le contenu et s'il est chaîne simple. */
function lireValeur(src: string, j: number): { texte: string; simple: boolean } | null {
  if (src[j] === '{') {
    let p = 0
    for (let k = j; k < src.length; k++) {
      if ('{(['.includes(src[k])) p++
      else if ('})]'.includes(src[k])) {
        p--
        if (p === 0) return { texte: src.slice(j + 1, k), simple: false }
      }
    }
    return null
  }
  if (src[j] === '"' || src[j] === "'") {
    const k = src.indexOf(src[j], j + 1)
    return k > 0 ? { texte: src.slice(j + 1, k), simple: true } : null
  }
  return null
}

/**
 * Découpe une expression de className en fragments co-appliqués.
 * Gère les ':' de pseudo-états (hover:), les littéraux, et les ${...}
 * d'un template literal (qui contiennent du code : un ternaire y compte).
 */
function decouper(expr: string): string[] {
  const parts: string[] = []
  let buf = ''
  // pile : ['code', depuisInterpolation] | ['str', delim] | ['tmpl']
  const pile: [string, string | boolean][] = [['code', false]]
  let imbrication = 0
  const vider = () => {
    if (buf.trim()) parts.push(buf)
    buf = ''
  }
  let i = 0
  while (i < expr.length) {
    const [mode, arg] = pile[pile.length - 1]
    const c = expr[i]
    const nxt = expr.slice(i, i + 2)

    if (mode === 'str') {
      buf += c
      if (c === arg && expr[i - 1] !== '\\') pile.pop()
      i++
      continue
    }
    if (mode === 'tmpl') {
      if (nxt === '${') {
        buf += nxt
        pile.push(['code', true])
        i += 2
        continue
      }
      if (c === '`') pile.pop()
      buf += c
      i++
      continue
    }

    if (c === '"' || c === "'") pile.push(['str', c])
    else if (c === '`') pile.push(['tmpl', ''])
    else if ('([{'.includes(c)) imbrication++
    else if (')]}'.includes(c)) {
      if (c === '}' && imbrication === 0 && arg === true && pile.length > 1) pile.pop()
      else imbrication = Math.max(0, imbrication - 1)
    } else if (
      imbrication === 0 &&
      (c === '?' || (c === ':' && !nxt.startsWith('::')) || nxt === '&&' || nxt === '||')
    ) {
      vider()
      i += nxt === '&&' || nxt === '||' ? 2 : 1
      continue
    }
    buf += c
    i++
  }
  vider()
  return parts
}

const JETON = /^-?[a-zA-Z0-9_]+(?:[-/:[\].%][a-zA-Z0-9_\-.[\]%:#/]*)*$/

/**
 * Classes d'un fragment de className.
 *
 * @param simple  `true` pour un attribut `className="..."` : la valeur EST
 *                déjà la liste de classes, il n'y a aucun littéral à extraire.
 *                Sans ce court-circuit, la machine à états ci-dessous ne
 *                verrait aucun littéral et ne rendrait AUCUNE classe.
 * @param sinon   contenu des littéraux uniquement ; le code est ignoré.
 */
function classesDu(frag: string, simple = false): Set<string> {
  const out = new Set<string>()
  if (simple) {
    for (const t of frag.split(/\s+/)) if (JETON.test(t)) out.add(t)
    return out
  }
  const pile: [string, string | boolean][] = [['code', false]]
  let imbrication = 0
  let courant = ''
  const vider = () => {
    for (const t of courant.split(/\s+/)) if (JETON.test(t)) out.add(t)
    courant = ''
  }
  let i = 0
  while (i < frag.length) {
    const [mode, arg] = pile[pile.length - 1]
    const c = frag[i]
    const nxt = frag.slice(i, i + 2)
    if (mode === 'str') {
      if (c === arg && frag[i - 1] !== '\\') {
        pile.pop()
        vider()
      } else courant += c
    } else if (mode === 'tmpl') {
      if (nxt === '${') {
        pile.push(['code', true])
        i += 2
        continue
      }
      if (c === '`') {
        pile.pop()
        vider()
      } else courant += c
    } else if (c === '"' || c === "'") pile.push(['str', c])
    else if (c === '`') pile.push(['tmpl', ''])
    else if ('([{'.includes(c)) imbrication++
    else if (')]}'.includes(c)) {
      if (c === '}' && imbrication === 0 && arg === true && pile.length > 1) pile.pop()
      else imbrication = Math.max(0, imbrication - 1)
    } else {
      i++
      continue
    }
    i++
  }
  vider()
  return out
}

type Clause = { fichier: string; ligne: number; classes: Set<string> }

function collecter(): Clause[] {
  const clauses: Clause[] = []
  for (const repertoire of ['app', 'components']) {
    for (const chemin of fichiersTsx(repertoire)) {
      const src = readFileSync(chemin, 'utf-8')
      const re = /className\s*=\s*/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src)) !== null) {
        let j = m.index + m[0].length
        while (' \n\t'.includes(src[j])) j++
        const val = lireValeur(src, j)
        if (!val) continue
        const ligne = src.slice(0, m.index).split('\n').length
        const frags = val.simple ? [val.texte] : decouper(val.texte)
        const base = frags.length ? classesDu(frags[0], val.simple) : new Set<string>()
        frags.forEach((f, i) => {
          const c = classesDu(f, val.simple)
          if (i > 0) for (const x of base) c.add(x)
          clauses.push({ fichier: chemin, ligne, classes: c })
        })
      }
    }
  }
  return clauses
}

/**
 * Nom de classe de fond → identifiant de palette. `bg-[#E30613]` est le
 * token de marque et se note `brand`. Un modificateur d'opacité (`/80`) rend
 * le fond non comparable et est donc rejeté plutôt que deviné.
 */
function nomFond(classe: string): string | null {
  const m = /^bg-(\[[^\]]+\]|[a-z]+-\d{2,3})$/.exec(classe)
  if (!m) return null
  const v = m[1]
  if (v === '[#E30613]') return 'brand'
  if (/^\d/.test(v)) return null // bg-red-600/80 : hors modèle
  return (FONDS_SUIVIS as readonly string[]).includes(v) ? v : null
}

/**
 * Fond effectif pour un état : la version préfixée l'emporte sur la version
 * nue (c'est l'ordre dans lequel Tailwind émet les variantes). Couvre aussi
 * les fonds clairs, sans quoi un survol rouge survolant un fond clair serait
 * comparé au fond de repos.
 */
function fondEffectif(classes: Set<string>, prefixe: string): string | null {
  for (const v of FONDS_SUIVIS) {
    if (classes.has(`${prefixe}bg-${v}`)) return v
  }
  if (classes.has(`${prefixe}bg-[#E30613]`)) return 'brand'
  if (prefixe) {
    for (const v of FONDS_SUIVIS) if (classes.has(`bg-${v}`)) return v
    if (classes.has('bg-[#E30613]')) return 'brand'
  }
  return null
}

/** L'élélement porte-t-il un fond rouge (dans un état ou dans un autre) ? */
function porteFondRouge(classes: Set<string>): boolean {
  for (const etat of ['', 'hover:', 'focus:', 'active:']) {
    for (const v of FONDS_ROUGE) {
      if (classes.has(`${etat}bg-${v}`)) return true
    }
  }
  return false
}

/** Teinte de texte effective pour un état, même règle que pour le fond. */
function texteEffectif(classes: Set<string>, prefixe: string): string | null {
  for (const t of TEINTES_TEXTE) {
    if (classes.has(`${prefixe}text-${t}`)) return t
  }
  if (prefixe) for (const t of TEINTES_TEXTE) if (classes.has(`text-${t}`)) return t
  return null
}

const ETATS = ['', 'hover:', 'focus:', 'active:']

/** Un couple (fichier, ligne, état) contrôlé, avec son contraste mesuré. */
type Paire = { fichier: string; ligne: number; etat: string; fond: string; texte: string; r: number }

function pairesContraste(): Paire[] {
  const out: Paire[] = []
  for (const { fichier, ligne, classes } of collecter()) {
    if (!porteFondRouge(classes)) continue
    for (const etat of ETATS) {
      const fond = fondEffectif(classes, etat)
      if (!fond) continue
      const texte = texteEffectif(classes, etat)
      if (!texte) continue
      if (!(fond in COUL) || !(texte in COUL)) continue
      out.push({
        fichier,
        ligne,
        etat: etat || 'repos',
        fond,
        texte,
        r: contraste(
          COUL[texte as keyof typeof COUL],
          COUL[fond as keyof typeof COUL],
        ),
      })
    }
  }
  return out
}

function manquants(): Paire[] {
  return pairesContraste().filter((p) => p.r < SEUIL_AA)
}

const describre = (p: Paire) =>
  `${p.fichier}:${p.ligne}  ${p.etat}  bg-${p.fond} + text-${p.texte} = ${p.r.toFixed(2)}:1`

describe('LOT 2B — contraste des boutons rouges (WCAG 2.1 AA)', () => {
  it('le calcul de contraste du test est juste', () => {
    // Auto-vérification : si ces valeurs bougent, la palette est périmée.
    expect(contraste(COUL.white, COUL['red-600'])).toBeCloseTo(4.77, 2)
    expect(contraste(COUL.white, COUL['red-700'])).toBeCloseTo(6.42, 2)
    expect(contraste(COUL['slate-950'], COUL['red-600'])).toBeCloseTo(4.23, 2)
    expect(contraste(COUL['slate-950'], COUL['red-700'])).toBeCloseTo(3.14, 2)
    expect(contraste(COUL['gray-400'], COUL['red-600'])).toBeCloseTo(1.83, 2)
  })

  it('le portefeuille de couleurs correspond bien à Tailwind 4.3.3', () => {
    // Tailwind v3 donnait #DC2626 / #B91C1C ; la v4 émet de l'oklch et rend
    // #E7000B / #C10007. Un retour aux valeurs v3 invaliderait tout le calcul.
    expect(COUL['red-600']).not.toBe('#DC2626')
    expect(COUL['red-700']).not.toBe('#B91C1C')
    // red-500 est le rouge le plus clair de l'échelle : il doit rester sous
    // 4.5:1 avec du blanc, sinon le contrôle des survols ne servirait à rien.
    expect(contraste(COUL.white, COUL['red-500'])).toBeLessThan(SEUIL_AA)
    expect(contraste(COUL.white, COUL['red-600'])).toBeGreaterThanOrEqual(SEUIL_AA)
  })

  it('l’analyse voit bien les boutons rouges (garde-fou anti-vide)', () => {
    // Une erreur de parsing ferait échouer ce test en silence : les deux
    // suivants passeraient alors sans rien vérifier. Mesuré à 463 paires et
    // 120 emplacements distincts ; le plan bas laisse de la marge mais
    // détecterait une extraction divisée par deux.
    const paires = pairesContraste()
    expect(paires.length).toBeGreaterThan(400)
    const distincts = new Set(paires.map((p) => `${p.fichier}:${p.ligne}`))
    expect(distincts.size).toBeGreaterThan(100)
  })

  it('aucun bouton rouge n’a un texte sous 4.5:1', () => {
    const coupables = manquants()
    expect(
      coupables.map(
        (p) => `  - ${p.fichier}:${p.ligne}  ${p.etat}  bg-${p.fond} + text-${p.texte} = ${p.r.toFixed(2)}:1`,
      ),
      `Contraste insuffisant (WCAG AA texte normal = ${SEUIL_AA}:1) :\n` +
        coupables
          .map(
            (p) => `  - ${p.fichier}:${p.ligne}  ${p.etat}  bg-${p.fond} + text-${p.texte} = ${p.r.toFixed(2)}:1`,
          )
          .join('\n'),
    ).toEqual([])
  })

  it('aucune occurrence de text-slate-950 / text-slate-900 ne subsiste sur un fond rouge', () => {
    // Garde-fou ciblé sur les deux causes racines : text-slate-950 (2B, 33
    // sites) et text-slate-900 (2B bis, AvancementFacades).
    //
    // Le fond est résolu POUR LE MÊME ÉTAT que le texte. Sans cela on
    // condamnerait le pattern correct d'AvancementFacades : hover:text-slate-900
    // sur hover:bg-gray-300 vaut 12.12:1, alors que le fond de repos (red-600)
    // donnerait un faux 3.74:1.
    const coupables: string[] = []
    for (const { fichier, ligne, classes } of collecter()) {
      if (!porteFondRouge(classes)) continue
      for (const etat of ETATS) {
        const fond = fondEffectif(classes, etat)
        if (!fond || !(FONDS_ROUGE as readonly string[]).includes(fond)) continue
        const texte = texteEffectif(classes, etat)
        if (texte !== 'slate-950' && texte !== 'slate-900') continue
        coupables.push(`${fichier}:${ligne}  ${etat || 'repos'}  bg-${fond} + text-${texte}`)
      }
    }
    expect(
      coupables,
      `text-slate-950 (4.23:1) ou text-slate-900 (3.74:1) sur fond rouge :\n` +
        coupables.map((c) => '  - ' + c).join('\n'),
    ).toEqual([])
  })

  it('les 7 text-slate-950 restants sont sur des fonds non rouges (hors périmètre)', () => {
    // Ces occurrences sont VOLONTAIRES : gris clair, sky, ambre. Ce test
    // verrouille leur nombre pour détecter toute retouche accidentelle.
    const parFichier = new Map<string, number>()
    for (const repertoire of ['app', 'components']) {
      for (const chemin of fichiersTsx(repertoire)) {
        const n = (readFileSync(chemin, 'utf-8').match(/(?<![\w-])text-slate-950(?![\w[])/g) || []).length
        if (n > 0) parFichier.set(chemin, n)
      }
    }
    const total = [...parFichier.values()].reduce((a, b) => a + b, 0)
    expect(total).toBe(7)
    expect([...parFichier.keys()].sort()).toEqual([
      'app/bureau/fin-chantier/page.tsx',
      'components/PlanCalepinage.tsx',
      'components/VisualiseurDebitPlaques.tsx',
      'components/ZoneCard.tsx',
    ])
  })

  it('les 2 voiles hover:bg-red-500 translucides sont intacts', () => {
    // `hover:bg-red-500/10` et `/20` sont des surimpressions sur fond NON
    // rouge : ils n'ont aucun rapport avec le contraste texte/fond et le
    // correctif de 2B bis ne devait pas les toucher. Un motif de recherche
    // naïf les aurait confondus avec les 9 sites corrigés.
    const voiles: string[] = []
    for (const repertoire of ['app', 'components']) {
      for (const chemin of fichiersTsx(repertoire)) {
        const src = readFileSync(chemin, 'utf-8')
        for (const m of src.matchAll(/hover:bg-red-500\/(\d+)/g)) {
          voiles.push(`${chemin}  hover:bg-red-500/${m[1]}`)
        }
      }
    }
    expect(voiles).toEqual([
      'app/bureau/devis-factures/page.tsx  hover:bg-red-500/10',
      'components/TempsHeuresViews.tsx  hover:bg-red-500/20',
    ])
  })

  it('aucun survol de bouton rouge n’éclaircit le fond sous un texte clair', () => {
    // Cause racine des 9 sites de 2B bis : red-500 est plus clair que red-600,
    // donc survoler en red-500 fait tomber le texte blanc à 3.81:1.
    //
    // La formulation est volontairement « fond rouge + texte CLAIR dans le
    // MÊME état » : un fond red-500 sans texte (pastille de légende, barre de
    // progression) ou avec un texte sombre (4.69:1) est parfaitement conforme,
    // et ce dépôt en contient. Ne condamner que ce qui est vraiment fautif.
    const coupables: string[] = []
    for (const { fichier, ligne, classes } of collecter()) {
      if (!porteFondRouge(classes)) continue
      for (const etat of ETATS) {
        if (fondEffectif(classes, etat) !== 'red-500') continue
        const texte = texteEffectif(classes, etat)
        if (!texte || !(TEXTES_CLAIRS as readonly string[]).includes(texte)) continue
        coupables.push(`${fichier}:${ligne}  ${etat || 'repos'}  bg-red-500 + text-${texte}`)
      }
    }
    expect(
      coupables,
      `Fond éclairci sous un texte clair (bg-red-500 + text-white = 3.81:1) :\n` +
        coupables.map((c) => '  - ' + c).join('\n'),
    ).toEqual([])
  })

  it('AvancementFacades : texte conforme au repos ET au survol', () => {
    // Cas particulier : le fond passe de red-600 à gray-300 au survol. Un
    // texte unique ne peut pas convenir aux deux (il faudrait une luminance
    // <= 0.003 sur rouge et >= 3.14 sur gris clair : impossible), d'où le
    // passage en text-white / hover:text-slate-900. Passer seulement le repos
    // en blanc donnerait 1.47:1 au survol — une régression bien pire.
    const src = readFileSync('components/AvancementFacades.tsx', 'utf-8')
    const ligne = src.split('\n').find((l) => l.includes('hover:bg-gray-300'))
    expect(ligne, 'le bouton « Enregistrer l’avancement » est introuvable').toBeDefined()
    expect(ligne).toContain('bg-red-600')
    expect(ligne).toContain('hover:bg-gray-300')
    expect(ligne).toMatch(/(?<![\w-])text-white(?![\w[])/)
    expect(ligne).toMatch(/(?<![\w-])hover:text-slate-900(?![\w[])/)

    // et les deux états sont bien conformes, par le calcul du test
    expect(contraste(COUL.white, COUL['red-600'])).toBeGreaterThanOrEqual(SEUIL_AA)
    expect(contraste(COUL['slate-900'], COUL['gray-300'])).toBeGreaterThanOrEqual(SEUIL_AA)
    // le piège : ce que donnerait la correction naïve
    expect(contraste(COUL.white, COUL['gray-300'])).toBeLessThan(SEUIL_AA)
  })
})
