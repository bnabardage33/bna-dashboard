export type PeriodeMeteo = { temp: number; vent: number; rafales: number };
export type HeureMeteo = { heure: string; temp: number; vent: number; rafales: number; pluie: number };
export type AlerteMeteo = { niveau: "vert" | "jaune" | "orange" | "rouge"; motif: string };
export type JourMeteo = {
  matin: PeriodeMeteo;
  apresMidi: PeriodeMeteo;
  heures: HeureMeteo[];
  alerte: AlerteMeteo;
};

export async function fetchMeteo(location: string): Promise<JourMeteo> {
  const res = await fetch(`/api/meteo?location=${encodeURIComponent(location)}`);
  if (!res.ok) {
    throw new Error("Erreur météo");
  }
  return res.json();
}
