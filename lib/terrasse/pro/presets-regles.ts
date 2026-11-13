// Brique 1 — Presets & Règles utiles (Bois massif NF DTU 51.4 Décembre 2018 vs Composite Fabricants)
// Source de vérité normative exclusive : §3 à §20 de dossier_technique_dtu_51_4_terrasse_pro.md

import type {
  ChantierTerrasseConfig,
  EssenceBois,
  ZoneEnvironnement,
  ResultatPlateauMobile,
  ConfigTerrasseMobile,
  TypeMotorisationTerrasse,
} from "../types";
import { getFabricantComposite, getGammeDefaut } from "../composite/fabricants";

export type RuleNature =
  | "NORME_DTU_51_4"
  | "NORME_ASSOCIEE"
  | "PRESCRIPTION_FABRICANT"
  | "REGLE_METIER_INTERNE";

export type SolicitationCategory = 1 | 2 | 3;

export type TerrasseFormeType = "I" | "L" | "U" | "POLYGONE";

export type TerrassePoseMode = "ALIGNEE" | "COUPE_PERDUE" | "QUINCONCE";

export type TerrasseStructureMode = "SIMPLE" | "DOUBLE_ABOUTAGE" | "CROISEE";

export interface Point2D {
  xMm: number;
  yMm: number;
}

export interface PlacedBladeSegment {
  id: string;
  rowIndex: number;
  segmentIndexInRow: number;
  polygonMm: Point2D[];
  lengthNetMm: number;            // >= 400 mm garanti (R-MET-01)
  widthNetMm: number;
  thicknessMm: number;
  supportJoistIds: string[];      // >= 2 appuis (bois) ou >= 3 appuis (composite / lame < 800mm)
  spanCount: number;
  leftJointType: "RIVE_MUR" | "RIVE_LIBRE" | "RESERVATION" | "ABOUTAGE_SIMPLE" | "ABOUTAGE_DOUBLE";
  rightJointType: "RIVE_MUR" | "RIVE_LIBRE" | "RESERVATION" | "ABOUTAGE_SIMPLE" | "ABOUTAGE_DOUBLE";
  leftOverhangMm: number;         // <= 3*e en bout (borné 20mm..100mm)
  rightOverhangMm: number;
  sourceCommercialBarId: string;
  isFromOffcutReuse: boolean;
}

export interface PlacedJoistSegment {
  id: string;
  layer: "PRIMARY_TOP" | "SECONDARY_BOTTOM_CROSS" | "CHEVETRE_RESERVATION";
  role: "COURANTE" | "RIVE" | "DOUBLE_ABOUTAGE_GAUCHE" | "DOUBLE_ABOUTAGE_DROITE" | "CHEVETRE";
  pairedJoistId?: string;
  startMm: Point2D;
  endMm: Point2D;
  lengthNetMm: number;
  widthMm: number;
  heightMm: number;
  supportIds: string[];
  maxSpanBetweenSupportsMm: number; // <= 700 mm (>= 3 appuis) ou <= 600 mm (2 appuis)
}

export interface PlacedSupportPoint {
  id: string;
  type: "PLOT_POLYMERE" | "PLOT_BETON" | "CALE_SUR_DALLE" | "PLOT_CHEVETRE";
  centerMm: Point2D;
  heightMm: number;               // <= 300 mm si PLOT_POLYMERE
  supportedJoistIds: string[];
  isJoistSpliceCentered: boolean;
  requiredCapacityFrkKn: number;  // 5.0 kN (Soll 1), 7.5 kN (Soll 2), 12.5 kN (Soll 3)
}

export interface CuttingBarPlan {
  barId: string;
  componentType: "LAME" | "LAMBOURDE";
  commercialLengthMm: number;
  endTrimMm: number;              // Purge en bout : 10 à 15 mm
  cuts: Array<{
    segmentId: string;
    cutLengthMm: number;
    kerfMm: number;               // Trait de scie : 3 mm
  }>;
  offcutLengthMm: number;
  offcutStatus: "REUSED_IN_PLAN" | "REUSABLE_STOCK" | "WASTE_SCRAP";
}

export interface PlacedMobilePanel {
  id: string;
  nom: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  lengthMm: number;
  directionVector: { x: number; y: number };
  travelDistanceMm: number;
  chassisJoists: PlacedJoistSegment[];
  blades: PlacedBladeSegment[];
  wheels: Array<{
    id: string;
    centerMm: Point2D;
    railId: string;
  }>;
}

