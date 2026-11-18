"use client";

import React, { useMemo } from "react";
import {
  FENCE_MATERIAL_PRESETS,
  type FenceResult,
  type SegmentId,
  type SegmentResult,
} from "@/lib/cloture/calepinageCloture";

function formatM(val: number, decimals = 2): string {
  return `${val.toFixed(decimals)} m`;
}

export const PlanCalepinage4Cotes2DSvg: React.FC<{
  result: FenceResult;
  selectedSide: SegmentId | "GLOBAL";
  onSelectSide: (side: SegmentId) => void;
}> = ({ result, selectedSide, onSelectSide }) => {
  const { config, segmentsActifs, isClosedLoop } = result;

  const segMap = useMemo(() => {
    const map: Partial<Record<SegmentId, SegmentResult>> = {};
    for (const s of segmentsActifs) map[s.id] = s;
    return map;
  }, [segmentsActifs]);

  const W = 900;
  const H = 560;
  const leftX = 180;
  const rightX = 720;
  const topY = 120;
  const bottomY = 440;
  const rectW = rightX - leftX;
  const rectH = bottomY - topY;
  const preset = FENCE_MATERIAL_PRESETS[config.materiau];

  const renderPoteau = (
    cx: number,
    cy: number,
    kind: "ANGLE" | "INTER" | "TERMINAISON" | "DEMI_MURAL",
    key: string,
    accent: string
  ) => {
    if (kind === "ANGLE") {
      return (
        <g key={key}>
          <rect
            x={cx - 7}
            y={cy - 7}
            width={14}
            height={14}
            rx={2}
            fill="#B85B2B"
            stroke="#FFFFFF"
            strokeWidth={2}
          />
        </g>
      );
    }
    if (kind === "DEMI_MURAL") {
      return (
        <rect
          key={key}
          x={cx - 5}
          y={cy - 5}
          width={10}
          height={10}
          rx={1.5}
          fill="#475569"
          stroke="#FFFFFF"
          strokeWidth={1.5}
        />
      );
    }
    if (kind === "TERMINAISON") {
      return (
        <circle
          key={key}
          cx={cx}
          cy={cy}
          r={5.5}
          fill="#23272B"
          stroke="#FFFFFF"
          strokeWidth={1.5}
        />
      );
    }
    return (
      <rect
        key={key}
        x={cx - 4}
        y={cy - 4}
        width={8}
        height={8}
        rx={1.5}
        fill={accent}
        stroke="#FFFFFF"
        strokeWidth={1.2}
      />
    );
  };

  const renderSegment = (
    seg: SegmentResult,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    labelOffset: { dx: number; dy: number }
  ) => {
    const isSelected = selectedSide === seg.id;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    const nbTravees = Math.max(1, seg.nbTraveesSegment);
    const hasPortillon = seg.nbPortillonsSegment > 0;
    const portillonRatio = hasPortillon
      ? Math.min(0.28, seg.longueurPortillonsM / Math.max(1, seg.longueurSegment))
      : 0;
    const clotureRatio = 1 - portillonRatio;

    const poteaux: React.ReactNode[] = [];
    for (let i = 1; i < nbTravees; i++) {
      const t = (i / nbTravees) * clotureRatio;
      poteaux.push(
        renderPoteau(x1 + dx * t, y1 + dy * t, "INTER", `${seg.id}-p-${i}`, seg.accentHex)
      );
    }

    const departKind =
      seg.departType === "ANGLE"
        ? "ANGLE"
        : seg.departType === "DEMI_MURAL"
          ? "DEMI_MURAL"
          : "TERMINAISON";
    const arriveeKind =
      seg.arriveeType === "ANGLE"
        ? "ANGLE"
        : seg.arriveeType === "DEMI_MURAL"
          ? "DEMI_MURAL"
          : "TERMINAISON";

    return (
      <g
        key={seg.id}
        className="cursor-pointer"
        onClick={() => onSelectSide(seg.id)}
      >
        <line
          x1={x1}
          y1={y1}
          x2={x1 + dx * clotureRatio}
          y2={y1 + dy * clotureRatio}
          stroke={isSelected ? "#B85B2B" : preset.colorHex}
          strokeWidth={isSelected ? 7 : 5}
          strokeLinecap="round"
        />
        {hasPortillon && (
          <g>
            <line
              x1={x1 + dx * clotureRatio}
              y1={y1 + dy * clotureRatio}
              x2={x2}
              y2={y2}
              stroke="#0284C7"
              strokeWidth={4}
              strokeDasharray="6 4"
            />
            {renderPoteau(
              x1 + dx * clotureRatio,
              y1 + dy * clotureRatio,
              "TERMINAISON",
              `${seg.id}-port-deb`,
              "#0284C7"
            )}
          </g>
        )}
        {poteaux}
        {renderPoteau(x1, y1, departKind, `${seg.id}-start`, seg.accentHex)}
        {renderPoteau(x2, y2, arriveeKind, `${seg.id}-end`, seg.accentHex)}

        <g transform={`translate(${(x1 + x2) / 2 + labelOffset.dx}, ${(y1 + y2) / 2 + labelOffset.dy})`}>
          <rect
            x={-72}
            y={-22}
            width={144}
            height={44}
            rx={10}
            fill={isSelected ? "#B85B2B" : "#FFFFFF"}
            stroke={isSelected ? "#B85B2B" : "#E5E5E5"}
            strokeWidth={1.5}
          />
          <text
            x={0}
            y={-4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill={isSelected ? "#FFFFFF" : "#23272B"}
          >
            {seg.label} · {formatM(seg.longueurSegment)}
          </text>
          <text
            x={0}
            y={12}
            textAnchor="middle"
            fontSize={10}
            fill={isSelected ? "#FFEDD5" : "#64748B"}
          >
            {seg.nbTraveesSegment} travées · coupe {formatM(seg.longueurCoupeLame)}
          </text>
        </g>

        {/* Normale discrète pour orientation */}
        <text
          x={x1 + dx * 0.12 - uy * 14}
          y={y1 + dy * 0.12 + ux * 14}
          fontSize={9}
          fontWeight={700}
          fill={seg.accentHex}
        >
          {seg.id}
        </text>
      </g>
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-[#F5EFEA]">
            Plan de calepinage 2D coté ({config.forme.replace("_", " ")})
          </h4>
          <p className="text-xs text-[#8E7F74]">
            Cliquez sur un côté (A, B, C, D) pour inspecter son élévation détaillée
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#B8A99E]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#D96B27]" /> Poteau d&apos;angle
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#23272B]" /> Terminaison
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#475569]" /> Demi-poteau mural
          </span>
          {result.nbPortillonsTotal > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 border-t-2 border-dashed border-[#0284C7]" /> Portillon
            </span>
          )}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl bg-[#120F0D] border border-[#EFEFEF]">
        {/* Grille architecturale légère */}
        <defs>
          <pattern id="grid-cloture-2d" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="url(#grid-cloture-2d)" />

        {/* Surface intérieure parcelle si en U ou 4 côtés */}
        {(config.forme === "4_COTES" || config.forme === "EN_U") && (
          <rect
            x={leftX}
            y={topY}
            width={rectW}
            height={rectH}
            fill="#FFFFFF"
            fillOpacity={0.7}
            stroke="none"
          />
        )}

        {/* Boussole */}
        <g transform="translate(830, 62)">
          <circle cx={0} cy={0} r={24} fill="#FFFFFF" stroke="#CBD5E1" strokeWidth={1.2} />
          <path d="M 0 -16 L 5 0 L 0 -4 L -5 0 Z" fill="#B85B2B" />
          <path d="M 0 16 L 5 0 L 0 4 L -5 0 Z" fill="#94A3B8" />
          <text x={0} y={-28} textAnchor="middle" fontSize={10} fontWeight={800} fill="#23272B">
            N
          </text>
        </g>

        {/* Segments actifs */}
        {config.forme === "DROITE" && segMap.A &&
          renderSegment(segMap.A, leftX, (topY + bottomY) / 2, rightX, (topY + bottomY) / 2, {
            dx: 0,
            dy: -48,
          })}

        {config.forme !== "DROITE" && segMap.A &&
          renderSegment(segMap.A, leftX, bottomY, rightX, bottomY, { dx: 0, dy: 46 })}

        {segMap.B &&
          renderSegment(segMap.B, rightX, bottomY, rightX, topY, { dx: 92, dy: 0 })}

        {segMap.C &&
          renderSegment(segMap.C, rightX, topY, leftX, topY, { dx: 0, dy: -46 })}

        {segMap.D &&
          renderSegment(segMap.D, leftX, topY, leftX, bottomY, { dx: -92, dy: 0 })}

        {/* Cartouche central */}
        <g transform={`translate(${W / 2}, ${config.forme === "DROITE" ? H / 2 + 75 : H / 2})`}>
          <rect
            x={-135}
            y={-42}
            width={270}
            height={84}
            rx={14}
            fill="#FFFFFF"
            stroke="#E5E5E5"
            strokeWidth={1.5}
          />
          <text x={0} y={-16} textAnchor="middle" fontSize={11} fontWeight={800} fill="#B85B2B">
            {isClosedLoop ? "PÉRIMÈTRE BOUCLE FERMÉE" : `CLÔTURE ${config.forme.replace("_", " ")}`}
          </text>
          <text x={0} y={4} textAnchor="middle" fontSize={13} fontWeight={800} fill="#23272B">
            {formatM(result.lineaireTotalM)} · {result.totalPoteauxComplets} poteaux
          </text>
          <text x={0} y={24} textAnchor="middle" fontSize={10} fill="#64748B">
            {result.nbTraveesTotal} travées · {result.nbTotalLames} lames
            {result.nbPlaquesSoubassement > 0 ? ` · ${result.nbPlaquesSoubassement} soubas.` : ""}
          </text>
        </g>
      </svg>
    </div>
  );
};

export const ElevationPlan2DSvg: React.FC<{
  result: FenceResult;
  segment: SegmentResult;
}> = ({ result, segment }) => {
  const { config } = result;
  const preset = FENCE_MATERIAL_PRESETS[config.materiau];

  const W = 880;
  const H = 310;
  const padX = 56;
  const baseLineY = 250;
  const usableW = W - padX * 2;

  const nbTravees = Math.max(1, segment.nbTraveesSegment);
  const hasPortillon = segment.nbPortillonsSegment > 0;
  const totalUnits = nbTravees + (hasPortillon ? 1 : 0);
  const traveePx = usableW / Math.max(1, totalUnits);

  const scaleH = 88; // px / m
  const postH = config.hauteurUtile * scaleH;
  const soubH = result.hauteurSoubassementRetenueM * scaleH;
  const pasRedanPx =
    config.gestionPente === "REDANS" && segment.pasRedanM > 0
      ? Math.min(24, segment.pasRedanM * scaleH)
      : 0;
  const sign = segment.deniveleM < 0 ? -1 : 1;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-[#F5EFEA]">
            Élévation 2D — {segment.fullLabel}
          </h4>
          <p className="text-xs text-[#8E7F74]">
            Hauteur utile {formatM(config.hauteurUtile)} ·{" "}
            {config.typePoseSol === "DIRECT_SOL" ? "Scellement béton" : "Platines sur muret"}
            {result.hauteurSoubassementRetenueM > 0
              ? ` · Soubassement béton ${Math.round(result.hauteurSoubassementRetenueM * 1000)} mm`
              : ""}
            {segment.nbRedansSegment > 0
              ? ` · ${segment.nbRedansSegment} redans (dénivelé ${formatM(segment.deniveleM)})`
              : ""}
          </p>
        </div>
        <span className="rounded-lg bg-[#D96B27]/10 px-2.5 py-1 text-xs font-bold text-[#D96B27]">
          Coupe lame : {formatM(segment.longueurCoupeLame)}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl bg-[#120F0D] border border-[#EFEFEF]">
        {/* Sol ou Muret */}
        <rect
          x={0}
          y={baseLineY}
          width={W}
          height={H - baseLineY}
          fill={config.typePoseSol === "SUR_MURET" ? "#CBD5E1" : "#E7E5E4"}
        />
        <line x1={0} y1={baseLineY} x2={W} y2={baseLineY} stroke="#64748B" strokeWidth={2} />

        {/* Travées de clôture */}
        {Array.from({ length: nbTravees }).map((_, idx) => {
          const x = padX + idx * traveePx;
          const stepY = idx * pasRedanPx * sign;
          const yBot = baseLineY - stepY;
          const yTop = yBot - postH;
          const ySoubTop = yBot - soubH;
          const lameZoneH = Math.max(10, ySoubTop - yTop);
          const nLames = Math.max(1, segment.nbLamesParTravee);
          const lamePx = lameZoneH / nLames;

          return (
            <g key={`tr-${idx}`}>
              {/* Poteau gauche de la travée */}
              <rect
                x={x - 4}
                y={yTop - 4}
                width={8}
                height={postH + 4}
                fill="#334155"
                rx={1}
              />

              {/* Lames horizontales */}
              {Array.from({ length: nLames }).map((__, lIdx) => (
                <rect
                  key={`l-${idx}-${lIdx}`}
                  x={x + 4}
                  y={yTop + lIdx * lamePx + 1}
                  width={Math.max(4, traveePx - 8)}
                  height={Math.max(2, lamePx - 2)}
                  fill={preset.colorHex}
                  stroke={preset.strokeHex}
                  strokeWidth={0.5}
                />
              ))}

              {/* Plaque de soubassement béton */}
              {soubH > 0 && (
                <rect
                  x={x + 4}
                  y={ySoubTop}
                  width={Math.max(4, traveePx - 8)}
                  height={soubH}
                  fill="#94A3B8"
                  stroke="#64748B"
                  strokeWidth={1}
                />
              )}

              {/* Cote travée */}
              <text
                x={x + traveePx / 2}
                y={yTop - 10}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill="#23272B"
              >
                T{idx + 1} ({formatM(segment.largeurTraveeAxe)})
              </text>
            </g>
          );
        })}

        {/* Dernier poteau après les travées */}
        {(() => {
          const lastX = padX + nbTravees * traveePx;
          const lastStepY = Math.max(0, nbTravees - 1) * pasRedanPx * sign;
          return (
            <rect
              x={lastX - 4}
              y={baseLineY - lastStepY - postH - 4}
              width={8}
              height={postH + 4}
              fill="#334155"
              rx={1}
            />
          );
        })()}

        {/* Portillon éventuel en bout de segment */}
        {hasPortillon && (
          <g>
            {(() => {
              const px = padX + nbTravees * traveePx;
              const lastStepY = Math.max(0, nbTravees - 1) * pasRedanPx * sign;
              const yBot = baseLineY - lastStepY;
              const yTop = yBot - postH;
              return (
                <>
                  <rect
                    x={px + 4}
                    y={yTop + 4}
                    width={Math.max(12, traveePx - 8)}
                    height={postH - 4}
                    fill="#E0F2FE"
                    stroke="#0284C7"
                    strokeWidth={2}
                  />
                  <circle cx={px + traveePx - 12} cy={yTop + postH / 2} r={3} fill="#0284C7" />
                  <rect
                    x={px + traveePx - 4}
                    y={yTop - 4}
                    width={8}
                    height={postH + 4}
                    fill="#0284C7"
                    rx={1}
                  />
                  <text
                    x={px + traveePx / 2}
                    y={yTop - 10}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="#0284C7"
                  >
                    Portillon ({formatM(segment.longueurPortillonsM)})
                  </text>
                </>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
};
