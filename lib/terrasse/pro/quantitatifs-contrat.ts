// Brique 4 — Contrat de sortie TerrasseProGeometricResult vers calculs.ts
// Séparation stricte entre Quantités nettes géométriques (Q_net),
// Quantités techniques découpées (Q_tech) et Quantités d'approvisionnement (Q_appro avec +3% de marge de tri et colisage)
// + calcul exact des vis Inox A2/A4 (Ø5 ou Ø6 mm selon Tableau 9 de 2018), clips, cales et bande bitumineuse.

import type { ChantierTerrasseConfig, ChantierTerrasseReservation } from "../types";
import {
  CONSTANTES_TERRASSE_PRO,
  estTerrasseComposite,
  resoudreSpecFixationPro,
  type DistinctQuantitiesBreakdown,
  type RuleDiagnosticItem,
  type SolicitationCategory,
  type TerrassePoseMode,
  type TerrasseProGeometricResult,
  type TerrasseFormeType,
  type TerrasseStructureMode,
  type Point2D,
} from "./presets-regles";
import {
  genererGeometrieStructure2D,
  type GeometrieTerrasseOptions,
} from "./geometrie-structure";
import {
  calculerCalepinageEtDecoupe1D,
  type CalepinageOptions,
} from "./calepinage-decoupe";

export interface CalculerTerrasseProOptions
  extends GeometrieTerrasseOptions,
    CalepinageOptions {
  vissageParDessousBois?: boolean;
  conditionnementBoiteVis?: number;
  conditionnementBoiteClips?: number;
}

