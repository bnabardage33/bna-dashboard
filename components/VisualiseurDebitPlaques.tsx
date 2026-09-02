// components/VisualiseurDebitPlaques.tsx
"use client";

import { useState } from "react";
import { PlaqueDebit, ResultatCalepinage } from "@/lib/calepinageCalcul";
import { Layers, Scissors, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";

export default function VisualiseurDebitPlaques({
  calepinage,
  titreZone,
}: {
  calepinage: any;
  titreZone?: string;
}) {
  const [plaqueIndex, setPlaqueIndex] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);

  const plaques = calepinage.plaquesDebit;
  if (!plaques || plaques.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#1A1D24]/60 p-8 text-center text-xs text-gray-400">
        Aucune donnée de débit disponible pour cette zone.
      </div>
    );
  }

  const plaqueActive: PlaqueDebit = plaques[plaqueIndex] || plaques[0];

  // Dimensions pour le rendu SVG de la plaque
  const svgWidth = 800;
  const rawL = plaqueActive.longueurMm;
  const rawH = plaqueActive.largeurMm;
  const echelle = rawL > 0 ? (svgWidth - 60) / rawL : 0.2;
  const svgHeight = Math.max(260, rawH * echelle + 70);

  const margeX = 35;
  const margeY = 35;

  return (
    <div className="space-y-4">
      {/* 1. KPIs & Bilan Matière Débit */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Plaques Mères</p>
          <p className="mt-0.5 text-lg font-black text-white">{calepinage.nbPlaquesNecessaires} pcs</p>
          <p className="text-[10px] text-gray-400 font-mono">
            {(calepinage.plaqueBruteLongueurMm || calepinage.plaquesDebit?.[0]?.longueurMm || 0)}×{(calepinage.plaqueBruteLargeurMm || calepinage.plaquesDebit?.[0]?.largeurMm || 0)} mm
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Modules Posés</p>
          <p className="mt-0.5 text-lg font-black text-gray-300">{(calepinage.nbPiecesPosees || calepinage.pieces?.length || 0)} modules</p>
          <p className="text-[10px] text-gray-400 font-mono">
            Net: {(calepinage.surfaceZoneM2 || calepinage.pieces?.reduce((s: number, p: any) => s + p.surfaceM2, 0) || 0).toFixed(2)} m²
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Rendement Moyen</p>
          <p className="mt-0.5 text-lg font-black text-white">
            {(
              plaques.reduce((s: number, p: any) => s + p.tauxRendementPct, 0) / plaques.length
            ).toFixed(1)}{" "}
            %
          </p>
          <p className="text-[10px] text-gray-400">Surface brute: {calepinage.surfacePlaquesAchetesM2.toFixed(2)} m²</p>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Chutes Réemployables</p>
          <p className="mt-0.5 text-lg font-black text-emerald-400">
            {calepinage.totalChutesReutilisablesM2.toFixed(2)} m²
          </p>
          <p className="text-[10px] text-emerald-300">Rives &amp; ébrasements</p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Perte Nette Résiduelle</p>
          <p className="mt-0.5 text-lg font-black text-amber-400">
            {calepinage.tauxChuteNettePct.toFixed(1)} %
          </p>
          <p className="text-[10px] text-amber-300">
            {calepinage.totalDechetsPerteM2.toFixed(2)} m² sciure/perte
          </p>
        </div>
      </div>

      {/* 2. Barre de Navigation entre les Plaques */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {plaques.map((plaque: any, idx: number) => (
            <button
              key={plaque.index}
              onClick={() => setPlaqueIndex(idx)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0 ${
                plaqueIndex === idx
                  ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                  : "border border-white/10 bg-[#1A1D24] text-gray-300 hover:bg-slate-700"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Plaque #{plaque.index}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[9px] ${
                  plaqueIndex === idx ? "bg-[#0B0F19] text-amber-400" : "bg-[#0B0F19] text-gray-400"
                }`}
              >
                {plaque.pieces.length} pcs
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.8, z - 0.1))}
            className="rounded-lg border border-white/10 bg-[#1A1D24] p-1.5 text-gray-400 hover:text-white"
            title="Zoom arrière"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="rounded-lg border border-white/10 bg-[#1A1D24] px-2 py-1 text-[10px] font-bold text-gray-400 hover:text-white"
          >
            100%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
            className="rounded-lg border border-white/10 bg-[#1A1D24] p-1.5 text-gray-400 hover:text-white"
            title="Zoom avant"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Visualisation Interactive SVG du Plan de Coupe de la Plaque */}
      <div className="rounded-2xl border border-white/10 bg-[#0B0F19] p-4 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-600/20 text-xs font-bold text-gray-300">
              #{plaqueActive.index}
            </span>
            <p className="text-xs font-bold text-white">
              Plan de Découpe — Plaque Brute {rawL} × {rawH} mm
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-gray-400">
              Rendement : <strong className="text-emerald-400">{plaqueActive.tauxRendementPct.toFixed(1)} %</strong>
            </span>
            <span className="text-gray-400">
              Découpes : <strong className="text-white">{plaqueActive.pieces.length} modules</strong>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto py-2">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }} className="transition-transform">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full select-none"
              style={{ minWidth: "650px", height: `${svgHeight}px` }}
            >
              <defs>
                {/* Motif hachuré pour chutes réutilisables */}
                <pattern id="hatch-reusable" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <path d="M 0,0 L 0,8 M 4,0 L 4,8" stroke="#10b981" strokeWidth="1" strokeOpacity="0.4" />
                </pattern>
                {/* Motif hachuré pour pertes / sciure */}
                <pattern id="hatch-waste" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                  <path d="M 0,0 L 0,8 M 4,0 L 4,8" stroke="#f43f5e" strokeWidth="1" strokeOpacity="0.3" />
                </pattern>
              </defs>

              {/* 1. Contour de la plaque mère */}
              <rect
                x={margeX}
                y={margeY}
                width={rawL * echelle}
                height={rawH * echelle}
                fill="#1e293b"
                stroke="#475569"
                strokeWidth="2"
                rx="4"
              />

              {/* Cotes de la plaque mère */}
              <text
                x={margeX + (rawL * echelle) / 2}
                y={margeY - 12}
                fill="#94a3b8"
                fontSize="11"
                fontWeight="bold"
                textAnchor="middle"
              >
                Longueur brute : {rawL} mm
              </text>
              <text
                x={margeX - 12}
                y={margeY + (rawH * echelle) / 2}
                fill="#94a3b8"
                fontSize="11"
                fontWeight="bold"
                textAnchor="middle"
                transform={`rotate(-90 ${margeX - 12} ${margeY + (rawH * echelle) / 2})`}
              >
                Largeur brute : {rawH} mm
              </text>

              {/* 2. Zones de chutes */}
              {plaqueActive.chutes.map((chute) => {
                const cX = margeX + chute.xMm * echelle;
                const cY = margeY + chute.yMm * echelle;
                const cW = chute.largeurMm * echelle;
                const cH = chute.hauteurMm * echelle;

                if (cW <= 2 || cH <= 2) return null;

                return (
                  <g key={chute.id}>
                    <rect
                      x={cX}
                      y={cY}
                      width={cW}
                      height={cH}
                      fill={chute.reutilisable ? "url(#hatch-reusable)" : "url(#hatch-waste)"}
                      stroke={chute.reutilisable ? "#059669" : "#e11d48"}
                      strokeWidth="1"
                      strokeDasharray="4 2"
                      rx="2"
                    />
                    {cW > 50 && cH > 22 && (
                      <text
                        x={cX + cW / 2}
                        y={cY + cH / 2}
                        fill={chute.reutilisable ? "#34d399" : "#fda4af"}
                        fontSize="9"
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {chute.reutilisable ? `♻️ Chute (${chute.largeurMm}×${chute.hauteurMm})` : "🗑️ Perte"}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* 3. Modules et pièces découpés */}
              {plaqueActive.pieces.map((piece) => {
                const pX = margeX + piece.xMm * echelle;
                const pY = margeY + piece.yMm * echelle;
                const pW = piece.largeurMm * echelle;
                const pH = piece.hauteurMm * echelle;

                const isRive = piece.type === "coupe";
                const isPignon = piece.type === "pignon";

                const couleurFond = isPignon ? "#f59e0b" : isRive ? "#ef4444" : "#dc2626";
                const strokeCouleur = isPignon ? "#fbbf24" : isRive ? "#7dd3fc" : "#38bdf8";

                return (
                  <g key={piece.id} className="cursor-pointer group">
                    <rect
                      x={pX}
                      y={pY}
                      width={pW}
                      height={pH}
                      fill={couleurFond}
                      fillOpacity="0.85"
                      stroke={strokeCouleur}
                      strokeWidth="1.5"
                      rx="3"
                    />

                    {/* Lignes de cotes intérieures si l'espace le permet */}
                    {pW > 35 && pH > 24 && (
                      <>
                        <text
                          x={pX + pW / 2}
                          y={pY + pH / 2 - 6}
                          fill="#0f172a"
                          fontSize="11"
                          fontWeight="900"
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          {piece.repere}
                        </text>
                        <text
                          x={pX + pW / 2}
                          y={pY + pH / 2 + 7}
                          fill="#0f172a"
                          fontSize="9"
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          {piece.largeurMm} × {piece.hauteurMm}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Légende du plan de coupe */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px]">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-3.5 w-3.5 rounded bg-red-700 border border-gray-300" />
              <span className="text-gray-300">Modules pleins (M)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3.5 w-3.5 rounded bg-gray-300 border border-red-200" />
              <span className="text-gray-300">Rives ajustées (R)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3.5 w-3.5 rounded bg-amber-500 border border-amber-300" />
              <span className="text-gray-300">Coupes pignon (P)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3.5 w-3.5 rounded border border-emerald-500 bg-emerald-900/40" />
              <span className="text-emerald-400 font-semibold">Chutes réutilisables (♻️)</span>
            </div>
          </div>

          <p className="text-[10px] text-gray-400 italic font-mono">
            Trait de scie : 3 mm inclus · Joint de dilatation façade : {calepinage.jointMm ?? 8} mm décompté (DTU 41.2)
          </p>
        </div>
      </div>

      {/* 4. Tableau de Débit Pas-à-Pas pour l'Atelier */}
      <div className="rounded-2xl border border-white/10 bg-[#1A1D24] p-4 shadow-md space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wide">
              Tableau des Découpes — Plaque #{plaqueActive.index}
            </h3>
          </div>
          <span className="text-[11px] text-gray-400 font-mono">
            {plaqueActive.pieces.length} coupes à effectuer
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th className="pb-2">Repère Pièce</th>
                <th className="pb-2">Type</th>
                <th className="pb-2 text-right">Longueur</th>
                <th className="pb-2 text-right">Hauteur</th>
                <th className="pb-2 text-right">Position Débit (X, Y)</th>
                <th className="pb-2 text-right">Destination Façade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10/60">
              {plaqueActive.pieces.map((p, i) => (
                <tr key={i} className="hover:bg-slate-750/50">
                  <td className="py-2 font-mono font-bold text-amber-400">{p.repere}</td>
                  <td className="py-2">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        p.type === "pignon"
                          ? "bg-amber-500/20 text-amber-400"
                          : p.type === "coupe"
                          ? "bg-red-600/20 text-gray-300"
                          : "bg-slate-700 text-white"
                      }`}
                    >
                      {p.type === "pignon" ? "Rampant pignon" : p.type === "coupe" ? "Rive ajustée" : "Module plein"}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono font-semibold text-white">{p.largeurMm} mm</td>
                  <td className="py-2 text-right font-mono font-semibold text-white">{p.hauteurMm} mm</td>
                  <td className="py-2 text-right font-mono text-gray-400">
                    X={p.xMm} mm, Y={p.yMm} mm
                  </td>
                  <td className="py-2 text-right text-gray-300">
                    Rangée {p.rangee + 1}, Col. {p.colonne + 1}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
