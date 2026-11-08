"use client";

import React, { useMemo, useRef, useState, useCallback } from "react";
import type {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  ResultatCalculTerrasse,
} from "@/lib/terrasse/types";
import type {
  PlacedBladeSegment,
  PlacedJoistSegment,
  PlacedSupportPoint,
} from "@/lib/terrasse/pro/presets-regles";
import {
  Rotate3d,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Eye,
  EyeOff,
  Recycle,
  X,
  Box,
} from "lucide-react";

interface TerrasseVue3DProps {
  config: ChantierTerrasseConfig;
  resultat: ResultatCalculTerrasse;
  reservations?: ChantierTerrasseReservation[];
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface Poly3D {
  id: string;
  layerId: number; // 1: Sol, 2: Plots, 3: Solives/Lambourdes/Chevêtres, 4: Lames, 5: Réservations/Escalier/Garde-corps
  pts: Point3D[];
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  label?: string;
  meta?: {
    kind: "LAME" | "LAMBOURDE" | "PLOT" | "RESERVATION";
    title: string;
    subtitle: string;
    details: Array<[string, string]>;
  };
}

function createBoxPolys(params: {
  baseId: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z0: number;
  z1: number;
  colors: { top: string; sideX: string; sideY: string; stroke: string };
  layerId: number;
  strokeWidth?: number;
  opacity?: number;
  label?: string;
  meta?: Poly3D["meta"];
}): Poly3D[] {
  const {
    baseId,
    x0,
    y0,
    x1,
    y1,
    z0,
    z1,
    colors,
    layerId,
    strokeWidth = 0.7,
    opacity,
    label,
    meta,
  } = params;

  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  return [
    // Face supérieure (z = z1)
    {
      id: `${baseId}-top`,
      layerId,
      pts: [
        { x: minX, y: minY, z: z1 },
        { x: maxX, y: minY, z: z1 },
        { x: maxX, y: maxY, z: z1 },
        { x: minX, y: maxY, z: z1 },
      ],
      fill: colors.top,
      stroke: colors.stroke,
      strokeWidth,
      opacity,
      label,
      meta,
    },
    // Chant avant (y = maxY)
    {
      id: `${baseId}-front`,
      layerId,
      pts: [
        { x: minX, y: maxY, z: z0 },
        { x: maxX, y: maxY, z: z0 },
        { x: maxX, y: maxY, z: z1 },
        { x: minX, y: maxY, z: z1 },
      ],
      fill: colors.sideX,
      stroke: colors.stroke,
      strokeWidth: strokeWidth * 0.85,
      opacity,
      meta,
    },
    // Chant arrière (y = minY)
    {
      id: `${baseId}-back`,
      layerId,
      pts: [
        { x: maxX, y: minY, z: z0 },
        { x: minX, y: minY, z: z0 },
        { x: minX, y: minY, z: z1 },
        { x: maxX, y: minY, z: z1 },
      ],
      fill: colors.sideX,
      stroke: colors.stroke,
      strokeWidth: strokeWidth * 0.85,
      opacity,
      meta,
    },
    // Chant droit (x = maxX)
    {
      id: `${baseId}-right`,
      layerId,
      pts: [
        { x: maxX, y: minY, z: z0 },
        { x: maxX, y: maxY, z: z0 },
        { x: maxX, y: maxY, z: z1 },
        { x: maxX, y: minY, z: z1 },
      ],
      fill: colors.sideY,
      stroke: colors.stroke,
      strokeWidth: strokeWidth * 0.85,
      opacity,
      meta,
    },
    // Chant gauche (x = minX)
    {
      id: `${baseId}-left`,
      layerId,
      pts: [
        { x: minX, y: maxY, z: z0 },
        { x: minX, y: minY, z: z0 },
        { x: minX, y: minY, z: z1 },
        { x: minX, y: maxY, z: z1 },
      ],
      fill: colors.sideY,
      stroke: colors.stroke,
      strokeWidth: strokeWidth * 0.85,
      opacity,
      meta,
    },
  ];
}

function getBladePalette(essence: ChantierTerrasseConfig["essence_bois"], isOffcut: boolean, highlightOffcuts: boolean) {
  if (isOffcut && highlightOffcuts) {
    return {
      top: "#059669",
      sideX: "#047857",
      sideY: "#065f46",
      stroke: "#6ee7b7",
    };
  }
  switch (essence) {
    case "ipe":
    case "cumaru":
      return {
        top: "#7c3f1d",
        sideX: "#5c2d12",
        sideY: "#451a03",
        stroke: "#291002",
      };
    case "composite":
      return {
        top: "#475569",
        sideX: "#334155",
        sideY: "#1e293b",
        stroke: "#0f172a",
      };
    case "douglas":
    case "meleze":
      return {
        top: "#b45309",
        sideX: "#92400e",
        sideY: "#78350f",
        stroke: "#451a03",
      };
    default:
      return {
        top: "#a16207",
        sideX: "#854d0e",
        sideY: "#713f12",
        stroke: "#422006",
      };
  }
}

export default function TerrasseVue3D({
  config,
  resultat,
  reservations = [],
}: TerrasseVue3DProps) {
  // Caméra orbitale (yaw = azimut horizontal, pitch = élévation verticale)
  const [yawDeg, setYawDeg] = useState<number>(-34);
  const [pitchDeg, setPitchDeg] = useState<number>(36);
  const [zoom, setZoom] = useState<number>(1);

  // Mode éclaté DTU 51.4 (sépare verticalement Sol / Plots / Lambourdes & Chevêtres / Lames)
  const [eclate, setEclate] = useState<boolean>(true);
  const [highlightOffcuts, setHighlightOffcuts] = useState<boolean>(true);

  // Visibilité des couches
  const [showSol, setShowSol] = useState<boolean>(true);
  const [showPlots, setShowPlots] = useState<boolean>(true);
  const [showLambourdes, setShowLambourdes] = useState<boolean>(true);
  const [showLames, setShowLames] = useState<boolean>(true);

  // Élément 3D sélectionné au clic
  const [selectedMeta, setSelectedMeta] = useState<NonNullable<Poly3D["meta"]> | null>(null);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startYaw: number;
    startPitch: number;
    moved: boolean;
  } | null>(null);

