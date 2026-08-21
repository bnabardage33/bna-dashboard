// lib/meteoVigilance.ts

export type CouleurVigilance =
  | "vert"
  | "jaune"
  | "orange"
  | "rouge";

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

const ORDRE_COULEUR: Record<
  CouleurVigilance,
  number
> = {
  vert: 0,
  jaune: 1,
  orange: 2,
  rouge: 3,
};

export async function fetchVigilance(
  departement: string,
  demain = false
): Promise<VigilanceDepartement> {
  const params = new URLSearchParams({
    departement,
  });

  if (demain) {
    params.set("demain", "true");
  }

  const response = await fetch(
    `/api/meteo-vigilance?${params.toString()}`,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    let message = "Erreur vigilance météo";

    try {
      const data = await response.json();

      if (data?.error) {
        message = data.error;
      }
    } catch {
      // Réponse non JSON
    }

    throw new Error(message);
  }

  return response.json();
}

export function couleurPourPhenomene(
  vigilance: VigilanceDepartement,
  nomPhenomene: string
): CouleurVigilance {
  const phenomene =
    vigilance.phenomenes.find(
      (item) =>
        item.nom === nomPhenomene
    );

  return (
    phenomene?.couleur ??
    vigilance.couleurMax
  );
}

export function couleurLaPlusForte(
  ...couleurs: CouleurVigilance[]
): CouleurVigilance {
  if (!couleurs.length) {
    return "vert";
  }

  return couleurs.reduce(
    (max, couleur) =>
      ORDRE_COULEUR[couleur] >
      ORDRE_COULEUR[max]
        ? couleur
        : max,
    "vert" as CouleurVigilance
  );
}

export const EMOJI_VIGILANCE: Record<
  CouleurVigilance,
  string
> = {
  vert: "🟢",
  jaune: "🟡",
  orange: "🟠",
  rouge: "🔴",
};
