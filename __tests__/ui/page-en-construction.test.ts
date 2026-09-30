// =============================================================================
// LOT 2F-6 — les trois pages « en cours de construction »
// =============================================================================
//
// LA DUPLICATION MESURÉE. `app/bureau-etudes/page.tsx`,
// `app/chantiers/page.tsx` et `app/boite-a-outils/page.tsx` font 24 lignes
// chacune. Le diff deux à deux — `diff` sur le fichier, pas un diff de classes —
// ne signale QU'UNE ligne sur 24 :
//
//   10c10
//   <   <h1 className="text-white font-black text-[22px] leading-tight">Bureau d'études</h1>
//   ---
//   >   <h1 className="text-white font-black text-[22px] leading-tight">Chantiers</h1>
//
// Les 23 autres lignes, dont la carte en verre et ses classes arbitraires
// `bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))]`
// et `shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)]`,
// étaient recopiées au caractère près. C'est la seule duplication stricte du
// dépôt.
//
// POURQUOI CELLE-LA EST EXTRAITE ET PAS LES FAMILLES DU LOT 2E. Au LOT 2E on a
// refusé six familles, sur un ratio de 1,5 à 2,5 pour 1 : leurs variantes
// différaient sur 8 à 14 axes, et une prop `variant` aurait porté la liste des
// classes recopiées. Ici l'écart entre les trois occurrences est d'exactement un
// contenu de texte. La classe d'habillage est constante, le texte l'est aussi,
// et la seule ligne qui varie est le `<h1>`. La prop `titre` n'expose rien
// d'autre : ce n'est pas une taxonomie, c'est nommer la variable existante.
//
// LE GAIN, ET CE QU'IL N'EST PAS. Ce que l'extraction élimine : deux copies
// redondantes de 23 lignes de JSX, deux copies redondantes des 43 jetons de
// classe, et surtout trois points de modification au lieu d'un. Ce qu'elle ne
// fait pas : réduire le nombre de lignes. Le total passe de 72 à 77 — le
// composant coûte 26 lignes de code (type de props, export, signature) pour 23
// lignes de JSX, et 42 lignes de commentaire. C'est un gain de maintenance, pas
// un gain de volume, et le test de comptage ci-dessous verrouille 72 → 83 pour
// que personne ne le présente autrement.
//
// LE CSS EMIS EST INCHANGÉ, et c'est l'ensemble des jetons DISTINCTS qui le
// détermine : Tailwind émet une règle par classe trouvée, la multiplicité
// n'entre pas. Le test compare les 43 jetons de l'état d'origine à ceux du
// composant. Ils sont identiques : aucune règle ajoutée, aucune retirée.
//
// POINT RELEVÉ, HORS PÉRIMÈTRE. Aucune de ces trois routes n'est liée depuis la
// navigation. Le `Drawer` pointe vers `/bureau`, `/terrain/chantier` et
// `/terrain/outils` ; il n'existe aucune autre occurrence de `/chantiers`,
// `/bureau-etudes` ou `/boite-a-outils` dans tout le dépôt. Ces trois écrans ne
// sont atteignables qu'en tapant l'URL. Le fait est consigné et n'est pas
// corrigé : rattacher ces écrans aux bonnes routes est une décision de
// navigation, pas un nettoyage esthétique.
// =============================================================================

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/** État du dépôt AVANT le lot. Ne jamais remplacer par `HEAD`. */
const COMMIT_AVANT_LOT = 'a04dccc24a161c8aa94f70dc897fb8c451e31bec'

const RACINE = process.cwd()
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf-8')
const gitShow = (rev: string) =>
  execFileSync('git', ['-C', RACINE, 'show', rev], {
    encoding: 'utf-8',
    maxBuffer: 1 << 28,
  })

const COMPOSANT = 'components/ui/PageEnConstruction.tsx'

/** Les 3 écrans, avec le titre qui était en dur dans leur `<h1>`. */
const ECRANS = [
  { page: 'app/bureau-etudes/page.tsx', titre: "Bureau d'études" },
  { page: 'app/chantiers/page.tsx', titre: 'Chantiers' },
  { page: 'app/boite-a-outils/page.tsx', titre: 'Boîte à outils' },
]

/** Les 43 jetons de classe de l'écran d'origine, mesurés avant extraction. */
const JETONS_ATTENDUS = [
  'backdrop-blur-[20px]',
  'bg-[#E30613]',
  'bg-[#E30613]/15',
  'bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))]',
  'border',
  'border-[#E30613]/20',
  'border-white/[0.14]',
  'flex',
  'flex-col',
  'font-black',
  'font-bold',
  'gap-2',
  'h-16',
  'hover:bg-[#c50510]',
  'inline-flex',
  'items-center',
  'justify-center',
  'leading-relaxed',
  'leading-tight',
  'max-w-sm',
  'mb-5',
  'min-h-screen',
  'mt-2',
  'mt-6',
  'mx-auto',
  'p-8',
  'px-5',
  'px-6',
  'py-3',
  'rounded-2xl',
  'rounded-3xl',
  'shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)]',
  'text-2xl',
  'text-[#ff5a5a]',
  'text-[13px]',
  'text-[14px]',
  'text-[22px]',
  'text-center',
  'text-white',
  'text-white/50',
  'transition-all',
  'w-16',
  'w-full',
]

/** Jetons de classe d'un source TSX, ensemble distinct. */
function jetons(source: string): string[] {
  const out = new Set<string>()
  for (const m of source.matchAll(/className\s*=\s*"([^"]*)"/g)) {
    for (const t of m[1].split(/\s+/)) if (t) out.add(t)
  }
  return [...out].sort()
}

