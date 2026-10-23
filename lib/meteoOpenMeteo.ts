// lib/meteoOpenMeteo.ts
//
// SOURCE MÉTÉO DE SECOURS DE L'ACCUEIL.
//
// VisualCrossing reste la source PRIMAIRE et n'est pas abandonnée : voir
// « Pourquoi ce fichier existe » pour la répartition local / Vercel.
//
// ─── Pourquoi ce fichier existe ───────────────────────────────────────────────
//
// `GET /api/meteo` (donc `lib/meteo.ts` → `fetchMeteo`, donc le composant
// métier `components/ChantiersMeteoCards.tsx`) n'a jamais su interroger qu'UNE
// seule source : VisualCrossing, qui exige une clé payante.
//
// ─── VISUALCROSSING EST VALIDE EN PRODUCTION. ELLE N'EST PAS MORTE. ─────────
//
// La clé `VISUALCROSSING_API_KEY` est configurée dans les variables
// d'environnement Vercel et n'est volontairement pas versionnée. Sur Vercel,
// VisualCrossing répond, elle est la source primaire, et ce repli n'est jamais
// atteint.
//
// Ce qui a été constaté, et ce que cela prouve EXACTEMENT :
//
//   $ curl "https://weather.visualcrossing.com/…&key=$VISUALCROSSING_API_KEY"
//   HTTP 401
//   No account found with provided API key
//
// exécuté EN LOCAL. `.env.local` porte `VISUALCROSSING_API_KEY=ta_cle_ici` —
// le placeholder de `.env.example`, recopié comme il l'est pour
// `METEOFRANCE_APPLICATION_ID`. Le 401 établit donc une seule chose : la clé
// réelle n'est pas présente sur ce poste. Il ne dit rien de la production.
//
// Conséquence, avant ce fichier : en local, la route transformait le 401 en
// `502`, `fetchMeteo` levait, et le `catch` SILENCIEUX du composant renvoyait
// `niveau: "inconnu"`. Le bloc météo de l'accueil n'était donc testable
// qu'en production, où la clé existe — et affichait « Météo indisponible pour
// cette adresse. / Zone 1 » sur tout poste de développement.
//
// ─── Ce que le repli apporte, précisément ─────────────────────────────────────
//
// 1. Il rend le bloc meteo de l'accueil DEVELOPPABLE ET TESTABLE EN LOCAL, sans
//    compte VisualCrossing payant. C'est le besoin immediat.
//
//  2. Il degrade proprement en production si VisualCrossing tombe (panne,
//    quota epuise, cle expiree) : l'accueil garde une meteo reelle au lieu
//    d'afficher un etat vide.
//
// Il ne remplace PAS VisualCrossing, qui reste tentee EN PREMIER et prime
// des qu'elle repond. La reponse indique laquelle des deux a servi (`source`),
// pour que l'ecart de donnees entre les deux environnements soit visible au
// lieu d'etre suppose.
//
// ─── La source de secours existe deja dans le projet ─────────────────────────
//
// **Open-Meteo** n'est pas un service nouveau : il alimente deja
// `app/api/meteo/intemperies/route.ts` (ecran `/bureau/meteo`) et l'Edge
// Function `generer-rapports-intemperies`. C'est cette source, deja en service,
// que l'accueil n'interrogeait pas. Verifiee joignable depuis ce poste :
//
//   $ curl "https://api.open-meteo.com/v1/forecast?latitude=44.84&longitude=-0.58…"
//   HTTP 200
//
// Ce fichier la rend accessible a l'ACCUEIL, en produisant EXACTEMENT la meme
// structure que VisualCrossing, afin que la route `/api/meteo` — qui porte les
// seuils, le calcul matin/apres-midi et l'alerte — reste le SEUL endroit ou
// l'on decide d'un risque. Ce fichier ne decide rien : il traduit une reponse
// Open-Meteo dans le dialecte attendu en aval.
//
// ─── Ce que ce fichier n'est PAS ─────────────────────────────────────────────
//
// Ce n'est pas une troisieme logique meteo. Les seuils, la ponderation
// materiau × acces, la decision d'arret et les traces d'intemperie restent,
// inchanges, dans `lib/meteoAlerte.ts` et `app/api/meteo/intemperies/route.ts`.
// La SEULE chose ajoutee ici est une table de traduction WMO → libelle francais
// et → pictogramme, parce qu'Open-Meteo parle WMO alors que l'affichage
// attendait le vocabulaire de VisualCrossing (`conditions`, `icon`).
//
// Le geocodage n'est PAS reecrit : `geocoderAdresse` vient de
// `lib/deplacement/geocodage.ts`, le meme que celui utilise par les frais de
// deplacement — y compris son comportement fail-closed sur le code postal.

