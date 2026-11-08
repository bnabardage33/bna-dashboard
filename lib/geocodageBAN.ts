// lib/geocodageBAN.ts
//
// Géocodage d'adresses françaises via la Base Adresse Nationale
// (`api-adresse.data.gouv.fr`), service public gratuit et sans clé.
//
// Pourquoi la BAN et pas Nominatim : appelée depuis l'Edge Function Supabase,
// Nominatim (OpenStreetMap) répond 403 — ses IP d'egress sont bloquées par la
// politique d'usage du service. La BAN est hébergée par l'État, couvre
// exactement les adresses françaises et ne bloque pas les appels serveur.
//
// Ce module est volontairement PUR (aucune API Deno, aucun import Next.js) :
// il est consommé par l'Edge Function `generer-rapports-intemperies` et par
// les tests Node/Vitest. Le contrat reste fail-closed, comme
// `lib/deplacement/geocodage.ts` : code postal exact, sinon refus ; ambiguïté,
// refus. La fonction LÈVE, et l'appelant décide du repli.

type CandidatBAN = {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    label?: string;
    postcode?: string;
    city?: string;
    citycode?: string;
    score?: number;
    type?: string;
  };
};

function nomLieu(c: CandidatBAN): string {
  return c.properties?.city || c.properties?.citycode || "";
}

/** Accepte un nombre JSON ou une chaîne numérique ; refuse null/undefined/""/NaN. */
function versNombre(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return Number.NaN;
}

export async function geocoderAdresse(
  adresse: string
): Promise<{ lat: number; lon: number }> {
  const q = adresse.trim();
  if (!q) {
    throw new Error("Adresse vide");
  }

  const res = await fetch(
    `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(
      q
    )}&limit=5`,
    {
      headers: {
        "User-Agent": "BNA-Dashboard/1.0",
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Géocodage BAN (${res.status})`);
  }

  const data = await res.json();

  const brut = (data as { features?: unknown })?.features;
  if (!Array.isArray(brut) || brut.length === 0) {
    throw new Error(`Adresse introuvable : ${q}`);
  }

  const candidats = brut as CandidatBAN[];

  const m = q.match(/(?:^|\D)(\d{5})(?:\D|$)/);
  const codePostal = m ? m[1] : null;

  let eligibles = candidats;

  if (codePostal) {
    eligibles = eligibles.filter(
      (c) => c.properties?.postcode === codePostal
    );

    if (eligibles.length === 0) {
      throw new Error(
        `Aucun lieu au code postal ${codePostal} pour « ${q} »`
      );
    }
  }

  eligibles = eligibles.filter((c) => {
    const lon = versNombre(c.geometry?.coordinates?.[0]);
    const lat = versNombre(c.geometry?.coordinates?.[1]);
    return Number.isFinite(lat) && Number.isFinite(lon);
  });

  if (eligibles.length === 0) {
    throw new Error("Coordonnées de géocodage invalides");
  }

  // Sans code postal (ou si un même code couvre plusieurs lieux), on refuse de
  // « prendre le premier » : c'est précisément le défaut corrigé.
  const communes = [
    ...new Set(eligibles.map((c) => nomLieu(c))),
  ].filter(Boolean);

  if (communes.length > 1) {
    throw new Error(
      `Adresse ambiguë pour « ${q} » : ${communes.join(
        ", "
      )}. Précisez la commune.`
    );
  }

  const choisi = eligibles[0];
  const coords = choisi.geometry?.coordinates;
  const lon = versNombre(coords?.[0]);
  const lat = versNombre(coords?.[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Coordonnées de géocodage invalides");
  }

  return { lat, lon };
}
