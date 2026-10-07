import { useEffect } from "react";
import { ZOOM_MAX, ZOOM_MIN, type ViewState } from "@/hooks/calepinage/useCanvasRenderer";

// Gestes tactiles natifs (Pointer Events) du plan de calepinage :
//   - 1 doigt : pan avec inertie (300 ms) ;
//   - 2 doigts : pinch-to-zoom autour du centre des doigts (+ pan du centre) ;
//   - tap : sélection ; double-tap : retour à la vue ajustée.
// Aucun état React : tout passe par `viewRef` et par les callbacks du renderer.

const SEUIL_DEPLACEMENT_PX = 10; // au-delà : ce n'est plus un tap
const DUREE_TAP_MS = 250;
const DELAI_DOUBLE_TAP_MS = 300;
const DISTANCE_DOUBLE_TAP_PX = 30;
const DUREE_INERTIE_MS = 300;
const VITESSE_MIN_PX_MS = 0.05;
const FENETRE_VITESSE_MS = 100;

interface Options {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  viewRef: React.RefObject<ViewState>;
  applyView: (zoom: number, offsetX: number, offsetY: number) => void;
  resetView: () => void;
  /** Tap simple, en pixels CSS relatifs au canvas. */
  onTap: (x: number, y: number) => void;
}

interface Point {
  x: number;
  y: number;
}

