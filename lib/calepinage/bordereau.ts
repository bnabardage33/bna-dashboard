// Calculs du bordereau de débit — module PUR (aucune dépendance serveur ni DOM),
// utilisable aussi bien par le composant client que par les exports serveur :
// les chiffres affichés à l'écran et ceux des fichiers viennent de la même source.

import type { Module, ModuleGroup, Treatment } from "@/types/calepinage";

export const arrondi2 = (v: number): number => Math.round(v * 100) / 100;

/** Surface TOTALE d'un groupe (largeur × hauteur × quantité), en m². */
export const surfaceGroupeM2 = (g: Pick<ModuleGroup, "width_mm" | "height_mm" | "count">): number =>
  (g.width_mm * g.height_mm * g.count) / 1_000_000;

export const LIBELLE_TRAITEMENT: Record<Treatment, string> = {
  none: "Aucun",
  "bird-beak": "Bec d'oiseau",
  miter: "Onglet",
  bevel: "Biseau",
};

export const libelleTraitement = (t: Treatment): string => LIBELLE_TRAITEMENT[t] ?? t;

export const libelleMateriau = (m: string): string => (m === "default" ? "Par défaut" : m);

/** Nombre de modules coupés (`is_cut`) par numéro de groupe. */
export function modulesCoupesParGroupe(modules: readonly Module[]): Map<string, number> {
  const res = new Map<string, number>();
  for (const m of modules) {
    if (m.is_cut) res.set(m.group_number, (res.get(m.group_number) ?? 0) + 1);
  }
  return res;
}

export interface LigneBordereau {
  groupNumber: string;
  quantite: number;
  largeurMm: number;
  hauteurMm: number;
  surfaceM2: number;
  traitement: string;
  materiau: string;
  /** Nombre de modules coupés de ce groupe (0 = aucun). */
  nbCoupes: number;
}

/** Lignes du bordereau, triées par numéro de groupe. */
export function lignesBordereau(
  groups: readonly ModuleGroup[],
  modules: readonly Module[],
): LigneBordereau[] {
  const coupes = modulesCoupesParGroupe(modules);
  return [...groups]
    .sort((a, b) => a.group_number.localeCompare(b.group_number, "fr", { numeric: true }))
    .map((g) => ({
      groupNumber: g.group_number,
      quantite: g.count,
      largeurMm: g.width_mm,
      hauteurMm: g.height_mm,
      surfaceM2: arrondi2(surfaceGroupeM2(g)),
      traitement: libelleTraitement(g.treatment),
      materiau: libelleMateriau(g.material),
      nbCoupes: coupes.get(g.group_number) ?? 0,
    }));
}

export interface TotauxBordereau {
  /** Somme des quantités de tous les groupes. */
  nbModules: number;
  /** Surface totale en m² (somme exacte, arrondie une seule fois à la fin). */
  surfaceM2: number;
  nbGroupes: number;
}

export function totauxBordereau(groups: readonly ModuleGroup[]): TotauxBordereau {
  let nbModules = 0;
  let surface = 0;
  for (const g of groups) {
    nbModules += g.count;
    surface += surfaceGroupeM2(g);
  }
  return { nbModules, surfaceM2: arrondi2(surface), nbGroupes: groups.length };
}

/** « 9,00 m² » (format français). */
export const formaterSurface = (m2: number): string =>
  `${m2.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
