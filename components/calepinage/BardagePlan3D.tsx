"use client";

import React, { useMemo, useRef, useState } from "react";
import { Box, Eye, Layers, RotateCcw } from "lucide-react";
import type { PieceCalepinage, ResultatCalepinage } from "@/lib/calepinageCalcul";
import { getHauteurToit } from "@/lib/calepinageCalcul";
import type { FamillePose, ResultatPose } from "@/lib/poseCalcul";

export interface OuvertureCalculee {
  id: string;
  nom: string;
  type: "fenetre" | "porte" | "baie";
  xM: number;
  yM: number;
  largeurM: number;
  hauteurM: number;
  surfaceM2: number;
}

export interface Facade3DData {
  id: string;
  nom: string;
  famille: FamillePose;
  L: number;
  Hm: number;
  hMurM?: number;
  hFaiteM?: number;
  estPignon?: boolean;
  surfaceM2: number;
  cal: ResultatCalepinage | null;
  pose: ResultatPose;
  ouverturesCalculees: OuvertureCalculee[];
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface Poly3D {
  id: string;
  facadeId: string;
  facadeNom?: string;
  layerId: number; // 1: Mur support, 2: Isolant ITE, 3: Chevrons, 4: Panneaux, 5: Ouvertures
  isSideChant?: boolean;
  pts: Point3D[];
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  label?: string;
  subLabel?: string;
  piece?: PieceCalepinage;
  layerOrder: number;
}

const COULEUR_3D: Record<PieceCalepinage["type"], { front: string; side: string; top: string }> = {
  pleine: { front: "#E7D9C9", side: "#B8A593", top: "#F3EAE0" },
  coupe: { front: "#F3C9B5", side: "#C69B87", top: "#FAE0D3" },
  pignon: { front: "#F5E0A8", side: "#C7B27B", top: "#FBF0CE" },
};

/**
 * Construit les polygones 3D (mur porteur, isolant ITE, chevrons 3D, panneaux calepinés et ouvertures)
 * d'une façade dans son repère local (x: 0..L, y: 0..H, z: épaisseur vers l'extérieur),
 * puis applique une transformation locale -> monde pour le mode Bâtiment Multi-Façades.
 */
function buildFacadePolys(
  facade: Facade3DData,
  opts: {
    showMur: boolean;
    showIsolant: boolean;
    showChevrons: boolean;
    showPanneaux: boolean;
    showOuvertures: boolean;
    eclateFactor: number; // 0 = compact réel, 1 = éclaté DTU
    transform: (p: Point3D) => Point3D;
  }
): Poly3D[] {
  const polys: Poly3D[] = [];
  const W = facade.L;
  const estPignon = Boolean(facade.cal?.estPignon ?? facade.estPignon);

  const hFaite = facade.cal?.hauteurFaiteM ?? facade.hFaiteM ?? facade.Hm;
  const hMur =
    facade.cal?.hauteurMurM ??
    facade.hMurM ??
    (estPignon && facade.cal?.pentePct
      ? hFaite - (facade.cal.pentePct / 100) * (W / 2)
      : facade.Hm);
  const H = estPignon ? hFaite : hMur;
  const ridgeX = W / 2;
  const hEgoutG = hMur;
  const hEgoutD = hMur;

  const getHauteurToitRoof = (x: number) => {
    if (!estPignon) return H;
    return getHauteurToit(x, W, hMur, hFaite);
  };

  const gap = opts.eclateFactor * 0.42; // Décalage entre couches en mode vue éclatée DTU
  const zMurBack = -0.2;
  const zMurFront = 0;

  const hasIsolant = facade.pose.isolant.epaisseurMm > 0;
  const epIsolantM = Math.max(0.06, facade.pose.isolant.epaisseurMm / 1000);
  const zIsoBack = zMurFront + gap;
  const zIsoFront = zIsoBack + (hasIsolant ? epIsolantM : 0);

  const zChevBack = (hasIsolant ? zIsoFront : zMurFront) + gap;
  const zChevFront = zChevBack + 0.065;

  const zPanBack = zChevFront + gap * 1.15;
  const zPanFront = zPanBack + 0.025;

  const silhouettePts = (z: number): Point3D[] =>
    estPignon
      ? [
          { x: 0, y: 0, z },
          { x: W, y: 0, z },
          { x: W, y: hEgoutD, z },
          { x: ridgeX, y: hFaite, z },
          { x: 0, y: hEgoutG, z },
        ]
      : [
          { x: 0, y: 0, z },
          { x: W, y: 0, z },
          { x: W, y: H, z },
          { x: 0, y: H, z },
        ];

  const pushExtrudedPolygon = (
    baseId: string,
    pts2d: { x: number; y: number }[],
    z0: number,
    z1: number,
    colors: { front: string; side: string; top: string; stroke: string },
    layerId: number, // 1: Mur support, 2: Isolant ITE, 3: Chevrons, 4: Panneaux, 5: Ouvertures
    meta?: { label?: string; subLabel?: string; piece?: PieceCalepinage; opacity?: number }
  ) => {
    // Face avant
    polys.push({
      id: `${baseId}-front`,
      facadeId: facade.id,
      facadeNom: facade.nom,
      layerId,
      isSideChant: false,
      pts: pts2d.map((p) => opts.transform({ x: p.x, y: p.y, z: z1 })),
      fill: colors.front,
      stroke: colors.stroke,
      strokeWidth: 0.9,
      opacity: meta?.opacity,
      label: meta?.label,
      subLabel: meta?.subLabel,
      piece: meta?.piece,
      layerOrder: layerId * 10,
    });

    // Chants latéraux / supérieurs pour donner le volume 3D
    for (let i = 0; i < pts2d.length; i++) {
      const a = pts2d[i];
      const b = pts2d[(i + 1) % pts2d.length];
      const isTopEdge = a.y > 0.05 && b.y > 0.05 && Math.abs(a.x - b.x) > 0.01;
      polys.push({
        id: `${baseId}-side-${i}`,
        facadeId: facade.id,
        facadeNom: facade.nom,
        layerId,
        isSideChant: true,
        pts: [
          opts.transform({ x: a.x, y: a.y, z: z0 }),
          opts.transform({ x: b.x, y: b.y, z: z0 }),
          opts.transform({ x: b.x, y: b.y, z: z1 }),
          opts.transform({ x: a.x, y: a.y, z: z1 }),
        ],
        fill: isTopEdge ? colors.top : colors.side,
        stroke: colors.stroke,
        strokeWidth: 0.6,
        opacity: meta?.opacity,
        layerOrder: layerId * 10 - 0.1,
      });
    }
  };

  // 1. Mur porteur béton/maçonnerie
  if (opts.showMur) {
    const wall2d = silhouettePts(0).map(({ x, y }) => ({ x, y }));
    pushExtrudedPolygon(
      `${facade.id}-mur`,
      wall2d,
      zMurBack,
      zMurFront,
      { front: "#CBD5E1", side: "#94A3B8", top: "#E2E8F0", stroke: "#64748B" },
      1
    );
  }

  // 2. Isolant ITE (laine de roche)
  if (opts.showIsolant && hasIsolant) {
    const iso2d = silhouettePts(0).map(({ x, y }) => ({ x, y }));
    pushExtrudedPolygon(
      `${facade.id}-iso`,
      iso2d,
      zIsoBack,
      zIsoFront,
      { front: "#FDE68A", side: "#D97706", top: "#FEF3C7", stroke: "#B45309" },
      2,
      { opacity: 0.92 }
    );
  }

  // 3. Chevrons d'ossature verticaux (calculés par calculerPose)
  if (opts.showChevrons) {
    const chevWidth = 0.055;
    const jeuVentilationM = 0.03; // 30 mm de garde sous rampant (ventilation DTU)
    facade.pose.positionsChevronsM.forEach((cx, idx) => {
      const x0 = Math.max(0, cx - chevWidth / 2);
      const x1 = Math.min(W, cx + chevWidth / 2);

      let chev2d: { x: number; y: number }[];
      if (estPignon) {
        const yTop0 = Math.max(0.15, getHauteurToitRoof(x0) - jeuVentilationM);
        const yTop1 = Math.max(0.15, getHauteurToitRoof(x1) - jeuVentilationM);

        if (x0 < ridgeX && x1 > ridgeX) {
          const yPeak = Math.max(0.15, hFaite - jeuVentilationM);
          chev2d = [
            { x: x0, y: 0 },
            { x: x1, y: 0 },
            { x: x1, y: yTop1 },
            { x: ridgeX, y: yPeak },
            { x: x0, y: yTop0 },
          ];
        } else {
          chev2d = [
            { x: x0, y: 0 },
            { x: x1, y: 0 },
            { x: x1, y: yTop1 },
            { x: x0, y: yTop0 },
          ];
        }
      } else {
        chev2d = [
          { x: x0, y: 0 },
          { x: x1, y: 0 },
          { x: x1, y: H },
          { x: x0, y: H },
        ];
      }

      pushExtrudedPolygon(
        `${facade.id}-chev-${idx}`,
        chev2d,
        zChevBack,
        zChevFront,
        { front: "#60A5FA", side: "#1D4ED8", top: "#93C5FD", stroke: "#1E40AF" },
        3
      );
    });
  }

  // 4. Panneaux de bardage calepinés (issus de calculerCalepinage)
  if (opts.showPanneaux && facade.cal) {
    const joint = 0.008; // Joint visuel 8 mm entre panneaux en 3D
    facade.cal.pieces.forEach((p) => {
      const rawPts = p.points ?? [
        { xM: p.xM, yM: p.yM },
        { xM: p.xM + p.largeurM, yM: p.yM },
        { xM: p.xM + p.largeurM, yM: p.yM + p.hauteurM },
        { xM: p.xM, yM: p.yM + p.hauteurM },
      ];
      const cx = p.xM + p.largeurM / 2;
      const cy = p.yM + p.hauteurM / 2;
      const pts2d = rawPts.map((q) => ({
        x: q.xM + (q.xM < cx ? joint : -joint),
        y: q.yM + (q.yM < cy ? joint : -joint),
      }));
      const col = COULEUR_3D[p.type];
      pushExtrudedPolygon(
        `${facade.id}-piece-${p.id}`,
        pts2d,
        zPanBack,
        zPanFront,
        { ...col, stroke: "#334155" },
        4,
        {
          label: p.largeurM > 0.22 && p.hauteurM > 0.18 ? p.repere : undefined,
          subLabel: p.pignonDetails
            ? `${p.pignonDetails.cutWidthMm}×${p.pignonDetails.hLeftMm}/${p.pignonDetails.hRightMm}`
            : p.largeurM > 0.45 && p.hauteurM > 0.35
              ? `${Math.round(p.largeurM * 1000)}×${Math.round(p.hauteurM * 1000)}`
              : undefined,
          piece: p,
        }
      );
    });
  }

  // 5. Ouvertures (fenêtres / portes / baies vitrées)
  if (opts.showOuvertures && facade.ouverturesCalculees.length > 0) {
    const zOuvBack = zPanBack - 0.02;
    const zOuvFront = zPanFront + 0.02;
    facade.ouverturesCalculees.forEach((o) => {
      const ouv2d = [
        { x: o.xM, y: o.yM },
        { x: o.xM + o.largeurM, y: o.yM },
        { x: o.xM + o.largeurM, y: o.yM + o.hauteurM },
        { x: o.xM, y: o.yM + o.hauteurM },
      ];
      pushExtrudedPolygon(
        `${facade.id}-ouv-${o.id}`,
        ouv2d,
        zOuvBack,
        zOuvFront,
        {
          front: "rgba(186, 230, 253, 0.88)",
          side: "#0284C7",
          top: "#38BDF8",
          stroke: "#0369A1",
        },
        5,
        {
          label: o.nom,
          subLabel: `${Math.round(o.largeurM * 1000)}×${Math.round(o.hauteurM * 1000)}`,
        }
      );
    });
  }

  return polys;
}

/**
 * Calcule le vecteur normal unitaire d'un polygone 3D
 */
function getPolygonNormal(pts: Point3D[]): Point3D {
  if (pts.length < 3) return { x: 0, y: 0, z: 1 };
  const p0 = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const ax = p1.x - p0.x;
    const ay = p1.y - p0.y;
    const az = p1.z - p0.z;
    const bx = p2.x - p0.x;
    const by = p2.y - p0.y;
    const bz = p2.z - p0.z;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-6) {
      return { x: nx / len, y: ny / len, z: nz / len };
    }
  }
  return { x: 0, y: 0, z: 1 };
}