  const resetCamera = useCallback(() => {
    setYawDeg(-34);
    setPitchDeg(36);
    setZoom(1);
  }, []);

  const setVueHaut = () => {
    setYawDeg(0);
    setPitchDeg(82);
    setZoom(1.05);
  };

  const setVueCoupeDtu = () => {
    setYawDeg(-18);
    setPitchDeg(14);
    setEclate(true);
    setZoom(1.15);
  };

  // Construction de la scène 3D réelle à partir de resultat.terrassePro.geometry
  const scene3D = useMemo(() => {
    const polys: Poly3D[] = [];
    const L = Math.max(1, config.longueur_m);
    const W = Math.max(1, config.largeur_m);
    const cx = L / 2;
    const cy = W / 2;

    // Écartement vertical en mode vue éclatée DTU
    const gapZ = eclate ? 0.28 : 0;

    // Altitudes des couches en mètres
    const zSol0 = -0.08;
    const zSol1 = 0;

    const plotH = Math.max(0.05, Math.min(0.3, (config.hauteur_sol_cm || 15) / 100));
    const zPlot0 = zSol1 + gapZ * 0.8;
    const zPlot1 = zPlot0 + plotH * 0.65;

    const lambH = Math.max(0.045, (config.section_hauteur_mm || 70) / 1000);
    const zLamb0 = zPlot1 + gapZ * 1.1;
    const zLamb1 = zLamb0 + lambH * 1.2;

    const lameH = Math.max(0.021, (config.epaisseur_lame_mm || 21) / 1000);
    const zLame0 = zLamb1 + gapZ * 1.4;
    const zLame1 = zLame0 + lameH * 1.8;

    const proGeo = resultat.terrassePro?.geometry;

    // 1. COUCHE SOL / DALLE BÉTON / GÉOTEXTILE
    if (showSol) {
      const isDalle = config.type_sol === "dalle_beton";
      polys.push(
        ...createBoxPolys({
          baseId: "sol-dalle",
          x0: -cx,
          y0: -cy,
          x1: L - cx,
          y1: W - cy,
          z0: zSol0,
          z1: zSol1,
          colors: isDalle
            ? { top: "#1e293b", sideX: "#0f172a", sideY: "#090d16", stroke: "#334155" }
            : { top: "#292524", sideX: "#1c1917", sideY: "#0c0a09", stroke: "#44403c" },
          layerId: 1,
          strokeWidth: 0.9,
        })
      );
    }

    // 2. COUCHE PLOTS RÉGLABLES / CALES SUR DALLE (coordonnées réelles)
    if (showPlots && proGeo && proGeo.supports.length > 0) {
      // Échantillonnage intelligent si très grand nombre de plots pour fluidité SVG
      const maxPlots = 180;
      const step = Math.max(1, Math.ceil(proGeo.supports.length / maxPlots));
      for (let i = 0; i < proGeo.supports.length; i += step) {
        const sup: PlacedSupportPoint = proGeo.supports[i];
        const sx = sup.centerMm.xMm / 1000 - cx;
        const sy = sup.centerMm.yMm / 1000 - cy;
        const halfR = sup.type === "CALE_SUR_DALLE" ? 0.05 : 0.075;

        const isChevetre = sup.type === "PLOT_CHEVETRE";
        const isCale = sup.type === "CALE_SUR_DALLE";

        polys.push(
          ...createBoxPolys({
            baseId: `plot-${sup.id}`,
            x0: sx - halfR,
            y0: sy - halfR,
            x1: sx + halfR,
            y1: sy + halfR,
            z0: zPlot0,
            z1: zPlot1,
            colors: isChevetre
              ? { top: "#38bdf8", sideX: "#0284c7", sideY: "#0369a1", stroke: "#bae6fd" }
              : isCale
              ? { top: "#10b981", sideX: "#059669", sideY: "#047857", stroke: "#6ee7b7" }
              : { top: "#f59e0b", sideX: "#d97706", sideY: "#b45309", stroke: "#fde68a" },
            layerId: 2,
            strokeWidth: 0.6,
            meta: {
              kind: "PLOT",
              title: isChevetre
                ? `Plot de chevêtre (${sup.id})`
                : isCale
                ? `Cale d'isolation sur dalle (${sup.id})`
                : `Plot réglable (${sup.id})`,
              subtitle: `Coordonnées : X ${(sup.centerMm.xMm / 1000).toFixed(2)} m · Y ${(sup.centerMm.yMm / 1000).toFixed(2)} m`,
              details: [
                ["Type d'appui", sup.type],
                ["Hauteur sous lame", `${sup.heightMm} mm (max polymère DTU : 300 mm)`],
                ["Résistance exigée F_Rk", `≥ ${sup.requiredCapacityFrkKn} kN`],
                ["Jonction de lambourde", sup.isJoistSpliceCentered ? "Oui (centrée sur plot)" : "Appui courant"],
              ],
            },
          })
        );
      }
    }

    // 3. COUCHE STRUCTURE : LAMBOURDES COURANTES, DOUBLES LAMBOURDES D'ABOUTAGE & CHEVÊTRES
    if (showLambourdes && proGeo && proGeo.joists.length > 0) {
      for (const j of proGeo.joists) {
        const xStart = j.startMm.xMm / 1000 - cx;
        const yStart = j.startMm.yMm / 1000 - cy;
        const xEnd = j.endMm.xMm / 1000 - cx;
        const yEnd = j.endMm.yMm / 1000 - cy;
        const halfW = Math.max(0.025, (j.widthMm / 1000) * 0.6);

        const isHorizontal = Math.abs(xEnd - xStart) >= Math.abs(yEnd - yStart);
        const x0 = isHorizontal ? Math.min(xStart, xEnd) : xStart - halfW;
        const x1 = isHorizontal ? Math.max(xStart, xEnd) : xStart + halfW;
        const y0 = isHorizontal ? yStart - halfW : Math.min(yStart, yEnd);
        const y1 = isHorizontal ? yStart + halfW : Math.max(yStart, yEnd);

        const isChevetre = j.role === "CHEVETRE";
        const isDouble =
          j.role === "DOUBLE_ABOUTAGE_GAUCHE" || j.role === "DOUBLE_ABOUTAGE_DROITE";
        const isSecondary = j.layer === "SECONDARY_BOTTOM_CROSS";

        const zJ0 = isSecondary ? zLamb0 - lambH * 1.15 : zLamb0;
        const zJ1 = isSecondary ? zLamb0 - 0.005 : zLamb1;

        polys.push(
          ...createBoxPolys({
            baseId: `joist-${j.id}`,
            x0,
            y0,
            x1,
            y1,
            z0: zJ0,
            z1: zJ1,
            colors: isChevetre
              ? { top: "#38bdf8", sideX: "#0284c7", sideY: "#0369a1", stroke: "#e0f2fe" }
              : isDouble
              ? { top: "#fb923c", sideX: "#ea580c", sideY: "#c2410c", stroke: "#ffedd5" }
              : config.type_lambourde === "alu_structure"
              ? { top: "#94a3b8", sideX: "#64748b", sideY: "#475569", stroke: "#cbd5e1" }
              : { top: "#d97706", sideX: "#b45309", sideY: "#78350f", stroke: "#451a03" },
            layerId: 3,
            strokeWidth: 0.7,
            meta: {
              kind: "LAMBOURDE",
              title: isChevetre
                ? `Chevêtre de réservation (${j.id})`
                : isDouble
                ? `Lambourde jumelée d'aboutage (${j.id})`
                : `Lambourde porteuse (${j.id})`,
              subtitle: `Longueur nette : ${j.lengthNetMm} mm · Section : ${j.widthMm}×${j.heightMm} mm`,
              details: [
                ["Rôle structurel", j.role],
                ["Couche", j.layer],
                ["Nombre de plots d'appui", `${j.supportIds.length} plots`],
                ["Portée max entre plots", `${j.maxSpanBetweenSupportsMm} mm (plafond DTU : 700 mm)`],
              ],
            },
          })
        );
      }
    }

    // 4. COUCHE PLATELAGE : SEGMENTS DE LAMES RÉELS + JOINTS D'ABOUTAGE + CHUTES RÉEMPLOYÉES
    if (showLames && proGeo && proGeo.blades.length > 0) {
      // Limiter le nombre de segments 3D si la terrasse est immense (> 220 segments)
      const maxBlades = 220;
      const stepB = Math.max(1, Math.ceil(proGeo.blades.length / maxBlades));
      for (let i = 0; i < proGeo.blades.length; i += stepB) {
        const seg: PlacedBladeSegment = proGeo.blades[i];
        if (seg.polygonMm.length < 4) continue;
        const p0 = seg.polygonMm[0];
        const p2 = seg.polygonMm[2];
        const x0 = p0.xMm / 1000 - cx + 0.004;
        const y0 = p0.yMm / 1000 - cy + 0.002;
        const x1 = p2.xMm / 1000 - cx - 0.004;
        const y1 = p2.yMm / 1000 - cy - 0.002;

        const palette = getBladePalette(
          config.essence_bois,
          seg.isFromOffcutReuse,
          highlightOffcuts
        );

        polys.push(
          ...createBoxPolys({
            baseId: `blade-${seg.id}`,
            x0,
            y0,
            x1,
            y1,
            z0: zLame0,
            z1: zLame1,
            colors: palette,
            layerId: 4,
            strokeWidth: seg.isFromOffcutReuse && highlightOffcuts ? 1.1 : 0.65,
            label:
              seg.isFromOffcutReuse && highlightOffcuts && seg.lengthNetMm >= 550
                ? "♻️"
                : undefined,
            meta: {
              kind: "LAME",
              title: `Rangée #${seg.rowIndex + 1} · Segment #${seg.segmentIndexInRow + 1}`,
              subtitle: `Longueur nette : ${seg.lengthNetMm} mm (${(seg.lengthNetMm / 10).toFixed(1)} cm) · Largeur : ${seg.widthNetMm} mm`,
              details: [
                [
                  "Origine de coupe",
                  seg.isFromOffcutReuse
                    ? `♻️ Chute réemployée (issue de ${seg.sourceCommercialBarId})`
                    : `Barre neuve (${seg.sourceCommercialBarId})`,
                ],
                ["Appuis sous ce segment", `${seg.supportJoistIds.length} lambourdes (${seg.spanCount} travées)`],
                ["Jonction gauche / droite", `${seg.leftJointType} → ${seg.rightJointType}`],
                [" Porte-à-faux gauche / droite", `${seg.leftOverhangMm} mm / ${seg.rightOverhangMm} mm`],
              ],
            },
          })
        );
      }
    }

    // 5. RÉSERVATIONS (Piscines, Arbres, Trappes) en volume 3D
    if (reservations.length > 0) {
      reservations.forEach((res, idx) => {
        const rx = (res.x || 0) - cx;
        const ry = (res.y || 0) - cy;
        const rw = res.diametre ? res.diametre : res.largeur || 0.6;
        const rh = res.diametre ? res.diametre : res.longueur || 0.6;
        const x0 = res.diametre ? rx - rw / 2 : rx;
        const y0 = res.diametre ? ry - rh / 2 : ry;

        const isPool = res.type_reservation === "piscine";
        const isTree = res.type_reservation === "arbre";

        polys.push(
          ...createBoxPolys({
            baseId: `res-${idx}`,
            x0,
            y0,
            x1: x0 + rw,
            y1: y0 + rh,
            z0: zSol0,
            z1: zLame1 + 0.03,
            colors: isPool
              ? {
                  top: "rgba(14, 165, 233, 0.78)",
                  sideX: "rgba(2, 132, 199, 0.85)",
                  sideY: "rgba(3, 105, 161, 0.85)",
                  stroke: "#38bdf8",
                }
              : isTree
              ? {
                  top: "rgba(22, 163, 74, 0.82)",
                  sideX: "rgba(21, 128, 61, 0.85)",
                  sideY: "rgba(20, 83, 45, 0.85)",
                  stroke: "#4ade80",
                }
              : {
                  top: "rgba(51, 65, 85, 0.88)",
                  sideX: "#1e293b",
                  sideY: "#0f172a",
                  stroke: "#f59e0b",
                },
            layerId: 5,
            strokeWidth: 1.2,
            label: res.nom,
            meta: {
              kind: "RESERVATION",
              title: `Réservation : ${res.nom}`,
              subtitle: `Type : ${res.type_reservation.toUpperCase()}`,
              details: [
                ["Position (X, Y)", `${(res.x || 0).toFixed(2)} m, ${(res.y || 0).toFixed(2)} m`],
                [
                  "Dimensions",
                  res.diametre
                    ? `Ø ${res.diametre.toFixed(2)} m`
                    : `${(res.largeur || 0.6).toFixed(2)} m × ${(res.longueur || 0.6).toFixed(2)} m`,
                ],
                ["Renfort DTU 51.4", "Chevêtres d'encadrement + plots dédiés générés"],
              ],
            },
          })
        );
      });
    }

    // 6. ESCALIER 3D (si présent)
    if (config.presence_escalier && config.escalier_nb_marches > 0) {
      const stairW = Math.min(L, Math.max(0.8, config.escalier_largeur_m || 2.0));
      const gironM = Math.max(0.22, (config.escalier_giron_cm || 28) / 100);
      const marcheH = Math.max(0.12, (config.escalier_hauteur_marche_cm || 16) / 100);
      const palette = getBladePalette(config.essence_bois, false, false);

      for (let m = 0; m < config.escalier_nb_marches; m++) {
        const my0 = W - cy + m * gironM;
        const my1 = my0 + gironM;
        const mz1 = zLame1 - (m + 1) * marcheH * 0.6;
        const mz0 = mz1 - lameH * 1.5;
        polys.push(
          ...createBoxPolys({
            baseId: `stair-${m}`,
            x0: -stairW / 2,
            y0: my0,
            x1: stairW / 2,
            y1: my1,
            z0: mz0,
            z1: mz1,
            colors: palette,
            layerId: 5,
            strokeWidth: 0.8,
          })
        );
      }
    }

    return {
      polys,
      span: Math.max(L, W, 3.5),
      stats: {
        nbBlades: proGeo?.blades.length ?? 0,
        nbOffcutsReused: proGeo?.blades.filter((b) => b.isFromOffcutReuse).length ?? 0,
        nbJoists: proGeo?.joists.length ?? 0,
        nbDoubleJoists:
          proGeo?.joists.filter(
            (j) =>
              j.role === "DOUBLE_ABOUTAGE_GAUCHE" || j.role === "DOUBLE_ABOUTAGE_DROITE"
          ).length ?? 0,
        nbChevetres: proGeo?.joists.filter((j) => j.role === "CHEVETRE").length ?? 0,
        nbSupports: proGeo?.supports.length ?? 0,
      },
    };
  }, [
    config,
    resultat,
    reservations,
    eclate,
    highlightOffcuts,
    showSol,
    showPlots,
    showLambourdes,
    showLames,
  ]);

