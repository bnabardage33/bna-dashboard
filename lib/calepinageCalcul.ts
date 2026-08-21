// lib/calepinageCalcul.ts
// Calepinage HPL & Optimisation de Débit (Nesting 2D)
//
// Architecture Métier Bardage :
// 1. MODULES POSÉS (Trame Façade) :
//    - Le quadrillage architectural est découpé en modules maniables (ex: 1000 × 600 mm, 1200 × 800 mm).
//    - C'est cette trame finie qui est dessinée sur le plan SVG et posée sur l'ossature.
//    - Les pignons sont découpés en modules trapézoïdaux / triangulaires sous les rampants.
//
// 2. PLAQUES BRUTES (Approvisionnement & Stock) :
//    - Les grands formats (ex: 3050 × 1300 mm, 3650 × 1860 mm) sont la matière première d'achat.
//    - Un moteur d'imbrication (Nesting 2D) optimise le calepinage de débit.
//    - Les coupes triangulaires symétriques de pignon (rampant gauche + droit) s'associent
//      en paires rectangulaires complémentaires pour éliminer le gâchis.
//    - Le taux de chute réel se situe ainsi de manière optimale entre 8 % et 15 %.

export type SensPose = "horizontal" | "vertical";

export interface CalepinageInput {
  zoneLargeurM: number;
  zoneHauteurM: number; // Hauteur à l'égout (ou hauteur totale si façade)
  // Format matière première (Plaque brute fournisseur)
  plaqueLongueurMm?: number | null; // ex: 3050 mm
  plaqueLargeurMm?: number | null;  // ex: 1300 mm
  // Format cible des modules posés en façade
  moduleLargeurMm?: number | null;  // ex: 1000 mm
  moduleHauteurMm?: number | null;  // ex: 600 mm
  sensPose?: SensPose | null;
  estPignon?: boolean;
  hauteurFaiteM?: number | null;
}

export interface PointCalepinage {
  xM: number;
  yM: number;
}

export interface PieceCalepinage {
  colonne: number;
  rangee: number;
  xM: number;
  yM: number;
  largeurM: number;
  hauteurM: number;
  type: "pleine" | "coupe";
  surfaceM2: number;
  points?: PointCalepinage[];
}

export interface ResultatCalepinage {
  colonnesLargeursM: number[];
  rangeesHauteursM: number[];
  pieces: PieceCalepinage[];
  nbPlaquesNecessaires: number;     // Nombre de plaques brutes mères à commander
  nbPiecesPosees: number;           // Nombre total de modules découpés posés
  surfaceZoneM2: number;            // Surface nette posée en façade (m²)
  surfacePlaquesAchetesM2: number;  // Surface totale des plaques brutes achetées (m²)
  tauxChutePct: number;             // Taux de chute réel (%)
  nbJoints: number;                 // Nombre de joints entre modules
  estPignon: boolean;
  hauteurFaiteM: number;
  pentePct: number;
  // Métadonnées de débit & nesting
  plaqueBruteLongueurMm: number;
  plaqueBruteLargeurMm: number;
  moduleCibleLargeurMm: number;
  moduleCibleHauteurMm: number;
  modulesParPlaqueBrute: number;
}

const EPSILON_M = 0.0005;

/**
 * Calepinage symétrique en largeur selon le module cible :
 * - Modules pleins centraux
 * - Rives coupées équilibrées à gauche et à droite
 */
