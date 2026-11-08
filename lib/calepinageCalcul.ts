// lib/calepinageCalcul.ts
// Moteur d'Optimisation de Découpe, Calepinage & Nesting 2D (Panneaux & Bardage)
//
// Architecture Métier BNA Bardage :
// 1. MODULES POSÉS (Façade & Pignons) :
//    - Trame architecturale en modules finis (ex: 1000 × 600 mm, 1200 × 800 mm).
//    - Découpe symétrique des rives et gestion automatique des rampants de pignons.
//    - Chaque panneau reçoit un repère unique (ex: M-01, R-01 pour rive, P-01 pour pignon).
//
// 2. IMBRICATION & DÉBIT D'ATELIER (Nesting 2D Guillotine) :
//    - Répartition optimisée des modules sur les plaques brutes d'achat (ex: 3050 × 1300 mm).
//    - Couplage tête-bêche des pièces de pignon compatibles (trapèzes / triangles rectangles).
//    - Détection intelligente des chutes :
//      * Chutes réutilisables (longueur >= 800 mm ou surface >= 0.30 m²) pour tableaux de fenêtres ou départs.
//      * Pertes réelles / sciure.
//    - Taux de chute net réel calculé précisément.

import {
  LIMITE_DTU_MM,
  RIVE_MIN_MM,
  DEFAULT_MIN_RIVE_WIDTH_MM,
  MIN_RIVE_WIDTH,
  decoupageModulesCentres,
} from "./poseCalcul";

export { LIMITE_DTU_MM, RIVE_MIN_MM, DEFAULT_MIN_RIVE_WIDTH_MM, MIN_RIVE_WIDTH };
export type SensPose = "horizontal" | "vertical";

export interface CalepinageInput {
  zoneLargeurM: number;
  zoneHauteurM: number;
  plaqueLongueurMm?: number | null;
  plaqueLargeurMm?: number | null;
  moduleLargeurMm?: number | null;
  moduleHauteurMm?: number | null;
  sensPose?: SensPose | null;
  estPignon?: boolean;
  hauteurFaiteM?: number | null;
  traitDeScieMm?: number | null;
  /**
   * Autorise le pivot à 90° des pièces lors du nesting sur plaque brute.
   * `true` (défaut) : optimisation de matière maximale, adapté aux décors NON-directionnels (uni, granit…).
   * `false` : interdit le pivot — obligatoire pour les décors directionnels (bois veiné, métal brossé…)
   *            afin que le plan de débit atelier respecte le sens de fibre.
   * Non persisté en BDD : à re-sélectionner si le matériau change.
   */
  autoriserRotation?: boolean;
  /**
   * Largeur minimale d'une pièce de rive en mm (règle anti-micro-plaques).
   * Seuil de référence : MIN_RIVE_WIDTH = 250 mm (ou 150 mm par défaut historique si non spécifié).
   */
  minRiveWidthMm?: number | null;
  minRiveWidth?: number | null;
  /**
   * Active la règle anti-micro-plaques sur les pièces de pignon (P-xx) et rampants.
   * Activé par défaut dès que `minRiveWidthMm` ou `minRiveWidth` est spécifié.
   */
  antiMicroPignon?: boolean;
}

export interface PointCalepinage {
  xM: number;
  yM: number;
}

export interface PignonDetails {
  hLeftMm: number;
  hRightMm: number;
  hPeakMm: number;
  cutWidthMm: number;
  cutHeightMm: number;
  includesRidge: boolean;
  xReal1M: number;
  xReal2M: number;
}

export interface PieceCalepinage {
  id: string;
  repere: string;
  colonne: number;
  rangee: number;
  xM: number;
  yM: number;
  largeurM: number;
  hauteurM: number;
  type: "pleine" | "coupe" | "pignon";
  surfaceM2: number;
  points?: PointCalepinage[];
  plaqueIndex?: number;
  pignonDetails?: PignonDetails;
  coupleAvec?: PieceCoupleeRef;
}

export interface PieceCoupleeRef {
  id: string;
  repere: string;
  nom: string;
  surfaceM2: number;
  colonne: number;
  rangee: number;
  pignonDetails?: PignonDetails;
}

export interface DecoupePiece {
  id: string;
  repere: string;
  nom: string;
  xMm: number;
  yMm: number;
  largeurMm: number;
  hauteurMm: number;
  surfaceM2: number;
  type: "pleine" | "coupe" | "pignon";
  colonne: number;
  rangee: number;
  pignonDetails?: PignonDetails;
  coupleAvec?: PieceCoupleeRef;
  isRotated?: boolean;
}

export interface PairedGableBlock {
  id: string;
  pieceA: PieceCalepinage;
  pieceB: PieceCalepinage;
  largeurMm: number;
  hauteurMm: number;
  hCombinedMm: number;
  kerfMm: number;
}

export interface ChutePlaque {
  id: string;
  xMm: number;
  yMm: number;
  largeurMm: number;
  hauteurMm: number;
  surfaceM2: number;
  reutilisable: boolean;
  motif: string;
}

export interface PlaqueDebit {
  index: number;
  longueurMm: number;
  largeurMm: number;
  surfaceM2: number;
  pieces: DecoupePiece[];
  chutes: ChutePlaque[];
  surfaceUtileM2: number;
  surfaceChutesM2: number;
  surfaceChutesReutilisablesM2: number;
  tauxRendementPct: number;
}

export interface ResultatCalepinage {
  colonnesLargeursM: number[];
  rangeesHauteursM: number[];
  pieces: PieceCalepinage[];
  nbPlaquesNecessaires: number;
  nbPiecesPosees: number;
  surfaceZoneM2: number;
  surfacePlaquesAchetesM2: number;
  tauxChuteBrutePct: number;
  tauxChuteNettePct: number;
  tauxChutePct: number;
  totalChutesReutilisablesM2: number;
  totalDechetsPerteM2: number;
  nbJoints: number;
  estPignon: boolean;
  hauteurFaiteM: number;
  /** Hauteur à l'égout du mur (m) */
  hauteurMurM?: number;
  pentePct: number;
  plaqueBruteLongueurMm: number;
  plaqueBruteLargeurMm: number;
  moduleCibleLargeurMm: number;
  moduleCibleHauteurMm: number;
  modulesParPlaqueBrute: number;
  plaquesDebit: PlaqueDebit[];
  entraxeReelMm: number;
  /** Pièces dont aucune orientation ne rentre dans le format de plaque brute (Faille 1). */
  piecesIncompatibles?: PieceIncompatible[];
  /** Nombre de pièces de pignon couplées tête-bêche */
  nbPiecesCouplees?: number;
  /** Nombre de blocs combinés issus du couplage */
  nbBlocsCouples?: number;
  /** Seuil de largeur minimale de rive appliqué (mm, anti-micro-plaques) */
  minRiveWidthMm?: number;
  /** Règle anti-micro-plaques appliquée aux pièces de pignon */
  antiMicroPignon?: boolean;
}

