export type ResultatService<T> = 
  | { ok: true; data: T }
  | { ok: false; erreur: string };

/**
 * Coordonnées du lieu RÉELLEMENT retenu, pas du premier résultat renvoyé.
 *
 * `libelle` et `codePostal` sont conservés pour être affichés à l'utilisateur :
 * un trajet chiffré ne doit pas reposer sur un lieu qu'il n'a pas pu voir.
 */
export type Coordonnees = {
  lat: number;
  lon: number;
  libelle: string;
  codePostal: string | null;
};

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

/** Code postal français (5 chiffres) éventuellement présent dans la saisie. */
export function extraireCodePostal(adresse: string): string | null {
  const m = adresse.match(/(?:^|\D)(\d{5})(?:\D|$)/);
  return m ? m[1] : null;
}

/** Nom lisible d'un candidat Nominatim, pour un message d'erreur exploitable. */
function nomLisible(candidat: NominatimCandidat): string {
  const a = candidat.address ?? {};
  const commune =
    a.city || a.town || a.village || a.municipality || a.county || a.state || "";
  const cp = a.postcode ? `${a.postcode} ` : "";
  const libelle = candidat.display_name ?? "";
  if (commune) return `${cp}${commune}`;
  // Repli : le début du display_name, qui contient au moins le nom de la voie.
  return libelle.split(",").slice(0, 2).join(",").trim() || libelle || "lieu inconnu";
}

type NominatimCandidat = {
  lat: string;
  lon: string;
  type?: string;
  importance?: number;
  display_name?: string;
  address?: {
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

/**
 * Géocode une adresse en refusant les correspondances ambiguës.
 *
 * Pourquoi `limit=1` était un défaut : Nominatim classe ses résultats par
 * *importance*, pas par pertinence d'adresse, et deux homonymes peuvent avoir
 * une importance presque identique. Cas réel mesuré sur
 * « 8 lotissement Bellevue, 33920 » :
 *
 *   Lotissement Bellevue              Branne      cp 33420  importance 0,0533973472
 *   Lotissement les Portes de Bellevue Saint-Savin cp 33920  importance 0,0533971092
 *
 * L'écart d'importance est de 2,4e-7. `limit=1` renvoie donc l'un ou l'autre
 * selon l'état de l'index, sans aucun signal. Depuis le même point de départ,
 * OSRM donne 12,47 km vers Saint-Savin et 55,22 km vers Branne — soit
 * 24,94 km ou 110,43 km aller-retour pour un chiffrage censé être identique.
 *
 * La stratégie est donc fail-closed :
 *   - code postal dans la saisie  -> on exige une correspondance EXACTE, sinon
 *     refus nommant les codes postaux réellement trouvés ;
 *   - pas de code postal          -> on refuse si les candidats s'étalent sur
 *     plusieurs communes, car choisir au hasard peut facturer 4,4 fois le
 *     montant réel.
 */
export async function geocoderAdresse(adresse: string): Promise<ResultatService<Coordonnees>> {
  if (!adresse.trim()) return { ok: false, erreur: "Adresse vide." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.append("q", adresse.trim());
    url.searchParams.append("format", "jsonv2");
    // 5 et non 1 : il faut pouvoir choisir entre plusieurs homonymes.
    url.searchParams.append("limit", "5");
    // Indispensable pour lire le code postal du candidat et le vérifier.
    url.searchParams.append("addressdetails", "1");
    // Restreint à la France : sans cela, une rue homonyme à l'étranger peut
    // gagner la course. La route météo le fait déjà pour la même raison.
    url.searchParams.append("countrycodes", "fr");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": userAgentNominatim() },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return { ok: false, erreur: `Erreur API Nominatim: ${res.status}` };
    }

    const data = (await res.json()) as NominatimCandidat[];
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

    const codePostalSaisi = extraireCodePostal(adresse);
    let retenus: NominatimCandidat[];

    if (codePostalSaisi) {
      retenus = data.filter((c) => c.address?.postcode === codePostalSaisi);
      if (retenus.length === 0) {
        const trouves = [...new Set(data.map((c) => nomLisible(c)))];
        return {
          ok: false,
          erreur:
            `Aucun lieu ne correspond au code postal ${codePostalSaisi}. ` +
            `OpenStreetMap ne trouve « ${adresse.trim()} » que : ${trouves.join(", ")}. ` +
            `Vérifiez le code postal, ou ajoutez la commune pour lever l'ambiguïté.`
        };
      }
    } else {
      retenus = data;
      const communes = [...new Set(retenus.map((c) => nomLisible(c)))];
      if (communes.length > 1) {
        return {
          ok: false,
          erreur:
            `Adresse ambiguë : « ${adresse.trim()} » correspond à plusieurs communes ` +
            `(${communes.join(", ")}). Ajoutez le code postal pour choisir la bonne.`
        };
      }
    }

    // Nominatim renvoie ses résultats triés par importance décroissante : le
    // premier est donc le meilleur parmi ceux qui ont survécu au filtre.
    const choisi = retenus[0];
    const lat = parseFloat(choisi.lat);
    const lon = parseFloat(choisi.lon);

    if (isNaN(lat) || isNaN(lon)) {
      return { ok: false, erreur: "Coordonnées invalides retournées par l'API." };
    }

    return {
      ok: true,
      data: {
        lat,
        lon,
        libelle: nomLisible(choisi),
        codePostal: choisi.address?.postcode ?? null
      }
    };
  } catch (e: unknown) {
    clearTimeout(timeout);
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, erreur: "Le service a mis trop de temps à répondre (timeout)." };
    }
    return { ok: false, erreur: "Erreur réseau lors du géocodage." };
  }
}