import { geocoderAdresse } from "@/lib/deplacement/geocodage";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

// C5 : borne dure de l'appel Open-Meteo.
const TIMEOUT_METEO_MS = 8_000;

// ─── Structure commune aux deux sources ──────────────────────────────────────
//
// Ces trois interfaces vivaient dans `app/api/meteo/route.ts`. Elles sont
// déplacées ici, et non dupliquées, parce que les deux sources doivent produire
// EXACTEMENT la même chose pour que la route n'ait qu'un seul chemin de calcul
// de l'alerte. La route les importe.

export interface RawHeure {
  datetime: string;
  /**
   * Chaque grandeur est `null` quand la source n'a rien renvoyé pour cette
   * heure. Règle d'or de la refonte : une valeur absente n'est JAMAIS convertie
   * en 0, qui se lirait « 0 mm · 0 km/h » et serait interprété en aval comme
   * une garantie de temps sec.
   */
  temp: number | null;
  windspeed: number | null;
  windgust: number | null;
  precip: number | null;
}

export interface RawJour {
  datetime: string;
  tempmax: number;
  tempmin: number;
  temp: number;
  windspeed: number;
  windgust: number;
  precip: number;
  icon: string;
  conditions: string;
  hours?: RawHeure[];
}

export interface DonneesMeteo {
  days: RawJour[];
  currentConditions?: {
    temp: number;
    icon: string;
    /**
     * Horodatage local du relevé courant, quand la source le fournit.
     *
     * C'est la SEULE marque de fiabilité disponible pour distinguer une heure
     * observée d'une heure prévue. Absente → la nature de toutes les heures
     * reste `inconnue`, ce qui est préférable à une affirmation hasardeuse.
     */
    time?: string;
  };
  /**
   * Variante portée par le FETCHER Open-Meteo (`current.time`), reprise par la
   * route comme `referenceSource` de la réponse.
   */
  referenceSource?: string;
}

// ─── Table WMO → français ────────────────────────────────────────────────────
//
// Codes WMO normalisés (Open-Meteo, `weather_code`). Cette table est une
// donnée de PRÉSENTATION : elle ne décide d'aucun risque. Elle existe parce
// qu'Open-Meteo renvoie un entier, alors que la chaîne d'affichage attend un
// libellé en français — sans elle, la carte afficherait « Conditions normales »
// et rien d'autre, c'est-à-dire exactement le défaut que l'on cherche à
// corriger.
const LIBELLES_WMO: Record<number, string> = {
  0: "Ensoleillé",
  1: "Principalement dégagé",
  2: "Partiellement nuageux",
  3: "Couvert",
  45: "Brouillard",
  48: "Brouillard givrant",
  51: "Bruine légère",
  53: "Bruine modérée",
  55: "Bruine forte",
  56: "Bruine verglaçante légère",
  57: "Bruine verglaçante forte",
  61: "Pluie légère",
  63: "Pluie modérée",
  65: "Pluie forte",
  66: "Pluie verglaçante légère",
  67: "Pluie verglaçante forte",
  71: "Neige légère",
  73: "Neige modérée",
  75: "Neige forte",
  77: "Grains de neige",
  80: "Averses de pluie légères",
  81: "Averses de pluie modérées",
  82: "Averses de pluie violentes",
  85: "Averses de neige légères",
  86: "Averses de neige fortes",
  95: "Orage",
  96: "Orage avec grêle légère",
  99: "Orage avec grêle forte",
};

/** Libellé français d'un code WMO. Jamais `undefined` : un code inconnu vaut
 *  « Nuageux », ce qui reste vrai pour tout code non répertorié (0-99). */
export function libelleConditionsWmo(code: number | null | undefined): string {
  if (typeof code !== "number" || Number.isNaN(code)) return "Nuageux";
  return LIBELLES_WMO[code] ?? "Nuageux";
}

const EMOJIS_WMO: Record<number, string> = {
  0: "☀️",
  1: "🌤️",
  2: "⛅",
  3: "☁️",
  45: "🌫️",
  48: "🌫️",
  51: "🌦️",
  53: "🌦️",
  55: "🌧️",
  56: "🌧️",
  57: "🌧️",
  61: "🌦️",
  63: "🌧️",
  65: "🌧️",
  66: "🌧️",
  67: "🌧️",
  71: "🌨️",
  73: "🌨️",
  75: "❄️",
  77: "🌨️",
  80: "🌦️",
  81: "🌧️",
  82: "⛈️",
  85: "🌨️",
  86: "❄️",
  95: "⛈️",
  96: "⛈️",
  99: "⛈️",
};

