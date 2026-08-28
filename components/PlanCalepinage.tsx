// components/PlanCalepinage.tsx
"use client";

import { useState } from "react";
import { ResultatPose } from "@/lib/poseCalcul";
import { ResultatCalepinage, PieceCalepinage } from "@/lib/calepinageCalcul";
import { ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, Info, CheckCircle2 } from "lucide-react";

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

type OuvertureCalepinage = {
  id: string;
  type: "fenetre" | "porte" | "baie" | "porte_fenetre";
  largeur: number; // m
  hauteur: number; // m
  /** X : distance depuis l'angle gauche du mur (m) */
  distanceAngleGaucheM?: number;
  /** Y : hauteur d'allège en mm (0 pour portes/baies) */
  hauteurAllegeMm?: number;
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
    return hauteurMurM + (xM / demiLargeur) * deltaHauteur;
  }

  // Côté droit du pignon
  return hauteurMurM + ((largeurM - xM) / demiLargeur) * deltaHauteur;
}

/**
 * Découpe un chevron selon sa longueur réelle.
 *
 * Exemple :
 * 4,70 m -> 3,00 m + 1,70 m
 * Chaque segment est un chevron indépendant.
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
    const longueur = Math.min(LONGUEUR_MAX_CHEVRON_M, reste);

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
  const [vue, setVue] = useState<"ossature" | "plaques">("plaques");
  const [pleinEcran, setPleinEcran] = useState(false);
  const [zoom, setZoom] = useState<number>(1);
  const [panneauSelectionne, setPanneauSelectionne] = useState<PieceCalepinage | null>(null);

  if (largeurM <= 0 || hauteurM <= 0) {
    return null;
  }

  /*
   * Hauteur réelle du faîtage.
   */
  const hauteurFaiteCalculeeM = estPignon
    ? Math.max(hauteurM, hauteurFaiteReelleM ?? hauteurM)
    : hauteurM;

  const hauteurPlanM = estPignon ? hauteurFaiteCalculeeM : hauteurM;

  /*
   * Échelle SVG de base
   */
  const echelle = LARGEUR_MAX_SVG / largeurM;
  const largeurSvg = largeurM * echelle;
  const hauteurSvg = hauteurPlanM * echelle;

  const viewW = largeurSvg + MARGE_SVG * 2;
  const viewH = hauteurSvg + MARGE_SVG * 2;

  const px = (xM: number) => MARGE_SVG + xM * echelle;
  const py = (yM: number) => MARGE_SVG + (hauteurPlanM - yM) * echelle;

  /*
   * CHEVRONS & OSSATURE
   */
  const chevrons: SegmentChevron[] = [];

  if (pose) {
    const positionsX =
      pose.positionsChevronsM && pose.positionsChevronsM.length > 0
        ? pose.positionsChevronsM
        : (() => {
            const entraxe = pose.entraxeHorizontal ?? 0.6;
            const pos: number[] = [];
            for (let x = 0; x <= largeurM + 0.001; x += entraxe) {
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

      // Équerres intermédiaires (Guides)
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

      // Équerre Basse = Guide
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
          ? "fixed inset-0 z-50 flex flex-col bg-slate-950/98 p-3 sm:p-6 backdrop-blur-md animate-in fade-in"
          : "space-y-3 rounded-2xl border border-slate-700 bg-slate-900/80 p-3.5 shadow-xl"
      }
    >
      {/* ====================================================== */}
      {/* BARRE D'OUTILS & CONTRÔLES INTERACTIFS */}
      {/* ====================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-500/20 text-xs font-bold text-sky-400">
            2D
          </span>
          <div>
            <p className="text-xs font-bold text-slate-100 uppercase tracking-wide">
              Élévation de Façade &amp; Calepinage
            </p>
            <p className="text-[10px] text-slate-400">
              Joint 8 mm DTU 41.2 · {largeurM.toFixed(2)} × {hauteurPlanM.toFixed(2)} m
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Bascule Vue Ossature / Plaques */}
          <div className="flex overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-0.5">
            <button
              type="button"
              onClick={() => setVue("plaques")}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                vue === "plaques"
                  ? "bg-sky-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Panneaux &amp; Joints
            </button>
            <button
              type="button"
              onClick={() => setVue("ossature")}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                vue === "ossature"
                  ? "bg-sky-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Ossature &amp; Équerres
            </button>
          </div>

          {/* Contrôles de Zoom */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 p-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.15).toFixed(2))))}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              title="Zoom arrière"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="rounded-lg px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:bg-slate-800"
              title="Réinitialiser zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              title="Zoom avant"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                title="Reset zoom"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Bouton Plein Écran */}
          <button
            type="button"
            onClick={() => setPleinEcran(!pleinEcran)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-sky-400 hover:bg-slate-800 transition-colors shadow-sm"
          >
            {pleinEcran ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                <span>Réduire</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Plein écran</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ====================================================== */}
      {/* POPOVER / INFO-BULLE DÉTAIL DU PANNEAU SÉLECTIONNÉ */}
      {/* ====================================================== */}
      {panneauSelectionne && vue === "plaques" && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-500/40 bg-sky-950/30 p-2.5 text-xs animate-in fade-in slide-in-from-top-1">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="rounded-lg bg-sky-500 px-2 py-0.5 text-xs font-black text-slate-950">
                {panneauSelectionne.repere}
              </span>
              <span className="font-bold text-slate-100">
                {panneauSelectionne.type === "pignon"
                  ? "Rampant pignon"
                  : panneauSelectionne.type === "coupe"
                  ? "Rive ajustée"
                  : "Module standard"}
              </span>
            </div>

            <div className="text-slate-300">
              Cote nette débitée :{" "}
              <strong className="text-amber-400 font-mono">
                {panneauSelectionne.largeurNetteMm || Math.round(panneauSelectionne.largeurM * 1000)} ×{" "}
                {panneauSelectionne.hauteurNetteMm || Math.round(panneauSelectionne.hauteurM * 1000)} mm
              </strong>
            </div>

            <div className="text-slate-400 hidden sm:inline">
              Trame : {(panneauSelectionne.largeurM * 1000).toFixed(0)} × {(panneauSelectionne.hauteurM * 1000).toFixed(0)} mm
            </div>

            <div className="text-slate-400">
              Pos. : Rangée {panneauSelectionne.rangee + 1}, Col. {panneauSelectionne.colonne + 1}
            </div>

            <div className="text-slate-400 font-mono">
              Surface : {panneauSelectionne.surfaceM2.toFixed(2)} m²
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPanneauSelectionne(null)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Fermer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ====================================================== */}
      {/* ZONE DE DESSIN SVG AVEC ZOOM INTERACTIF */}
      {/* ====================================================== */}
      <div
        className={`overflow-auto rounded-2xl bg-slate-950 p-2 sm:p-4 shadow-inner border border-slate-800/80 ${
          pleinEcran ? "flex-1 min-h-0 flex items-center justify-center" : ""
        }`}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            transition: "transform 0.15s ease-out",
          }}
          className="inline-block"
        >
          <svg
            viewBox={`0 0 ${viewW} ${viewH}`}
            width={viewW}
            height={viewH}
            className="select-none block"
            style={{ minWidth: "420px", maxWidth: "100%" }}
          >
            <defs>
              {/* Ombre portée subtile */}
              <filter id="panel-shadow" x="-5%" y="-5%" width="110%" height="110%">
                <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000000" floodOpacity="0.4" />
              </filter>
            </defs>

            {/* ==================================================== */}
            {/* FOND DU MUR & GABARIT FAÇADE / PIGNON */}
            {/* ==================================================== */}
            {estPignon ? (
              <polygon
                points={`
                  ${px(0)},${py(0)}
                  ${px(largeurM)},${py(0)}
                  ${px(largeurM)},${py(hauteurM)}
                  ${px(largeurM / 2)},${py(hauteurFaiteCalculeeM)}
                  ${px(0)},${py(hauteurM)}
                `}
                fill="#0f172a"
                stroke="#334155"
                strokeWidth={2}
              />
            ) : (
              <rect
                x={px(0)}
                y={py(hauteurM)}
                width={largeurSvg}
                height={hauteurSvg}
                fill="#0f172a"
                stroke="#334155"
                strokeWidth={2}
              />
            )}

            {/* ==================================================== */}
            {/* OSSATURE BOIS (CHEVRONS) */}
            {/* ==================================================== */}
            {vue === "ossature" && (
              <g className="chevrons">
                {chevrons.map((chevron, idx) => (
                  <g key={`chevron-${idx}`}>
                    <line
                      x1={px(chevron.xM)}
                      y1={py(chevron.yDebutM)}
                      x2={px(chevron.xM)}
                      y2={py(chevron.yFinM)}
                      stroke="#fbbf24"
                      strokeWidth={4}
                      strokeLinecap="square"
                    />
                    <text
                      x={px(chevron.xM) + 6}
                      y={py((chevron.yDebutM + chevron.yFinM) / 2)}
                      fill="#fef08a"
                      fontSize={9}
                      fontWeight="bold"
                    >
                      C{chevron.numero}
                    </text>
                  </g>
                ))}
              </g>
            )}

            {/* ==================================================== */}
            {/* ÉQUERRES */}
            {/* ==================================================== */}
            {vue === "ossature" && (
              <g className="equerres">
                {equerres.map((eq, index) => (
                  <circle
                    key={`eq-${index}`}
                    cx={px(eq.xM)}
                    cy={py(eq.yM)}
                    r={eq.type === "porteuse" ? 4.5 : 3.5}
                    fill={eq.type === "porteuse" ? "#ef4444" : "#38bdf8"}
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                ))}
              </g>
            )}

            {/* ==================================================== */}
            {/* PANNEAUX RECTANGULAIRES UNIFORMES (COULEUR UNIQUE & JOINTS 8 MM) */}
            {/* ==================================================== */}
            {vue === "plaques" && calepinage && (
              <g className="panneaux">
                {calepinage.pieces.map((p, index) => {
                  const jointMm = calepinage.jointMm ?? 8;
                  const jointPx = Math.max(1.5, (jointMm / 1000) * echelle);

                  const estSelectionne = panneauSelectionne?.id === p.id;

                  // Dimensions à l'écran en pixels pour le masquage adaptatif du texte
                  const wPx = p.largeurM * echelle * zoom;
                  const hPx = p.hauteurM * echelle * zoom;
                  const peutAfficherTexte = wPx >= 44 && hPx >= 26;

                  // Couleur UNIQUE et uniforme (Bleu Acier Épuré) pour tous les modules
                  const fillCouleur = "#0284c7";
                  const strokeCouleur = estSelectionne ? "#ffffff" : "#38bdf8";
                  const fillOpacity = estSelectionne ? 0.85 : 0.42;

                  const dimNette = `${p.largeurNetteMm || Math.round(p.largeurM * 1000)}×${p.hauteurNetteMm || Math.round(p.hauteurM * 1000)}`;

                  const estPolygonePignon = estPignon && p.type === "pignon" && p.points && p.points.length >= 3;

                  return (
                    <g
                      key={`piece-${index}`}
                      onClick={() => setPanneauSelectionne(p)}
                      className="cursor-pointer group"
                    >
                      {estPolygonePignon ? (
                        <polygon
                          points={p.points!.map((pt) => `${px(pt.xM)},${py(pt.yM)}`).join(" ")}
                          fill={fillCouleur}
                          fillOpacity={fillOpacity}
                          stroke={strokeCouleur}
                          strokeWidth={estSelectionne ? 2.5 : 1}
                          className="transition-all hover:fill-opacity-70"
                        />
                      ) : (
                        <rect
                          x={px(p.xM) + jointPx / 2}
                          y={py(p.yM + p.hauteurM) + jointPx / 2}
                          width={Math.max(2, p.largeurM * echelle - jointPx)}
                          height={Math.max(2, p.hauteurM * echelle - jointPx)}
                          fill={fillCouleur}
                          fillOpacity={fillOpacity}
                          stroke={strokeCouleur}
                          strokeWidth={estSelectionne ? 2.5 : 1}
                          rx={1.5}
                          className="transition-all hover:fill-opacity-70"
                        />
                      )}

                      {/* Nomenclature & Dimensions conditionnelles selon la taille à l'écran */}
                      {peutAfficherTexte && (() => {
                        const hasPoints = p.points && p.points.length >= 3;
                        const labelX = hasPoints
                          ? px(p.points!.reduce((s, pt) => s + pt.xM, 0) / p.points!.length)
                          : px(p.xM) + (p.largeurM * echelle) / 2;
                        const labelY = hasPoints
                          ? py(p.points!.reduce((s, pt) => s + pt.yM, 0) / p.points!.length)
                          : py(p.yM + p.hauteurM / 2);

                        const showDimensions = hPx >= 36 && wPx >= 55;

                        return (
                          <g className="pointer-events-none">
                            <text
                              x={labelX}
                              y={labelY - (showDimensions ? 5 : 0)}
                              fill="#ffffff"
                              fontSize={Math.min(11, Math.max(8, 10 / zoom))}
                              fontWeight="900"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                            >
                              {p.repere}
                            </text>
                            {showDimensions && (
                              <text
                                x={labelX}
                                y={labelY + 6}
                                fill="#94a3b8"
                                fontSize={Math.min(9, Math.max(7, 8 / zoom))}
                                fontWeight="bold"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                              >
                                {dimNette}
                              </text>
                            )}
                          </g>
                        );
                      })()}
                    </g>
                  );
                })}
              </g>
            )}

            {/* ==================================================== */}
            {/* OUVERTURES (Fenêtres / Portes) — Position absolue X, Y */}
            {/* ==================================================== */}
            {ouvertures && ouvertures.length > 0 && (
              <g className="ouvertures">
                {ouvertures.map((ouv, idx) => {
                  // Vrai positionnement depuis l'angle bas-gauche
                  const estPorte = ouv.type === "porte" || ouv.type === "baie" || ouv.type === "porte_fenetre";
                  const allegeM = estPorte ? 0 : (ouv.hauteurAllegeMm ?? 0) / 1000;

                  // X : depuis l'angle gauche — centrage par défaut si non renseigné
                  const xGaucheM =
                    (ouv.distanceAngleGaucheM ?? null) !== null && (ouv.distanceAngleGaucheM ?? 0) > 0
                      ? (ouv.distanceAngleGaucheM ?? 0)
                      : Math.max(0.1, largeurM / (ouvertures.length + 1) * (idx + 1) - ouv.largeur / 2);

                  const ouvXM = Math.max(0, Math.min(xGaucheM, largeurM - ouv.largeur));
                  const ouvYbasM = allegeM;                    // Y bas (sol de l'allège)
                  const ouvYhautM = allegeM + ouv.hauteur;    // Y haut (linteau)

                  const svgX = px(ouvXM);
                  const svgY = py(ouvYhautM);                  // SVG top = haut physique
                  const svgW = Math.max(4, ouv.largeur * echelle);
                  const svgH = Math.max(4, ouv.hauteur * echelle);

                  const labelType =
                    ouv.type === "porte" ? "🚪 PORTE" :
                    ouv.type === "baie" ? "🔆 BAIE" :
                    ouv.type === "porte_fenetre" ? "🚪 PF" : "🪟 FENÊTRE";

                  const linteauPx = py(ouvYhautM); // ligne de linteau

                  return (
                    <g key={`ouv-${ouv.id || idx}`}>
                      {/* Rectangle de l'ouverture (vide) */}
                      <rect
                        x={svgX}
                        y={svgY}
                        width={svgW}
                        height={svgH}
                        fill="#0f172a"
                        fillOpacity={0.92}
                        stroke="#ef4444"
                        strokeWidth={1.5}
                        strokeDasharray="5 3"
                        rx={2}
                      />

                      {/* Croix interne indiquant le vide */}
                      <line x1={svgX} y1={svgY} x2={svgX + svgW} y2={svgY + svgH}
                        stroke="#ef4444" strokeWidth={0.6} strokeOpacity={0.35} />
                      <line x1={svgX + svgW} y1={svgY} x2={svgX} y2={svgY + svgH}
                        stroke="#ef4444" strokeWidth={0.6} strokeOpacity={0.35} />

                      {/* Ligne de linteau (référence alignement joint horizontal Mode A) */}
                      {ouv.hauteur > 0 && (
                        <line
                          x1={svgX - 6}
                          y1={linteauPx}
                          x2={svgX + svgW + 6}
                          y2={linteauPx}
                          stroke="#fbbf24"
                          strokeWidth={1}
                          strokeDasharray="3 2"
                          strokeOpacity={0.8}
                        />
                      )}

                      {/* Étiquette type */}
                      {svgH >= 20 && svgW >= 30 && (
                        <>
                          <text
                            x={svgX + svgW / 2}
                            y={svgY + svgH / 2 - (svgH >= 36 ? 7 : 0)}
                            fill="#fca5a5"
                            fontSize={Math.min(10, svgW / 6)}
                            fontWeight="bold"
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {labelType}
                          </text>
                          {svgH >= 36 && svgW >= 50 && (
                            <text
                              x={svgX + svgW / 2}
                              y={svgY + svgH / 2 + 7}
                              fill="#94a3b8"
                              fontSize={Math.min(9, svgW / 7)}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              {ouv.largeur.toFixed(2)} × {ouv.hauteur.toFixed(2)} m
                              {allegeM > 0 ? ` · Y+${Math.round(allegeM * 1000)}mm` : ""}
                            </text>
                          )}
                        </>
                      )}

                      {/* Cote X (position depuis l'angle gauche) */}
                      {(ouv.distanceAngleGaucheM ?? 0) > 0 && (
                        <text
                          x={svgX + svgW / 2}
                          y={py(0) + 10}
                          fill="#fbbf24"
                          fontSize={8}
                          textAnchor="middle"
                          fontWeight="bold"
                        >
                          X={Math.round((ouv.distanceAngleGaucheM ?? 0) * 1000)}mm
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* ==================================================== */}
            {/* LIGNES DE COTES GLOBALES */}
            {/* ==================================================== */}
            <g className="cotes">
              {/* Cote de Largeur (Bas) */}
              <line
                x1={px(0)}
                y1={py(0) + 18}
                x2={px(largeurM)}
                y2={py(0) + 18}
                stroke="#64748b"
                strokeWidth={1.5}
              />
              <text
                x={px(largeurM / 2)}
                y={py(0) + 32}
                fill="#94a3b8"
                fontSize={11}
                fontWeight="bold"
                textAnchor="middle"
              >
                Largeur totale : {largeurM.toFixed(2)} m
              </text>

              {/* Cote de Hauteur Mur (Gauche) */}
              <line
                x1={px(0) - 16}
                y1={py(0)}
                x2={px(0) - 16}
                y2={py(hauteurM)}
                stroke="#64748b"
                strokeWidth={1.5}
              />
              <text
                x={px(0) - 26}
                y={py(hauteurM / 2)}
                fill="#94a3b8"
                fontSize={11}
                fontWeight="bold"
                textAnchor="middle"
                transform={`rotate(-90 ${px(0) - 26} ${py(hauteurM / 2)})`}
              >
                H. Mur : {hauteurM.toFixed(2)} m
              </text>

              {/* Cote Faîtage si Pignon (Droite) */}
              {estPignon && (
                <>
                  <line
                    x1={px(largeurM) + 16}
                    y1={py(0)}
                    x2={px(largeurM) + 16}
                    y2={py(hauteurFaiteCalculeeM)}
                    stroke="#64748b"
                    strokeWidth={1.5}
                  />
                  <text
                    x={px(largeurM) + 26}
                    y={py(hauteurFaiteCalculeeM / 2)}
                    fill="#94a3b8"
                    fontSize={11}
                    fontWeight="bold"
                    textAnchor="middle"
                    transform={`rotate(90 ${px(largeurM) + 26} ${py(hauteurFaiteCalculeeM / 2)})`}
                  >
                    H. Faîtage : {hauteurFaiteCalculeeM.toFixed(2)} m
                  </text>
                </>
              )}
            </g>
          </svg>
        </div>
      </div>

      {/* ====================================================== */}
      {/* LÉGENDE DU PLAN & ASTUCE TACTILE */}
      {/* ====================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2 text-[11px]">
        {vue === "plaques" ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-sky-600/40 border border-sky-400" />
              <span className="text-slate-300">Panneaux de façade (M / Rives R)</span>
            </div>
            <span className="text-slate-500 italic hidden sm:inline">
              👉 Cliquez sur un panneau pour afficher ses cotes d&apos;atelier
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 bg-amber-400" />
              <span className="text-slate-300">Chevrons (max 3m)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500 border border-white" />
              <span className="text-slate-300">Équerres porteuses</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-sky-400 border border-white" />
              <span className="text-slate-300">Équerres guides</span>
            </div>
          </div>
        )}

        <div className="text-[10px] text-slate-500 font-mono">
          Joint de dilatation : <strong>{calepinage?.jointMm ?? 8} mm</strong> (DTU 41.2)
        </div>
      </div>

      {/* ====================================================== */}
      {/* SYNTHÈSE TECHNIQUE & BILAN MATIÈRE */}
      {/* ====================================================== */}
      {vue === "plaques" && calepinage && (
        <div className="space-y-2.5 border-t border-slate-800 pt-3">
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3 md:grid-cols-6">
            <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-2.5">
              <p className="text-[10px] uppercase text-slate-400 font-bold">Plaques Mères</p>
              <p className="text-base font-extrabold text-white">
                {calepinage.nbPlaquesNecessaires} <span className="text-xs font-normal text-slate-400">pcs</span>
              </p>
              <p className="text-[10px] text-slate-500 font-mono">
                {calepinage.plaqueBruteLongueurMm}×{calepinage.plaqueBruteLargeurMm} mm
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-2.5">
              <p className="text-[10px] uppercase text-slate-400 font-bold">Modules Posés</p>
              <p className="text-base font-extrabold text-sky-400">
                {calepinage.nbPiecesPosees} <span className="text-xs font-normal text-slate-400">pcs</span>
              </p>
              <p className="text-[10px] text-slate-500 font-mono">
                Trame {calepinage.moduleCibleLargeurMm}×{calepinage.moduleCibleHauteurMm} mm
              </p>
            </div>

            <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-2.5">
              <p className="text-[10px] uppercase text-sky-400 font-bold">Joint Dilatation</p>
              <p className="text-base font-extrabold text-sky-300">
                {calepinage.jointMm ?? 8} mm
              </p>
              <p className="text-[10px] text-sky-400/80">
                {calepinage.lineaireJointsM ? `${calepinage.lineaireJointsM.toFixed(1)} ml joints` : "DTU 41.2"}
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-2.5">
              <p className="text-[10px] uppercase text-amber-400 font-bold flex items-center justify-center gap-1">
                🪚 Coupes (ML)
              </p>
              <p className="text-base font-extrabold text-amber-300">
                {calepinage.totalCoupesML ? calepinage.totalCoupesML.toFixed(1) : "0"} ml
              </p>
              <p className="text-[10px] text-amber-400/80">
                Utilisé pour le budget temps
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-2.5">
              <p className="text-[10px] uppercase text-slate-400 font-bold">Taux Chute Réel</p>
              <p
                className={`text-base font-extrabold ${
                  calepinage.tauxChuteBrutePct <= 20 ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {calepinage.tauxChuteBrutePct.toFixed(1)} %
              </p>
              <p className="text-[10px] text-slate-500">
                {(calepinage.surfacePlaquesAchetesM2 - calepinage.surfaceZoneM2).toFixed(2)} m² chute
                {calepinage.totalChutesReutilisablesM2 > 0 && (
                  <span className="text-emerald-400/80"> · {calepinage.totalChutesReutilisablesM2.toFixed(2)} réutilis.</span>
                )}
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-2.5 col-span-2 sm:col-span-1">
              <p className="text-[10px] uppercase text-slate-400 font-bold">Rendement Débit</p>
              <p className="text-base font-extrabold text-white">
                ~{calepinage.modulesParPlaqueBrute} <span className="text-xs font-normal text-slate-400">mod./plaque</span>
              </p>
              <p className="text-[10px] text-slate-500">
                {calepinage.nbJoints} joints ({calepinage.nbJointsVerticaux}V + {calepinage.nbJointsHorizontaux}H)
              </p>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 italic">
            💡 Imbrication 2D : {calepinage.nbPiecesPosees} modules débités dans {calepinage.nbPlaquesNecessaires} plaques brutes ({calepinage.surfacePlaquesAchetesM2.toFixed(1)} m² bruts pour {calepinage.surfaceZoneM2.toFixed(1)} m² nets posés avec joint creux de {calepinage.jointMm ?? 8} mm).
          </p>
        </div>
      )}

      {/* Règle DTU */}
      <p className="text-[11px] text-slate-500">
        Chevron limité à 3,00 m selon DTU 41.2. Chaque segment possède ses propres équerres porteuses et guides.
      </p>
    </div>
  );
}