const borne = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function useCanvasGestures({ canvasRef, viewRef, applyView, resetView, onTap }: Options) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pointeurs = new Map<number, Point>();
    let pincement: { d0: number; zoom0: number; mondeX: number; mondeY: number } | null = null;
    let tap: { t: number; x: number; y: number; valide: boolean } | null = null;
    let dernierTap: { t: number; x: number; y: number } | null = null;
    let derniereX = 0;
    let derniereY = 0;
    let echantillons: { t: number; x: number; y: number }[] = [];
    let rafInertie: number | null = null;

    const position = (e: PointerEvent): Point => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const deuxPremiers = (): [Point, Point] => {
      const it = pointeurs.values();
      return [it.next().value as Point, it.next().value as Point];
    };

    const arreterInertie = () => {
      if (rafInertie !== null) {
        cancelAnimationFrame(rafInertie);
        rafInertie = null;
      }
    };

    const demarrerInertie = () => {
      const fin = echantillons[echantillons.length - 1];
      const debut = echantillons.find((p) => fin.t - p.t <= FENETRE_VITESSE_MS);
      if (!fin || !debut || fin.t === debut.t) return;
      let vx = (fin.x - debut.x) / (fin.t - debut.t);
      let vy = (fin.y - debut.y) / (fin.t - debut.t);
      if (Math.hypot(vx, vy) < VITESSE_MIN_PX_MS) return;

      const t0 = performance.now();
      let precedent = t0;
      const pas = (now: number) => {
        const ecoule = now - t0;
        const dt = now - precedent;
        precedent = now;
        if (ecoule >= DUREE_INERTIE_MS) {
          rafInertie = null;
          return;
        }
        // Décélération linéaire jusqu'à l'arrêt à 300 ms.
        const facteur = 1 - ecoule / DUREE_INERTIE_MS;
        const v = viewRef.current;
        const avantX = v.offsetX;
        const avantY = v.offsetY;
        applyView(v.zoom, v.offsetX + vx * dt * facteur, v.offsetY + vy * dt * facteur);
        // Bord atteint sur un axe : on coupe la vitesse correspondante.
        if (v.offsetX === avantX) vx = 0;
        if (v.offsetY === avantY) vy = 0;
        if (vx === 0 && vy === 0) {
          rafInertie = null;
          return;
        }
        rafInertie = requestAnimationFrame(pas);
      };
      rafInertie = requestAnimationFrame(pas);
    };

    const auDebut = (e: PointerEvent) => {
      if (pointeurs.size >= 2) return;
      e.preventDefault();
      arreterInertie();
      canvas.setPointerCapture(e.pointerId);
      const p = position(e);
      pointeurs.set(e.pointerId, p);
      const v = viewRef.current;

      if (pointeurs.size === 1) {
        tap = { t: e.timeStamp, x: p.x, y: p.y, valide: true };
        derniereX = p.x;
        derniereY = p.y;
        echantillons = [{ t: e.timeStamp, x: p.x, y: p.y }];
      } else {
        // 2e doigt : début du pincement, ancré sur le point du plan sous le centre.
        if (tap) tap.valide = false;
        const [a, b] = deuxPremiers();
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        pincement = {
          d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          zoom0: v.zoom,
          mondeX: (cx - v.offsetX) / v.scale,
          mondeY: (cy - v.offsetY) / v.scale,
        };
        v.isPinching = true;
        v.isDragging = false;
      }
    };

    const auDeplacement = (e: PointerEvent) => {
      if (!pointeurs.has(e.pointerId)) return;
      e.preventDefault();
      const p = position(e);
      pointeurs.set(e.pointerId, p);
      const v = viewRef.current;

      if (pincement && pointeurs.size === 2) {
        const [a, b] = deuxPremiers();
        const zoom = borne(
          (pincement.zoom0 * Math.hypot(a.x - b.x, a.y - b.y)) / pincement.d0,
          ZOOM_MIN,
          ZOOM_MAX
        );
        const echelle = v.baseScale * zoom;
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        // Le point du plan ancré reste sous le centre des doigts (zoom + pan à 2 doigts).
        applyView(zoom, cx - pincement.mondeX * echelle, cy - pincement.mondeY * echelle);
        return;
      }

      if (pointeurs.size !== 1) return;

      if (tap?.valide && Math.hypot(p.x - tap.x, p.y - tap.y) > SEUIL_DEPLACEMENT_PX) {
        tap.valide = false;
        v.isDragging = true;
      }
      if (!v.isDragging) return;

      applyView(v.zoom, v.offsetX + (p.x - derniereX), v.offsetY + (p.y - derniereY));
      derniereX = p.x;
      derniereY = p.y;
      echantillons.push({ t: e.timeStamp, x: p.x, y: p.y });
      if (echantillons.length > 8) echantillons.shift();
    };

    const alaFin = (e: PointerEvent, annule: boolean) => {
      if (!pointeurs.has(e.pointerId)) return;
      pointeurs.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      const v = viewRef.current;

      if (pincement) {
        pincement = null;
        v.isPinching = false;
        if (pointeurs.size === 1) {
          // Un doigt reste : le pan reprend là où il est, sans saut.
          const reste = pointeurs.values().next().value as Point;
          derniereX = reste.x;
          derniereY = reste.y;
          echantillons = [];
          v.isDragging = true;
        }
        return;
      }

      if (pointeurs.size > 0) return;

      const etaitTap = tap?.valide === true;
      const infoTap = tap;
      tap = null;

      if (v.isDragging) {
        v.isDragging = false;
        if (!annule) demarrerInertie();
        return;
      }

      if (!annule && etaitTap && infoTap && e.timeStamp - infoTap.t <= DUREE_TAP_MS) {
        const apres = e.timeStamp;
        if (
          dernierTap &&
          apres - dernierTap.t <= DELAI_DOUBLE_TAP_MS &&
          Math.hypot(infoTap.x - dernierTap.x, infoTap.y - dernierTap.y) <= DISTANCE_DOUBLE_TAP_PX
        ) {
          dernierTap = null;
          resetView();
        } else {
          dernierTap = { t: apres, x: infoTap.x, y: infoTap.y };
          onTap(infoTap.x, infoTap.y);
        }
      }
    };

    const auRelache = (e: PointerEvent) => alaFin(e, false);
    const auAnnule = (e: PointerEvent) => alaFin(e, true);
    // Évite le menu contextuel d'un appui long sur mobile.
    const sansMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener("pointerdown", auDebut);
    canvas.addEventListener("pointermove", auDeplacement);
    canvas.addEventListener("pointerup", auRelache);
    canvas.addEventListener("pointercancel", auAnnule);
    canvas.addEventListener("contextmenu", sansMenu);

    return () => {
      arreterInertie();
      canvas.removeEventListener("pointerdown", auDebut);
      canvas.removeEventListener("pointermove", auDeplacement);
      canvas.removeEventListener("pointerup", auRelache);
      canvas.removeEventListener("pointercancel", auAnnule);
      canvas.removeEventListener("contextmenu", sansMenu);
    };
  }, [canvasRef, viewRef, applyView, resetView, onTap]);
}
