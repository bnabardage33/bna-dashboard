"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  ResultatCalculTerrasse,
} from "@/lib/terrasse/types";
import type { PlacedBladeSegment } from "@/lib/terrasse/pro/presets-regles";
import {
  resoudreConfigTerrasseMobile,
  calculerSousEnsembleTerrasseMobile,
} from "@/lib/terrasse/pro/terrasse-mobile";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  EyeOff,
  Recycle,
  Scissors,
  MoveHorizontal,
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

/**
 * Trace une ligne de cote technique 2D avec flèches d'extrémités et texte centré
 */
function drawCote2D(
  ctx: CanvasRenderingContext2D,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  label: string,
  color: string = "#38bdf8",
  tickLength: number = 6
) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 10) return;

  const ux = dx / dist;
  const uy = dy / dist;
  const nx = -uy;
  const ny = ux;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);

  // Ligne de cote
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();

  // Ticks aux extrémités
  ctx.beginPath();
  ctx.moveTo(p1.x + nx * tickLength, p1.y + ny * tickLength);
  ctx.lineTo(p1.x - nx * tickLength, p1.y - ny * tickLength);
  ctx.moveTo(p2.x + nx * tickLength, p2.y + ny * tickLength);
  ctx.lineTo(p2.x - nx * tickLength, p2.y - ny * tickLength);
  ctx.stroke();

  // Flèches aux extrémités
  const arrowSize = 5;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p1.x + (ux + nx * 0.4) * arrowSize, p1.y + (uy + ny * 0.4) * arrowSize);
  ctx.lineTo(p1.x + (ux - nx * 0.4) * arrowSize, p1.y + (uy - ny * 0.4) * arrowSize);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(p2.x, p2.y);
  ctx.lineTo(p2.x - (ux - nx * 0.4) * arrowSize, p2.y - (uy - ny * 0.4) * arrowSize);
  ctx.lineTo(p2.x - (ux + nx * 0.4) * arrowSize, p2.y - (uy + ny * 0.4) * arrowSize);
  ctx.closePath();
  ctx.fill();

  // Texte au milieu avec fond protecteur
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  ctx.font = "bold 9.5px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const metrics = ctx.measureText(label);
  const textW = metrics.width + 8;
  const textH = 14;

  ctx.fillStyle = "rgba(18, 18, 20, 0.9)";
  ctx.fillRect(midX - textW / 2, midY - textH / 2, textW, textH);

  ctx.fillStyle = color;
  ctx.fillText(label, midX, midY);
  ctx.restore();
}

/**
 * Trace une flèche de direction de translation avec badge d'indication de course
 */
