"use client";

import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  Rotate3d,
  Layers,
  Box,
  Eye,
  EyeOff,
  RotateCcw,
  Sliders,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  X,
  Maximize2,
  Sparkles,
  Info,
} from "lucide-react";
import type { PieceCalepinage, ResultatCalepinage } from "@/lib/calepinageCalcul";
import { getHauteurToit } from "@/lib/calepinageCalcul";
import type { FamillePose, ResultatPose } from "@/lib/poseCalcul";

// =========================================================================
// TYPES & CONTRATS
// =========================================================================

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

export interface ComponentMeta {
  kind: "PANNEAU" | "OUVERTURE" | "BAVETTE" | "TABLEAU" | "LINTEAU" | "CHEVRON" | "ISOLANT" | "MUR";
  title: string;
  subtitle: string;
  details: Array<[string, string]>;
  piece?: PieceCalepinage;
  facadeNom?: string;
}

export interface BardageTextureConfig {
  map: THREE.CanvasTexture | null;
  bumpMap: THREE.CanvasTexture | null;
  roughness: number;
  metalness: number;
  baseColor: string;
}

// Cache global des textures pour éviter de recréer les CanvasTextures en boucle
const textureCache = new Map<string, BardageTextureConfig>();

// =========================================================================
// PROPRIÉTÉS PBR ET GÉNÉRATEUR PROCÉDURAL DE TEXTURES (100 % AUTONOME)
// =========================================================================

/**
 * Propriétés photoréalistes PBR de chaque famille de bardage (DTU 41.2)
 */
export function getFamillePBRProperties(famille: FamillePose): {
  roughness: number;
  metalness: number;
  baseColor: string;
} {
  switch (famille) {
    case "hpl":
      // Stratifié HPL : Finition satinée / mate ultra-lisse avec micro-grain minéral
      return { roughness: 0.38, metalness: 0.04, baseColor: "#334155" };
    case "bois_naturel":
      // Bois massif veiné (Douglas, Mélèze, Red Cedar)
      return { roughness: 0.68, metalness: 0.02, baseColor: "#b45309" };
    case "composite":
      // Lames composites rainurées coextrudées
      return { roughness: 0.52, metalness: 0.07, baseColor: "#27272a" };
    case "cassette":
      // Cassettes métalliques aluminium laqué brossé
      return { roughness: 0.28, metalness: 0.82, baseColor: "#64748b" };
    default:
      return { roughness: 0.5, metalness: 0.05, baseColor: "#334155" };
  }
}

/**
 * Crée les textures PBR (Diffuse Albedo + Bump Map de relief) pour les familles de parement :
 * - Stratifié HPL : micro-grain satiné/mat doux (Trespa, Fundermax, Rockpanel)
 * - Bois massif : veinage filant naturel avec cernes de croissance et fibres
 * - Lames composites : cannelures rainurées régulières et micro-stries coextrudées
 * - Cassettes métalliques : brossage aluminium architectural
 */
