import { arrondir } from "@/lib/devisCalcul";
import { geocoderAdresse, ResultatService } from "./geocodage";
import { calculerDistanceRoute } from "./itineraire";

export type DistanceDeplacement = {
  distanceAllerKm: number;
  distanceRetourKm: number;
};

// Utilitaire de pause pour respecter les limites de rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Orchestrateur : convertit deux adresses textuelles en distance kilométrique.
 * Effectue les appels API Nominatim de façon séquentielle avec une pause d'1 seconde
 * pour respecter scrupuleusement la limite d'1 requête/seconde du service public.
 */
export async function evaluerDistances(adresseDepart: string, adresseArrivee: string): Promise<ResultatService<DistanceDeplacement>> {
  // 1. Géocodage de l'adresse de départ
  const geoDepart = await geocoderAdresse(adresseDepart);
  if (!geoDepart.ok) return { ok: false, erreur: `Départ : ${geoDepart.erreur}` };

  // Délai explicite d'environ 1.1 seconde pour respecter la limite Nominatim
  await delay(1100);

  // 2. Géocodage de l'adresse d'arrivée
  const geoArrivee = await geocoderAdresse(adresseArrivee);
  if (!geoArrivee.ok) return { ok: false, erreur: `Arrivée : ${geoArrivee.erreur}` };

  // 3. Calcul de la distance routière via OSRM
  const route = await calculerDistanceRoute(geoDepart.data, geoArrivee.data);
  if (!route.ok) return { ok: false, erreur: `Itinéraire : ${route.erreur}` };

  // 4. Conversion et formatage (mètres -> kilomètres)
  const distanceAllerKm = arrondir(route.data / 1000);
  
  return {
    ok: true,
    data: {
      distanceAllerKm,
      // Le modèle suppose par défaut que le retour est égal à l'aller.
      distanceRetourKm: distanceAllerKm
    }
  };
}
