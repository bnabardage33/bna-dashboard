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
export type JourMeteo = {
  matin: PeriodeMeteo;
  apresMidi: PeriodeMeteo;
  heures: HeureMeteo[];
  alerte: AlerteMeteo;
  icon: string;
  conditions: string;
  tempActuelle: number;
  tempMaxJour: number;
  tempMinJour: number;
  prochainsJours: JourPrevu[];
};

export async function fetchMeteo(location: string): Promise<JourMeteo> {
  const res = await fetch(`/api/meteo?location=${encodeURIComponent(location)}`);
  if (!res.ok) {
    throw new Error("Erreur météo");
  }
  return res.json();
}
