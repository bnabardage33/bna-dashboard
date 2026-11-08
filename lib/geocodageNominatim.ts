// lib/geocodageNominatim.ts
//
// Géocodage Nominatim (OpenStreetMap) partagé.
//
// Ce module est volontairement PUR (aucune API Deno, aucun import Next.js) :
// il est consommé à la fois par l'Edge Function `generer-rapports-intemperies`
// et par les tests Node/Vitest. Le contrat est celui de
// `lib/deplacement/geocodage.ts` : code postal exact, sinon refus ; ambiguïté,
// refus. La fonction LÈVE, et l'appelant décide du repli.

type CandidatNominatim = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
  };
};

function nomLieu(c: CandidatNominatim): string {
  const a = c.address ?? {};
  return (
    a.city ||
    a.town ||
    a.village ||
    a.municipality ||
    a.county ||
    (c.display_name || "").split(",")[0] ||
    ""
  );
}

export async function geocoderAdresse(
  adresse: string
): Promise<{ lat: number; lon: number }> {
  const q = adresse.trim();
  if (!q) {
    throw new Error("Adresse vide");
  }

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      q
    )}&format=jsonv2&limit=5&addressdetails=1&countrycodes=fr`,
    {
      headers: {
        "User-Agent": "BNA-Dashboard/1.0",
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Géocodage Nominatim (${res.status})`);
  }

  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Adresse introuvable : ${q}`);
  }

  const m = q.match(/(?:^|\D)(\d{5})(?:\D|$)/);
  const codePostal = m ? m[1] : null;

  let eligibles = (data as CandidatNominatim[]).filter((c) => c.lat && c.lon);

  if (codePostal) {
    eligibles = eligibles.filter((c) => c.address?.postcode === codePostal);

    if (eligibles.length === 0) {
      throw new Error(
        `Aucun lieu au code postal ${codePostal} pour « ${q} »`
      );
    }
  }

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
  const lat = parseFloat(choisi.lat!);
  const lon = parseFloat(choisi.lon!);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Coordonnées de géocodage invalides");
  }

  return { lat, lon };
}
