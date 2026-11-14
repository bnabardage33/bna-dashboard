// lib/bardage/pro/geometrie-ossature.ts
// Brique 2 — Géométrie des Façades, Ouvertures & Ossature secondaire (Chevrons alignés sur les joints)

import type { PresetBardage } from "./presets-regles";

export interface Point2D {
  xM: number;
  yM: number;
}

export interface OuvertureFacade {
  id: string;
  nom?: string;
  type: "fenetre" | "porte" | "baie";
  xM: number; // Coin inférieur gauche
  yM: number;
  largeurM: number;
  hauteurM: number;
}

export interface FacadeConfigInput {
  id?: string;
  nom?: string;
  type: "facade" | "pignon";
  largeurM: number;
  hauteurMurM: number;
  hauteurFaiteM?: number | null; // Pour les pignons
  angle?: boolean; // Zone d'angle de bâtiment (vent fort)
  nbAnglesSortants?: number; // Nombre d'angles sortants du bâtiment
  nbAnglesRentrants?: number; // Nombre d'angles rentrants
  ouvertures?: OuvertureFacade[];
}

export interface ChevronSupport {
  id: string;
  xM: number;
  yBasM: number;
  yHautM: number;
  longueurM: number;
  largeurMm: number;
  role: "rive" | "angle" | "joint_panneau" | "intermediaire" | "encadrement_ouverture";
  estDoubleOuLarge: boolean;
}

export interface OssatureSecondaireResult {
  chevrons: ChevronSupport[];
  entraxeReelMm: number;
  lineaireTotalChevronsMl: number;
  nbChevronsStandard: number;
  nbChevronsJoints: number;
  grilleVentilationBasseMl: number;
  grilleVentilationHauteMl: number;
  cornieresAnglesMl: number;
}

/**
 * Calcule la hauteur du toit d'un pignon symétrique ou asymétrique à l'abscisse xM
 */
export function getHauteurToitPignon(
  xM: number,
  largeurM: number,
  hMurM: number,
  hFaiteM: number
): number {
  if (hFaiteM <= hMurM) return hMurM;
  const ridgeX = largeurM / 2;
  if (xM <= ridgeX) {
    const pente = (hFaiteM - hMurM) / ridgeX;
    return hMurM + xM * pente;
  } else {
    const pente = (hFaiteM - hMurM) / (largeurM - ridgeX);
    return hFaiteM - (xM - ridgeX) * pente;
  }
}

/**
 * Génère l'ossature secondaire complète d'une façade ou pignon :
 * 1. Chevrons d'extrémités / rives / angles
 * 2. Chevrons alignés obligatoirement sur les joints verticaux des panneaux (jointsX)
 * 3. Chevrons intermédiaires respectant l'entraxe max admissible (ex. 600 mm)
 * 4. Encadrements d'ouvertures (montants verticaux droit et gauche)
 */