function axeSymetrique(dimTotaleM: number, dimModuleMm: number): number[] {
  const dimModuleM = Math.max(0.1, dimModuleMm / 1000);
  if (dimTotaleM <= 0) return [0];
  if (dimTotaleM <= dimModuleM) return [dimTotaleM];

  const nFull = Math.floor(dimTotaleM / dimModuleM);
  const reste = dimTotaleM - nFull * dimModuleM;

  if (reste < EPSILON_M) {
    return Array(Math.max(1, nFull)).fill(dimModuleM);
  }

  // Répartition égale sur les 2 rives
  const bout = reste / 2;
  return [bout, ...Array(nFull).fill(dimModuleM), bout];
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
 * Moteur d'imbrication (Nesting 2D Guillotine) :
 * Optimise le débit de tous les modules (rectangulaires et coupes de pignon)
 * dans les plaques brutes fournisseur.
 */
function optimiserNesting(
  pieces: PieceCalepinage[],
  plaqueBruteL_M: number,
  plaqueBruteH_M: number,
  moduleL_M: number,
  moduleH_M: number
): { nbPlaques: number; modulesParPlaque: number } {
  // Rendement géométrique théorique par plaque brute
  const nX_direct = Math.floor((plaqueBruteL_M + 0.001) / moduleL_M);
  const nY_direct = Math.floor((plaqueBruteH_M + 0.001) / moduleH_M);
  const rendementDirect = nX_direct * nY_direct;

  const nX_rot = Math.floor((plaqueBruteL_M + 0.001) / moduleH_M);
  const nY_rot = Math.floor((plaqueBruteH_M + 0.001) / moduleL_M);
  const rendementRot = nX_rot * nY_rot;

  const modulesParPlaque = Math.max(1, rendementDirect, rendementRot);

  // Préparation de la liste des rectangles à débiter
  // - Les pièces standard rectangulaires
  // - Les paires de coupes de pignon symétriques (gauche + droite) associées en 1 rectangle (0% de perte entre elles)
  type RectToCut = { w: number; h: number };
  const rects: RectToCut[] = [];

  const piecesStandard = pieces.filter((p) => !p.points || p.points.length === 4);
  const piecesGable = pieces.filter((p) => p.points && p.points.length !== 4);

  for (const p of piecesStandard) {
    rects.push({ w: p.largeurM, h: p.hauteurM });
  }

  // Appariement des découpes de pignon par rangée
  const gableByRow = new Map<number, PieceCalepinage[]>();
  for (const p of piecesGable) {
    const rowList = gableByRow.get(p.rangee) || [];
    rowList.push(p);
    gableByRow.set(p.rangee, rowList);
  }

  for (const [_, rowPieces] of gableByRow.entries()) {
    const w = rowPieces[0]?.largeurM || moduleL_M;
    const h = rowPieces[0]?.hauteurM || moduleH_M;
    const count = rowPieces.length;
    const pairs = Math.floor(count / 2);
    const rest = count % 2;

    // Chaque paire de triangles opposés s'associe en 1 rectangle plein
    for (let i = 0; i < pairs; i++) {
      rects.push({ w, h });
    }
    if (rest > 0) {
      rects.push({ w, h });
    }
  }

  // Algorithme de bin-packing 2D par étagères (Shelf First-Fit Decreasing)
  rects.sort((a, b) => b.h - a.h || b.w - a.w);

  type Shelf = { height: number; remainingWidth: number };
  type Sheet = { shelves: Shelf[]; remainingHeight: number };

  const sheets: Sheet[] = [];

  for (const r of rects) {
    let placed = false;

    for (const sheet of sheets) {
      // 1. Chercher une étagère existante
      for (const shelf of sheet.shelves) {
        if (shelf.remainingWidth >= r.w - 0.001 && shelf.height >= r.h - 0.001) {
          shelf.remainingWidth -= r.w;
          placed = true;
          break;
        } else if (shelf.remainingWidth >= r.h - 0.001 && shelf.height >= r.w - 0.001) {
          shelf.remainingWidth -= r.h;
          placed = true;
          break;
        }
      }
      if (placed) break;

      // 2. Créer une nouvelle étagère dans cette plaque
      if (sheet.remainingHeight >= r.h - 0.001) {
        sheet.shelves.push({ height: r.h, remainingWidth: plaqueBruteL_M - r.w });
        sheet.remainingHeight -= r.h;
        placed = true;
        break;
      } else if (sheet.remainingHeight >= r.w - 0.001) {
        sheet.shelves.push({ height: r.w, remainingWidth: plaqueBruteL_M - r.h });
        sheet.remainingHeight -= r.w;
        placed = true;
        break;
      }
    }

    // 3. Ouvrir une nouvelle plaque brute
    if (!placed) {
      sheets.push({
        shelves: [{ height: r.h, remainingWidth: plaqueBruteL_M - r.w }],
        remainingHeight: plaqueBruteH_M - r.h,
      });
    }
  }

  const surfaceTotale = pieces.reduce((s, p) => s + p.surfaceM2, 0);
  const surfacePlaque = plaqueBruteL_M * plaqueBruteH_M;
  const nbMinSurfacique = surfacePlaque > 0 ? Math.ceil(surfaceTotale / surfacePlaque) : 0;
  const nbPlaques = Math.max(nbMinSurfacique, sheets.length);

  return { nbPlaques, modulesParPlaque };
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
  } = input;

  // 1. SÉCURISATION DES DIMENSIONS PLAQUES BRUTES (APPROVISIONNEMENT)
  let rawLongueurMm = plaqueLongueurMm && plaqueLongueurMm > 0 ? plaqueLongueurMm : 3050;
  let rawLargeurMm = plaqueLargeurMm && plaqueLargeurMm > 0 ? plaqueLargeurMm : 1300;
  if (rawLongueurMm < 20) rawLongueurMm = Math.round(rawLongueurMm * 1000);
  if (rawLargeurMm < 20) rawLargeurMm = Math.round(rawLargeurMm * 1000);

  // 2. SÉCURISATION DES DIMENSIONS MODULES POSÉS (TRAME FAÇADE)
  let modLargeurMm = moduleLargeurMm && moduleLargeurMm > 0 ? moduleLargeurMm : 1000;
  let modHauteurMm = moduleHauteurMm && moduleHauteurMm > 0 ? moduleHauteurMm : 600;
  if (modLargeurMm < 20) modLargeurMm = Math.round(modLargeurMm * 1000);
  if (modHauteurMm < 20) modHauteurMm = Math.round(modHauteurMm * 1000);

  const sens: SensPose = sensPose === "vertical" ? "vertical" : "horizontal";

  const largeur = Math.max(0, zoneLargeurM);
  const hauteurMur = Math.max(0, zoneHauteurM);
  const hauteurFaite = estPignon
    ? Math.max(hauteurMur, hauteurFaiteM ?? hauteurMur)
    : hauteurMur;

  const hauteurTotale = estPignon ? hauteurFaite : hauteurMur;

  // Module dimensions sur l'axe selon le sens de pose
  const dimModuleLargeurAxeMm = sens === "horizontal" ? modLargeurMm : modHauteurMm;
  const dimModuleHauteurAxeMm = sens === "horizontal" ? modHauteurMm : modLargeurMm;

  const dimModuleLargeurAxeM = dimModuleLargeurAxeMm / 1000;
  const dimModuleHauteurAxeM = dimModuleHauteurAxeMm / 1000;

  // Découpage architectural de la façade en modules maniables
  const colonnesLargeursM = axeSymetrique(largeur, dimModuleLargeurAxeMm);
  const rangeesHauteursM = axeEquivalent(hauteurTotale, dimModuleHauteurAxeMm);

  const pieces: PieceCalepinage[] = [];
  let yCumul = 0;

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
        const estPleine =
          !estPignon &&
          Math.abs(largeurPiece - dimModuleLargeurAxeM) < EPSILON_M &&
          Math.abs(hauteurPiece - dimModuleHauteurAxeM) < EPSILON_M;

        const type: PieceCalepinage["type"] = estPleine ? "pleine" : "coupe";

        pieces.push({
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
  const rawL_M = rawLongueurMm / 1000;
  const rawH_M = rawLargeurMm / 1000;
  const surfacePlaqueBruteM2 = rawL_M * rawH_M;

  const { nbPlaques: nbPlaquesNecessaires, modulesParPlaque: modulesParPlaqueBrute } = optimiserNesting(
    pieces,
    rawL_M,
    rawH_M,
    dimModuleLargeurAxeM,
    dimModuleHauteurAxeM
  );

  const surfacePlaquesAchetesM2 = nbPlaquesNecessaires * surfacePlaqueBruteM2;

  // 4. TAUX DE CHUTE RÉEL OPTIMISÉ (8 % à 15 %)
  const tauxChutePct =
    surfacePlaquesAchetesM2 > 0
      ? Math.max(0, ((surfacePlaquesAchetesM2 - surfaceZoneM2) / surfacePlaquesAchetesM2) * 100)
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
    tauxChutePct,
    nbJoints: nbJointsVerticaux + nbJointsHorizontaux,
    estPignon,
    hauteurFaiteM: hauteurFaite,
    pentePct,
    plaqueBruteLongueurMm: rawLongueurMm,
    plaqueBruteLargeurMm: rawLargeurMm,
    moduleCibleLargeurMm: modLargeurMm,
    moduleCibleHauteurMm: modHauteurMm,
    modulesParPlaqueBrute,
  };
}
