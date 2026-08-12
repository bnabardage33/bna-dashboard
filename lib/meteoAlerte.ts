export type Materiau = "bois" | "metal" | "composite" | "fibrociment";
export type Acces = "echafaudage" | "nacelle";
export type NiveauAlerte = "vert" | "jaune" | "orange" | "rouge";

const SEUILS_MATERIAUX: Record<
  Materiau,
  { vent_vigilance: number; vent_critique: number; pluie_critique: number; temp_mini: number; temp_maxi: number }
> = {
  bois: { vent_vigilance: 30, vent_critique: 60, pluie_critique: 1.0, temp_mini: 0.0, temp_maxi: 30.0 },
  metal: { vent_vigilance: 25, vent_critique: 45, pluie_critique: 1.0, temp_mini: 0.0, temp_maxi: 35.0 },
  composite: { vent_vigilance: 30, vent_critique: 60, pluie_critique: 1.0, temp_mini: 1.0, temp_maxi: 30.0 },
  fibrociment: { vent_vigilance: 30, vent_critique: 60, pluie_critique: 2.0, temp_mini: 0.0, temp_maxi: 30.0 },
};

const SEUILS_ACCES: Record<Acces, { vent_vigilance: number; vent_critique: number }> = {
  echafaudage: { vent_vigilance: 45, vent_critique: 60 },
  nacelle: { vent_vigilance: 35, vent_critique: 45 },
};

export function evaluerAlerteChantier(
  materiau: Materiau,
  acces: Acces,
  meteo: { rafalesMax: number; pluieCumul: number; tempMax: number }
): { niveau: NiveauAlerte; motif: string } {
  const sm = SEUILS_MATERIAUX[materiau] ?? SEUILS_MATERIAUX.bois;
  const sa = SEUILS_ACCES[acces] ?? SEUILS_ACCES.echafaudage;

  const ventCritique = Math.min(sm.vent_critique, sa.vent_critique);
  const ventVigilance = Math.min(sm.vent_vigilance, sa.vent_vigilance);

  if (meteo.rafalesMax >= ventCritique) {
    return {
      niveau: "rouge",
      motif: `Vent critique (${meteo.rafalesMax} km/h ≥ seuil ${ventCritique} km/h) — pose interdite`,
    };
  }
  if (meteo.pluieCumul >= sm.pluie_critique && meteo.pluieCumul >= 8) {
    return {
      niveau: "rouge",
      motif: `Pluie critique (${meteo.pluieCumul.toFixed(1)} mm) — protection isolant/glissance`,
    };
  }
  if (meteo.tempMax <= sm.temp_mini || meteo.tempMax >= sm.temp_maxi) {
    return {
      niveau: "orange",
      motif: `Température limite (${meteo.tempMax}°C) pour ${materiau}`,
    };
  }
  if (meteo.rafalesMax >= ventVigilance) {
    return {
      niveau: "jaune",
      motif: `Vent de vigilance (${meteo.rafalesMax} km/h) — attention effet voile`,
    };
  }
  return { niveau: "vert", motif: "Conditions optimales de pose" };
}

export const LABELS_MATERIAU: Record<Materiau, string> = {
  bois: "Bois",
  metal: "Métal / Bac acier",
  composite: "Composite",
  fibrociment: "Fibrociment",
};

export const LABELS_ACCES: Record<Acces, string> = {
  echafaudage: "Échafaudage",
  nacelle: "Nacelle",
};