/** Pictogramme d'un code WMO. Repli ☁️ pour un code non répertorié. */
export function emojiWmo(code: number | null | undefined): string {
  if (typeof code !== "number" || Number.isNaN(code)) return "☁️";
  return EMOJIS_WMO[code] ?? "☁️";
}

// ─── Réponse Open-Meteo ──────────────────────────────────────────────────────

type ReponseHoraire = {
  time?: unknown;
  temperature_2m?: unknown;
  precipitation?: unknown;
  wind_speed_10m?: unknown;
  wind_gusts_10m?: unknown;
};

type ReponseCourante = {
  temperature_2m?: unknown;
  weather_code?: unknown;
  /** Horodatage local du relevé courant (ex. `2026-10-20T13:30`). */
  time?: unknown;
};

/**
 * Agrégats journaliers.
 *
 * Indispensables, et non un luxe : sans eux, les jours J+1 à J+3 n'auraient
 * aucune donnée propre. Reconstituer un `tempmax` de demain à partir des
 * relevés horaires d'AUJOURD'HUI afficherait « 21 °C maxi demain » — un chiffre
 * fake répété trois fois. Le cahier des charges interdit d'inventer une donnée,
 * donc on la demande au fournisseur au lieu de la fabriquer.
 */
type ReponseJournaliere = {
  time?: unknown;
  temperature_2m_max?: unknown;
  temperature_2m_min?: unknown;
  weather_code?: unknown;
  precipitation_sum?: unknown;
  wind_speed_10m_max?: unknown;
  wind_gusts_10m_max?: unknown;
};

type ReponseOpenMeteo = {
  hourly?: ReponseHoraire;
  current?: ReponseCourante;
  daily?: ReponseJournaliere;
  error?: boolean;
  reason?: string;
};

