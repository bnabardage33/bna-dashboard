/**
 * Moteur de calcul complet — Calepinage Clôture (1 à 4 côtés)
 * Adapté et enrichi depuis Bna-app :
 *   - Formes DROITE, EN_L, EN_U, 4_COTES
 *   - Matériaux BOIS, COMPOSITE, ALU
 *   - Pose DIRECT_SOL / SUR_MURET
 *   - Plaques de soubassement béton (250 / 500 mm)
 *   - Portillons (déduction largeur + poteaux renforcés / gâche)
 *   - Pentes / Redans en escalier (dénivelé par travée + surcote poteaux)
 */

export type FenceShape = "DROITE" | "EN_L" | "EN_U" | "4_COTES";

export type FenceMaterial = "BOIS" | "COMPOSITE" | "ALU";

export type FenceEndsConfig = "LIBRE" | "DEPART_MUR" | "ENTRE_MURS";

export type FenceGroundType = "DIRECT_SOL" | "SUR_MURET";

export type GestionPenteType = "PLAT" | "REDANS" | "SUIVI_PENTE";

export type SegmentId = "A" | "B" | "C" | "D";

export type PostExtremityType = "TERMINAISON" | "DEMI_MURAL" | "ANGLE";

export interface MaterialPreset {
  id: FenceMaterial;
  shortName: string;
  label: string;
  colorHex: string;
  strokeHex: string;
  defaultBladeLengthM: number;
  defaultBladeHeightM: number;
}

export const FENCE_MATERIAL_PRESETS: Record<FenceMaterial, MaterialPreset> = {
  BOIS: {
    id: "BOIS",
    shortName: "BOIS",
    label: "Bois (Pin / Exotique / Mélèze)",
    colorHex: "#8B5A2B",
    strokeHex: "#5C3A1B",
    defaultBladeLengthM: 2.0,
    defaultBladeHeightM: 0.145,
  },
  COMPOSITE: {
    id: "COMPOSITE",
    shortName: "COMPOSITE",
    label: "Composite (Anthracite RAL 7016)",
    colorHex: "#262626",
    strokeHex: "#404040",
    defaultBladeLengthM: 1.8,
    defaultBladeHeightM: 0.15,
  },
  ALU: {
    id: "ALU",
    shortName: "ALU",
    label: "Aluminium Thermolaqué (Gris)",
    colorHex: "#9CA3AF",
    strokeHex: "#6B7280",
    defaultBladeLengthM: 1.8,
    defaultBladeHeightM: 0.15,
  },
};

export const SEGMENT_METADATA: Record<
  SegmentId,
  {
    id: SegmentId;
    shortLabel: string;
    fullLabel: string;
    orientation: string;
    accentHex: string;
  }
> = {
  A: {
    id: "A",
    shortLabel: "Côté A",
    fullLabel: "Côté A (Sud / Avant)",
    orientation: "Sud / Façade avant",
    accentHex: "#B85B2B",
  },
  B: {
    id: "B",
    shortLabel: "Côté B",
    fullLabel: "Côté B (Est / Droite)",
    orientation: "Est / Pignon droit",
    accentHex: "#0284C7",
  },
  C: {
    id: "C",
    shortLabel: "Côté C",
    fullLabel: "Côté C (Nord / Arrière)",
    orientation: "Nord / Fond de parcelle",
    accentHex: "#059669",
  },
  D: {
    id: "D",
    shortLabel: "Côté D",
    fullLabel: "Côté D (Ouest / Gauche)",
    orientation: "Ouest / Pignon gauche",
    accentHex: "#7C3AED",
  },
};

