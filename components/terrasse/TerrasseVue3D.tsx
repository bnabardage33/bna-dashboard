"use client";

import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
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
  resoudreConfigTerrasseMobile,
  calculerSousEnsembleTerrasseMobile,
} from "@/lib/terrasse/pro/terrasse-mobile";
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
  Play,
  Pause,
  MoveHorizontal,
  Sliders,
  ShieldCheck,
  Loader2,
} from "lucide-react";

interface TerrasseVue3DProps {
  config: ChantierTerrasseConfig;
  resultat: ResultatCalculTerrasse;
  reservations?: ChantierTerrasseReservation[];
}

interface ComponentMeta {
  kind: "LAME" | "LAMBOURDE" | "PLOT" | "RESERVATION" | "RAIL_MOBILE" | "CHASSIS_MOBILE" | "MOTEUR_MOBILE";
  title: string;
  subtitle: string;
  details: Array<[string, string]>;
}

// Couleurs par essence
function getWoodColor(essence: ChantierTerrasseConfig["essence_bois"]): string {
  switch (essence) {
    case "ipe":
    case "cumaru":
      return "#7c3f1d";
    case "composite":
      return "#475569";
    case "douglas":
    case "meleze":
      return "#b45309";
    case "bambou_thermo":
      return "#5c3317";
    default:
      return "#a16207";
  }
}

/**
 * Générateur procédural de textures PBR pour platelage bois / composite rainuré
 * Évite tout chargement réseau ou image externe, 100 % autonome et performant.
 */
function createDeckWoodTextures(essence: ChantierTerrasseConfig["essence_bois"]) {
  if (typeof document === "undefined") return { map: null, bumpMap: null };

  const width = 512;
  const height = 512;

  // 1. Texture Albedo / Diffuse (Map)
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = width;
  colorCanvas.height = height;
  const ctx = colorCanvas.getContext("2d");
  if (!ctx) return { map: null, bumpMap: null };

  let baseColor = "#a16207";
  let grooveColor = "#78350f";
  let grainColor = "#854d0e";

  switch (essence) {
    case "ipe":
    case "cumaru":
      baseColor = "#7c3f1d";
      grooveColor = "#451a03";
      grainColor = "#5c2a12";
      break;
    case "composite":
      baseColor = "#475569";
      grooveColor = "#1e293b";
      grainColor = "#334155";
      break;
    case "douglas":
    case "meleze":
      baseColor = "#b45309";
      grooveColor = "#78350f";
      grainColor = "#92400e";
      break;
    case "bambou_thermo":
      baseColor = "#5c3317";
      grooveColor = "#2d1606";
      grainColor = "#42210b";
      break;
  }

  // Fond bois/composite
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, width, height);

  // Veinage bois fin
  ctx.strokeStyle = grainColor;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 180; i++) {
    const y = Math.random() * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      width * 0.33,
      y + (Math.random() - 0.5) * 6,
      width * 0.66,
      y + (Math.random() - 0.5) * 6,
      width,
      y
    );
    ctx.stroke();
  }

  // Rainures longitudinales antidérapantes (profil DTU 51.4 / composite)
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = grooveColor;
  ctx.lineWidth = 2.5;
  const grooveSpacing = essence === "composite" ? 16 : 24;
  for (let y = 0; y < height; y += grooveSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1.0;

  // 2. Texture de relief (Bump Map)
  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bCtx = bumpCanvas.getContext("2d");
  if (!bCtx) return { map: null, bumpMap: null };

  // Surface supérieure claire
  bCtx.fillStyle = "#d4d4d8";
  bCtx.fillRect(0, 0, width, height);

  // Micro-rugosité
  const imgData = bCtx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 16;
    const v = Math.min(255, Math.max(0, 212 + noise));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  bCtx.putImageData(imgData, 0, 0);

  // Creux sombres des rainures
  bCtx.strokeStyle = "#18181b";
  bCtx.lineWidth = 3;
  for (let y = 0; y < height; y += grooveSpacing) {
    bCtx.beginPath();
    bCtx.moveTo(0, y);
    bCtx.lineTo(width, y);
    bCtx.stroke();
  }

  const mapTexture = new THREE.CanvasTexture(colorCanvas);
  mapTexture.wrapS = THREE.RepeatWrapping;
  mapTexture.wrapT = THREE.RepeatWrapping;

  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.wrapS = THREE.RepeatWrapping;
  bumpTexture.wrapT = THREE.RepeatWrapping;

  return { map: mapTexture, bumpMap: bumpTexture };
}

// =========================================================================
// SCÈNE THREE.JS INTERNE
// =========================================================================
interface SceneThreeProps {
  config: ChantierTerrasseConfig;
  resultat: ResultatCalculTerrasse;
  reservations: ChantierTerrasseReservation[];
  eclate: boolean;
  highlightOffcuts: boolean;
  showSol: boolean;
  showPlots: boolean;
  showLambourdes: boolean;
  showLames: boolean;
  showRailsMobile: boolean;
  openingRatio: number;
  onSelectMeta: (meta: ComponentMeta | null) => void;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}

