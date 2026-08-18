// components/PlanCalepinage.tsx
// Plan visuel en 2 vues pour une zone HPL : Ossature (montants/équerres) et Plaques (calepinage).
// SVG à l'échelle de la zone, généré à partir des calculs de lib/poseCalcul.ts et
// lib/calepinageCalcul.ts. Zones rectangulaires uniquement (pignon : seule la partie
// sous l'égout est représentée, le triangle de pente reste à ajuster sur site).

"use client";

import { useState } from "react";
import { ResultatPose } from "@/lib/poseCalcul";
import { ResultatCalepinage } from "@/lib/calepinageCalcul";

const MARGE_SVG = 30;
const LARGEUR_MAX_SVG = 560;

export default function PlanCalepinage({
  largeurM,
  hauteurM,
  pose,
  calepinage,
  estPignon,
}: {
  largeurM: number;
  hauteurM: number;
  pose: ResultatPose | null;
  calepinage: ResultatCalepinage | null;
  estPignon: boolean;
}) {
  const [vue, setVue] = useState<"ossature" | "plaques">("ossature");

  if (largeurM <= 0 || hauteurM <= 0) return null;

  const echelle = LARGEUR_MAX_SVG / largeurM;
  const largeurSvg = largeurM * echelle;
  const hauteurSvg = hauteurM * echelle;
  const viewW = largeurSvg + MARGE_SVG * 2;
  const viewH = hauteurSvg + MARGE_SVG * 2;

  // Convertit une position "réelle" (origine en bas à gauche) en coordonnées SVG (origine en haut à gauche)
  const px = (xM: number) => MARGE_SVG + xM * echelle;
  const py = (yM: number) => MARGE_SVG + (hauteurM - yM) * echelle;

  return (
    <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Plan de calepinage
        </p>
        <div className="flex overflow-hidden rounded-lg border border-slate-600">
          <button
            type="button"
            onClick={() => setVue("ossature")}
            className={`px-3 py-1 text-xs font-medium ${
              vue === "ossature" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            Ossature
          </button>
          <button
            type="button"
            onClick={() => setVue("plaques")}
            className={`px-3 py-1 text-xs font-medium ${
              vue === "plaques" ? "bg-red-600 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            Plaques
          </button>
        </div>
      </div>

      <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full rounded bg-slate-950">
        {/* Contour du mur */}
        <rect
          x={MARGE_SVG}
          y={MARGE_SVG}
          width={largeurSvg}
          height={hauteurSvg}
          fill="none"
          stroke="#475569"
          strokeWidth={2}
        />

        {vue === "ossature" && pose && (
          <g>
            {/* Montants/chevrons verticaux, espacés selon l'entraxe horizontal */}
            {Array.from(
              { length: Math.floor(largeurM / (pose.entraxeHorizontal ?? largeurM)) + 1 },
              (_, i) => i * (pose.entraxeHorizontal ?? largeurM)
            )
              .filter((x) => x <= largeurM)
              .map((x, i) => (
                <line
                  key={`montant-${i}`}
                  x1={px(x)}
                  y1={py(0)}
                  x2={px(x)}
                  y2={py(hauteurM)}
                  stroke="#0ea5e9"
                  strokeWidth={3}
                />
              ))}

            {/* Équerres (points), espacées selon l'entraxe vertical, sur chaque montant */}
            {Array.from(
              { length: Math.floor(largeurM / (pose.entraxeHorizontal ?? largeurM)) + 1 },
              (_, i) => i * (pose.entraxeHorizontal ?? largeurM)
            )
              .filter((x) => x <= largeurM)
              .map((x, ci) =>
                Array.from(
                  { length: Math.floor(hauteurM / pose.entraxeVertical) + 1 },
                  (_, i) => i * pose.entraxeVertical
                )
                  .filter((y) => y <= hauteurM)
                  .map((y, ri) => (
                    <circle
                      key={`equerre-${ci}-${ri}`}
                      cx={px(x)}
                      cy={py(y)}
                      r={4}
                      fill="#f87171"
                    />
                  ))
              )}
          </g>
        )}

        {vue === "plaques" && calepinage && (
          <g>
            {calepinage.pieces.map((p, i) => (
              <g key={i}>
                <rect
                  x={px(p.xM)}
                  y={py(p.yM + p.hauteurM)}
                  width={p.largeurM * echelle}
                  height={p.hauteurM * echelle}
                  fill={p.type === "pleine" ? "#1e293b" : "#7c2d12"}
                  stroke="#e2e8f0"
                  strokeWidth={1.5}
                />
                {p.largeurM * echelle > 45 && p.hauteurM * echelle > 20 && (
                  <text
                    x={px(p.xM) + (p.largeurM * echelle) / 2}
                    y={py(p.yM + p.hauteurM / 2)}
                    fill="#cbd5e1"
                    fontSize={10}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {(p.largeurM * 1000).toFixed(0)}×{(p.hauteurM * 1000).toFixed(0)}
                  </text>
                )}
              </g>
            ))}
          </g>
        )}
      </svg>

      {vue === "plaques" && calepinage && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-slate-500">Plaques nécessaires</p>
            <p className="font-semibold text-white">{calepinage.nbPlaquesNecessaires}</p>
          </div>
          <div>
            <p className="text-slate-500">Taux de chute</p>
            <p className="font-semibold text-amber-400">{calepinage.tauxChutePct.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-slate-500">Joints</p>
            <p className="font-semibold text-white">{calepinage.nbJoints}</p>
          </div>
        </div>
      )}

      {estPignon && (
        <p className="text-xs italic text-amber-500">
          ⚠️ Pignon : seule la partie rectangulaire sous l&apos;égout est calculée. Le triangle de
          pente reste à ajuster sur site.
        </p>
      )}

      <p className="text-xs text-slate-600">
        🟫 = plaque coupée (bout, aux extrémités) · ⬛ = plaque pleine (aucune découpe en largeur)
      </p>
    </div>
  );
}