export interface PlacedMobileStructure {
  active: boolean;
  panels: PlacedMobilePanel[];
  rails: Array<{
    id: string;
    startMm: Point2D;
    endMm: Point2D;
    lengthMm: number;
  }>;
  totalRailLinearMeters: number;
  totalWheelsCount: number;
  chassisProfilesLinearMeters: number;
  motorisation?: ResultatPlateauMobile["motorisation"];
}

export interface DistinctQuantitiesBreakdown {
  /** 1. Quantités nettes géométriques (Q_net) */
  geometricNet: {
    netDeckingAreaM2: number;
    reservationsDeductedAreaM2: number;
    totalBladeNetLinearMeters: number;
    totalJoistNetLinearMetersByLayer: Record<string, number>;
    exactSupportCountByType: Record<string, number>;
    exactFastenerCount: number;
    mobileDeckingNetAreaM2?: number;
    mobileRailsNetLinearMeters?: number;
    mobileChassisNetLinearMeters?: number;
    mobileWheelsCount?: number;
    mobileCremaillereNetLinearMeters?: number;
    mobileMotorsCount?: number;
  };
  /** 2. Quantités techniques découpées (Q_tech) */
  technicalCut: {
    bladesByCommercialLength: Array<{ lengthMm: number; count: number; totalLinearMeters: number }>;
    joistsByCommercialLength: Array<{ lengthMm: number; count: number; totalLinearMeters: number }>;
    globalBladeWasteRatePercent: number;
    globalJoistWasteRatePercent: number;
  };
  /** 3. Quantités d'approvisionnement commercial (Q_appro avec +3% marge de tri & colisage) */
  commercialSupply: {
    dtu3PercentSortingMarginBladesCount: number;
    totalBladesToOrderCount: number;
    totalJoistsToOrderCount: number;
    fastenerSpec: {
      type: "VIS_INOX" | "CLIP_COMPOSITE" | "VIS_DESSOUS_BOIS";
      stainlessGrade: "A2" | "A4";
      diameterMm?: 5 | 6;         // Tableau 9 (Déc. 2018) : Ø5 (21<=e<=29mm) ou Ø6 (30<=e<=45mm)
      minLengthMm?: number;
      doubleClipsAtButtJointsCount?: number;
    };
    fastenerBoxesCount: number;
    spacersOrCalesCount: number;
    bituminousTapeLinearMeters: number;
    mobileSupply?: {
      railsInoxLinearMeters: number;
      railsInoxBarsCount: number;
      wheelsCount: number;
      chassisAluLinearMeters: number;
      chassisAluBarsCount: number;
      motorisationUnit?: boolean;
      motorisation?: {
        type: TypeMotorisationTerrasse;
        nbMoteurs: number;
        puissanceN: number;
        lineaireCremaillereM: number;
        barresCremaillereCount: number;
        coffretCommande: string;
        panneauSolaireUnit?: number;
        batteriesCount?: number;
        alimentationFilaireUnit?: number;
        finsDeCourseCount: number;
        telecommandesCount: number;
      };
    };
  };
}

export interface AdmissibleScenarioSummary {
  rank: 1 | 2;
  label: string;
  commercialLengthMm: number;
  poseMode: TerrassePoseMode;
  wasteRatePercent: number;
  totalBladesToOrderCount: number;
  estimatedTotalCostHt?: number;
}

export interface RuleDiagnosticItem {
  code: string;
  message: string;
  nature: RuleNature;
}

export interface TerrasseProGeometricResult {
  engineVersion: string;
  framework: "NF_DTU_51_4_DEC_2018" | "COMPOSITE_MANUFACTURER";
  solicitationCategory: SolicitationCategory;
  conceptionType: "COURANTE" | "ELABOREE";
  isValid: boolean;
  blockingErrors: RuleDiagnosticItem[];
  warnings: RuleDiagnosticItem[];
  geometry: {
    blades: PlacedBladeSegment[];
    joists: PlacedJoistSegment[];
    supports: PlacedSupportPoint[];
    mobileStructure?: PlacedMobileStructure;
  };
  cuttingPlan: CuttingBarPlan[];
  topAdmissibleScenarios?: AdmissibleScenarioSummary[];
  quantities: DistinctQuantitiesBreakdown;
  terrasseMobile?: ResultatPlateauMobile;
}