function SceneContent({
  config,
  resultat,
  reservations,
  eclate,
  highlightOffcuts,
  showSol,
  showPlots,
  showLambourdes,
  showLames,
  showRailsMobile,
  openingRatio,
  onSelectMeta,
  controlsRef,
}: SceneThreeProps) {
  const L = Math.max(1, config.longueur_m || 6.0);
  const W = Math.max(1, config.largeur_m || 4.0);
  const cx = L / 2;
  const cy = W / 2;

  // Décalage vertical en mode éclaté DTU 51.4 (m)
  const gapY = eclate ? 0.35 : 0;

  // Hauteurs / Altitudes réelles
  const ySol = 0;
  const plotH = Math.max(0.04, Math.min(0.3, (config.hauteur_sol_cm || 15) / 100));
  const yPlot = ySol + 0.02 + gapY * 0.7;

  const lambH = Math.max(0.045, (config.section_hauteur_mm || 70) / 1000);
  const yLamb = yPlot + plotH + gapY * 1.1;

  const lameH = Math.max(0.021, (config.epaisseur_lame_mm || 21) / 1000);
  const yLame = yLamb + lambH + gapY * 1.4;

  const proGeo = resultat.terrassePro?.geometry;

  // 1. InstancedMesh pour les lames fixes (séparées en standard et chutes)
  const { standardBlades, offcutBlades } = useMemo(() => {
    const std: Array<{ blade: PlacedBladeSegment; meta: ComponentMeta }> = [];
    const off: Array<{ blade: PlacedBladeSegment; meta: ComponentMeta }> = [];

    const blades = proGeo?.blades ?? [];
    for (let i = 0; i < blades.length; i++) {
      const b = blades[i];
      const meta: ComponentMeta = {
        kind: "LAME",
        title: `Lame Rangée #${b.rowIndex + 1} · Segment #${b.segmentIndexInRow + 1}`,
        subtitle: `Longueur nette : ${b.lengthNetMm} mm · Largeur : ${b.widthNetMm} mm`,
        details: [
          [
            "Origine de coupe",
            b.isFromOffcutReuse
              ? `♻️ Chute réemployée (issue de ${b.sourceCommercialBarId})`
              : `Barre neuve (${b.sourceCommercialBarId})`,
          ],
          ["Appuis lambourdes", `${b.supportJoistIds.length} appuis (${b.spanCount} travées)`],
          ["Jonctions gauche / droite", `${b.leftJointType} → ${b.rightJointType}`],
          ["Porte-à-faux d'extrémité", `${b.leftOverhangMm} mm / ${b.rightOverhangMm} mm`],
        ],
      };

      if (b.isFromOffcutReuse) {
        off.push({ blade: b, meta });
      } else {
        std.push({ blade: b, meta });
      }
    }
    return { standardBlades: std, offcutBlades: off };
  }, [proGeo?.blades]);

  // Références d'InstancedMesh pour les lames fixes
  const stdBladesMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const offBladesMeshRef = useRef<THREE.InstancedMesh | null>(null);

  useEffect(() => {
    if (!stdBladesMeshRef.current || standardBlades.length === 0) return;
    const dummy = new THREE.Object3D();
    const mesh = stdBladesMeshRef.current;

    standardBlades.forEach(({ blade: b }, idx) => {
      const p0 = b.polygonMm[0];
      const p2 = b.polygonMm[2];
      const minX = (p0?.xMm ?? 0) / 1000;
      const maxX = (p2?.xMm ?? (b.lengthNetMm || 1000)) / 1000;
      const minY = (p0?.yMm ?? 0) / 1000;
      const maxY = (p2?.yMm ?? (b.widthNetMm || 145)) / 1000;

      const segLenX = Math.max(0.05, Math.abs(maxX - minX));
      const segWidthZ = Math.max(0.04, Math.abs(maxY - minY));

      const posX = (minX + maxX) / 2 - cx;
      const posZ = (minY + maxY) / 2 - cy;
      const posY = yLame + lameH / 2;

      dummy.position.set(posX, posY, posZ);
      dummy.scale.set(segLenX, lameH, segWidthZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [standardBlades, yLame, lameH, cx, cy]);

  useEffect(() => {
    if (!offBladesMeshRef.current || offcutBlades.length === 0) return;
    const dummy = new THREE.Object3D();
    const mesh = offBladesMeshRef.current;

    offcutBlades.forEach(({ blade: b }, idx) => {
      const p0 = b.polygonMm[0];
      const p2 = b.polygonMm[2];
      const minX = (p0?.xMm ?? 0) / 1000;
      const maxX = (p2?.xMm ?? (b.lengthNetMm || 1000)) / 1000;
      const minY = (p0?.yMm ?? 0) / 1000;
      const maxY = (p2?.yMm ?? (b.widthNetMm || 145)) / 1000;

      const segLenX = Math.max(0.05, Math.abs(maxX - minX));
      const segWidthZ = Math.max(0.04, Math.abs(maxY - minY));

      const posX = (minX + maxX) / 2 - cx;
      const posZ = (minY + maxY) / 2 - cy;
      const posY = yLame + lameH / 2;

      dummy.position.set(posX, posY, posZ);
      dummy.scale.set(segLenX, lameH, segWidthZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [offcutBlades, yLame, lameH, cx, cy]);

  // 2. InstancedMesh pour les Plots / Cales
  const plotsData = useMemo(() => {
    const supports = proGeo?.supports ?? [];
    return supports.map((s) => ({
      sup: s,
      meta: {
        kind: "PLOT" as const,
        title:
          s.type === "PLOT_CHEVETRE"
            ? `Plot de renfort chevêtre (${s.id})`
            : s.type === "CALE_SUR_DALLE"
            ? `Cale d'isolation sur dalle (${s.id})`
            : `Plot réglable polymère (${s.id})`,
        subtitle: `Coord: X ${(s.centerMm.xMm / 1000).toFixed(2)}m · Y ${(s.centerMm.yMm / 1000).toFixed(2)}m`,
        details: [
          ["Type d'appui", s.type],
          ["Hauteur sous lame", `${s.heightMm} mm (max DTU : 300 mm)`],
          ["Capacité F_Rk", `≥ ${s.requiredCapacityFrkKn} kN`],
          ["Jonction aboutage", s.isJoistSpliceCentered ? "Centrée sur plot" : "Courante"],
        ] as Array<[string, string]>,
      },
    }));
  }, [proGeo?.supports]);

  const plotsMeshRef = useRef<THREE.InstancedMesh | null>(null);

  useEffect(() => {
    if (!plotsMeshRef.current || plotsData.length === 0) return;
    const dummy = new THREE.Object3D();
    const mesh = plotsMeshRef.current;

    plotsData.forEach(({ sup }, idx) => {
      const posX = sup.centerMm.xMm / 1000 - cx;
      const posZ = sup.centerMm.yMm / 1000 - cy;
      const radius = sup.type === "CALE_SUR_DALLE" ? 0.05 : 0.085;
      const h = Math.max(0.04, sup.heightMm / 1000);
      const posY = yPlot + h / 2;

      dummy.position.set(posX, posY, posZ);
      dummy.scale.set(radius * 2, h, radius * 2);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [plotsData, yPlot, cx, cy]);

  // 3. Calcul de la terrasse mobile et de ses panneaux
  const poolRes = reservations.find((r) => r.type_reservation === "piscine");
  const mobileConfig = useMemo(
    () => resoudreConfigTerrasseMobile(config, poolRes),
    [config, poolRes]
  );

  const mobileResult = useMemo(() => {
    if (!poolRes || !mobileConfig) return null;
    return calculerSousEnsembleTerrasseMobile({
      config,
      poolReservation: poolRes,
      mobileConfig,
    });
  }, [config, poolRes, mobileConfig]);

  const woodColor = getWoodColor(config.essence_bois);
  const offcutColor = highlightOffcuts ? "#059669" : woodColor;

  // Textures PBR procédurales pour le platelage bois/composite
  const deckTextures = useMemo(() => {
    return createDeckWoodTextures(config.essence_bois);
  }, [config.essence_bois]);

  // Niveau supérieur de la plage fixe (altitude référence pour rails discrets et jupe d'applique)
  const yDeckTop = yLame + lameH;

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[7, 13, 9]}
        intensity={1.65}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00015}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={0.5}
        shadow-camera-far={35}
      />
      <directionalLight position={[-7, 10, -7]} intensity={0.45} />

      {/* 1. COUCHE SOL / DALLE BÉTON (Layer 1) */}
      {showSol && (
        <mesh position={[0, -0.04, 0]} receiveShadow>
          <boxGeometry args={[L + 0.3, 0.08, W + 0.3]} />
          <meshStandardMaterial
            color={config.type_sol === "dalle_beton" ? "#1e293b" : "#292524"}
            roughness={0.85}
          />
        </mesh>
      )}

      {/* 2. COUCHE PLOTS RÉGLABLES (Layer 2) */}
      {showPlots && plotsData.length > 0 && (
        <instancedMesh
          ref={plotsMeshRef}
          args={[undefined, undefined, plotsData.length]}
          castShadow
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            if (e.instanceId !== undefined && plotsData[e.instanceId]) {
              onSelectMeta(plotsData[e.instanceId].meta);
            }
          }}
        >
          <cylinderGeometry args={[0.5, 0.5, 1, 16]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.4} metalness={0.1} />
        </instancedMesh>
      )}

      {/* 3. COUCHE STRUCTURE LAMBOURDES, DOUBLES & CHEVÊTRES (Layer 3) */}
      {showLambourdes && proGeo?.joists && (
        <group>
          {proGeo.joists.map((j) => {
            const x0 = j.startMm.xMm / 1000 - cx;
            const z0 = j.startMm.yMm / 1000 - cy;
            const x1 = j.endMm.xMm / 1000 - cx;
            const z1 = j.endMm.yMm / 1000 - cy;

            const dx = x1 - x0;
            const dz = z1 - z0;
            const len = Math.max(0.04, Math.hypot(dx, dz));
            const angle = Math.atan2(dz, dx);
            const posX = (x0 + x1) / 2;
            const posZ = (z0 + z1) / 2;
            const isSecondary = j.layer === "SECONDARY_BOTTOM_CROSS";
            const posY = isSecondary ? yLamb - lambH * 1.1 : yLamb + lambH / 2;

            const isChevetre = j.role === "CHEVETRE";
            const isDouble =
              j.role === "DOUBLE_ABOUTAGE_GAUCHE" || j.role === "DOUBLE_ABOUTAGE_DROITE";
            const joistColor = isChevetre
              ? "#38bdf8"
              : isDouble
              ? "#fb923c"
              : config.type_lambourde === "alu_structure"
              ? "#94a3b8"
              : "#d97706";

            const meta: ComponentMeta = {
              kind: "LAMBOURDE",
              title: isChevetre
                ? `Chevêtre de renfort (${j.id})`
                : isDouble
                ? `Lambourde jumelée d'aboutage (${j.id})`
                : `Lambourde porteuse (${j.id})`,
              subtitle: `Longueur nette : ${j.lengthNetMm} mm · Section : ${j.widthMm}×${j.heightMm} mm`,
              details: [
                ["Rôle structurel", j.role],
                ["Couche", j.layer],
                ["Nombre de plots d'appui", `${j.supportIds.length} plots`],
                ["Portée max admissible", `${j.maxSpanBetweenSupportsMm} mm (max DTU : 700 mm)`],
              ],
            };

            return (
              <mesh
                key={j.id}
                position={[posX, posY, posZ]}
                rotation={[0, -angle, 0]}
                castShadow
                receiveShadow
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMeta(meta);
                }}
              >
                <boxGeometry args={[len, lambH, j.widthMm / 1000]} />
                <meshStandardMaterial
                  color={joistColor}
                  roughness={0.6}
                  metalness={config.type_lambourde === "alu_structure" ? 0.6 : 0.05}
                />
              </mesh>
            );
          })}
        </group>
      )}

      {/* 4. COUCHE PLATELAGE FIXE — LAMES INSTANCED MESH AVEC TEXTURE PBR (Layer 4) */}
      {showLames && (
        <group>
          {standardBlades.length > 0 && (
            <instancedMesh
              ref={stdBladesMeshRef}
              args={[undefined, undefined, standardBlades.length]}
              castShadow
              receiveShadow
              onClick={(e) => {
                e.stopPropagation();
                if (e.instanceId !== undefined && standardBlades[e.instanceId]) {
                  onSelectMeta(standardBlades[e.instanceId].meta);
                }
              }}
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial
                color={woodColor}
                roughness={0.52}
                metalness={0.04}
                map={deckTextures.map ?? undefined}
                bumpMap={deckTextures.bumpMap ?? undefined}
                bumpScale={0.03}
              />
            </instancedMesh>
          )}

          {offcutBlades.length > 0 && (
            <instancedMesh
              ref={offBladesMeshRef}
              args={[undefined, undefined, offcutBlades.length]}
              castShadow
              receiveShadow
              onClick={(e) => {
                e.stopPropagation();
                if (e.instanceId !== undefined && offcutBlades[e.instanceId]) {
                  onSelectMeta(offcutBlades[e.instanceId].meta);
                }
              }}
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial
                color={offcutColor}
                roughness={0.5}
                metalness={0.04}
                map={deckTextures.map ?? undefined}
                bumpMap={deckTextures.bumpMap ?? undefined}
                bumpScale={0.03}
              />
            </instancedMesh>
          )}
        </group>
      )}

      {/* 5. COUCHE RÉSERVATIONS & BASSIN PISCINE AVEC EAU BLEU-TURQUOISE PBR (Layer 5) */}
      {reservations.map((res, idx) => {
        const rx = (res.x || 0) - cx;
        const rz = (res.y || 0) - cy;
        const rw = res.diametre ? res.diametre : res.largeur || 0.6;
        const rh = res.diametre ? res.diametre : res.longueur || 0.6;
        const isPool = res.type_reservation === "piscine";
        const isTree = res.type_reservation === "arbre";

        const meta: ComponentMeta = {
          kind: "RESERVATION",
          title: `Réservation : ${res.nom}`,
          subtitle: `Type : ${res.type_reservation.toUpperCase()}`,
          details: [
            ["Position (X, Y)", `${(res.x || 0).toFixed(2)}m, ${(res.y || 0).toFixed(2)}m`],
            ["Dimensions", `${rw.toFixed(2)}m × ${rh.toFixed(2)}m`],
            ["Renfort DTU 51.4", "Chevêtres d'encadrement générés"],
          ],
        };

        if (isPool) {
          const poolDepth = 0.75;
          const copingBorder = 0.12;

          return (
            <group key={idx} position={[rx + rw / 2, 0, rz + rh / 2]}>
              {/* Margelle de piscine en pierre claire à fleur du platelage */}
              <mesh position={[0, yLame + lameH / 2, 0]} receiveShadow>
                <boxGeometry args={[rw + copingBorder * 2, lameH, rh + copingBorder * 2]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.65} metalness={0.05} />
              </mesh>

              {/* Eau de piscine bleu-turquoise semi-transparente */}
              <mesh
                position={[0, yLame - 0.02, 0]}
                receiveShadow
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMeta(meta);
                }}
              >
                <boxGeometry args={[rw, 0.04, rh]} />
                <meshStandardMaterial
                  color="#06b6d4"
                  transparent
                  opacity={0.78}
                  roughness={0.04}
                  metalness={0.14}
                  depthWrite={false}
                />
              </mesh>

              {/* Cuvelage / parois et fond de bassin bleu lagon avec ombres portées */}
              <mesh position={[0, yLame - poolDepth / 2, 0]} receiveShadow>
                <boxGeometry args={[rw + 0.02, poolDepth, rh + 0.02]} />
                <meshStandardMaterial color="#0284c7" roughness={0.35} metalness={0.08} />
              </mesh>
            </group>
          );
        }

        if (isTree) {
          return (
            <mesh
              key={idx}
              position={[rx, ySol + 0.4, rz]}
              castShadow
              receiveShadow
              onClick={(e) => {
                e.stopPropagation();
                onSelectMeta(meta);
              }}
            >
              <cylinderGeometry args={[rw / 2, rw / 2, 0.8, 16]} />
              <meshStandardMaterial color="#15803d" roughness={0.7} />
            </mesh>
          );
        }

        return (
          <mesh
            key={idx}
            position={[rx + rw / 2, ySol + 0.05, rz + rh / 2]}
            receiveShadow
            onClick={(e) => {
              e.stopPropagation();
              onSelectMeta(meta);
            }}
          >
            <boxGeometry args={[rw, 0.1, rh]} />
            <meshStandardMaterial color="#334155" roughness={0.5} />
          </mesh>
        );
      })}

      {/* 6. COUCHE LAYER 6 : RAILS PLATS DISCRETS ET CAISSON MOBILE FERMÉ AVEC JUPE PÉRIPHÉRIQUE */}
      {showRailsMobile && mobileResult && (
        <group>
          {/* Rails discrets : profilés plats extra-plats (28×5 mm) en inox brossé posés à fleur sur la plage fixe */}
          {mobileResult.mobileStructure.rails.map((rail, rIdx) => {
            const rx0 = rail.startMm.xMm / 1000 - cx;
            const rz0 = rail.startMm.yMm / 1000 - cy;
            const rx1 = rail.endMm.xMm / 1000 - cx;
            const rz1 = rail.endMm.yMm / 1000 - cy;
            const rLen = Math.hypot(rx1 - rx0, rz1 - rz0);
            const rAngle = Math.atan2(rz1 - rz0, rx1 - rx0);

            const railThickness = 0.005; // 5 mm extra-plat
            const railWidth = 0.028; // 28 mm discret
            const railY = yDeckTop + railThickness / 2;

            const mot = mobileResult.resultatPlateau.motorisation;
            const hasMotorisation = Boolean(mot?.active && mot.typeMotorisation !== "aucune");
            const isGuideRail = rIdx === 0; // Le premier rail sert de rail d'entraînement et de guidage motorisé
            const isDeuxPlateaux = mobileResult.resultatPlateau.mode === "2_demi_plateaux";

            const metaRail: ComponentMeta = {
              kind: "RAIL_MOBILE",
              title: `Rail plat discret Inox brossé 316L (${rail.id})`,
              subtitle: `Longueur : ${(rail.lengthMm / 1000).toFixed(2)} m · Profilé plat extra-plat (28×5 mm)`,
              details: [
                ["Matériau", "Inox A4 Marine (AISI 316L) brossé grain 220 anti-corrosion"],
                ["Profilé", "Rail plat biseauté anti-trébuchement conforme pieds nus"],
                ["Pose", "Posé à fleur sur la plage fixe dans le sens du coulissement"],
                ["Linéaire total rails", `${mobileResult.resultatPlateau.rails.lineaireTotalM} m`],
                ["Zone de refoulement", `${mobileResult.resultatPlateau.rails.zoneRefoulementM} m`],
              ],
            };

            const metaCremaillere: ComponentMeta = {
              kind: "MOTEUR_MOBILE",
              title: `Crémaillère M4 Acier/Nylon (${mot?.lineaireCremaillereM ?? 0} m)`,
              subtitle: `Module 4 silencieux · ${mot?.barresCremaillereCount ?? 0} barres de 1 m synchronisées`,
              details: [
                ["Matériau", "Nylon armé cœur acier zingué / Inox A4"],
                ["Module", "Module 4 avec pattes de fixation réglables en hauteur"],
                ["Linéaire total", `${mot?.lineaireCremaillereM ?? 0} m (Course utile + 0,50 m de sécurité)`],
                ["Sécurité NF P90-308", "Engrenage sous carter protecteur anti-pincement"],
              ],
            };

            const metaMoteur: ComponentMeta = {
              kind: "MOTEUR_MOBILE",
              title: `Motoréducteur 24V DC (${mot?.puissanceMoteurUnitaireN ?? 0} N)`,
              subtitle: `${mot?.typeMotorisation === "solaire" ? "Kit Solaire Autonome 24V" : "Alimentation Filaire TBTS 24V"} · NF P90-308`,
              details: [
                ["Puissance unitaire", `${mot?.puissanceMoteurUnitaireN ?? 0} N (Couple de démarrage renforcé)`],
                ["Puissance totale", `${mot?.puissanceTractionTotaleN ?? 0} N (${mot?.nbMoteurs ?? 1} moteur(s))`],
                [
                  "Alimentation",
                  mot?.typeMotorisation === "solaire"
                    ? "24V DC (2× batteries 12V 14Ah AGM + Régulateur MPPT)"
                    : "230V AC → 24V DC TBTS (Transformateur IP65)",
                ],
                ["Sécurité anti-pincement", "Détection ampérométrique d'obstacle conforme NF P90-308"],
                ["Débrayage manuel", "Clé de secours ergonomique quart de tour"],
                ["Fins de course", `${mot?.finsDeCourse?.nbCapteurs ?? 2} capteurs magnétiques étanches IP68`],
                ["Télécommande", `${mot?.telecommande?.nbTelecommandes ?? 2} émetteurs rolling-code 868 MHz`],
              ],
            };

            const metaSolaire: ComponentMeta = {
              kind: "MOTEUR_MOBILE",
              title: "Panneau Solaire Photovoltaïque Déporté 30 Wc",
              subtitle: "Recharge solaire autonome 24V DC · Sans tranchée ni raccordement réseau",
              details: [
                ["Puissance crête", "30 Wc cellules monocristallines haute performance"],
                ["Support", "Pied inox 316L avec rotule orientable inclinée à 35°"],
                ["Régulateur", "Régulateur de charge solaire intelligent MPPT 24V intégré"],
                ["Batteries", "2× 12V 14Ah AGM étanches sans entretien en série"],
                ["Autonomie", "Jusqu'à 30 cycles complets d'ouverture sans ensoleillement"],
                ["Protection", "Boîtier étanche résistant aux UV et à l'ambiance piscine IP65"],
              ],
            };

            // Positions des moteurs le long du rail de guidage
            const motorOffsets = isDeuxPlateaux
              ? [rLen / 2 - 0.12, -rLen / 2 + 0.12]
              : [rLen / 2 - 0.12];

            return (
              <group
                key={rail.id}
                position={[(rx0 + rx1) / 2, railY, (rz0 + rz1) / 2]}
                rotation={[0, -rAngle, 0]}
              >
                {/* Profilé plat inox du rail */}
                <mesh
                  castShadow
                  receiveShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMeta(metaRail);
                  }}
                >
                  <boxGeometry args={[rLen, railThickness, railWidth]} />
                  <meshStandardMaterial
                    color="#d1d5db"
                    metalness={0.96}
                    roughness={0.22}
                  />
                </mesh>

                {/* MODÉLISATION MOTORISATION : CRÉMAILLÈRE, BLOC MOTEUR & PANNEAU SOLAIRE */}
                {hasMotorisation && isGuideRail && mot && (
                  <group>
                    {/* 1. Crémaillère continue longeant le rail inox */}
                    <mesh
                      position={[0, (0.015 - railThickness) / 2, railWidth / 2 + 0.012]}
                      castShadow
                      receiveShadow
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMeta(metaCremaillere);
                      }}
                    >
                      <boxGeometry args={[rLen, 0.015, 0.012]} />
                      <meshStandardMaterial
                        color="#1e293b"
                        metalness={0.7}
                        roughness={0.32}
                      />
                    </mesh>

                    {/* 2. Bloc(s) moteur(s) compact(s) en bout de rail */}
                    {motorOffsets.map((mX, mIdx) => (
                      <group
                        key={`motor-${mIdx}`}
                        position={[mX, (0.14 - railThickness) / 2, railWidth / 2 + 0.045]}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMeta(metaMoteur);
                        }}
                      >
                        {/* Carter moteur compact IP65 anthracite */}
                        <mesh castShadow receiveShadow>
                          <boxGeometry args={[0.18, 0.14, 0.14]} />
                          <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.25} />
                        </mesh>
                        {/* Capot de déverrouillage manuel de secours */}
                        <mesh position={[0, 0.072, 0]} castShadow>
                          <cylinderGeometry args={[0.022, 0.022, 0.008, 16]} />
                          <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.3} />
                        </mesh>
                        {/* Pignon denté d'entraînement sur la crémaillère */}
                        <mesh position={[0, -0.05, -0.035]} rotation={[0, 0, Math.PI / 2]} castShadow>
                          <cylinderGeometry args={[0.024, 0.024, 0.018, 16]} />
                          <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.2} />
                        </mesh>
                        {/* Témoin LED de sécurité NF P90-308 */}
                        <mesh position={[0.07, 0.04, 0.071]}>
                          <sphereGeometry args={[0.005, 8, 8]} />
                          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2} />
                        </mesh>
                      </group>
                    ))}

                    {/* 3. Panneau solaire photovoltaïque déporté si motorisation solaire */}
                    {mot.typeMotorisation === "solaire" && (
                      <group
                        position={[rLen / 2 - 0.12, (0.01 - railThickness) / 2, railWidth / 2 + 0.3]}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMeta(metaSolaire);
                        }}
                      >
                        {/* Embase de fixation inox */}
                        <mesh position={[0, 0.004, 0]} castShadow receiveShadow>
                          <cylinderGeometry args={[0.045, 0.045, 0.008, 16]} />
                          <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
                        </mesh>
                        {/* Mât inox 316L */}
                        <mesh position={[0, 0.14, 0]} castShadow>
                          <cylinderGeometry args={[0.009, 0.009, 0.28, 12]} />
                          <meshStandardMaterial color="#cbd5e1" metalness={0.92} roughness={0.18} />
                        </mesh>
                        {/* Panneau PV incliné à 35° face au soleil */}
                        <group position={[0, 0.28, 0]} rotation={[0.55, 0, 0]}>
                          {/* Cadre alu */}
                          <mesh castShadow receiveShadow>
                            <boxGeometry args={[0.26, 0.012, 0.34]} />
                            <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.25} />
                          </mesh>
                          {/* Surface des cellules photovoltaïques */}
                          <mesh position={[0, 0.007, 0]}>
                            <boxGeometry args={[0.24, 0.002, 0.32]} />
                            <meshStandardMaterial color="#0a192f" roughness={0.15} metalness={0.8} />
                          </mesh>
                        </group>
                      </group>
                    )}
                  </group>
                )}
              </group>
            );
          })}

          {/* Panneaux Mobiles : Caisson fermé avec Jupe périphérique complète (pose en applique) */}
          {mobileResult.mobileStructure.panels.map((panel, pIdx) => {
            // Translation dynamique T(t) le long des rails
            const travelM = (panel.travelDistanceMm / 1000) * openingRatio;
            const transX = travelM * panel.directionVector.x;
            const transZ = travelM * panel.directionVector.y;

            const pW = panel.widthMm / 1000;
            const pL = panel.lengthMm / 1000;
            const initPosX = panel.xMm / 1000 - cx;
            const initPosZ = panel.yMm / 1000 - cy;
            const currentPosX = initPosX + transX;
            const currentPosZ = initPosZ + transZ;

            // Altitudes réelles du caisson mobile au-dessus de la plage fixe
            const chassisH = mobileResult.resultatPlateau.hauteurChassisMm / 1000;
            const yChassisBottom = yDeckTop + 0.005 + 0.012; // 12 mm au-dessus du rail
            const panelChassisY = yChassisBottom + chassisH / 2;
            const yChassisTop = yChassisBottom + chassisH;
            const mobileLameY = yChassisTop + lameH / 2;
            const yMobileDeckTop = yChassisTop + lameH;

            // Jupe périphérique verticale (pose en applique sur les 4 côtés)
            // S'étend du sommet des lames jusqu'à 8 mm au-dessus de la plage fixe
            const ySkirtBottom = yDeckTop + 0.008;
            const jupeH = yMobileDeckTop - ySkirtBottom;
            const jupeCenterY = (yMobileDeckTop + ySkirtBottom) / 2;
            const epJupe = lameH; // Épaisseur de la lame de rive (ex: 21 mm)

            const metaChassis: ComponentMeta = {
              kind: "CHASSIS_MOBILE",
              title: `Plateau Mobile (${panel.nom})`,
              subtitle: `Course : ${(panel.travelDistanceMm / 1000).toFixed(2)} m · Caisson fermé monobloc`,
              details: [
                ["Dimensions plateau", `${pW.toFixed(2)} m × ${pL.toFixed(2)} m`],
                ["Châssis porteur", `Aluminium ${mobileResult.resultatPlateau.structureChassis.sectionAluMm} mm (${Math.round(chassisH * 1000)} mm)`],
                ["Habillage périphérique", `Jupe 4 faces en applique (${Math.round(jupeH * 1000)} mm)`],
                ["Galets de roulement", `${panel.wheels.length} galets inox A4 masqués`],
                ["Charge admissible", `${mobileResult.resultatPlateau.dimensionsPlateau.poidsTotalChargeKg} kg`],
                ["Position actuelle", `${Math.round(openingRatio * 100)} % d'ouverture`],
              ],
            };

            const metaJupe: ComponentMeta = {
              kind: "CHASSIS_MOBILE",
              title: "Bandeau de finition périphérique (Jupe en applique)",
              subtitle: `Caisson fermé monobloc · Lames de rive ${config.essence_bois}`,
              details: [
                ["Type d'habillage", "Pose en applique 4 côtés (vis invisibles inox)"],
                ["Hauteur bandeau", `${Math.round(jupeH * 1000)} mm (masque intégral châssis + roulettes)`],
                ["Garde au sol", "8 mm au-dessus de la plage fixe"],
                ["Épaisseur bandeau", `${Math.round(epJupe * 1000)} mm`],
                ["Rôle esthétique", "Finition caisson fermé monobloc DTU 51.4"],
              ],
            };

            return (
              <group key={panel.id} position={[currentPosX, 0, currentPosZ]}>
                {/* 1. CADRE ET TRAVERSES ALUMINIUM DU CHÂSSIS PORTANT */}
                {panel.chassisJoists.map((j) => {
                  const jx0 = j.startMm.xMm / 1000;
                  const jz0 = j.startMm.yMm / 1000;
                  const jx1 = j.endMm.xMm / 1000;
                  const jz1 = j.endMm.yMm / 1000;
                  const jlen = Math.hypot(jx1 - jx0, jz1 - jz0);
                  const jangle = Math.atan2(jz1 - jz0, jx1 - jx0);

                  return (
                    <mesh
                      key={j.id}
                      position={[(jx0 + jx1) / 2, panelChassisY, (jz0 + jz1) / 2]}
                      rotation={[0, -jangle, 0]}
                      castShadow
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMeta(metaChassis);
                      }}
                    >
                      <boxGeometry args={[jlen, chassisH, 0.04]} />
                      <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.3} />
                    </mesh>
                  );
                })}

                {/* 2. GALETS DE ROULEMENT INOX SOUS LE CHÂSSIS (roulant sur les rails plats) */}
                {panel.wheels.map((w) => {
                  const wx = w.centerMm.xMm / 1000;
                  const wz = w.centerMm.yMm / 1000;
                  const wheelRadius = 0.022;
                  const yWheel = yDeckTop + 0.005 + wheelRadius;

                  return (
                    <mesh
                      key={w.id}
                      position={[wx, yWheel, wz]}
                      rotation={[0, 0, Math.PI / 2]}
                      castShadow
                    >
                      <cylinderGeometry args={[wheelRadius, wheelRadius, 0.028, 16]} />
                      <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.2} />
                    </mesh>
                  );
                })}

                {/* 3. PLATELAGE DE LAMES DU CAISSON MOBILE (avec textures PBR rainurées) */}
                {panel.blades.map((b) => {
                  const p0 = b.polygonMm[0];
                  const p2 = b.polygonMm[2];
                  const bx0 = (p0?.xMm ?? 0) / 1000;
                  const bz0 = (p0?.yMm ?? 0) / 1000;
                  const bx1 = (p2?.xMm ?? (b.lengthNetMm || 1000)) / 1000;
                  const bz1 = (p2?.yMm ?? (b.widthNetMm || 145)) / 1000;

                  const blen = Math.abs(bx1 - bx0);
                  const bwidth = Math.abs(bz1 - bz0);

                  return (
                    <mesh
                      key={b.id}
                      position={[(bx0 + bx1) / 2, mobileLameY, (bz0 + bz1) / 2]}
                      castShadow
                      receiveShadow
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMeta(metaChassis);
                      }}
                    >
                      <boxGeometry args={[blen, lameH, bwidth]} />
                      <meshStandardMaterial
                        color={woodColor}
                        roughness={0.52}
                        metalness={0.04}
                        map={deckTextures.map ?? undefined}
                        bumpMap={deckTextures.bumpMap ?? undefined}
                        bumpScale={0.03}
                      />
                    </mesh>
                  );
                })}

                {/* 4. HABILLAGE COMPLET EN APPLIQUE : JUPE PÉRIPHÉRIQUE VERTICALE (4 CÔTÉS) */}
                {/* Masque intégralement le châssis alu et les galets de roulement sous tous les profils */}
                <group>
                  {/* Face avant (Z = 0) */}
                  <mesh
                    position={[pW / 2, jupeCenterY, -epJupe / 2]}
                    castShadow
                    receiveShadow
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMeta(metaJupe);
                    }}
                  >
                    <boxGeometry args={[pW + 2 * epJupe, jupeH, epJupe]} />
                    <meshStandardMaterial
                      color={woodColor}
                      roughness={0.52}
                      metalness={0.04}
                      map={deckTextures.map ?? undefined}
                      bumpMap={deckTextures.bumpMap ?? undefined}
                      bumpScale={0.03}
                    />
                  </mesh>

                  {/* Face arrière (Z = pL) */}
                  <mesh
                    position={[pW / 2, jupeCenterY, pL + epJupe / 2]}
                    castShadow
                    receiveShadow
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMeta(metaJupe);
                    }}
                  >
                    <boxGeometry args={[pW + 2 * epJupe, jupeH, epJupe]} />
                    <meshStandardMaterial
                      color={woodColor}
                      roughness={0.52}
                      metalness={0.04}
                      map={deckTextures.map ?? undefined}
                      bumpMap={deckTextures.bumpMap ?? undefined}
                      bumpScale={0.03}
                    />
                  </mesh>

                  {/* Face latérale gauche (X = 0) */}
                  <mesh
                    position={[-epJupe / 2, jupeCenterY, pL / 2]}
                    castShadow
                    receiveShadow
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMeta(metaJupe);
                    }}
                  >
                    <boxGeometry args={[epJupe, jupeH, pL]} />
                    <meshStandardMaterial
                      color={woodColor}
                      roughness={0.52}
                      metalness={0.04}
                      map={deckTextures.map ?? undefined}
                      bumpMap={deckTextures.bumpMap ?? undefined}
                      bumpScale={0.03}
                    />
                  </mesh>

                  {/* Face latérale droite (X = pW) */}
                  <mesh
                    position={[pW + epJupe / 2, jupeCenterY, pL / 2]}
                    castShadow
                    receiveShadow
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMeta(metaJupe);
                    }}
                  >
                    <boxGeometry args={[epJupe, jupeH, pL]} />
                    <meshStandardMaterial
                      color={woodColor}
                      roughness={0.52}
                      metalness={0.04}
                      map={deckTextures.map ?? undefined}
                      bumpMap={deckTextures.bumpMap ?? undefined}
                      bumpScale={0.03}
                    />
                  </mesh>
                </group>
              </group>
            );
          })}
        </group>
      )}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={1.2}
        maxDistance={40}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </>
  );
}

