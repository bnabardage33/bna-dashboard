// Brique 2 — Moteur géométrique 2D Structure : Lambourdes, Chevêtres & Plots
// Formes I, L, U et polygones + réservations (rectangles, cercles, polygones) ;
// génération d'objets distincts pour simple lambourdage, double lambourdage aux aboutages
// et lambourdage croisé ; encadrement automatique des réservations par chevêtres et plots.

import type { ChantierTerrasseConfig, ChantierTerrasseReservation } from "../types";
import {
  CONSTANTES_TERRASSE_PRO,
  estTerrasseComposite,
  resoudreEntraxeMaxLambourdesMm,
  resoudreJeuxPoseMm,
  resoudrePorteeMaxLambourdeMm,
  SOLLICITATIONS_DTU_2018,
  type PlacedJoistSegment,
  type PlacedSupportPoint,
  type Point2D,
  type RuleDiagnosticItem,
  type SolicitationCategory,
  type TerrasseFormeType,
  type TerrasseStructureMode,
} from "./presets-regles";

export interface OrthogonalRectMm {
  xMinMm: number;
  yMinMm: number;
  xMaxMm: number;
  yMaxMm: number;
}

export interface GeometrieTerrasseOptions {
  formeType?: TerrasseFormeType;
  /** Dimensions du retour pour une forme en L ou en U (en mètres) */
  retour1LongueurM?: number;
  retour1LargeurM?: number;
  retour2LongueurM?: number;
  retour2LargeurM?: number;
  /** Polygone personnalisé en mm (si formeType === "POLYGONE") */
  polygoneSommetsMm?: Point2D[];
  /** Mode de structure : SIMPLE, DOUBLE_ABOUTAGE ou CROISEE */
  structureMode?: TerrasseStructureMode;
  solicitationCategory?: SolicitationCategory;
}

export interface NormalizedReservationMm {
  id: string;
  nom: string;
  shape: "RECTANGLE" | "CERCLE" | "POLYGONE";
  xMinMm: number;
  yMinMm: number;
  xMaxMm: number;
  yMaxMm: number;
  centerMm?: Point2D;
  radiusMm?: number;
  polygonMm?: Point2D[];
}

export interface Structure2DResult {
  isValid: boolean;
  blockingErrors: RuleDiagnosticItem[];
  warnings: RuleDiagnosticItem[];
  boundingWidthMm: number;
  boundingHeightMm: number;
  grossAreaM2: number;
  reservationsAreaM2: number;
  netAreaM2: number;
  domainRectsMm: OrthogonalRectMm[];
  domainPolygonMm?: Point2D[];
  normalizedReservations: NormalizedReservationMm[];
  joistXPositionsMm: number[];
  buttJointXPositionsMm: number[];
  joists: PlacedJoistSegment[];
  supports: PlacedSupportPoint[];
  entraxeLambourdesRetenuMm: number;
  entraxeLambourdesMax3AppuisMm: number;
  entraxeLambourdesMax2AppuisMm: number;
  porteePlotsRetenueMm: number;
  porteePlotsMaxMm: number;
}

function pointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].xMm;
    const yi = poly[i].yMm;
    const xj = poly[j].xMm;
    const yj = poly[j].yMm;
    const intersect =
      yi > pt.yMm !== yj > pt.yMm &&
      pt.xMm < ((xj - xi) * (pt.yMm - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonAreaMm2(poly: Point2D[]): number {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += poly[j].xMm * poly[i].yMm - poly[i].xMm * poly[j].yMm;
  }
  return Math.abs(area) / 2;
}

function pointInDomain(
  pt: Point2D,
  rects: OrthogonalRectMm[],
  poly?: Point2D[]
): boolean {
  if (poly && poly.length >= 3) {
    return pointInPolygon(pt, poly);
  }
  return rects.some(
    (r) =>
      pt.xMm >= r.xMinMm - 1e-3 &&
      pt.xMm <= r.xMaxMm + 1e-3 &&
      pt.yMm >= r.yMinMm - 1e-3 &&
      pt.yMm <= r.yMaxMm + 1e-3
  );
}

/**
 * Calcule les intervalles X continus [xStartMm, xEndMm] d'une bande horizontale [yMinMm, yMaxMm]
 * à l'intérieur de l'emprise de la terrasse (I, L, U ou polygone) et hors réservations.
 */
export function intersectHorizontalBandWithDomainMm(
  yCenterMm: number,
  domainRectsMm: OrthogonalRectMm[],
  normalizedReservations: NormalizedReservationMm[],
  jeuPeripheriqueObstacleMm: number,
  domainPolygonMm?: Point2D[]
): Array<{
  xStartMm: number;
  xEndMm: number;
  leftBoundary: "RIVE_LIBRE" | "RESERVATION";
  rightBoundary: "RIVE_LIBRE" | "RESERVATION";
}> {
  let baseIntervals: Array<{
    xStartMm: number;
    xEndMm: number;
    leftBoundary: "RIVE_LIBRE" | "RESERVATION";
    rightBoundary: "RIVE_LIBRE" | "RESERVATION";
  }> = [];

  if (domainPolygonMm && domainPolygonMm.length >= 3) {
    // Intersection scanline à y = yCenterMm avec le polygone
    const xs: number[] = [];
    for (let i = 0, j = domainPolygonMm.length - 1; i < domainPolygonMm.length; j = i++) {
      const p1 = domainPolygonMm[j];
      const p2 = domainPolygonMm[i];
      if ((p1.yMm <= yCenterMm && p2.yMm > yCenterMm) || (p2.yMm <= yCenterMm && p1.yMm > yCenterMm)) {
        const t = (yCenterMm - p1.yMm) / (p2.yMm - p1.yMm);
        xs.push(p1.xMm + t * (p2.xMm - p1.xMm));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      if (xs[k + 1] - xs[k] > 1) {
        baseIntervals.push({
          xStartMm: Math.round(xs[k]),
          xEndMm: Math.round(xs[k + 1]),
          leftBoundary: "RIVE_LIBRE",
          rightBoundary: "RIVE_LIBRE",
        });
      }
    }
  } else {
    // Union des rectangles couvrant yCenterMm
    const raw = domainRectsMm
      .filter((r) => yCenterMm >= r.yMinMm && yCenterMm <= r.yMaxMm)
      .map((r) => ({ xStartMm: r.xMinMm, xEndMm: r.xMaxMm }))
      .sort((a, b) => a.xStartMm - b.xStartMm);

    for (const seg of raw) {
      if (baseIntervals.length === 0) {
        baseIntervals.push({
          ...seg,
          leftBoundary: "RIVE_LIBRE",
          rightBoundary: "RIVE_LIBRE",
        });
      } else {
        const last = baseIntervals[baseIntervals.length - 1];
        if (seg.xStartMm <= last.xEndMm + 1) {
          last.xEndMm = Math.max(last.xEndMm, seg.xEndMm);
        } else {
          baseIntervals.push({
            ...seg,
            leftBoundary: "RIVE_LIBRE",
            rightBoundary: "RIVE_LIBRE",
          });
        }
      }
    }
  }

  // Soustraction de chaque réservation avec son jeu périphérique
  for (const res of normalizedReservations) {
    let cutStartMm: number | null = null;
    let cutEndMm: number | null = null;

    if (res.shape === "CERCLE" && res.centerMm && res.radiusMm) {
      const rEff = res.radiusMm + jeuPeripheriqueObstacleMm;
      const dy = Math.abs(yCenterMm - res.centerMm.yMm);
      if (dy < rEff) {
        const dx = Math.sqrt(rEff * rEff - dy * dy);
        cutStartMm = Math.floor(res.centerMm.xMm - dx);
        cutEndMm = Math.ceil(res.centerMm.xMm + dx);
      }
    } else {
      const yMinEff = res.yMinMm - jeuPeripheriqueObstacleMm;
      const yMaxEff = res.yMaxMm + jeuPeripheriqueObstacleMm;
      if (yCenterMm >= yMinEff && yCenterMm <= yMaxEff) {
        cutStartMm = Math.floor(res.xMinMm - jeuPeripheriqueObstacleMm);
        cutEndMm = Math.ceil(res.xMaxMm + jeuPeripheriqueObstacleMm);
      }
    }

    if (cutStartMm !== null && cutEndMm !== null && cutEndMm > cutStartMm) {
      const nextIntervals: typeof baseIntervals = [];
      for (const iv of baseIntervals) {
        if (cutEndMm <= iv.xStartMm || cutStartMm >= iv.xEndMm) {
          nextIntervals.push(iv);
        } else {
          if (cutStartMm > iv.xStartMm + 1) {
            nextIntervals.push({
              xStartMm: iv.xStartMm,
              xEndMm: cutStartMm,
              leftBoundary: iv.leftBoundary,
              rightBoundary: "RESERVATION",
            });
          }
          if (cutEndMm < iv.xEndMm - 1) {
            nextIntervals.push({
              xStartMm: cutEndMm,
              xEndMm: iv.xEndMm,
              leftBoundary: "RESERVATION",
              rightBoundary: iv.rightBoundary,
            });
          }
        }
      }
      baseIntervals = nextIntervals;
    }
  }

  return baseIntervals;
}

/**
 * Génère la structure porteuse 2D complète (lambourdes simples, doubles aux aboutages,
 * croisées, chevêtres de réservations et grille de plots).
 */
export function genererGeometrieStructure2D(
  config: ChantierTerrasseConfig,
  reservations: ChantierTerrasseReservation[] = [],
  options: GeometrieTerrasseOptions = {}
): Structure2DResult {
  const blockingErrors: RuleDiagnosticItem[] = [];
  const warnings: RuleDiagnosticItem[] = [];

  const isComp = estTerrasseComposite(config);
  const solicitationCategory: SolicitationCategory = options.solicitationCategory ?? 1;
  const jeux = resoudreJeuxPoseMm(config);

  // 1. Validation stricte des dimensions (Rejet explicite, jamais de correction silencieuse)
  if (
    typeof config.longueur_m !== "number" ||
    !Number.isFinite(config.longueur_m) ||
    config.longueur_m <= 0 ||
    typeof config.largeur_m !== "number" ||
    !Number.isFinite(config.largeur_m) ||
    config.largeur_m <= 0
  ) {
    blockingErrors.push({
      code: "ERR_GEOMETRIE_DIMENSIONS_INVALIDES",
      message: `Dimensions de terrasse invalides (longueur_m=${config.longueur_m}, largeur_m=${config.largeur_m}). Les dimensions doivent être strictement positives.`,
      nature: "REGLE_METIER_INTERNE",
    });
  }

  const totalW = Math.round(Math.max(0, config.longueur_m || 0) * 1000);
  const totalH = Math.round(Math.max(0, config.largeur_m || 0) * 1000);

  // 2. Construction du domaine géométrique (Formes I, L, U, POLYGONE)
  const formeType: TerrasseFormeType = options.formeType ?? "I";
  const domainRectsMm: OrthogonalRectMm[] = [];
  let domainPolygonMm: Point2D[] | undefined;

  if (formeType === "POLYGONE" && options.polygoneSommetsMm && options.polygoneSommetsMm.length >= 3) {
    domainPolygonMm = options.polygoneSommetsMm;
    const xs = domainPolygonMm.map((p) => p.xMm);
    const ys = domainPolygonMm.map((p) => p.yMm);
    domainRectsMm.push({
      xMinMm: Math.min(...xs),
      yMinMm: Math.min(...ys),
      xMaxMm: Math.max(...xs),
      yMaxMm: Math.max(...ys),
    });
  } else if (formeType === "L") {
    const rW = Math.round((options.retour1LongueurM ?? config.longueur_m * 0.4) * 1000);
    const rH = Math.round((options.retour1LargeurM ?? config.largeur_m * 0.5) * 1000);
    if (rW <= 0 || rW >= totalW || rH <= 0 || rH >= totalH) {
      blockingErrors.push({
        code: "ERR_GEOMETRIE_FORME_L_INVALIDE",
        message: `Cotes du retour en L invalides (${rW}x${rH} mm hors emprise ${totalW}x${totalH} mm).`,
        nature: "REGLE_METIER_INTERNE",
      });
    }
    // Bande principale horizontale + retour en bas à gauche
    domainRectsMm.push(
      { xMinMm: 0, yMinMm: 0, xMaxMm: totalW, yMaxMm: totalH - rH },
      { xMinMm: 0, yMinMm: totalH - rH, xMaxMm: rW, yMaxMm: totalH }
    );
  } else if (formeType === "U") {
    const r1W = Math.round((options.retour1LongueurM ?? config.longueur_m * 0.3) * 1000);
    const r2W = Math.round((options.retour2LongueurM ?? config.longueur_m * 0.3) * 1000);
    const rH = Math.round((options.retour1LargeurM ?? config.largeur_m * 0.45) * 1000);
    if (r1W <= 0 || r2W <= 0 || r1W + r2W >= totalW || rH <= 0 || rH >= totalH) {
      blockingErrors.push({
        code: "ERR_GEOMETRIE_FORME_U_INVALIDE",
        message: `Cotes des ailes en U invalides (${r1W}mm + ${r2W}mm >= ${totalW}mm ou hauteur ${rH}mm >= ${totalH}mm).`,
        nature: "REGLE_METIER_INTERNE",
      });
    }
    domainRectsMm.push(
      { xMinMm: 0, yMinMm: 0, xMaxMm: totalW, yMaxMm: totalH - rH },
      { xMinMm: 0, yMinMm: totalH - rH, xMaxMm: r1W, yMaxMm: totalH },
      { xMinMm: totalW - r2W, yMinMm: totalH - rH, xMaxMm: totalW, yMaxMm: totalH }
    );
  } else {
    // Forme I (Rectangle standard)
    domainRectsMm.push({ xMinMm: 0, yMinMm: 0, xMaxMm: totalW, yMaxMm: totalH });
  }

  const grossAreaM2 = domainPolygonMm
    ? Number((polygonAreaMm2(domainPolygonMm) / 1_000_000).toFixed(2))
    : Number(
        (
          domainRectsMm.reduce(
            (acc, r) => acc + Math.max(0, r.xMaxMm - r.xMinMm) * Math.max(0, r.yMaxMm - r.yMinMm),
            0
          ) / 1_000_000
        ).toFixed(2)
      );

  // 3. Normalisation et validation stricte des réservations
  const normalizedReservations: NormalizedReservationMm[] = [];
  let reservationsAreaMm2 = 0;

  for (let idx = 0; idx < reservations.length; idx++) {
    const res = reservations[idx];
    const xMm = Math.round((res.x || 0) * 1000);
    const yMm = Math.round((res.y || 0) * 1000);

    if (typeof res.diametre === "number" && res.diametre > 0) {
      const radiusMm = Math.round((res.diametre * 1000) / 2);
      const centerMm = { xMm: xMm + radiusMm, yMm: yMm + radiusMm };
      const xMinMm = xMm;
      const yMinMm = yMm;
      const xMaxMm = xMm + radiusMm * 2;
      const yMaxMm = yMm + radiusMm * 2;

      const corners: Point2D[] = [
        { xMm: centerMm.xMm - radiusMm, yMm: centerMm.yMm },
        { xMm: centerMm.xMm + radiusMm, yMm: centerMm.yMm },
        { xMm: centerMm.xMm, yMm: centerMm.yMm - radiusMm },
        { xMm: centerMm.xMm, yMm: centerMm.yMm + radiusMm },
      ];
      if (!corners.every((c) => pointInDomain(c, domainRectsMm, domainPolygonMm))) {
        blockingErrors.push({
          code: "ERR_RESERVATION_HORS_EMPRISE",
          message: `La réservation circulaire "${res.nom || idx + 1}" déborde de l'emprise de la terrasse.`,
          nature: "REGLE_METIER_INTERNE",
        });
      }
      reservationsAreaMm2 += Math.PI * radiusMm * radiusMm;
      normalizedReservations.push({
        id: res.id || `res-${idx + 1}`,
        nom: res.nom || `Réservation ${idx + 1}`,
        shape: "CERCLE",
        xMinMm,
        yMinMm,
        xMaxMm,
        yMaxMm,
        centerMm,
        radiusMm,
      });
    } else {
      const wMm = Math.round((res.longueur || res.largeur || 0) * 1000);
      const hMm = Math.round((res.largeur || res.longueur || 0) * 1000);
      if (wMm <= 0 || hMm <= 0) {
        blockingErrors.push({
          code: "ERR_RESERVATION_DIMENSIONS_INVALIDES",
          message: `La réservation "${res.nom || idx + 1}" a des dimensions nulles ou négatives.`,
          nature: "REGLE_METIER_INTERNE",
        });
      }
      const xMinMm = xMm;
      const yMinMm = yMm;
      const xMaxMm = xMm + wMm;
      const yMaxMm = yMm + hMm;
      const corners: Point2D[] = [
        { xMm: xMinMm, yMm: yMinMm },
        { xMm: xMaxMm, yMm: yMinMm },
        { xMm: xMaxMm, yMm: yMaxMm },
        { xMm: xMinMm, yMm: yMaxMm },
      ];
      if (!corners.every((c) => pointInDomain(c, domainRectsMm, domainPolygonMm))) {
        blockingErrors.push({
          code: "ERR_RESERVATION_HORS_EMPRISE",
          message: `La réservation "${res.nom || idx + 1}" (${xMinMm}..${xMaxMm}, ${yMinMm}..${yMaxMm} mm) déborde du contour de la terrasse.`,
          nature: "REGLE_METIER_INTERNE",
        });
      }
      reservationsAreaMm2 += Math.max(0, wMm) * Math.max(0, hMm);
      normalizedReservations.push({
        id: res.id || `res-${idx + 1}`,
        nom: res.nom || `Réservation ${idx + 1}`,
        shape: "RECTANGLE",
        xMinMm,
        yMinMm,
        xMaxMm,
        yMaxMm,
      });
    }
  }

  const reservationsAreaM2 = Number((reservationsAreaMm2 / 1_000_000).toFixed(2));
  const netAreaM2 = Number(Math.max(0, grossAreaM2 - reservationsAreaM2).toFixed(2));

  // 4. Contrôle de la hauteur des plots polymères (<= 300 mm sous lame, NF DTU 51.4 Déc. 2018 Art. 1 & §5.5.3.4.2)
  const hauteurSolMm = Math.round((config.hauteur_sol_cm || 0) * 10);
  const hauteurSousLameMm = Math.max(0, hauteurSolMm - (config.epaisseur_lame_mm || 21));
  const estPlotPolymere =
    config.type_plots === "reglables" || config.type_plots === "autonivelants";
  if (estPlotPolymere && hauteurSousLameMm > CONSTANTES_TERRASSE_PRO.HAUTEUR_MAX_PLOT_POLYMERE_MM) {
    blockingErrors.push({
      code: "ERR_DTU_PLOT_POLYMERE_SUP_300MM",
      message: `Hauteur sous lame de ${hauteurSousLameMm} mm > ${CONSTANTES_TERRASSE_PRO.HAUTEUR_MAX_PLOT_POLYMERE_MM} mm : les plots polymères réglables sont limités à 300 mm par le NF DTU 51.4 (Décembre 2018).`,
      nature: "NORME_DTU_51_4",
    });
  }

  // 5. Résolution des entraxes E1 (lambourdes) et portées E2 (plots)
  const resEntraxe = resoudreEntraxeMaxLambourdesMm({
    isComposite: isComp,
    essence: config.essence_bois,
    epaisseurLameMm: config.epaisseur_lame_mm || 21,
    largeurLameMm: config.largeur_lame_mm || 140,
    solicitationCategory,
    isPoseDiagonale45: config.type_pose === "diagonale",
    fabricantComposite: config.fabricant_composite,
    gammeComposite: config.gamme_composite,
  });

  const entraxeSaisiMm = Math.round((config.entraxe_lambourdes_cm || 40) * 10);
  if (entraxeSaisiMm > resEntraxe.entraxeMax3AppuisMm) {
    blockingErrors.push({
      code: "ERR_ENTRAXE_LAMBOURDES_EXCESSIF",
      message: `Entraxe lambourdes saisi (${entraxeSaisiMm} mm) supérieur au maximum autorisé (${resEntraxe.entraxeMax3AppuisMm} mm).`,
      nature: resEntraxe.nature,
    });
  }
  const entraxeLambourdesRetenuMm = Math.max(150, entraxeSaisiMm);

  const resPortee = resoudrePorteeMaxLambourdeMm({
    sectionHauteurMm: config.section_hauteur_mm || 70,
    sectionLargeurMm: config.section_largeur_mm || 45,
    typeLambourde: config.type_lambourde,
    solicitationCategory,
  });
  const porteePlotsSaisieMm = Math.round((config.entraxe_plots_cm || 60) * 10);
  if (porteePlotsSaisieMm > resPortee.porteeMax3AppuisMm) {
    blockingErrors.push({
      code: "ERR_PORTEE_LAMBOURDE_PLOTS_EXCESSIVE",
      message: `Portée entre plots saisie (${porteePlotsSaisieMm} mm) supérieure au maximum autorisé (${resPortee.porteeMax3AppuisMm} mm).`,
      nature: resPortee.nature,
    });
  }
  const porteePlotsRetenueMm = Math.max(200, porteePlotsSaisieMm);

  // 6. Positionnement des files de lambourdes (en respectant le débord max en bout de lame : 20 mm à 3*e)
  const debordBoutMm = Math.min(30, jeux.debordBoutMaxMm);
  const joistXPositionsMm: number[] = [];
  if (totalW > 0) {
    const startX = Math.min(debordBoutMm, Math.floor(totalW / 4));
    const endX = Math.max(startX + 50, totalW - debordBoutMm);
    const spanTotal = endX - startX;
    const nbSpaces = Math.max(1, Math.ceil(spanTotal / entraxeLambourdesRetenuMm));
    const stepMm = spanTotal / nbSpaces;
    for (let i = 0; i <= nbSpaces; i++) {
      joistXPositionsMm.push(Math.round(startX + i * stepMm));
    }
  }

  // Identification des files d'aboutage (tous les longueur_lame_m si la terrasse est plus longue qu'une lame)
  const bladeCommMm = Math.round((config.longueur_lame_m || 4.0) * 1000);
  const buttJointXPositionsMm: number[] = [];
  if (totalW > bladeCommMm) {
    for (let xButt = bladeCommMm; xButt < totalW - 150; xButt += bladeCommMm) {
      // Rattacher à la file de lambourde la plus proche
      let closestX = joistXPositionsMm[0] ?? xButt;
      let minDiff = Math.abs(closestX - xButt);
      for (const jx of joistXPositionsMm) {
        if (Math.abs(jx - xButt) < minDiff) {
          minDiff = Math.abs(jx - xButt);
          closestX = jx;
        }
      }
      if (!buttJointXPositionsMm.includes(closestX)) {
        buttJointXPositionsMm.push(closestX);
      }
    }
  }

  const structureMode: TerrasseStructureMode =
    options.structureMode ??
    (config.double_lambourdage_aboutage || isComp ? "DOUBLE_ABOUTAGE" : "SIMPLE");

  const joistW = config.section_largeur_mm || 45;
  const joistH = config.section_hauteur_mm || 70;
  const plotCapacityKn = SOLLICITATIONS_DTU_2018[solicitationCategory].plotFrkMinKn;
  const supportType: PlacedSupportPoint["type"] =
    config.type_plots === "cales_plates"
      ? "CALE_SUR_DALLE"
      : config.type_plots === "plots_beton"
      ? "PLOT_BETON"
      : "PLOT_POLYMERE";

  const joists: PlacedJoistSegment[] = [];
  const supports: PlacedSupportPoint[] = [];

  const createSupportsAlongSegment = (
    joistId: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    customSupportType?: PlacedSupportPoint["type"]
  ): { supportIds: string[]; maxSpanMm: number } => {
    const lengthMm = Math.hypot(x2 - x1, y2 - y1);
    const nbSpans = Math.max(1, Math.ceil(lengthMm / porteePlotsRetenueMm));
    const actualSpanMm = Math.round(lengthMm / nbSpans);
    const supportIds: string[] = [];

    for (let s = 0; s <= nbSpans; s++) {
      const ratio = s / nbSpans;
      const sx = Math.round(x1 + (x2 - x1) * ratio);
      const sy = Math.round(y1 + (y2 - y1) * ratio);
      const supId = `plot-${supports.length + 1}`;
      supportIds.push(supId);
      supports.push({
        id: supId,
        type: customSupportType ?? supportType,
        centerMm: { xMm: sx, yMm: sy },
        heightMm: Math.max(20, hauteurSousLameMm - joistH),
        supportedJoistIds: [joistId],
        isJoistSpliceCentered: false,
        requiredCapacityFrkKn: plotCapacityKn,
      });
    }
    return { supportIds, maxSpanMm: actualSpanMm };
  };

  // 7. Génération des lambourdes principales (avec découpe autour des réservations et objets distincts pour le double lambourdage)
  for (let i = 0; i < joistXPositionsMm.length; i++) {
    const xMm = joistXPositionsMm[i];
    const isRive = i === 0 || i === joistXPositionsMm.length - 1;
    const isButtLine =
      !isRive &&
      (structureMode === "DOUBLE_ABOUTAGE" || config.double_lambourdage_aboutage || isComp) &&
      buttJointXPositionsMm.includes(xMm);

    // Calcul des segments Y valides à cette abscisse X (hors réservations)
    let ySegments: Array<{ yStartMm: number; yEndMm: number }> = [
      { yStartMm: jeux.debordLateralMaxMm, yEndMm: Math.max(jeux.debordLateralMaxMm + 50, totalH - jeux.debordLateralMaxMm) },
    ];

    // Filtrer selon la forme (L ou U)
    if (formeType === "L" || formeType === "U") {
      const activeRects = domainRectsMm.filter((r) => xMm >= r.xMinMm && xMm <= r.xMaxMm);
      if (activeRects.length > 0) {
        const yMinDom = Math.min(...activeRects.map((r) => r.yMinMm)) + jeux.debordLateralMaxMm;
        const yMaxDom = Math.max(...activeRects.map((r) => r.yMaxMm)) - jeux.debordLateralMaxMm;
        ySegments = [{ yStartMm: yMinDom, yEndMm: yMaxDom }];
      }
    }

    // Interrompre les lambourdes qui traversent une réservation
    for (const res of normalizedReservations) {
      const xMinRes = res.xMinMm - jeux.jeuPeripheriqueMurMm;
      const xMaxRes = res.xMaxMm + jeux.jeuPeripheriqueMurMm;
      if (xMm >= xMinRes && xMm <= xMaxRes) {
        const yCutMin = res.yMinMm - jeux.jeuPeripheriqueMurMm;
        const yCutMax = res.yMaxMm + jeux.jeuPeripheriqueMurMm;
        const nextY: typeof ySegments = [];
        for (const seg of ySegments) {
          if (yCutMax <= seg.yStartMm || yCutMin >= seg.yEndMm) {
            nextY.push(seg);
          } else {
            if (yCutMin - seg.yStartMm >= 100) {
              nextY.push({ yStartMm: seg.yStartMm, yEndMm: yCutMin });
            }
            if (seg.yEndMm - yCutMax >= 100) {
              nextY.push({ yStartMm: yCutMax, yEndMm: seg.yEndMm });
            }
          }
        }
        ySegments = nextY;
      }
    }

    for (let segIdx = 0; segIdx < ySegments.length; segIdx++) {
      const seg = ySegments[segIdx];
      const lenMm = seg.yEndMm - seg.yStartMm;
      if (lenMm <= 0) continue;

      if (isButtLine) {
        // Double lambourdage aux aboutages : 2 objets lambourdes distincts accolés
        const leftId = `lmb-dbl-G-${i + 1}-${segIdx + 1}`;
        const rightId = `lmb-dbl-D-${i + 1}-${segIdx + 1}`;
        const halfOffset = Math.round(joistW / 2);

        const supLeft = createSupportsAlongSegment(
          leftId,
          xMm - halfOffset,
          seg.yStartMm,
          xMm - halfOffset,
          seg.yEndMm
        );
        // Partage des plots ou plots jumelés sous la lambourde droite
        for (const sid of supLeft.supportIds) {
          const found = supports.find((s) => s.id === sid);
          if (found) found.supportedJoistIds.push(rightId);
        }

        joists.push({
          id: leftId,
          layer: "PRIMARY_TOP",
          role: "DOUBLE_ABOUTAGE_GAUCHE",
          pairedJoistId: rightId,
          startMm: { xMm: xMm - halfOffset, yMm: seg.yStartMm },
          endMm: { xMm: xMm - halfOffset, yMm: seg.yEndMm },
          lengthNetMm: lenMm,
          widthMm: joistW,
          heightMm: joistH,
          supportIds: supLeft.supportIds,
          maxSpanBetweenSupportsMm: supLeft.maxSpanMm,
        });

        joists.push({
          id: rightId,
          layer: "PRIMARY_TOP",
          role: "DOUBLE_ABOUTAGE_DROITE",
          pairedJoistId: leftId,
          startMm: { xMm: xMm + halfOffset, yMm: seg.yStartMm },
          endMm: { xMm: xMm + halfOffset, yMm: seg.yEndMm },
          lengthNetMm: lenMm,
          widthMm: joistW,
          heightMm: joistH,
          supportIds: [...supLeft.supportIds],
          maxSpanBetweenSupportsMm: supLeft.maxSpanMm,
        });
      } else {
        const jId = `lmb-${i + 1}-${segIdx + 1}`;
        const sup = createSupportsAlongSegment(jId, xMm, seg.yStartMm, xMm, seg.yEndMm);
        joists.push({
          id: jId,
          layer: "PRIMARY_TOP",
          role: isRive ? "RIVE" : "COURANTE",
          startMm: { xMm, yMm: seg.yStartMm },
          endMm: { xMm, yMm: seg.yEndMm },
          lengthNetMm: lenMm,
          widthMm: joistW,
          heightMm: joistH,
          supportIds: sup.supportIds,
          maxSpanBetweenSupportsMm: sup.maxSpanMm,
        });
      }
    }
  }

  // 8. Lambourdage croisé (couche inférieure secondaire à 90° si structureMode === "CROISEE")
  if (structureMode === "CROISEE" && totalH > 0) {
    const nbCross = Math.max(2, Math.ceil(totalH / porteePlotsRetenueMm) + 1);
    const stepCrossY = totalH / (nbCross - 1);
    for (let c = 0; c < nbCross; c++) {
      const cy = Math.min(totalH - joistW, Math.max(joistW, Math.round(c * stepCrossY)));
      const crossId = `lmb-croisee-${c + 1}`;
      const sup = createSupportsAlongSegment(crossId, debordBoutMm, cy, totalW - debordBoutMm, cy);
      joists.push({
        id: crossId,
        layer: "SECONDARY_BOTTOM_CROSS",
        role: c === 0 || c === nbCross - 1 ? "RIVE" : "COURANTE",
        startMm: { xMm: debordBoutMm, yMm: cy },
        endMm: { xMm: totalW - debordBoutMm, yMm: cy },
        lengthNetMm: Math.max(0, totalW - 2 * debordBoutMm),
        widthMm: joistW,
        heightMm: joistH,
        supportIds: sup.supportIds,
        maxSpanBetweenSupportsMm: sup.maxSpanMm,
      });
    }
  }

  // 9. Encadrement automatique de chaque réservation par des chevêtres et plots dédiés
  // pour garantir que les bouts et rives de lames coupées respectent le débord max (20mm..3*e)
  for (let rIdx = 0; rIdx < normalizedReservations.length; rIdx++) {
    const res = normalizedReservations[rIdx];
    const marginMm = jeux.jeuPeripheriqueMurMm + CONSTANTES_TERRASSE_PRO.DEBORD_BOUT_MIN_MM;
    const xLeft = Math.max(debordBoutMm, res.xMinMm - marginMm);
    const xRight = Math.min(totalW - debordBoutMm, res.xMaxMm + marginMm);
    const yTop = Math.max(jeux.debordLateralMaxMm, res.yMinMm - marginMm);
    const yBottom = Math.min(totalH - jeux.debordLateralMaxMm, res.yMaxMm + marginMm);

    const frameSegments: Array<{ start: Point2D; end: Point2D }> = [
      // Chevêtre gauche (reprend les bouts de lames arrivant à gauche de la réservation)
      { start: { xMm: xLeft, yMm: yTop }, end: { xMm: xLeft, yMm: yBottom } },
      // Chevêtre droit (reprend les bouts de lames repartant à droite de la réservation)
      { start: { xMm: xRight, yMm: yTop }, end: { xMm: xRight, yMm: yBottom } },
      // Traverses haute et basse du cadre de chevêtre
      { start: { xMm: xLeft, yMm: yTop }, end: { xMm: xRight, yMm: yTop } },
      { start: { xMm: xLeft, yMm: yBottom }, end: { xMm: xRight, yMm: yBottom } },
    ];

    for (let f = 0; f < frameSegments.length; f++) {
      const fs = frameSegments[f];
      const lenMm = Math.round(Math.hypot(fs.end.xMm - fs.start.xMm, fs.end.yMm - fs.start.yMm));
      if (lenMm <= 20) continue;
      const chevId = `chevetre-res-${rIdx + 1}-${f + 1}`;
      const sup = createSupportsAlongSegment(
        chevId,
        fs.start.xMm,
        fs.start.yMm,
        fs.end.xMm,
        fs.end.yMm,
        "PLOT_CHEVETRE"
      );
      joists.push({
        id: chevId,
        layer: "CHEVETRE_RESERVATION",
        role: "CHEVETRE",
        startMm: fs.start,
        endMm: fs.end,
        lengthNetMm: lenMm,
        widthMm: joistW,
        heightMm: joistH,
        supportIds: sup.supportIds,
        maxSpanBetweenSupportsMm: sup.maxSpanMm,
      });
    }
  }

  return {
    isValid: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    boundingWidthMm: totalW,
    boundingHeightMm: totalH,
    grossAreaM2,
    reservationsAreaM2,
    netAreaM2,
    domainRectsMm,
    domainPolygonMm,
    normalizedReservations,
    joistXPositionsMm,
    buttJointXPositionsMm,
    joists,
    supports,
    entraxeLambourdesRetenuMm,
    entraxeLambourdesMax3AppuisMm: resEntraxe.entraxeMax3AppuisMm,
    entraxeLambourdesMax2AppuisMm: resEntraxe.entraxeMax2AppuisMm,
    porteePlotsRetenueMm,
    porteePlotsMaxMm: resPortee.porteeMax3AppuisMm,
  };
}
