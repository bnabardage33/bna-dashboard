// lib/meteoLocalisation.ts
//
// POINT GÉOGRAPHIQUE UNIQUE ET VALIDÉ, partagé par les fournisseurs météo.
//
// ─── Pourquoi ce module existe ────────────────────────────────────────────────
//
// Visual Crossing accepte une adresse en texte et la géocode lui-même ;
// Open-Meteo n'accepte que des coordonnées. Quand les deux reçoivent la même
// adresse en texte, rien ne garantit qu'ils retiennent le même point : chacun a
// son propre géocodeur, et une homonymie de lotissement suffit à les faire
// diverger. Une carte affiche alors la météo d'une commune pendant que le
// rapport enregistre celle d'une autre.
//
// La règle ici est donc : on résout l'adresse UNE fois, on valide le code
// postal, puis on transmet les coordonnées retenues à TOUS les fournisseurs.
// Plus aucun d'eux ne géocode une chaîne libre : ils ne peuvent donc pas
// choisir silencieusement une commune incompatible avec le code postal.
//
// ─── Pourquoi un cache ────────────────────────────────────────────────────────
//
// `resoudreLocalisationMeteo` mémorise la résolution par adresse : un même
// chantier interrogé plusieurs fois (carte d'accueil, cron, rapport) réutilise
// le même point sans réinterroger Nominatim. Le cache vit dans le processus et
// n'écrit rien en base. Une persistance durable des coordonnées par chantier
// supposerait une colonne dédiée (donc une migration), hors périmètre ici.
import {
  geocoderAdresse,
  type Coordonnees,
  type ResultatService,
} from "@/lib/deplacement/geocodage";

export type LocalisationMeteo = Coordonnees;

const cache = new Map<string, Promise<ResultatService<LocalisationMeteo>>>();

/**
 * Résout l'adresse d'un chantier en coordonnées validées, ou explique pourquoi
 * elle ne l'est pas. On ne devine jamais : code postal exact sans quoi erreur
 * explicite ; plusieurs communes pour un même lieu, erreur explicite.
 */
export async function resoudreLocalisationMeteo(
  adresse: string
): Promise<ResultatService<LocalisationMeteo>> {
  const q = (adresse ?? "").trim();
  if (!q) {
    return {
      ok: false,
      erreur:
        "Aucune adresse de chantier : impossible de valider le lieu. Aucune météo ne sera produite pour ce chantier.",
    };
  }

  const cle = q.toLowerCase();
  const deja = cache.get(cle);
  if (deja) return deja;

  // `exigerCommuneUnique` : même un code postal correct peut couvrir plusieurs
  // lieux. La météo refuse de choisir à la place de l'utilisateur.
  const resolution = geocoderAdresse(q, { exigerCommuneUnique: true }).then((r) => {
    // Un échec (réseau, Nominatim indisponible) ne doit pas être figé dans le
    // cache : c'est l'échec transitoire qu'on ne veut pas réutiliser.
    if (!r.ok) cache.delete(cle);
    return r;
  });

  cache.set(cle, resolution);
  return resolution;
}

/** Coordonnées au format `lat,lon`, compris par Visual Crossing. */
export function pointPourFournisseur(loc: { lat: number; lon: number }): string {
  return `${loc.lat},${loc.lon}`;
}

/** Vide le cache de résolution. Réservé aux tests. */
export function viderCacheLocalisation(): void {
  cache.clear();
}
