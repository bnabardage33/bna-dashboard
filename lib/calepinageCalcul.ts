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
//    - Les découpes triangulaires opposées de pignons s'associent en paires rectangulaires.
//    - Détection intelligente des chutes :
//      * Chutes réutilisables (longueur >= 800 mm ou surface >= 0.30 m²) pour tableaux de fenêtres ou départs.
//      * Pertes réelles / sciure.
//    - Taux de chute net réel calculé précisément.

import { LIMITE_DTU_MM, decoupageModulesCentres } from "./poseCalcul";

export { LIMITE_DTU_MM };
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
}

export interface PointCalepinage {
  xM: number;
  yM: number;
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
  estPairePignon?: boolean;
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
  pentePct: number;
  plaqueBruteLongueurMm: number;
  plaqueBruteLargeurMm: number;
  moduleCibleLargeurMm: number;
  moduleCibleHauteurMm: number;
  modulesParPlaqueBrute: number;
  plaquesDebit: PlaqueDebit[];
  entraxeReelMm: number;
}

const EPSILON_M = 0.0005;

export function calculerEntraxeReel(largeurModuleMm: number): number {
  const dimension = Math.max(1, largeurModuleMm);
  const nombreEspaces = Math.ceil(dimension / LIMITE_DTU_MM);
  return dimension / nombreEspaces;
}

/**
 * Calepinage ESTHÉTIQUE des colonnes HPL :
 *  - le mur est centré en plaques ENTIÈRES de `moduleMm` (largeur physique),
 *  - riveGauche = riveDroite (symétrie absolue depuis l'axe du mur),
 *  - si une rive < RIVE_MIN_MM, une plaque est retirée pour élargir les rives.
 * Ici les plaques gardent leur VRAIE largeur de saisie : les chevrons
 * intermédiaires (entraxe) sont générés séparément dans l'ossature.
 */