  // Projection 3D -> 2D SVG avec tri en profondeur (algorithme du peintre issu de BNA-App)
  const projected = useMemo(() => {
    const yaw = (yawDeg * Math.PI) / 180;
    const pitch = (pitchDeg * Math.PI) / 180;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    const camDist = scene3D.span * 2.8;

    const projectPt = (p: Point3D) => {
      // Rotation dans le plan horizontal (X, Y) d'angle yaw
      const x1 = p.x * cosY - p.y * sinY;
      const y1 = p.x * sinY + p.y * cosY;

      // Inclinaison selon pitch (entre l'axe de profondeur y1 et la hauteur z)
      const screenY = y1 * sinP - p.z * cosP;
      const depth = y1 * cosP + p.z * sinP;

      const perspective = camDist / Math.max(1.2, camDist + depth * 0.45);
      return {
        sx: x1 * perspective,
        sy: screenY * perspective,
        depth,
      };
    };

    const items = scene3D.polys.map((poly) => {
      const pPts = poly.pts.map(projectPt);
      const avgDepth = pPts.reduce((s, q) => s + q.depth, 0) / pPts.length;
      const avgZ = poly.pts.reduce((s, q) => s + q.z, 0) / poly.pts.length;
      const cx = pPts.reduce((s, q) => s + q.sx, 0) / pPts.length;
      const cy = pPts.reduce((s, q) => s + q.sy, 0) / pPts.length;

      return {
        poly,
        pointsAttr: pPts.map((q) => `${q.sx.toFixed(3)},${q.sy.toFixed(3)}`).join(" "),
        avgDepth,
        avgZ,
        cx,
        cy,
      };
    });

    // Tri du plus éloigné au plus proche, avec priorité d'altitude des couches (Sol < Plots < Lambourdes < Lames)
    items.sort((a, b) => {
      if (a.poly.layerId !== b.poly.layerId) {
        return a.poly.layerId - b.poly.layerId;
      }
      if (Math.abs(a.avgZ - b.avgZ) > 0.008) {
        return a.avgZ - b.avgZ;
      }
      return a.avgDepth - b.avgDepth;
    });

    return items;
  }, [scene3D, yawDeg, pitchDeg]);