/** Lit un tableau numérique Open-Meteo à l'indice `i`, sans jamais lever. */
function valeur(a: unknown, i: number): number {
  if (!Array.isArray(a)) return 0;
  const v = a[i];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Variante `null`-sûre de `valeur()`, pour les GRANDEURS HORAIRES.
 *
 * La différence est le cœur du correctif : `valeur()` renvoie 0 quand la
 * source n'a rien envoyé, ce qui se lit ensuite « 0 mm » sur l'écran. Pour
 * une grandeur horaire, l'absence doit rester une absence (`null`), que
 * l'aval affiche en tiret et n'additionne jamais.
 */
function valeurOuNull(a: unknown, i: number): number | null {
  if (!Array.isArray(a)) return null;
  const v = a[i];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Lit un champ SCALAIRE (`current.temperature_2m`, `current.weather_code`).
 *
 * Distinct de `valeur()` : ces champs ne sont PAS des tableaux, et le sont
 * encore moins des indexables. Passer un scalaire à `valeur()` renvoyait 0 — ce
 * qui affichait 0 °C et, pire, un code WMO 0 c'est-à-dire « Ensoleillé » sur
 * une météo couvert. Deux accesseurs séparés, parce que deux formes de données.
 */
function nombre(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function texte(a: unknown, i: number): string {
  if (!Array.isArray(a)) return "";
  const v = a[i];
  return typeof v === "string" ? v : "";
}

/** Lit un champ TEXTUEL scalaire (`current.time`), sans jamais lever. */
function texteScalaire(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** `2026-10-01T07:00` → `"07:00"`. */
function heureDuJour(iso: string): string {
  const t = iso.slice(11, 16);
  return t.length === 5 ? t : "";
}

/** `2026-10-01T07:00` → `"2026-10-01"`. */
function jourDe(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Prévision Open-Meteo pour une adresse, traduite dans le format attendu par
 * `app/api/meteo/route.ts`.
 *
 * Renvoie `null` — et non un objet à zéros — quand la donnée n'a pas pu être
 * obtenue. C'est la distinction qui permet à l'appelant d'afficher un état vide
 * « Aucune donnée disponible » au lieu de 0 km/h et 0 mm, c'est-à-dire de la
 * météo inventée.
 *
 * `revalidate: 1800` : même demi-heure que la route `/api/meteo/intemperies`,
 * qui interroge la même source. Les deux écrans ne peuvent donc pas diverger.
 */
export async function fetchDonneesOpenMeteo(
  adresse: string,
  coordonnees?: { lat: number; lon: number },
): Promise<DonneesMeteo | null> {
  const q = adresse.trim();
  if (!q && !coordonnees) return null;

  let lat: number;
  let lon: number;

  if (coordonnees) {
    // Coordonnées déjà validées (code postal) par l'appelant : on les
    // réutilise telles quelles. C'est ce qui garantit que Visual Crossing et
    // Open-Meteo travaillent sur le même point.
    ({ lat, lon } = coordonnees);
  } else {
    // Même géocodeur que les frais de déplacement : fail-closed sur le code
    // postal, et surtout un SEUL appelant Nominatim pour toute l'application.
    const geocode = await geocoderAdresse(q);
    if (!geocode.ok) {
      console.error(
        "meteoOpenMeteo : géocodage impossible pour « %s » — %s",
        q,
        geocode.erreur,
      );
      return null;
    }
    ({ lat, lon } = geocode.data);
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: [
      "temperature_2m",
      "precipitation",
      "wind_speed_10m",
      "wind_gusts_10m",
    ].join(","),
    current: "temperature_2m,weather_code",
    // Les agrégats de J+1 à J+3 : c'est eux qui portent le `tempmax`/`tempmin`
    // des `prochainsJours`. Sans cette ligne, l'écran afficherait le maxi
    // d'aujourd'hui a la place de celui de demain.
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "weather_code",
      "precipitation_sum",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
    ].join(","),
    timezone: "Europe/Paris",
    // 4 jours : la même profondeur que la fenêtre J→J+3 de la veille
    // intempéries, et que les `prochainsJours` de l'ancien appel VisualCrossing.
    forecast_days: "4",
  });

  let data: ReponseOpenMeteo;
  try {
    const res = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      { next: { revalidate: 1800 } },
      TIMEOUT_METEO_MS,
    );
    if (!res.ok) {
      console.error("meteoOpenMeteo : Open-Meteo a répondu %s", res.status);
      return null;
    }
    data = (await res.json()) as ReponseOpenMeteo;
  } catch (e) {
    console.error("meteoOpenMeteo : appel Open-Meteo impossible", e);
    return null;
  }

  if (data.error) {
    console.error("meteoOpenMeteo : Open-Meteo a refusé — %s", data.reason);
    return null;
  }

  const hourly = data.hourly;
  const temps = hourly?.time;
  if (!Array.isArray(temps) || temps.length === 0) return null;

  // On ne garde que les relevés du JOUR LOCAL du chantier. La route découpe
  // ensuite ce jour en matin / après-midi avec ses propres fenêtres ; lui
  // fournir une journée entière évite que ses index ne se décalent.
  const aujourdhui = jourDe(texte(temps, 0));
  if (!aujourdhui) return null;

  const heures: RawHeure[] = [];
  for (let i = 0; i < temps.length; i += 1) {
    const iso = texte(temps, i);
    if (jourDe(iso) !== aujourdhui) continue;
    const heure = heureDuJour(iso);
    if (!heure) continue;
    // `wind_gusts_10m` est la rafale ; quand elle manque, la vitesse moyenne de
    // la même heure est le majorant DISPONIBLE (et non une valeur inventée :
    // c'est une mesure réelle de cette heure-là). Quand les deux manquent, les
    // deux champs restent `null` — jamais 0, qui se lirait « 0 km/h ».
    const vent = valeurOuNull(hourly?.wind_speed_10m, i);
    const rafales = valeurOuNull(hourly?.wind_gusts_10m, i) ?? vent;
    heures.push({
      datetime: heure,
      temp: valeurOuNull(hourly?.temperature_2m, i),
      windspeed: vent,
      windgust: rafales,
      precip: valeurOuNull(hourly?.precipitation, i),
    });
  }

  if (heures.length === 0) return null;

  const daily = data.daily;
  const tempsJournaliers = daily?.time;
  const indexDuJour = (jourIso: string): number =>
    Array.isArray(tempsJournaliers) ? tempsJournaliers.indexOf(jourIso) : -1;

  // Les 24 relevés du jour sont la base : la route découpe cette journée en
  // matin / après-midi. Ces agrégats de repli ne sont calculés qu'à partir des
  // heures CONNUES : une heure sans donnée ne participe pas au calcul, et une
  // période entièrement vide produit `null` plutôt qu'un 0 trompeur.
  const connus = <T extends number>(lire: (h: RawHeure) => T | null): T[] =>
    heures.map(lire).filter((v): v is T => typeof v === "number" && Number.isFinite(v));

  const ventsConnus = connus((h) => h.windspeed);
  const rafalesConnues = connus((h) => h.windgust);
  const precipConnus = connus((h) => h.precip);
  const tempsConnus = connus((h) => h.temp);

  const ventMoyen = ventsConnus.length
    ? ventsConnus.reduce((s, v) => s + v, 0) / ventsConnus.length
    : 0;
  const rafalesMax = rafalesConnues.length ? Math.max(...rafalesConnues) : 0;
  const precipCumul = precipConnus.reduce((s, v) => s + v, 0);
  const tempMaxHoraire = tempsConnus.length ? Math.max(...tempsConnus) : 0;
  const tempMinHoraire = tempsConnus.length ? Math.min(...tempsConnus) : 0;

  // Min et max du jour : l'agrégat `daily` fait foi quand il est présent, car
  // il couvre toute la journée y compris les heures déjà écoulées que
  // `hourly` peut ne pas contenir. On ne fait qu'un repli sur les relevés.
  const iAujourdhui = indexDuJour(aujourdhui);
  const tempMax =
    iAujourdhui >= 0 ? valeur(daily?.temperature_2m_max, iAujourdhui) : tempMaxHoraire;
  const tempMin =
    iAujourdhui >= 0 ? valeur(daily?.temperature_2m_min, iAujourdhui) : tempMinHoraire;

  const jour: RawJour = {
    datetime: aujourdhui,
    tempmax: tempMax,
    tempmin: tempMin,
    temp: nombre(data.current?.temperature_2m) || tempMax,
    windspeed: ventMoyen,
    windgust: rafalesMax,
    precip: precipCumul,
    // `icon` porte ici le CODE WMO sous forme de texte : c'est le seul canal
    // libre dans `DonneesMeteo`, et `libelleConditionsWmo` / `emojiWmo` le
    // relisent. `conditions` porte déjà le libellé français, donc l'affichage
    // n'a pas besoin de traduire.
    icon: String(nombre(data.current?.weather_code)),
    conditions: libelleConditionsWmo(nombre(data.current?.weather_code)),
    hours: heures,
  };

  // J+1 à J+3 : on lit les agrégats `daily` DU JOUR CONCERNÉ, jamais ceux
  // d'aujourd'hui. Le premier relevé de chaque date dans `hourly` sert
  // uniquement à connaître les dates disponibles.
  const datesSuivantes: string[] = [];
  const dejaVu = new Set<string>([aujourdhui]);
  for (let i = 0; i < temps.length && datesSuivantes.length < 3; i += 1) {
    const jourIso = jourDe(texte(temps, i));
    if (!jourIso || dejaVu.has(jourIso)) continue;
    dejaVu.add(jourIso);
    datesSuivantes.push(jourIso);
  }

  const joursSuivants: RawJour[] = [];
  for (const jourIso of datesSuivantes) {
    const i = indexDuJour(jourIso);
    // Pas d'agrégat pour cette date : on NE FABRIQUE PAS de `tempmax` en
    // recyclant celui d'aujourd'hui. La journée est omise, et l'appelant
    // n'affichera que le jour du jour.
    if (i < 0) continue;
    const code = valeur(daily?.weather_code, i);
    joursSuivants.push({
      datetime: jourIso,
      tempmax: valeur(daily?.temperature_2m_max, i),
      tempmin: valeur(daily?.temperature_2m_min, i),
      // `temp` n'est consulté que pour le jour courant (`today.temp`, et
      // `currentConditions`). Un `NaN` y serait indétectable en aval, on y met
      // donc le minimum journalier, qui est une valeur réellement prévue.
      temp: valeur(daily?.temperature_2m_min, i),
      windspeed: valeur(daily?.wind_speed_10m_max, i),
      windgust: valeur(daily?.wind_gusts_10m_max, i),
      precip: valeur(daily?.precipitation_sum, i),
      icon: String(code),
      conditions: libelleConditionsWmo(code),
    });
  }

  // Référence temporelle de la source : `current.time` est l'horodatage local du
  // relevé courant. C'est elle qui autorise, en aval, à qualifier une heure
  // d'« observée » ou de « prévue ». Absente → la nature restera `inconnue`.
  const referenceSource = texteScalaire(data.current?.time);

  return {
    days: [jour, ...joursSuivants],
    currentConditions: {
      temp: nombre(data.current?.temperature_2m) || tempMax,
      icon: String(nombre(data.current?.weather_code)),
      ...(referenceSource ? { time: referenceSource } : {}),
    },
    ...(referenceSource ? { referenceSource } : {}),
  };
}