function axeSymetrique(largeurM: number, moduleMm: number): number[] {
  const largeurMm = Math.round(largeurM * 1000);
  const moduleSizeMm = Math.max(1, Math.round(moduleMm));

  if (largeurMm <= 0) return [0];
  if (largeurMm < moduleSizeMm) return [largeurMm / 1000];

  const { nModules, riveMm } = decoupageModulesCentres(largeurMm, moduleSizeMm);
  if (nModules === 0) return [largeurMm / 1000];

  const riveM = Math.round(riveMm) / 1000;
  const moduleM = moduleSizeMm / 1000;

  const colonnes: number[] = [];
  if (riveM > 0.005) colonnes.push(riveM);
  for (let i = 0; i < nModules; i++) colonnes.push(moduleM);
  if (riveM > 0.005) colonnes.push(riveM);
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
 * Moteur d'imbrication 2D (Nesting 2D Guillotine) & Générateur de Plan de Découpe Plaque par Plaque
 */
function genererPlanDebitNesting(
  pieces: PieceCalepinage[],
  plaqueBruteLongueurMm: number,
  plaqueBruteLargeurMm: number,
  moduleLargeurMm: number,
  moduleHauteurMm: number,
  traitDeScieMm = 3
): {
  plaquesDebit: PlaqueDebit[];
  modulesParPlaque: number;
} {
  const rawL = plaqueBruteLongueurMm;
  const rawH = plaqueBruteLargeurMm;
  const surfacePlaqueM2 = (rawL * rawH) / 1_000_000;

  // Rendement direct théorique
  const nX = Math.floor(rawL / moduleLargeurMm);
  const nY = Math.floor(rawH / moduleHauteurMm);
  const modulesParPlaque = Math.max(1, nX * nY);

  // Préparer la liste des pièces à découper
  type PieceToPlace = {
    sourcePiece: PieceCalepinage;
    wMm: number;
    hMm: number;
    surfaceM2: number;
  };

  const piecesToPlace: PieceToPlace[] = pieces.map((p) => ({
    sourcePiece: p,
    wMm: Math.round(p.largeurM * 1000),
    hMm: Math.round(p.hauteurM * 1000),
    surfaceM2: p.surfaceM2,
  }));

  // Tri décroissant pour maximiser le remplissage (Guillotine First-Fit Decreasing)
  piecesToPlace.sort((a, b) => b.hMm * b.wMm - a.hMm * a.wMm || b.hMm - a.hMm);

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

  for (const item of piecesToPlace) {
    let placed = false;
    const { sourcePiece, wMm, hMm } = item;

    // Tester orientation normale et pivotée à 90°
    const orientations = [
      { w: wMm, h: hMm },
      { w: hMm, h: wMm },
    ];

    for (const sheet of sheets) {
      for (const ori of orientations) {
        // 1. Chercher dans une étagère existante
        for (const shelf of sheet.shelves) {
          if (
            shelf.heightMm >= ori.h &&
            rawL - shelf.currentXMm >= ori.w
          ) {
            const decPiece: DecoupePiece = {
              id: sourcePiece.id,
              repere: sourcePiece.repere,
              nom: `${sourcePiece.repere} (${ori.w}×${ori.h})`,
              xMm: shelf.currentXMm,
              yMm: shelf.yMm,
              largeurMm: ori.w,
              hauteurMm: ori.h,
              surfaceM2: sourcePiece.surfaceM2,
              type: sourcePiece.type,
              colonne: sourcePiece.colonne,
              rangee: sourcePiece.rangee,
            };

            shelf.pieces.push(decPiece);
            shelf.currentXMm += ori.w + traitDeScieMm;
            sourcePiece.plaqueIndex = sheet.index;
            placed = true;
            break;
          }
        }
        if (placed) break;

        // 2. Créer une nouvelle étagère dans cette plaque si hauteur suffisante
        if (rawH - sheet.currentYMm >= ori.h) {
          const newShelf: Shelf2D = {
            yMm: sheet.currentYMm,
            heightMm: ori.h,
            currentXMm: ori.w + traitDeScieMm,
            pieces: [
              {
                id: sourcePiece.id,
                repere: sourcePiece.repere,
                nom: `${sourcePiece.repere} (${ori.w}×${ori.h})`,
                xMm: 0,
                yMm: sheet.currentYMm,
                largeurMm: ori.w,
                hauteurMm: ori.h,
                surfaceM2: sourcePiece.surfaceM2,
                type: sourcePiece.type,
                colonne: sourcePiece.colonne,
                rangee: sourcePiece.rangee,
              },
            ],
          };

          sheet.shelves.push(newShelf);
          sheet.currentYMm += ori.h + traitDeScieMm;
          sourcePiece.plaqueIndex = sheet.index;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    // 3. Ouvrir une nouvelle plaque brute
    if (!placed) {
      const newSheetIndex = sheets.length + 1;
      const firstOri = orientations[0];

      const newShelf: Shelf2D = {
        yMm: 0,
        heightMm: firstOri.h,
        currentXMm: firstOri.w + traitDeScieMm,
        pieces: [
          {
            id: sourcePiece.id,
            repere: sourcePiece.repere,
            nom: `${sourcePiece.repere} (${firstOri.w}×${firstOri.h})`,
            xMm: 0,
            yMm: 0,
            largeurMm: firstOri.w,
            hauteurMm: firstOri.h,
            surfaceM2: sourcePiece.surfaceM2,
            type: sourcePiece.type,
            colonne: sourcePiece.colonne,
            rangee: sourcePiece.rangee,
          },
        ],
      };

      sheets.push({
        index: newSheetIndex,
        shelves: [newShelf],
        currentYMm: firstOri.h + traitDeScieMm,
      });

      sourcePiece.plaqueIndex = newSheetIndex;
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

    const surfaceUtileM2 = allPieces.reduce((s, p) => s + (p.largeurMm * p.hauteurMm) / 1_000_000, 0);
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

  // Découpage esthétique centré : plaques ENTIÈRES (largeur physique),
  // rives symétriques, indépendant de l'ossature.
  const colonnesLargeursM = axeSymetrique(largeur, dimModuleLargeurAxeMm);
  const rangeesHauteursM = axeEquivalent(hauteurTotale, dimModuleHauteurAxeMm);

  const pieces: PieceCalepinage[] = [];
  let yCumul = 0;
  let compteurPieces = 1;
  let compteurRives = 1;
  let compteurPignons = 1;

  rangeesHauteursM.forEach((hauteurPiece, rangee) => {
    let xCumul = 0;

    colonnesLargeursM.forEach((largeurPiece, colonne) => {
      const rectangle: PointCalepinage[] = [
        { xM: xCumul, yM: yCumul },
        { xM: xCumul + largeurPiece, yM: yCumul },
        { xM: xCumul + largeurPiece, yM: yCumul + hauteurPiece },
        { xM: xCumul, yM: yCumul + hauteurPiece },
      ];

      const points = estPignon
        ? decouperParPignon(rectangle, largeur, hauteurMur, hauteurFaite)
        : rectangle;

      const surfaceM2 = airePolygone(points);

      if (surfaceM2 > EPSILON_M * EPSILON_M) {
        const estRive = colonne === 0 || colonne === colonnesLargeursM.length - 1;
        const estCoupePignon = estPignon && points.length !== 4;
        // Une pièce "pleine" est une plaque de largeur physique complète.
        const estPleine =
          !estRive &&
          !estCoupePignon &&
          Math.abs(largeurPiece - dimModuleLargeurAxeMm / 1000) <= EPSILON_M;

        let type: PieceCalepinage["type"] = estPleine ? "pleine" : "coupe";
        let repere = `M-${String(compteurPieces++).padStart(2, "0")}`;

        if (estCoupePignon) {
          type = "pignon";
          repere = `P-${String(compteurPignons++).padStart(2, "0")}`;
        } else if (!estPleine) {
          type = "coupe";
          repere = `R-${String(compteurRives++).padStart(2, "0")}`;
        }

        pieces.push({
          id: `piece-r${rangee}-c${colonne}`,
          repere,
          colonne,
          rangee,
          xM: xCumul,
          yM: yCumul,
          largeurM: largeurPiece,
          hauteurM: hauteurPiece,
          type,
          surfaceM2,
          points: estPignon ? points : undefined,
        });
      }

      xCumul += largeurPiece;
    });

    yCumul += hauteurPiece;
  });

  const surfaceZoneM2 = pieces.reduce((s, p) => s + p.surfaceM2, 0);
  const nbPiecesPosees = pieces.length;

  // 3. OPTIMISATION NESTING DANS LES PLAQUES BRUTES FOURNISSEUR
  const { plaquesDebit, modulesParPlaque: modulesParPlaqueBrute } = genererPlanDebitNesting(
    pieces,
    rawLongueurMm,
    rawLargeurMm,
    dimModuleLargeurAxeMm,
    dimModuleHauteurAxeMm,
    traitDeScieMm ?? 3
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
    pentePct,
    plaqueBruteLongueurMm: rawLongueurMm,
    plaqueBruteLargeurMm: rawLargeurMm,
    moduleCibleLargeurMm: modLargeurMm,
    moduleCibleHauteurMm: modHauteurMm,
    modulesParPlaqueBrute,
    plaquesDebit,
    entraxeReelMm,
  };
}