/** Constantes métier et normatives figées (NF DTU 51.4 Décembre 2018 & Règles internes BNA) */
export const CONSTANTES_TERRASSE_PRO = {
  ENGINE_VERSION: "terrasse-pro-dtu51.4-2018-v1.0.0",
  LONGUEUR_MIN_SEGMENT_MM: 400,          // R-MET-01 : règle métier interne anti-micro-pièces (>= 400 mm)
  SEUIL_LAME_COURTE_3_APPUIS_MM: 800,    // Lame < 800 mm -> >= 3 appuis en composite
  REDUCTION_ENTRAXE_2_APPUIS: 0.85,      // -15% sur 2 appuis (NF DTU 51.4 Déc. 2018 §5.5.4)
  PORTEE_MAX_LAMBOURDE_3_APPUIS_MM: 700, // <= 700 mm sur >= 3 appuis (NF DTU 51.4 Déc. 2018 Art. 1 & Tableau 5)
  PORTEE_MAX_LAMBOURDE_2_APPUIS_MM: 600, // <= 600 mm sur 2 appuis (NF DTU 51.4 Déc. 2018 Art. 1 & Tableau 5)
  HAUTEUR_MAX_PLOT_POLYMERE_MM: 300,     // <= 300 mm sous lame (NF DTU 51.4 Déc. 2018 Art. 1 & §5.5.3.4.2)
  EPAISSEUR_MIN_VISSAGE_DESSOUS_MM: 27,  // e >= 27 mm obligatoire (NF DTU 51.4 Déc. 2018 §5.5.6.3)
  JEU_ENTRE_LAMES_DEFAUT_MM: 5,          // 5 mm par défaut (Tableau 8 Déc. 2018 : 3,5 / 5 / 6,5 / 8 mm)
  JEU_ABOUTAGE_DEFAUT_MM: 5,             // z = 5 mm dans [4, 6] mm (NF DTU 51.4 Déc. 2018 §5.2.3a & §5.5.4.2.1)
  JEU_ABOUTAGE_MIN_BOIS_MM: 4,
  JEU_ABOUTAGE_MAX_BOIS_MM: 6,
  JEU_PERIPHERIQUE_BOIS_MM: 10,          // 10 mm contre mur/obstacle en bois massif
  JEU_PERIPHERIQUE_COMPOSITE_MM: 15,     // 15 mm contre mur/obstacle en composite
  DEBORD_BOUT_MIN_MM: 20,                // 20 mm min en bout de lame
  DEBORD_LATERAL_MAX_MM: 15,             // 10 à 15 mm en latéral
  TRAIT_SCIE_MM: 3,                      // Trait de scie 3 mm
  PURGE_BOUT_BARRE_MM: 15,               // Purge d'équerrage en bout 10-15 mm (15 mm par défaut)
  MARGE_TRI_APPRO_DTU_PCT: 0.03,         // +3% marge de tri (NF DTU 51.4 Déc. 2018 §5.7 / Tableau 16)
} as const;

/** Charges d'exploitation par catégorie de sollicitation (NF DTU 51.4 Déc. 2018 §5.3.2 Tableau 4) */
export const SOLLICITATIONS_DTU_2018: Record<
  SolicitationCategory,
  { qkKnM2: number; QkKn: number; plotFrkMinKn: number; label: string }
> = {
  1: {
    qkKnM2: 3.5,
    QkKn: 2.0,
    plotFrkMinKn: 5.0,
    label: "Sollicitation 1 (Privatif courant : 3,5 kN/m² ; 2,0 kN)",
  },
  2: {
    qkKnM2: 2.5,
    QkKn: 3.0,
    plotFrkMinKn: 7.5,
    label: "Sollicitation 2 (ERP / Collectif sans forte densité : 2,5 kN/m² ; 3,0 kN)",
  },
  3: {
    qkKnM2: 5.0,
    QkKn: 5.0,
    plotFrkMinKn: 12.5,
    label: "Sollicitation 3 (Public forte densité : 5,0 kN/m² ; 5,0 kN)",
  },
};

export function estTerrasseComposite(config: ChantierTerrasseConfig): boolean {
  return config.systeme_terrasse === "composite_clip" || config.essence_bois === "composite";
}