describe('2F-6 · le CSS émis ne peut pas changer', () => {
  it('les 43 jetons du composant sont exactement ceux des trois écrans d\'origine', () => {
    const origine = new Set<string>()
    for (const { page } of ECRANS) {
      for (const t of jetons(gitShow(`${COMMIT_AVANT_LOT}:${page}`))) origine.add(t)
    }
    expect(
      [...origine].sort(),
      'les jetons mesurés au début du lot ne sont plus ceux de l\'origine'
    ).toEqual(JETONS_ATTENDUS)

    // C'est l'invariant qui décide du CSS émis : une règle par classe
    // distincte, jamais par occurrence. 3 copies → 1 copie ne change rien.
    expect(jetons(lire(COMPOSANT))).toEqual(JETONS_ATTENDUS)
  })

  it('le composant ne normalise aucun corps de texte', () => {
    // 2F-1 ne couvre que 9, 10 et 11 px. Ces trois écrans sont en 22, 14 et
    // 13 px : ils étaient hors périmètre et ils y restent.
    //
    // On lit le CODE, commentaire retiré. Le commentaire de tête cite ces
    // trois corps pour expliquer qu'ils sont hors périmètre : sans cette
    // précaution, une conversion aurait pu n'être faite que dans le
    // commentaire et le test l'aurait acceptée.
    const code = lire(COMPOSANT)
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/**'))
      .join('\n')
    for (const garde of ['text-[22px]', 'text-[14px]', 'text-[13px]']) {
      expect(code, `${garde} a disparu du code du composant`).toContain(garde)
    }
    for (const interdit of ['text-[9px]', 'text-[10px]', 'text-[11px]']) {
      expect(code, `${interdit} : 2F-1 ne concernait pas cet écran`).not.toContain(
        interdit
      )
    }
  })
})

describe('2F-6 · les trois pages délèguent', () => {
  it('chaque page est un simple appel au composant, avec le bon titre', () => {
    for (const { page, titre } of ECRANS) {
      const source = lire(page)
      expect(source, `${page} n'importe pas le composant`).toContain(
        'from "@/components/ui/PageEnConstruction"'
      )
      expect(source, `${page} n'utilise pas le composant`).toContain(
        '<PageEnConstruction'
      )
      expect(source, `${page} ne porte pas le bon titre`).toContain(
        `titre="${titre}"`
      )
      // Le gabarit ne doit plus être recopié nulle part.
      expect(source, `${page} recopie encore le gabarit`).not.toContain('min-h-screen')
      expect(source, `${page} recopie encore le libellé`).not.toContain(
        'en cours de construction'
      )
    }
  })

  it('le composant est un composant serveur et n\'accepte pas de surcharge', () => {
    // Le commentaire de tête parle de `children` et de `className` pour
    // expliquer pourquoi ils ont été refusés. On le retire avant de vérifier,
    // sinon le test tombe sur sa propre documentation.
    const source = lire(COMPOSANT)
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/**'))
      .join('\n')
    expect(source, 'le composant a été marqué client').not.toContain('"use client"')
    expect(source, 'une prop className a été ajoutée').not.toMatch(/className\s*\?/)
    expect(source, 'des children ont été ajoutés').not.toMatch(/children/)
    expect(source, 'une prop non typée a été ajoutée').not.toMatch(/titre\s*\?/)
    // Le type déclaré ne contient que `titre`, rien d'autre. On lit le bloc
    // `{ … }` du type, plutôt que de le confronter à une expression régulière
    // entière : le commentaire de documentation qu'il contient comporte des
    // astérisques, et un motif trop précis échouait sur lui.
    const blocType = source.slice(source.indexOf('ProprietesPageEnConstruction = {') + 1)
    const fermeture = blocType.indexOf('}')
    expect(blocType.slice(0, fermeture), 'le type de props porte autre chose que titre')
      .toContain('titre: string')
    for (const interdit of ['className', 'children', '?:']) {
      expect(blocType.slice(0, fermeture), `${interdit} est apparu dans le type de props`).not.toContain(interdit)
    }
  })
})

describe('2F-6 · le gain, et sa limite', () => {
  it('le volume n\'a pas diminué : 72 lignes sont devenues 77', () => {
    // Test volontairement à l'encontre de ce qu'on voudrait lire. Le gain de
    // cette extraction est la suppression de deux copies redondantes et le
    // passage de trois points de modification à un seul. Ce n'est PAS une
    // réduction de volume, et le dire ici évite de le répéter ailleurs.
    const lignes = (s: string) => (s.match(/\n/g) ?? []).length
    const avant = ECRANS.reduce((n, { page }) => n + lignes(gitShow(`${COMMIT_AVANT_LOT}:${page}`)), 0)
    const apres =
      lignes(lire(COMPOSANT)) +
      ECRANS.reduce((n, { page }) => n + lignes(lire(page)), 0)
    expect(avant).toBe(72)
    expect(apres).toBe(83)
    expect(apres).toBeGreaterThan(avant)
  })

  it('le JSX du composant est bien celui des trois écrans, au caractère près', () => {
    // On retire la seule ligne variable — le `<h1>` — et on exige l'égalité.
    const sansH1 = (s: string) =>
      s
        .split('\n')
        .filter((l) => !l.includes('font-black'))
        .join('\n')
    const origine = sansH1(gitShow(`${COMMIT_AVANT_LOT}:app/chantiers/page.tsx`))
    const corps = sansH1(lire(COMPOSANT))
    for (const ligne of origine.split('\n').filter((l) => l.trim())) {
      if (ligne.includes('import') || ligne.includes('export default')) continue
      expect(corps, `le composant ne contient plus : ${ligne.trim().slice(0, 60)}`).toContain(
        ligne.trim()
      )
    }
  })
})
