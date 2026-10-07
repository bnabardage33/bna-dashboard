import { useEffect } from "react";
import {
  ROTATION_X_MAX,
  ROTATION_Y_MAX,
  ZOOM_MAX,
  ZOOM_MIN,
  borne,
  type Vue3D,
} from "@/lib/calepinage/css3d";

// Gestes tactiles natifs (Pointer Events) de la vue 3D de la façade :
//   - 1 doigt : rotation (horizontal = rotateY ±180°, vertical = rotateX ±60°)
//     avec inertie de 400 ms ;
//   - 2 doigts : pinch-to-zoom (0,5 → 3) autour du centre de la scène ;
//   - tap : sélection ; double-tap : retour à la vue de face.
// Aucun état React : la vue vit dans `viewRef` et est appliquée au DOM par `applyView`.

const DEG_PAR_PX = 0.5;
const SEUIL_DEPLACEMENT_PX = 10; // au-delà : ce n'est plus un tap
const DUREE_TAP_MS = 250;
const DELAI_DOUBLE_TAP_MS = 300;
const DISTANCE_DOUBLE_TAP_PX = 30;
const DUREE_INERTIE_MS = 400;
const VITESSE_MIN_DEG_MS = 0.02;
const FENETRE_VITESSE_MS = 100;

interface Options {
  surfaceRef: React.RefObject<HTMLElement | null>;
  viewRef: React.RefObject<Vue3D>;
  applyView: (rotateX: number, rotateY: number, zoom: number) => void;
  resetView: () => void;
  /** Tap simple, en pixels CSS relatifs à la surface. */
  onTap: (x: number, y: number) => void;
}

interface Point {
  x: number;
  y: number;
}

export function use3DGestures({ surfaceRef, viewRef, applyView, resetView, onTap }: Options) {
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const pointeurs = new Map<number, Point>();
    let d0 = 0;
    let zoom0 = 1;
    let pincement = false;
    let tap: { t: number; x: number; y: number; valide: boolean } | null = null;
    let dernierTap: { t: number; x: number; y: number } | null = null;
    let rotation = false;
    let derniere: Point = { x: 0, y: 0 };
    let echantillons: { t: number; x: number; y: number }[] = [];
    let rafInertie: number | null = null;

    const position = (e: PointerEvent): Point => {
      const r = surface.getBoundingClientRect();
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
      const debut = echantillons.find((p) => fin && fin.t - p.t <= FENETRE_VITESSE_MS);
      if (!fin || !debut || fin.t === debut.t) return;
      // Vitesses angulaires (°/ms) : horizontal → rotateY, vertical → rotateX (inversé).
      let vy = ((fin.x - debut.x) / (fin.t - debut.t)) * DEG_PAR_PX;
      let vx = (-(fin.y - debut.y) / (fin.t - debut.t)) * DEG_PAR_PX;
      if (Math.hypot(vx, vy) < VITESSE_MIN_DEG_MS) return;

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
        // Décélération linéaire jusqu'à l'arrêt à 400 ms.
        const facteur = 1 - ecoule / DUREE_INERTIE_MS;
        const v = viewRef.current;
        const rx = borne(v.rotateX + vx * dt * facteur, -ROTATION_X_MAX, ROTATION_X_MAX);
        const ry = borne(v.rotateY + vy * dt * facteur, -ROTATION_Y_MAX, ROTATION_Y_MAX);
        // Butée atteinte sur un axe : on coupe la vitesse correspondante.
        if (rx === v.rotateX) vx = 0;
        if (ry === v.rotateY) vy = 0;
        applyView(rx, ry, v.zoom);
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
      surface.setPointerCapture(e.pointerId);
      const p = position(e);
      pointeurs.set(e.pointerId, p);

      if (pointeurs.size === 1) {
        tap = { t: e.timeStamp, x: p.x, y: p.y, valide: true };
        derniere = p;
        echantillons = [{ t: e.timeStamp, x: p.x, y: p.y }];
      } else {
        if (tap) tap.valide = false;
        const [a, b] = deuxPremiers();
        d0 = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        zoom0 = viewRef.current.zoom;
        pincement = true;
        rotation = false;
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
        const zoom = borne((zoom0 * Math.hypot(a.x - b.x, a.y - b.y)) / d0, ZOOM_MIN, ZOOM_MAX);
        applyView(v.rotateX, v.rotateY, zoom);
        return;
      }

      if (pointeurs.size !== 1) return;

      if (tap?.valide && Math.hypot(p.x - tap.x, p.y - tap.y) > SEUIL_DEPLACEMENT_PX) {
        tap.valide = false;
        rotation = true;
      }
      if (!rotation) return;

      applyView(
        borne(v.rotateX - (p.y - derniere.y) * DEG_PAR_PX, -ROTATION_X_MAX, ROTATION_X_MAX),
        borne(v.rotateY + (p.x - derniere.x) * DEG_PAR_PX, -ROTATION_Y_MAX, ROTATION_Y_MAX),
        v.zoom,
      );
      derniere = p;
      echantillons.push({ t: e.timeStamp, x: p.x, y: p.y });
      if (echantillons.length > 8) echantillons.shift();
    };

    const alaFin = (e: PointerEvent, annule: boolean) => {
      if (!pointeurs.has(e.pointerId)) return;
      pointeurs.delete(e.pointerId);
      if (surface.hasPointerCapture(e.pointerId)) surface.releasePointerCapture(e.pointerId);

      if (pincement) {
        pincement = false;
        if (pointeurs.size === 1) {
          // Un doigt reste : la rotation reprend là où il est, sans saut.
          derniere = pointeurs.values().next().value as Point;
          echantillons = [];
          rotation = true;
        }
        return;
      }

      if (pointeurs.size > 0) return;

      const etaitTap = tap?.valide === true;
      const infoTap = tap;
      tap = null;

      if (rotation) {
        rotation = false;
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

    surface.addEventListener("pointerdown", auDebut);
    surface.addEventListener("pointermove", auDeplacement);
    surface.addEventListener("pointerup", auRelache);
    surface.addEventListener("pointercancel", auAnnule);
    surface.addEventListener("contextmenu", sansMenu);

    return () => {
      arreterInertie();
      surface.removeEventListener("pointerdown", auDebut);
      surface.removeEventListener("pointermove", auDeplacement);
      surface.removeEventListener("pointerup", auRelache);
      surface.removeEventListener("pointercancel", auAnnule);
      surface.removeEventListener("contextmenu", sansMenu);
    };
  }, [surfaceRef, viewRef, applyView, resetView, onTap]);
}
