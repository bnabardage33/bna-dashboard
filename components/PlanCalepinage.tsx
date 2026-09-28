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

export type OuvertureCalepinage = {
  id: string;
  type: "fenetre" | "porte";
  largeur: number;
  hauteur: number;
};

export default function PlanCalepinage({
  largeurM,
  hauteurM,
  hauteurFaiteReelleM,
  pose,
  calepinage,
  estPignon,
  ouvertures,
}: {
  largeurM: number;
  hauteurM: number;
  hauteurFaiteReelleM: number | null;
  pose: ResultatPose | null;
  calepinage: ResultatCalepinage | null;
  estPignon: boolean;
  ouvertures?: OuvertureCalepinage[];
}) {
  const [vue, setVue] = useState<
    "ossature" | "plaques"
  >("ossature");
  const [pleinEcran, setPleinEcran] = useState(false);

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
const entraxeDefaut = calepinage?.entraxeReelMm
  ? calepinage.entraxeReelMm / 1000
  : 0.5;
const positionsX =
  pose.positionsChevronsM && pose.positionsChevronsM.length > 0
    ? pose.positionsChevronsM
    : (() => {
        const pos: number[] = [];
        for (let x = 0; x <= largeurM + 0.001; x += entraxeDefaut) {
          pos.push(Math.min(x, largeurM));
        }
        if (pos.length === 0 || Math.abs(pos[pos.length - 1] - largeurM) > 0.001) {
          pos.push(largeurM);
        }
        return pos;
      })();

    let numero = 1;

    for (const x of positionsX) {
      const segments = decouperChevron(
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
  type EquerreDessin = {
    xM: number;
    yM: number;
    chevron: number;
    type: "porteuse" | "guide";
  };

  const equerres: EquerreDessin[] = [];

  if (pose && pose.entraxeVertical > 0) {
    for (const chevron of chevrons) {
      const entraxeVertical = pose.entraxeVertical;
      const longueur = chevron.yFinM - chevron.yDebutM;
      if (longueur <= 0) continue;

      // Distance de rive conforme DTU 41.2 (15 cm du bord du chevron)
      const margeExt = Math.min(0.15, longueur / 4);
      const yBas = chevron.yDebutM + margeExt;
      const yHaut = chevron.yFinM - margeExt;

      // Équerre Haute = Porteuse (Point Fixe)
      equerres.push({
        xM: chevron.xM,
        yM: yHaut,
        chevron: chevron.numero,
        type: "porteuse",
      });

      // Équerres intermédiaires (Guides / Points Coulissants)
      let y = yBas + entraxeVertical;
      while (y < yHaut - 0.10) {
        equerres.push({
          xM: chevron.xM,
          yM: y,
          chevron: chevron.numero,
          type: "guide",
        });
        y += entraxeVertical;
      }

      // Équerre Basse = Guide (Point Coulissant, garantit au moins 2 équerres par segment)
      if (yHaut - yBas > 0.10) {
        equerres.push({
          xM: chevron.xM,
          yM: yBas,
          chevron: chevron.numero,
          type: "guide",
        });
      }
    }
  }

  return (
    <div
      className={
        pleinEcran
          ? "fixed inset-0 z-50 overflow-y-auto bg-slate-950/98 p-4 sm:p-8 space-y-4 backdrop-blur-md animate-in fade-in"
          : "space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3.5"
      }
    >
      {/* ====================================================== */}
      {/* EN-TÊTE */}
      {/* ====================================================== */}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Plan de calepinage dynamique
        </p>

        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
            <button
              type="button"
              onClick={() => setVue("ossature")}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                vue === "ossature"
                  ? "bg-sky-500 text-slate-950"
                  : "bg-slate-900 text-slate-400 hover:text-white"
              }`}
            >
              Ossature
            </button>

            <button
              type="button"
              onClick={() => setVue("plaques")}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                vue === "plaques"
                  ? "bg-sky-500 text-slate-950"
                  : "bg-slate-900 text-slate-400 hover:text-white"
              }`}
            >
              Plaques
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPleinEcran(!pleinEcran)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-bold text-sky-400 hover:bg-slate-800 transition-colors shadow-sm"
          >
            <span>{pleinEcran ? "✕ Réduire" : "⛶ Plein écran"}</span>
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
            {chevrons.map((chevron) => (
              <line
                key={`chevron-${chevron.numero}`}
                x1={px(chevron.xM)}
                y1={py(chevron.yDebutM + (chevron.yDebutM > 0 ? 0.015 : 0))}
                x2={px(chevron.xM)}
                y2={py(chevron.yFinM - 0.015)}
                stroke="#38bdf8"
                strokeWidth={4.5}
                strokeLinecap="round"
              />
            ))}

            {/* ÉQUERRES */}
            {equerres.map((equerre, index) => (
              <g key={`equerre-${equerre.chevron}-${index}`}>
                {equerre.type === "porteuse" ? (
                  // Équerre Porteuse (Point Fixe) : rouge vif avec cercle central
                  <>
                    <circle
                      cx={px(equerre.xM)}
                      cy={py(equerre.yM)}
                      r={5}
                      fill="#ef4444"
                      stroke="#fecaca"
                      strokeWidth={1.5}
                    />
                    <circle
                      cx={px(equerre.xM)}
                      cy={py(equerre.yM)}
                      r={1.5}
                      fill="#ffffff"
                    />
                  </>
                ) : (
                  // Équerre Guide (Point Coulissant) : orange ambre
                  <circle
                    cx={px(equerre.xM)}
                    cy={py(equerre.yM)}
                    r={4}
                    fill="#f59e0b"
                    stroke="#fef3c7"
                    strokeWidth={1}
                  />
                )}
              </g>
            ))}

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

                    {(() => {
                      const hasPoints = p.points && p.points.length >= 3;
                      const labelX = hasPoints
                        ? px(p.points!.reduce((s, pt) => s + pt.xM, 0) / p.points!.length)
                        : px(p.xM) + (p.largeurM * echelle) / 2;
                      const labelY = hasPoints
                        ? py(p.points!.reduce((s, pt) => s + pt.yM, 0) / p.points!.length)
                        : py(p.yM + p.hauteurM / 2);

                      return (
                        (p.surfaceM2 > 0.08 || (p.largeurM * echelle > 30 && p.hauteurM * echelle > 15)) && (
                          <g>
                            {p.repere && (
                              <text
                                x={labelX}
                                y={labelY - (p.hauteurM * echelle > 28 ? 6 : 0)}
                                fill="#0f172a"
                                fontSize={p.hauteurM * echelle > 28 ? 10 : 8}
                                fontWeight="900"
                                textAnchor="middle"
                                dominantBaseline="middle"
                              >
                                {p.repere}
                              </text>
                            )}
                            {p.hauteurM * echelle > 28 && (
                              <text
                                x={labelX}
                                y={labelY + 7}
                                fill="#0f172a"
                                fontSize={8}
                                fontWeight="bold"
                                textAnchor="middle"
                                dominantBaseline="middle"
                              >
                                {(p.largeurM * 1000).toFixed(0)}×{(p.hauteurM * 1000).toFixed(0)}
                              </text>
                            )}
                          </g>
                        )
                      );
                    })()}
                  </g>
                )
              )}
            </g>
          )}

          {/* ====================================================== */}
          {/* OUVERTURES (Fenêtres / Portes) */}
          {/* ====================================================== */}
          {ouvertures && ouvertures.length > 0 && (
            <g className="ouvertures">
              {ouvertures.map((ouv, idx) => {
                const spacing = largeurM / (ouvertures.length + 1);
                const ouvX = Math.max(0.2, Math.min(largeurM - ouv.largeur - 0.2, spacing * (idx + 1) - ouv.largeur / 2));
                const ouvY = ouv.type === "porte" ? 0 : Math.min(1.0, Math.max(0.2, (hauteurM - ouv.hauteur) / 2));
                const svgX = px(ouvX);
                const svgY = py(ouvY + ouv.hauteur);
                const svgW = ouv.largeur * echelle;
                const svgH = ouv.hauteur * echelle;

                return (
                  <g key={`ouv-${ouv.id || idx}`}>
                    <rect
                      x={svgX}
                      y={svgY}
                      width={svgW}
                      height={svgH}
                      fill="#0f172a"
                      fillOpacity={0.75}
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                    />
                    <text
                      x={svgX + svgW / 2}
                      y={svgY + svgH / 2 - 6}
                      fill="#f8fafc"
                      fontSize={11}
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {ouv.type === "porte" ? "🚪 PORTE" : "🪟 FENÊTRE"}
                    </text>
                    <text
                      x={svgX + svgW / 2}
                      y={svgY + svgH / 2 + 8}
                      fill="#94a3b8"
                      fontSize={9}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {ouv.largeur.toFixed(2)}m × {ouv.hauteur.toFixed(2)}m
                    </text>
                  </g>
                );
              })}
            </g>
          )}
      </svg>

      {/* ====================================================== */}
      {/* INFOS OSSATURE */}
      {/* ====================================================== */}

      {vue === "ossature" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-2">
              <p className="text-2xs uppercase text-slate-400">Lignes montants</p>
              <p className="text-base font-bold text-white">
                {pose ? pose.nbMontants : chevrons.length}
              </p>
              <p className="text-2xs text-slate-500">
                Entraxe HPL : {pose && pose.entraxeHorizontal
                  ? `${(pose.entraxeHorizontal * 100).toFixed(0)} cm`
                  : "—"}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-2">
              <p className="text-2xs uppercase text-slate-400">Chevrons (max 3m)</p>
              <p className="text-base font-bold text-sky-400">
                {chevrons.length} chevrons
              </p>
              <p className="text-2xs text-slate-500">
                ~{pose ? pose.lineaireChevronsM.toFixed(1) : 0} ml total
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-2">
              <p className="text-2xs uppercase text-slate-400">Équerres Isolco</p>
              <p className="text-base font-bold text-red-400">
                {equerres.length} équerres
              </p>
              <p className="text-2xs text-slate-500">
                {equerres.length * 2} chevilles Spit MP3-S
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-2">
              <p className="text-2xs uppercase text-slate-400">Bande EPDM (80mm)</p>
              <p className="text-base font-bold text-emerald-400">
                {pose ? pose.lineaireBandeEPDMM : 0} ml
              </p>
              <p className="text-2xs text-slate-500">
                Entraxe vert. {pose ? `${Math.round(pose.entraxeVertical * 100)} cm` : "135 cm"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-3xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-red-200 bg-red-500"></span>
              Équerre Porteuse (Point Fixe en tête) : {pose ? pose.nbEquerresPorteuses : chevrons.length}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-amber-200 bg-amber-500"></span>
              Équerre Guide (Point Coulissant) : {pose ? pose.nbEquerresGuides : equerres.length - chevrons.length}
            </span>
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* INFOS PLAQUES & NESTING */}
      {/* ====================================================== */}

      {vue === "plaques" &&
        calepinage && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-2">
                <p className="text-2xs uppercase text-slate-400">Plaques brutes à cder</p>
                <p className="text-base font-bold text-white">
                  {calepinage.nbPlaquesNecessaires}
                </p>
                <p className="text-2xs text-slate-500">
                  {calepinage.plaqueBruteLongueurMm}×{calepinage.plaqueBruteLargeurMm} mm
                </p>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-2">
                <p className="text-2xs uppercase text-slate-400">Modules posés</p>
                <p className="text-base font-bold text-sky-400">
                  {calepinage.nbPiecesPosees}
                </p>
                <p className="text-2xs text-slate-500">
                  Trame {calepinage.moduleCibleLargeurMm}×{calepinage.moduleCibleHauteurMm} mm
                </p>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-2">
                <p className="text-2xs uppercase text-slate-400">Taux de chute réel</p>
                <p
                  className={`text-base font-bold ${
                    calepinage.tauxChutePct <= 15 ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {calepinage.tauxChutePct.toFixed(1)} %
                </p>
                <p className="text-2xs text-slate-500">
                  {(calepinage.surfacePlaquesAchetesM2 - calepinage.surfaceZoneM2).toFixed(2)} m² chute
                </p>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-2">
                <p className="text-2xs uppercase text-slate-400">Rendement de débit</p>
                <p className="text-base font-bold text-white">
                  ~{calepinage.modulesParPlaqueBrute} <span className="text-xs font-normal text-slate-400">mod./plaque</span>
                </p>
                <p className="text-2xs text-slate-500">
                  {calepinage.nbJoints} joints façade
                </p>
              </div>
            </div>

            <p className="text-3xs text-slate-400 italic">
              💡 Imbrication 2D : {calepinage.nbPiecesPosees} modules débités dans {calepinage.nbPlaquesNecessaires} plaques brutes ({calepinage.surfacePlaquesAchetesM2.toFixed(1)} m² bruts pour {calepinage.surfaceZoneM2.toFixed(1)} m² nets posés).
            </p>
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