export function createBardageProceduralTextures(
  famille: FamillePose,
  orientation: "horizontal" | "vertical" = "horizontal"
): BardageTextureConfig {
  const cacheKey = `${famille}-${orientation}`;
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const pbr = getFamillePBRProperties(famille);

  const isJsdom =
    typeof navigator !== "undefined" &&
    typeof navigator.userAgent === "string" &&
    navigator.userAgent.includes("jsdom");

  if (typeof document === "undefined" || isJsdom) {
    return {
      map: null,
      bumpMap: null,
      roughness: pbr.roughness,
      metalness: pbr.metalness,
      baseColor: pbr.baseColor,
    };
  }

  const width = 512;
  const height = 512;

  try {
    // 1. Canvas Couleur / Albedo
    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = width;
    colorCanvas.height = height;
    const ctx = colorCanvas.getContext?.("2d");

    // 2. Canvas Bump Map (Relief)
    const bumpCanvas = document.createElement("canvas");
    bumpCanvas.width = width;
    bumpCanvas.height = height;
    const bCtx = bumpCanvas.getContext?.("2d");

    if (!ctx || !bCtx) {
      return {
        map: null,
        bumpMap: null,
        roughness: pbr.roughness,
        metalness: pbr.metalness,
        baseColor: pbr.baseColor,
      };
    }

    const { roughness, metalness, baseColor } = pbr;

    if (famille === "hpl") {
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, width, height);

      // Micro-grain minéral (subtle noise)
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 14;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);

      // Bump Map : surface plane avec très faible rugosité satinée
      bCtx.fillStyle = "#c0c0c0";
      bCtx.fillRect(0, 0, width, height);
      const bImg = bCtx.getImageData(0, 0, width, height);
      const bData = bImg.data;
      for (let i = 0; i < bData.length; i += 4) {
        const noise = (Math.random() - 0.5) * 8;
        const v = Math.min(255, Math.max(0, 192 + noise));
        bData[i] = v;
        bData[i + 1] = v;
        bData[i + 2] = v;
      }
      bCtx.putImageData(bImg, 0, 0);
    } else if (famille === "bois_naturel") {
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, width, height);

      bCtx.fillStyle = "#d4d4d8";
      bCtx.fillRect(0, 0, width, height);

      // Cernes de croissance et fibres ondulantes
      const isVert = orientation === "vertical";
      const steps = 24;
      for (let pos = 0; pos < (isVert ? width : height); pos += steps) {
        const waveFreq = 0.015 + Math.random() * 0.01;
        const waveAmp = 6 + Math.random() * 8;

        ctx.beginPath();
        bCtx.beginPath();

        ctx.strokeStyle = pos % 48 === 0 ? "#78350f" : "#92400e";
        ctx.lineWidth = pos % 48 === 0 ? 3 : 1.5;
        ctx.globalAlpha = 0.55;

        bCtx.strokeStyle = "#18181b";
        bCtx.lineWidth = pos % 48 === 0 ? 3.5 : 2;

        for (let s = 0; s <= (isVert ? height : width); s += 8) {
          const offset = Math.sin(s * waveFreq) * waveAmp;
          const x = isVert ? pos + offset : s;
          const y = isVert ? s : pos + offset;
          if (s === 0) {
            ctx.moveTo(x, y);
            bCtx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
            bCtx.lineTo(x, y);
          }
        }
        ctx.stroke();
        bCtx.stroke();
      }
      ctx.globalAlpha = 1.0;

      // Fines micro-fibres de bois
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = "#fef3c7";
      ctx.lineWidth = 1;
      for (let i = 0; i < 40; i++) {
        const p = Math.random() * (isVert ? width : height);
        ctx.beginPath();
        if (isVert) {
          ctx.moveTo(p, 0);
          ctx.lineTo(p + (Math.random() - 0.5) * 8, height);
        } else {
          ctx.moveTo(0, p);
          ctx.lineTo(width, p + (Math.random() - 0.5) * 8);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;
    } else if (famille === "composite") {
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, width, height);

      bCtx.fillStyle = "#e4e4e7";
      bCtx.fillRect(0, 0, width, height);

      // Rainures régulières en creux de 2.5 mm espacées de 16 px
      const grooveSpacing = 16;
      ctx.strokeStyle = "#09090b";
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;

      bCtx.strokeStyle = "#000000";
      bCtx.lineWidth = 3.5;

      for (let y = 0; y < height; y += grooveSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        bCtx.beginPath();
        bCtx.moveTo(0, y);
        bCtx.lineTo(width, y);
        bCtx.stroke();
      }
      ctx.globalAlpha = 1.0;
    } else {
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, width, height);

      bCtx.fillStyle = "#c0c0c0";
      bCtx.fillRect(0, 0, width, height);

      // Stries directionnelles d'aluminium brossé
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.25;
      for (let y = 0; y < height; y += 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;
    }

    const mapTexture = new THREE.CanvasTexture(colorCanvas);
    mapTexture.wrapS = THREE.RepeatWrapping;
    mapTexture.wrapT = THREE.RepeatWrapping;

    const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
    bumpTexture.wrapS = THREE.RepeatWrapping;
    bumpTexture.wrapT = THREE.RepeatWrapping;

    const result: BardageTextureConfig = {
      map: mapTexture,
      bumpMap: bumpTexture,
      roughness,
      metalness,
      baseColor,
    };

    textureCache.set(cacheKey, result);
    return result;
  } catch {
    return {
      map: null,
      bumpMap: null,
      roughness: pbr.roughness,
      metalness: pbr.metalness,
      baseColor: pbr.baseColor,
    };
  }
}

// =========================================================================
// COMPOSANT THREE.JS : FAÇADE 3D ÉCLATÉE & DÉTAILS ARCHITECTURAUX
// =========================================================================

interface SingleFacadeSceneProps {
  facade: Facade3DData;
  eclateRatio: number;
  showMur: boolean;
  showIsolant: boolean;
  showChevrons: boolean;
  showPanneaux: boolean;
  showOuvertures: boolean;
  selectedPieceId: string | null;
  onSelectMeta: (meta: ComponentMeta | null) => void;
}

