// components/PlanCalepinage.tsx
// Plan visuel en 2 vues pour une zone HPL : Ossature et Plaques.
// Le pignon est maintenant représenté sur toute sa hauteur, triangle compris.

"use client";

import { useState } from "react";
import { ResultatPose } from "@/lib/poseCalcul";
import { ResultatCalepinage } from "@/lib/calepinageCalcul";

const MARGE_SVG = 30;
const LARGEUR_MAX_SVG = 560;

export default function PlanCalepinage({
  largeurM,
  hauteurM,
  hauteurFaiteM,
  pose,
  calepinage,
  estPignon,
}: {
  largeurM: number;
  hauteurM: number;
  hauteurFaiteM?: number | null;
  pose: ResultatPose | null;
  calepinage: ResultatCalepinage | null;
  estPignon: boolean;
}) {
  const [vue, setVue] = useState<"ossature" | "plaques">("ossature");

  if (largeurM <= 0 || hauteurM <= 0) return null;

  const hauteurAffichee =
    estPignon && hauteurFaiteM && hauteurFaiteM > hauteurM ? hauteurFaiteM : hauteurM;

  const echelle = LARGEUR_MAX_SVG / largeurM;
  const largeurSvg = largeurM * echelle;
  const hauteurSvg = hauteurAffichee * echelle;
  const viewW = largeurSvg + MARGE_SVG * 2;
  const viewH = hauteurSvg + MARGE_SVG * 2;

  const px = (xM: number) => MARGE_SVG + xM * echelle;
  const py = (yM: number) => MARGE_SVG + (hauteurAffichee - yM) * echelle;

  const pente =
    estPignon && largeurM > 0
      ? ((hauteurAffichee - hauteurM) / (largeurM / 2))
      : 0;

  const hauteurToitAtX = (xM: number) => {
    if (!estPignon || pente <= 0) return hauteurM;
    return xM <= largeurM / 2
      ? hauteurM + pente * xM
      : hauteurM + pente * (largeurM - xM);
  };

  const contourPignon = estPignon
    ? [
        `${px(0)},${py(0)}`,
        `${px(largeurM)},${py(0)}`,
        `${px(largeurM)},${py(hauteurM)}`,
        `${px(largeurM / 2)},${py(hauteurAffichee)}`,
        `${px(0)},${py(hauteurM)}`,
      ].join(" ")
    : "";

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
        {estPignon ? (
          <polygon
            points={contourPignon}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={2}
          />
        ) : (
          <rect
            x={MARGE_SVG}
            y={MARGE_SVG}
            width={largeurSvg}
            height={hauteurSvg}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={2}
          />
        )}

        {vue === "ossature" && pose && (
          <g>
            {Array.from(
              { length: Math.floor(largeurM / (pose.entraxeHorizontal ?? largeurM)) + 1 },
              (_, i) => i * (pose.entraxeHorizontal ?? largeurM)
            )
              .filter((x) => x <= largeurM + EPSILON_M)
              .map((x, i) => {
                const yHaut = hauteurToitAtX(x);
                return (
                  <line
                    key={`montant-${i}`}
                    x1={px(x)}
                    y1={py(0)}
                    x2={px(x)}
                    y2={py(yHaut)}
                    stroke="#38bdf8"
                    strokeWidth={3}
                  />
                );
              })}

            {Array.from(
              { length: Math.floor(largeurM / (pose.entraxeHorizontal ?? largeurM)) + 1 },
              (_, i) => i * (pose.entraxeHorizontal ?? largeurM)
            )
              .filter((x) => x <= largeurM + EPSILON_M)
              .map((x, ci) =>
                Array.from(
                  { length: Math.floor(hauteurAffichee / pose.entraxeVertical) + 1 },
                  (_, i) => i * pose.entraxeVertical
                )
                  .filter((y) => y <= hauteurToitAtX(x) + EPSILON_M)
                  .map((y, ri) => (
                    <circle
                      key={`equerre-${ci}-${ri}`}
                      cx={px(x)}
                      cy={py(y)}
                      r={4}
                      fill="#fb7185"
                    />
                  ))
              )}
          </g>
        )}

        {vue === "plaques" && calepinage && (
          <g>
            {calepinage.pieces.map((p, i) => {
              const points = p.points?.length
                ? p.points.map((point) => `${px(point.xM)},${py(point.yM)}`).join(" ")
                : null;

              return (
                <g key={`${p.colonne}-${p.rangee}-${i}`}>
                  {points ? (
                    <polygon
                      points={points}
                      fill={p.type === "pleine" ? "#facc15" : "#fb923c"}
                      fillOpacity={0.82}
                      stroke="#fff7ed"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <rect
                      x={px(p.xM)}
                      y={py(p.yM + p.hauteurM)}
                      width={p.largeurM * echelle}
                      height={p.hauteurM * echelle}
                      fill={p.type === "pleine" ? "#facc15" : "#fb923c"}
                      fillOpacity={0.82}
                      stroke="#fff7ed"
                      strokeWidth={1.5}
                    />
                  )}

                  {p.largeurM * echelle > 45 && p.hauteurM * echelle > 20 && (
                    <text
                      x={px(p.xM) + (p.largeurM * echelle) / 2}
                      y={py(p.yM + p.hauteurM / 2)}
                      fill="#0f172a"
                      fontSize={10}
                      fontWeight={700}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {(p.largeurM * 1000).toFixed(0)}×{(p.hauteurM * 1000).toFixed(0)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {vue === "plaques" && calepinage && (
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div>
            <p className="text-slate-500">Plaques nécessaires</p>
            <p className="font-semibold text-white">{calepinage.nbPlaquesNecessaires}</p>
          </div>
          <div>
            <p className="text-slate-500">Pièces posées</p>
            <p className="font-semibold text-white">{calepinage.nbPiecesPosees}</p>
          </div>
          <div>
            <p className="text-slate-500">Taux de chute</p>
            <p className="font-semibold text-amber-300">{calepinage.tauxChutePct.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-slate-500">Joints</p>
            <p className="font-semibold text-white">{calepinage.nbJoints}</p>
          </div>
        </div>
      )}

      {estPignon && (
        <p className="text-xs italic text-emerald-400">
          ✓ Pignon complet calculé : rectangle + triangle de pente ({calepinage?.pentePct.toFixed(1) ?? "0.0"}%).
        </p>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span><span className="mr-1 inline-block h-3 w-3 rounded-sm bg-yellow-400 align-middle" /> Plaque pleine</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded-sm bg-orange-400 align-middle" /> Plaque coupée</span>
      </div>
    </div>
  );
}

const EPSILON_M = 0.0005;