export const FENCE_CONSTANTS = {
  /** Largeur de section d'un poteau standard : 70 mm (0.07 m) */
  SECTION_POTEAU_M: 0.07,
  /** Profondeur d'une feuillure de poteau : 15 mm (0.015 m) de chaque côté */
  PROFONDEUR_FEUILLURE_M: 0.015,
  /** Jeu de dilatation thermique obligatoire par travée : 10 mm (0.01 m) */
  JEU_DILATATION_M: 0.01,
  /** Portée maximale absolue d'une travée : 2.00 m */
  PORTEE_MAX_ABSOLUE_M: 2.0,
  /** Bornes de longueur de lame brute */
  LAME_BRUTE_MIN_M: 1.5,
  LAME_BRUTE_MAX_M: 2.4,
  /** Scellement béton direct dans le sol : +0.50 m */
  GARDE_SCELLEMENT_SOL_M: 0.5,
  /** Garde sur platine muret : +0.02 m */
  GARDE_PLATINE_MURET_M: 0.02,
  /** Nombre de sacs de béton de 35 kg par poteau scellé */
  SACS_BETON_35KG_PAR_POTEAU: 2,
  /** Seuil d'alerte de chute en % */
  SEUIL_ALERTE_CHUTE_PCT: 15,
  /** Hauteur standard d'un redan en escalier : 0.15 m */
  PAS_REDAN_STANDARD_M: 0.15,
} as const;

export interface FenceSegmentsLengths {
  A: number;
  B: number;
  C: number;
  D?: number;
}

export interface PortillonConfig {
  segment: SegmentId;
  largeurM: number;
  positionM?: number;
  hauteurM?: number;
}

export interface FenceConfig {
  forme: FenceShape;
  segments: FenceSegmentsLengths;
  hauteurUtile: number;
  materiau: FenceMaterial;
  longueurLameBrute: number;
  hauteurLame: number;
  extremites: FenceEndsConfig;
  typePoseSol: FenceGroundType;
  presenceSoubassement?: boolean;
  hauteurSoubassementM?: number;
  gestionPente?: GestionPenteType;
  denivelesSegments?: Partial<Record<SegmentId, number>>;
  portillons?: PortillonConfig[];
}

export interface SegmentResult {
  id: SegmentId;
  label: string;
  fullLabel: string;
  orientation: string;
  accentHex: string;
  longueurSegment: number;
  longueurPortillonsM: number;
  longueurClotureUtileM: number;
  nbPortillonsSegment: number;
  porteeMax: number;
  nbTraveesSegment: number;
  largeurTraveeAxe: number;
  largeurLibre: number;
  longueurCoupeLame: number;
  nbPoteauxIntermediaires: number;
  nbLamesParTravee: number;
  nbLamesSegment: number;
  nbPlaquesSoubassementSegment: number;
  deniveleM: number;
  nbRedansSegment: number;
  pasRedanM: number;
  surcoteMaxPoteauM: number;
  chuteParLameM: number;
  tauxChuteSegmentPct: number;
  departType: PostExtremityType;
  arriveeType: PostExtremityType;
}

export interface FenceResult {
  config: Required<Omit<FenceConfig, "segments" | "denivelesSegments" | "portillons">> & {
    segments: Required<FenceSegmentsLengths>;
    denivelesSegments: Partial<Record<SegmentId, number>>;
    portillons: PortillonConfig[];
  };
  segmentsActifs: SegmentResult[];
  isClosedLoop: boolean;
  lineaireTotalM: number;
  lineaireClotureHorsPortillonsM: number;
  porteeMaxRetenueM: number;
  nbTraveesTotal: number;
  nbPoteauxAngle: number;
  nbPoteauxIntermediaires: number;
  nbPoteauxBoutStandards: number;
  nbPoteauxDroitsTotal: number;
  nbDemiPoteauxMuraux: number;
  nbPoteauxPortillon: number;
  totalPoteauxComplets: number;
  longueurCommandePoteauM: number;
  surcoteMaxPoteauRedanM: number;
  nbPlatines: number;
  nbSacsBeton35kg: number;
  nbPlaquesSoubassement: number;
  hauteurSoubassementRetenueM: number;
  hauteurLamesUtileM: number;
  nbPortillonsTotal: number;
  nbRedansTotal: number;
  nbLamesParTravee: number;
  nbTotalLames: number;
  longueurTotaleLamesBrutesM: number;
  longueurTotaleLamesCoupeM: number;
  chuteTotaleM: number;
  tauxChuteGlobalPct: number;
  alerteChuteElevee: boolean;
}