function SingleFacade3D({
  facade,
  eclateRatio,
  showMur,
  showIsolant,
  showChevrons,
  showPanneaux,
  showOuvertures,
  selectedPieceId,
  onSelectMeta,
}: SingleFacadeSceneProps) {
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

  // Décalage en mode Éclaté DTU 41.2
  const gap = eclateRatio * 0.42;

  const epMurM = 0.18;
  const hasIsolant = facade.pose.isolant.epaisseurMm > 0;
  const epIsolantM = Math.max(0.06, facade.pose.isolant.epaisseurMm / 1000);

  // Altitudes Z relatives des couches
  const zMurFront = 0;
  const zMurCenter = zMurFront - epMurM / 2;

  const zIsoBack = zMurFront + gap * 0.8;
  const zIsoFront = zIsoBack + (hasIsolant ? epIsolantM : 0);
  const zIsoCenter = (zIsoBack + zIsoFront) / 2;

  const epChevM = 0.065;
  const zChevBack = (hasIsolant ? zIsoFront : zMurFront) + gap * 1.5;
  const zChevFront = zChevBack + epChevM;
  const zChevCenter = (zChevBack + zChevFront) / 2;

  const epPanM = 0.01;
  const zPanBack = zChevFront + gap * 2.3;
  const zPanFront = zPanBack + epPanM;
  const zPanCenter = (zPanBack + zPanFront) / 2;

  const zOuvBack = zPanFront + gap * 0.6;

  // Textures PBR de la famille de bardage
  const textures = useMemo(() => {
    return createBardageProceduralTextures(facade.famille);
  }, [facade.famille]);

  // Silhouette géométrique pour pignon (rampants)
  const wallShape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(W, 0);
    if (estPignon) {
      s.lineTo(W, hMur);
      s.lineTo(W / 2, hFaite);
      s.lineTo(0, hMur);
    } else {
      s.lineTo(W, H);
      s.lineTo(0, H);
    }
    s.closePath();
    return s;
  }, [W, H, hMur, hFaite, estPignon]);

  return (
    <group>
      {/* ------------------------------------------------------------- */}
      {/* COUCHE 1 : MUR SUPPORT MAÇONNERIE / BÉTON (Layer 1)            */}
      {/* ------------------------------------------------------------- */}
      {showMur && (
        <group>
          {estPignon ? (
            <mesh
              position={[0, 0, zMurFront - epMurM]}
              receiveShadow
              onClick={(e) => {
                e.stopPropagation();
                onSelectMeta({
                  kind: "MUR",
                  title: `Mur porteur pignon (${facade.nom})`,
                  subtitle: `Largeur ${W.toFixed(2)} m · Hauteur mur ${hMur.toFixed(2)} m · Faîte ${hFaite.toFixed(2)} m`,
                  details: [
                    ["Nature support", "Béton banché / Maçonnerie enduite"],
                    ["Épaisseur support", `${Math.round(epMurM * 1000)} mm`],
                    ["Surface brute", `${facade.surfaceM2.toFixed(1)} m²`],
                    ["Ancrages chevilles", "Fixation mécanique certifiée ETE"],
                  ],
                  facadeNom: facade.nom,
                });
              }}
            >
              <extrudeGeometry args={[wallShape, { depth: epMurM, bevelEnabled: false }]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.92} metalness={0.05} />
            </mesh>
          ) : (
            <mesh
              position={[W / 2, H / 2, zMurCenter]}
              receiveShadow
              onClick={(e) => {
                e.stopPropagation();
                onSelectMeta({
                  kind: "MUR",
                  title: `Mur support maçonnerie (${facade.nom})`,
                  subtitle: `Dimensions : ${W.toFixed(2)} × ${H.toFixed(2)} m · Épaisseur : ${Math.round(epMurM * 1000)} mm`,
                  details: [
                    ["Nature du support", "Béton banché / Maçonnerie d'éléments creux"],
                    ["Surface brute", `${facade.surfaceM2.toFixed(1)} m²`],
                    ["Planéité DTU 41.2", "Tolérance sous règle de 2 m ≤ 5 mm"],
                  ],
                  facadeNom: facade.nom,
                });
              }}
            >
              <boxGeometry args={[W, H, epMurM]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.92} metalness={0.05} />
            </mesh>
          )}
        </group>
      )}

      {/* ------------------------------------------------------------- */}
      {/* COUCHE 2 : ISOLANT THERMIQUE ITE (Layer 2)                     */}
      {/* ------------------------------------------------------------- */}
      {showIsolant && hasIsolant && (
        <group>
          {estPignon ? (
            <mesh
              position={[0, 0, zIsoBack]}
              castShadow
              receiveShadow
              onClick={(e) => {
                e.stopPropagation();
                onSelectMeta({
                  kind: "ISOLANT",
                  title: `Isolant ITE (${facade.pose.isolant.typeIsolant || "Laine minérale"})`,
                  subtitle: `Épaisseur : ${facade.pose.isolant.epaisseurMm} mm · Surface nette : ${facade.surfaceM2.toFixed(1)} m²`,
                  details: [
                    ["Type isolant", "Laine minérale / biosourcé embroché sur équerres"],
                    ["Épaisseur", `${facade.pose.isolant.epaisseurMm} mm`],
                    ["Résistance R", `R = ${(facade.pose.isolant.epaisseurMm / 35).toFixed(2)} m²·K/W`],
                    ["Tenue au feu", "Incombustible Euroclasse A1/A2"],
                  ],
                  facadeNom: facade.nom,
                });
              }}
            >
              <extrudeGeometry args={[wallShape, { depth: epIsolantM, bevelEnabled: false }]} />
              <meshStandardMaterial color="#f59e0b" roughness={0.96} metalness={0.0} />
            </mesh>
          ) : (
            <mesh
              position={[W / 2, H / 2, zIsoCenter]}
              castShadow
              receiveShadow
              onClick={(e) => {
                e.stopPropagation();
                onSelectMeta({
                  kind: "ISOLANT",
                  title: `Isolant thermique ITE (${facade.pose.isolant.typeIsolant || "Laine minérale"})`,
                  subtitle: `Épaisseur : ${facade.pose.isolant.epaisseurMm} mm`,
                  details: [
                    ["Matériau", "Laine de roche haute densité"],
                    ["Épaisseur", `${facade.pose.isolant.epaisseurMm} mm`],
                    ["Fixation DTU", "Embroché sur pattes-équerres avec rosaces"],
                  ],
                  facadeNom: facade.nom,
                });
              }}
            >
              <boxGeometry args={[W, H, epIsolantM]} />
              <meshStandardMaterial color="#f59e0b" roughness={0.96} metalness={0.0} />
            </mesh>
          )}
        </group>
      )}

      {/* ------------------------------------------------------------- */}
      {/* COUCHE 3 : CHEVRONS D'OSSATURE SECONDAIRE (Layer 3)           */}
      {/* ------------------------------------------------------------- */}
      {showChevrons && (
        <group>
          {facade.pose.positionsChevronsM.map((cx, idx) => {
            const chevW = 0.055; // 55 mm
            const chevH = estPignon
              ? Math.max(0.2, getHauteurToit(cx, W, hMur, hFaite) - 0.03)
              : H;
            const chevY = chevH / 2;

            return (
              <mesh
                key={`chev-${idx}`}
                position={[cx, chevY, zChevCenter]}
                castShadow
                receiveShadow
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMeta({
                    kind: "CHEVRON",
                    title: `Chevron d'ossature #${idx + 1} (${facade.nom})`,
                    subtitle: `Position X : ${Math.round(cx * 1000)} mm · Longueur : ${Math.round(chevH * 1000)} mm`,
                    details: [
                      ["Section", "55 × 65 mm (classe d'emploi 2/3 résineux)"],
                      ["Entraxe", "Conforme DTU 41.2 selon zone de vent et charge"],
                      ["Lame d'air", "Ventilation continue sous parement ≥ 20 mm"],
                    ],
                    facadeNom: facade.nom,
                  });
                }}
              >
                <boxGeometry args={[chevW, chevH, epChevM]} />
                <meshStandardMaterial color="#d7ba8d" roughness={0.65} metalness={0.02} />
              </mesh>
            );
          })}
        </group>
      )}

      {/* ------------------------------------------------------------- */}
      {/* COUCHE 4 : PANNEAUX DE PAREMENT & JOINTS OUVERTS 8 MM (Layer 4)*/}
      {/* ------------------------------------------------------------- */}
      {showPanneaux && facade.cal && (
        <group>
          {facade.cal.pieces.map((p) => {
            const isSelected = selectedPieceId === p.id;
            const joint = 0.008; // 8 mm de joint creux architectural DTU 41.2
            const pieceW = Math.max(0.04, p.largeurM - joint);
            const pieceH = Math.max(0.04, p.hauteurM - joint);
            const posX = p.xM + p.largeurM / 2;
            const posY = p.yM + p.hauteurM / 2;

            // Détermination de la couleur selon le rôle
            const panelColor = isSelected
              ? "#f97316"
              : p.type === "pleine"
              ? textures.baseColor
              : p.type === "pignon"
              ? "#78350f"
              : "#475569";

            return (
              <mesh
                key={`panel-${p.id}`}
                position={[posX, posY, zPanCenter]}
                castShadow
                receiveShadow
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMeta({
                    kind: "PANNEAU",
                    title: `Panneau ${p.repere} (${facade.nom})`,
                    subtitle: `${Math.round(p.largeurM * 1000)} × ${Math.round(p.hauteurM * 1000)} mm · Surface : ${p.surfaceM2.toFixed(2)} m²`,
                    details: [
                      ["Type de pièce", p.type === "pleine" ? "Panneau plein standard" : p.type === "pignon" ? "Panneau d'arase pignon" : "Découpe ajustée"],
                      ["Plaque brute mère", `Plaque #${p.plaqueIndex ?? 1}`],
                      ["Épaisseur", "10 mm (joint creux ouvert 8 mm)"],
                      ["Fixations DTU 41.2", p.surfaceM2 > 0.8 ? "8 à 10 fixations inox/laquées" : "4 à 6 fixations"],
                      ...(p.coupleAvec ? [["Couplage ♻️", `Tête-bêche avec ${p.coupleAvec.repere}`] as [string, string]] : []),
                    ],
                    piece: p,
                    facadeNom: facade.nom,
                  });
                }}
              >
                <boxGeometry args={[pieceW, pieceH, epPanM]} />
                <meshStandardMaterial
                  map={textures.map ?? undefined}
                  bumpMap={textures.bumpMap ?? undefined}
                  bumpScale={0.03}
                  color={panelColor}
                  roughness={isSelected ? 0.3 : textures.roughness}
                  metalness={textures.metalness}
                  emissive={isSelected ? "#ea580c" : "#000000"}
                  emissiveIntensity={isSelected ? 0.45 : 0}
                />
              </mesh>
            );
          })}
        </group>
      )}

      {/* ------------------------------------------------------------- */}
      {/* COUCHE 5 : ENCADREMENTS D'OUVERTURES & VITRAGES (Layer 5)      */}
      {/* ------------------------------------------------------------- */}
      {showOuvertures && facade.ouverturesCalculees.length > 0 && (
        <group>
          {facade.ouverturesCalculees.map((o) => {
            const oW = o.largeurM;
            const oH = o.hauteurM;
            const oX = o.xM;
            const oY = o.yM;

            // Profondeur d'ébrasement du dormant jusqu'au nu du parement
            const depthEbrasement = (zPanFront - zMurFront) + 0.02;
            const centerZEbrasement = (zMurFront + zPanFront) / 2;

            // Dimensions de la bavette d'appui alu : L_ouv + 60 mm (oreilles latérales)
            const bavetteW = oW + 0.06;
            const bavetteH = 0.035;
            const bavetteDepth = depthEbrasement + 0.04; // Saillie de 40 mm à l'extérieur

            // Dimensions du profilé linteau : L_ouv + 40 mm avec retombée goutte d'eau
            const linteauW = oW + 0.04;
            const linteauH = 0.035;

            // Vitrage réfléchissant translucide situé au nu du mur
            const vitreW = Math.max(0.1, oW - 0.02);
            const vitreH = Math.max(0.1, oH - 0.02);

            return (
              <group key={`ouv-grp-${o.id}`}>
                {/* 1. Vitrage réfléchissant translucide */}
                <mesh
                  position={[oX + oW / 2, oY + oH / 2, zMurFront + 0.01]}
                  castShadow
                  receiveShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMeta({
                      kind: "OUVERTURE",
                      title: `Vitrage réfléchissant (${o.nom})`,
                      subtitle: `${Math.round(oW * 1000)} × ${Math.round(oH * 1000)} mm · Surface : ${o.surfaceM2.toFixed(2)} m²`,
                      details: [
                        ["Type d'ouverture", o.type === "porte" ? "Porte d'accès" : o.type === "baie" ? "Baie vitrée" : "Fenêtre"],
                        ["Position", `x ${Math.round(oX * 1000)} mm · y ${Math.round(oY * 1000)} mm`],
                        ["Nu de pose", "Au nu extérieur de la maçonnerie porteur"],
                      ],
                      facadeNom: facade.nom,
                    });
                  }}
                >
                  <boxGeometry args={[vitreW, vitreH, 0.015]} />
                  <meshStandardMaterial
                    color="#bae6fd"
                    transparent
                    opacity={0.45}
                    roughness={0.08}
                    metalness={0.3}
                  />
                </mesh>

                {/* 2. Bavette d'appui alu en saillie (Largeur = L_ouv + 60 mm) */}
                <mesh
                  position={[oX + oW / 2, oY - 0.015, centerZEbrasement + 0.02]}
                  rotation={[0.08, 0, 0]} // Pente de rejet d'eau > 5°
                  castShadow
                  receiveShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMeta({
                      kind: "BAVETTE",
                      title: `Bavette d'appui alu (${o.nom})`,
                      subtitle: `Longueur débit : ${Math.round(bavetteW * 1000)} mm (L_ouv + 60 mm)`,
                      details: [
                        ["Norme DTU 41.2", "Oreilles latérales 2 × 30 mm pour étanchéité"],
                        ["Rejet d'eau", "Saillie extérieure > 30 mm avec goutte d'eau"],
                        ["Finition", "Aluminium prélaqué RAL 7016"],
                        ["Débit optimisé", "Barre standard commerciale de 3,00 m"],
                      ],
                      facadeNom: facade.nom,
                    });
                  }}
                >
                  <boxGeometry args={[bavetteW, bavetteH, bavetteDepth]} />
                  <meshStandardMaterial color="#1e293b" roughness={0.32} metalness={0.8} />
                </mesh>

                {/* 3. Tableaux latéraux ébrasés (Gauche et Droite) */}
                {/* Tableau Gauche */}
                <mesh
                  position={[oX + 0.015, oY + oH / 2, centerZEbrasement]}
                  castShadow
                  receiveShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMeta({
                      kind: "TABLEAU",
                      title: `Tableau latéral gauche (${o.nom})`,
                      subtitle: `Hauteur débit : ${Math.round(oH * 1000)} mm`,
                      details: [
                        ["Profilé", "Cornière d'habillage aluminium 50×50 mm"],
                        ["Rôle", "Habillage étanche et continuité de la lame d'air"],
                        ["Finition", "Aluminium laqué RAL 7016"],
                      ],
                      facadeNom: facade.nom,
                    });
                  }}
                >
                  <boxGeometry args={[0.03, oH, depthEbrasement]} />
                  <meshStandardMaterial color="#1e293b" roughness={0.32} metalness={0.8} />
                </mesh>

                {/* Tableau Droit */}
                <mesh
                  position={[oX + oW - 0.015, oY + oH / 2, centerZEbrasement]}
                  castShadow
                  receiveShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMeta({
                      kind: "TABLEAU",
                      title: `Tableau latéral droit (${o.nom})`,
                      subtitle: `Hauteur débit : ${Math.round(oH * 1000)} mm`,
                      details: [
                        ["Profilé", "Cornière d'habillage aluminium 50×50 mm"],
                        ["Rôle", "Habillage étanche et continuité de la lame d'air"],
                        ["Finition", "Aluminium laqué RAL 7016"],
                      ],
                      facadeNom: facade.nom,
                    });
                  }}
                >
                  <boxGeometry args={[0.03, oH, depthEbrasement]} />
                  <meshStandardMaterial color="#1e293b" roughness={0.32} metalness={0.8} />
                </mesh>

                {/* 4. Profilé linteau avec goutte d'eau (L_ouv + 40 mm) */}
                <mesh
                  position={[oX + oW / 2, oY + oH + 0.015, centerZEbrasement]}
                  castShadow
                  receiveShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMeta({
                      kind: "LINTEAU",
                      title: `Profilé linteau goutte d'eau (${o.nom})`,
                      subtitle: `Longueur débit : ${Math.round(linteauW * 1000)} mm (L_ouv + 40 mm)`,
                      details: [
                        ["Ventilation haute", "Grille anti-rongeur intégrée DTU 41.2"],
                        ["Goutte d'eau", "Rejet d'eau supérieur hors du vitrage"],
                        ["Finition", "Aluminium laqué RAL 7016"],
                      ],
                      facadeNom: facade.nom,
                    });
                  }}
                >
                  <boxGeometry args={[linteauW, linteauH, depthEbrasement]} />
                  <meshStandardMaterial color="#1e293b" roughness={0.32} metalness={0.8} />
                </mesh>
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
}