/**
 * Pièce dont les dimensions dépassent le format de plaque brute dans toutes les orientations.
 * Le moteur ne génère PAS de plan de coupe impossible pour ces pièces.
 */
export interface PieceIncompatible {
  repere: string;
  largeurMm: number;
  hauteurMm: number;
  raison: string;
}

const EPSILON_M = 0.0005;

export function calculerEntraxeReel(largeurModuleMm: number): number {
  const dimension = Math.max(1, largeurModuleMm);
  const nombreEspaces = Math.ceil(dimension / LIMITE_DTU_MM);
  return dimension / nombreEspaces;
}

/**
 * Calepinage ESTHÉTIQUE des colonnes HPL avec règle anti-micro-plaques :
 *  - le mur est centré en plaques ENTIÈRES de `moduleMm` (largeur physique),
 *  - riveGauche = riveDroite (symétrie absolue depuis l'axe du mur),
 *  - si une rive < minRiveMm, une plaque est retirée pour élargir les rives (absorption/fusion),
 *  - si nModules === 1 et que la rive reste inférieure au seuil minimal, le mur
 *    est divisé en 2 plaques symétriques (anti-micro-plaques).
 * Ici les plaques gardent leur VRAIE largeur de saisie : les chevrons
 * intermédiaires (entraxe) sont générés séparément dans l'ossature.
 */
export function axeSymetrique(
  largeurM: number,
  moduleMm: number,
  minRiveMm: number = RIVE_MIN_MM
): number[] {
  const largeurMm = Math.round(largeurM * 1000);
  const moduleSizeMm = Math.max(1, Math.round(moduleMm));
  const minRive = Math.max(0, Math.round(minRiveMm));

  if (largeurMm <= 0) return [0];
  if (largeurMm < moduleSizeMm) return [largeurMm / 1000];

  const { nModules, riveMm } = decoupageModulesCentres(largeurMm, moduleSizeMm, minRive);
  if (nModules === 0) {
    if (riveMm > 0 && largeurMm >= 2 * minRive) {
      const r1 = Math.round(riveMm) / 1000;
      const r2 = Math.round(largeurMm - Math.round(riveMm)) / 1000;
      return [r1, r2];
    }
    return [largeurMm / 1000];
  }

  const riveM = Math.round(riveMm) / 1000;
  const moduleM = moduleSizeMm / 1000;

  const colonnes: number[] = [];
  if (riveM > 0.005) colonnes.push(riveM);
  for (let i = 0; i < nModules; i++) colonnes.push(moduleM);
  if (riveM > 0.005) colonnes.push(riveM);

  // Sécurité d'ajustement du cumul exact
  const sum = colonnes.reduce((a, b) => a + b, 0);
  const diff = Math.round((largeurM - sum) * 1000) / 1000;
  if (Math.abs(diff) >= 0.001 && colonnes.length > 0) {
    colonnes[colonnes.length - 1] = Math.round((colonnes[colonnes.length - 1] + diff) * 1000) / 1000;
  }

  return colonnes;
}

/**
 * Calepinage en hauteur selon le module cible :
 * Découpe la hauteur totale en rangées régulières proches du module cible.
 */
function axeEquivalent(dimTotaleM: number, dimModuleMm: number): number[] {
  const dimModuleM = Math.max(0.1, dimModuleMm / 1000);
  if (dimTotaleM <= 0) return [0];

  const n = Math.max(1, Math.round(dimTotaleM / dimModuleM));
  const h = dimTotaleM / n;
  return Array(n).fill(h);
}

/**
 * Aire d'un polygone 2D.
 */
function airePolygone(points: PointCalepinage[]): number {
  if (points.length < 3) return 0;
  let somme = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    somme += a.xM * b.yM - b.xM * a.yM;
  }
  return Math.abs(somme) / 2;
}

/**
 * Découpe d'un polygone par un demi-plan (Sutherland-Hodgman).
 */
function clipHalfPlane(
  points: PointCalepinage[],
  a: number,
  b: number,
  c: number
): PointCalepinage[] {
  if (points.length === 0) return [];

  const result: PointCalepinage[] = [];
  const inside = (p: PointCalepinage) => a * p.xM + b * p.yM <= c + EPSILON_M;

  const intersection = (s: PointCalepinage, e: PointCalepinage) => {
    const ds = a * s.xM + b * s.yM - c;
    const de = a * e.xM + b * e.yM - c;
    const denom = ds - de;
    if (Math.abs(denom) < 1e-12) return e;
    const t = ds / denom;
    return {
      xM: s.xM + (e.xM - s.xM) * t,
      yM: s.yM + (e.yM - s.yM) * t,
    };
  };

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const currentInside = inside(current);
    const nextInside = inside(next);

    if (currentInside && nextInside) {
      result.push(next);
    } else if (currentInside && !nextInside) {
      result.push(intersection(current, next));
    } else if (!currentInside && nextInside) {
      result.push(intersection(current, next));
      result.push(next);
    }
  }

  return result;
}

/**
 * Découpe un module par les deux pentes d'un pignon symétrique.
 */
function decouperParPignon(
  rectangle: PointCalepinage[],
  largeurM: number,
  hauteurMurM: number,
  hauteurFaiteM: number
): PointCalepinage[] {
  const delta = Math.max(0, hauteurFaiteM - hauteurMurM);
  if (delta <= EPSILON_M || largeurM <= 0) return rectangle;

  const pente = (2 * delta) / largeurM;

  // Rampant gauche (-pente*x + y <= Hmur)
  let clipped = clipHalfPlane(rectangle, -pente, 1, hauteurMurM);
  if (clipped.length < 3) return [];

  // Rampant droit (pente*x + y <= Hmur + pente*L)
  clipped = clipHalfPlane(clipped, pente, 1, hauteurMurM + pente * largeurM);
  if (clipped.length < 3) return [];

  return clipped;
}

