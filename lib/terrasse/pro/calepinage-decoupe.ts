// Brique 3 — Calepinage des Lames & Optimiseur de découpe 1D
// Pose alignée, coupe perdue ou quinconce ; règle bloquante anti-micro-pièces
// (>= 400 mm R-MET-01 ET >= 2 appuis en bois massif avec -15% ou >= 3 appuis en composite / lame < 800 mm,
// avec proposition des 2 meilleurs scénarios admissibles si le quinconce échoue) ;
// débit dans les longueurs commerciales avec trait de scie (3 mm), purge en bout (10-15 mm) et réemploi des chutes.

import type { ChantierTerrasseConfig } from "../types";
import {
  CONSTANTES_TERRASSE_PRO,
  estTerrasseComposite,
  resoudreJeuxPoseMm,
  type AdmissibleScenarioSummary,
  type CuttingBarPlan,
  type PlacedBladeSegment,
  type PlacedJoistSegment,
  type RuleDiagnosticItem,
  type TerrassePoseMode,
} from "./presets-regles";
import {
  intersectHorizontalBandWithDomainMm,
  type Structure2DResult,
} from "./geometrie-structure";

export interface CalepinageOptions {
  poseMode?: TerrassePoseMode;
  candidateCommercialLengthsMm?: number[];
  kerfMm?: number;
  endTrimMm?: number;
}

export interface CalepinageDecoupeResult {
  isValid: boolean;
  poseModeEffective: TerrassePoseMode;
  quinconceRejected: boolean;
  blockingErrors: RuleDiagnosticItem[];
  warnings: RuleDiagnosticItem[];
  blades: PlacedBladeSegment[];
  cuttingPlan: CuttingBarPlan[];
  bladeWasteRatePercent: number;
  joistWasteRatePercent: number;
  totalBladeCommercialBarsCount: number;
  totalJoistCommercialBarsCount: number;
  topAdmissibleScenarios: AdmissibleScenarioSummary[];
}

function findSupportingJoistsForSegment(
  xStartMm: number,
  xEndMm: number,
  yCenterMm: number,
  joists: PlacedJoistSegment[]
): PlacedJoistSegment[] {
  // Retourne les lambourdes principales ou chevêtres verticaux qui intersectent [xStartMm, xEndMm] à yCenterMm
  const candidates = joists.filter((j) => {
    if (j.layer === "SECONDARY_BOTTOM_CROSS") return false;
    const minY = Math.min(j.startMm.yMm, j.endMm.yMm) - 25;
    const maxY = Math.max(j.startMm.yMm, j.endMm.yMm) + 25;
    if (yCenterMm < minY || yCenterMm > maxY) return false;
    const jx = (j.startMm.xMm + j.endMm.xMm) / 2;
    return jx >= xStartMm - 35 && jx <= xEndMm + 35;
  });

  // Dédupliquer les paires de double lambourdage d'aboutage pour compter les points d'appui réels du segment,
  // tout en conservant la lambourde dédiée à l'extrémité gauche ou droite
  const byX = new Map<number, PlacedJoistSegment>();
  for (const j of candidates) {
    const jx = Math.round((j.startMm.xMm + j.endMm.xMm) / 2);
    // Regrouper à 60 mm près (cas d'une paire DOUBLE_ABOUTAGE_GAUCHE / DROITE)
    let foundKey: number | null = null;
    for (const k of byX.keys()) {
      if (Math.abs(k - jx) <= 65) {
        foundKey = k;
        break;
      }
    }
    if (foundKey === null) {
      byX.set(jx, j);
    }
  }

  return Array.from(byX.entries())
    .sort((a, b) => a[0] - b[0])
    .map((e) => e[1]);
}

