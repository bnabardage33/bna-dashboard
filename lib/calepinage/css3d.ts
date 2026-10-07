// Helpers de calcul des transforms CSS 3D de la vue façade — module PUR (aucun DOM).
// Aucune librairie 3D : on reproduit à la main ce que fait le navigateur pour
// `perspective` + `rotateX` + `rotateY` + `scale`, afin de pouvoir faire le hit-test
// (tap → module) et le culling (modules hors écran) sans toucher au DOM.
//
// Repère : origine = CENTRE de la scène (= centre du conteneur), x vers la droite,
// y vers le bas, z vers l'observateur. Unités : pixels CSS.

import type { Module, ModuleGroup } from "@/types/calepinage";
import { couleurGroupe } from "@/lib/calepinage/palette";

export const PERSPECTIVE_PX = 1200;
export const ROTATION_X_MAX = 60;
export const ROTATION_Y_MAX = 180;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
/** Part du conteneur occupée par la façade (le reste = marge). */
export const FACTEUR_MARGE = 0.8;
/** Plafond d'éléments DOM dans le conteneur ; au-delà : « Vue simplifiée ». */
export const MAX_ELEMENTS_DOM = 200;
/** Éléments fixes du conteneur : scène, mur, balise <style>. */
export const ELEMENTS_FIXES = 3;
/** Profondeurs (px) : mur 0, ouvertures 1, modules 2. */
export const Z_MUR = 0;
export const Z_OUVERTURE = 1;
export const Z_MODULE = 2;

export interface Vue3D {
  /** Degrés, [-ROTATION_X_MAX, +ROTATION_X_MAX]. */
  rotateX: number;
  /** Degrés, [-ROTATION_Y_MAX, +ROTATION_Y_MAX]. */
  rotateY: number;
  /** [ZOOM_MIN, ZOOM_MAX]. */
  zoom: number;
}

export const VUE_DE_FACE: Readonly<Vue3D> = { rotateX: 0, rotateY: 0, zoom: 1 };

export const borne = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

/** Ramène une vue dans ses bornes. */
export const bornerVue = (v: Vue3D): Vue3D => ({
  rotateX: borne(v.rotateX, -ROTATION_X_MAX, ROTATION_X_MAX),
  rotateY: borne(v.rotateY, -ROTATION_Y_MAX, ROTATION_Y_MAX),
  zoom: borne(v.zoom, ZOOM_MIN, ZOOM_MAX),
});

/** Pixels par mm : la façade tient dans 80 % du conteneur. 0 si dimensions invalides. */
export function echelleScene(
  conteneurLargeur: number,
  conteneurHauteur: number,
  zoneLargeurMm: number,
  zoneHauteurMm: number,
): number {
  if (!(zoneLargeurMm > 0) || !(zoneHauteurMm > 0)) return 0;
  if (!(conteneurLargeur > 0) || !(conteneurHauteur > 0)) return 0;
  return Math.min(conteneurLargeur / zoneLargeurMm, conteneurHauteur / zoneHauteurMm) * FACTEUR_MARGE;
}

/** Valeur CSS `transform` de la scène (rotation autour de son centre, puis zoom). */
export const transformScene = (v: Vue3D): string =>
  `rotateX(${v.rotateX.toFixed(2)}deg) rotateY(${v.rotateY.toFixed(2)}deg) scale(${v.zoom.toFixed(4)})`;

export const transformProfondeur = (z: number): string => `translateZ(${z}px)`;

// ── Géométrie ────────────────────────────────────────────────────────────────

type V3 = readonly [number, number, number];
const rad = (deg: number): number => (deg * Math.PI) / 180;

// Mêmes matrices que CSS rotateX(a) / rotateY(a).
function rotX([x, y, z]: V3, deg: number): V3 {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [x, y * c - z * s, y * s + z * c];
}
function rotY([x, y, z]: V3, deg: number): V3 {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [x * c + z * s, y, -x * s + z * c];
}

/**
 * Projette un point de la scène (px, relatif au centre, z = profondeur locale)
 * vers l'écran (px, relatif au centre du conteneur). `null` si le point est
 * derrière l'observateur. CSS : `rotateX rotateY scale` appliqués dans cet ordre
 * à droite, perspective centrée sur le conteneur.
 */
export function projeter(
  x: number,
  y: number,
  z: number,
  vue: Vue3D,
  d: number = PERSPECTIVE_PX,
): { x: number; y: number } | null {
  const p = rotX(rotY([x * vue.zoom, y * vue.zoom, z * vue.zoom], vue.rotateY), vue.rotateX);
  const profondeur = d - p[2];
  if (profondeur <= 0) return null;
  const f = d / profondeur;
  return { x: p[0] * f, y: p[1] * f };
}

/**
 * Inverse de `projeter` pour le plan du mur (z = 0) : quel point du mur (px,
 * relatif au centre de la scène, avant zoom) se trouve sous le point d'écran
 * (sx, sy, relatif au centre du conteneur) ? Intersection rayon / plan.
 * `null` si le rayon est parallèle au mur ou le mur derrière l'observateur.
 */