export function calculerTerrasseProGeometrie(
  config: ChantierTerrasseConfig,
  reservations: ChantierTerrasseReservation[] = [],
  options: CalculerTerrasseProOptions = {}
): TerrasseProGeometricResult {
  const isComp = estTerrasseComposite(config);
  const solicitationCategory: SolicitationCategory = options.solicitationCategory ?? 1;

  // 1. Exécution de la Brique 2 (Structure 2D : lambourdes, chevêtres, plots)
  const structure = genererGeometrieStructure2D(config, reservations, options);

  // 2. Exécution de la Brique 3 (Calepinage des lames & Découpe 1D)
  const calepinage = calculerCalepinageEtDecoupe1D(config, structure, options);

  const blockingErrors: RuleDiagnosticItem[] = [...calepinage.blockingErrors];
  const warnings: RuleDiagnosticItem[] = [...calepinage.warnings];

  // 3. Spécification des fixations (Tableau 9 Déc. 2018 : Ø5 / Ø6 mm, ou vissage par le dessous e >= 27 mm, ou clips composites)
  const specFix = resoudreSpecFixationPro({
    isComposite: isComp,
    epaisseurLameMm: config.epaisseur_lame_mm || 21,
    largeurLameMm: config.largeur_lame_mm || 140,
    essence: config.essence_bois,
    typeLambourde: config.type_lambourde,
    zone: config.zone_environnement,
    vissageParDessousBois: options.vissageParDessousBois,
  });

  if (!specFix.vissageDessousValide && specFix.motifRejetVissageDessous) {
    blockingErrors.push({
      code: "ERR_DTU_VISSAGE_DESSOUS_EPAISSEUR_OU_ELANCEMENT",
      message: specFix.motifRejetVissageDessous,
      nature: "NORME_DTU_51_4",
    });
  }

  // 4. Agrégation de Q_net (Quantités nettes géométriques posées)
  const totalBladeNetLinearMeters = Number(
    (
      calepinage.blades.reduce((acc, b) => acc + b.lengthNetMm, 0) / 1000
    ).toFixed(2)
  );

  const totalJoistNetLinearMetersByLayer: Record<string, number> = {
    PRIMARY_TOP: 0,
    SECONDARY_BOTTOM_CROSS: 0,
    CHEVETRE_RESERVATION: 0,
  };
  for (const j of structure.joists) {
    totalJoistNetLinearMetersByLayer[j.layer] = Number(
      ((totalJoistNetLinearMetersByLayer[j.layer] || 0) + j.lengthNetMm / 1000).toFixed(2)
    );
  }

  const exactSupportCountByType: Record<string, number> = {};
  for (const s of structure.supports) {
    exactSupportCountByType[s.type] = (exactSupportCountByType[s.type] || 0) + 1;
  }

  // Comptage exact des fixations aux intersections lame / lambourde
  let exactFastenerCount = 0;
  let doubleClipsAtButtJointsCount = 0;

  if (isComp) {
    for (const b of calepinage.blades) {
      // 1 clip par lambourde courante + 1 clip supplémentaire à chaque extrémité aboutée (double clip à l'aboutage)
      const nbIntersections = b.supportJoistIds.length;
      exactFastenerCount += nbIntersections;
      if (b.leftJointType === "ABOUTAGE_DOUBLE" || b.leftJointType === "ABOUTAGE_SIMPLE") {
        doubleClipsAtButtJointsCount += 1;
      }
      if (b.rightJointType === "ABOUTAGE_DOUBLE" || b.rightJointType === "ABOUTAGE_SIMPLE") {
        doubleClipsAtButtJointsCount += 1;
      }
    }
  } else {
    // Bois massif : 2 vis par intersection lame/lambourde (et double vissage en rive aux extrémités si vissage par le dessous)
    for (const b of calepinage.blades) {
      exactFastenerCount += b.supportJoistIds.length * 2;
    }
  }

  // 5. Agrégation de Q_tech (Quantités techniques issues du plan de coupe 1D)
  const bladeCommLenMm = Math.round((config.longueur_lame_m || 4.0) * 1000);
  const joistCommLenMm = Math.round((config.longueur_lambourde_m || 4.0) * 1000);

  const bladeBarsCount = calepinage.totalBladeCommercialBarsCount;
  const joistBarsCount = calepinage.totalJoistCommercialBarsCount;

  // 6. Agrégation de Q_appro (Quantités d'approvisionnement commercial avec +3% de marge de tri DTU et colisage)
  const dtu3PercentSortingMarginBladesCount = Math.max(
    1,
    Math.ceil(bladeBarsCount * CONSTANTES_TERRASSE_PRO.MARGE_TRI_APPRO_DTU_PCT)
  );
  const totalBladesToOrderCount = bladeBarsCount + dtu3PercentSortingMarginBladesCount;

  const dtuMarginJoistsCount = Math.ceil(
    joistBarsCount * CONSTANTES_TERRASSE_PRO.MARGE_TRI_APPRO_DTU_PCT
  );
  const totalJoistsToOrderCount = joistBarsCount + dtuMarginJoistsCount;

  const boxSize = isComp
    ? options.conditionnementBoiteClips ?? 100
    : options.conditionnementBoiteVis ?? 200;
  const fastenerBoxesCount = Math.max(
    1,
    Math.ceil((exactFastenerCount * (1 + CONSTANTES_TERRASSE_PRO.MARGE_TRI_APPRO_DTU_PCT)) / boxSize)
  );

  const totalJoistNetMl = Object.values(totalJoistNetLinearMetersByLayer).reduce(
    (a, b) => a + b,
    0
  );
  const bituminousTapeLinearMeters =
    config.bande_etancheite_epdm && config.type_lambourde !== "alu_structure"
      ? Math.ceil(totalJoistNetMl * 1.05)
      : 0;

  const spacersOrCalesCount = config.cales_isolation ? structure.supports.length : 0;

  const quantities: DistinctQuantitiesBreakdown = {
    geometricNet: {
      netDeckingAreaM2: structure.netAreaM2,
      reservationsDeductedAreaM2: structure.reservationsAreaM2,
      totalBladeNetLinearMeters,
      totalJoistNetLinearMetersByLayer,
      exactSupportCountByType,
      exactFastenerCount,
    },
    technicalCut: {
      bladesByCommercialLength: [
        {
          lengthMm: bladeCommLenMm,
          count: bladeBarsCount,
          totalLinearMeters: Number(((bladeBarsCount * bladeCommLenMm) / 1000).toFixed(2)),
        },
      ],
      joistsByCommercialLength: [
        {
          lengthMm: joistCommLenMm,
          count: joistBarsCount,
          totalLinearMeters: Number(((joistBarsCount * joistCommLenMm) / 1000).toFixed(2)),
        },
      ],
      globalBladeWasteRatePercent: calepinage.bladeWasteRatePercent,
      globalJoistWasteRatePercent: calepinage.joistWasteRatePercent,
    },
    commercialSupply: {
      dtu3PercentSortingMarginBladesCount,
      totalBladesToOrderCount,
      totalJoistsToOrderCount,
      fastenerSpec: {
        type: specFix.type,
        stainlessGrade: specFix.stainlessGrade,
        diameterMm: specFix.diameterMm,
        minLengthMm: specFix.minLengthMm,
        doubleClipsAtButtJointsCount: isComp ? doubleClipsAtButtJointsCount : undefined,
      },
      fastenerBoxesCount,
      spacersOrCalesCount,
      bituminousTapeLinearMeters,
    },
  };

  const conceptionType: "COURANTE" | "ELABOREE" =
    config.double_lambourdage_aboutage || config.bande_etancheite_epdm || config.cales_isolation
      ? "ELABOREE"
      : "COURANTE";

  return {
    engineVersion: CONSTANTES_TERRASSE_PRO.ENGINE_VERSION,
    framework: isComp ? "COMPOSITE_MANUFACTURER" : "NF_DTU_51_4_DEC_2018",
    solicitationCategory,
    conceptionType,
    isValid: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    geometry: {
      blades: calepinage.blades,
      joists: structure.joists,
      supports: structure.supports,
    },
    cuttingPlan: calepinage.cuttingPlan,
    topAdmissibleScenarios: calepinage.topAdmissibleScenarios,
    quantities,
  };
}

export type {
  TerrasseProGeometricResult,
  DistinctQuantitiesBreakdown,
  TerrasseFormeType,
  TerrassePoseMode,
  TerrasseStructureMode,
  Point2D,
};
