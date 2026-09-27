import type { ComponentPropsWithoutRef, ReactNode } from 'react'

/**
 * FloatingActionButton — le bouton flottant « + » des écrans de saisie.
 *
 * ── Pourquoi ce composant existe (LOT 2E) ──────────────────────────────────
 *
 * Le LOT 2E audite les 294 `<button>` du dépôt hors vues d'impression et hors
 * `espace-client`. Conclusion : aucune primitive `Button` générique n'est
 * justifiée. Les 238 `className` écrits en dur se répartissent en 176 variantes
 * exactes, soit 1,35 occurrence par variante, dont 151 variantes à usage unique.
 * La plus grosse famille par fonction — le bouton d'action rouge — compte
 * 44 occurrences pour 23 variantes, et ces 23 diffèrent sur 14 axes
 * indépendants (padding, ombre, ombre teintée, gap, transition, opacité et
 * curseur de désactivation, survol, corps, graisse, disposition, largeur,
 * rayon, présence d'icône). Une prop `variant` devrait porter ces 14 axes :
 * ce ne serait plus une taxonomie, ce serait la liste de classes recopiée.
 *
 * Une seule famille franchit le seuil, et de loin : 7 occurrences du bouton
 * flottant, dans 7 fichiers, avec un `className` rigoureusement identique au
 * caractère près. C'est du copier-coller, avec le risque de derive que cela
 * comporte sur une classe de 204 caractères et 18 jetons. D'où ce composant,
 * qui n'existe que pour cela.
 *
 * La deuxième famille presque homogène — les 11 boutons de fermeture de modale,
 * `rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white`, 66
 * caractères et 5 jetons — n'est PAS extraite. Ses 11 gestionnaires `onClick`
 * sont tous différents, et surtout aucun des 11 ne porte de `aria-label` : ces
 * boutons n'ont pas de nom accessible. Les factoriser aujourd'hui reviendrait
 * à immuabiliser ce défaut ; il est reporté.
 *
 * ── Choix d'implémentation ─────────────────────────────────────────────────
 *
 * Pas de prop `className`. Aucun des 7 sites n'a besoin d'une surcharge, et
 * `cn()` ne résout pas les conflits Tailwind : accepter une surcharge rouvrirait
 * la possibilité d'écrire un `hover:bg-red-700` concurrent du `hover:bg-red-700`
 * de l'habillage, dont le gagnant serait décidé par l'ordre d'émission du CSS et
 * non par l'intention. Refuser la prop rend la dérive impossible par
 * construction. C'est une contrainte assumée, pas un oubli.
 *
 * `aria-label` est exigée par le type. Les 7 sites la fournissent déjà ; la
 * rendre obligatoire garantit par le compilateur qu'un huitième bouton flottant
 * ne pourra pas être ajouté sans nom accessible. Aucun changement de rendu :
 * l'attribut existait sur les 7.
 *
 * Pas de `type="button"` ajouté. Aucun des 7 n'est dans un `<form>` (vérifié),
 * donc la valeur par défaut `submit` est inoffensive ici. L'ajouter serait un
 * changement de comportement non demandé.
 *
 * `bg-red-600` n'est PAS remplacé par le token `bg-brand`. Mesuré sur le CSS
 * réellement émis par Tailwind 4.3.3 : `bg-red-600` vaut `#E7000B`, tandis que
 * `--color-brand` vaut `#E30613`. Les substituer changerait le rendu de 4 unités
 * sur le rouge, 6 sur le vert et 8 sur le bleu. C'est l'arbitrage produit D2-a/b,
 * non tranché, donc hors périmètre.
 */
const HABILLAGE =
  'fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-2xl shadow-red-600/10 transition-transform active:scale-95 hover:scale-105 hover:bg-red-700'

export type ProprietesFloatingActionButton = Omit<
  ComponentPropsWithoutRef<'button'>,
  'className' | 'aria-label'
> & {
  /** Nom accessible du bouton. Les 7 sites en fournissent un, tous distincts. */
  'aria-label': string
  /** Glyphe. Un `+` en texte sur 5 sites, une icône lucide sur 2. */
  children: ReactNode
}

export function FloatingActionButton({
  'aria-label': ariaLabel,
  children,
  ...props
}: ProprietesFloatingActionButton) {
  return (
    <button aria-label={ariaLabel} className={HABILLAGE} {...props}>
      {children}
    </button>
  )
}
