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

// ─── L'HEURE parisienne ──────────────────────────────────────────────────────
//
// La date seule ne suffit plus : la refonte des décisions météo doit répondre à
// « est-ce que cette heure est encore dans les horaires de pose ? ». Les deux
// sources météo renvoient leurs relevés en heure LOCALE `Europe/Paris`
// (`timezone=Europe/Paris` chez Open-Meteo, fuseau local des relevés Visual
// Crossing) : une heure « 13:00 » de la série veut donc dire 13h00 locales.
// Pour la comparer à l'heure réelle, il faut l'heure réelle EN fuseau Paris,
// et non l'heure du serveur — qui est UTC sur Vercel et parfois ailleurs en
// local. C'est exactement le décalage que `dateParis()` corrigeait déjà pour
// les dates.
const FORMAT_HEURE = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_METEO,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Heure (`HH:MM`) du calendrier parisien pour l'instant donné.
 *
 * `hourCycle: "h23"` évite le « 24:00 » que `fr-FR` produit parfois à minuit :
 * une heure de série météo va de « 00:00 » à « 23:00 », la référence doit
 * parler le même langage.
 */
export function heureParis(maintenant: Date = new Date()): string {
  return FORMAT_HEURE.format(maintenant);
}

/**
 * Heure parisienne convertie en MINUTES depuis minuit (0 → 1439).
 *
 * C'est la forme utilisée pour comparer une heure de série à l'heure réelle :
 * comparer « 09:00 » et « 21:00 » par ordre lexicographique fonctionne, mais
 * comparer une fenêtre de pose qui traverse minuit (« 22:00-02:00 ») ne peut
 * pas se faire sans minutes.
 */
export function heureParisEnMinutes(maintenant: Date = new Date()): number {
  const [heures, minutes] = heureParis(maintenant)
    .split(":")
    .map((v) => Number.parseInt(v, 10));
  if (!Number.isFinite(heures) || !Number.isFinite(minutes)) return -1;
  return heures * 60 + minutes;
}

/** `"07:30"` → `450`. Renvoie `-1` pour une chaîne qui n'est pas une heure. */
export function heureVersMinutes(heure: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(heure.trim());
  if (!m) return -1;
  const h = Number.parseInt(m[1], 10);
  const min = Number.parseInt(m[2], 10);
  if (h > 23 || min > 59) return -1;
  return h * 60 + min;
}

/**
 * Date calendaire parisienne décalée de `jours` (positif = futur, négatif = passé).
 *
 * On extrait d'abord le jour calendaire en `Europe/Paris` puis on décale à
 * 12:00 UTC : ainsi un dimanche de passage à l'heure d'hiver (25 h) ou d'été
 * (23 h) avance toujours d'exactement `jours` journées calendaires sans
 * doublon ni jour sauté (contrairement à `+ jours * 24h` à 00:30 locales).
 */
export function dateParisDans(
  jours: number,
  maintenant: Date = new Date()
): string {
  const [annee, mois, jour] = dateParis(maintenant)
    .split("-")
    .map((v) => Number.parseInt(v, 10));
  return dateParis(new Date(Date.UTC(annee, mois - 1, jour + jours, 12, 0, 0)));
}
