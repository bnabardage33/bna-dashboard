export type PeriodeMeteo = { temp: number; vent: number; rafales: number };
export type HeureMeteo = { heure: string; temp: number; vent: number; rafales: number; pluie: number };
export type AlerteMeteo = { niveau: "vert" | "jaune" | "orange" | "rouge"; motif: string };
export type JourPrevu = {
  date: string;
  tempMax: number;
  tempMin: number;
  icon: string;
  conditions: string;
  /**
   * Cumul de précipitations de la journée, en mm, tel que fourni par la source
   * (`precipitation_sum` chez Open-Meteo, `precip` journalier chez
   * VisualCrossing). C'est déjà un cumul : il ne doit jamais être additionné.
   * Absent si la source ne le fournit pas.
   */
  cumulPluie?: number;
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
    // La route porte une explication utile — notamment « localisation non
    // validée » avec le code postal attendu. On la propage au lieu de la
    // remplacer par un message générique qui masquerait la cause.
    let message = "Erreur météo";
    try {
      const corps = (await res.json()) as { error?: string };
      if (corps?.error) message = corps.error;
    } catch {
      // Corps non JSON : on garde le message générique.
    }
    throw new Error(message);
  }
  return res.json();
}
