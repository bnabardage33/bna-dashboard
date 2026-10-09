"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import type {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  ResultatCalculTerrasse,
} from "@/lib/terrasse/types";
import { ZoomIn, ZoomOut, RotateCcw, Layers, Eye, EyeOff } from "lucide-react";

interface TerrassePlanCanvas2DProps {
  config: ChantierTerrasseConfig;
  resultat: ResultatCalculTerrasse;
  reservations?: ChantierTerrasseReservation[];
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

  // Zoom et pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

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

    // 2. Couche PLOTS (dessous)
    if (showPlots) {
      const entraxeLambourdesPx = (config.entraxe_lambourdes_cm / 100) * scale;
      const entraxePlotsPx = (config.entraxe_plots_cm / 100) * scale;
      const plotRadius = Math.max(3, Math.min(8, 0.08 * scale));

      const nbLignesPlotsX = Math.ceil(deckW / entraxeLambourdesPx) + 1;
      const nbPlotsY = Math.ceil(deckH / entraxePlotsPx) + 1;

      for (let i = 0; i < nbLignesPlotsX; i++) {
        const px = Math.min(startX + deckW, startX + i * entraxeLambourdesPx);
        for (let j = 0; j < nbPlotsY; j++) {
          const py = Math.min(startY + deckH, startY + j * entraxePlotsPx);

          ctx.beginPath();
          ctx.arc(px, py, plotRadius, 0, Math.PI * 2);
          ctx.fillStyle = "#f59e0b"; // Jaune/ambre pour plots
          ctx.fill();
          ctx.strokeStyle = "#78350f";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // 3. Couche LAMBOURDES (structure)
    if (showLambourdes) {
      const entraxeLambourdesPx = (config.entraxe_lambourdes_cm / 100) * scale;
      const lambourdeEpaisseurPx = Math.max(2, (config.section_largeur_mm / 1000) * scale);
      const nbRangees = Math.ceil(deckW / entraxeLambourdesPx) + 1;

      ctx.fillStyle = "#b45309"; // Teinte bois structure
      for (let i = 0; i < nbRangees; i++) {
        const lx = Math.min(
          startX + deckW - lambourdeEpaisseurPx,
          startX + i * entraxeLambourdesPx
        );
        ctx.fillRect(lx - lambourdeEpaisseurPx / 2, startY, lambourdeEpaisseurPx, deckH);
      }
    }

    // 4. Couche LAMES (platelage de surface)
    if (showLames) {
      const pasMm = config.largeur_lame_mm + config.espacement_lames_mm;
      const pasPx = (pasMm / 1000) * scale;
      const lameLargeurPx = (config.largeur_lame_mm / 1000) * scale;
      const nbLames = Math.ceil(deckH / pasPx);

      // Couleur selon essence
      let lameColor = "#a16207"; // standard
      if (config.essence_bois === "ipe" || config.essence_bois === "cumaru") {
        lameColor = "#713f12"; // exotique foncé
      } else if (config.essence_bois === "composite") {
        lameColor = "#4b5563"; // composite anthracite
      } else if (config.essence_bois === "douglas") {
        lameColor = "#b45309"; // douglas miel
      }

      ctx.fillStyle = lameColor;
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1;

      for (let i = 0; i < nbLames; i++) {
        const ly = startY + i * pasPx;
        if (ly >= startY + deckH) break;
        const currentLameH = Math.min(lameLargeurPx, startY + deckH - ly);

        ctx.fillRect(startX, ly, deckW, currentLameH);
        ctx.strokeRect(startX, ly, deckW, currentLameH);
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
    showLames,
    showLambourdes,
    showPlots,
    showCotes,
    zoom,
    pan,
  ]);

  // Gestion du drag de la souris pour le panoramique
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <div className="relative w-full rounded-2xl border border-white/10 bg-[#121214] overflow-hidden shadow-xl">
      {/* Barre d'outils supérieure */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Toggles des calques */}
        <div className="flex items-center gap-1.5 rounded-xl bg-black/60 backdrop-blur-md p-1 border border-white/10 pointer-events-auto shadow-md">
          <button
            onClick={() => setShowLames(!showLames)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold transition-colors ${
              showLames ? "bg-amber-600/40 text-amber-300 border border-amber-500/40" : "text-gray-400 hover:text-white"
            }`}
          >
            {showLames ? <Eye size={12} /> : <EyeOff size={12} />}
            Lames
          </button>
          <button
            onClick={() => setShowLambourdes(!showLambourdes)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold transition-colors ${
              showLambourdes ? "bg-orange-600/40 text-orange-300 border border-orange-500/40" : "text-gray-400 hover:text-white"
            }`}
          >
            {showLambourdes ? <Eye size={12} /> : <EyeOff size={12} />}
            Lambourdes
          </button>
          <button
            onClick={() => setShowPlots(!showPlots)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold transition-colors ${
              showPlots ? "bg-yellow-600/40 text-yellow-300 border border-yellow-500/40" : "text-gray-400 hover:text-white"
            }`}
          >
            {showPlots ? <Eye size={12} /> : <EyeOff size={12} />}
            Plots
          </button>
          <button
            onClick={() => setShowCotes(!showCotes)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold transition-colors ${
              showCotes ? "bg-sky-600/40 text-sky-300 border border-sky-500/40" : "text-gray-400 hover:text-white"
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
        onMouseLeave={handleMouseUp}
        className="w-full h-[460px] cursor-grab active:cursor-grabbing block"
      />

      {/* Légende bas de page */}
      <div className="flex items-center justify-between border-t border-white/5 bg-black/40 px-4 py-2 text-3xs text-gray-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500"></span> Lames de platelage ({resultat.lames.nbLignesLames} rangées)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-orange-600"></span> Lambourdes ({resultat.lambourdes.nbRangees} rangées)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-yellow-400"></span> Plots réglables ({resultat.plots.nbPlotsTotal} unités)
          </span>
        </div>
        <span className="hidden sm:inline text-gray-500">
          Glisser pour déplacer · Boutons pour zoomer
        </span>
      </div>
    </div>
  );
}
