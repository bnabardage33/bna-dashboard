"use client";

import React, { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  FENCE_MATERIAL_PRESETS,
  type FenceResult,
} from "@/lib/cloture/calepinageCloture";

interface ClotureVue3DProps {
  result: FenceResult;
}

interface PlacedBay {
  key: string;
  x: number;
  yBase: number;
  z: number;
  rotY: number;
  width: number;
  isPortillon: boolean;
}

interface PlacedPost {
  key: string;
  x: number;
  yBase: number;
  z: number;
  height: number;
  isAngleOrGate: boolean;
}

function ClotureScene({ result }: { result: FenceResult }) {
  const { config, segmentsActifs } = result;
  const preset = FENCE_MATERIAL_PRESETS[config.materiau];

  const { bays, posts, center, groundSize } = useMemo(() => {
    const baysList: PlacedBay[] = [];
    const postsList: PlacedPost[] = [];

    const segA = segmentsActifs.find((s) => s.id === "A");
    const segB = segmentsActifs.find((s) => s.id === "B");
    const segC = segmentsActifs.find((s) => s.id === "C");
    const segD = segmentsActifs.find((s) => s.id === "D");

    const lenA = segA?.longueurSegment ?? 8;
    const lenB = segB?.longueurSegment ?? 6;

    const addSegment3D = (
      seg: (typeof segmentsActifs)[number],
      startX: number,
      startZ: number,
      dirX: number,
      dirZ: number,
      rotY: number
    ) => {
      const nbTravees = Math.max(1, seg.nbTraveesSegment);
      const bayW = seg.largeurTraveeAxe || seg.longueurClotureUtileM / nbTravees;
      const pasRedan =
        config.gestionPente === "REDANS" && seg.pasRedanM > 0
          ? seg.pasRedanM * (seg.deniveleM < 0 ? -1 : 1)
          : 0;

      for (let i = 0; i < nbTravees; i++) {
        const yBase = i * pasRedan;
        const cx = startX + dirX * ((i + 0.5) * bayW);
        const cz = startZ + dirZ * ((i + 0.5) * bayW);
        baysList.push({
          key: `${seg.id}-bay-${i}`,
          x: cx,
          yBase,
          z: cz,
          rotY,
          width: Math.max(0.2, bayW - 0.07),
          isPortillon: false,
        });

        postsList.push({
          key: `${seg.id}-post-${i}`,
          x: startX + dirX * (i * bayW),
          yBase,
          z: startZ + dirZ * (i * bayW),
          height: config.hauteurUtile + Math.abs(pasRedan),
          isAngleOrGate: i === 0 && seg.departType === "ANGLE",
        });
      }

      const endCloture = nbTravees * bayW;
      postsList.push({
        key: `${seg.id}-post-end`,
        x: startX + dirX * endCloture,
        yBase: Math.max(0, nbTravees - 1) * pasRedan,
        z: startZ + dirZ * endCloture,
        height: config.hauteurUtile,
        isAngleOrGate: seg.arriveeType === "ANGLE" && seg.nbPortillonsSegment === 0,
      });

      if (seg.nbPortillonsSegment > 0 && seg.longueurPortillonsM > 0) {
        const pW = seg.longueurPortillonsM;
        const yBase = Math.max(0, nbTravees - 1) * pasRedan;
        baysList.push({
          key: `${seg.id}-portillon`,
          x: startX + dirX * (endCloture + pW / 2),
          yBase,
          z: startZ + dirZ * (endCloture + pW / 2),
          rotY,
          width: Math.max(0.4, pW - 0.08),
          isPortillon: true,
        });
        postsList.push({
          key: `${seg.id}-post-port-end`,
          x: startX + dirX * (endCloture + pW),
          yBase,
          z: startZ + dirZ * (endCloture + pW),
          height: config.hauteurUtile,
          isAngleOrGate: true,
        });
      }
    };

    if (segA) addSegment3D(segA, -lenA / 2, lenB / 2, 1, 0, 0);
    if (segB) addSegment3D(segB, lenA / 2, lenB / 2, 0, -1, Math.PI / 2);
    if (segC) addSegment3D(segC, lenA / 2, -lenB / 2, -1, 0, Math.PI);
    if (segD) addSegment3D(segD, -lenA / 2, -lenB / 2, 0, 1, -Math.PI / 2);

    const maxSpan = Math.max(lenA, lenB, 10);
    return {
      bays: baysList,
      posts: postsList,
      center: [0, config.hauteurUtile / 2, 0] as [number, number, number],
      groundSize: maxSpan + 8,
    };
  }, [config, segmentsActifs]);

  const soubH = result.hauteurSoubassementRetenueM;
  const lamesH = Math.max(0.2, config.hauteurUtile - soubH);
  const nLames = Math.max(1, result.nbLamesParTravee);
  const lameH = lamesH / nLames;

  return (
    <>
      <color attach="background" args={["#F1F5F9"]} />
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[12, 18, 10]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      {/* Sol / terrain */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial color="#D6D3D1" roughness={0.95} />
      </mesh>

      {/* Poteaux */}
      {posts.map((p) => (
        <mesh
          key={p.key}
          position={[p.x, p.yBase + p.height / 2, p.z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.075, p.height, 0.075]} />
          <meshStandardMaterial
            color={p.isAngleOrGate ? "#B85B2B" : "#334155"}
            roughness={0.45}
            metalness={0.35}
          />
        </mesh>
      ))}

      {/* Travées (Lames, Soubassement, Portillon) */}
      {bays.map((b) => (
        <group key={b.key} position={[b.x, b.yBase, b.z]} rotation={[0, b.rotY, 0]}>
          {b.isPortillon ? (
            <group>
              <mesh position={[0, config.hauteurUtile / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[b.width, config.hauteurUtile - 0.06, 0.04]} />
                <meshStandardMaterial color="#38BDF8" roughness={0.35} metalness={0.45} />
              </mesh>
              <mesh position={[b.width * 0.38, config.hauteurUtile * 0.52, 0.035]}>
                <boxGeometry args={[0.1, 0.03, 0.04]} />
                <meshStandardMaterial color="#0F172A" metalness={0.8} roughness={0.2} />
              </mesh>
            </group>
          ) : (
            <>
              {soubH > 0 && (
                <mesh position={[0, soubH / 2, 0]} castShadow receiveShadow>
                  <boxGeometry args={[b.width, soubH, 0.045]} />
                  <meshStandardMaterial color="#94A3B8" roughness={0.9} />
                </mesh>
              )}

              {Array.from({ length: nLames }).map((_, idx) => (
                <mesh
                  key={`${b.key}-l-${idx}`}
                  position={[0, soubH + (idx + 0.5) * lameH, 0]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[b.width, Math.max(0.02, lameH - 0.008), 0.028]} />
                  <meshStandardMaterial
                    color={preset.colorHex}
                    roughness={config.materiau === "ALU" ? 0.35 : 0.78}
                    metalness={config.materiau === "ALU" ? 0.65 : 0.08}
                  />
                </mesh>
              ))}
            </>
          )}
        </group>
      ))}

      <OrbitControls
        target={center}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2 - 0.04}
      />
    </>
  );
}

export default function ClotureVue3D({ result }: ClotureVue3DProps) {
  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-[#23272B]">
            Maquette 3D interactive Clôture
          </h4>
          <p className="text-xs text-[#777777]">
            Glissez pour pivoter · Molette pour zoomer · Clic droit pour déplacer
          </p>
        </div>
        <span className="rounded-lg bg-[#B85B2B]/10 px-2.5 py-1 text-xs font-bold text-[#B85B2B]">
          Three.js PBR · {result.config.materiau}
        </span>
      </div>

      <div className="h-[380px] w-full overflow-hidden rounded-xl border border-[#E5E5E5] bg-[#F1F5F9]">
        <Canvas shadows camera={{ position: [9, 6, 11], fov: 45 }}>
          <ClotureScene result={result} />
        </Canvas>
      </div>
    </div>
  );
}
