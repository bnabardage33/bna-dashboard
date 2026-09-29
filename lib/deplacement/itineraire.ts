import { ResultatService, Coordonnees } from "./geocodage";

export async function calculerDistanceRoute(depart: Coordonnees, arrivee: Coordonnees): Promise<ResultatService<number>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    // Le format attendu par OSRM est : {lon},{lat};{lon},{lat}
    const coords = `${depart.lon},${depart.lat};${arrivee.lon},${arrivee.lat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return { ok: false, erreur: `Erreur API OSRM: ${res.status}` };
    }

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      return { ok: false, erreur: "Aucun itinéraire routier trouvé." };
    }

    const distanceMetres = data.routes[0].distance;
    if (typeof distanceMetres !== "number") {
      return { ok: false, erreur: "Format de distance invalide." };
    }

    return { ok: true, data: distanceMetres };
  } catch (e: unknown) {
    clearTimeout(timeout);
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, erreur: "Le service a mis trop de temps à répondre (timeout)." };
    }
    return { ok: false, erreur: "Erreur réseau lors du calcul d'itinéraire." };
  }
}
