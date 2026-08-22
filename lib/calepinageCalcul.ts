// lib/calepinageCalcul.ts
// Moteur d'Optimisation de Découpe, Calepinage & Nesting 2D (Panneaux & Bardage)
//
// Architecture Métier BNA Bardage :
// 1. MODULES POSÉS (Façade & Pignons) :
//    - Trame architecturale en modules finis (Pose Droite ou À Joints Croisés rectangulaires).
//    - Panneaux 100% rectangulaires sans division diagonale ou triangulaire parasite.
//    - Prise en compte normative du joint de dilatation de 8 mm (DTU 41.2 / DTU 31.2).
//    - Découpe symétrique des rives et gestion automatique des rampants de pignons.
//    - Chaque panneau reçoit un repère unique (ex: M-01, R-01 pour rive, P-01 pour pignon).
//
// 2. IMBRICATION & DÉBIT D'ATELIER (Nesting 2D Guillotine) :
//    - Répartition optimisée des modules sur les plaques brutes d'achat (ex: 3050 × 1300 mm).
//    - Détection intelligente des chutes réutilisables vs pertes réelles / sciure.
//    - Taux de chute net réel calculé précisément.

export type SensPose = "horizontal" | "vertical";
export type TypePoseCalepinage = "pose_droite" | "joints_croises";

export interface CalepinageInput {
  zoneLargeurM: number;
  zoneHauteurM: number; // Hauteur à l'égout (ou totale si façade droite)
  // Format matière première brute (achat fournisseur)
  plaqueLongueurMm?: number | null; // ex: 3050 mm
  plaqueLargeurMm?: number | null;  // ex: 1300 mm
  // Format cible des modules posés en façade
  moduleLargeurMm?: number | null;  // ex: 1000 mm
  moduleHauteurMm?: number | null;  // ex: 600 mm
  sensPose?: SensPose | null;
  typePose?: TypePoseCalepinage | null; // Pose Droite (standard) ou À Joints Croisés
  estPignon?: boolean;
  hauteurFaiteM?: number | null;
  traitDeScieMm?: number | null;   // Épaisseur de lame de coupe (défaut: 3 mm)
  jointMm?: number | null;         // Épaisseur du joint de dilatation entre panneaux (défaut DTU 41.2: 8 mm)
}

export interface PointCalepinage {
  xM: number;
  yM: number;
}

export interface PieceCalepinage {
  id: string;
  repere: string; // ex: "M-01", "R-01", "P-01"
  colonne: number;
  rangee: number;
  // Position et dimensions de la trame
  xM: number;
  yM: number;
  largeurM: number;
  hauteurM: number;
  // Dimensions nettes réelles débitées (déduction faite du joint de 8 mm)
  largeurNetteMm: number;
  hauteurNetteMm: number;
  type: "pleine" | "coupe" | "pignon";
  surfaceM2: number;
  points?: PointCalepinage[];
  plaqueIndex?: number; // N° de la plaque brute d'où provient cette pièce
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
  index: number; // 1, 2, 3...
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
  nbPlaquesNecessaires: number;     // Nombre de plaques brutes à commander
  nbPiecesPosees: number;           // Nombre de modules découpés posés
  surfaceZoneM2: number;            // Surface nette posée (m²)
  surfacePlaquesAchetesM2: number;  // Surface brute achetée (m²)
  tauxChuteBrutePct: number;        // Taux de chute brut (%)
  tauxChuteNettePct: number;        // Taux de perte nette après réemploi des chutes (%)
  tauxChutePct: number;             // Rétrocompatibilité (taux net)
  totalChutesReutilisablesM2: number;
  totalDechetsPerteM2: number;
  // Données des joints de dilatation (8 mm DTU 41.2)
  jointMm: number;                  // Épaisseur de joint (8 mm)
  nbJoints: number;                 // Total nb de joints
  nbJointsVerticaux: number;
  nbJointsHorizontaux: number;
  lineaireJointsM: number;          // Mètres linéaires de joints (pour bandes EPDM / profilés)
  surfaceJointsM2: number;          // Surface décomptée par les joints
  typePose: TypePoseCalepinage;     // "pose_droite" ou "joints_croises"
  estPignon: boolean;
  hauteurFaiteM: number;
  pentePct: number;
  // Métadonnées matière & plan de coupe
  plaqueBruteLongueurMm: number;
  plaqueBruteLargeurMm: number;
  moduleCibleLargeurMm: number;
  moduleCibleHauteurMm: number;
  modulesParPlaqueBrute: number;
  plaquesDebit: PlaqueDebit[];      // Plan de débit pas-à-pas pour l'atelier
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

  // Préparer la liste des pièces à découper avec leurs dimensions nettes débitées
  type PieceToPlace = {
    sourcePiece: PieceCalepinage;
    wMm: number;
    hMm: number;
    surfaceM2: number;
  };

