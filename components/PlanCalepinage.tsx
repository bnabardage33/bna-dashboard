"use client";

import { useState } from "react";
import { ResultatPose } from "@/lib/poseCalcul";
import { ResultatCalepinage } from "@/lib/calepinageCalcul";

const MARGE_SVG = 40;
const LARGEUR_MAX_SVG = 700;

// Longueur maximale réglementaire / chantier d'un chevron.
const LONGUEUR_MAX_CHEVRON_M = 3;

type SegmentChevron = {
  xM: number;
  yDebutM: number;
  yFinM: number;
  numero: number;
};

function hauteurPignonA(
  xM: number,
  largeurM: number,
  hauteurMurM: number,
  hauteurFaiteM: number
) {
  if (largeurM <= 0) return hauteurMurM;

  const demiLargeur = largeurM / 2;
  const deltaHauteur = hauteurFaiteM - hauteurMurM;

  // Pignon symétrique :
  // montée jusqu'au faîtage puis descente.
  if (xM <= demiLargeur) {
    return hauteurMurM + (xM / demiLargeur) * deltaHauteur;
  }

  return (
    hauteurMurM +
    ((largeurM - xM) / demiLargeur) * deltaHauteur
  );
}

/**
 * Découpe un chevron selon sa longueur réelle.
 *
 * Exemple :
 * 4,70 m
 *   -> 3,00 m
 *   -> 1,70 m
 *
 * Chaque segment est ensuite traité comme un vrai chevron
 * et reçoit ses propres équerres.
 */
