"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Module, ModuleGroup, Opening, Percage } from "@/types/calepinage";
import {
  useCanvasRenderer,
  type ModuleAffichable,
} from "@/hooks/calepinage/useCanvasRenderer";
import { useCanvasGestures } from "@/hooks/calepinage/useCanvasGestures";

// Plan de calepinage en canvas HTML5 2D natif (aucune librairie canvas).
// Interactions tactiles : pinch-to-zoom, pan avec inertie, tap pour sélectionner,
// double-tap pour revenir à la vue ajustée.
//
// À charger via `next/dynamic` depuis les pages (composant graphique lourd).

export interface PlanCalepinageCanvasProps {
  /** Modules posés (chantier_zones_modules). `repere` (facultatif) sert de libellé. */
  modules: ModuleAffichable[];
  /** Groupes de modules (palette de couleurs). */
  groups: ModuleGroup[];
  /** Ouvertures positionnées (chantier_zones_ouvertures), affichées hachurées. */
  openings?: Opening[];
  /** Perçages calculés des modules (affichés au zoom > 1.5x). */
  percages?: Percage[];
  /** Largeur totale de la zone en mm. */
  zoneWidthMm: number;
  /** Hauteur totale de la zone en mm. */
  zoneHeightMm: number;
  onModuleSelect?: (module: Module) => void;
  /** Appelé quand un tap hors module désélectionne. */
  onModuleDeselect?: () => void;
}

// Hauteur disponible : écran − header (56) − bottom nav (64) − padding (32).
const HAUTEUR = "calc(100dvh - 56px - 64px - 32px)";

export default function PlanCalepinageCanvas({
  modules,
  groups,
  openings,
  percages,
  zoneWidthMm,
  zoneHeightMm,
  onModuleSelect,
  onModuleDeselect,
}: PlanCalepinageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Callbacks parents gardés en ref : changer de callback ne réinstalle pas les écouteurs.
  const onSelectRef = useRef(onModuleSelect);
  const onDeselectRef = useRef(onModuleDeselect);
  useEffect(() => {
    onSelectRef.current = onModuleSelect;
    onDeselectRef.current = onModuleDeselect;
  }, [onModuleSelect, onModuleDeselect]);

  const { viewRef, requestRender, applyView, resetView, hitTest } = useCanvasRenderer({
    canvasRef,
    containerRef,
    modules,
    groups,
    openings,
    percages,
    zoneWidthMm,
    zoneHeightMm,
  });

  const onTap = useCallback(
    (x: number, y: number) => {
      const module = hitTest(x, y);
      viewRef.current.selectedModuleId = module ? module.id : null;
      requestRender();
      if (module) onSelectRef.current?.(module);
      else onDeselectRef.current?.();
    },
    [hitTest, requestRender, viewRef]
  );

  useCanvasGestures({ canvasRef, viewRef, applyView, resetView, onTap });

  const zoneValide = zoneWidthMm > 0 && zoneHeightMm > 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl bg-slate-100"
      style={{ height: HAUTEUR }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Plan de calepinage, ${modules.length} modules`}
        className="block h-full w-full select-none"
        style={{ touchAction: "none" }}
      />
      {!zoneValide && (
        <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-slate-500">
          Dimensions de la zone manquantes : le plan ne peut pas être affiché.
        </p>
      )}
    </div>
  );
}