function snapSplitToNearestJoistX(
  targetXMm: number,
  xStartMm: number,
  xEndMm: number,
  joistXPositionsMm: number[],
  minSegmentMm: number,
  maxSegmentMm: number = Infinity
): number | null {
  let bestX: number | null = null;
  let bestDist = Infinity;
  for (const jx of joistXPositionsMm) {
    const segLen = jx - xStartMm;
    if (segLen >= minSegmentMm && segLen <= maxSegmentMm && xEndMm - jx >= minSegmentMm) {
      const dist = Math.abs(jx - targetXMm);
      if (dist < bestDist) {
        bestDist = dist;
        bestX = jx;
      }
    }
  }
  return bestX;
}

/**
 * Simule le calepinage des lames et le plan de coupe 1D pour un mode de pose et une longueur commerciale donnés.
 */
function simulerCalepinageEtDecoupe(params: {
  config: ChantierTerrasseConfig;
  structure: Structure2DResult;
  poseMode: TerrassePoseMode;
  commercialLengthMm: number;
  kerfMm: number;
  endTrimMm: number;
  strictQuinconceCheck: boolean;
}): {
  validAllSegments: boolean;
  invalidSegmentsCount: number;
  blades: PlacedBladeSegment[];
  bladeBars: CuttingBarPlan[];
  wasteRatePercent: number;
} {
  const { config, structure, poseMode, commercialLengthMm, kerfMm, endTrimMm } = params;
  const isComp = estTerrasseComposite(config);
  const jeux = resoudreJeuxPoseMm(config);

  const bladeW = config.largeur_lame_mm || 140;
  const bladeThick = config.epaisseur_lame_mm || 21;
  const pitchMm = bladeW + jeux.jeuEntreLamesMm;
  const totalH = structure.boundingHeightMm;
  const nbRows = Math.max(1, Math.ceil(totalH / pitchMm));

  const usableBarMm = Math.max(400, commercialLengthMm - endTrimMm);
  const zButtMm = jeux.jeuAboutageBoutMm; // 5 mm (dans [4, 6] mm)
  const minSegMm = CONSTANTES_TERRASSE_PRO.LONGUEUR_MIN_SEGMENT_MM; // 400 mm

  const rawSegments: Array<{
    rowIndex: number;
    segmentIndexInRow: number;
    xStartMm: number;
    xEndMm: number;
    yStartMm: number;
    yEndMm: number;
    leftJointType: PlacedBladeSegment["leftJointType"];
    rightJointType: PlacedBladeSegment["rightJointType"];
  }> = [];

  let carryOverOffcutMm = 0;
  let invalidSegmentsCount = 0;

  for (let r = 0; r < nbRows; r++) {
    const yStartMm = r * pitchMm;
    if (yStartMm >= totalH) break;
    const yEndMm = Math.min(totalH, yStartMm + bladeW);
    const yCenterMm = Math.round((yStartMm + yEndMm) / 2);

    const intervals = intersectHorizontalBandWithDomainMm(
      yCenterMm,
      structure.domainRectsMm,
      structure.normalizedReservations,
      jeux.jeuPeripheriqueMurMm,
      structure.domainPolygonMm
    );

    let segInRow = 0;
    for (const iv of intervals) {
      const ivLen = iv.xEndMm - iv.xStartMm;
      if (ivLen <= 0) continue;

      if (ivLen <= usableBarMm) {
        // En mode QUINCONCE sur les rangées impaires, si l'intervalle dépasse 2 * minSegMm + 200,
        // le quinconce théorique tenterait un joint à mi-longueur ou à usableBarMm / 2
        if (poseMode === "QUINCONCE" && r % 2 === 1 && ivLen > usableBarMm * 0.65) {
          const targetMidX = iv.xStartMm + Math.round(ivLen / 2);
          const snappedX = snapSplitToNearestJoistX(
            targetMidX,
            iv.xStartMm,
            iv.xEndMm,
            structure.joistXPositionsMm,
            minSegMm
          );
          if (snappedX !== null && ivLen > commercialLengthMm) {
            const leftEnd = snappedX - Math.floor(zButtMm / 2);
            const rightStart = snappedX + Math.ceil(zButtMm / 2);
            rawSegments.push({
              rowIndex: r,
              segmentIndexInRow: segInRow++,
              xStartMm: iv.xStartMm,
              xEndMm: leftEnd,
              yStartMm,
              yEndMm,
              leftJointType: iv.leftBoundary,
              rightJointType: config.double_lambourdage_aboutage || isComp ? "ABOUTAGE_DOUBLE" : "ABOUTAGE_SIMPLE",
            });
            rawSegments.push({
              rowIndex: r,
              segmentIndexInRow: segInRow++,
              xStartMm: rightStart,
              xEndMm: iv.xEndMm,
              yStartMm,
              yEndMm,
              leftJointType: config.double_lambourdage_aboutage || isComp ? "ABOUTAGE_DOUBLE" : "ABOUTAGE_SIMPLE",
              rightJointType: iv.rightBoundary,
            });
            continue;
          }
        }

        // Segment unique sans aboutage intermédiaire
        rawSegments.push({
          rowIndex: r,
          segmentIndexInRow: segInRow++,
          xStartMm: iv.xStartMm,
          xEndMm: iv.xEndMm,
          yStartMm,
          yEndMm,
          leftJointType: iv.leftBoundary,
          rightJointType: iv.rightBoundary,
        });
        continue;
      }

      // L'intervalle dépasse la longueur utile d'une lame commerciale : découpage avec aboutages sur lambourdes
      let cursorX = iv.xStartMm;
      let isFirstInInterval = true;

      while (cursorX < iv.xEndMm - 1) {
        const remainingMm = iv.xEndMm - cursorX;
        if (remainingMm <= usableBarMm) {
          rawSegments.push({
            rowIndex: r,
            segmentIndexInRow: segInRow++,
            xStartMm: cursorX,
            xEndMm: iv.xEndMm,
            yStartMm,
            yEndMm,
            leftJointType: isFirstInInterval
              ? iv.leftBoundary
              : config.double_lambourdage_aboutage || isComp
              ? "ABOUTAGE_DOUBLE"
              : "ABOUTAGE_SIMPLE",
            rightJointType: iv.rightBoundary,
          });
          break;
        }

        // Déterminer la longueur cible du premier segment selon le mode de pose
        let targetLenMm = usableBarMm;
        if (isFirstInInterval) {
          if (poseMode === "QUINCONCE" && r % 2 === 1) {
            targetLenMm = Math.round(usableBarMm / 2);
          } else if (
            poseMode === "COUPE_PERDUE" &&
            carryOverOffcutMm >= minSegMm &&
            iv.xEndMm - (cursorX + carryOverOffcutMm) >= minSegMm
          ) {
            targetLenMm = carryOverOffcutMm;
          }
        }

        const rawSplitX = cursorX + targetLenMm;
        // En vérification stricte du quinconce, on regarde d'abord la lambourde la plus proche du décalage 1/2
        let splitJoistX: number | null = null;
        if (params.strictQuinconceCheck && poseMode === "QUINCONCE" && isFirstInInterval && r % 2 === 1) {
          // Trouver la lambourde la plus proche de rawSplitX sans filtrer par minSegMm pour détecter si le quinconce crée une chute < 400mm
          let nearestX = structure.joistXPositionsMm[0] ?? rawSplitX;
          let minD = Math.abs(nearestX - rawSplitX);
          for (const jx of structure.joistXPositionsMm) {
            if (jx > cursorX + 50 && jx < iv.xEndMm - 50 && Math.abs(jx - rawSplitX) < minD) {
              minD = Math.abs(jx - rawSplitX);
              nearestX = jx;
            }
          }
          splitJoistX = nearestX;
        } else {
          splitJoistX = snapSplitToNearestJoistX(
            rawSplitX,
            cursorX,
            iv.xEndMm,
            structure.joistXPositionsMm,
            minSegMm,
            usableBarMm
          );
        }

        if (
          splitJoistX === null ||
          splitJoistX <= cursorX + 50 ||
          splitJoistX - cursorX > usableBarMm ||
          splitJoistX >= iv.xEndMm - 50
        ) {
          splitJoistX = cursorX + Math.min(usableBarMm, Math.round(remainingMm / 2));
        }

        const segEndMm = splitJoistX - Math.floor(zButtMm / 2);
        const segLenMm = segEndMm - cursorX;
        rawSegments.push({
          rowIndex: r,
          segmentIndexInRow: segInRow++,
          xStartMm: cursorX,
          xEndMm: segEndMm,
          yStartMm,
          yEndMm,
          leftJointType: isFirstInInterval
            ? iv.leftBoundary
            : config.double_lambourdage_aboutage || isComp
            ? "ABOUTAGE_DOUBLE"
            : "ABOUTAGE_SIMPLE",
          rightJointType:
            config.double_lambourdage_aboutage || isComp ? "ABOUTAGE_DOUBLE" : "ABOUTAGE_SIMPLE",
        });

        // Mise à jour de la chute réemployable pour le mode COUPE_PERDUE
        const usedFromBar = segLenMm + kerfMm;
        if (usedFromBar < usableBarMm) {
          carryOverOffcutMm = usableBarMm - usedFromBar;
        } else {
          carryOverOffcutMm = 0;
        }

        cursorX = splitJoistX + Math.ceil(zButtMm / 2);
        isFirstInInterval = false;
      }
    }
  }

  // Construction des PlacedBladeSegment et contrôle bloquant anti-micro-pièces (>= 400 mm ET >= 2 ou 3 appuis)
  const blades: PlacedBladeSegment[] = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const rs = rawSegments[i];
    const lengthNetMm = Math.max(1, rs.xEndMm - rs.xStartMm);
    const widthNetMm = Math.max(1, rs.yEndMm - rs.yStartMm);
    const yCenterMm = Math.round((rs.yStartMm + rs.yEndMm) / 2);

    const supportingJoists = findSupportingJoistsForSegment(
      rs.xStartMm,
      rs.xEndMm,
      yCenterMm,
      structure.joists
    );
    const supportJoistIds = supportingJoists.map((j) => j.id);
    const nbAppuis = supportJoistIds.length;
    const spanCount = Math.max(1, nbAppuis - 1);

    // Exigence du nombre minimal d'appuis :
    // - Composite OU lame < 800 mm en composite : >= 3 appuis
    // - Bois massif : >= 2 appuis (et si 2 appuis, entraxe <= entraxeMax2AppuisMm)
    const minAppuisRequis = isComp ? 3 : 2;
    let appuisConformes = nbAppuis >= minAppuisRequis;
    if (!isComp && nbAppuis === 2 && supportingJoists.length === 2) {
      const spanMm = Math.abs(supportingJoists[1].startMm.xMm - supportingJoists[0].startMm.xMm);
      if (spanMm > structure.entraxeLambourdesMax2AppuisMm + 5) {
        appuisConformes = false;
      }
    }

    if (lengthNetMm < minSegMm || !appuisConformes) {
      invalidSegmentsCount++;
    }

    const firstJoistX = supportingJoists[0]?.startMm.xMm ?? rs.xStartMm;
    const lastJoistX = supportingJoists[supportingJoists.length - 1]?.startMm.xMm ?? rs.xEndMm;
    const leftOverhangMm = Math.max(0, Math.round(firstJoistX - rs.xStartMm));
    const rightOverhangMm = Math.max(0, Math.round(rs.xEndMm - lastJoistX));

    blades.push({
      id: `lame-r${rs.rowIndex + 1}-s${rs.segmentIndexInRow + 1}`,
      rowIndex: rs.rowIndex,
      segmentIndexInRow: rs.segmentIndexInRow,
      polygonMm: [
        { xMm: rs.xStartMm, yMm: rs.yStartMm },
        { xMm: rs.xEndMm, yMm: rs.yStartMm },
        { xMm: rs.xEndMm, yMm: rs.yEndMm },
        { xMm: rs.xStartMm, yMm: rs.yEndMm },
      ],
      lengthNetMm,
      widthNetMm,
      thicknessMm: bladeThick,
      supportJoistIds,
      spanCount,
      leftJointType: rs.leftJointType,
      rightJointType: rs.rightJointType,
      leftOverhangMm,
      rightOverhangMm,
      sourceCommercialBarId: "",
      isFromOffcutReuse: false,
    });
  }

  // Débit 1D (First-Fit Decreasing avec suivi du réemploi des chutes, trait de scie 3mm et purge en bout 10-15mm)
  const bladeBars: CuttingBarPlan[] = [];
  const openBars: Array<{
    bar: CuttingBarPlan;
    remainingMm: number;
  }> = [];

  // Tri par longueur décroissante pour optimiser le débit tout en gardant la référence vers chaque segment
  const sortedBlades = [...blades].sort((a, b) => b.lengthNetMm - a.lengthNetMm);

  for (const seg of sortedBlades) {
    const neededMm = seg.lengthNetMm;
    // Chercher une barre entamée ayant une chute suffisante
    let placedInExisting = false;
    for (const entry of openBars) {
      const kerfCost = entry.bar.cuts.length > 0 ? kerfMm : 0;
      if (entry.remainingMm >= neededMm + kerfCost) {
        entry.bar.cuts.push({
          segmentId: seg.id,
          cutLengthMm: neededMm,
          kerfMm: kerfCost,
        });
        entry.remainingMm -= neededMm + kerfCost;
        entry.bar.offcutLengthMm = entry.remainingMm;
        seg.sourceCommercialBarId = entry.bar.barId;
        seg.isFromOffcutReuse = entry.bar.cuts.length > 1;
        placedInExisting = true;
        break;
      }
    }

    if (!placedInExisting) {
      const barId = `barre-lame-${bladeBars.length + 1}`;
      const remainingMm = Math.max(0, usableBarMm - neededMm);
      const newBar: CuttingBarPlan = {
        barId,
        componentType: "LAME",
        commercialLengthMm,
        endTrimMm,
        cuts: [
          {
            segmentId: seg.id,
            cutLengthMm: neededMm,
            kerfMm: 0,
          },
        ],
        offcutLengthMm: remainingMm,
        offcutStatus: "WASTE_SCRAP",
      };
      bladeBars.push(newBar);
      openBars.push({ bar: newBar, remainingMm });
      seg.sourceCommercialBarId = barId;
      seg.isFromOffcutReuse = false;
    }
  }

  for (const b of bladeBars) {
    if (b.cuts.length > 1) {
      b.offcutStatus = "REUSED_IN_PLAN";
    } else if (b.offcutLengthMm >= minSegMm) {
      b.offcutStatus = "REUSABLE_STOCK";
    } else {
      b.offcutStatus = "WASTE_SCRAP";
    }
  }

  const totalNetBladeMm = blades.reduce((acc, s) => acc + s.lengthNetMm, 0);
  const totalCommercialBladeMm = Math.max(1, bladeBars.length * commercialLengthMm);
  const wasteRatePercent = Number(
    Math.max(0, ((totalCommercialBladeMm - totalNetBladeMm) / totalCommercialBladeMm) * 100).toFixed(2)
  );

  return {
    validAllSegments: invalidSegmentsCount === 0,
    invalidSegmentsCount,
    blades,
    bladeBars,
    wasteRatePercent,
  };
}