function drawArrow2D(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  label: string,
  color: string = "#f59e0b"
) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  if (dist < 15) return;

  const ux = dx / dist;
  const uy = dy / dist;
  const nx = -uy;
  const ny = ux;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);

  // Ligne principale
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  // Tête de flèche avec chevron
  const headSize = 10;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - ux * headSize + nx * (headSize * 0.6), toY - uy * headSize + ny * (headSize * 0.6));
  ctx.lineTo(toX - ux * (headSize * 0.7), toY - uy * (headSize * 0.7));
  ctx.lineTo(toX - ux * headSize - nx * (headSize * 0.6), toY - uy * headSize - ny * (headSize * 0.6));
  ctx.closePath();
  ctx.fill();

  // Badge texte au milieu
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const metrics = ctx.measureText(label);
  const textW = metrics.width + 10;
  const textH = 15;

  ctx.fillStyle = "rgba(18, 18, 20, 0.92)";
  ctx.fillRect(midX - textW / 2, midY - textH - 3, textW, textH);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(midX - textW / 2, midY - textH - 3, textW, textH);

  ctx.fillStyle = color;
  ctx.fillText(label, midX, midY - 3);
  ctx.restore();
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
  const [showTerrasseMobile, setShowTerrasseMobile] = useState(true);

  // Détection et calcul de la terrasse mobile si configurée sur le bassin piscine
  const poolReservation = useMemo(
    () => reservations.find((r) => r.type_reservation === "piscine"),
    [reservations]
  );

  const mobileConfig = useMemo(
    () => resoudreConfigTerrasseMobile(config, poolReservation),
    [config, poolReservation]
  );

  const mobileResult = useMemo(() => {
    if (!poolReservation || !mobileConfig || !mobileConfig.active) return null;
    return calculerSousEnsembleTerrasseMobile({
      config,
      poolReservation,
      mobileConfig,
    });
  }, [config, poolReservation, mobileConfig]);

  // Calcul des bornes englobantes (terrasse fixe + rails inox + plateau mobile ouvert)
  const bounds = useMemo(() => {
    let minBoundX = 0;
    let maxBoundX = config.longueur_m;
    let minBoundY = 0;
    let maxBoundY = config.largeur_m;

    if (showTerrasseMobile && mobileResult) {
      for (const rail of mobileResult.mobileStructure.rails) {
        minBoundX = Math.min(minBoundX, rail.startMm.xMm / 1000, rail.endMm.xMm / 1000);
        maxBoundX = Math.max(maxBoundX, rail.startMm.xMm / 1000, rail.endMm.xMm / 1000);
        minBoundY = Math.min(minBoundY, rail.startMm.yMm / 1000, rail.endMm.yMm / 1000);
        maxBoundY = Math.max(maxBoundY, rail.startMm.yMm / 1000, rail.endMm.yMm / 1000);
      }
      for (const p of mobileResult.mobileStructure.panels) {
        const opX = (p.xMm + p.directionVector.x * p.travelDistanceMm) / 1000;
        const opY = (p.yMm + p.directionVector.y * p.travelDistanceMm) / 1000;
        const opW = p.widthMm / 1000;
        const opL = p.lengthMm / 1000;
        minBoundX = Math.min(minBoundX, opX, opX + opW);
        maxBoundX = Math.max(maxBoundX, opX, opX + opW);
        minBoundY = Math.min(minBoundY, opY, opY + opL);
        maxBoundY = Math.max(maxBoundY, opY, opY + opL);
      }
    }

    const pad = showTerrasseMobile && mobileResult ? 0.35 : 0.1;
    const spanX = Math.max(1, maxBoundX - minBoundX + pad * 2);
    const spanY = Math.max(1, maxBoundY - minBoundY + pad * 2);
    const midX = (minBoundX + maxBoundX) / 2;
    const midY = (minBoundY + maxBoundY) / 2;

    return { minBoundX, maxBoundX, minBoundY, maxBoundY, spanX, spanY, midX, midY };
  }, [config.longueur_m, config.largeur_m, showTerrasseMobile, mobileResult]);

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

    // Calcul de l'échelle métrique (pixels par mètre) avec prise en compte de la terrasse mobile et de sa course
    const margin = 70;
    const maxDrawW = w - margin * 2;
    const maxDrawH = h - margin * 2;
    const scale = Math.min(maxDrawW / bounds.spanX, maxDrawH / bounds.spanY);

    const startX = -bounds.midX * scale;
    const startY = -bounds.midY * scale;

    const deckW = config.longueur_m * scale;
    const deckH = config.largeur_m * scale;

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
          const rw = (res.largeur || 4) * scale;
          const rh = (res.longueur || 2.5) * scale;

          if (showTerrasseMobile && mobileResult && res.terrasse_mobile?.active) {
            // A. RAILS INOX AU SOL (BASSIN + ZONE DE REFOULEMENT)
            for (const rail of mobileResult.mobileStructure.rails) {
              const rX1 = startX + (rail.startMm.xMm / 1000) * scale;
              const rY1 = startY + (rail.startMm.yMm / 1000) * scale;
              const rX2 = startX + (rail.endMm.xMm / 1000) * scale;
              const rY2 = startY + (rail.endMm.yMm / 1000) * scale;

              // Semelle / Assise du rail
              ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
              ctx.lineWidth = 7;
              ctx.beginPath();
              ctx.moveTo(rX1, rY1);
              ctx.lineTo(rX2, rY2);
              ctx.stroke();

              // Profilé inox brossé
              ctx.strokeStyle = "#94a3b8";
              ctx.lineWidth = 3.5;
              ctx.beginPath();
              ctx.moveTo(rX1, rY1);
              ctx.lineTo(rX2, rY2);
              ctx.stroke();

              // Gorge centrale brillante
              ctx.strokeStyle = "#f8fafc";
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(rX1, rY1);
              ctx.lineTo(rX2, rY2);
              ctx.stroke();

              // Butées mécaniques d'arrêt aux deux extrémités
              const angle = Math.atan2(rY2 - rY1, rX2 - rX1);
              const nx = -Math.sin(angle) * 7;
              const ny = Math.cos(angle) * 7;

              ctx.strokeStyle = "#f59e0b";
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(rX1 + nx, rY1 + ny);
              ctx.lineTo(rX1 - nx, rY1 - ny);
              ctx.moveTo(rX2 + nx, rY2 + ny);
              ctx.lineTo(rX2 - nx, rY2 - ny);
              ctx.stroke();
            }

            // B. BASSIN PISCINE
            ctx.fillStyle = "rgba(14, 165, 233, 0.85)";
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = "#0284c7";
            ctx.lineWidth = 2.5;
            ctx.strokeRect(rx, ry, rw, rh);

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 11px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`🏊 ${res.nom}`, rx + rw / 2, ry + rh / 2 - 6);
            ctx.font = "9px monospace";
            ctx.fillStyle = "#e0f2fe";
            ctx.fillText(
              `Bassin ${res.largeur || 4}m × ${res.longueur || 2.5}m`,
              rx + rw / 2,
              ry + rh / 2 + 8
            );

            // C. PLATEAU MOBILE FERMÉ (CONTOUR PLEIN, COUVRE LE BASSIN + 20 MM DE JEU)
            for (const panel of mobileResult.mobileStructure.panels) {
              const pX = startX + (panel.xMm / 1000) * scale;
              const pY = startY + (panel.yMm / 1000) * scale;
              const pW = (panel.widthMm / 1000) * scale;
              const pL = (panel.lengthMm / 1000) * scale;

              // Remplissage semi-transparent
              ctx.fillStyle = "rgba(30, 41, 59, 0.65)";
              ctx.fillRect(pX, pY, pW, pL);

              // Traverses intérieures du châssis alu
              ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
              ctx.lineWidth = 1;
              for (let tx = 40; tx < panel.widthMm; tx += 400) {
                const lx = pX + (tx / 1000) * scale;
                ctx.beginPath();
                ctx.moveTo(lx, pY);
                ctx.lineTo(lx, pY + pL);
                ctx.stroke();
              }

              // Contour plein (fermé)
              ctx.strokeStyle = "#0284c7";
              ctx.lineWidth = 2.5;
              ctx.setLineDash([]);
              ctx.strokeRect(pX, pY, pW, pL);

              // Libellé au centre
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 10px sans-serif";
              ctx.textAlign = "center";
              ctx.fillText(`PLATEAU FERMÉ`, pX + pW / 2, pY + pL / 2 - 10);
              ctx.fillStyle = "#bae6fd";
              ctx.font = "9px monospace";
              ctx.fillText(
                `${panel.widthMm} × ${panel.lengthMm} mm · ${mobileResult.resultatPlateau.dimensionsPlateau.poidsPropreKg} kg`,
                pX + pW / 2,
                pY + pL / 2 + 4
              );
              ctx.fillStyle = "#7dd3fc";
              ctx.font = "8px sans-serif";
              ctx.fillText(`(Position de repos fermée)`, pX + pW / 2, pY + pL / 2 + 16);
            }

            // D. PLATEAU MOBILE OUVERT EN ZONE DE REFOULEMENT (CONTOUR EN POINTILLÉS)
            for (const panel of mobileResult.mobileStructure.panels) {
              const opX =
                startX +
                ((panel.xMm + panel.directionVector.x * panel.travelDistanceMm) / 1000) * scale;
              const opY =
                startY +
                ((panel.yMm + panel.directionVector.y * panel.travelDistanceMm) / 1000) * scale;
              const pW = (panel.widthMm / 1000) * scale;
              const pL = (panel.lengthMm / 1000) * scale;

              // Fond zone de refoulement
              ctx.fillStyle = "rgba(245, 158, 11, 0.12)";
              ctx.fillRect(opX, opY, pW, pL);

              // Contour en pointillés
              ctx.strokeStyle = "#f59e0b";
              ctx.lineWidth = 2.5;
              ctx.setLineDash([8, 5]);
              ctx.strokeRect(opX, opY, pW, pL);
              ctx.setLineDash([]);

              // Libellé au centre
              ctx.fillStyle = "#fef08a";
              ctx.font = "bold 10px sans-serif";
              ctx.textAlign = "center";
              ctx.fillText(`PLATEAU OUVERT`, opX + pW / 2, opY + pL / 2 - 10);
              ctx.fillStyle = "#fde68a";
              ctx.font = "9px monospace";
              ctx.fillText(
                `Zone de refoulement requise`,
                opX + pW / 2,
                opY + pL / 2 + 4
              );
              ctx.fillStyle = "#fbbf24";
              ctx.font = "8px sans-serif";
              ctx.fillText(
                `Course : ${(panel.travelDistanceMm / 1000).toFixed(2)} m (${panel.travelDistanceMm} mm)`,
                opX + pW / 2,
                opY + pL / 2 + 16
              );

              // Flèche directionnelle de translation
              const closedCenterX = startX + ((panel.xMm + panel.widthMm / 2) / 1000) * scale;
              const closedCenterY = startY + ((panel.yMm + panel.lengthMm / 2) / 1000) * scale;
              const openCenterX = opX + pW / 2;
              const openCenterY = opY + pL / 2;

              drawArrow2D(
                ctx,
                closedCenterX,
                closedCenterY,
                openCenterX,
                openCenterY,
                `Translation ${(panel.travelDistanceMm / 1000).toFixed(2)} m`,
                "#f59e0b"
              );
            }

            // E. BLOC MOTEUR & PANNEAU SOLAIRE (SI MOTORISÉ)
            if (mobileResult.resultatPlateau.motorisation?.active) {
              const mot = mobileResult.resultatPlateau.motorisation;
              const driveRail = mobileResult.mobileStructure.rails[0];
              if (driveRail) {
                const isNegative =
                  mobileConfig?.sens_refoulement === "gauche" ||
                  mobileConfig?.sens_refoulement === "haut";
                const isLateral =
                  mobileConfig?.sens_refoulement === "gauche" ||
                  mobileConfig?.sens_refoulement === "droite";
                const motorPosMm = isNegative ? driveRail.startMm : driveRail.endMm;
                const mX = startX + (motorPosMm.xMm / 1000) * scale;
                const mY = startY + (motorPosMm.yMm / 1000) * scale;

                // Bloc moteur
                const motW = 28;
                const motH = 20;
                ctx.fillStyle = "#0f172a";
                ctx.fillRect(mX - motW / 2, mY - motH / 2, motW, motH);
                ctx.strokeStyle = "#f59e0b";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(mX - motW / 2, mY - motH / 2, motW, motH);

                ctx.fillStyle = "#fbbf24";
                ctx.font = "bold 8px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("⚡ MOT", mX, mY - 1);
                ctx.fillStyle = "#ffffff";
                ctx.font = "7px sans-serif";
                ctx.fillText("24V", mX, mY + 7);

                // Crémaillère M4 longeant le rail
                const crX1 = startX + (driveRail.startMm.xMm / 1000) * scale;
                const crY1 =
                  startY + (driveRail.startMm.yMm / 1000) * scale + (isLateral ? 8 : 0);
                const crX2 = startX + (driveRail.endMm.xMm / 1000) * scale;
                const crY2 =
                  startY + (driveRail.endMm.yMm / 1000) * scale + (isLateral ? 8 : 0);

                ctx.strokeStyle = "#f59e0b";
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 2]);
                ctx.beginPath();
                ctx.moveTo(crX1, crY1);
                ctx.lineTo(crX2, crY2);
                ctx.stroke();
                ctx.setLineDash([]);

                // Panneau solaire déporté si solaire
                if (mot.typeMotorisation === "solaire") {
                  const pvX = mX + (isLateral ? 0 : 38);
                  const pvY = mY + (isLateral ? 38 : 0);
                  const pvW = 32;
                  const pvH = 22;

                  ctx.fillStyle = "#1e3a8a";
                  ctx.fillRect(pvX - pvW / 2, pvY - pvH / 2, pvW, pvH);
                  ctx.strokeStyle = "#38bdf8";
                  ctx.lineWidth = 1.5;
                  ctx.strokeRect(pvX - pvW / 2, pvY - pvH / 2, pvW, pvH);

                  // Grille PV
                  ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
                  ctx.lineWidth = 0.8;
                  ctx.beginPath();
                  ctx.moveTo(pvX, pvY - pvH / 2);
                  ctx.lineTo(pvX, pvY + pvH / 2);
                  ctx.moveTo(pvX - pvW / 2, pvY);
                  ctx.lineTo(pvX + pvW / 2, pvY);
                  ctx.stroke();

                  ctx.fillStyle = "#ffffff";
                  ctx.font = "bold 7px sans-serif";
                  ctx.textAlign = "center";
                  ctx.fillText("☀️ PV 30W", pvX, pvY + pvH / 2 + 9);

                  // Câblage 24V vers moteur
                  ctx.strokeStyle = "#fbbf24";
                  ctx.lineWidth = 1;
                  ctx.setLineDash([3, 3]);
                  ctx.beginPath();
                  ctx.moveTo(pvX, pvY);
                  ctx.lineTo(mX, mY);
                  ctx.stroke();
                  ctx.setLineDash([]);
                }
              }
            }

            // F. COTES TECHNIQUES DE LA TERRASSE MOBILE (SI SHOWCOTES)
            if (showCotes) {
              const r0 = mobileResult.mobileStructure.rails[0];
              const rN =
                mobileResult.mobileStructure.rails[
                  mobileResult.mobileStructure.rails.length - 1
                ];
              const isLateral =
                mobileConfig?.sens_refoulement === "gauche" ||
                mobileConfig?.sens_refoulement === "droite";

              // 1. Longueur totale des rails
              if (r0) {
                const railStartX = startX + (r0.startMm.xMm / 1000) * scale;
                const railStartY = startY + (r0.startMm.yMm / 1000) * scale;
                const railEndX = startX + (r0.endMm.xMm / 1000) * scale;
                const railEndY = startY + (r0.endMm.yMm / 1000) * scale;
                const offsetRail = isLateral ? -22 : -22;

                drawCote2D(
                  ctx,
                  { x: railStartX, y: railStartY + (isLateral ? offsetRail : 0) },
                  { x: railEndX, y: railEndY + (isLateral ? offsetRail : 0) },
                  `Rail Inox 316L : ${Math.round(mobileResult.resultatPlateau.rails.longueurUnitaireM * 1000)} mm`,
                  "#e2e8f0"
                );
              }

              // 2. Entraxe des rails
              if (r0 && rN && r0 !== rN) {
                const r0MidX = startX + ((r0.startMm.xMm + r0.endMm.xMm) / 2000) * scale;
                const r0MidY = startY + ((r0.startMm.yMm + r0.endMm.yMm) / 2000) * scale;
                const rNMidX = startX + ((rN.startMm.xMm + rN.endMm.xMm) / 2000) * scale;
                const rNMidY = startY + ((rN.startMm.yMm + rN.endMm.yMm) / 2000) * scale;

                drawCote2D(
                  ctx,
                  { x: r0MidX, y: r0MidY },
                  { x: rNMidX, y: rNMidY },
                  `Entraxe : ${Math.round(mobileResult.resultatPlateau.rails.entraxeRailsM * 1000)} mm`,
                  "#38bdf8"
                );
              }

              // 3. Jeu périphérique (20 mm)
              const jeuMm = mobileConfig?.jeu_fonctionnel_peripherique_mm || 20;
              ctx.fillStyle = "#38bdf8";
              ctx.font = "bold 9px monospace";
              ctx.textAlign = "left";
              ctx.fillText(`↤ Jeu : ${jeuMm} mm`, rx - 20, ry - 6);
            }
          } else {
            // Rendu piscine standard sans terrasse mobile
            ctx.fillStyle = "rgba(14, 165, 233, 0.85)";
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = "#0284c7";
            ctx.lineWidth = 3;
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 11px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`🏊 ${res.nom}`, rx + rw / 2, ry + rh / 2);
          }
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
    showTerrasseMobile,
    mobileResult,
    bounds,
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
      (w - margin * 2) / bounds.spanX,
      (h - margin * 2) / bounds.spanY
    );
    const startX = -bounds.midX * scale;
    const startY = -bounds.midY * scale;
    const deckW = config.longueur_m * scale;
    const deckH = config.largeur_m * scale;

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
      <div className="relative w-full rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-[#121214] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
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
            {mobileResult && (
              <button
                onClick={() => setShowTerrasseMobile(!showTerrasseMobile)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold transition-colors ${
                  showTerrasseMobile
                    ? "bg-sky-600/40 text-sky-300 border border-sky-500/40"
                    : "text-gray-400 hover:text-white"
                }`}
                title="Afficher/Masquer le plan d'implantation de la terrasse mobile et des rails"
              >
                <MoveHorizontal size={12} />
                Terrasse Mobile & Rails
              </button>
            )}
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
            {mobileResult && (
              <>
                <span className="flex items-center gap-1.5 text-sky-300">
                  <span className="h-2 w-2 rounded-xs border border-sky-400 bg-sky-500/30"></span> Plateau fermé (contour plein)
                </span>
                <span className="flex items-center gap-1.5 text-amber-300">
                  <span className="h-2 w-2 rounded-xs border border-dashed border-amber-400 bg-amber-500/20"></span> Refoulement (pointillés)
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="h-1.5 w-3 bg-slate-400"></span> Rails inox 316L ({mobileResult.resultatPlateau.rails.lineaireTotalM} m)
                </span>
              </>
            )}
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
          <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between border-b border-[#F0F0F0] pb-2.5">
              <div className="flex items-center gap-2">
                <Scissors className="h-4 w-4 text-[#B85B2B]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
                  Séquence de Coupe Poseur ({rowsSummary.length} rangées)
                </h3>
              </div>
              <span className="text-3xs text-emerald-700 font-bold">
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
                    className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs transition cursor-pointer ${
                      isSelected
                        ? "bg-amber-50 border border-amber-300 text-[#23272B]"
                        : "bg-[#F8F9FA] hover:bg-gray-100 text-[#23272B] border border-[#E5E5E5]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#B85B2B]">
                        Rang #{r.rowIndex + 1}
                      </span>
                      <span className="text-3xs text-[#777777]">
                        (larg. {r.widthMm} mm)
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-right text-[#23272B]">
                      {r.segments.map((s, idx) => (
                        <span key={s.id}>
                          {idx > 0 && <span className="text-[#999999]"> + </span>}
                          <span
                            className={
                              s.isFromOffcutReuse
                                ? "font-bold text-emerald-700"
                                : "text-[#23272B]"
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
          <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between border-b border-[#F0F0F0] pb-2.5">
              <div className="flex items-center gap-2">
                <Recycle className="h-4 w-4 text-emerald-700" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
                  Plan de Débit 1D dans les Barres ({bladeCuttingBars.length} lames)
                </h3>
              </div>
              <span className="text-3xs text-[#777777]">
                Purge : 15 mm · Trait de scie : 3 mm
              </span>
            </div>

            <div className="mt-2.5 max-h-52 overflow-y-auto space-y-1.5 pr-1">
              {bladeCuttingBars.map((bar, idx) => (
                <div
                  key={bar.barId}
                  className="flex items-center justify-between rounded-xl bg-[#F8F9FA] px-2.5 py-1.5 text-xs border border-[#E5E5E5]"
                >
                  <div>
                    <span className="font-bold text-sky-800">
                      Barre #{idx + 1}
                    </span>{" "}
                    <span className="text-3xs text-[#777777]">
                      ({bar.commercialLengthMm} mm)
                    </span>
                    <div className="font-mono text-[11px] text-[#23272B]">
                      Coupes :{" "}
                      {bar.cuts.map((c) => `${c.cutLengthMm} mm`).join(" + ")}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                        bar.offcutStatus === "REUSED_IN_PLAN"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                          : bar.offcutStatus === "REUSABLE_STOCK"
                          ? "bg-sky-50 text-sky-800 border border-sky-300"
                          : "bg-gray-100 text-[#777777] border border-[#E5E5E5]"
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