// =========================================================================
// SCÈNE GLOBALE THREE.JS (COUPE FAÇADE OU BÂTIMENT COMPLET)
// =========================================================================

interface SceneContentProps {
  activeFacade: Facade3DData;
  allFacades: Facade3DData[];
  mode3D: "coupe" | "batiment";
  eclateRatio: number;
  showMur: boolean;
  showIsolant: boolean;
  showChevrons: boolean;
  showPanneaux: boolean;
  showOuvertures: boolean;
  selectedPieceId: string | null;
  onSelectMeta: (meta: ComponentMeta | null) => void;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}

function SceneContent({
  activeFacade,
  allFacades,
  mode3D,
  eclateRatio,
  showMur,
  showIsolant,
  showChevrons,
  showPanneaux,
  showOuvertures,
  selectedPieceId,
  onSelectMeta,
  controlsRef,
}: SceneContentProps) {
  const isBatiment = mode3D === "batiment" && allFacades.length > 1;

  // Dimensions principales pour centrage
  const f0 = allFacades[0] ?? activeFacade;
  const f1 = allFacades[1];
  const f2 = allFacades[2];
  const f3 = allFacades[3];

  const widthMain = f0.L;
  const depthMain = f1 ? f1.L : Math.max(3.5, f0.L * 0.65);
  const maxH = Math.max(...allFacades.map((f) => f.Hm), activeFacade.Hm, 3);
  const span = Math.max(widthMain, depthMain, maxH, 5);

  return (
    <>
      {/* Éclairage directionnel solaire & ombres douces portées */}
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[10, 16, 12]}
        intensity={1.75}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00015}
        shadow-camera-left={-span * 1.5}
        shadow-camera-right={span * 1.5}
        shadow-camera-top={span * 1.5}
        shadow-camera-bottom={-span * 1.5}
        shadow-camera-near={0.5}
        shadow-camera-far={45}
      />
      <directionalLight position={[-8, 6, -10]} intensity={0.3} />

      {/* Sol architectural récepteur d'ombres */}
      <mesh position={[0, isBatiment ? -maxH / 2 - 0.05 : -activeFacade.Hm / 2 - 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[span * 4, span * 4]} />
        <meshStandardMaterial color="#0b0f19" roughness={0.95} metalness={0.05} />
      </mesh>

      {/* SCÈNE SELON LE MODE CHOISI */}
      {isBatiment ? (
        // Mode Bâtiment 3D Multi-Façades : assemble 4 façades autour du volume
        <group position={[0, 0, 0]}>
          {/* Façade 1 : Sud / Face Avant */}
          <group position={[-widthMain / 2, -maxH / 2, depthMain / 2]}>
            <SingleFacade3D
              facade={f0}
              eclateRatio={eclateRatio}
              showMur={showMur}
              showIsolant={showIsolant}
              showChevrons={showChevrons}
              showPanneaux={showPanneaux}
              showOuvertures={showOuvertures}
              selectedPieceId={selectedPieceId}
              onSelectMeta={onSelectMeta}
            />
          </group>

          {/* Façade 2 : Est / Face Droite */}
          {f1 && (
            <group position={[widthMain / 2, -maxH / 2, depthMain / 2]} rotation={[0, Math.PI / 2, 0]}>
              <SingleFacade3D
                facade={f1}
                eclateRatio={eclateRatio}
                showMur={showMur}
                showIsolant={showIsolant}
                showChevrons={showChevrons}
                showPanneaux={showPanneaux}
                showOuvertures={showOuvertures}
                selectedPieceId={selectedPieceId}
                onSelectMeta={onSelectMeta}
              />
            </group>
          )}

          {/* Façade 3 : Nord / Face Arrière */}
          {f2 && (
            <group position={[widthMain / 2, -maxH / 2, -depthMain / 2]} rotation={[0, Math.PI, 0]}>
              <SingleFacade3D
                facade={f2}
                eclateRatio={eclateRatio}
                showMur={showMur}
                showIsolant={showIsolant}
                showChevrons={showChevrons}
                showPanneaux={showPanneaux}
                showOuvertures={showOuvertures}
                selectedPieceId={selectedPieceId}
                onSelectMeta={onSelectMeta}
              />
            </group>
          )}

          {/* Façade 4 : Ouest / Face Gauche */}
          {f3 && (
            <group position={[-widthMain / 2, -maxH / 2, -depthMain / 2]} rotation={[0, -Math.PI / 2, 0]}>
              <SingleFacade3D
                facade={f3}
                eclateRatio={eclateRatio}
                showMur={showMur}
                showIsolant={showIsolant}
                showChevrons={showChevrons}
                showPanneaux={showPanneaux}
                showOuvertures={showOuvertures}
                selectedPieceId={selectedPieceId}
                onSelectMeta={onSelectMeta}
              />
            </group>
          )}
        </group>
      ) : (
        // Mode Coupe / Façade active isolée avec éclaté DTU 41.2
        <group position={[-activeFacade.L / 2, -activeFacade.Hm / 2, 0]}>
          <SingleFacade3D
            facade={activeFacade}
            eclateRatio={eclateRatio}
            showMur={showMur}
            showIsolant={showIsolant}
            showChevrons={showChevrons}
            showPanneaux={showPanneaux}
            showOuvertures={showOuvertures}
            selectedPieceId={selectedPieceId}
            onSelectMeta={onSelectMeta}
          />
        </group>
      )}

      {/* Caméra & Contrôles orbitaux */}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={1.2}
        maxDistance={40}
        maxPolarAngle={Math.PI / 2 + 0.05}
      />
    </>
  );
}