// =========================================================================
// COMPOSANT PRINCIPAL EXPORTÉ
// =========================================================================
export default function TerrasseVue3D({
  config,
  resultat,
  reservations = [],
}: TerrasseVue3DProps) {
  const [mounted, setMounted] = useState(false);

  // Vues et caméra
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Toggles de couches & Modes DTU
  const [eclate, setEclate] = useState(false);
  const [highlightOffcuts, setHighlightOffcuts] = useState(true);
  const [showSol, setShowSol] = useState(true);
  const [showPlots, setShowPlots] = useState(true);
  const [showLambourdes, setShowLambourdes] = useState(true);
  const [showLames, setShowLames] = useState(true);
  const [showRailsMobile, setShowRailsMobile] = useState(true);

  // Animation de terrasse mobile coulissante
  const [openingRatio, setOpeningRatio] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Sélection d'élément inspecté
  const [selectedMeta, setSelectedMeta] = useState<ComponentMeta | null>(null);

  // Montage côté client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Détection d'une terrasse mobile pour l'afficher ou l'activer
  const poolReservation = reservations.find((r) => r.type_reservation === "piscine");
  const mobileConfig = useMemo(
    () => resoudreConfigTerrasseMobile(config, poolReservation),
    [config, poolReservation]
  );
  const mobileResult = useMemo(() => {
    if (!poolReservation || !mobileConfig) return null;
    return calculerSousEnsembleTerrasseMobile({
      config,
      poolReservation,
      mobileConfig,
    });
  }, [config, poolReservation, mobileConfig]);

  // Animation automatique fluide T(t)
  useEffect(() => {
    if (!isAnimating) return;
    let step = 0.015;
    const interval = setInterval(() => {
      setOpeningRatio((prev) => {
        let next = prev + step;
        if (next >= 1) {
          next = 1;
          step = -0.015;
        } else if (next <= 0) {
          next = 0;
          step = 0.015;
        }
        return Math.max(0, Math.min(1, next));
      });
    }, 32);

    return () => clearInterval(interval);
  }, [isAnimating]);

  // Commandes de caméra présélectionnées
  const resetCamera = useCallback(() => {
    if (!controlsRef.current) return;
    controlsRef.current.reset();
    controlsRef.current.object.position.set(6, 6, 7);
    controlsRef.current.target.set(0, 0, 0);
  }, []);

  const setVueHaut = useCallback(() => {
    if (!controlsRef.current) return;
    controlsRef.current.object.position.set(0, 11, 0.01);
    controlsRef.current.target.set(0, 0, 0);
  }, []);

  const setVueCoupeDtu = useCallback(() => {
    if (!controlsRef.current) return;
    setEclate(true);
    controlsRef.current.object.position.set(7, 1.8, 3.5);
    controlsRef.current.target.set(0, 0.4, 0);
  }, []);

  const handleZoomIn = () => {
    if (!controlsRef.current) return;
    const cam = controlsRef.current.object;
    cam.position.multiplyScalar(0.85);
  };

  const handleZoomOut = () => {
    if (!controlsRef.current) return;
    const cam = controlsRef.current.object;
    cam.position.multiplyScalar(1.18);
  };

  const proGeo = resultat.terrassePro?.geometry;
  const nbBlades = proGeo?.blades.length ?? 0;
  const nbOffcutsReused = proGeo?.blades.filter((b) => b.isFromOffcutReuse).length ?? 0;
  const nbJoists = proGeo?.joists.length ?? 0;
  const nbDoubleJoists =
    proGeo?.joists.filter(
      (j) => j.role === "DOUBLE_ABOUTAGE_GAUCHE" || j.role === "DOUBLE_ABOUTAGE_DROITE"
    ).length ?? 0;
  const nbChevetres = proGeo?.joists.filter((j) => j.role === "CHEVETRE").length ?? 0;
  const nbSupports = proGeo?.supports.length ?? 0;

  if (!mounted) {
    return (
      <div className="relative w-full h-[480px] rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-[#0d0f12] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-gray-400 text-xs">
          <Loader2 className="animate-spin text-amber-500" size={24} />
          <span>Chargement du moteur 3D Three.js...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-[#0d0f12] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        {/* BARRE D'OUTILS SUPÉRIEURE : Vues Caméra + Mode Éclaté + Curseur Terrasse Mobile */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/60 px-3.5 py-2.5">
          {/* Vues Caméra & Éclaté */}
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
              Vue du dessus
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
              {eclate ? "Éclaté DTU : ACTIF" : "Vue réelle"}
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
              Chutes ♻️ ({nbOffcutsReused})
            </button>
          </div>

          {/* CURSEUR D'OUVERTURE DE LA TERRASSE MOBILE (Layer 6) */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl">
            <MoveHorizontal size={13} className="text-sky-400" />
            <button
              type="button"
              onClick={() => setIsAnimating((v) => !v)}
              className="p-1 rounded text-sky-400 hover:text-sky-300 hover:bg-white/10 transition"
              title={isAnimating ? "Mettre en pause" : "Animer l'ouverture"}
            >
              {isAnimating ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <span className="text-2xs font-semibold text-gray-200 whitespace-nowrap">
              Coulissement : <strong className="text-sky-300">{Math.round(openingRatio * 100)} %</strong>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={openingRatio}
              onChange={(e) => {
                setOpeningRatio(parseFloat(e.target.value));
                setIsAnimating(false);
              }}
              className="w-20 sm:w-28 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-sky-500"
              title="Curseur d'ouverture de la terrasse mobile"
            />
          </div>

          {/* TOGGLES DES COUCHES & ZOOM */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowRailsMobile((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-3xs font-semibold border ${
                showRailsMobile
                  ? "bg-sky-600/30 text-sky-200 border-sky-500/40"
                  : "bg-white/5 text-gray-500 border-white/5"
              }`}
              title="Afficher/Masquer les Rails et le Châssis mobile"
            >
              {showRailsMobile ? <Eye size={11} /> : <EyeOff size={11} />}
              Rails & Mobile (L6)
            </button>
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
              Lames ({nbBlades})
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
              Structure ({nbJoists})
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
              Plots ({nbSupports})
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

            {/* Zoom et Reset */}
            <div className="flex items-center gap-0.5 ml-1 rounded-lg bg-white/5 p-0.5 border border-white/10">
              <button
                type="button"
                onClick={handleZoomIn}
                className="p-1 rounded text-gray-300 hover:text-white hover:bg-white/10"
                title="Zoom avant"
              >
                <ZoomIn size={13} />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
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

        {/* CONTENEUR THREE.JS / R3F (60 FPS INSTANCED MESH) */}
        <div className="relative w-full h-[490px] bg-gradient-to-b from-[#0b0e14] via-[#111622] to-[#0b0d13]">
          <Canvas
            camera={{ position: [6, 5.5, 7.5], fov: 42 }}
            shadows
            className="w-full h-full cursor-grab active:cursor-grabbing block"
          >
            <SceneContent
              config={config}
              resultat={resultat}
              reservations={reservations}
              eclate={eclate}
              highlightOffcuts={highlightOffcuts}
              showSol={showSol}
              showPlots={showPlots}
              showLambourdes={showLambourdes}
              showLames={showLames}
              showRailsMobile={showRailsMobile}
              openingRatio={openingRatio}
              onSelectMeta={setSelectedMeta}
              controlsRef={controlsRef}
            />
          </Canvas>

          {/* FICHE D'INSPECTION DU COMPOSANT SÉLECTIONNÉ AU CLIC */}
          {selectedMeta && (
            <div className="absolute bottom-3 right-3 z-20 w-80 max-w-[92%] rounded-xl border border-amber-500/40 bg-[#0f131a]/95 p-3.5 text-xs text-white shadow-2xl backdrop-blur-md animate-in fade-in duration-150">
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

        {/* LÉGENDE & COMPTEURS GÉOMÉTRIQUES RÉELS */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/60 px-4 py-2.5 text-3xs text-gray-300">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-amber-600 inline-block border border-white/20" />
              Lames : <strong>{nbBlades}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" />
              Chutes ♻️ : <strong className="text-emerald-400">{nbOffcutsReused}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-orange-500 inline-block" />
              Doubles lambourdes : <strong className="text-orange-300">{nbDoubleJoists}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-sky-400 inline-block" />
              Chevêtres : <strong className="text-sky-300">{nbChevetres}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 inline-block" />
              Plots : <strong>{nbSupports}</strong>
            </span>
            {poolReservation && (
              <span className="flex items-center gap-1.5 text-sky-300">
                <span className="h-2.5 w-2.5 rounded-xs bg-sky-500 inline-block" />
                Terrasse Mobile :{" "}
                <strong>
                  {mobileResult
                    ? `${mobileResult.resultatPlateau.mode === "2_demi_plateaux" ? "2 demi-plateaux" : "1 plateau"} · Caisson fermé · ${
                        mobileResult.resultatPlateau.motorisation?.active &&
                        mobileResult.resultatPlateau.motorisation.typeMotorisation !== "aucune"
                          ? `Motorisation ${mobileResult.resultatPlateau.motorisation.typeMotorisation === "solaire" ? "Solaire 24V" : "Filaire"} (${mobileResult.resultatPlateau.motorisation.puissanceMoteurUnitaireN} N)`
                          : "Manuelle"
                      }`
                    : "Prête à configurer"}
                </strong>
              </span>
            )}
          </div>
          <span className="text-gray-400 flex items-center gap-1">
            <Box size={11} className="text-amber-400" />
            Rendu PBR Three.js · Ombres douces · Jupe d'applique · Glisser pour tourner
          </span>
        </div>
      </div>
    </div>
  );
}