  const piecesToPlace: PieceToPlace[] = pieces.map((p) => ({
    sourcePiece: p,
    wMm: p.largeurNetteMm || Math.round(p.largeurM * 1000),
    hMm: p.hauteurNetteMm || Math.round(p.hauteurM * 1000),
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
    typePose = "pose_droite", // Pose Droite rectangulaire par défaut
    estPignon = false,
    hauteurFaiteM = null,
    traitDeScieMm = 3,
    jointMm = 8, // Joint de dilatation standard 8 mm (DTU 41.2)
  } = input;

  const modePose: TypePoseCalepinage = typePose === "joints_croises" ? "joints_croises" : "pose_droite";
  const epaisseurJointMm = jointMm !== null && jointMm !== undefined && jointMm >= 0 ? jointMm : 8;
  const jointM = epaisseurJointMm / 1000;

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

  // Découpage architectural standard de la façade en trames rectangulaires (Pose Droite)
  const colonnesLargeursM = axeSymetrique(largeur, dimModuleLargeurAxeMm);
  const rangeesHauteursM = axeEquivalent(hauteurTotale, dimModuleHauteurAxeMm);

  const pieces: PieceCalepinage[] = [];
  let yCumul = 0;
  let compteurPieces = 1;
  let compteurRives = 1;
  let compteurPignons = 1;

  rangeesHauteursM.forEach((hauteurPiece, rangee) => {
    let xCumul = 0;

    // Décalage pour pose à joints croisés (rectangulaire 1/2)
    let decalageRangeeM = 0;
    if (modePose === "joints_croises" && rangee % 2 === 1) {
      decalageRangeeM = dimModuleLargeurAxeM / 2;
    }

    colonnesLargeursM.forEach((largeurPiece, colonne) => {
      const pieceX = xCumul;
      const rectangle: PointCalepinage[] = [
        { xM: pieceX, yM: yCumul },
        { xM: pieceX + largeurPiece, yM: yCumul },
        { xM: pieceX + largeurPiece, yM: yCumul + hauteurPiece },
        { xM: pieceX, yM: yCumul + hauteurPiece },
      ];

      const points = estPignon
        ? decouperParPignon(rectangle, largeur, hauteurMur, hauteurFaite)
        : rectangle;

      const surfaceM2 = airePolygone(points);

      if (surfaceM2 > EPSILON_M * EPSILON_M) {
        const estRive = colonne === 0 || colonne === colonnesLargeursM.length - 1;
        const estCoupePignon = estPignon && points.length !== 4;

        let type: PieceCalepinage["type"] = "pleine";
        let repere = `M-${String(compteurPieces++).padStart(2, "0")}`;

        if (estCoupePignon) {
          type = "pignon";
          repere = `P-${String(compteurPignons++).padStart(2, "0")}`;
        } else if (estRive || Math.abs(largeurPiece - dimModuleLargeurAxeM) > EPSILON_M) {
          type = "coupe";
          repere = `R-${String(compteurRives++).padStart(2, "0")}`;
        }

        // Cote nette débitée : la plaque réelle est déduite du joint de 8 mm
        const largeurNetteMm = Math.max(50, Math.round(largeurPiece * 1000 - epaisseurJointMm));
        const hauteurNetteMm = Math.max(50, Math.round(hauteurPiece * 1000 - epaisseurJointMm));

        pieces.push({
          id: `piece-r${rangee}-c${colonne}`,
          repere,
          colonne,
          rangee,
          xM: pieceX,
          yM: yCumul,
          largeurM: largeurPiece,
          hauteurM: hauteurPiece,
          largeurNetteMm,
          hauteurNetteMm,
          type,
          surfaceM2,
          points: estCoupePignon ? points : undefined, // Ne conserve points que si pignon coupé
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

  // 5. CALCULS DES JOINTS DE DILATATION (8 MM)
  const nbJointsVerticaux = Math.max(0, colonnesLargeursM.length - 1) * rangeesHauteursM.length;
  const nbJointsHorizontaux =
    Math.max(0, rangeesHauteursM.length - 1) * colonnesLargeursM.length;

  const lineaireJointsVerticauxM = Math.max(0, colonnesLargeursM.length - 1) * hauteurTotale;
  const lineaireJointsHorizontauxM = Math.max(0, rangeesHauteursM.length - 1) * largeur;
  const lineaireJointsM = lineaireJointsVerticauxM + lineaireJointsHorizontauxM;
  const surfaceJointsM2 = lineaireJointsM * jointM;

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
    jointMm: epaisseurJointMm,
    nbJoints: nbJointsVerticaux + nbJointsHorizontaux,
    nbJointsVerticaux,
    nbJointsHorizontaux,
    lineaireJointsM,
    surfaceJointsM2,
    typePose: modePose,
    estPignon,
    hauteurFaiteM: hauteurFaite,
    pentePct,
    plaqueBruteLongueurMm: rawLongueurMm,
    plaqueBruteLargeurMm: rawLargeurMm,
    moduleCibleLargeurMm: modLargeurMm,
    moduleCibleHauteurMm: modHauteurMm,
    modulesParPlaqueBrute,
    plaquesDebit,
  };
}
