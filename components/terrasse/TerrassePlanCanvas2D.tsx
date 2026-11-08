"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  ResultatCalculTerrasse,
} from "@/lib/terrasse/types";
import type { PlacedBladeSegment } from "@/lib/terrasse/pro/presets-regles";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  EyeOff,
  Recycle,
  Scissors,
} from "lucide-react";

interface TerrassePlanCanvas2DProps {
  config: ChantierTerrasseConfig;
  resultat: ResultatCalculTerrasse;
  reservations?: ChantierTerrasseReservation[];
}

interface RowGroupSummary {
  rowIndex: number;
  widthMm: number;
  yMinMm: number;
  yMaxMm: number;
  segments: PlacedBladeSegment[];
  totalNetMm: number;
  offcutCount: number;
}

export default function TerrassePlanCanvas2D({
  config,
  resultat,
  reservations = [],
}: TerrassePlanCanvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Couches d'affichage
  const [showLames, setShowLames] = useState(true);
  const [showLambourdes, setShowLambourdes] = useState(true);
  const [showPlots, setShowPlots] = useState(true);
  const [showCotes, setShowCotes] = useState(true);
  const [showChutes, setShowChutes] = useState(true);

  // Rangée survolée (sur le canvas 2D ou dans la feuille de débit poseur)
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);

  // Zoom et pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Regroupement des segments par rangée pour l'inspection et la feuille de débit poseur
  const rowsSummary = useMemo<RowGroupSummary[]>(() => {
    const blades = resultat.terrassePro?.geometry.blades ?? [];
    if (blades.length === 0) return [];

    const byRow = new Map<number, PlacedBladeSegment[]>();
    for (const seg of blades) {
      const list = byRow.get(seg.rowIndex) ?? [];
      list.push(seg);
      byRow.set(seg.rowIndex, list);
    }

    return Array.from(byRow.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rowIndex, segs]) => {
        const sorted = [...segs].sort((a, b) => a.segmentIndexInRow - b.segmentIndexInRow);
        const yMinMm = Math.min(...sorted.map((s) => s.polygonMm[0]?.yMm ?? 0));
        const yMaxMm = Math.max(...sorted.map((s) => s.polygonMm[2]?.yMm ?? 0));
        const widthMm = sorted[0]?.widthNetMm ?? config.largeur_lame_mm;
        const totalNetMm = sorted.reduce((acc, s) => acc + s.lengthNetMm, 0);
        const offcutCount = sorted.filter((s) => s.isFromOffcutReuse).length;
        return {
          rowIndex,
          widthMm,
          yMinMm,
          yMaxMm,
          segments: sorted,
          totalNetMm,
          offcutCount,
        };
      });
  }, [resultat.terrassePro, config.largeur_lame_mm]);

  const nbChutesReemployeesTotal = useMemo(
    () => rowsSummary.reduce((acc, r) => acc + r.offcutCount, 0),
    [rowsSummary]
  );

  const hoveredRow = useMemo(
    () =>
      hoveredRowIndex !== null
        ? rowsSummary.find((r) => r.rowIndex === hoveredRowIndex) ?? null
        : null,
    [hoveredRowIndex, rowsSummary]
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Redimensionnement haute résolution (Retina)
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Fond quadrillé subtil
    ctx.fillStyle = "#121214";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    // Centrage et transformation
    ctx.translate(w / 2 + pan.x, h / 2 + pan.y);
    ctx.scale(zoom, zoom);

    // Calcul de l'échelle métrique (pixels par mètre)
    const margin = 70;
    const maxDrawW = w - margin * 2;
    const maxDrawH = h - margin * 2;
    const scale = Math.min(
      maxDrawW / Math.max(1, config.longueur_m),
      maxDrawH / Math.max(1, config.largeur_m)
    );

    const deckW = config.longueur_m * scale;
    const deckH = config.largeur_m * scale;
    const startX = -deckW / 2;
    const startY = -deckH / 2;

    // 1. Fond de la terrasse (dalle ou sol)
    ctx.fillStyle = "#1e222d";
    ctx.fillRect(startX, startY, deckW, deckH);
    ctx.strokeStyle = "#384252";
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, deckW, deckH);

    const proGeo = resultat.terrassePro?.geometry;
    const mmToPx = scale / 1000;

    // 2. Couche PLOTS (dessous)
    if (showPlots) {
      const plotRadius = Math.max(3, Math.min(8, 0.08 * scale));
      if (proGeo && proGeo.supports.length > 0) {
        for (const sup of proGeo.supports) {
          const px = startX + sup.centerMm.xMm * mmToPx;
          const py = startY + sup.centerMm.yMm * mmToPx;
          ctx.beginPath();
          ctx.arc(px, py, plotRadius, 0, Math.PI * 2);
          ctx.fillStyle = sup.type === "PLOT_CHEVETRE" ? "#38bdf8" : "#f59e0b";
          ctx.fill();
          ctx.strokeStyle = "#78350f";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      } else {
        const entraxeLambourdesPx = (config.entraxe_lambourdes_cm / 100) * scale;
        const entraxePlotsPx = (config.entraxe_plots_cm / 100) * scale;
        const nbLignesPlotsX = Math.ceil(deckW / entraxeLambourdesPx) + 1;
        const nbPlotsY = Math.ceil(deckH / entraxePlotsPx) + 1;

        for (let i = 0; i < nbLignesPlotsX; i++) {
          const px = Math.min(startX + deckW, startX + i * entraxeLambourdesPx);
          for (let j = 0; j < nbPlotsY; j++) {
            const py = Math.min(startY + deckH, startY + j * entraxePlotsPx);

            ctx.beginPath();
            ctx.arc(px, py, plotRadius, 0, Math.PI * 2);
            ctx.fillStyle = "#f59e0b";
            ctx.fill();
            ctx.strokeStyle = "#78350f";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
    }

    // 3. Couche LAMBOURDES & CHEVÊTRES (structure)
    if (showLambourdes) {
      if (proGeo && proGeo.joists.length > 0) {
        for (const j of proGeo.joists) {
          const x1 = startX + j.startMm.xMm * mmToPx;
          const y1 = startY + j.startMm.yMm * mmToPx;
          const x2 = startX + j.endMm.xMm * mmToPx;
          const y2 = startY + j.endMm.yMm * mmToPx;
          const halfThick = Math.max(1.5, (j.widthMm * mmToPx) / 2);

          ctx.strokeStyle =
            j.role === "CHEVETRE"
              ? "#0ea5e9"
              : j.role === "DOUBLE_ABOUTAGE_GAUCHE" || j.role === "DOUBLE_ABOUTAGE_DROITE"
              ? "#ea580c"
              : "#b45309";
          ctx.lineWidth = halfThick * 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      } else {
        const entraxeLambourdesPx = (config.entraxe_lambourdes_cm / 100) * scale;
        const lambourdeEpaisseurPx = Math.max(2, (config.section_largeur_mm / 1000) * scale);
        const nbRangees = Math.ceil(deckW / entraxeLambourdesPx) + 1;

        ctx.fillStyle = "#b45309";
        for (let i = 0; i < nbRangees; i++) {
          const lx = Math.min(
            startX + deckW - lambourdeEpaisseurPx,
            startX + i * entraxeLambourdesPx
          );
          ctx.fillRect(lx - lambourdeEpaisseurPx / 2, startY, lambourdeEpaisseurPx, deckH);
        }
      }
    }

    // 4. Couche LAMES (platelage de surface segment par segment avec joints d'aboutage & chutes réemployées)
    if (showLames) {
      let lameColor = "#a16207";
      if (config.essence_bois === "ipe" || config.essence_bois === "cumaru") {
        lameColor = "#713f12";
      } else if (config.essence_bois === "composite") {
        lameColor = "#4b5563";
      } else if (config.essence_bois === "douglas") {
        lameColor = "#b45309";
      }

      if (proGeo && proGeo.blades.length > 0) {
        for (const seg of proGeo.blades) {
          if (seg.polygonMm.length >= 4) {
            const p0 = seg.polygonMm[0];
            const p2 = seg.polygonMm[2];
            const sx = startX + p0.xMm * mmToPx;
            const sy = startY + p0.yMm * mmToPx;
            const sw = Math.max(1, (p2.xMm - p0.xMm) * mmToPx);
            const sh = Math.max(1, (p2.yMm - p0.yMm) * mmToPx);

            const isRowHovered = hoveredRowIndex === seg.rowIndex;
            const isOffcutHighlighted = showChutes && seg.isFromOffcutReuse;

            ctx.fillStyle = isRowHovered
              ? "#d97706"
              : isOffcutHighlighted
              ? "#065f46"
              : lameColor;
            ctx.fillRect(sx, sy, sw, sh);

            ctx.strokeStyle = isRowHovered
              ? "#f97316"
              : isOffcutHighlighted
              ? "#10b981"
              : "rgba(0,0,0,0.55)";
            ctx.lineWidth = isRowHovered || isOffcutHighlighted ? 1.5 : 1;
            ctx.strokeRect(sx, sy, sw, sh);

            // Joint d'aboutage mis en évidence (trait orange clair comme dans BNA-App)
            if (
              seg.rightJointType === "ABOUTAGE_DOUBLE" ||
              seg.rightJointType === "ABOUTAGE_SIMPLE"
            ) {
              ctx.strokeStyle = "#fdba74";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(sx + sw, sy);
              ctx.lineTo(sx + sw, sy + sh);
              ctx.stroke();
            }

            // Pastille verte ♻️ pour les chutes réemployées
            if (isOffcutHighlighted && sh >= 5 && sw >= 18) {
              ctx.beginPath();
              ctx.arc(sx + 7, sy + sh / 2, Math.min(3, sh * 0.32), 0, Math.PI * 2);
              ctx.fillStyle = "#34d399";
              ctx.fill();
            }
          }
        }
      } else {
        const pasMm = config.largeur_lame_mm + config.espacement_lames_mm;
        const pasPx = (pasMm / 1000) * scale;
        const lameLargeurPx = (config.largeur_lame_mm / 1000) * scale;
        const nbLames = Math.ceil(deckH / pasPx);

        ctx.fillStyle = lameColor;
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 1;

        for (let i = 0; i < nbLames; i++) {
          const ly = startY + i * pasPx;
          if (ly >= startY + deckH) break;
          const currentLameH = Math.min(lameLargeurPx, startY + deckH - ly);

          ctx.fillRect(startX, ly, deckW, currentLameH);
          ctx.strokeRect(startX, ly, deckW, currentLameH);
        }
      }
    }

    // 5. ESCALIER (si présent)
    if (config.presence_escalier) {
      const stairW = config.escalier_largeur_m * scale;
      const stairGironPx = (config.escalier_giron_cm / 100) * scale;
      const stairStartX = -stairW / 2;
      const stairStartY = startY + deckH;

      for (let m = 0; m < config.escalier_nb_marches; m++) {
        const marchY = stairStartY + m * stairGironPx;
        ctx.fillStyle = "#854d0e";
        ctx.fillRect(stairStartX, marchY, stairW, stairGironPx);
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(stairStartX, marchY, stairW, stairGironPx);
      }

      // Label escalier
      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `Escalier (${config.escalier_nb_marches} marches)`,
        0,
        stairStartY + (config.escalier_nb_marches * stairGironPx) / 2 + 4
      );
    }

    // 6. GARDE-CORPS (si présent)
    if (config.presence_garde_corps && config.garde_corps_longueur_ml > 0) {
      ctx.strokeStyle = "#38bdf8"; // Bleu fluo
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);

      // Rive supérieure et rive droite
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX + deckW, startY);
      ctx.lineTo(startX + deckW, startY + deckH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 6.bis RÉSERVATIONS & DÉCOUPES (Piscines, trappes, arbres, regards)
    if (reservations.length > 0) {
      for (const res of reservations) {
        const rx = startX + (res.x || 0) * scale;
        const ry = startY + (res.y || 0) * scale;

        if (res.type_reservation === "piscine") {
          const rw = (res.largeur || 3) * scale;
          const rh = (res.longueur || 2) * scale;
          ctx.fillStyle = "rgba(14, 165, 233, 0.85)";
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeStyle = "#0284c7";
          ctx.lineWidth = 3;
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(`🏊 ${res.nom}`, rx + rw / 2, ry + rh / 2);
        } else if (res.diametre) {
          const rRadius = (res.diametre / 2) * scale;
          ctx.beginPath();
          ctx.arc(rx, ry, rRadius, 0, Math.PI * 2);
          ctx.fillStyle = res.type_reservation === "arbre" ? "#15803d" : "#334155";
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(res.nom, rx, ry + 3);
        } else {
          const rw = (res.largeur || 0.6) * scale;
          const rh = (res.longueur || 0.6) * scale;
          ctx.fillStyle = "#334155";
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 2;
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.fillStyle = "#fef08a";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(res.nom, rx + rw / 2, ry + rh / 2 + 3);
        }
      }
    }

    // 7. COTES ET MESURES
    if (showCotes) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";

      // Cote Longueur (haut)
      ctx.fillText(
        `${config.longueur_m.toFixed(2)} m (Longueur)`,
        0,
        startY - 15
      );

      // Cote Largeur (gauche)
      ctx.save();
      ctx.translate(startX - 15, 0);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${config.largeur_m.toFixed(2)} m (Largeur)`, 0, 0);
      ctx.restore();

      // Indication entraxe lambourdes
      ctx.fillStyle = "#38bdf8";
      ctx.font = "10px sans-serif";
      ctx.fillText(
        `Entraxe lambourdes : ${config.entraxe_lambourdes_cm} cm | Entraxe plots : ${config.entraxe_plots_cm} cm`,
        0,
        startY + deckH + (config.presence_escalier ? (config.escalier_nb_marches * 0.3 * scale) + 30 : 25)
      );
    }

    ctx.restore();
  }, [
    config,
    resultat,
    reservations,
    showLames,
    showLambourdes,
    showPlots,
    showCotes,
    showChutes,
    hoveredRowIndex,
    zoom,
    pan,
  ]);

  // Gestion du drag de la souris pour le panoramique + détection de la rangée survolée
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      return;
    }

    // Détection de la rangée de lames sous le curseur
    const canvas = canvasRef.current;
    if (!canvas || rowsSummary.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const w = rect.width;
    const h = rect.height;
    const margin = 70;
    const scale = Math.min(
      (w - margin * 2) / Math.max(1, config.longueur_m),
      (h - margin * 2) / Math.max(1, config.largeur_m)
    );
    const deckW = config.longueur_m * scale;
    const deckH = config.largeur_m * scale;
    const startX = -deckW / 2;
    const startY = -deckH / 2;

    const worldX = (mouseX - (w / 2 + pan.x)) / zoom;
    const worldY = (mouseY - (h / 2 + pan.y)) / zoom;

    if (worldX < startX || worldX > startX + deckW || worldY < startY || worldY > startY + deckH) {
      if (hoveredRowIndex !== null) setHoveredRowIndex(null);
      return;
    }

    const yMm = ((worldY - startY) / scale) * 1000;
    const found = rowsSummary.find((r) => yMm >= r.yMinMm && yMm <= r.yMaxMm);
    setHoveredRowIndex(found ? found.rowIndex : null);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setHoveredRowIndex(null);
  };

  const bladeCuttingBars = useMemo(
    () =>
      (resultat.terrassePro?.cuttingPlan ?? []).filter(
        (b) => b.componentType === "LAME"
      ),
    [resultat.terrassePro]
  );

  return (
    <div className="space-y-4">
      <div className="relative w-full rounded-2xl border border-white/10 bg-[#121214] overflow-hidden shadow-xl">
        {/* Barre d'outils supérieure */}
        <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          {/* Toggles des calques */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-black/60 backdrop-blur-md p-1 border border-white/10 pointer-events-auto shadow-md">
            <button
              onClick={() => setShowLames(!showLames)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold transition-colors ${
                showLames
                  ? "bg-amber-600/40 text-amber-300 border border-amber-500/40"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {showLames ? <Eye size={12} /> : <EyeOff size={12} />}
              Lames
            </button>
            <button
              onClick={() => setShowChutes(!showChutes)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold transition-colors ${
                showChutes
                  ? "bg-emerald-600/40 text-emerald-300 border border-emerald-500/40"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Recycle size={12} />
              Chutes ♻️ ({nbChutesReemployeesTotal})
            </button>
            <button
              onClick={() => setShowLambourdes(!showLambourdes)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold transition-colors ${
                showLambourdes
                  ? "bg-orange-600/40 text-orange-300 border border-orange-500/40"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {showLambourdes ? <Eye size={12} /> : <EyeOff size={12} />}
              Lambourdes
            </button>
            <button
              onClick={() => setShowPlots(!showPlots)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold transition-colors ${
                showPlots
                  ? "bg-yellow-600/40 text-yellow-300 border border-yellow-500/40"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {showPlots ? <Eye size={12} /> : <EyeOff size={12} />}
              Plots
            </button>
            <button
              onClick={() => setShowCotes(!showCotes)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold transition-colors ${
                showCotes
                  ? "bg-sky-600/40 text-sky-300 border border-sky-500/40"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Cotes
            </button>
          </div>

          {/* Contrôles de Zoom */}
          <div className="flex items-center gap-1 rounded-xl bg-black/60 backdrop-blur-md p-1 border border-white/10 pointer-events-auto shadow-md">
            <button
              onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10"
              title="Zoom avant"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.4, z / 1.2))}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10"
              title="Zoom arrière"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={resetView}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10"
              title="Réinitialiser"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Canvas 2D */}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          className="w-full h-[460px] cursor-grab active:cursor-grabbing block"
        />

        {/* Bandeau d'inspection de la rangée survolée (inspiré de BNA-App) */}
        {hoveredRow && (
          <div className="border-t border-orange-500/40 bg-[#18120b]/95 px-4 py-2 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-orange-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
                Rangée #{hoveredRow.rowIndex + 1}
              </span>
              <span className="text-gray-300">
                Largeur : <strong>{hoveredRow.widthMm} mm</strong>
              </span>
            </div>
            <div className="font-mono text-[11px] text-amber-200">
              Coupes :{" "}
              {hoveredRow.segments
                .map(
                  (s) =>
                    `${(s.lengthNetMm / 10).toFixed(1)} cm${
                      s.isFromOffcutReuse ? " ♻️ (chute)" : ""
                    }`
                )
                .join(" + ")}
            </div>
          </div>
        )}

        {/* Légende bas de page */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 bg-black/40 px-4 py-2 text-3xs text-gray-400">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span> Lames (
              {resultat.lames.nbLignesLames} rangées)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400"></span> Chutes réemployées ♻️ (
              {nbChutesReemployeesTotal} segments ≥ 40 cm)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-orange-600"></span> Lambourdes (
              {resultat.lambourdes.nbRangees} rangées)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-400"></span> Chevêtres réservations
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-yellow-400"></span> Plots réglables (
              {resultat.plots.nbPlotsTotal} u)
            </span>
          </div>
          <span className="hidden sm:inline text-gray-500">
            Survolez une rangée pour inspecter ses coupes · Glisser pour déplacer
          </span>
        </div>
      </div>

      {/* Feuille de Débit Poseur : Séquence Rangée par Rangée & Plan de Coupe 1D */}
      {rowsSummary.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Colonne 1 : Séquence de pose rangée par rangée */}
          <div className="rounded-2xl border border-white/10 bg-[#14161b] p-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Scissors className="h-4 w-4 text-orange-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Séquence de Coupe Poseur ({rowsSummary.length} rangées)
                </h3>
              </div>
              <span className="text-3xs text-emerald-400 font-semibold">
                {nbChutesReemployeesTotal} chute(s) réemployée(s) ♻️
              </span>
            </div>

            <div className="mt-2.5 max-h-52 overflow-y-auto space-y-1 pr-1">
              {rowsSummary.map((r) => {
                const isSelected = hoveredRowIndex === r.rowIndex;
                return (
                  <div
                    key={`row-seq-${r.rowIndex}`}
                    onMouseEnter={() => setHoveredRowIndex(r.rowIndex)}
                    onMouseLeave={() => setHoveredRowIndex(null)}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition cursor-pointer ${
                      isSelected
                        ? "bg-orange-500/20 border border-orange-500/50 text-white"
                        : "bg-black/30 hover:bg-white/5 text-gray-300 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-400">
                        Rang #{r.rowIndex + 1}
                      </span>
                      <span className="text-3xs text-gray-400">
                        (larg. {r.widthMm} mm)
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-right">
                      {r.segments.map((s, idx) => (
                        <span key={s.id}>
                          {idx > 0 && <span className="text-gray-500"> + </span>}
                          <span
                            className={
                              s.isFromOffcutReuse
                                ? "font-bold text-emerald-400"
                                : "text-gray-200"
                            }
                          >
                            {(s.lengthNetMm / 10).toFixed(1)}cm
                            {s.isFromOffcutReuse ? "♻️" : ""}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Colonne 2 : Plan de débit 1D barre par barre (Trait de scie 3 mm & Purge 15 mm) */}
          <div className="rounded-2xl border border-white/10 bg-[#14161b] p-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Recycle className="h-4 w-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Plan de Débit 1D dans les Barres ({bladeCuttingBars.length} lames)
                </h3>
              </div>
              <span className="text-3xs text-gray-400">
                Purge : 15 mm · Trait de scie : 3 mm
              </span>
            </div>

            <div className="mt-2.5 max-h-52 overflow-y-auto space-y-1.5 pr-1">
              {bladeCuttingBars.map((bar, idx) => (
                <div
                  key={bar.barId}
                  className="flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5 text-xs border border-white/5"
                >
                  <div>
                    <span className="font-bold text-sky-300">
                      Barre #{idx + 1}
                    </span>{" "}
                    <span className="text-3xs text-gray-400">
                      ({bar.commercialLengthMm} mm)
                    </span>
                    <div className="font-mono text-[11px] text-gray-200">
                      Coupes :{" "}
                      {bar.cuts.map((c) => `${c.cutLengthMm} mm`).join(" + ")}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        bar.offcutStatus === "REUSED_IN_PLAN"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : bar.offcutStatus === "REUSABLE_STOCK"
                          ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                          : "bg-gray-700/40 text-gray-400"
                      }`}
                    >
                      Chute : {bar.offcutLengthMm} mm (
                      {bar.offcutStatus === "REUSED_IN_PLAN"
                        ? "♻️ Réemployée"
                        : bar.offcutStatus === "REUSABLE_STOCK"
                        ? "Stock ≥ 40 cm"
                        : "Rebut"}
                      )
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
