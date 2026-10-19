// lib/dateParis.ts
//
// Date « métier » au fuseau Europe/Paris.
//
// ─── Le défaut corrigé ────────────────────────────────────────────────────────
//
// `new Date().toISOString().slice(0, 10)` renvoie la date UTC, pas la date
// française. En hiver (UTC+1), à 00:30 heure de Paris, l'horloge UTC indique
// encore la VEILLE à 23:30 : la fenêtre demandée à Visual Crossing commençait
// donc la veille, et la journée d'aujourd'hui n'était pas demandée du tout entre
// minuit et 1 h du matin. En été (UTC+2), la fenêtre reste correcte, ce qui rend
// le défaut intermittent et d'autant plus difficile à voir.
//
// Ce module ne décide d'AUCUN risque météo : il fixe seulement le calendrier
// utilisé pour demander et étiqueter une journée.

const FUSEAU_METEO = "Europe/Paris";

const FORMAT_DATE = new Intl.DateTimeFormat("fr-CA", {
  timeZone: FUSEAU_METEO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Date (`AAAA-MM-JJ`) du calendrier parisien pour l'instant donné. */
export function dateParis(maintenant: Date = new Date()): string {
  return FORMAT_DATE.format(maintenant);
}

/**
 * Date parisienne décalée de `jours` (positif = futur, négatif = passé).
 *
 * On décale l'horodatage avant de le formater à Paris, et non l'inverse : un
 * décalage appliqué à la chaîne « AAAA-MM-JJ » ignorerait les changements
 * d'heure.
 */
export function dateParisDans(
  jours: number,
  maintenant: Date = new Date()
): string {
  return dateParis(
    new Date(maintenant.getTime() + jours * 24 * 60 * 60 * 1000)
  );
}
