export type ResultatService<T> = 
  | { ok: true; data: T }
  | { ok: false; erreur: string };

export type Coordonnees = { lat: number; lon: number };

// User-Agent pour tous les appels a Nominatim (openstreetmap).
// Leur politique d'utilisation exige un contact identifiable dans le
// User-Agent, sans quoi le service peut bloquer l'appel sans preavis.
// Centralise ici parce que deux modules appellent Nominatim : le calcul de
// trajet des frais de deplacement, et la meteo des chantiers. Sans ce
// partage, la variable d'environnement NOMINATIM_EMAIL risque d'etre
// appliquee a l'un et pas a l'autre.
export function userAgentNominatim(): string {
  const email = process.env.NOMINATIM_EMAIL;
  return email ? `BNA-Dashboard/1.0 (${email})` : "BNA-Dashboard/1.0";
}

export async function geocoderAdresse(adresse: string): Promise<ResultatService<Coordonnees>> {
  if (!adresse.trim()) return { ok: false, erreur: "Adresse vide." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.append("q", adresse.trim());
    url.searchParams.append("format", "json");
    url.searchParams.append("limit", "1");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": userAgentNominatim() },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return { ok: false, erreur: `Erreur API Nominatim: ${res.status}` };
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      // Nominatim ne répond rien quand il ne reconnaît pas la chaîne. La cause
      // la plus fréquente n'est pas une adresse fausse mais un séparant
      // manquant : « 12 rue des Lilas 20000 Ajaccio » ne trouve rien, alors que
      // « 12 rue des Lilas, 20000 Ajaccio » trouve. On le dit explicitement,
      // sinon l'utilisateur ne voit qu'un « introuvable » et ne devine pas.
      return {
        ok: false,
        erreur:
          "Adresse introuvable ou imprécise. Vérifiez la virgule entre la rue et le code postal, et que la commune est bien écrite."
      };
    }

    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);

    if (isNaN(lat) || isNaN(lon)) {
      return { ok: false, erreur: "Coordonnées invalides retournées par l'API." };
    }

    return { ok: true, data: { lat, lon } };
  } catch (e: unknown) {
    clearTimeout(timeout);
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, erreur: "Le service a mis trop de temps à répondre (timeout)." };
    }
    return { ok: false, erreur: "Erreur réseau lors du géocodage." };
  }
}