export const BardagePlan3D: React.FC<{
  activeFacade: Facade3DData;
  allFacades: Facade3DData[];
  zoom?: number;
}> = ({ activeFacade, allFacades, zoom }) => {
  // Mode 3D : 'coupe' (façade active avec vue éclatée DTU) ou 'batiment' (assemblage 3D multi-façades)
  const [mode3D, setMode3D] = useState<"coupe" | "batiment">("coupe");
  // Angles caméra en degrés (yaw = rotation horizontale, pitch = inclinaison verticale)
  const [yawDeg, setYawDeg] = useState<number>(-28);
  const [pitchDeg, setPitchDeg] = useState<number>(16);
  // Facteur d'éclatement des couches DTU (0 = compact, 1 = éclaté)
  const [eclate, setEclate] = useState<boolean>(true);

  // Visibilité des couches
  const [showMur, setShowMur] = useState(true);
  const [showIsolant, setShowIsolant] = useState(true);
  const [showChevrons, setShowChevrons] = useState(true);
  const [showPanneaux, setShowPanneaux] = useState(true);
  const [showOuvertures, setShowOuvertures] = useState(true);

  const [selectedPiece, setSelectedPiece] = useState<{
    piece: PieceCalepinage;
    facadeNom: string;
  } | null>(null);

  const dragRef = useRef<{ startX: number; startY: number; startYaw: number; startPitch: number } | null>(
    null
  );

  // Construction des polygones 3D selon le mode choisi
  const scene3D = useMemo(() => {
    const eclateFactor = mode3D === "coupe" && eclate ? 1 : 0;

    if (mode3D === "coupe" || allFacades.length <= 1) {
      const W = activeFacade.L;
      const H = activeFacade.cal
        ? activeFacade.cal.hauteurFaiteM || activeFacade.cal.rangeesHauteursM.reduce((a, b) => a + b, 0)
        : activeFacade.Hm;
      const cx = W / 2;
      const cy = H / 2;
      const polys = buildFacadePolys(activeFacade, {
        showMur,
        showIsolant,
        showChevrons,
        showPanneaux,
        showOuvertures,
        eclateFactor,
        transform: (p) => ({ x: p.x - cx, y: p.y - cy, z: p.z }),
      });
      return { polys, span: Math.max(W, H, 4) };
    }

    // Mode Bâtiment Multi-Façades : dispose jusqu'à 4 façades autour du volume 3D
    const f0 = allFacades[0];
    const f1 = allFacades[1];
    const f2 = allFacades[2];
    const f3 = allFacades[3];

    const widthMain = f0.L;
    const depthMain = f1 ? f1.L : Math.max(4, f0.L * 0.65);
    const maxH = Math.max(...allFacades.map((f) => f.Hm), 3.2);
    const cy = maxH / 2;

    const allPolys: Poly3D[] = [];

    // Façade 1 : Avant (Sud, z = +depthMain/2)
    allPolys.push(
      ...buildFacadePolys(f0, {
        showMur,
        showIsolant,
        showChevrons,
        showPanneaux,
        showOuvertures,
        eclateFactor: 0,
        transform: (p) => ({
          x: p.x - widthMain / 2,
          y: p.y - cy,
          z: depthMain / 2 + p.z,
        }),
      })
    );

    // Façade 2 : Droite (Est, x = +widthMain/2)
    if (f1) {
      allPolys.push(
        ...buildFacadePolys(f1, {
          showMur,
          showIsolant,
          showChevrons,
          showPanneaux,
          showOuvertures,
          eclateFactor: 0,
          transform: (p) => ({
            x: widthMain / 2 + p.z,
            y: p.y - cy,
            z: depthMain / 2 - p.x,
          }),
        })
      );
    }

    // Façade 3 : Arrière (Nord, z = -depthMain/2)
    if (f2) {
      allPolys.push(
        ...buildFacadePolys(f2, {
          showMur,
          showIsolant,
          showChevrons,
          showPanneaux,
          showOuvertures,
          eclateFactor: 0,
          transform: (p) => ({
            x: widthMain / 2 - p.x,
            y: p.y - cy,
            z: -depthMain / 2 - p.z,
          }),
        })
      );
    }

    // Façade 4 : Gauche (Ouest, x = -widthMain/2)
    if (f3) {
      allPolys.push(
        ...buildFacadePolys(f3, {
          showMur,
          showIsolant,
          showChevrons,
          showPanneaux,
          showOuvertures,
          eclateFactor: 0,
          transform: (p) => ({
            x: -widthMain / 2 - p.z,
            y: p.y - cy,
            z: -depthMain / 2 + p.x,
          }),
        })
      );
    }

    return {
      polys: allPolys,
      span: Math.max(widthMain + depthMain, maxH * 1.5, 6),
    };
  }, [
    mode3D,
    eclate,
    activeFacade,
    allFacades,
    showMur,
    showIsolant,
    showChevrons,
    showPanneaux,
    showOuvertures,
  ]);

  // Projection 3D -> 2D SVG avec rotation caméra (yaw, pitch) et tri en profondeur (algorithme du peintre)
  const projected = useMemo(() => {
    const yaw = (yawDeg * Math.PI) / 180;
    const pitch = (pitchDeg * Math.PI) / 180;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    const camDist = scene3D.span * 2.6;

    const projectPt = (p: Point3D) => {
      // Rotation autour de Y (yaw)
      const x1 = p.x * cosY + p.z * sinY;
      const z1 = -p.x * sinY + p.z * cosY;
      // Rotation autour de X (pitch)
      const y2 = p.y * cosP - z1 * sinP;
      const z2 = p.y * sinP + z1 * cosP;

      // Légère perspective conique pour réalisme 3D
      const perspective = camDist / Math.max(1.5, camDist - z2);
      return {
        sx: x1 * perspective,
        sy: -y2 * perspective,
        depth: z2,
      };
    };

    const items = scene3D.polys.map((poly) => {
      const pPts = poly.pts.map(projectPt);
      const avgDepth = pPts.reduce((s, q) => s + q.depth, 0) / pPts.length;
      const cx = pPts.reduce((s, q) => s + q.sx, 0) / pPts.length;
      const cy = pPts.reduce((s, q) => s + q.sy, 0) / pPts.length;

      // Calcul de la normale du polygone en repère monde puis rotation caméra
      const norm = getPolygonNormal(poly.pts);
      const nz1 = -norm.x * sinY + norm.z * cosY;
      const nz2 = norm.y * sinP + nz1 * cosP;

      // nz2 correspond à cos(angle) entre la normale de la face et l'axe de vue de la caméra.
      // Si Math.abs(nz2) < 0.35 ou nz2 <= 0 (vue de profil rasant ou face arrière),
      // masquer automatiquement les étiquettes pour éviter tout chevauchement en vue éclatée / tranche.
      const showLabel = nz2 >= 0.35;

      return {
        poly,
        pPts,
        pointsAttr: pPts.map((q) => `${q.sx.toFixed(3)},${q.sy.toFixed(3)}`).join(" "),
        avgDepth: avgDepth + poly.layerOrder * 0.002,
        cx,
        cy,
        showLabel,
      };
    });

    // 1. Calcul de la profondeur moyenne et de l'orientation de chaque façade
    const facadeDepthMap = new Map<string, number>();
    const facadeFacingMap = new Map<string, boolean>();
    const facadePointsMap = new Map<string, { sumDepth: number; count: number }>();

    for (const it of items) {
      const fId = it.poly.facadeId;
      const cur = facadePointsMap.get(fId) || { sumDepth: 0, count: 0 };
      cur.sumDepth += it.avgDepth;
      cur.count += 1;
      facadePointsMap.set(fId, cur);

      if (!it.poly.isSideChant && !facadeFacingMap.has(fId)) {
        const norm = getPolygonNormal(it.poly.pts);
        const nz1 = -norm.x * sinY + norm.z * cosY;
        const nz2 = norm.y * sinP + nz1 * cosP;
        facadeFacingMap.set(fId, nz2 >= 0);
      }
    }

    for (const [fId, cur] of facadePointsMap.entries()) {
      facadeDepthMap.set(fId, cur.sumDepth / cur.count);
    }

    // 2. Tri Painter's Algorithm avec Layer Priority absolue par façade
    items.sort((a, b) => {
      // Étape A : Si façades distinctes (Mode Bâtiment 3D), la façade arrière est dessinée en premier
      if (a.poly.facadeId !== b.poly.facadeId) {
        const depthA = facadeDepthMap.get(a.poly.facadeId) ?? a.avgDepth;
        const depthB = facadeDepthMap.get(b.poly.facadeId) ?? b.avgDepth;
        if (Math.abs(depthA - depthB) > 0.1) {
          return depthA - depthB;
        }
      }

      // Étape B : Pour une même façade, hiérarchie stricte des couches (Layer Priority)
      // Vue de face (front-facing) : 1. Mur support -> 2. Isolant ITE -> 3. Chevrons -> 4. Panneaux -> 5. Ouvertures
      // Vue arrière (back-facing) : 5. Ouvertures -> 4. Panneaux -> 3. Chevrons -> 2. Isolant -> 1. Mur support
      const isFront = facadeFacingMap.get(a.poly.facadeId) ?? true;
      const rankA = isFront ? a.poly.layerId : 10 - a.poly.layerId;
      const rankB = isFront ? b.poly.layerId : 10 - b.poly.layerId;

      if (rankA !== rankB) {
        return rankA - rankB; // L'ITE ou un chevron ne dépassera JAMAIS devant un panneau !
      }

      // Étape C : Au sein de la même couche d'une même façade
      // Les chants latéraux sont dessinés juste avant la face avant
      if (Boolean(a.poly.isSideChant) !== Boolean(b.poly.isSideChant)) {
        return (a.poly.isSideChant ? 0 : 1) - (b.poly.isSideChant ? 0 : 1);
      }

      // Tri fin par profondeur des pièces d'une même couche
      return a.avgDepth - b.avgDepth;
    });

    // Calcul de la boîte englobante 2D projetée
    let minX = -3,
      maxX = 3,
      minY = -2,
      maxY = 2;
    if (items.length > 0) {
      minX = Infinity;
      maxX = -Infinity;
      minY = Infinity;
      maxY = -Infinity;
      for (const it of items) {
        for (const q of it.pPts) {
          if (q.sx < minX) minX = q.sx;
          if (q.sx > maxX) maxX = q.sx;
          if (q.sy < minY) minY = q.sy;
          if (q.sy > maxY) maxY = q.sy;
        }
      }
    }
    const pad = 0.65;
    return {
      items,
      viewBox: `${(minX - pad).toFixed(2)} ${(minY - pad).toFixed(2)} ${(
        maxX - minX + pad * 2
      ).toFixed(2)} ${(maxY - minY + pad * 2).toFixed(2)}`,
    };
  }, [scene3D, yawDeg, pitchDeg]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startYaw: yawDeg,
      startPitch: pitchDeg,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setYawDeg(Math.round(dragRef.current.startYaw + dx * 0.45));
    setPitchDeg(Math.max(-65, Math.min(75, Math.round(dragRef.current.startPitch + dy * 0.35))));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="space-y-2.5">
      {/* Barre d'outils 3D : Mode (Coupe Éclatée DTU vs Bâtiment Multi-Façades) + Angles Caméra */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode3D("coupe")}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-all ${
              mode3D === "coupe"
                ? "bg-orange-500 text-white shadow-sm"
                : "bg-slate-900 text-slate-300 border border-slate-700 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Coupe 3D ({activeFacade.nom})
          </button>
          {allFacades.length > 1 && (
            <button
              type="button"
              onClick={() => setMode3D("batiment")}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-all ${
                mode3D === "batiment"
                  ? "bg-orange-500 text-white shadow-sm"
                  : "bg-slate-900 text-slate-300 border border-slate-700 hover:text-white"
              }`}
            >
              <Box className="w-3.5 h-3.5" /> Bâtiment 3D ({allFacades.length} façades)
            </button>
          )}
        </div>

        {/* Presets de caméra & bouton Éclaté DTU */}
        <div className="flex flex-wrap items-center gap-1">
          {mode3D === "coupe" && (
            <button
              type="button"
              onClick={() => setEclate((v) => !v)}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                eclate
                  ? "bg-orange-500/20 border-orange-500 text-orange-300"
                  : "bg-slate-900 border-slate-700 text-slate-300"
              }`}
            >
              {eclate ? "Vue Éclatée DTU ✓" : "Vue Compacte"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setYawDeg(-28);
              setPitchDeg(16);
            }}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
          >
            Iso G
          </button>
          <button
            type="button"
            onClick={() => {
              setYawDeg(32);
              setPitchDeg(18);
            }}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
          >
            Iso D
          </button>
          <button
            type="button"
            onClick={() => {
              setYawDeg(0);
              setPitchDeg(0);
            }}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
          >
            Face
          </button>
          <button
            type="button"
            onClick={() => {
              setYawDeg(-25);
              setPitchDeg(55);
            }}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
          >
            Dessus
          </button>
          <button
            type="button"
            onClick={() => {
              setYawDeg(-28);
              setPitchDeg(16);
              setSelectedPiece(null);
            }}
            className="p-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white"
            title="Réinitialiser la vue 3D"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filtres de visibilité des couches DTU */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] px-1">
        <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
          <Eye className="w-3 h-3 text-orange-400" /> Couches 3D :
        </span>
        {[
          { label: "Mur support", state: showMur, set: setShowMur, dot: "#94A3B8" },
          { label: "Isolant ITE", state: showIsolant, set: setShowIsolant, dot: "#F59E0B" },
          { label: "Chevrons", state: showChevrons, set: setShowChevrons, dot: "#38BDF8" },
          { label: "Panneaux", state: showPanneaux, set: setShowPanneaux, dot: "#F97316" },
          { label: "Ouvertures", state: showOuvertures, set: setShowOuvertures, dot: "#0284C7" },
        ].map((layer) => (
          <label
            key={layer.label}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-950 border border-slate-800 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={layer.state}
              onChange={(e) => layer.set(e.target.checked)}
              className="accent-orange-500"
            />
            <i className="w-2 h-2 rounded-full inline-block" style={{ background: layer.dot }} />
            <span className="font-semibold text-slate-200">{layer.label}</span>
          </label>
        ))}
      </div>

      {/* Scène 3D interactive (glisser au doigt ou à la souris pour tourner à 360°) */}
      <div className={zoom ? "overflow-auto" : "overflow-x-auto"}>
        <svg
          viewBox={projected.viewBox}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="rounded-xl bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border border-slate-800 block touch-none cursor-grab active:cursor-grabbing select-none"
          style={
            zoom
              ? { width: `${Math.round(zoom * 100)}%`, minWidth: `${Math.round(zoom * 640)}px`, maxWidth: "none" }
              : { width: "100%", minWidth: "460px", maxHeight: "62vh" }
          }
          role="img"
          aria-label="Maquette 3D interactive du bardage"
        >
          {projected.items.map(({ poly, pointsAttr, cx, cy, showLabel }) => {
            const isSel =
              selectedPiece &&
              poly.piece &&
              selectedPiece.piece.id === poly.piece.id &&
              selectedPiece.facadeNom === poly.facadeNom;
            return (
              <g
                key={poly.id}
                onClick={(e) => {
                  if (poly.piece) {
                    e.stopPropagation();
                    setSelectedPiece(
                      isSel ? null : { piece: poly.piece, facadeNom: poly.facadeNom || activeFacade.nom }
                    );
                  }
                }}
                className={poly.piece ? "cursor-pointer" : undefined}
              >
                <polygon
                  points={pointsAttr}
                  fill={isSel ? "#F97316" : poly.fill}
                  stroke={isSel ? "#FFFFFF" : poly.stroke}
                  strokeWidth={isSel ? 0.022 : poly.strokeWidth * 0.012}
                  strokeLinejoin="round"
                  opacity={poly.opacity ?? 1}
                />
                {showLabel && poly.label && (
                  <text
                    x={cx}
                    y={cy - (poly.subLabel ? 0.05 : 0)}
                    fontSize={0.11}
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isSel ? "#FFFFFF" : "#0F172A"}
                    style={{ pointerEvents: "none" }}
                  >
                    {poly.label}
                  </text>
                )}
                {showLabel && poly.subLabel && (
                  <text
                    x={cx}
                    y={cy + 0.06}
                    fontSize={0.075}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isSel ? "#FDE68A" : "#334155"}
                    style={{ pointerEvents: "none" }}
                  >
                    {poly.subLabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
        <span>
          Glisse le doigt sur la maquette 3D pour tourner à 360° (Angle : {yawDeg}° / {pitchDeg}°)
        </span>
        <span>
          {mode3D === "coupe" && eclate
            ? "Coupe éclatée : Mur → Isolant ITE → Chevrons → Panneaux"
            : "Maquette 3D assemblée"}
        </span>
      </div>

      {selectedPiece && (
        <p className="text-[11px] bg-slate-950 border border-orange-500/40 rounded-xl p-2.5 text-slate-200">
          <b className="text-orange-400">{selectedPiece.facadeNom}</b> · Panneau <b className="text-white">{selectedPiece.piece.repere}</b> ·{" "}
          {Math.round(selectedPiece.piece.largeurM * 1000)} ×{" "}
          {Math.round(selectedPiece.piece.hauteurM * 1000)} mm
          {selectedPiece.piece.pignonDetails ? (
            <span className="text-amber-300 font-semibold">
              {" "}
              (rampants : G {selectedPiece.piece.pignonDetails.hLeftMm} / D {selectedPiece.piece.pignonDetails.hRightMm} mm)
            </span>
          ) : null}
          {" "}· <b className="text-white">{selectedPiece.piece.surfaceM2.toFixed(2)} m²</b> · Plaque brute n°
          {selectedPiece.piece.plaqueIndex ?? "—"}
          {selectedPiece.piece.coupleAvec ? (
            <span className="ml-1.5 inline-flex items-center rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
              ♻️ Couplé tête-bêche avec {selectedPiece.piece.coupleAvec.repere}
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
};