// =========================================================================
// COMPOSANT PRINCIPAL : BARDAGE PLAN 3D
// =========================================================================

export const BardagePlan3D: React.FC<{
  activeFacade: Facade3DData;
  allFacades: Facade3DData[];
  zoom?: number;
}> = ({ activeFacade, allFacades, zoom }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Modes et contrôles de la scène
  const [mode3D, setMode3D] = useState<"coupe" | "batiment">("coupe");
  const [eclateRatio, setEclateRatio] = useState<number>(0.55); // 55 % d'éclaté par défaut
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  // Filtres de visibilité des couches DTU 41.2
  const [showMur, setShowMur] = useState(true);
  const [showIsolant, setShowIsolant] = useState(true);
  const [showChevrons, setShowChevrons] = useState(true);
  const [showPanneaux, setShowPanneaux] = useState(true);
  const [showOuvertures, setShowOuvertures] = useState(true);

  // Composant inspecté au clic (HUD)
  const [selectedMeta, setSelectedMeta] = useState<ComponentMeta | null>(null);

  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Animation continue de l'éclaté (Play / Pause)
  useEffect(() => {
    if (!isAnimating) return;
    let forward = true;
    const interval = setInterval(() => {
      setEclateRatio((prev) => {
        let next = forward ? prev + 0.02 : prev - 0.02;
        if (next >= 1) {
          next = 1;
          forward = false;
        } else if (next <= 0) {
          next = 0;
          forward = true;
        }
        return parseFloat(next.toFixed(2));
      });
    }, 40);
    return () => clearInterval(interval);
  }, [isAnimating]);

  // Presets caméra
  const span = Math.max(activeFacade.L, activeFacade.Hm, 4);
  const setCameraPreset = useCallback(
    (preset: "isoG" | "isoD" | "face" | "dessus" | "reset") => {
      if (!controlsRef.current) return;
      const cam = controlsRef.current.object;
      const dist = span * 2.2;
      switch (preset) {
        case "isoG":
          cam.position.set(-span * 1.2, span * 0.8, span * 1.5);
          controlsRef.current.target.set(0, 0, 0);
          break;
        case "isoD":
          cam.position.set(span * 1.2, span * 0.8, span * 1.5);
          controlsRef.current.target.set(0, 0, 0);
          break;
        case "face":
          cam.position.set(0, 0, dist);
          controlsRef.current.target.set(0, 0, 0);
          break;
        case "dessus":
          cam.position.set(0, dist * 1.1, 0.01);
          controlsRef.current.target.set(0, 0, 0);
          break;
        case "reset":
          cam.position.set(span * 0.9, span * 0.7, span * 1.4);
          controlsRef.current.target.set(0, 0, 0);
          setSelectedMeta(null);
          break;
      }
      controlsRef.current.update();
    },
    [span]
  );

  const selectedPieceId = selectedMeta?.piece?.id ?? null;

  return (
    <div className="space-y-2.5">
      {/* BARRE D'OUTILS PRINCIPALE 3D */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
        {/* Toggle Mode Coupe / Bâtiment 3D */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode3D("coupe")}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
              mode3D === "coupe"
                ? "bg-orange-500 text-white shadow-sm shadow-orange-500/20"
                : "bg-slate-900 text-slate-300 border border-slate-700 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Façade ({activeFacade.nom})
          </button>
          {allFacades.length > 1 && (
            <button
              type="button"
              onClick={() => setMode3D("batiment")}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                mode3D === "batiment"
                  ? "bg-orange-500 text-white shadow-sm shadow-orange-500/20"
                  : "bg-slate-900 text-slate-300 border border-slate-700 hover:text-white"
              }`}
            >
              <Box className="w-3.5 h-3.5" /> Bâtiment 3D ({allFacades.length} façades)
            </button>
          )}
        </div>

        {/* CURSEUR ÉCLATÉ DTU 41.2 (0 À 100 %) */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-xl">
          <Sliders className="w-3.5 h-3.5 text-orange-400" />
          <button
            type="button"
            onClick={() => setIsAnimating((v) => !v)}
            className="p-1 rounded text-orange-400 hover:text-orange-300 hover:bg-white/10 transition"
            title={isAnimating ? "Mettre en pause" : "Animer l'éclaté"}
          >
            {isAnimating ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>
          <span className="text-[11px] font-semibold text-slate-200 whitespace-nowrap">
            Éclaté DTU : <strong className="text-orange-400">{Math.round(eclateRatio * 100)} %</strong>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={eclateRatio}
            onChange={(e) => {
              setEclateRatio(parseFloat(e.target.value));
              setIsAnimating(false);
            }}
            className="w-20 sm:w-28 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
            title="Curseur d'éclatement des 5 couches DTU 41.2"
          />
        </div>

        {/* PRESETS CAMÉRA */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCameraPreset("isoG")}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
          >
            Iso G
          </button>
          <button
            type="button"
            onClick={() => setCameraPreset("isoD")}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
          >
            Iso D
          </button>
          <button
            type="button"
            onClick={() => setCameraPreset("face")}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
          >
            Face
          </button>
          <button
            type="button"
            onClick={() => setCameraPreset("dessus")}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
          >
            Dessus
          </button>
          <button
            type="button"
            onClick={() => setCameraPreset("reset")}
            className="p-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white"
            title="Réinitialiser la caméra"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* FILTRES DE VISIBILITÉ DES 5 COUCHES DTU 41.2 */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] px-1">
        <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
          <Eye className="w-3 h-3 text-orange-400" /> Couches DTU :
        </span>
        {[
          { label: "Mur support (L1)", state: showMur, set: setShowMur, dot: "#94A3B8" },
          { label: "Isolant ITE (L2)", state: showIsolant, set: setShowIsolant, dot: "#F59E0B" },
          { label: "Chevrons (L3)", state: showChevrons, set: setShowChevrons, dot: "#D7BA8D" },
          { label: "Panneaux (L4)", state: showPanneaux, set: setShowPanneaux, dot: "#F97316" },
          { label: "Encadrements (L5)", state: showOuvertures, set: setShowOuvertures, dot: "#0284C7" },
        ].map((layer) => (
          <label
            key={layer.label}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-950 border border-slate-800 cursor-pointer select-none hover:border-slate-700 transition"
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

      {/* CONTENEUR DU RENDU 3D THREE.JS PBR */}
      <div className="relative w-full h-[520px] rounded-2xl overflow-hidden border border-slate-800 bg-gradient-to-b from-[#0a0d14] via-[#0f1422] to-[#0a0c13] shadow-2xl">
        {mounted ? (
          <Canvas
            camera={{ position: [span * 0.9, span * 0.7, span * 1.4], fov: 42 }}
            shadows
            className="w-full h-full cursor-grab active:cursor-grabbing block"
          >
            <SceneContent
              activeFacade={activeFacade}
              allFacades={allFacades}
              mode3D={mode3D}
              eclateRatio={eclateRatio}
              showMur={showMur}
              showIsolant={showIsolant}
              showChevrons={showChevrons}
              showPanneaux={showPanneaux}
              showOuvertures={showOuvertures}
              selectedPieceId={selectedPieceId}
              onSelectMeta={setSelectedMeta}
              controlsRef={controlsRef}
            />
          </Canvas>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
            Chargement de la maquette 3D PBR...
          </div>
        )}

        {/* BADGE FAMILLE & MODE */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-xl border border-white/10 text-xs text-white">
          <Sparkles className="w-3.5 h-3.5 text-orange-400" />
          <span className="font-semibold">
            {facadeNomFamille(activeFacade.famille)}
          </span>
          <span className="text-slate-400">· Joints creux 8 mm</span>
        </div>

        {/* FICHE D'INSPECTION DÉTAILLÉE AU CLIC (HUD) */}
        {selectedMeta && (
          <div className="absolute bottom-3 right-3 z-20 w-84 max-w-[92%] rounded-2xl border border-orange-500/40 bg-[#0c1017]/95 p-3.5 text-xs text-white shadow-2xl backdrop-blur-md animate-in fade-in duration-150">
            <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2">
              <div>
                <span className="inline-block rounded bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-300">
                  {selectedMeta.kind}
                </span>
                <h4 className="mt-1 font-bold text-white text-[13px]">{selectedMeta.title}</h4>
                <p className="text-[11px] text-gray-400">{selectedMeta.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMeta(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white transition"
                aria-label="Fermer la fiche d'inspection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-2.5 space-y-1.5">
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

      {/* PIED DE VISUALISATION : CONSEILS D'INTERACTION */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
        <span>
          Glisse pour pivoter à 360° · Molette/Pincement pour zoomer · Clic sur un panneau ou encadrement pour inspecter
        </span>
        <span className="font-medium text-slate-300">
          {mode3D === "coupe" ? "Vue éclatée DTU 41.2" : "Bâtiment 3D complet"}
        </span>
      </div>
    </div>
  );
};

function facadeNomFamille(famille: FamillePose): string {
  switch (famille) {
    case "hpl":
      return "Stratifié HPL mat/satiné";
    case "bois_naturel":
      return "Bois massif veiné";
    case "composite":
      return "Lames composites rainurées";
    case "cassette":
      return "Cassettes aluminium laqué";
    default:
      return "Bardage ventilé";
  }
}
