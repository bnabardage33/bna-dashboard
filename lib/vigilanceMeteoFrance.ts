// lib/vigilanceMeteoFrance.ts
//
// Lecture PURE de la Vigilance Météo-France officielle (produit DPVigilance v1,
// endpoint « cartevigilance/encours »).
//
// ─── Pourquoi ce module ───────────────────────────────────────────────────────
//
// Trois endroits lisaient la MÊME réponse officielle, chacun à sa façon :
//   • app/api/meteo-vigilance/route.ts
//   • lib/meteoVigilance.ts (copie d'une ancienne route)
//   • supabase/functions/generer-rapports-intemperies/index.ts (Deno)
//
// Deux conséquences mesurables :
//   1. Les copies divergeaient (types `max_color_id` string vs number, tolérance
//      aux structures différentes).
//   2. `lib/meteoVigilance.ts` faisait `Number(phenomenon_max_color_id)` alors
//      que la réponse Météo-France donne TRÈS SOUVENT `phenomenon_max_color_id`
//      sous forme d'OBJET `{ phenomenon_id, color_id }`. `Number({…})` vaut NaN,
//      la couleur retombait sur « vert » : une vigilance orange pouvait être
//      lue verte.
//
// Ce fichier ne dépend d'aucun framework (ni Next.js, ni Deno) : il est donc
// importable tel quel par les route handlers Next ET par l'Edge Function, qui
// partagent ainsi une seule lecture. Aucune décision d'arrêt ne vit ici : la
// décision reste dans `lib/meteoAlerte.ts` et l'Edge Function.
//
// ─── Sur la sélection de période ─────────────────────────────────────────────
//
// La réponse réelle porte une liste `periods` (aujourd'hui, demain). On ne
// suppose PLUS que `periods[0]` = aujourd'hui : on lit, quand elles existent,
// les bornes temporelles `begin_validity_time` / `end_validity_time` et
// l'échéance `echeance` (« J », « J+1 »), et on retombe sur l'ordre seulement si
// aucune borne exploitable n'est présente (comportement historique).
//
// RESTE À CONFIRMER contre une vraie réponse authentifiée : le nom exact des
// champs de bornes (`begin_validity_time` / `end_validity_time`) et des
// échéances (`J` / `J+1`). Tant qu'ils diffèrent, le repli par ordre s'applique,
// c'est-à-dire l'ancien comportement — jamais une période inventée.

export type CouleurVigilance = "vert" | "jaune" | "orange" | "rouge";

// Météo-France : 1 = vert, 2 = jaune, 3 = orange, 4 = rouge.
export const COULEUR_PAR_ID: Record<number, CouleurVigilance> = {
  1: "vert",
  2: "jaune",
  3: "orange",
  4: "rouge",
};

export const PHENOMENE_PAR_ID: Record<number, string> = {
  1: "vent",
  2: "pluie-inondation",
  3: "orages",
  4: "inondation",
  5: "neige-verglas",
  6: "canicule",
  7: "grand-froid",
  8: "avalanches",
  9: "vagues-submersion",
};

export const ORDRE_COULEUR: Record<CouleurVigilance, number> = {
  vert: 0,
  jaune: 1,
  orange: 2,
  rouge: 3,
};

export const EMOJI_VIGILANCE: Record<CouleurVigilance, string> = {
  vert: "🟢",
  jaune: "🟡",
  orange: "🟠",
  rouge: "🔴",
};

export interface VigilancePhenomene {
  id: number;
  nom: string;
  couleur: CouleurVigilance;
}

export interface VigilanceDepartement {
  departement: string;
  couleurMax: CouleurVigilance;
  phenomenes: VigilancePhenomene[];
  misAJourLe: string | null;
}

