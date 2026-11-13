// lib/gps/itineraireGoogleMaps.ts
/**
 * Utilitaire GPS — Construction d'URL d'itinéraire routier Google Maps réel.
 *
 * Spécification officielle Google Maps Directions URL Scheme :
 * https://www.google.com/maps/dir/?api=1&destination=ADRESSE_ENCODEE&travelmode=driving
 *
 * Fonctionnement :
 * - `destination` : adresse réelle du chantier encodée via `encodeURIComponent`.
 * - `origin` : omis intentionnellement pour laisser Google Maps utiliser la position
 *   GPS courante de l'artisan / conducteur sur smartphone ou ordinateur.
 * - `travelmode=driving` : active immédiatement le calcul du trajet routier et la navigation vocale.
 */

export function genererUrlItineraireGoogleMaps(adresse?: string | null): string | null {
  if (!adresse || typeof adresse !== "string") {
    return null;
  }

  const adresseNettoyee = adresse.trim();
  if (adresseNettoyee.length === 0) {
    return null;
  }

  const destinationEncodee = encodeURIComponent(adresseNettoyee);
  return `https://www.google.com/maps/dir/?api=1&destination=${destinationEncodee}&travelmode=driving`;
}