/**
 * Calcule l'entraxe maximal des lambourdes E1 (en mm) selon NF DTU 51.4 (Décembre 2018) Tableaux 6 & 7
 * pour le bois massif, ou selon les prescriptions fabricants pour le composite.
 */
export function resoudreEntraxeMaxLambourdesMm(params: {
  isComposite: boolean;
  essence: EssenceBois;
  epaisseurLameMm: number;
  largeurLameMm: number;
  solicitationCategory?: SolicitationCategory;
  isPoseDiagonale45?: boolean;
  surDeuxAppuis?: boolean;
  fabricantComposite?: string | null;
  gammeComposite?: string | null;
}): {
  entraxeMax3AppuisMm: number;
  entraxeMax2AppuisMm: number;
  entraxeMaxEffectifMm: number;
  nature: RuleNature;
} {
  const cat = params.solicitationCategory ?? 1;

  if (params.isComposite) {
    const fab = getFabricantComposite(params.fabricantComposite);
    const gamme = params.gammeComposite
      ? fab.gammes.find((g) => g.gamme === params.gammeComposite) || getGammeDefaut(fab)
      : getGammeDefaut(fab);
    const baseMm = Math.min(400, (gamme.entraxeMaxCm || 40) * 10);
    // Réduction à 300 mm (ou -100 mm) en ERP (Sollicitations 2/3) ou en pose diagonale 45°
    const reduitErpOuBiais = cat >= 2 || params.isPoseDiagonale45;
    const effectifMm = reduitErpOuBiais ? Math.min(300, Math.max(200, baseMm - 100)) : baseMm;
    return {
      entraxeMax3AppuisMm: effectifMm,
      entraxeMax2AppuisMm: 0, // 2 appuis interdit en composite (>= 3 appuis obligatoires)
      entraxeMaxEffectifMm: effectifMm,
      nature: "PRESCRIPTION_FABRICANT",
    };
  }

  // Bois massif — NF DTU 51.4 (Décembre 2018) §5.5.4.1 Tableaux 6 et 7
  const e = params.epaisseurLameMm;
  const isFeuilluDense =
    params.essence === "ipe" || params.essence === "cumaru" || params.essence === "bambou_thermo";

  let baseMm = 400;
  if (isFeuilluDense) {
    // Tableau 7 (Déc. 2018) — Feuillus D30/D40/D50
    if (cat === 1) {
      if (e >= 26) baseMm = 500;
      else if (e >= 21) baseMm = 450;
      else baseMm = 400;
    } else if (cat === 2) {
      if (e >= 28) baseMm = 500;
      else if (e >= 23) baseMm = 450;
      else baseMm = 400;
    } else {
      if (e >= 34) baseMm = 500;
      else if (e >= 28) baseMm = 450;
      else baseMm = 400;
    }
  } else {
    // Tableau 6 (Déc. 2018) — Résineux C18/C24 et Feuillus tempérés D18/D24
    if (cat === 1) {
      if (e >= 27) baseMm = 500;
      else if (e >= 23) baseMm = 450;
      else baseMm = 400;
    } else if (cat === 2) {
      if (e >= 32) baseMm = 500;
      else if (e >= 27) baseMm = 450;
      else baseMm = 400;
    } else {
      if (e >= 38) baseMm = 500;
      else if (e >= 34) baseMm = 450;
      else baseMm = 400;
    }
  }

  // En pose diagonale 45°, l'espacement perpendiculaire entre lambourdes est réduit par cos(45°) ≈ 0.707
  if (params.isPoseDiagonale45) {
    baseMm = Math.floor((baseMm * Math.SQRT1_2) / 10) * 10;
  }

  // Abattement normatif de -15 % lorsque la lame repose sur 2 appuis (§5.5.4)
  const deuxAppuisMm = Math.floor(baseMm * CONSTANTES_TERRASSE_PRO.REDUCTION_ENTRAXE_2_APPUIS);

  return {
    entraxeMax3AppuisMm: baseMm,
    entraxeMax2AppuisMm: deuxAppuisMm,
    entraxeMaxEffectifMm: params.surDeuxAppuis ? deuxAppuisMm : baseMm,
    nature: "NORME_DTU_51_4",
  };
}