export function ecranVersMur(
  sx: number,
  sy: number,
  vue: Vue3D,
  d: number = PERSPECTIVE_PX,
): { x: number; y: number } | null {
  const n = rotX(rotY([0, 0, 1], vue.rotateY), vue.rotateX); // normale du mur
  const denom = n[0] * sx + n[1] * sy - n[2] * d;
  if (Math.abs(denom) < 1e-9) return null;
  const t = (n[2] * d) / -denom; // E = (0,0,d), D = (sx, sy, -d)
  if (t <= 0) return null;
  const P: V3 = [t * sx, t * sy, d + t * -d];
  const q = rotY(rotX(P, -vue.rotateX), -vue.rotateY);
  return { x: q[0] / vue.zoom, y: q[1] / vue.zoom };
}

interface RectMm {
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
}

/** Module le plus au-dessus (dernier de la liste) contenant le point (mm, coin sup. gauche de la zone). */
export function moduleSousPointMm<T extends RectMm>(modules: readonly T[], xMm: number, yMm: number): T | null {
  for (let i = modules.length - 1; i >= 0; i--) {
    const m = modules[i];
    if (xMm >= m.x_mm && xMm <= m.x_mm + m.width_mm && yMm >= m.y_mm && yMm <= m.y_mm + m.height_mm) {
      return m;
    }
  }
  return null;
}

/**
 * Hit-test d'un tap : (sx, sy) en px relatifs au centre du conteneur → module touché.
 * `echelle` = px par mm ; la zone est centrée sur la scène.
 */
export function moduleSousTap<T extends RectMm>(
  modules: readonly T[],
  sx: number,
  sy: number,
  vue: Vue3D,
  echelle: number,
  zoneLargeurMm: number,
  zoneHauteurMm: number,
): T | null {
  if (!(echelle > 0)) return null;
  const mur = ecranVersMur(sx, sy, vue);
  if (!mur) return null;
  return moduleSousPointMm(
    modules,
    mur.x / echelle + zoneLargeurMm / 2,
    mur.y / echelle + zoneHauteurMm / 2,
  );
}

/** Vrai si le rectangle (mm) projeté touche le viewport (conteneur w × h, marge en px). */
export function rectVisible(
  r: RectMm,
  z: number,
  vue: Vue3D,
  echelle: number,
  zoneLargeurMm: number,
  zoneHauteurMm: number,
  conteneurLargeur: number,
  conteneurHauteur: number,
  margePx = 16,
): boolean {
  const x0 = (r.x_mm - zoneLargeurMm / 2) * echelle;
  const y0 = (r.y_mm - zoneHauteurMm / 2) * echelle;
  const x1 = x0 + r.width_mm * echelle;
  const y1 = y0 + r.height_mm * echelle;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [cx, cy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as const) {
    const p = projeter(cx, cy, z, vue);
    // Un coin derrière l'observateur : on garde le module (cas rare, jamais faux négatif).
    if (!p) return true;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const demiL = conteneurLargeur / 2 + margePx;
  const demiH = conteneurHauteur / 2 + margePx;
  return maxX >= -demiL && minX <= demiL && maxY >= -demiH && minY <= demiH;
}

// ── Budget DOM et mode simplifié ─────────────────────────────────────────────

/** Éléments DOM du conteneur en mode complet : fixes + ouvertures + modules. */
export const elementsModeComplet = (nbModules: number, nbOuvertures: number): number =>
  ELEMENTS_FIXES + nbModules + nbOuvertures;

export const doitSimplifier = (nbModules: number, nbOuvertures: number): boolean =>
  elementsModeComplet(nbModules, nbOuvertures) > MAX_ELEMENTS_DOM;

export interface RectGroupe {
  groupNumber: string;
  couleur: string;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
}

/** Contour (boîte englobante) de chaque groupe, pour la vue simplifiée. */
export function rectanglesGroupes(
  modules: readonly Pick<Module, "group_number" | "x_mm" | "y_mm" | "width_mm" | "height_mm">[],
  groups: readonly Pick<ModuleGroup, "group_number">[],
): RectGroupe[] {
  const numeros = groups.map((g) => g.group_number);
  const boites = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  for (const m of modules) {
    const b = boites.get(m.group_number);
    const x1 = m.x_mm + m.width_mm;
    const y1 = m.y_mm + m.height_mm;
    if (!b) boites.set(m.group_number, { x0: m.x_mm, y0: m.y_mm, x1, y1 });
    else {
      b.x0 = Math.min(b.x0, m.x_mm);
      b.y0 = Math.min(b.y0, m.y_mm);
      b.x1 = Math.max(b.x1, x1);
      b.y1 = Math.max(b.y1, y1);
    }
  }
  return [...boites.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "fr", { numeric: true }))
    .map(([groupNumber, b]) => ({
      groupNumber,
      couleur: couleurGroupe(groupNumber, numeros),
      x_mm: b.x0,
      y_mm: b.y0,
      width_mm: b.x1 - b.x0,
      height_mm: b.y1 - b.y0,
    }));
}
