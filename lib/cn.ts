/**
 * Composition de classes, sans dépendance.
 *
 * Le dépôt n'installe ni `clsx`, ni `tailwind-merge`, ni `class-variance-authority`
 * (vérifié sur `package.json` au LOT 2D), et le lot n'a pas le droit d'ajouter de
 * dépendance. `cn` couvre donc le strict nécessaire : accolade les arguments,
 * retire les valeurs vides, et produit une chaîne de classes exploitable par
 * `className`.
 *
 * ── Ce que `cn` ne fait PAS, et pourquoi ────────────────────────────────────
 *
 * Il ne résout PAS les conflits entre classes Tailwind, rôle normalement tenu
 * par `tailwind-merge`. Ce serait un piège, pas une simplification : un
 * résolveur naïf « la dernière l'emporte » confond l'état d'un utilitaire avec
 * sa valeur. Sur `cn('bg-red-600', 'hover:bg-red-700')` il effacerait
 * `hover:bg-red-700`, et le survol du bouton d'action disparaîtrait — sans
 * erreur, sans test rouge, seulement un écran faux. Sur
 * `cn('rounded-2xl', 'rounded-bl-sm')` il choisirait l'un des deux rayons, alors
 * qu'ils se composent (le second ne redéfinit que l'angle inférieur gauche).
 *
 * Donc : on ne déduplique rien, on ne réordonne rien. Tailwind tranche lui-même
 * sur l'ordre de sortie du CSS, et l'ordre de la chaîne n'a aucune incidence.
 * Réintroduire ce conflit ici obligerait à réinventer `tailwind-merge` — c'est-à-dire
 * à écrire une bibliothèque dont on ne veut pas assumer la revalidation.
 *
 * La primitive `Surface` (§ components/ui/Surface.tsx) s'appuie sur ce
 * comportement : elle émet une classe par propriété, jamais deux qui se
 * concurrencent.
 */

/** Ce que `cn` accepte : une chaîne, un faux, ou un tableau de ceux-ci. */
export type Classe = string | false | null | undefined | Classe[]

/**
 * Assemble des classes en ignorant les valeurs vides.
 *
 * Un tableau imbriqué est aplati : c'est ce qui rend l'appel lisible quand une
 * liste de classes est construite par tranches.
 *
 * @example
 * cn('rounded-xl', actif && 'bg-surface', [survol && 'shadow-lg'])
 * // 'rounded-xl bg-surface shadow-lg'
 */
export function cn(...entrees: Classe[]): string {
  const sortie: string[] = []

  const ajouter = (valeur: Classe): void => {
    if (!valeur) return
    if (Array.isArray(valeur)) {
      for (const element of valeur) ajouter(element)
      return
    }
    // Un nombre isolé n'est pas une classe : React le rend tel quel dans le
    // DOM. On l'ignore plutôt que de le laisser passer.
    if (typeof valeur === 'number') return
    const texte = valeur.trim()
    if (texte) sortie.push(texte)
  }

  for (const entree of entrees) ajouter(entree)
  return sortie.join(' ')
}