// ─── Lecture tolérante d'une réponse JSON non typée ──────────────────────────

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function chaine(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Couleur Météo-France d'un id 1..4.
 *
 * Renvoie `null` pour tout id illisible ou hors 1..4 (« abc », 99, `""`,
 * `undefined`, booléen, tableau…). DÉCISION MÉTIER : une valeur invalide est
 * « indisponible », JAMAIS « vert ». Seul l'id 1 donne un vert officiel.
 */
export function couleurDepuisId(valeur: unknown): CouleurVigilance | null {
  let id: number;
  if (typeof valeur === "number") {
    id = valeur;
  } else if (typeof valeur === "string" && valeur.trim() !== "") {
    id = Number(valeur.trim());
  } else {
    return null;
  }
  return Number.isInteger(id) ? (COULEUR_PAR_ID[id] ?? null) : null;
}

/**
 * Id de couleur d'un phénomène, quelle que soit la forme rencontrée :
 *   • `phenomenon_max_color_id: { phenomenon_id, color_id }` — forme réelle
 *   • `phenomenon_max_color_id: 2`                           — forme dégradée
 *   • `color_id` / `max_color_id` directs
 *
 * Renvoie `null` si RIEN n'est lisible, pour que l'appelant choisisse — et ne
 * transforme pas silencieusement une valeur mal lue en « vert ».
 */
export function lireColorId(phenomene: unknown): number | null {
  if (!estObjet(phenomene)) return null;

  const imbrique = phenomene.phenomenon_max_color_id;
  const candidats: unknown[] = [
    estObjet(imbrique) ? imbrique.color_id : imbrique,
    phenomene.color_id,
    phenomene.max_color_id,
  ];

  for (const candidat of candidats) {
    if (candidat === undefined || candidat === null || candidat === "") continue;
    // Seuls un nombre ou une chaîne sont lisibles : `Number(true)` ou
    // `Number([1])` donneraient 1 (donc « vert ») à partir d'une donnée invalide.
    if (typeof candidat !== "number" && typeof candidat !== "string") continue;
    const n = Number(candidat);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

function lireIdPhenomene(phenomene: Record<string, unknown>): number | null {
  const imbrique = phenomene.phenomenon_max_color_id;
  const direct = estObjet(imbrique)
    ? phenomene.phenomenon_id ?? imbrique.phenomenon_id
    : phenomene.phenomenon_id;
  const id = Number(direct);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// ─── Sélection de la période (J / J+1) ───────────────────────────────────────

function horodatage(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function bornesPeriode(periode: unknown): { debut: number; fin: number } | null {
  if (!estObjet(periode)) return null;
  const debut = horodatage(periode.begin_validity_time);
  const fin = horodatage(periode.end_validity_time);
  if (debut === null || fin === null) return null;
  return { debut, fin };
}

function echeanceDe(periode: unknown): string | null {
  if (!estObjet(periode)) return null;
  const e = periode.echeance;
  return typeof e === "string" ? e.trim().toUpperCase() : null;
}

function periodesDe(data: unknown): unknown[] {
  if (!estObjet(data)) return [];
  const product = estObjet(data.product) ? data.product : null;
  const brut = product?.periods ?? data.periods;
  return Array.isArray(brut) ? brut : [];
}

/**
 * Période correspondant à la journée courante (`demain = false`) ou à J+1
 * (`demain = true`).
 *
 *  1. Bornes temporelles réelles, quand la réponse les fournit.
 *  2. Échéance textuelle (« J », « J+1 »).
 *  3. Ordre de la liste seulement si aucune borne n'est exploitable
 *     (comportement historique, jamais une période inventée).
 */
export function choisirPeriode(
  periodes: unknown[],
  demain: boolean,
  maintenant: Date = new Date()
): unknown | null {
  if (!Array.isArray(periodes) || periodes.length === 0) return null;

  const cible = maintenant.getTime() + (demain ? 24 * 60 * 60 * 1000 : 0);

  for (const periode of periodes) {
    const bornes = bornesPeriode(periode);
    if (bornes && cible >= bornes.debut && cible < bornes.fin) return periode;
  }

  const attendues = demain ? ["J+1", "J1"] : ["J"];
  for (const periode of periodes) {
    const e = echeanceDe(periode);
    if (e && attendues.includes(e)) return periode;
  }

  // Aucune borne, aucune échéance exploitable : repli sur l'ordre historique.
  return demain ? periodes[Math.min(1, periodes.length - 1)] : periodes[0];
}

function domainesDe(periode: unknown): Record<string, unknown>[] {
  if (!estObjet(periode)) return [];
  const timelaps = estObjet(periode.timelaps) ? periode.timelaps : null;
  const brut = timelaps?.domain_ids ?? periode.domain_ids;
  const liste = Array.isArray(brut)
    ? brut
    : estObjet(brut)
      ? Object.values(brut)
      : [];
  return liste.filter(estObjet);
}

function domaineCorrespondACle(
  domaine: Record<string, unknown>,
  cle: string
): boolean {
  const id = chaine(domaine.domain_id)?.toUpperCase();
  if (!id) return false;
  if (id === cle) return true;
  if (cle === "2A" && ["20A", "2A", "200", "201"].includes(id)) return true;
  if (cle === "2B" && ["20B", "2B", "202"].includes(id)) return true;
  return false;
}

function phenomenesDe(
  domaine: Record<string, unknown>
): VigilancePhenomene[] {
  const bruts = domaine.phenomenon_items ?? domaine.phenomenon_max_colors;
  const liste = Array.isArray(bruts) ? bruts : [];

  const phenomenes: VigilancePhenomene[] = [];
  for (const brut of liste) {
    const id = lireIdPhenomene(estObjet(brut) ? brut : {});
    if (id === null || !PHENOMENE_PAR_ID[id]) continue;
    const couleur = couleurDepuisId(lireColorId(brut));
    // DÉCISION MÉTIER : une couleur de phénomène invalide/illisible ne doit
    // JAMAIS être comptabilisée comme un faux vert.
    if (!couleur) continue;
    phenomenes.push({
      id,
      nom: PHENOMENE_PAR_ID[id],
      couleur,
    });
  }
  return phenomenes;
}

function couleurMaxDeDomaine(
  domaine: Record<string, unknown>,
  phenomenes: VigilancePhenomene[]
): CouleurVigilance | null {
  const brut = domaine.max_color_id;
  if (brut !== undefined && brut !== null && brut !== "") {
    const c = couleurDepuisId(brut);
    if (c !== null) return c;
  }
  // Pas de `max_color_id` valide : si des phénomènes existent avec des
  // couleurs reconnues, on prend la plus forte d'entre eux.
  if (phenomenes.length > 0) {
    return couleurLaPlusForte(...phenomenes.map((p) => p.couleur));
  }
  // Aucune couleur valide disponible : la vigilance est inexploitable (null).
  return null;
}

function miseAJourDe(data: unknown): string | null {
  if (!estObjet(data)) return null;
  const product = estObjet(data.product) ? data.product : null;
  const valeur = product?.update_time ?? data.update_time;
  return typeof valeur === "string" && valeur.trim() ? valeur : null;
}

// ─── Extraction principale ───────────────────────────────────────────────────

/**
 * Couleur maximale d'un département, telle que la fournit Météo-France.
 *
 * Renvoie `null` uniquement lorsque le département n'est absent d'AUCUNE période
 * exploitable, pour permettre à l'appelant de distinguer « vert officiel » d'un
 * « indisponible ».
 */
export function extraireDepartement(
  data: unknown,
  departement: string,
  demain = false,
  maintenant: Date = new Date()
): VigilanceDepartement | null {
  const periodes = periodesDe(data);
  if (periodes.length === 0) {
    console.error("Réponse Vigilance sans périodes exploitables");
    return null;
  }

  const periode = choisirPeriode(periodes, demain, maintenant);
  if (!periode) return null;

  const departementNormalise = departement.trim().toUpperCase();
  const domaine = domainesDe(periode).find((d) =>
    domaineCorrespondACle(d, departementNormalise)
  );

  if (!domaine) {
    console.warn(
      `Département ${departementNormalise} non trouvé dans les données Vigilance`
    );
    return null;
  }

  const phenomenes = phenomenesDe(domaine);
  const couleurMax = couleurMaxDeDomaine(domaine, phenomenes);

  // DÉCISION MÉTIER : une vigilance dont la couleur est invalide ou absente
  // est considérée comme « indisponible » (null), jamais comme « vert ».
  if (!couleurMax) {
    console.warn(
      `Vigilance inexploitable ou invalide pour le département ${departementNormalise}`
    );
    return null;
  }

  return {
    departement: departementNormalise,
    couleurMax,
    phenomenes,
    misAJourLe: miseAJourDe(data),
  };
}

// ─── Couleurs, partagées ─────────────────────────────────────────────────────

export function couleurPourPhenomene(
  vigilance: VigilanceDepartement | null | undefined,
  nomPhenomene: string
): CouleurVigilance {
  if (!vigilance || !vigilance.phenomenes) return "vert";
  const nomRecherche = nomPhenomene.trim().toLowerCase();
  const phenomene = vigilance.phenomenes.find(
    (p) => p.nom.trim().toLowerCase() === nomRecherche
  );
  return phenomene?.couleur ?? vigilance.couleurMax;
}

export function couleurLaPlusForte(
  ...couleurs: (CouleurVigilance | undefined | null)[]
): CouleurVigilance {
  return couleurs.reduce<CouleurVigilance>(
    (max, couleur) =>
      couleur && ORDRE_COULEUR[couleur] > ORDRE_COULEUR[max] ? couleur : max,
    "vert"
  );
}

// ─── Motif d'indisponibilité, partagé route Next / Edge Function ─────────────
//
// Quand la vigilance officielle n'a pas pu être lue, le motif du rapport doit le
// dire EXPLICITEMENT. Sinon un libellé comme « Pas de vigilance officielle, mais
// dépassement mesuré … » laisse croire qu'une vigilance verte a été CONFIRMÉE
// alors que la donnée manque. La route Next et l'Edge Function partagent donc ce
// préfixe, plutôt que d'en dupliquer chacune une variante qui divergerait.

export const MOTIF_VIGILANCE_INDISPONIBLE =
  "Vigilance officielle indisponible.";

export const MOTIF_VIGILANCE_PARTIELLE =
  "Vigilance officielle partiellement indisponible.";

/** `true` seulement pour une couleur officielle reconnue (vert/jaune/orange/rouge). */
function estCouleurConnue(valeur: unknown): valeur is CouleurVigilance {
  return (
    typeof valeur === "string" &&
    Object.prototype.hasOwnProperty.call(ORDRE_COULEUR, valeur)
  );
}

/**
 * Préfixe un motif de rapport quand la vigilance officielle manque.
 *
 *   • matin ET après-midi illisibles → « Vigilance officielle indisponible. »
 *   • un seul des deux illisible      → « … partiellement indisponible. »
 *   • les deux connus                 → motif inchangé
 *
 * Une valeur présente mais hors des quatre niveaux officiels (ex. la sentinelle
 * « indisponible » recopiée d'une ancienne capture) est traitée comme MANQUANTE :
 * on ne la prend jamais pour une vigilance verte.
 */
export function prefixerMotifVigilance(
  motif: string,
  vigilanceMatin: unknown,
  vigilanceApresmidi: unknown
): string {
  const matinConnu = estCouleurConnue(vigilanceMatin);
  const apresMidiConnu = estCouleurConnue(vigilanceApresmidi);

  if (!matinConnu && !apresMidiConnu) {
    return `${MOTIF_VIGILANCE_INDISPONIBLE} ${motif}`;
  }
  if (!matinConnu || !apresMidiConnu) {
    return `${MOTIF_VIGILANCE_PARTIELLE} ${motif}`;
  }
  return motif;
}