/**
 * Hauteur exacte du toit à l'abscisse x pour un pignon symétrique.
 */
export function getHauteurToit(x: number, wallWidth: number, hMur: number, hFaite: number): number {
  if (wallWidth <= 0 || hFaite <= hMur) return hMur;
  const ridgeX = wallWidth / 2;
  const delta = hFaite - hMur;
  if (x <= ridgeX) {
    return hMur + (x / ridgeX) * delta;
  } else {
    return hMur + ((wallWidth - x) / (wallWidth - ridgeX)) * delta;
  }
}

/**
 * Règle Anti-Micro-Plaques pour les Pignons et Rampants :
 * Élimine toute pièce P-xx dont la largeur utile ou la hauteur de rive
 * est inférieure au seuil minimal configuré (ex: 250 mm).
 * Absorbe les micro-pointes et micro-chutes dans la pièce de la rangée
 * inférieure ou la pièce adjacente horizontale, y compris au faîtage.
 */
export function fusionnerMicroPiecesPignon(
  piecesInput: PieceCalepinage[],
  largeur: number,
  hauteurMur: number,
  hauteurFaite: number,
  minDimMm: number,
  maxPanelHeightM = 3.05
): PieceCalepinage[] {
  const pieces = [...piecesInput];
  const ridgeX = largeur / 2;
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 30) {
    changed = false;
    iterations++;

    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      if (p.type !== "pignon") continue;

      const wMm = p.pignonDetails?.cutWidthMm ?? Math.round(p.largeurM * 1000);
      const hMm = p.pignonDetails?.cutHeightMm ?? Math.round(p.hauteurM * 1000);
      const hL = p.pignonDetails?.hLeftMm ?? 0;
      const hR = p.pignonDetails?.hRightMm ?? 0;

      const isMicroWidth = wMm < minDimMm;
      const isMicroHeight = hMm < minDimMm;
      const isMicroSide = Math.min(hL, hR) < minDimMm;

      if (isMicroWidth || isMicroHeight || isMicroSide) {
        // 1. Chercher pièce sous-jacente dans la même colonne
        const below = pieces.find(
          (b) =>
            b !== p &&
            b.colonne === p.colonne &&
            b.yM < p.yM &&
            Math.abs(b.yM + b.hauteurM - p.yM) <= 0.015
        );

        if (below) {
          const x1 = Math.min(below.xM, p.xM);
          const x2 = Math.max(below.xM + below.largeurM, p.xM + p.largeurM);
          const y1 = below.yM;
          const y2 = p.yM + p.hauteurM;

          if (y2 - y1 <= maxPanelHeightM) {
            const rect: PointCalepinage[] = [
              { xM: x1, yM: y1 },
              { xM: x2, yM: y1 },
              { xM: x2, yM: y2 },
              { xM: x1, yM: y2 },
            ];
            const clipped = decouperParPignon(rect, largeur, hauteurMur, hauteurFaite);
            const surfaceM2 = airePolygone(clipped);

            const z1 = getHauteurToit(x1, largeur, hauteurMur, hauteurFaite);
            const z2 = getHauteurToit(x2, largeur, hauteurMur, hauteurFaite);
            const incRidge = x1 < ridgeX - 1e-4 && x2 > ridgeX + 1e-4;
            const newHL = Math.max(0, Math.min(y2 - y1, z1 - y1));
            const newHR = Math.max(0, Math.min(y2 - y1, z2 - y1));
            const newHP = incRidge ? Math.max(0, Math.min(y2 - y1, hauteurFaite - y1)) : 0;
            const cutW = Math.round((x2 - x1) * 1000);
            const cutH = Math.round(Math.max(newHL, newHR, newHP) * 1000);

            below.xM = x1;
            below.yM = y1;
            below.largeurM = cutW / 1000;
            below.hauteurM = cutH / 1000;
            below.surfaceM2 = surfaceM2;
            below.points = clipped.length >= 3 ? clipped : below.points;
            below.type = "pignon";
            below.pignonDetails = {
              hLeftMm: Math.round(newHL * 1000),
              hRightMm: Math.round(newHR * 1000),
              hPeakMm: Math.round(newHP * 1000),
              cutWidthMm: cutW,
              cutHeightMm: cutH,
              includesRidge: incRidge,
              xReal1M: x1,
              xReal2M: x2,
            };

            pieces.splice(i, 1);
            changed = true;
            break;
          }
        }

        // 2. Si pas de pièce dessous ou limite hauteur atteinte, chercher adjacent horizontalement
        const adj = pieces.find(
          (a) =>
            a !== p &&
            a.rangee === p.rangee &&
            (Math.abs(a.xM + a.largeurM - p.xM) <= 0.015 || Math.abs(p.xM + p.largeurM - a.xM) <= 0.015)
        );

        if (adj) {
          const x1 = Math.min(adj.xM, p.xM);
          const x2 = Math.max(adj.xM + adj.largeurM, p.xM + p.largeurM);
          const y1 = Math.min(adj.yM, p.yM);
          const y2 = Math.max(adj.yM + adj.hauteurM, p.yM + p.hauteurM);

          const rect: PointCalepinage[] = [
            { xM: x1, yM: y1 },
            { xM: x2, yM: y1 },
            { xM: x2, yM: y2 },
            { xM: x1, yM: y2 },
          ];
          const clipped = decouperParPignon(rect, largeur, hauteurMur, hauteurFaite);
          const surfaceM2 = airePolygone(clipped);

          const z1 = getHauteurToit(x1, largeur, hauteurMur, hauteurFaite);
          const z2 = getHauteurToit(x2, largeur, hauteurMur, hauteurFaite);
          const incRidge = x1 < ridgeX - 1e-4 && x2 > ridgeX + 1e-4;
          const newHL = Math.max(0, Math.min(y2 - y1, z1 - y1));
          const newHR = Math.max(0, Math.min(y2 - y1, z2 - y1));
          const newHP = incRidge ? Math.max(0, Math.min(y2 - y1, hauteurFaite - y1)) : 0;
          const cutW = Math.round((x2 - x1) * 1000);
          const cutH = Math.round(Math.max(newHL, newHR, newHP) * 1000);

          adj.xM = x1;
          adj.yM = y1;
          adj.largeurM = cutW / 1000;
          adj.hauteurM = cutH / 1000;
          adj.surfaceM2 = surfaceM2;
          adj.points = clipped.length >= 3 ? clipped : adj.points;
          adj.type = "pignon";
          adj.pignonDetails = {
            hLeftMm: Math.round(newHL * 1000),
            hRightMm: Math.round(newHR * 1000),
            hPeakMm: Math.round(newHP * 1000),
            cutWidthMm: cutW,
            cutHeightMm: cutH,
            includesRidge: incRidge,
            xReal1M: x1,
            xReal2M: x2,
          };

          pieces.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
  }

  // Renumérotation propre des repères
  let pIndex = 1;
  const pignonPieces = pieces.filter((p) => p.type === "pignon").sort((a, b) => a.yM - b.yM || a.xM - b.xM);
  for (const pp of pignonPieces) {
    pp.repere = `P-${String(pIndex++).padStart(2, "0")}`;
  }

  let mIndex = 1;
  let rIndex = 1;
  const rectPieces = pieces.filter((p) => p.type !== "pignon").sort((a, b) => a.rangee - b.rangee || a.colonne - b.colonne);
  for (const rp of rectPieces) {
    if (rp.type === "pleine") rp.repere = `M-${String(mIndex++).padStart(2, "0")}`;
    else rp.repere = `R-${String(rIndex++).padStart(2, "0")}`;
  }

  return pieces;
}

/**
 * Couplage tête-bêche des pièces de pignon (trapèzes et triangles rectangles).
 * Associe deux pièces de même largeur pour partager une diagonale de coupe
 * et diviser par deux la hauteur consommée dans la plaque brute.
 */
function couplerPiecesPignon(
  pieces: PieceCalepinage[],
  rawH: number,
  rawL: number,
  autoriserRotation = true
): {
  coupledBlocks: PairedGableBlock[];
  pairedPieceIds: Set<string>;
} {
  const eligible = pieces.filter(
    (p) =>
      p.type === "pignon" &&
      p.pignonDetails &&
      !p.pignonDetails.includesRidge &&
      p.pignonDetails.cutWidthMm > 0 &&
      p.pignonDetails.cutHeightMm > 0
  );

  const pairedPieceIds = new Set<string>();
  const coupledBlocks: PairedGableBlock[] = [];
  const KERF_MM = 10;

  // Tri par hauteur décroissante
  eligible.sort(
    (a, b) =>
      (b.pignonDetails?.cutHeightMm ?? 0) - (a.pignonDetails?.cutHeightMm ?? 0) ||
      (b.pignonDetails?.cutWidthMm ?? 0) - (a.pignonDetails?.cutWidthMm ?? 0)
  );

  for (let i = 0; i < eligible.length; i++) {
    const pieceA = eligible[i];
    if (pairedPieceIds.has(pieceA.id)) continue;
    const detA = pieceA.pignonDetails!;

    const hMinA = Math.min(detA.hLeftMm, detA.hRightMm);
    const hMaxA = Math.max(detA.hLeftMm, detA.hRightMm);

    let bestJ = -1;
    let bestSavings = -1;
    let bestHCombined = 0;

    for (let j = 0; j < eligible.length; j++) {
      if (i === j) continue;
      const pieceB = eligible[j];
      if (pairedPieceIds.has(pieceB.id)) continue;
      const detB = pieceB.pignonDetails!;

      // Tolérance largeur ± 2 mm
      if (Math.abs(detA.cutWidthMm - detB.cutWidthMm) > 2) continue;

      const hMinB = Math.min(detB.hLeftMm, detB.hRightMm);
      const hMaxB = Math.max(detB.hLeftMm, detB.hRightMm);

      const hCombined = Math.max(hMaxA + hMinB, hMinA + hMaxB) + KERF_MM;
      const separateSum = detA.cutHeightMm + detB.cutHeightMm;

      // Condition de validation : H_combined < (cutHeightA + cutHeightB)
      if (hCombined >= separateSum) continue;

      // Condition de dimensionnement par rapport à la plaque brute
      const wCombined = Math.max(detA.cutWidthMm, detB.cutWidthMm);
      const fitsNormal = wCombined <= rawL && hCombined <= rawH;
      const fitsRotated = autoriserRotation && wCombined <= rawH && hCombined <= rawL;

      if (!fitsNormal && !fitsRotated) continue;

      const savings = separateSum - hCombined;
      if (savings > bestSavings) {
        bestSavings = savings;
        bestJ = j;
        bestHCombined = hCombined;
      }
    }

    if (bestJ !== -1) {
      const pieceB = eligible[bestJ];
      pairedPieceIds.add(pieceA.id);
      pairedPieceIds.add(pieceB.id);

      pieceA.coupleAvec = {
        id: pieceB.id,
        repere: pieceB.repere,
        nom: pieceB.pignonDetails
          ? `${pieceB.repere} (${pieceB.pignonDetails.cutWidthMm}×${pieceB.pignonDetails.hLeftMm}/${pieceB.pignonDetails.hRightMm})`
          : pieceB.repere,
        surfaceM2: pieceB.surfaceM2,
        colonne: pieceB.colonne,
        rangee: pieceB.rangee,
        pignonDetails: pieceB.pignonDetails,
      };

      pieceB.coupleAvec = {
        id: pieceA.id,
        repere: pieceA.repere,
        nom: pieceA.pignonDetails
          ? `${pieceA.repere} (${pieceA.pignonDetails.cutWidthMm}×${pieceA.pignonDetails.hLeftMm}/${pieceA.pignonDetails.hRightMm})`
          : pieceA.repere,
        surfaceM2: pieceA.surfaceM2,
        colonne: pieceA.colonne,
        rangee: pieceA.rangee,
        pignonDetails: pieceA.pignonDetails,
      };

      const wCombined = Math.max(detA.cutWidthMm, pieceB.pignonDetails!.cutWidthMm);

      coupledBlocks.push({
        id: `couple-${pieceA.id}-${pieceB.id}`,
        pieceA,
        pieceB,
        largeurMm: wCombined,
        hauteurMm: bestHCombined,
        hCombinedMm: bestHCombined,
        kerfMm: KERF_MM,
      });
    }
  }

  return { coupledBlocks, pairedPieceIds };
}

interface ItemToPlace {
  id: string;
  sourcePiece: PieceCalepinage;
  couplePiece?: PieceCalepinage;
  wMm: number;
  hMm: number;
  surfaceM2: number;
  isCoupled: boolean;
}

function creerDecoupePiece(
  item: ItemToPlace,
  xMm: number,
  yMm: number,
  largeurMm: number,
  hauteurMm: number,
  isRotated: boolean
): DecoupePiece {
  const { sourcePiece, couplePiece, isCoupled } = item;

  if (isCoupled && couplePiece) {
    const detA = sourcePiece.pignonDetails;
    const detB = couplePiece.pignonDetails;
    const labelA = `${sourcePiece.repere} (${detA?.cutWidthMm ?? Math.round(sourcePiece.largeurM * 1000)}×${detA?.hLeftMm ?? 0}/${detA?.hRightMm ?? 0})`;
    const labelB = `${couplePiece.repere} (${detB?.cutWidthMm ?? Math.round(couplePiece.largeurM * 1000)}×${detB?.hLeftMm ?? 0}/${detB?.hRightMm ?? 0})`;

    return {
      id: item.id,
      repere: `${sourcePiece.repere} + ${couplePiece.repere}`,
      nom: `${labelA} + ${labelB} [Couplé]`,
      xMm,
      yMm,
      largeurMm,
      hauteurMm,
      surfaceM2: item.surfaceM2,
      type: "pignon",
      colonne: sourcePiece.colonne,
      rangee: sourcePiece.rangee,
      pignonDetails: detA,
      coupleAvec: {
        id: couplePiece.id,
        repere: couplePiece.repere,
        nom: labelB,
        surfaceM2: couplePiece.surfaceM2,
        colonne: couplePiece.colonne,
        rangee: couplePiece.rangee,
        pignonDetails: detB,
      },
      isRotated,
    };
  }

  const nom = sourcePiece.pignonDetails
    ? `${sourcePiece.repere} (${sourcePiece.pignonDetails.cutWidthMm}×${sourcePiece.pignonDetails.hLeftMm}/${sourcePiece.pignonDetails.hRightMm})`
    : `${sourcePiece.repere} (${largeurMm}×${hauteurMm})`;

  return {
    id: sourcePiece.id,
    repere: sourcePiece.repere,
    nom,
    xMm,
    yMm,
    largeurMm,
    hauteurMm,
    surfaceM2: sourcePiece.surfaceM2,
    type: sourcePiece.type,
    colonne: sourcePiece.colonne,
    rangee: sourcePiece.rangee,
    pignonDetails: sourcePiece.pignonDetails,
    isRotated,
  };
}

/**
 * Moteur d'imbrication 2D (Nesting 2D Guillotine) & Générateur de Plan de Découpe Plaque par Plaque
 */
function genererPlanDebitNesting(
  pieces: PieceCalepinage[],
  plaqueBruteLongueurMm: number,
  plaqueBruteLargeurMm: number,
  moduleLargeurMm: number,
  moduleHauteurMm: number,
  traitDeScieMm = 3,
  autoriserRotation = true
): {
  plaquesDebit: PlaqueDebit[];
  modulesParPlaque: number;
  piecesIncompatibles: PieceIncompatible[];
  nbPiecesCouplees: number;
  nbBlocsCouples: number;
} {
  const rawL = plaqueBruteLongueurMm;
  const rawH = plaqueBruteLargeurMm;
  const surfacePlaqueM2 = (rawL * rawH) / 1_000_000;

  // Rendement direct théorique
  const nX = Math.floor(rawL / moduleLargeurMm);
  const nY = Math.floor(rawH / moduleHauteurMm);
  const modulesParPlaque = Math.max(1, nX * nY);

  // 1. Couplage préalable tête-bêche des pièces de pignon compatibles
  const { coupledBlocks, pairedPieceIds } = couplerPiecesPignon(
    pieces,
    rawH,
    rawL,
    autoriserRotation
  );

  const itemsToPlace: ItemToPlace[] = [];

  // Ajouter les blocs couplés (A + B)
  for (const block of coupledBlocks) {
    itemsToPlace.push({
      id: block.id,
      sourcePiece: block.pieceA,
      couplePiece: block.pieceB,
      wMm: block.largeurMm,
      hMm: block.hauteurMm,
      surfaceM2: block.pieceA.surfaceM2 + block.pieceB.surfaceM2,
      isCoupled: true,
    });
  }

  // Ajouter les pièces individuelles restantes (non couplées)
  for (const p of pieces) {
    if (pairedPieceIds.has(p.id)) continue;
    const wMm = p.pignonDetails ? p.pignonDetails.cutWidthMm : Math.round(p.largeurM * 1000);
    const hMm = p.pignonDetails ? p.pignonDetails.cutHeightMm : Math.round(p.hauteurM * 1000);
    itemsToPlace.push({
      id: p.id,
      sourcePiece: p,
      wMm,
      hMm,
      surfaceM2: p.surfaceM2,
      isCoupled: false,
    });
  }

  // Tri décroissant pour maximiser le remplissage (Guillotine First-Fit Decreasing)
  itemsToPlace.sort((a, b) => b.hMm * b.wMm - a.hMm * a.wMm || b.hMm - a.hMm);

  type Shelf2D = {
    yMm: number;
    heightMm: number;
    currentXMm: number;
    pieces: DecoupePiece[];
  };

  type Sheet2D = {
    index: number;
    shelves: Shelf2D[];
    currentYMm: number;
  };

  const sheets: Sheet2D[] = [];
  const piecesIncompatibles: PieceIncompatible[] = [];

  for (const item of itemsToPlace) {
    let placed = false;
    const { sourcePiece, couplePiece, wMm, hMm } = item;

    const orientations = [
      { w: wMm, h: hMm },
      ...(autoriserRotation ? [{ w: hMm, h: wMm }] : []),
    ];

    for (const sheet of sheets) {
      for (const ori of orientations) {
        // 1. Chercher dans une étagère existante
        for (const shelf of sheet.shelves) {
          if (
            shelf.heightMm >= ori.h &&
            rawL - shelf.currentXMm >= ori.w
          ) {
            const isRotated = ori.w !== wMm;
            const decPiece = creerDecoupePiece(
              item,
              shelf.currentXMm,
              shelf.yMm,
              ori.w,
              ori.h,
              isRotated
            );

            shelf.pieces.push(decPiece);
            shelf.currentXMm += ori.w + traitDeScieMm;
            sourcePiece.plaqueIndex = sheet.index;
            if (couplePiece) couplePiece.plaqueIndex = sheet.index;
            placed = true;
            break;
          }
        }
        if (placed) break;

        // 2. Créer une nouvelle étagère dans cette plaque si hauteur suffisante
        if (rawH - sheet.currentYMm >= ori.h) {
          const isRotated = ori.w !== wMm;
          const decPiece = creerDecoupePiece(
            item,
            0,
            sheet.currentYMm,
            ori.w,
            ori.h,
            isRotated
          );

          const newShelf: Shelf2D = {
            yMm: sheet.currentYMm,
            heightMm: ori.h,
            currentXMm: ori.w + traitDeScieMm,
            pieces: [decPiece],
          };

          sheet.shelves.push(newShelf);
          sheet.currentYMm += ori.h + traitDeScieMm;
          sourcePiece.plaqueIndex = sheet.index;
          if (couplePiece) couplePiece.plaqueIndex = sheet.index;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    // 3. Ouvrir une nouvelle plaque brute
    if (!placed) {
      const newSheetIndex = sheets.length + 1;
      const validOri = orientations.find((o) => o.h <= rawH && o.w <= rawL);

      if (!validOri) {
        piecesIncompatibles.push({
          repere: sourcePiece.repere,
          largeurMm: wMm,
          hauteurMm: hMm,
          raison: `Pièce ${wMm}×${hMm} mm incompatible avec la plaque brute ${rawL}×${rawH} mm dans toutes les orientations`,
        });
        continue;
      }

      const isRotated = validOri.w !== wMm;
      const decPiece = creerDecoupePiece(
        item,
        0,
        0,
        validOri.w,
        validOri.h,
        isRotated
      );

      const newShelf: Shelf2D = {
        yMm: 0,
        heightMm: validOri.h,
        currentXMm: validOri.w + traitDeScieMm,
        pieces: [decPiece],
      };

      sheets.push({
        index: newSheetIndex,
        shelves: [newShelf],
        currentYMm: validOri.h + traitDeScieMm,
      });

      sourcePiece.plaqueIndex = newSheetIndex;
      if (couplePiece) couplePiece.plaqueIndex = newSheetIndex;
    }
  }

  // Construction des plaques de débit avec détection précise des chutes
  const plaquesDebit: PlaqueDebit[] = sheets.map((sheet) => {
    const allPieces: DecoupePiece[] = [];
    const chutes: ChutePlaque[] = [];

    sheet.shelves.forEach((shelf) => {
      allPieces.push(...shelf.pieces);

      // Chute latérale en bout d'étagère
      const resteLargeurMm = rawL - shelf.currentXMm;
      if (resteLargeurMm > 20) {
        const sM2 = (resteLargeurMm * shelf.heightMm) / 1_000_000;
        const reutilisable = resteLargeurMm >= 800 || sM2 >= 0.25;
        chutes.push({
          id: `chute-shelf-${sheet.index}-${shelf.yMm}`,
          xMm: shelf.currentXMm,
          yMm: shelf.yMm,
          largeurMm: resteLargeurMm,
          hauteurMm: shelf.heightMm,
          surfaceM2: sM2,
          reutilisable,
          motif: reutilisable
            ? "Chute réutilisable (départ rangée / ébrasement)"
            : "Chute d'extrémité (perte)",
        });
      }
    });

    // Chute supérieure en haut de plaque
    const resteHauteurMm = rawH - sheet.currentYMm;
    if (resteHauteurMm > 20) {
      const sM2 = (rawL * resteHauteurMm) / 1_000_000;
      const reutilisable = resteHauteurMm >= 250 || sM2 >= 0.35;
      chutes.push({
        id: `chute-top-${sheet.index}`,
        xMm: 0,
        yMm: sheet.currentYMm,
        largeurMm: rawL,
        hauteurMm: resteHauteurMm,
        surfaceM2: sM2,
        reutilisable,
        motif: reutilisable
          ? "Bande supérieure réutilisable (rives / bandeaux)"
          : "Chute résiduelle haute (perte)",
      });
    }

    const surfaceUtileM2 = allPieces.reduce((s, p) => s + p.surfaceM2, 0);
    const surfaceChutesM2 = Math.max(0, surfacePlaqueM2 - surfaceUtileM2);
    const surfaceChutesReutilisablesM2 = chutes
      .filter((c) => c.reutilisable)
      .reduce((s, c) => s + c.surfaceM2, 0);

    const tauxRendementPct = surfacePlaqueM2 > 0 ? (surfaceUtileM2 / surfacePlaqueM2) * 100 : 0;

    return {
      index: sheet.index,
      longueurMm: rawL,
      largeurMm: rawH,
      surfaceM2: surfacePlaqueM2,
      pieces: allPieces,
      chutes,
      surfaceUtileM2,
      surfaceChutesM2,
      surfaceChutesReutilisablesM2,
      tauxRendementPct,
    };
  });

  return {
    plaquesDebit,
    modulesParPlaque,
    piecesIncompatibles,
    nbPiecesCouplees: pairedPieceIds.size,
    nbBlocsCouples: coupledBlocks.length,
  };
}

export function calculerCalepinage(input: CalepinageInput): ResultatCalepinage {
  let {
    zoneLargeurM,
    zoneHauteurM,
    plaqueLongueurMm,
    plaqueLargeurMm,
    moduleLargeurMm,
    moduleHauteurMm,
    sensPose = "horizontal",
    estPignon = false,
    hauteurFaiteM = null,
    traitDeScieMm = 3,
    autoriserRotation = true,
  } = input;

  // 1. SÉCURISATION DES DIMENSIONS PLAQUES BRUTES FOURNISSEUR
  let rawLongueurMm = plaqueLongueurMm && plaqueLongueurMm > 0 ? plaqueLongueurMm : 3050;
  let rawLargeurMm = plaqueLargeurMm && plaqueLargeurMm > 0 ? plaqueLargeurMm : 1300;
  if (rawLongueurMm < 20) rawLongueurMm = Math.round(rawLongueurMm * 1000);
  if (rawLargeurMm < 20) rawLargeurMm = Math.round(rawLargeurMm * 1000);

  // 2. SÉCURISATION DES DIMENSIONS MODULES POSÉS
  let modLargeurMm = moduleLargeurMm && moduleLargeurMm > 0 ? moduleLargeurMm : 1000;
  let modHauteurMm = moduleHauteurMm && moduleHauteurMm > 0 ? moduleHauteurMm : 600;
  if (modLargeurMm < 20) modLargeurMm = Math.round(modLargeurMm * 1000);
  if (modHauteurMm < 20) modHauteurMm = Math.round(modHauteurMm * 1000);

  const sens: SensPose =
    (sensPose ?? "horizontal").toString().toLowerCase() === "vertical"
      ? "vertical"
      : "horizontal";

  const largeur = Math.max(0, zoneLargeurM);
  const hauteurMur = Math.max(0, zoneHauteurM);
  const hauteurFaite = estPignon
    ? Math.max(hauteurMur, hauteurFaiteM ?? hauteurMur)
    : hauteurMur;

  const hauteurTotale = estPignon ? hauteurFaite : hauteurMur;

  const dimModuleLargeurAxeMm = sens === "horizontal" ? modLargeurMm : modHauteurMm;
  const dimModuleHauteurAxeMm = sens === "horizontal" ? modHauteurMm : modLargeurMm;

  const dimension = sens === "vertical" ? modHauteurMm : modLargeurMm;
  const nombreEspaces = Math.ceil(Math.max(1, dimension) / LIMITE_DTU_MM);
  const entraxeReelMm = Math.max(1, dimension) / nombreEspaces;

  const minRiveWidthMm =
    input.minRiveWidthMm !== undefined && input.minRiveWidthMm !== null
      ? input.minRiveWidthMm
      : input.minRiveWidth !== undefined && input.minRiveWidth !== null
      ? input.minRiveWidth
      : RIVE_MIN_MM;

  // Découpage esthétique centré avec règle anti-micro-plaques : plaques ENTIÈRES (largeur physique),
  // rives symétriques, indépendant de l'ossature.
  const colonnesLargeursM = axeSymetrique(largeur, dimModuleLargeurAxeMm, minRiveWidthMm);
  const rangeesHauteursM = axeEquivalent(hauteurTotale, dimModuleHauteurAxeMm);

  let pieces: PieceCalepinage[] = [];
  let yCumul = 0;
  let compteurPieces = 1;
  let compteurRives = 1;
  let compteurPignons = 1;

  const ridgeX = largeur / 2;
  const deltaH = hauteurFaite - hauteurMur;

  rangeesHauteursM.forEach((hauteurPiece, rangee) => {
    let xCumul = 0;

    colonnesLargeursM.forEach((largeurPiece, colonne) => {
      const x1 = xCumul;
      const x2 = xCumul + largeurPiece;
      const yBottom = yCumul;
      const yTop = yCumul + hauteurPiece;

      if (!estPignon || deltaH <= EPSILON_M) {
        if (yBottom >= hauteurMur - EPSILON_M) {
          xCumul += largeurPiece;
          return;
        }
        const estRive = colonne === 0 || colonne === colonnesLargeursM.length - 1;
        const estPleine =
          !estRive &&
          Math.abs(largeurPiece - dimModuleLargeurAxeMm / 1000) <= EPSILON_M;

        const type: PieceCalepinage["type"] = estPleine ? "pleine" : "coupe";
        const repere = estPleine
          ? `M-${String(compteurPieces++).padStart(2, "0")}`
          : `R-${String(compteurRives++).padStart(2, "0")}`;

        const rectangle: PointCalepinage[] = [
          { xM: x1, yM: yBottom },
          { xM: x2, yM: yBottom },
          { xM: x2, yM: yTop },
          { xM: x1, yM: yTop },
        ];

        pieces.push({
          id: `piece-r${rangee}-c${colonne}`,
          repere,
          colonne,
          rangee,
          xM: x1,
          yM: yBottom,
          largeurM: largeurPiece,
          hauteurM: hauteurPiece,
          type,
          surfaceM2: largeurPiece * hauteurPiece,
          points: rectangle,
        });

        xCumul += largeurPiece;
        return;
      }

      // Cas Pignon (estPignon && deltaH > EPSILON_M) :
      // 1. Troncature horizontale de la cellule au niveau yBottom
      let xReal1 = x1;
      let xReal2 = x2;

      if (yBottom >= hauteurMur - 1e-4) {
        const t = (yBottom - hauteurMur) / deltaH;
        if (t >= 1) {
          xCumul += largeurPiece;
          return;
        }
        const xLeftEntry = ridgeX * t;
        const xRightExit = largeur - (largeur - ridgeX) * t;

        xReal1 = Math.max(x1, xLeftEntry);
        xReal2 = Math.min(x2, xRightExit);

        if (xReal1 >= xReal2 - 1e-4) {
          xCumul += largeurPiece;
          return;
        }
      }

      // 2. Hauteurs du toit aux abscisses réelles
      const z1 = getHauteurToit(xReal1, largeur, hauteurMur, hauteurFaite);
      const z2 = getHauteurToit(xReal2, largeur, hauteurMur, hauteurFaite);
      const includesRidge = xReal1 < ridgeX - 1e-4 && xReal2 > ridgeX + 1e-4;
      const zPeak = includesRidge ? hauteurFaite : 0;
      const maxZ = Math.max(z1, z2, zPeak);
      const minZ = Math.min(z1, z2);

      // Classification A : Hors mur (EMPTY)
      if (maxZ <= yBottom + 1e-4) {
        xCumul += largeurPiece;
        return;
      }

      // Classification B : Plaque Pleine (M-xx / R-xx) 100% sous le toit
      const isFullUnderRoof =
        minZ >= yTop - 1e-4 &&
        Math.abs(xReal1 - x1) <= 1e-4 &&
        Math.abs(xReal2 - x2) <= 1e-4;

      if (isFullUnderRoof) {
        const estRive = colonne === 0 || colonne === colonnesLargeursM.length - 1;
        const estPleine =
          !estRive &&
          Math.abs(largeurPiece - dimModuleLargeurAxeMm / 1000) <= EPSILON_M;

        const type: PieceCalepinage["type"] = estPleine ? "pleine" : "coupe";
        const repere = estPleine
          ? `M-${String(compteurPieces++).padStart(2, "0")}`
          : `R-${String(compteurRives++).padStart(2, "0")}`;

        const rectangle: PointCalepinage[] = [
          { xM: x1, yM: yBottom },
          { xM: x2, yM: yBottom },
          { xM: x2, yM: yTop },
          { xM: x1, yM: yTop },
        ];

        pieces.push({
          id: `piece-r${rangee}-c${colonne}`,
          repere,
          colonne,
          rangee,
          xM: x1,
          yM: yBottom,
          largeurM: largeurPiece,
          hauteurM: hauteurPiece,
          type,
          surfaceM2: largeurPiece * hauteurPiece,
          points: rectangle,
        });

        xCumul += largeurPiece;
        return;
      }

      // Classification C : Plaque Pignon (P-xx) traversée par le rampant
      const hLeft = Math.max(0, Math.min(hauteurPiece, z1 - yBottom));
      const hRight = Math.max(0, Math.min(hauteurPiece, z2 - yBottom));
      const hPeak = includesRidge ? Math.max(0, Math.min(hauteurPiece, hauteurFaite - yBottom)) : 0;

      const hLeftMm = Math.round(hLeft * 1000);
      const hRightMm = Math.round(hRight * 1000);
      const hPeakMm = Math.round(hPeak * 1000);
      const cutHeightMm = Math.max(hLeftMm, hRightMm, hPeakMm);
      const cutWidthMm = Math.round((xReal2 - xReal1) * 1000);

      if (cutWidthMm <= 0 || cutHeightMm <= 0) {
        xCumul += largeurPiece;
        return;
      }

      const subRectangle: PointCalepinage[] = [
        { xM: xReal1, yM: yBottom },
        { xM: xReal2, yM: yBottom },
        { xM: xReal2, yM: yTop },
        { xM: xReal1, yM: yTop },
      ];
      const clipped = decouperParPignon(subRectangle, largeur, hauteurMur, hauteurFaite);
      const surfaceM2 = airePolygone(clipped);

      if (surfaceM2 <= 1e-5) {
        xCumul += largeurPiece;
        return;
      }

      const repere = `P-${String(compteurPignons++).padStart(2, "0")}`;

      pieces.push({
        id: `piece-r${rangee}-c${colonne}`,
        repere,
        colonne,
        rangee,
        xM: xReal1,
        yM: yBottom,
        largeurM: cutWidthMm / 1000,
        hauteurM: cutHeightMm / 1000,
        type: "pignon",
        surfaceM2,
        points: clipped.length >= 3 ? clipped : undefined,
        pignonDetails: {
          hLeftMm,
          hRightMm,
          hPeakMm,
          cutWidthMm,
          cutHeightMm,
          includesRidge,
          xReal1M: xReal1,
          xReal2M: xReal2,
        },
      });

      xCumul += largeurPiece;
    });

    yCumul += hauteurPiece;
  });

  // Règle anti-micro-plaques étendue aux pièces de pignon (P-xx) et rampants
  const activerAntiMicroPignon =
    input.antiMicroPignon ??
    (input.minRiveWidthMm !== undefined && input.minRiveWidthMm !== null);

  if (estPignon && activerAntiMicroPignon) {
    pieces = fusionnerMicroPiecesPignon(
      pieces,
      largeur,
      hauteurMur,
      hauteurFaite,
      minRiveWidthMm,
      rawLongueurMm ? Math.max(rawLongueurMm, rawLargeurMm) / 1000 : 3.05
    );
  }

  const surfaceZoneM2 = pieces.reduce((s, p) => s + p.surfaceM2, 0);
  const nbPiecesPosees = pieces.length;

  // 3. OPTIMISATION NESTING DANS LES PLAQUES BRUTES FOURNISSEUR
  const {
    plaquesDebit,
    modulesParPlaque: modulesParPlaqueBrute,
    piecesIncompatibles,
    nbPiecesCouplees,
    nbBlocsCouples,
  } = genererPlanDebitNesting(
    pieces,
    rawLongueurMm,
    rawLargeurMm,
    dimModuleLargeurAxeMm,
    dimModuleHauteurAxeMm,
    traitDeScieMm ?? 3,
    autoriserRotation
  );

  const nbPlaquesNecessaires = plaquesDebit.length;
  const surfacePlaqueBruteM2 = (rawLongueurMm * rawLargeurMm) / 1_000_000;
  const surfacePlaquesAchetesM2 = nbPlaquesNecessaires * surfacePlaqueBruteM2;

  // 4. CALCUL PRÉCIS DES CHUTES & PERTES RÉELLES
  const totalChutesReutilisablesM2 = plaquesDebit.reduce(
    (s, p) => s + p.surfaceChutesReutilisablesM2,
    0
  );

  const totalDechetsPerteM2 = Math.max(
    0,
    surfacePlaquesAchetesM2 - surfaceZoneM2 - totalChutesReutilisablesM2
  );

  const tauxChuteBrutePct =
    surfacePlaquesAchetesM2 > 0
      ? ((surfacePlaquesAchetesM2 - surfaceZoneM2) / surfacePlaquesAchetesM2) * 100
      : 0;

  const tauxChuteNettePct =
    surfacePlaquesAchetesM2 > 0
      ? (totalDechetsPerteM2 / surfacePlaquesAchetesM2) * 100
      : 0;

  const nbJointsVerticaux = Math.max(0, colonnesLargeursM.length - 1) * rangeesHauteursM.length;
  const nbJointsHorizontaux =
    Math.max(0, rangeesHauteursM.length - 1) * colonnesLargeursM.length;

  const pentePct =
    estPignon && largeur > 0
      ? ((hauteurFaite - hauteurMur) / (largeur / 2)) * 100
      : 0;

  return {
    colonnesLargeursM,
    rangeesHauteursM,
    pieces,
    nbPlaquesNecessaires,
    nbPiecesPosees,
    surfaceZoneM2,
    surfacePlaquesAchetesM2,
    tauxChuteBrutePct,
    tauxChuteNettePct,
    tauxChutePct: tauxChuteNettePct,
    totalChutesReutilisablesM2,
    totalDechetsPerteM2,
    nbJoints: nbJointsVerticaux + nbJointsHorizontaux,
    estPignon,
    hauteurFaiteM: hauteurFaite,
    hauteurMurM: hauteurMur,
    pentePct,
    plaqueBruteLongueurMm: rawLongueurMm,
    plaqueBruteLargeurMm: rawLargeurMm,
    moduleCibleLargeurMm: modLargeurMm,
    moduleCibleHauteurMm: modHauteurMm,
    modulesParPlaqueBrute,
    plaquesDebit,
    entraxeReelMm,
    piecesIncompatibles: piecesIncompatibles.length > 0 ? piecesIncompatibles : undefined,
    nbPiecesCouplees,
    nbBlocsCouples,
    minRiveWidthMm,
    antiMicroPignon: activerAntiMicroPignon,
  };
}