function decouperChevron(
  xM: number,
  hauteurM: number,
  estPignon: boolean,
  largeurM: number,
  hauteurMurM: number,
  hauteurFaiteM: number,
  numeroDepart: number
): SegmentChevron[] {
  let hauteurTotale = hauteurM;

  if (estPignon) {
    hauteurTotale = hauteurPignonA(
      xM,
      largeurM,
      hauteurMurM,
      hauteurFaiteM
    );
  }

  if (hauteurTotale <= 0) return [];

  const segments: SegmentChevron[] = [];

  let reste = hauteurTotale;
  let yDebut = 0;
  let numero = numeroDepart;

  while (reste > 0.001) {
    const longueur = Math.min(
      LONGUEUR_MAX_CHEVRON_M,
      reste
    );

    segments.push({
      xM,
      yDebutM: yDebut,
      yFinM: yDebut + longueur,
      numero,
    });

    yDebut += longueur;
    reste -= longueur;
    numero++;
  }

  return segments;
}

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
  const [vue, setVue] = useState<
    "ossature" | "plaques"
  >("ossature");

  if (largeurM <= 0 || hauteurM <= 0) return null;

  const hauteurFaiteM = estPignon
    ? Math.max(hauteurM, pose?.hauteurFaiteM ?? hauteurM)
    : hauteurM;

  const hauteurPlanM = estPignon
    ? hauteurFaiteM
    : hauteurM;

  const echelle =
    LARGEUR_MAX_SVG / largeurM;

  const largeurSvg =
    largeurM * echelle;

  const hauteurSvg =
    hauteurPlanM * echelle;

  const viewW =
    largeurSvg + MARGE_SVG * 2;

  const viewH =
    hauteurSvg + MARGE_SVG * 2;

  const px = (xM: number) =>
    MARGE_SVG + xM * echelle;

  const py = (yM: number) =>
    MARGE_SVG +
    (hauteurPlanM - yM) * echelle;

  /*
   * Génération dynamique des chevrons.
   */
  const chevrons: SegmentChevron[] = [];

  if (pose) {
    const entraxe =
      pose.entraxeHorizontal ??
      largeurM;

    const positionsX: number[] = [];

    for (
      let x = 0;
      x <= largeurM + 0.001;
      x += entraxe
    ) {
      positionsX.push(
        Math.min(x, largeurM)
      );
    }

    if (
      positionsX.length === 0 ||
      positionsX[positionsX.length - 1] !== largeurM
    ) {
      positionsX.push(largeurM);
    }

    let numero = 1;

    for (const x of positionsX) {
      const segments = decouperChevron(
        x,
        hauteurM,
        estPignon,
        largeurM,
        hauteurM,
        hauteurFaiteM,
        numero
      );

      chevrons.push(...segments);

      numero += segments.length;
    }
  }

  /*
   * Équerres.
   *
   * Chaque segment de chevron est indépendant.
   * Une coupure à 3 m crée donc un nouveau chevron
   * avec ses propres équerres.
   */
  const equerres: {
    xM: number;
    yM: number;
    chevron: number;
  }[] = [];

  if (pose) {
    for (const chevron of chevrons) {
      const entraxeVertical =
        pose.entraxeVertical;

      if (
        entraxeVertical <= 0
      ) {
        continue;
      }

      let y =
        chevron.yDebutM;

      /*
       * Première équerre au début du segment.
       */
      equerres.push({
        xM: chevron.xM,
        yM: y,
        chevron: chevron.numero,
      });

      /*
       * Équerres intermédiaires.
       */
      while (
        y + entraxeVertical <
        chevron.yFinM - 0.001
      ) {
        y += entraxeVertical;

        equerres.push({
          xM: chevron.xM,
          yM: y,
          chevron: chevron.numero,
        });
      }

      /*
       * Dernière équerre à la fin du chevron.
       */
      if (
        chevron.yFinM -
          y >
        0.001
      ) {
        equerres.push({
          xM: chevron.xM,
          yM: chevron.yFinM,
          chevron: chevron.numero,
        });
      }
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Plan de calepinage dynamique
        </p>

        <div className="flex overflow-hidden rounded-lg border border-slate-600">
          <button
            type="button"
            onClick={() =>
              setVue("ossature")
            }
            className={`px-3 py-1 text-xs font-medium ${
              vue === "ossature"
                ? "bg-sky-600 text-white"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            Ossature
          </button>

          <button
            type="button"
            onClick={() =>
              setVue("plaques")
            }
            className={`px-3 py-1 text-xs font-medium ${
              vue === "plaques"
                ? "bg-red-600 text-white"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            Plaques
          </button>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        className="w-full rounded bg-slate-950"
      >
        {/* Contour réel de la zone */}
        {estPignon ? (
          <polygon
            points={`
              ${px(0)},${py(0)}
              ${px(largeurM)},${py(0)}
              ${px(
                largeurM / 2
              )},${py(
                hauteurFaiteM
              )}
            `}
            fill="none"
            stroke="#64748b"
            strokeWidth={2}
          />
        ) : (
          <rect
            x={MARGE_SVG}
            y={MARGE_SVG}
            width={largeurSvg}
            height={hauteurSvg}
            fill="none"
            stroke="#64748b"
            strokeWidth={2}
          />
        )}

        {vue === "ossature" && (
          <g>
            {/* CHEVRONS */}
            {chevrons.map(
              (chevron) => (
                <line
                  key={`chevron-${chevron.numero}`}
                  x1={px(
                    chevron.xM
                  )}
                  y1={py(
                    chevron.yDebutM
                  )}
                  x2={px(
                    chevron.xM
                  )}
                  y2={py(
                    chevron.yFinM
                  )}
                  stroke="#38bdf8"
                  strokeWidth={4}
                />
              )
            )}

            {/* ÉQUERRES */}
            {equerres.map(
              (equerre, i) => (
                <circle
                  key={`equerre-${equerre.chevron}-${i}`}
                  cx={px(
                    equerre.xM
                  )}
                  cy={py(
                    equerre.yM
                  )}
                  r={4}
                  fill="#f87171"
                  stroke="#fecaca"
                  strokeWidth={1}
                />
              )
            )}

            {/* NUMÉROS DES CHEVRONS */}
            {chevrons.map(
              (chevron) => (
                <text
                  key={`numero-${chevron.numero}`}
                  x={
                    px(
                      chevron.xM
                    ) + 6
                  }
                  y={py(
                    (chevron.yDebutM +
                      chevron.yFinM) /
                      2
                  )}
                  fill="#e2e8f0"
                  fontSize={9}
                >
                  C{chevron.numero}
                </text>
              )
            )}
          </g>
        )}

        {vue === "plaques" &&
          calepinage && (
            <g>
              {calepinage.pieces.map(
                (p, i) => (
                  <g key={i}>
                    <rect
                      x={px(p.xM)}
                      y={py(
                        p.yM +
                          p.hauteurM
                      )}
                      width={
                        p.largeurM *
                        echelle
                      }
                      height={
                        p.hauteurM *
                        echelle
                      }
                      fill={
                        p.type ===
                        "pleine"
                          ? "#38bdf8"
                          : "#f59e0b"
                      }
                      fillOpacity={0.65}
                      stroke="#f8fafc"
                      strokeWidth={1.5}
                    />

                    {p.largeurM *
                        echelle >
                        45 &&
                      p.hauteurM *
                        echelle >
                        20 && (
                        <text
                          x={
                            px(
                              p.xM
                            ) +
                            (p.largeurM *
                              echelle) /
                              2
                          }
                          y={py(
                            p.yM +
                              p.hauteurM /
                                2
                          )}
                          fill="#0f172a"
                          fontSize={10}
                          fontWeight="600"
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          {(
                            p.largeurM *
                            1000
                          ).toFixed(0)}
                          ×
                          {(
                            p.hauteurM *
                            1000
                          ).toFixed(0)}
                        </text>
                      )}
                  </g>
                )
              )}
            </g>
          )}
      </svg>

      {vue === "ossature" && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-slate-500">
              Chevrons
            </p>
            <p className="font-semibold text-white">
              {chevrons.length}
            </p>
          </div>

          <div>
            <p className="text-slate-500">
              Équerres
            </p>
            <p className="font-semibold text-white">
              {equerres.length}
            </p>
          </div>

          <div>
            <p className="text-slate-500">
              Max / chevron
            </p>
            <p className="font-semibold text-white">
              3,00 m
            </p>
          </div>
        </div>
      )}

      {vue === "plaques" &&
        calepinage && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-slate-500">
                Plaques nécessaires
              </p>
              <p className="font-semibold text-white">
                {
                  calepinage.nbPlaquesNecessaires
                }
              </p>
            </div>

            <div>
              <p className="text-slate-500">
                Taux de chute
              </p>
              <p className="font-semibold text-amber-400">
                {calepinage.tauxChutePct.toFixed(
                  1
                )}
                %
              </p>
            </div>

            <div>
              <p className="text-slate-500">
                Joints
              </p>
              <p className="font-semibold text-white">
                {calepinage.nbJoints}
              </p>
            </div>
          </div>
        )}

      <p className="text-xs text-slate-500">
        Chevron limité à 3,00 m. Chaque segment
        possède ses propres équerres.
      </p>
    </div>
  );
                }
