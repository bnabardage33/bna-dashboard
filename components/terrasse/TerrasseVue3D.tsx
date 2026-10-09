"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import type { ChantierTerrasseConfig, ResultatCalculTerrasse } from "@/lib/terrasse/types";
import { Rotate3d, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface TerrasseVue3DProps {
  config: ChantierTerrasseConfig;
  resultat: ResultatCalculTerrasse;
}

export default function TerrasseVue3D({ config, resultat }: TerrasseVue3DProps) {
  // Angles de rotation orbitale 3D
  const [rotX, setRotX] = useState(60); // Inclinaison vue du dessus
  const [rotZ, setRotZ] = useState(-30); // Rotation azimut
  const [zoom, setZoom] = useState(1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const resetCamera = useCallback(() => {
    setRotX(60);
    setRotZ(-30);
    setZoom(1);
  }, []);

  const setVueHaut = () => {
    setRotX(0);
    setRotZ(0);
    setZoom(1);
  };

  const setVueRasant = () => {
    setRotX(80);
    setRotZ(-45);
    setZoom(1.2);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    setRotZ((rz) => rz + dx * 0.5);
    setRotX((rx) => Math.max(10, Math.min(88, rx - dy * 0.5)));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Dimensions normalisées pour le viewport CSS 3D
  const baseW = 340;
  const aspect = config.largeur_m / Math.max(0.1, config.longueur_m);
  const baseH = Math.max(160, Math.min(340, baseW * aspect));

  // Couleur des lames
  let boardColor = "#b45309";
  let boardBorder = "#78350f";
  if (config.essence_bois === "ipe" || config.essence_bois === "cumaru") {
    boardColor = "#713f12";
    boardBorder = "#451a03";
  } else if (config.essence_bois === "composite") {
    boardColor = "#4b5563";
    boardBorder = "#1f2937";
  } else if (config.essence_bois === "douglas") {
    boardColor = "#d97706";
    boardBorder = "#92400e";
  }

  // Échantillonnage du nombre de lames et lambourdes pour performance DOM (max 30 lames affichées)
  const nbLamesAffichees = Math.min(24, Math.max(6, Math.floor(resultat.lames.nbLignesLames)));
  const nbLambourdesAffichees = Math.min(12, Math.max(4, resultat.lambourdes.nbRangees));

  return (
    <div className="relative w-full rounded-2xl border border-white/10 bg-[#0d0f12] overflow-hidden shadow-2xl">
      {/* Contrôles de caméra */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5 rounded-xl bg-black/60 backdrop-blur-md p-1 border border-white/10 pointer-events-auto">
          <button
            onClick={resetCamera}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold text-gray-300 hover:text-white hover:bg-white/10"
          >
            <Rotate3d size={13} />
            Isométrique
          </button>
          <button
            onClick={setVueHaut}
            className="px-2.5 py-1 rounded-lg text-2xs font-semibold text-gray-300 hover:text-white hover:bg-white/10"
          >
            Plat (Haut)
          </button>
          <button
            onClick={setVueRasant}
            className="px-2.5 py-1 rounded-lg text-2xs font-semibold text-gray-300 hover:text-white hover:bg-white/10"
          >
            Rasante
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-black/60 backdrop-blur-md p-1 border border-white/10 pointer-events-auto">
          <button
            onClick={() => setZoom((z) => Math.min(2.2, z * 1.2))}
            className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z / 1.2))}
            className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={resetCamera}
            className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Scène CSS 3D */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-[460px] flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
        style={{ perspective: "1000px" }}
      >
        <div
          className="relative transition-transform duration-75"
          style={{
            width: `${baseW}px`,
            height: `${baseH}px`,
            transformStyle: "preserve-3d",
            transform: `scale3d(${zoom}, ${zoom}, ${zoom}) rotateX(${rotX}deg) rotateZ(${rotZ}deg)`,
          }}
        >
          {/* Sol / Dalle de fondation (Z = -30px) */}
          <div
            className="absolute inset-0 rounded-lg border border-slate-700/60 shadow-2xl"
            style={{
              transform: "translateZ(-30px)",
              background:
                config.type_sol === "dalle_beton"
                  ? "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)"
                  : "linear-gradient(135deg, #272118 0%, #15110a 100%)",
            }}
          >
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:16px_16px]"></div>
          </div>

          {/* Plots réglables sous la structure (Z = -15px) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ transform: "translateZ(-15px)", transformStyle: "preserve-3d" }}
          >
            {Array.from({ length: 15 }).map((_, i) => {
              const row = Math.floor(i / 5);
              const col = i % 5;
              return (
                <div
                  key={i}
                  className="absolute w-4 h-4 rounded-full bg-amber-500 border border-amber-300 shadow-md flex items-center justify-center"
                  style={{
                    left: `${(col / 4) * 85 + 7.5}%`,
                    top: `${(row / 2) * 80 + 10}%`,
                    transform: "translate(-50%, -50%) translateZ(4px)",
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-black/60"></div>
                </div>
              );
            })}
          </div>

          {/* Lambourdes (Structure Z = -5px) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ transform: "translateZ(-5px)", transformStyle: "preserve-3d" }}
          >
            {Array.from({ length: nbLambourdesAffichees }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-2.5 rounded-sm shadow-md"
                style={{
                  left: `${(i / (nbLambourdesAffichees - 1)) * 96 + 2}%`,
                  background:
                    config.type_lambourde === "alu_structure"
                      ? "#64748b"
                      : "#78350f",
                  border: "1px solid rgba(0,0,0,0.5)",
                }}
              />
            ))}
          </div>

          {/* Lames de platelage (Surface Z = 10px) */}
          <div
            className="absolute inset-0 rounded shadow-2xl overflow-hidden"
            style={{
              transform: "translateZ(10px)",
              transformStyle: "preserve-3d",
              background: boardColor,
            }}
          >
            <div className="w-full h-full flex flex-col justify-between">
              {Array.from({ length: nbLamesAffichees }).map((_, i) => (
                <div
                  key={i}
                  className="w-full flex-1 border-b"
                  style={{
                    backgroundColor: i % 2 === 0 ? boardColor : `${boardColor}ee`,
                    borderColor: boardBorder,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Escalier 3D (si présent) */}
          {config.presence_escalier && (
            <div
              className="absolute left-1/4 right-1/4 top-full pointer-events-none"
              style={{ transformStyle: "preserve-3d" }}
            >
              {Array.from({ length: config.escalier_nb_marches }).map((_, m) => (
                <div
                  key={m}
                  className="w-full h-8 rounded border shadow-lg"
                  style={{
                    backgroundColor: boardColor,
                    borderColor: boardBorder,
                    transform: `translateY(${m * 18}px) translateZ(${10 - (m + 1) * 8}px)`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Garde-corps 3D (si présent) */}
          {config.presence_garde_corps && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Poteaux verticaux */}
              {[0, 50, 100].map((posPct) => (
                <div
                  key={posPct}
                  className="absolute w-2 h-14 bg-sky-400 border border-sky-600 rounded-t shadow-lg"
                  style={{
                    left: `${posPct}%`,
                    top: "0%",
                    transform: "translate(-50%, -100%) translateZ(10px) rotateX(-90deg)",
                    transformOrigin: "bottom center",
                  }}
                />
              ))}

              {/* Lisse supérieure */}
              <div
                className="absolute left-0 right-0 h-1.5 bg-sky-300 border border-sky-500 shadow-md"
                style={{
                  top: "0%",
                  transform: "translateY(-50px) translateZ(10px)",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Info bas de vue 3D */}
      <div className="flex items-center justify-between border-t border-white/5 bg-black/40 px-4 py-2 text-3xs text-gray-400">
        <span>Rotation : clic gauche glissé · Zoom : molette ou boutons</span>
        <span className="font-semibold text-amber-400">
          Essence : {config.essence_bois.toUpperCase()} · Lambourdes : {config.type_lambourde}
        </span>
      </div>
    </div>
  );
}