/**
 * Calcule la portée maximale des lambourdes entre plots E2 (en mm)
 * selon NF DTU 51.4 (Décembre 2018) Art. 1 & §5.5.3.6.3 Tableau 5 :
 * - <= 700 mm sur >= 3 appuis
 * - <= 600 mm sur 2 appuis
 */
export function resoudrePorteeMaxLambourdeMm(params: {
  sectionHauteurMm: number;
  sectionLargeurMm: number;
  typeLambourde: ChantierTerrasseConfig["type_lambourde"];
  surDeuxAppuis?: boolean;
  solicitationCategory?: SolicitationCategory;
}): {
  porteeMax3AppuisMm: number;
  porteeMax2AppuisMm: number;
  porteeMaxEffectiveMm: number;
  nature: RuleNature;
} {
  const h = params.sectionHauteurMm;
  let max3AppuisMm = 500;

  if (params.typeLambourde === "alu_structure") {
    max3AppuisMm = 700;
  } else if (params.typeLambourde === "bois_exotique") {
    if (h >= 55) max3AppuisMm = 700;
    else if (h >= 45) max3AppuisMm = 600;
    else max3AppuisMm = 500;
  } else {
    // Résineux C18/C24 Classe 4
    if (h >= 70) max3AppuisMm = 700;
    else if (h >= 60) max3AppuisMm = 550;
    else if (h >= 50) max3AppuisMm = 500;
    else max3AppuisMm = 400;
  }

  // Plafonds stricts du domaine NF DTU 51.4 (Décembre 2018) : 700 mm (>=3 appuis) et 600 mm (2 appuis)
  const porteeMax3AppuisMm = Math.min(
    CONSTANTES_TERRASSE_PRO.PORTEE_MAX_LAMBOURDE_3_APPUIS_MM,
    max3AppuisMm
  );
  const porteeMax2AppuisMm = Math.min(
    CONSTANTES_TERRASSE_PRO.PORTEE_MAX_LAMBOURDE_2_APPUIS_MM,
    Math.floor(porteeMax3AppuisMm * 0.85 / 10) * 10
  );

  return {
    porteeMax3AppuisMm,
    porteeMax2AppuisMm,
    porteeMaxEffectiveMm: params.surDeuxAppuis ? porteeMax2AppuisMm : porteeMax3AppuisMm,
    nature: "NORME_DTU_51_4",
  };
}

/**
 * Largeur minimale de lambourde bois (en mm) selon NF DTU 51.4 (Décembre 2018) Tableau 11 (§5.5.6.2.4)
 */
export function resoudreLargeurMinLambourdeBoisMm(params: {
  estAboutageSimple: boolean;
  diametreVisMm: 5 | 6;
  estLambourdeFeuilluPrepercee: boolean;
}): number {
  if (!params.estAboutageSimple) {
    // Hors aboutage ou en double lambourdage : 40 mm min
    return 40;
  }
  if (params.estLambourdeFeuilluPrepercee) {
    return 55;
  }
  return params.diametreVisMm === 6 ? 70 : 65;
}

/**
 * Jeux de pose par défaut (en mm) selon NF DTU 51.4 (Décembre 2018) §5.2.3a, §5.5.4.2 & Fabricants Composite
 */
export function resoudreJeuxPoseMm(config: ChantierTerrasseConfig): {
  jeuEntreLamesMm: number;
  jeuAboutageBoutMm: number;
  jeuPeripheriqueMurMm: number;
  debordBoutMaxMm: number;
  debordLateralMaxMm: number;
} {
  const isComp = estTerrasseComposite(config);
  const e = Math.max(19, config.epaisseur_lame_mm || 21);

  const jeuEntreLamesMm =
    config.espacement_lames_mm && config.espacement_lames_mm >= 3.5
      ? config.espacement_lames_mm
      : CONSTANTES_TERRASSE_PRO.JEU_ENTRE_LAMES_DEFAUT_MM;

  // En bois massif : z dans [4, 6] mm, défaut 5 mm (§8)
  const jeuAboutageBoutMm = CONSTANTES_TERRASSE_PRO.JEU_ABOUTAGE_DEFAUT_MM;

  const jeuPeripheriqueMurMm = isComp
    ? CONSTANTES_TERRASSE_PRO.JEU_PERIPHERIQUE_COMPOSITE_MM
    : CONSTANTES_TERRASSE_PRO.JEU_PERIPHERIQUE_BOIS_MM;

  // Débord max en bout de lame : entre 20 mm et 3*e (plafonné à 100 mm, ou 25 mm en composite Silvadec)
  const debordBoutMaxMm = isComp
    ? 25
    : Math.min(100, Math.max(CONSTANTES_TERRASSE_PRO.DEBORD_BOUT_MIN_MM, 3 * e));

  return {
    jeuEntreLamesMm,
    jeuAboutageBoutMm,
    jeuPeripheriqueMurMm,
    debordBoutMaxMm,
    debordLateralMaxMm: CONSTANTES_TERRASSE_PRO.DEBORD_LATERAL_MAX_MM,
  };
}

