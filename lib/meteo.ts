export type PeriodeMeteo = { temp: number; vent: number; rafales: number };
export type HeureMeteo = { heure: string; temp: number; vent: number; rafales: number; pluie: number };
export type AlerteMeteo = { niveau: "vert" | "jaune" | "orange" | "rouge"; motif: string };
export type JourPrevu = {
  date: string;
  tempMax: number;
  tempMin: number;
  icon: string;
  conditions: string;
};
// Origine de la prévision. `icon` n'a pas le même sens selon la source : un
// NOM d'icône chez VisualCrossing, un CODE WMO chez Open-Meteo. Voir
// `lib/meteoOpenMeteo.ts` pour pourquoi la route accepte les deux.
export type SourceMeteo = "visualcrossing" | "open-meteo";

export type JourMeteo = {
  matin: PeriodeMeteo;
  apresMidi: PeriodeMeteo;
  heures: HeureMeteo[];
  alerte: AlerteMeteo;
  icon: string;
  conditions: string;
  source?: SourceMeteo;
  tempActuelle: number;
  tempMaxJour: number;
  tempMinJour: number;
  /** Cumul de pluie de la journée, en mm. */
  cumulPluie?: number;
  prochainsJours: JourPrevu[];
};

export async function fetchMeteo(location: string): Promise<JourMeteo> {
  const res = await fetch(`/api/meteo?location=${encodeURIComponent(location)}`);
  if (!res.ok) {
    throw new Error("Erreur météo");
  }
  return res.json();
}
