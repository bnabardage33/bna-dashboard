// lib/meteoVigilance.ts
// Wrapper client pour interroger la vigilance officielle Météo-France
// via la route interne /api/meteo-vigilance (qui garde la clé API côté serveur).

export type CouleurVigilance = "vert" | "jaune" | "orange" | "rouge";

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

const ORDRE_COULEUR: Record<CouleurVigilance, number> = {
  vert: 0,
  jaune: 1,
  orange: 2,
  rouge: 3,
};

export async function fetchVigilance(
  departement: string
): Promise<VigilanceDepartement> {
  const res = await fetch(
    `/api/meteo-vigilance?departement=${encodeURIComponent(departement)}`
  );

  if (!res.ok) {
    throw new Error("Erreur vigilance météo");
  }

  return res.json();
}

// Récupère la couleur officielle pour un phénomène précis (vent ou
// pluie-inondation nous intéressent surtout pour le bardage).
// Si le phénomène n'est pas trouvé dans le détail, on retombe sur la
// couleur max du département par sécurité.
export function couleurPourPhenomene(
  vigilance: VigilanceDepartement,
  nomPhenomene: string
): CouleurVigilance {
  const phenomene = vigilance.phenomenes.find(
    (p) => p.nom === nomPhenomene
  );
  return phenomene?.couleur ?? vigilance.couleurMax;
}

export function couleurLaPlusForte(
  ...couleurs: CouleurVigilance[]
): CouleurVigilance {
  return couleurs.reduce((max, c) =>
    ORDRE_COULEUR[c] > ORDRE_COULEUR[max] ? c : max
  , "vert" as CouleurVigilance);
}

export const EMOJI_VIGILANCE: Record<CouleurVigilance, string> = {
  vert: "🟢",
  jaune: "🟡",
  orange: "🟠",
  rouge: "🔴",
};