export function genererOssatureSecondaire(
  facade: FacadeConfigInput,
  preset: PresetBardage,
  jointsVerticauxX: number[] = [],
  options: {
    entraxeForceMm?: number;
    jeuVentilationHauteM?: number;
  } = {}
): OssatureSecondaireResult {
  const W = facade.largeurM;
  const hMur = facade.hauteurMurM;
  const estPignon = facade.type === "pignon" && Boolean(facade.hauteurFaiteM && facade.hauteurFaiteM > hMur);
  const hFaite = estPignon && facade.hauteurFaiteM ? facade.hauteurFaiteM : hMur;
  const jeuHautM = options.jeuVentilationHauteM ?? 0.03; // 30 mm sous rampant pour ventilation

  const entraxeMaxMm = facade.angle
    ? preset.entraxeRiveVentMm
    : options.entraxeForceMm ?? preset.entraxeChevronsMaxMm;
  const entraxeMaxM = entraxeMaxMm / 1000;

  const positionsSet = new Set<number>();
  const roleMap = new Map<number, ChevronSupport["role"]>();

  // 1. Chevrons de bordures (x = 0 et x = W)
  const addChevronPos = (x: number, role: ChevronSupport["role"]) => {
    const xArrondi = Math.round(x * 1000) / 1000;
    if (xArrondi < 0 || xArrondi > W) return;
    positionsSet.add(xArrondi);
    const prevRole = roleMap.get(xArrondi);
    // Priorité du rôle : joint_panneau > encadrement > rive/angle > intermediaire
    if (!prevRole || role === "joint_panneau" || (role === "encadrement_ouverture" && prevRole === "intermediaire")) {
      roleMap.set(xArrondi, role);
    }
  };

  addChevronPos(0, facade.angle ? "angle" : "rive");
  addChevronPos(W, facade.angle ? "angle" : "rive");

  // 2. Joints verticaux imposés par le calepinage des panneaux (OBLIGATION ABSOLUE)
  for (const jx of jointsVerticauxX) {
    if (jx > 0.05 && jx < W - 0.05) {
      addChevronPos(jx, "joint_panneau");
    }
  }

  // 3. Montants d'encadrement des ouvertures
  const ouvertures = facade.ouvertures ?? [];
  for (const ouv of ouvertures) {
    if (ouv.xM > 0.05 && ouv.xM < W - 0.05) {
      addChevronPos(ouv.xM, "encadrement_ouverture");
    }
    const xDroite = ouv.xM + ouv.largeurM;
    if (xDroite > 0.05 && xDroite < W - 0.05) {
      addChevronPos(xDroite, "encadrement_ouverture");
    }
  }

  // 4. Chevrons intermédiaires pour ne jamais dépasser l'entraxe maximal dans chaque intervalle
  const basePositions = Array.from(positionsSet).sort((a, b) => a - b);
  for (let i = 0; i < basePositions.length - 1; i++) {
    const xA = basePositions[i];
    const xB = basePositions[i + 1];
    const distanceM = xB - xA;

    if (distanceM > entraxeMaxM + 0.01) {
      const nbIntervalles = Math.ceil(distanceM / entraxeMaxM);
      const step = distanceM / nbIntervalles;
      for (let k = 1; k < nbIntervalles; k++) {
        const xInter = xA + k * step;
        addChevronPos(xInter, "intermediaire");
      }
    }
  }

  // 5. Instanciation des objets Chevrons avec calcul de hauteur locale sous rampant
  const toutesPositions = Array.from(positionsSet).sort((a, b) => a - b);
  const chevrons: ChevronSupport[] = [];

  let idx = 1;
  for (const x of toutesPositions) {
    const yBasM = 0;
    let yHautM = hMur;

    if (estPignon) {
      const hToit = getHauteurToitPignon(x, W, hMur, hFaite);
      yHautM = Math.max(0.2, hToit - jeuHautM);
    }

    const longueurM = Math.round((yHautM - yBasM) * 1000) / 1000;
    const role = roleMap.get(x) ?? "intermediaire";
    const estJoint = role === "joint_panneau";
    const largeurMm = estJoint
      ? preset.largeurChevronJointMm
      : preset.largeurChevronStandardMm;

    chevrons.push({
      id: `chev-${idx++}`,
      xM: x,
      yBasM,
      yHautM,
      longueurM,
      largeurMm,
      role,
      estDoubleOuLarge: estJoint,
    });
  }

  // Calcul métrique global de l'ossature
  const lineaireTotalChevronsMl = Number(
    chevrons.reduce((s, c) => s + c.longueurM, 0).toFixed(2)
  );

  let sumSpacingsMm = 0;
  let countSpacings = 0;
  for (let i = 0; i < toutesPositions.length - 1; i++) {
    sumSpacingsMm += Math.round((toutesPositions[i + 1] - toutesPositions[i]) * 1000);
    countSpacings++;
  }
  const entraxeReelMm = countSpacings > 0 ? Math.round(sumSpacingsMm / countSpacings) : entraxeMaxMm;

  const nbChevronsJoints = chevrons.filter((c) => c.estDoubleOuLarge).length;
  const nbChevronsStandard = chevrons.length - nbChevronsJoints;

  const grilleVentilationBasseMl = Number(W.toFixed(2));
  const grilleVentilationHauteMl = Number(W.toFixed(2));
  const cornieresAnglesMl = facade.angle ? Number((estPignon ? hFaite : hMur).toFixed(2)) : 0;

  return {
    chevrons,
    entraxeReelMm,
    lineaireTotalChevronsMl,
    nbChevronsStandard,
    nbChevronsJoints,
    grilleVentilationBasseMl,
    grilleVentilationHauteMl,
    cornieresAnglesMl,
  };
}
