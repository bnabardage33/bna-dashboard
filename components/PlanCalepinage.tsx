"use client";

import { useState } from "react";
import { ResultatPose } from "@/lib/poseCalcul";
import { ResultatCalepinage } from "@/lib/calepinageCalcul";

const MARGE_SVG = 40;
const LARGEUR_MAX_SVG = 700;

// Longueur maximale d'un chevron.
const LONGUEUR_MAX_CHEVRON_M = 3;

type SegmentChevron = {
  xM: number;
  yDebutM: number;
  yFinM: number;
  numero: number;
};

/**
 * Calcule la hauteur disponible du pignon
 * à une position X donnée.
 *
 * Le pignon est considéré comme symétrique :
 * mur -> faîtage -> mur.
 */
function hauteurPignonA(
  xM: number,
  largeurM: number,
  hauteurMurM: number,
  hauteurFaiteM: number
): number {
  if (largeurM <= 0) {
    return hauteurMurM;
  }

  const demiLargeur = largeurM / 2;
  const deltaHauteur = hauteurFaiteM - hauteurMurM;

  if (deltaHauteur <= 0) {
    return hauteurMurM;
  }

  // Côté gauche du pignon
  if (xM <= demiLargeur) {
    return (
      hauteurMurM +
      (xM / demiLargeur) * deltaHauteur
    );
  }

  // Côté droit du pignon
  return (
    hauteurMurM +
    ((largeurM - xM) / demiLargeur) *
      deltaHauteur
  );
}

/**
 * Découpe un chevron selon sa longueur réelle.
 *
 * Exemple :
 *
 * 4,70 m
 *
 * -> 3,00 m
 * -> 1,70 m
 *
 * Chaque segment est considéré comme
 * un chevron indépendant et reçoit donc
 * ses propres équerres.
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

  if (hauteurTotale <= 0) {
    return [];
  }

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
  hauteurFaiteReelleM,
  pose,
  calepinage,
  estPignon,
}: {
  largeurM: number;
  hauteurM: number;
  hauteurFaiteReelleM: number | null;
  pose: ResultatPose | null;
  calepinage: ResultatCalepinage | null;
  estPignon: boolean;
}) {
  const [vue, setVue] = useState<
    "ossature" | "plaques"
  >("ossature");

  if (largeurM <= 0 || hauteurM <= 0) {
    return null;
  }

  /*
   * Hauteur réelle du faîtage.
   *
   * Pour une façade :
   * hauteur du plan = hauteur du mur.
   *
   * Pour un pignon :
   * hauteur du plan = hauteur du faîtage.
   */
  const hauteurFaiteCalculeeM = estPignon
    ? Math.max(
        hauteurM,
        hauteurFaiteReelleM ?? hauteurM
      )
    : hauteurM;

  const hauteurPlanM = estPignon
    ? hauteurFaiteCalculeeM
    : hauteurM;

  /*
   * Échelle SVG.
   */
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
   * ============================================================
   * CHEVRONS
   * ============================================================
   *
   * Chaque chevron est calculé individuellement.
   *
   * Règle :
   * maximum 3 mètres par chevron.
   */
  const chevrons: SegmentChevron[] = [];

  if (pose) {
    const entraxe =
      pose.entraxeHorizontal ?? largeurM;

    if (entraxe > 0) {
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

      /*
       * On garantit toujours un chevron
       * sur le bord droit.
       */
      if (
        positionsX.length === 0 ||
        Math.abs(
          positionsX[
            positionsX.length - 1
          ] - largeurM
        ) > 0.001
      ) {
        positionsX.push(largeurM);
      }

      let numero = 1;

      for (const x of positionsX) {
        const segments =
          decouperChevron(
            x,
            hauteurM,
            estPignon,
            largeurM,
            hauteurM,
            hauteurFaiteCalculeeM,
            numero
          );

        chevrons.push(...segments);

        numero += segments.length;
      }
    }
  }

  /*
   * ============================================================
   * ÉQUERRES
   * ============================================================
   *
   * Chaque morceau de chevron est indépendant.
   *
   * Exemple :
   *
   * C1 = 3,00 m
   * C2 = 1,70 m
   *
   * C1 possède ses équerres.
   * C2 possède ses propres équerres.
   */
  const equerres: {
    xM: number;
    yM: number;
    chevron: number;
  }[] = [];

  if (
    pose &&
    pose.entraxeVertical > 0
  ) {
    for (const chevron of chevrons) {
      const entraxeVertical =
        pose.entraxeVertical;

      let y =
        chevron.yDebutM;

      /*
       * Première équerre.
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
       * Dernière équerre.
       */
      if (
        chevron.yFinM - y >
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
      {/* ====================================================== */}
      {/* EN-TÊTE */}
      {/* ====================================================== */}

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

      {/* ====================================================== */}
      {/* PLAN SVG */}
      {/* ====================================================== */}

      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        className="w-full rounded bg-slate-950"
      >
        {/* ==================================================== */}
        {/* CONTOUR DE LA ZONE */}
        {/* ==================================================== */}

        {estPignon ? (
          <polygon
            points={`
              ${px(0)},${py(0)}
              ${px(largeurM)},${py(0)}
              ${px(largeurM)},${py(hauteurM)}
              ${px(
                largeurM / 2
              )},${py(
                hauteurFaiteCalculeeM
              )}
              ${px(0)},${py(hauteurM)}
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

        {/* ==================================================== */}
        {/* OSSATURE */}
        {/* ==================================================== */}

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
              (equerre, index) => (
                <circle
                  key={`equerre-${equerre.chevron}-${index}`}
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

        {/* ==================================================== */}
        {/* PLAQUES */}
        {/* ==================================================== */}

        {vue === "plaques" &&
          calepinage && (
            <g>
              {calepinage.pieces.map(
                (p, index) => (
                  <g
                    key={`piece-${index}`}
                  >
                    {/*
                     * Pour un pignon, chaque pièce peut avoir été
                     * découpée par la pente du toit (p.points).
                     * Dans ce cas on dessine le polygone réel
                     * plutôt qu'un rectangle plein, sinon la pièce
                     * déborderait visuellement au-dessus du rampant.
                     */}

                    {p.points ? (
                      <polygon
                        points={p.points
                          .map(
                            (pt) =>
                              `${px(
                                pt.xM
                              )},${py(
                                pt.yM
                              )}`
                          )
                          .join(" ")}
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
                    ) : (
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
                    )}

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

      {/* ====================================================== */}
      {/* INFOS OSSATURE */}
      {/* ====================================================== */}

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

      {/* ====================================================== */}
      {/* INFOS PLAQUES */}
      {/* ====================================================== */}

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

      {/* ====================================================== */}
      {/* RÈGLE MÉTIER */}
      {/* ====================================================== */}

      <p className="text-xs text-slate-500">
        Chevron limité à 3,00 m. Chaque segment
        possède ses propres équerres.
      </p>
    </div>
  );
    }
