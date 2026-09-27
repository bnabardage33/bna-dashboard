import type { ComponentPropsWithoutRef, ElementType } from 'react'
import { cn } from '@/lib/cn'

/**
 * Surface — le conteneur « carte » de l'application.
 *
 * ── Pourquoi ce composant existe (LOT 2D) ──────────────────────────────────
 *
 * Mesure sur le périmètre hors vues d'impression et hors `espace-client` : sur
 * 159 éléments au fond de base `#1A1D24`, 95 portaient le même habillage de
 * carte — un arrondi, une bordure translucide, et ce fond. C'est le seul groupe
 * réellement homogène qu'il fallait extraire : 91 de ces 95 sont des conteneurs
 * neutres, et 27 fichiers les portent. `Surface` définit l'habillage une fois ;
 * le fond passe par le token `--color-surface` du LOT 2A, dont la valeur est
 * identique au littéral.
 *
 * Vérifié sur ces 91 sites avant extraction :
 *  - 90 sont des `<div>`, 1 un `<section>` purement présentiel → d'où la prop
 *    `as`, qui n'a qu'un seul usage réel ;
 *  - aucun ne porte de `ref` ni de `{...rest}` ;
 *  - 7 portent une prop qui n'est pas cosmétique : 6 `key` React (qui ne produit
 *    rien dans le DOM) et 1 `onClick` — le fond de la modale d'un client
 *    (`app/bureau/clients/page.tsx`), dont le gestionnaire traverse le spread et
 *    atterrit sur le même `div` qu'avant. Le comportement est identique ;
 *  - les classes voisines ne sont pas concurrentes mais complémentaires :
 *    `border-dashed` fixe le *style* de bordure, `border-white/10` sa *couleur* ;
 *    `rounded-bl-sm` ne redéfinit que l'angle inférieur gauche ; un
 *    `hover:bg-[#1A1D24]` est un état, pas une valeur de base. Elles se
 *    composent, quel que soit l'ordre.
 *
 * ── Ce qui a été laissé de côté, et pourquoi ───────────────────────────────
 *
 * - 3 cartes-liens (`<Link href>`) et 1 carte-formulaire (`<form onSubmit>`) :
 *    les convertir exigerait un type de props polymorphe. C'est précisément la
 *    machinerie — un `<T extends ElementType>` générique — que ce lot s'interdit
 *    d'introduire sans preuve, et le nombre d'appels (4) ne le justifie pas.
 *    Elles restent en classes littérales ; voir le rapport du LOT 2D.
 * - `components/RapportClient.tsx`, l'onglet interactif du rapport client, a
 *   été un temps écarté parce que son NOM contient « Rapport ». C'était un
 *   faux positif du filtre : la vue imprimable est
 *   `components/rapports/RapportClientPrint.tsx`. Les 13 cartes de l'onglet
 *   font donc partie des 91.
 * - les 64 autres éléments au fond `#1A1D24` : surimpressions d'états vides
 *    (`/50`, `/80`), champs (`border-slate-600`), en-têtes de tableau, pastilles
 *    et pastilles d'avatar. Les encoder demanderait autant d'axes que de
 *    variantes, c'est-à-dire réécrire `class-variance-authority` sans la
 *    dépendance.
 * - les boutons : 107 variantes pour 141 occurrences. Ce n'est pas une
 *   abstraction, c'est une taxonomie — et cela relève du LOT 2E.
 *
 * ── Choix d'implémentation ─────────────────────────────────────────────────
 *
 * `RAYONS` ne fait correspondre que les deux arrondis réellement présents dans
 * le code, vers les MÊMES noms de classes. Aucun palier n'est inventé : une
 * table `sm | md | lg | xl` qui ne reprendrait pas les libellés de Tailwind
 * ferait glisser le rendu vers d'autres rayons sans qu'on le voie.
 *
 * Le composant émet une seule classe de rayon, jamais deux. Il pourrait s'en
 * contenter d'émettre `rounded-xl rounded-2xl` et laisser Tailwind trancher sur
 * l'ordre du CSS, mais faire confiance à cet ordre pour un rayon est fragile.
 *
 * `bg-surface` est le token du LOT 2A (`--color-surface: #1A1D24`, valeur
 * identique au littéral). Ce choix déplace la position de l'utilitaire dans le
 * CSS — `bg-surface` sort après les couleurs de palette, `bg-[#1A1D24]` avant —
 * ce qui ne changerait le rendu que sur un élément portant DEUX classes de fond
 * de base. Vérifié : aucun des 91 sites n'est dans ce cas. En revanche 4 d'entre
 * eux conservent un `hover:bg-[#1A1D24]` : c'est un état, résolu par la règle
 * `&:hover`, donc sans rapport avec cet ordre.
 */

/** Arrondis en usage, 1:1 avec les noms de classes Tailwind. */
const RAYONS = {
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
} as const

export type RayonSurface = keyof typeof RAYONS

interface ProprietesSurface extends ComponentPropsWithoutRef<'div'> {
  /** Balise rendue. Seule utilité mesurée : `<section>` (1 site sur 91). */
  as?: ElementType
  /** Arrondi de la carte. `xl` par défaut, comme le groupe majoritaire. */
  radius?: RayonSurface
}

/** Habillage d'une carte : bordure translucide + fond. */
const HABILLAGE = 'border border-white/10 bg-surface'

export function Surface({ as, radius = 'xl', className, ...props }: ProprietesSurface) {
  const Balise = (as ?? 'div') as ElementType
  return <Balise className={cn(HABILLAGE, RAYONS[radius], className)} {...props} />
}
