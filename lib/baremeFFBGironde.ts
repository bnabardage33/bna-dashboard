// lib/baremeFFBGironde.ts
//
// Barème officiel des petits déplacements FFB Gironde (Nouvelle-Aquitaine),
// calcul de distance à vol d'oiseau (Haversine), et coût horaire ressources.

export type ZoneDeplacementFFB =
  | "1A"
  | "1B"
  | "2"
  | "3"
  | "4"
  | "5"
  | "GRAND_DEPLACEMENT";

export type StatutEmploiRessource = "gerant_tns" | "salarie" | "interimaire";

export type IndemnitesFFB = {
  zone: ZoneDeplacementFFB;
  panier_repas: number;
  indemnite_trajet: number;
  indemnite_transport: number;
  grand_deplacement: boolean;
};

type LigneGrille = { trajet: number; transport: number };

const GRILLE_MOINS_10: {
  panier: number;
  zones: Record<Exclude<ZoneDeplacementFFB, "GRAND_DEPLACEMENT">, LigneGrille>;
} = {
  panier: 10.8,
  zones: {
    "1A": { trajet: 0.72, transport: 0.88 },
    "1B": { trajet: 1.62, transport: 2.32 },
    "2": { trajet: 3.33, transport: 5.04 },
    "3": { trajet: 4.74, transport: 8.37 },
    "4": { trajet: 6.16, transport: 11.75 },
    "5": { trajet: 7.61, transport: 15.1 },
  },
};

const GRILLE_PLUS_10: {
  panier: number;
  zones: Record<Exclude<ZoneDeplacementFFB, "GRAND_DEPLACEMENT">, LigneGrille>;
} = {
  panier: 11.2,
  zones: {
    "1A": { trajet: 0.74, transport: 0.89 },
    "1B": { trajet: 1.67, transport: 2.35 },
    "2": { trajet: 3.45, transport: 5.12 },
    "3": { trajet: 4.9, transport: 8.5 },
    "4": { trajet: 6.37, transport: 11.93 },
    "5": { trajet: 7.88, transport: 15.33 },
  },
};

const RAYON_TERRE_KM = 6371;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Calcule la distance à vol d'oiseau (en km, arrondie à 2 décimales)
 * entre deux points GPS via la formule de Haversine.
 */
export function calculerDistanceVolOiseauKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = degToRad(lat2 - lat1);
  const dLng = degToRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(lat1)) *
      Math.cos(degToRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(RAYON_TERRE_KM * c * 100) / 100;
}

/**
 * Détermine la zone FFB Gironde à partir de la distance à vol d'oiseau (km).
 */
export function determinerZoneFFB(distanceKm: number): ZoneDeplacementFFB {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return "1A";
  if (distanceKm <= 5) return "1A";
  if (distanceKm <= 10) return "1B";
  if (distanceKm <= 20) return "2";
  if (distanceKm <= 30) return "3";
  if (distanceKm <= 40) return "4";
  if (distanceKm <= 50) return "5";
  return "GRAND_DEPLACEMENT";
}

/**
 * Retourne les indemnités officielles FFB Gironde (panier, trajet, transport)
 * selon la zone et la taille de l'entreprise (`effectifPlus10`).
 */
export function obtenirIndemnitesFFBGironde(
  zone: ZoneDeplacementFFB | string | null | undefined,
  effectifPlus10: boolean
): IndemnitesFFB {
  const grille = effectifPlus10 ? GRILLE_PLUS_10 : GRILLE_MOINS_10;
  const z = (zone ?? "1A").toUpperCase() as ZoneDeplacementFFB;

  if (z === "GRAND_DEPLACEMENT") {
    return {
      zone: "GRAND_DEPLACEMENT",
      panier_repas: grille.panier,
      indemnite_trajet: 0,
      indemnite_transport: 0,
      grand_deplacement: true,
    };
  }

  const ligne = grille.zones[z] ?? grille.zones["1A"];
  return {
    zone: z in grille.zones ? z : "1A",
    panier_repas: grille.panier,
    indemnite_trajet: ligne.trajet,
    indemnite_transport: ligne.transport,
    grand_deplacement: false,
  };
}

export function normaliserStatutEmploi(v?: string | null): StatutEmploiRessource {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "gerant_tns" || s === "gerant" || s === "gérant") return "gerant_tns";
  if (s === "interimaire" || s === "intérimaire" || s === "interim") return "interimaire";
  return "salarie";
}

export function calculerCoutHoraireRessource(
  ressource: {
    statut_emploi?: string | null;
    taux_horaire_brut?: number | null;
    coefficient_agence?: number | null;
    agence_interim?: string | null;
    type_contrat_interim?: string | null;
  } | null | undefined,
  tauxChargeDefaut = 28.5
): {
  statut: StatutEmploiRessource;
  tauxHoraireHT: number;
  detail: string;
} {
  const statut = normaliserStatutEmploi(ressource?.statut_emploi);
  if (statut === "interimaire") {
    const brut = Number(ressource?.taux_horaire_brut ?? 0);
    const coef = Number(ressource?.coefficient_agence ?? 2.0) || 2.0;
    const tauxHT =
      brut > 0 ? Math.round(brut * coef * 100) / 100 : tauxChargeDefaut;
    const contrat =
      ressource?.type_contrat_interim === "gestion" ? "gestion" : "délégation";
    const agence = ressource?.agence_interim ? ` (${ressource.agence_interim})` : "";
    return {
      statut,
      tauxHoraireHT: tauxHT,
      detail:
        brut > 0
          ? `Intérim ${contrat}${agence} : ${brut.toFixed(2)} € brut × ${coef.toFixed(2)} = ${tauxHT.toFixed(2)} €/h HT`
          : `Intérim ${contrat}${agence} : taux par défaut ${tauxHT.toFixed(2)} €/h HT`,
    };
  }
  if (statut === "gerant_tns") {
    return {
      statut,
      tauxHoraireHT: tauxChargeDefaut,
      detail: "Gérant TNS : frais de déplacement au réel (indemnités FFB à 0 €)",
    };
  }
  return {
    statut,
    tauxHoraireHT: tauxChargeDefaut,
    detail: `Salarié : barème petits déplacements FFB Gironde applicable`,
  };
}

export const OPTIONS_TVA_BTP = [
  {
    taux: 20,
    label: "20 % — Neuf / Terrasse / Clôture",
    aide: "Taux normal : construction neuve, terrassement, terrasse, clôture.",
  },
  {
    taux: 10,
    label: "10 % — Rénovation > 2 ans",
    aide: "Taux intermédiaire : travaux d'amélioration/rénovation sur logement achevé > 2 ans.",
  },
  {
    taux: 5.5,
    label: "5,5 % — ITE / Rénovation énergétique",
    aide: "Taux réduit : isolation thermique par l'extérieur (ITE) et performance énergétique > 2 ans.",
  },
] as const;
