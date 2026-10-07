import { useCallback, useEffect, useRef } from "react";
import type { Module, ModuleGroup, Opening, Percage } from "@/types/calepinage";
import { couleurGroupe as couleurPalette } from "@/lib/calepinage/palette";

// Rendu canvas 2D natif du plan de calepinage.
//
// PERFORMANCE : aucun state React. Tout l'état de vue vit dans des refs, et le
// dessin est déclenché par requestRender() : au plus UN dessin par frame, et
// uniquement si quelque chose a changé (pas de boucle rAF permanente).

/** Module affichable : `repere` (numéro de pièce du moteur) est facultatif. */
export type ModuleAffichable = Module & { repere?: string };

/** État de vue partagé avec useCanvasGestures (mutable, hors React). */
export interface ViewState {
  /** Facteur de zoom utilisateur (1 = vue ajustée), borné à [ZOOM_MIN, ZOOM_MAX]. */
  zoom: number;
  /** Échelle effective en pixels CSS par mm (= baseScale × zoom). */
  scale: number;
  /** Échelle d'ajustement : la zone tient entière dans le canvas (marge 16 px). */
  baseScale: number;
  offsetX: number;
  offsetY: number;
  selectedModuleId: string | null;
  isDragging: boolean;
  isPinching: boolean;
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 5;
const MARGE_PX = 16;

// Palette des groupes : lib/calepinage/palette.ts (partagée avec bordereau et exports).

const COULEUR_ZONE = "#2563eb";
const COULEUR_MODULE_BORD = "#374151";
const COULEUR_COUPE = "#dc2626";
const COULEUR_JOINT = "#d1d5db";
const COULEUR_OUVERTURE = "#9ca3af";
const COULEUR_HACHURE = "#6b7280";
const COULEUR_SELECTION = "#facc15";
const ESPACEMENT_HACHURE = 8;

interface Taille {
  w: number;
  h: number;
  dpr: number;
}

interface Options {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLElement | null>;
  modules: ModuleAffichable[];
  groups: ModuleGroup[];
  openings?: Opening[];
  percages?: Percage[];
  zoneWidthMm: number;
  zoneHeightMm: number;
}

const borne = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function useCanvasRenderer({
  canvasRef,
  containerRef,
  modules,
  groups,
  openings,
  percages,
  zoneWidthMm,
  zoneHeightMm,
}: Options) {
  const viewRef = useRef<ViewState>({
    zoom: 1,
    scale: 1,
    baseScale: 1,
    offsetX: 0,
    offsetY: 0,
    selectedModuleId: null,
    isDragging: false,
    isPinching: false,
  });
  const tailleRef = useRef<Taille | null>(null);
  const modulesRef = useRef<ModuleAffichable[]>([]);
  const ouverturesRef = useRef<Opening[]>([]);
  const percagesRef = useRef<Percage[]>([]);
  const zoneRef = useRef({ w: zoneWidthMm, h: zoneHeightMm });
  const couleursRef = useRef<Map<string, string>>(new Map());
  const groupesRef = useRef<ModuleGroup[]>([]);
  const rafRef = useRef<number | null>(null);

  const couleurGroupe = useCallback((numero: string): string => {
    const cache = couleursRef.current;
    const connue = cache.get(numero);
    if (connue) return connue;

    const couleur = couleurPalette(
      numero,
      groupesRef.current.map((g) => g.group_number),
    );
    cache.set(numero, couleur);
    return couleur;
  }, []);

  /** Recadre la vue : la zone tient entièrement et est centrée. */
  const ajusterVue = useCallback(() => {
    const t = tailleRef.current;
    const { w: zw, h: zh } = zoneRef.current;
    if (!t || !(zw > 0) || !(zh > 0)) return;
    const v = viewRef.current;
    v.baseScale = Math.max(
      1e-6,
      Math.min((t.w - 2 * MARGE_PX) / zw, (t.h - 2 * MARGE_PX) / zh)
    );
    v.zoom = 1;
    v.scale = v.baseScale;
    v.offsetX = (t.w - zw * v.scale) / 2;
    v.offsetY = (t.h - zh * v.scale) / 2;
  }, []);

  /**
   * Empêche de panner dans le vide : le contour de la zone reste visible.
   * Zone plus petite que la vue sur un axe → centrée ; sinon ses bords ne
   * peuvent pas s'éloigner de plus de MARGE_PX à l'intérieur de la vue.
   */
  const limiterVue = useCallback(() => {
    const t = tailleRef.current;
    if (!t) return;
    const v = viewRef.current;
    const zw = zoneRef.current.w * v.scale;
    const zh = zoneRef.current.h * v.scale;
    v.offsetX =
      zw + 2 * MARGE_PX <= t.w
        ? (t.w - zw) / 2
        : borne(v.offsetX, t.w - zw - MARGE_PX, MARGE_PX);
    v.offsetY =
      zh + 2 * MARGE_PX <= t.h
        ? (t.h - zh) / 2
        : borne(v.offsetY, t.h - zh - MARGE_PX, MARGE_PX);
  }, []);

  const dessiner = useCallback(() => {
    const canvas = canvasRef.current;
    const t = tailleRef.current;
    if (!canvas || !t) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w: cw, h: ch, dpr } = t;
    const v = viewRef.current;
    const s = v.scale;
    const ox = v.offsetX;
    const oy = v.offsetY;
    const zw = zoneRef.current.w;
    const zh = zoneRef.current.h;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    if (!(zw > 0) || !(zh > 0)) return;

    const mods = modulesRef.current;
    const visible = (x: number, y: number, w: number, h: number) =>
      x + w > 0 && x < cw && y + h > 0 && y < ch;

    // 1. Fond de la zone
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(ox, oy, zw * s, zh * s);

    // 2. Joints : arêtes des modules, gris clair 1 px (visibles sous les modules à 0,85)
    ctx.lineWidth = 1;
    ctx.strokeStyle = COULEUR_JOINT;
    ctx.beginPath();
    for (const m of mods) {
      const x = ox + m.x_mm * s;
      const y = oy + m.y_mm * s;
      const w = m.width_mm * s;
      const h = m.height_mm * s;
      if (visible(x, y, w, h)) ctx.rect(x, y, w, h);
    }
    ctx.stroke();

    // 3. Remplissage des modules (couleur du groupe, opacité 0,85)
    ctx.globalAlpha = 0.85;
    for (const m of mods) {
      const x = ox + m.x_mm * s;
      const y = oy + m.y_mm * s;
      const w = m.width_mm * s;
      const h = m.height_mm * s;
      if (!visible(x, y, w, h)) continue;
      ctx.fillStyle = couleurGroupe(m.group_number);
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;

    // 4. Ouvertures : gris + hachures diagonales de 8 px (au-dessus des modules)
    for (const o of ouverturesRef.current) {
      const x = ox + o.x_mm * s;
      const y = oy + o.y_mm * s;
      const w = o.width_mm * s;
      const h = o.height_mm * s;
      if (!visible(x, y, w, h)) continue;

      ctx.fillStyle = COULEUR_OUVERTURE;
      ctx.fillRect(x, y, w, h);

      // Hachures limitées à la partie visible (zoom 5× : évite des milliers de traits).
      const ix0 = Math.max(x, 0);
      const iy0 = Math.max(y, 0);
      const ix1 = Math.min(x + w, cw);
      const iy1 = Math.min(y + h, ch);
      ctx.save();
      ctx.beginPath();
      ctx.rect(ix0, iy0, ix1 - ix0, iy1 - iy0);
      ctx.clip();
      ctx.beginPath();
      const debut = Math.ceil((ix0 + iy0) / ESPACEMENT_HACHURE) * ESPACEMENT_HACHURE;
      for (let c = debut; c <= ix1 + iy1; c += ESPACEMENT_HACHURE) {
        ctx.moveTo(c - iy1, iy1);
        ctx.lineTo(c - iy0, iy0);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = COULEUR_HACHURE;
      ctx.stroke();
      ctx.restore();

      ctx.lineWidth = 1;
      ctx.strokeStyle = COULEUR_HACHURE;
      ctx.strokeRect(x, y, w, h);
    }

    // 5. Bordures des modules : normales (gris foncé 1 px) puis coupes (rouge 2 px)
    ctx.lineWidth = 1;
    ctx.strokeStyle = COULEUR_MODULE_BORD;
    ctx.beginPath();
    for (const m of mods) {
      if (m.is_cut) continue;
      const x = ox + m.x_mm * s;
      const y = oy + m.y_mm * s;
      const w = m.width_mm * s;
      const h = m.height_mm * s;
      if (visible(x, y, w, h)) ctx.rect(x, y, w, h);
    }
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = COULEUR_COUPE;
    ctx.beginPath();
    for (const m of mods) {
      if (!m.is_cut) continue;
      const x = ox + m.x_mm * s;
      const y = oy + m.y_mm * s;
      const w = m.width_mm * s;
      const h = m.height_mm * s;
      if (visible(x, y, w, h)) ctx.rect(x, y, w, h);
    }
    ctx.stroke();

    // 6. Libellés, icône « coupe » et « F » (retourné sous-face)
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const m of mods) {
      const x = ox + m.x_mm * s;
      const y = oy + m.y_mm * s;
      const w = m.width_mm * s;
      const h = m.height_mm * s;
      if (!visible(x, y, w, h) || w < 14 || h < 12) continue;

      // Taille auto 10–16 px ; texte tronqué (…) s'il dépasse la largeur du module.
      const libelle = m.repere ?? m.group_number;
      const taille = borne(Math.min(w / (libelle.length * 0.6 + 1), h * 0.5), 10, 16);
      const maxCar = Math.floor((w - 4) / (taille * 0.6));
      if (maxCar >= 2) {
        const texte =
          libelle.length > maxCar ? `${libelle.slice(0, maxCar - 1)}…` : libelle;
        ctx.font = `600 ${taille}px system-ui, sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(texte, x + w / 2, y + h / 2);
      }

      if (m.is_cut && w >= 24 && h >= 24) {
        const sz = Math.min(10, w * 0.25);
        const x1 = x + w - 4 - sz;
        const y1 = y + 4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + sz, y1 + sz);
        ctx.moveTo(x1 + sz, y1);
        ctx.lineTo(x1, y1 + sz);
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = COULEUR_COUPE;
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }

      if (m.is_flipped && w >= 24 && h >= 24) {
        ctx.font = "700 10px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#ffffff";
        ctx.strokeText("F", x + 4, y + 3);
        ctx.fillStyle = COULEUR_COUPE;
        ctx.fillText("F", x + 4, y + 3);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
      }
    }

    // 6b. Perçages (visibles uniquement au zoom > 1.5x)
    if (v.zoom > 1.5 && percagesRef.current.length > 0) {
      const modsMap = new Map(mods.map((mod) => [mod.id, mod]));
      for (const p of percagesRef.current) {
        const mod = modsMap.get(p.module_id);
        if (!mod) continue;
        const px = ox + (mod.x_mm + p.x_mm) * s;
        const py = oy + (mod.y_mm + p.y_mm) * s;
        if (!visible(px - 6, py - 6, 12, 12)) continue;

        const r = Math.max(2, Math.min(4.5, ((p.diameter_mm || 6) * s) / 2));
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = "#111827";
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();

        if (p.type === "coulissante") {
          ctx.beginPath();
          ctx.moveTo(px - r - 1.5, py);
          ctx.lineTo(px + r + 1.5, py);
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
        }
      }
    }

    // 7. Contour de la zone : bleu 3 px
    ctx.lineWidth = 3;
    ctx.strokeStyle = COULEUR_ZONE;
    ctx.strokeRect(ox, oy, zw * s, zh * s);

    // 8. Module sélectionné
    if (v.selectedModuleId) {
      const m = mods.find((mod) => mod.id === v.selectedModuleId);
      if (m) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = COULEUR_SELECTION;
        ctx.strokeRect(ox + m.x_mm * s, oy + m.y_mm * s, m.width_mm * s, m.height_mm * s);
      }
    }
  }, [canvasRef, couleurGroupe]);

  /** Demande un dessin à la prochaine frame (regroupe les demandes multiples). */
  const requestRender = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      dessiner();
    });
  }, [dessiner]);

  /** Applique zoom + décalage (bornés) puis redessine. */
  const applyView = useCallback(
    (zoom: number, offsetX: number, offsetY: number) => {
      const v = viewRef.current;
      v.zoom = borne(zoom, ZOOM_MIN, ZOOM_MAX);
      v.scale = v.baseScale * v.zoom;
      v.offsetX = offsetX;
      v.offsetY = offsetY;
      limiterVue();
      requestRender();
    },
    [limiterVue, requestRender]
  );

  const resetView = useCallback(() => {
    ajusterVue();
    requestRender();
  }, [ajusterVue, requestRender]);

  /** Module sous le point (x, y) en pixels CSS du canvas — coordonnées inverses de scale + offset. */
  const hitTest = useCallback((x: number, y: number): ModuleAffichable | null => {
    const v = viewRef.current;
    const wx = (x - v.offsetX) / v.scale;
    const wy = (y - v.offsetY) / v.scale;
    const mods = modulesRef.current;
    for (let i = mods.length - 1; i >= 0; i--) {
      const m = mods[i];
      if (
        wx >= m.x_mm &&
        wx <= m.x_mm + m.width_mm &&
        wy >= m.y_mm &&
        wy <= m.y_mm + m.height_mm
      ) {
        return m;
      }
    }
    return null;
  }, []);

  // Données : stockées dans des refs, aucun re-render n'est nécessaire pour redessiner.
  useEffect(() => {
    modulesRef.current = modules;
    ouverturesRef.current = openings ?? [];
    percagesRef.current = percages ?? [];
    groupesRef.current = groups;
    couleursRef.current = new Map();
    requestRender();
  }, [modules, groups, openings, percages, requestRender]);

  // Dimensions de la zone : nouveau cadrage.
  useEffect(() => {
    zoneRef.current = { w: zoneWidthMm, h: zoneHeightMm };
    ajusterVue();
    requestRender();
  }, [zoneWidthMm, zoneHeightMm, ajusterVue, requestRender]);

  // Taille du canvas : DPR + redimensionnement (conteneur et fenêtre).
  useEffect(() => {
    const canvas = canvasRef.current;
    const conteneur = containerRef.current;
    if (!canvas || !conteneur) return;

    const mesurer = () => {
      const w = conteneur.clientWidth;
      const h = conteneur.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const avant = tailleRef.current;
      if (avant && avant.w === w && avant.h === h && avant.dpr === dpr) return;

      const v = viewRef.current;
      // Point du plan au centre de la vue avant redimensionnement.
      const centreX = avant ? (avant.w / 2 - v.offsetX) / v.scale : 0;
      const centreY = avant ? (avant.h / 2 - v.offsetY) / v.scale : 0;

      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      tailleRef.current = { w, h, dpr };

      if (!avant) {
        ajusterVue();
      } else {
        // Nouveau fit, en conservant le zoom utilisateur et le point visé.
        const zoom = v.zoom;
        ajusterVue();
        v.zoom = zoom;
        v.scale = v.baseScale * zoom;
        v.offsetX = w / 2 - centreX * v.scale;
        v.offsetY = h / 2 - centreY * v.scale;
        limiterVue();
      }
      requestRender();
    };

    mesurer();
    const observer = new ResizeObserver(mesurer);
    observer.observe(conteneur);
    window.addEventListener("resize", mesurer);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", mesurer);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [canvasRef, containerRef, ajusterVue, limiterVue, requestRender]);

  return { viewRef, requestRender, applyView, resetView, hitTest };
}