  const halfSpan = (scene3D.span * 0.72) / Math.max(0.5, zoom);
  const viewBox = `${-halfSpan} ${-halfSpan * 0.68} ${halfSpan * 2} ${halfSpan * 1.36}`;

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startYaw: yawDeg,
      startPitch: pitchDeg,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.moved = true;
    }
    setYawDeg(Math.max(-175, Math.min(175, dragRef.current.startYaw + dx * 0.45)));
    setPitchDeg(Math.max(8, Math.min(86, dragRef.current.startPitch + dy * 0.35)));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="space-y-3">
      <div className="relative w-full rounded-2xl border border-white/10 bg-[#0d0f12] overflow-hidden shadow-2xl">
        {/* Barre d'outils supérieure : Vues caméra + Mode Éclaté DTU + Filtres de couches */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/50 px-3.5 py-2.5">
          {/* Vues caméra & Éclaté DTU */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={resetCamera}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold bg-white/5 text-gray-200 hover:bg-white/10 border border-white/10"
            >
              <Rotate3d size={13} className="text-amber-400" />
              Isométrique
            </button>
            <button
              type="button"
              onClick={setVueCoupeDtu}
              className="px-2.5 py-1 rounded-lg text-2xs font-semibold bg-white/5 text-gray-200 hover:bg-white/10 border border-white/10"
            >
              Coupe rasante DTU
            </button>
            <button
              type="button"
              onClick={setVueHaut}
              className="px-2.5 py-1 rounded-lg text-2xs font-semibold bg-white/5 text-gray-200 hover:bg-white/10 border border-white/10"
            >
              Vue de dessus
            </button>

            <button
              type="button"
              onClick={() => setEclate((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-bold border transition ${
                eclate
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                  : "bg-white/5 text-gray-400 border-white/10 hover:text-white"
              }`}
            >
              <Layers size={12} />
              {eclate ? "Vue éclatée DTU : ACTIVE" : "Vue compacte réelle"}
            </button>

            <button
              type="button"
              onClick={() => setHighlightOffcuts((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-bold border transition ${
                highlightOffcuts
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                  : "bg-white/5 text-gray-400 border-white/10 hover:text-white"
              }`}
            >
              <Recycle size={12} />
              Chutes ♻️ ({scene3D.stats.nbOffcutsReused})
            </button>
          </div>

          {/* Toggles de couches & Zoom */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowLames((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-3xs font-semibold border ${
                showLames
                  ? "bg-amber-600/30 text-amber-200 border-amber-500/40"
                  : "bg-white/5 text-gray-500 border-white/5"
              }`}
            >
              {showLames ? <Eye size={11} /> : <EyeOff size={11} />}
              Lames ({scene3D.stats.nbBlades})
            </button>
            <button
              type="button"
              onClick={() => setShowLambourdes((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-3xs font-semibold border ${
                showLambourdes
                  ? "bg-orange-600/30 text-orange-200 border-orange-500/40"
                  : "bg-white/5 text-gray-500 border-white/5"
              }`}
            >
              {showLambourdes ? <Eye size={11} /> : <EyeOff size={11} />}
              Structure ({scene3D.stats.nbJoists})
            </button>
            <button
              type="button"
              onClick={() => setShowPlots((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-3xs font-semibold border ${
                showPlots
                  ? "bg-yellow-600/30 text-yellow-200 border-yellow-500/40"
                  : "bg-white/5 text-gray-500 border-white/5"
              }`}
            >
              {showPlots ? <Eye size={11} /> : <EyeOff size={11} />}
              Plots ({scene3D.stats.nbSupports})
            </button>
            <button
              type="button"
              onClick={() => setShowSol((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-3xs font-semibold border ${
                showSol
                  ? "bg-slate-600/40 text-slate-200 border-slate-500/40"
                  : "bg-white/5 text-gray-500 border-white/5"
              }`}
            >
              Sol
            </button>

            <div className="flex items-center gap-0.5 ml-1 rounded-lg bg-white/5 p-0.5 border border-white/10">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.4, +(z * 1.2).toFixed(2)))}
                className="p-1 rounded text-gray-300 hover:text-white hover:bg-white/10"
                title="Zoom avant"
              >
                <ZoomIn size={13} />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.55, +(z / 1.2).toFixed(2)))}
                className="p-1 rounded text-gray-300 hover:text-white hover:bg-white/10"
                title="Zoom arrière"
              >
                <ZoomOut size={13} />
              </button>
              <button
                type="button"
                onClick={resetCamera}
                className="p-1 rounded text-gray-300 hover:text-white hover:bg-white/10"
                title="Réinitialiser la caméra"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Scène 3D Vectorielle SVG */}
        <div className="relative w-full h-[470px] bg-gradient-to-b from-[#0b0e14] via-[#111622] to-[#0b0d13]">
          <svg
            viewBox={viewBox}
            className="w-full h-full cursor-grab active:cursor-grabbing select-none touch-none block"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            role="img"
            aria-label="Modélisation 3D éclatée DTU 51.4 de la terrasse"
          >
            {projected.map(({ poly, pointsAttr, cx, cy }) => (
              <g
                key={poly.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (dragRef.current?.moved) return;
                  if (poly.meta) {
                    setSelectedMeta(poly.meta);
                  }
                }}
                className={poly.meta ? "cursor-pointer hover:opacity-90" : undefined}
              >
                <polygon
                  points={pointsAttr}
                  fill={poly.fill}
                  fillOpacity={poly.opacity ?? 1}
                  stroke={poly.stroke}
                  strokeWidth={poly.strokeWidth * 0.015}
                  strokeLinejoin="round"
                />
                {poly.label && (
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#ffffff"
                    fontSize={0.11}
                    fontWeight="bold"
                    style={{ pointerEvents: "none" }}
                  >
                    {poly.label}
                  </text>
                )}
              </g>
            ))}
          </svg>

          {/* Panneau d'inspection d'un composant 3D cliqué */}
          {selectedMeta && (
            <div className="absolute bottom-3 right-3 z-20 w-80 max-w-[92%] rounded-xl border border-amber-500/40 bg-[#0f131a]/95 p-3.5 text-xs text-white shadow-2xl backdrop-blur-md">
              <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2">
                <div>
                  <span className="inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                    {selectedMeta.kind}
                  </span>
                  <h4 className="mt-1 font-bold text-white">{selectedMeta.title}</h4>
                  <p className="text-[11px] text-gray-400">{selectedMeta.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMeta(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white"
                  aria-label="Fermer la fiche"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mt-2 space-y-1.5">
                {selectedMeta.details.map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-2 text-[11px]">
                    <span className="text-gray-400">{k}</span>
                    <span className="font-semibold text-right text-gray-100">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Légende & Compteurs géométriques réels en bas de la vue 3D */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/50 px-4 py-2.5 text-3xs text-gray-300">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-amber-600 inline-block border border-white/20" />
              Segments lames : <strong>{scene3D.stats.nbBlades}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" />
              Chutes réemployées ♻️ : <strong className="text-emerald-400">{scene3D.stats.nbOffcutsReused}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-orange-500 inline-block" />
              Doubles lambourdes d&apos;aboutage : <strong className="text-orange-300">{scene3D.stats.nbDoubleJoists}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-sky-400 inline-block" />
              Chevêtres réservations : <strong className="text-sky-300">{scene3D.stats.nbChevetres}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 inline-block" />
              Plots : <strong>{scene3D.stats.nbSupports}</strong>
            </span>
          </div>
          <span className="text-gray-400 flex items-center gap-1">
            <Box size={11} className="text-amber-400" />
            Glisser pour tourner · Cliquer sur une lame, lambourde ou plot pour inspecter
          </span>
        </div>
      </div>
    </div>
  );
}