/**
 * Exécute le calepinage 2D des lames et l'optimisation 1D des découpes (lames et lambourdes),
 * avec rejet des micro-pièces (< 400 mm) et calcul des 2 meilleurs scénarios admissibles.
 */
export function calculerCalepinageEtDecoupe1D(
  config: ChantierTerrasseConfig,
  structure: Structure2DResult,
  options: CalepinageOptions = {}
): CalepinageDecoupeResult {
  const blockingErrors: RuleDiagnosticItem[] = [...structure.blockingErrors];
  const warnings: RuleDiagnosticItem[] = [...structure.warnings];

  const kerfMm = options.kerfMm ?? CONSTANTES_TERRASSE_PRO.TRAIT_SCIE_MM;
  const endTrimMm = options.endTrimMm ?? CONSTANTES_TERRASSE_PRO.PURGE_BOUT_BARRE_MM;
  const primaryLengthMm = Math.round((config.longueur_lame_m || 4.0) * 1000);
  const requestedPoseMode: TerrassePoseMode = options.poseMode ?? "COUPE_PERDUE";

  // 1. Tester le mode demandé
  let mainSim = simulerCalepinageEtDecoupe({
    config,
    structure,
    poseMode: requestedPoseMode,
    commercialLengthMm: primaryLengthMm,
    kerfMm,
    endTrimMm,
    strictQuinconceCheck: true,
  });

  let poseModeEffective = requestedPoseMode;
  let quinconceRejected = false;

  // 2. Si le mode QUINCONCE viole la règle >= 400 mm ou le nombre minimal d'appuis,
  // le moteur rejette le quinconce brut et bascule sur le meilleur scénario admissible
  if (requestedPoseMode === "QUINCONCE" && !mainSim.validAllSegments) {
    quinconceRejected = true;
    warnings.push({
      code: "WARN_QUINCONCE_SEGMENTS_NON_CONFORMES",
      message: `Le motif quinconce génère ${mainSim.invalidSegmentsCount} segment(s) non conforme(s) (< 400 mm ou nombre d'appuis insuffisant). Bascule sur les 2 meilleurs scénarios admissibles.`,
      nature: "REGLE_METIER_INTERNE",
    });

    const fallbackCoupePerdue = simulerCalepinageEtDecoupe({
      config,
      structure,
      poseMode: "COUPE_PERDUE",
      commercialLengthMm: primaryLengthMm,
      kerfMm,
      endTrimMm,
      strictQuinconceCheck: false,
    });

    if (fallbackCoupePerdue.validAllSegments) {
      mainSim = fallbackCoupePerdue;
      poseModeEffective = "COUPE_PERDUE";
    } else {
      const fallbackAligne = simulerCalepinageEtDecoupe({
        config,
        structure,
        poseMode: "ALIGNEE",
        commercialLengthMm: primaryLengthMm,
        kerfMm,
        endTrimMm,
        strictQuinconceCheck: false,
      });
      if (fallbackAligne.validAllSegments) {
        mainSim = fallbackAligne;
        poseModeEffective = "ALIGNEE";
      }
    }
  }

  if (!mainSim.validAllSegments) {
    blockingErrors.push({
      code: "ERR_CALEPINAGE_MICRO_PIECE_OU_SOUS_APPUYE",
      message: `Le calepinage comporte ${mainSim.invalidSegmentsCount} segment(s) < 400 mm (R-MET-01) ou reposant sur un nombre d'appuis insuffisant.`,
      nature: "REGLE_METIER_INTERNE",
    });
  }

  // 3. Évaluation des 2 meilleurs scénarios admissibles (longueurs commerciales & modes de pose)
  const candidateLengths = Array.from(
    new Set([primaryLengthMm, ...(options.candidateCommercialLengthsMm ?? [2400, 3000, 3600, 4000])])
  );
  const candidateModes: TerrassePoseMode[] = ["COUPE_PERDUE", "ALIGNEE", "QUINCONCE"];
  const validCandidates: Array<{
    commercialLengthMm: number;
    poseMode: TerrassePoseMode;
    wasteRatePercent: number;
    totalBladesToOrderCount: number;
  }> = [];

  for (const lenMm of candidateLengths) {
    for (const mode of candidateModes) {
      const sim = simulerCalepinageEtDecoupe({
        config,
        structure,
        poseMode: mode,
        commercialLengthMm: lenMm,
        kerfMm,
        endTrimMm,
        strictQuinconceCheck: true,
      });
      if (sim.validAllSegments) {
        const marginCount = Math.ceil(
          sim.bladeBars.length * CONSTANTES_TERRASSE_PRO.MARGE_TRI_APPRO_DTU_PCT
        );
        validCandidates.push({
          commercialLengthMm: lenMm,
          poseMode: mode,
          wasteRatePercent: sim.wasteRatePercent,
          totalBladesToOrderCount: sim.bladeBars.length + marginCount,
        });
      }
    }
  }

  validCandidates.sort((a, b) => a.wasteRatePercent - b.wasteRatePercent);
  const topAdmissibleScenarios: AdmissibleScenarioSummary[] = validCandidates
    .slice(0, 2)
    .map((c, idx) => ({
      rank: (idx + 1) as 1 | 2,
      label: `Pose ${c.poseMode.replace("_", " ").toLowerCase()} — Lames ${(c.commercialLengthMm / 1000).toFixed(2)} m (chute ${c.wasteRatePercent}%)`,
      commercialLengthMm: c.commercialLengthMm,
      poseMode: c.poseMode,
      wasteRatePercent: c.wasteRatePercent,
      totalBladesToOrderCount: c.totalBladesToOrderCount,
    }));

  // 4. Débit 1D des lambourdes dans leur longueur commerciale
  const joistCommMm = Math.round((config.longueur_lambourde_m || 4.0) * 1000);
  const usableJoistBarMm = Math.max(500, joistCommMm - endTrimMm);
  const joistBars: CuttingBarPlan[] = [];
  const openJoistBars: Array<{ bar: CuttingBarPlan; remainingMm: number }> = [];

  // Découper chaque lambourde qui dépasse la longueur commerciale en barres avec joint de 5 mm
  const joistPieces: Array<{ id: string; lenMm: number }> = [];
  for (const j of structure.joists) {
    let rem = j.lengthNetMm;
    let part = 1;
    while (rem > usableJoistBarMm) {
      joistPieces.push({ id: `${j.id}-p${part++}`, lenMm: usableJoistBarMm });
      rem -= usableJoistBarMm;
    }
    if (rem > 0) {
      joistPieces.push({ id: `${j.id}-p${part}`, lenMm: rem });
    }
  }

  joistPieces.sort((a, b) => b.lenMm - a.lenMm);
  for (const jp of joistPieces) {
    let placed = false;
    for (const entry of openJoistBars) {
      const kCost = entry.bar.cuts.length > 0 ? kerfMm : 0;
      if (entry.remainingMm >= jp.lenMm + kCost) {
        entry.bar.cuts.push({
          segmentId: jp.id,
          cutLengthMm: jp.lenMm,
          kerfMm: kCost,
        });
        entry.remainingMm -= jp.lenMm + kCost;
        entry.bar.offcutLengthMm = entry.remainingMm;
        placed = true;
        break;
      }
    }
    if (!placed) {
      const barId = `barre-lambourde-${joistBars.length + 1}`;
      const remainingMm = Math.max(0, usableJoistBarMm - jp.lenMm);
      const newBar: CuttingBarPlan = {
        barId,
        componentType: "LAMBOURDE",
        commercialLengthMm: joistCommMm,
        endTrimMm,
        cuts: [{ segmentId: jp.id, cutLengthMm: jp.lenMm, kerfMm: 0 }],
        offcutLengthMm: remainingMm,
        offcutStatus: remainingMm >= 500 ? "REUSABLE_STOCK" : "WASTE_SCRAP",
      };
      joistBars.push(newBar);
      openJoistBars.push({ bar: newBar, remainingMm });
    }
  }

  const totalNetJoistMm = structure.joists.reduce((acc, j) => acc + j.lengthNetMm, 0);
  const totalCommJoistMm = Math.max(1, joistBars.length * joistCommMm);
  const joistWasteRatePercent = Number(
    Math.max(0, ((totalCommJoistMm - totalNetJoistMm) / totalCommJoistMm) * 100).toFixed(2)
  );

  return {
    isValid: blockingErrors.length === 0,
    poseModeEffective,
    quinconceRejected,
    blockingErrors,
    warnings,
    blades: mainSim.blades,
    cuttingPlan: [...mainSim.bladeBars, ...joistBars],
    bladeWasteRatePercent: mainSim.wasteRatePercent,
    joistWasteRatePercent,
    totalBladeCommercialBarsCount: mainSim.bladeBars.length,
    totalJoistCommercialBarsCount: joistBars.length,
    topAdmissibleScenarios,
  };
}