/**
 * Spécification des fixations selon NF DTU 51.4 (Décembre 2018) Tableau 9 (§11.2) et §5.5.6.3 (§11.3)
 */
export function resoudreSpecFixationPro(params: {
  isComposite: boolean;
  epaisseurLameMm: number;
  largeurLameMm: number;
  essence: EssenceBois;
  typeLambourde: ChantierTerrasseConfig["type_lambourde"];
  zone?: ZoneEnvironnement;
  vissageParDessousBois?: boolean;
}): {
  type: "VIS_INOX" | "CLIP_COMPOSITE" | "VIS_DESSOUS_BOIS";
  stainlessGrade: "A2" | "A4";
  diameterMm?: 5 | 6;
  minLengthMm?: number;
  vissageDessousValide: boolean;
  motifRejetVissageDessous?: string;
} {
  const stainlessGrade: "A2" | "A4" =
    params.zone === "piscine" || params.zone === "littoral" ? "A4" : "A2";

  if (params.isComposite) {
    return {
      type: "CLIP_COMPOSITE",
      stainlessGrade,
      vissageDessousValide: true,
    };
  }

  const e = params.epaisseurLameMm;
  const L = params.largeurLameMm;

  if (params.vissageParDessousBois) {
    const elancement = L / Math.max(1, e);
    if (e < CONSTANTES_TERRASSE_PRO.EPAISSEUR_MIN_VISSAGE_DESSOUS_MM) {
      return {
        type: "VIS_DESSOUS_BOIS",
        stainlessGrade,
        vissageDessousValide: false,
        motifRejetVissageDessous: `NF DTU 51.4 (Déc. 2018) §5.5.6.3 : le vissage par le dessous exige une épaisseur de lame e >= 27 mm (reçu : ${e} mm).`,
      };
    }
    if (elancement > 5) {
      return {
        type: "VIS_DESSOUS_BOIS",
        stainlessGrade,
        vissageDessousValide: false,
        motifRejetVissageDessous: `NF DTU 51.4 (Déc. 2018) §5.5.6.3 : le vissage par le dessous exige un élancement L/e <= 5 (reçu : ${elancement.toFixed(2)}).`,
      };
    }
    return {
      type: "VIS_DESSOUS_BOIS",
      stainlessGrade,
      diameterMm: 5,
      minLengthMm: Math.ceil(e * 0.75 + 20),
      vissageDessousValide: true,
    };
  }

  // Vissage traversant par le dessus — Tableau 9 (Décembre 2018) :
  // - Ø 5 mm pour 21 <= e <= 29 mm
  // - Ø 6 mm pour 30 <= e <= 45 mm
  const diameterMm: 5 | 6 = e >= 30 ? 6 : 5;

  // Ancrage S dans la lambourde bois (§5.5.6.2.1 Décembre 2018) :
  // - Lame feuillue dense (Ipé/Cumaru) sur lambourde résineuse : S >= 2,2 * e
  // - Même classe de densité : S >= 1,5 * e (ou longueur totale >= 2,5 * e)
  const isLameDenseSurResineux =
    (params.essence === "ipe" || params.essence === "cumaru") &&
    params.typeLambourde === "bois_cl4";
  const ancrageMinMm = isLameDenseSurResineux ? Math.ceil(2.2 * e) : Math.ceil(1.5 * e);
  const minLengthMm = Math.max(50, Math.ceil((e + ancrageMinMm) / 5) * 5);

  return {
    type: "VIS_INOX",
    stainlessGrade,
    diameterMm,
    minLengthMm,
    vissageDessousValide: true,
  };
}