export function getActiveSegmentIds(forme: FenceShape): SegmentId[] {
  switch (forme) {
    case "DROITE":
      return ["A"];
    case "EN_L":
      return ["A", "B"];
    case "EN_U":
      return ["A", "B", "C"];
    case "4_COTES":
      return ["A", "B", "C", "D"];
  }
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function calculateFenceLayout(rawConfig: FenceConfig): FenceResult {
  const longueurLameBrute = clampNumber(
    rawConfig.longueurLameBrute,
    FENCE_CONSTANTS.LAME_BRUTE_MIN_M,
    FENCE_CONSTANTS.LAME_BRUTE_MAX_M
  );
  const hauteurUtile = Math.max(
    0.4,
    Number.isFinite(rawConfig.hauteurUtile) ? rawConfig.hauteurUtile : 1.8
  );
  const hauteurLame = Math.max(
    0.05,
    Number.isFinite(rawConfig.hauteurLame) ? rawConfig.hauteurLame : 0.15
  );

  const presenceSoubassement = Boolean(rawConfig.presenceSoubassement);
  const hauteurSoubassementRetenueM = presenceSoubassement
    ? clampNumber(rawConfig.hauteurSoubassementM ?? 0.25, 0.2, 0.5)
    : 0;
  const hauteurLamesUtileM = Math.max(0.2, hauteurUtile - hauteurSoubassementRetenueM);
  const gestionPente: GestionPenteType = rawConfig.gestionPente ?? "PLAT";
  const denivelesSegments = rawConfig.denivelesSegments ?? {};
  const portillons = Array.isArray(rawConfig.portillons) ? rawConfig.portillons : [];

  const normalizedSegments: Required<FenceSegmentsLengths> = {
    A: Math.max(0.5, Number.isFinite(rawConfig.segments.A) ? rawConfig.segments.A : 12.5),
    B: Math.max(0.5, Number.isFinite(rawConfig.segments.B) ? rawConfig.segments.B : 8.0),
    C: Math.max(0.5, Number.isFinite(rawConfig.segments.C) ? rawConfig.segments.C : 12.5),
    D: Math.max(
      0.5,
      Number.isFinite(rawConfig.segments.D ?? NaN)
        ? (rawConfig.segments.D as number)
        : Number.isFinite(rawConfig.segments.B)
          ? rawConfig.segments.B
          : 8.0
    ),
  };

  const config = {
    ...rawConfig,
    longueurLameBrute,
    hauteurUtile,
    hauteurLame,
    presenceSoubassement,
    hauteurSoubassementM: hauteurSoubassementRetenueM,
    gestionPente,
    segments: normalizedSegments,
    denivelesSegments,
    portillons,
  };

  const activeIds = getActiveSegmentIds(config.forme);
  const isClosedLoop = config.forme === "4_COTES" && config.extremites === "LIBRE";
  const porteeMax = Math.min(FENCE_CONSTANTS.PORTEE_MAX_ABSOLUE_M, config.longueurLameBrute);
  const nbLamesParTravee = Math.ceil(hauteurLamesUtileM / config.hauteurLame);

  const segmentsActifs: SegmentResult[] = activeIds.map((segId, index) => {
    const meta = SEGMENT_METADATA[segId];
    const longueurSegment = config.segments[segId];
    const portillonsSeg = portillons.filter((p) => p.segment === segId && p.largeurM > 0);
    const longueurPortillonsM = Math.min(
      longueurSegment - 0.3,
      portillonsSeg.reduce((sum, p) => sum + p.largeurM, 0)
    );
    const longueurClotureUtileM = Math.max(0, longueurSegment - Math.max(0, longueurPortillonsM));
    const nbPortillonsSegment = portillonsSeg.length;

    const nbTraveesSegment =
      longueurClotureUtileM > 0
        ? Math.max(1, Math.ceil(longueurClotureUtileM / porteeMax))
        : 0;
    const largeurTraveeAxe =
      nbTraveesSegment > 0 ? longueurClotureUtileM / nbTraveesSegment : 0;

    const largeurLibre = Math.max(0, largeurTraveeAxe - FENCE_CONSTANTS.SECTION_POTEAU_M);
    const longueurCoupeLame =
      nbTraveesSegment > 0
        ? Math.max(
            0,
            largeurLibre +
              2 * FENCE_CONSTANTS.PROFONDEUR_FEUILLURE_M -
              FENCE_CONSTANTS.JEU_DILATATION_M
          )
        : 0;

    const nbPoteauxIntermediaires = Math.max(0, nbTraveesSegment - 1);
    const nbLamesSegment = nbTraveesSegment * nbLamesParTravee;
    const nbPlaquesSoubassementSegment = presenceSoubassement ? nbTraveesSegment : 0;
    const chuteParLameM =
      nbTraveesSegment > 0 ? Math.max(0, config.longueurLameBrute - longueurCoupeLame) : 0;
    const tauxChuteSegmentPct =
      config.longueurLameBrute > 0 && nbTraveesSegment > 0
        ? (chuteParLameM / config.longueurLameBrute) * 100
        : 0;

    const deniveleM = gestionPente === "PLAT" ? 0 : Number(denivelesSegments[segId] ?? 0) || 0;
    const absDenivele = Math.abs(deniveleM);
    const nbRedansSegment =
      gestionPente === "REDANS" && absDenivele > 0 && nbTraveesSegment > 1
        ? nbTraveesSegment - 1
        : 0;
    const pasRedanM =
      nbRedansSegment > 0 ? absDenivele / nbTraveesSegment : 0;
    const surcoteMaxPoteauM =
      gestionPente === "REDANS" ? pasRedanM : gestionPente === "SUIVI_PENTE" ? absDenivele * 0.05 : 0;

    const isFirstSegment = index === 0;
    const isLastSegment = index === activeIds.length - 1;

    let departType: PostExtremityType = "ANGLE";
    let arriveeType: PostExtremityType = "ANGLE";

    if (isClosedLoop) {
      departType = "ANGLE";
      arriveeType = "ANGLE";
    } else {
      if (isFirstSegment) {
        departType =
          config.extremites === "DEPART_MUR" || config.extremites === "ENTRE_MURS"
            ? "DEMI_MURAL"
            : "TERMINAISON";
      }
      if (isLastSegment) {
        arriveeType = config.extremites === "ENTRE_MURS" ? "DEMI_MURAL" : "TERMINAISON";
      }
    }

    return {
      id: segId,
      label: meta.shortLabel,
      fullLabel: meta.fullLabel,
      orientation: meta.orientation,
      accentHex: meta.accentHex,
      longueurSegment,
      longueurPortillonsM: Math.max(0, longueurPortillonsM),
      longueurClotureUtileM,
      nbPortillonsSegment,
      porteeMax,
      nbTraveesSegment,
      largeurTraveeAxe,
      largeurLibre,
      longueurCoupeLame,
      nbPoteauxIntermediaires,
      nbLamesParTravee,
      nbLamesSegment,
      nbPlaquesSoubassementSegment,
      deniveleM,
      nbRedansSegment,
      pasRedanM,
      surcoteMaxPoteauM,
      chuteParLameM,
      tauxChuteSegmentPct,
      departType,
      arriveeType,
    };
  });

  const nbPoteauxIntermediaires = segmentsActifs.reduce(
    (acc, seg) => acc + seg.nbPoteauxIntermediaires,
    0
  );

  let nbPoteauxAngle = 0;
  let nbPoteauxBoutStandards = 0;
  let nbDemiPoteauxMuraux = 0;

  if (config.forme === "4_COTES") {
    if (config.extremites === "LIBRE") {
      nbPoteauxAngle = 4;
      nbPoteauxBoutStandards = 0;
      nbDemiPoteauxMuraux = 0;
    } else if (config.extremites === "DEPART_MUR") {
      nbPoteauxAngle = 3;
      nbPoteauxBoutStandards = 1;
      nbDemiPoteauxMuraux = 1;
    } else {
      nbPoteauxAngle = 3;
      nbPoteauxBoutStandards = 0;
      nbDemiPoteauxMuraux = 2;
    }
  } else {
    nbPoteauxAngle =
      config.forme === "DROITE" ? 0 : config.forme === "EN_L" ? 1 : 2;

    if (config.extremites === "LIBRE") {
      nbPoteauxBoutStandards = 2;
      nbDemiPoteauxMuraux = 0;
    } else if (config.extremites === "DEPART_MUR") {
      nbPoteauxBoutStandards = 1;
      nbDemiPoteauxMuraux = 1;
    } else {
      nbPoteauxBoutStandards = 0;
      nbDemiPoteauxMuraux = 2;
    }
  }

  const nbPortillonsTotal = segmentsActifs.reduce((acc, s) => acc + s.nbPortillonsSegment, 0);
  const nbPoteauxPortillon = nbPortillonsTotal * 2;
  const nbPoteauxDroitsTotal =
    nbPoteauxIntermediaires + nbPoteauxBoutStandards + nbPoteauxPortillon;
  const totalPoteauxComplets =
    nbPoteauxIntermediaires + nbPoteauxAngle + nbPoteauxBoutStandards + nbPoteauxPortillon;

  const surcoteMaxPoteauRedanM = segmentsActifs.reduce(
    (max, s) => Math.max(max, s.surcoteMaxPoteauM),
    0
  );

  const longueurCommandePoteauM =
    (config.typePoseSol === "DIRECT_SOL"
      ? config.hauteurUtile + FENCE_CONSTANTS.GARDE_SCELLEMENT_SOL_M
      : config.hauteurUtile + FENCE_CONSTANTS.GARDE_PLATINE_MURET_M) +
    surcoteMaxPoteauRedanM;

  const nbPlatines = config.typePoseSol === "SUR_MURET" ? totalPoteauxComplets : 0;
  const nbSacsBeton35kg =
    config.typePoseSol === "DIRECT_SOL"
      ? totalPoteauxComplets * FENCE_CONSTANTS.SACS_BETON_35KG_PAR_POTEAU
      : 0;

  const nbTraveesTotal = segmentsActifs.reduce((acc, seg) => acc + seg.nbTraveesSegment, 0);
  const nbTotalLames = nbTraveesTotal * nbLamesParTravee;
  const nbPlaquesSoubassement = segmentsActifs.reduce(
    (acc, seg) => acc + seg.nbPlaquesSoubassementSegment,
    0
  );
  const nbRedansTotal = segmentsActifs.reduce((acc, seg) => acc + seg.nbRedansSegment, 0);
  const lineaireTotalM = segmentsActifs.reduce((acc, seg) => acc + seg.longueurSegment, 0);
  const lineaireClotureHorsPortillonsM = segmentsActifs.reduce(
    (acc, seg) => acc + seg.longueurClotureUtileM,
    0
  );

  const longueurTotaleLamesBrutesM = nbTotalLames * config.longueurLameBrute;
  const longueurTotaleLamesCoupeM = segmentsActifs.reduce(
    (acc, seg) => acc + seg.nbLamesSegment * seg.longueurCoupeLame,
    0
  );
  const chuteTotaleM = Math.max(0, longueurTotaleLamesBrutesM - longueurTotaleLamesCoupeM);
  const tauxChuteGlobalPct =
    longueurTotaleLamesBrutesM > 0
      ? (chuteTotaleM / longueurTotaleLamesBrutesM) * 100
      : 0;

  const alerteChuteElevee = tauxChuteGlobalPct > FENCE_CONSTANTS.SEUIL_ALERTE_CHUTE_PCT;

  return {
    config,
    segmentsActifs,
    isClosedLoop,
    lineaireTotalM,
    lineaireClotureHorsPortillonsM,
    porteeMaxRetenueM: porteeMax,
    nbTraveesTotal,
    nbPoteauxAngle,
    nbPoteauxIntermediaires,
    nbPoteauxBoutStandards,
    nbPoteauxDroitsTotal,
    nbDemiPoteauxMuraux,
    nbPoteauxPortillon,
    totalPoteauxComplets,
    longueurCommandePoteauM,
    surcoteMaxPoteauRedanM,
    nbPlatines,
    nbSacsBeton35kg,
    nbPlaquesSoubassement,
    hauteurSoubassementRetenueM,
    hauteurLamesUtileM,
    nbPortillonsTotal,
    nbRedansTotal,
    nbLamesParTravee,
    nbTotalLames,
    longueurTotaleLamesBrutesM,
    longueurTotaleLamesCoupeM,
    chuteTotaleM,
    tauxChuteGlobalPct,
    alerteChuteElevee,
  };
}
