import { trouverMeilleureGrilleSymetrique } from "./gridOptimizer";
// lib/calepinageCalcul.ts
// Moteur DTU 45.4 HPL — Optimisation de Calepinage, Découpe & Nesting 2D (Panneaux HPL / Bardage)
//
// Architecture Métier BNA Bardage :
// 1. MODULES POSÉS (Façade & Pignons) :
//    - Trame architecturale en modules finis (Pose Droite ou À Joints Croisés rectangulaires).
//    - Panneaux 100% rectangulaires sans division diagonale ou triangulaire parasite.
//    - Joint de dilatation DTU 45.4 / DTU 41.2 : 8 mm entre chaque panneau (strict).
//    - Règle anti-filet DTU 45.4 : chute de rive ≥ 300 mm (ancrage sur 2 chevrons mini).
//      Si rive < 300 mm → redistribution automatique sur tout le dernier module.
//    - Mode A (mur avec ouvertures) : joint horizontal aligné sur hauteur de linteau.
//    - Mode B (mur plein ou pignon) : répartition symétrique depuis le centre.
//    - Chaque panneau reçoit un repère unique (ex: M-01, R-01 pour rive, P-01 pour pignon).
//
// 2. IMBRICATION & DÉBIT D'ATELIER (Nesting 2D Guillotine) :
//    - Répartition optimisée des modules sur les plaques brutes d'achat (ex: 3050 × 1300 mm).
//    - Détection intelligente des chutes réutilisables vs pertes réelles / sciure.
//    - Taux de chute net réel calculé précisément.
//
// 3. QUANTITATIFS QUINCAILLERIE DTU 45.4 HPL :
//    - Équerres Isolco 3000 P2 (Point Fixe perçage Ø 5,1 mm / Points Coulissants Ø 8 mm).
//    - Chevilles Spit MP3 Ø12 mm, couple de serrage 15 Nm, profondeur 70 mm mini.
//    - Tirefonds Inox A2 Ø 6 × 60 mm de chevron sur équerre.
//    - Vis de parement HPL : 1 Point Fixe central Ø 5,1 mm + Points Coulissants Ø 8 mm.

export type SensPose = "horizontal" | "vertical";
export type TypePoseCalepinage = "pose_droite" | "joints_croises";

/** Ouverture minimale pour calcul de la hauteur de linteau (Mode A DTU 45.4) */
export interface OuvertureCalepinage {
  id?: string;
  type: "fenetre" | "porte";
  largeur: number; // m
  hauteur: number; // m
  /** Hauteur du bas de linteau depuis le sol (m). Si absent, déduit de `hauteur`. */
  hauteurLinteauM?: number | null;
}

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
  /** Ouvertures de la zone — active le Mode A (alignement linteau) DTU 45.4 */
  ouvertures?: OuvertureCalepinage[] | null;
}

export interface PointCalepinage {
  xM: number;
  yM: number;
}

export interface PieceCalepinage {
  zoneId?: string;
  zoneNom?: string;
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
  zoneId?: string;
  zoneNom?: string;
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

/**
 * Quantitatifs quincaillerie DTU 45.4 HPL
 * Générés automatiquement par le moteur de calepinage.
 */
export interface QuincaillerieHPL {
  /** Nombre de perçages Point Fixe Ø 5,1 mm (un par panneau, au centre en haut) */
  nbPercagesPointFixe51: number;
  /** Nombre de perçages Points Coulissants Ø 8 mm (deux par panneau en rives gauche/droite) */
  nbPercagesPointsCoulissants8: number;
  /** Nombre total de vis de parement HPL (1 PF + 2 PC par panneau) */
  nbVisParementTotal: number;
  /** Instructions de perçage Point Fixe */
  instructionPercagePointFixe: string;
  /** Instructions de perçage Points Coulissants */
  instructionPercagePointsCoulissants: string;
  /** Note générale de perçage conforme DTU 45.4 */
  notePercage: string;
  /** Nombre d'équerres Isolco porteuses (Point Fixe) */
  nbEquerresIsolcoPorteuses: number;
  /** Nombre d'équerres Isolco guides (Point Coulissant) */
  nbEquerresIsolcoGuides: number;
  /** Total équerres Isolco */
  nbEquerresIsolcoTotal: number;
  /** Modèle d'équerre Isolco recommandé */
  modeleEquerreIsolco: string;
  /** Nombre de chevilles Spit MP3 Ø12 mm (2 par équerre) */
  nbChevilles_SpitMP3: number;
  /** Instructions de pose chevillesMP3 */
  instructionChevilles: string;
  /** Nombre de tirefonds Inox A2 Ø6×60mm (2/équerre porteuse + 1/équerre guide) */
  nbTirefondsInox: number;
  /** Linéaire de joints EPDM 8 mm à remplir (ml) */
  lineaireJointsMastic: number;
  /** Tolérance anti-filet appliquée : true si au moins une rive a été redistribuée */
  antiFiletApplique: boolean;
  /** Mode DTU 45.4 appliqué */
  modeCalepinage: "A_linteau" | "B_symetrique";
  /** Résumé des rangées horizontales et alignement linteau éventuel */
  resumeAlignementLinteau: string;
}

export interface ResultatCalepinage {
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
  // Données des joints de dilatation (8 mm DTU 41.2 / DTU 45.4)
  jointMm: number;                  // Épaisseur de joint (8 mm)
  nbJoints: number;                 // Total nb de joints
  nbJointsVerticaux: number;
  nbJointsHorizontaux: number;
  lineaireJointsM: number;          // Mètres linéaires de joints (pour bandes EPDM / profilés)
  surfaceJointsM2: number;          // Surface décomptée par les joints
  totalCoupesML: number;            // Mètres linéaires totaux de coupes à réaliser
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
  /** Quantitatifs quincaillerie DTU 45.4 HPL — Bon de commande matériel */
  quincaillerie: QuincaillerieHPL;
}

const EPSILON_M = 0.0005;

/**
 * Règle anti-filet DTU 45.4 § 5.3.4 :
 * La chute de rive minimale est de 300 mm (ancrage sur 2 chevrons).
 * Si une rive est < 300 mm, redistribue la largeur sur le dernier module
 * pour absorber le filet dans un panneau plus large.
 */
const RIVE_MINI_MM = 300;

/**
 * DTU 45.4 Mode B — Répartition symétrique depuis le centre.
 * Règle anti-filet : si rive < 300 mm, redistribue sur le dernier module.
 *
 * Retourne les largeurs de colonnes (en mètres) de gauche à droite.
 */
function axeSymetriqueHPL(
  dimTotaleM: number,
  dimModuleMm: number,
  jointMm: number
): { largeurs: number[]; antiFiletApplique: boolean } {
  const jointM = jointMm / 1000;
  const dimModuleM = Math.max(0.1, dimModuleMm / 1000);
  const riveMiniM = RIVE_MINI_MM / 1000;

  if (dimTotaleM <= 0) return { largeurs: [0], antiFiletApplique: false };
  if (dimTotaleM <= dimModuleM) return { largeurs: [dimTotaleM], antiFiletApplique: false };

  // Pas de trame incluant le joint : chaque module occupe (dimModule + joint), sauf le dernier
  const nFull = Math.floor((dimTotaleM + jointM) / (dimModuleM + jointM));
  const resteM = dimTotaleM - (nFull * (dimModuleM + jointM) - jointM);

  let largeurs: number[];
  let antiFiletApplique = false;

  if (resteM < EPSILON_M) {
    // Façade exactement remplie par des modules entiers
    largeurs = Array(Math.max(1, nFull)).fill(dimModuleM);
  } else {
    // Répartition symétrique : rive = reste / 2
    const bout = resteM / 2;

    if (bout < riveMiniM && nFull >= 2) {
      // Règle anti-filet : rive trop petite → absorbe-la dans le premier/dernier module plein
      // Le module de rive devient : dimModule + bout (toujours ≤ plaque brute)
      const moduleRiveM = dimModuleM + bout;
      antiFiletApplique = true;
      // n-2 modules centraux pleins + 2 modules de rive élargis
      largeurs = [
        moduleRiveM,
        ...Array(Math.max(0, nFull - 2)).fill(dimModuleM),
        moduleRiveM,
      ];
    } else if (bout < riveMiniM && nFull === 1) {
      // Seul un module central, la rive est trop petite : un seul grand module
      largeurs = [dimTotaleM];
      antiFiletApplique = true;
    } else {
      // Rive conforme ≥ 300 mm : disposition normale (rive | modules | rive)
      largeurs = [bout, ...Array(nFull).fill(dimModuleM), bout];
    }
  }

  return { largeurs, antiFiletApplique };
}

/**
 * DTU 45.4 Mode A — Hauteurs de rangées alignées sur les hauteurs de linteau des ouvertures.
 *
 * Principe :
 * 1. Collecter toutes les hauteurs de linteau uniques des ouvertures (triées, dédoublonnées).
 * 2. Découper la hauteur totale selon ces niveaux de référence, en subdivisant
 *    chaque tranche par les modules cibles (axeEquivalent).
 * 3. Si aucune ouverture ou hauteurs de linteau absentes, repli sur axeEquivalent.
 */
function axeLinteauHPL(
  hauteurTotaleM: number,
  dimModuleMm: number,
  ouvertures: OuvertureCalepinage[],
  jointMm: number
): number[] {
  const dimModuleM = Math.max(0.1, dimModuleMm / 1000);

  // Hauteurs de linteau : hauteur du bas du linteau depuis le sol
  const linteaux = ouvertures
    .map((o) => {
      // Si hauteurLinteauM renseigné, utiliser directement
      if (o.hauteurLinteauM != null && o.hauteurLinteauM > 0) return o.hauteurLinteauM;
      // Sinon déduire : linteau = hauteur de l'ouverture (porte : depuis le sol, fenêtre : à corriger si possible)
      return o.hauteur;
    })
    .filter((h) => h > EPSILON_M && h < hauteurTotaleM - EPSILON_M);

  if (linteaux.length === 0) {
    // Mode B par défaut si pas de hauteur de linteau connue
    return axeEquivalent(hauteurTotaleM, dimModuleMm);
  }

  // Niveaux de découpe = 0, linteaux triés, hauteurTotale
  const niveaux = Array.from(new Set([0, ...linteaux, hauteurTotaleM])).sort((a, b) => a - b);

  const rangees: number[] = [];
  for (let i = 0; i < niveaux.length - 1; i++) {
    const tranche = niveaux[i + 1] - niveaux[i];
    if (tranche < EPSILON_M) continue;
    // Subdivise la tranche en modules cibles
    const sub = axeEquivalent(tranche, dimModuleMm);
    rangees.push(...sub);
  }

  return rangees.length > 0 ? rangees : axeEquivalent(hauteurTotaleM, dimModuleMm);
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
export function genererPlanDebitNesting(
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

  const piecesToPlace: PieceToPlace[] = [];
  const processedPieceIds = new Set<string>();

  for (let i = 0; i < pieces.length; i++) {
    const p1 = pieces[i];
    if (processedPieceIds.has(p1.id)) continue;

    let paired = false;
    // Si c'est une pièce de pignon, essayons de trouver son miroir
    if (p1.type === "pignon" && p1.points && p1.points.length >= 3) {
      // Trouver la hauteur gauche et droite
      const pts1 = [...p1.points].sort((a, b) => a.xM - b.xM);
      const leftPts1 = pts1.filter(pt => Math.abs(pt.xM - pts1[0].xM) < 0.01);
      const rightPts1 = pts1.filter(pt => Math.abs(pt.xM - pts1[pts1.length-1].xM) < 0.01);
      
      const hL1 = Math.max(...leftPts1.map(pt => pt.yM)) - Math.min(...leftPts1.map(pt => pt.yM));
      const hR1 = Math.max(...rightPts1.map(pt => pt.yM)) - Math.min(...rightPts1.map(pt => pt.yM));

      for (let j = i + 1; j < pieces.length; j++) {
        const p2 = pieces[j];
        if (p2.type === "pignon" && p2.points && !processedPieceIds.has(p2.id)) {
          // Vérifier si p2 est le miroir exact
          if (Math.abs(p1.largeurNetteMm - p2.largeurNetteMm) < 2) {
            const pts2 = [...p2.points].sort((a, b) => a.xM - b.xM);
            const leftPts2 = pts2.filter(pt => Math.abs(pt.xM - pts2[0].xM) < 0.01);
            const rightPts2 = pts2.filter(pt => Math.abs(pt.xM - pts2[pts2.length-1].xM) < 0.01);
            
            const hL2 = Math.max(...leftPts2.map(pt => pt.yM)) - Math.min(...leftPts2.map(pt => pt.yM));
            const hR2 = Math.max(...rightPts2.map(pt => pt.yM)) - Math.min(...rightPts2.map(pt => pt.yM));

            // Si hL1 == hR2 et hR1 == hL2, c'est un miroir !
            if (Math.abs(hL1 - hR2) < 0.05 && Math.abs(hR1 - hL2) < 0.05) {
              // On peut les fusionner dans un seul rectangle
              const combinedHeightM = hL1 + hR1; // since hL1 + hR1 = hL1 + hL2 (trait de scie inclus dans p.hauteurNetteMm mais on va juste faire la somme des hauteurs nettes)
              // En fait, la hauteur combinée est la somme des hauteurs max des deux, moins le chevauchement.
              // Plus simplement: H = hL1 + hR1
              const combinedHeightMm = Math.round(combinedHeightM * 1000) + traitDeScieMm;
              
              piecesToPlace.push({
                sourcePiece: {
                  ...p1,
                  repere: p1.repere + " + " + p2.repere,
                  surfaceM2: p1.surfaceM2 + p2.surfaceM2,
                  estPairePignon: true
                } as any,
                wMm: p1.largeurNetteMm,
                hMm: combinedHeightMm,
                surfaceM2: p1.surfaceM2 + p2.surfaceM2,
              });
              
              processedPieceIds.add(p1.id);
              processedPieceIds.add(p2.id);
              paired = true;
              break;
            }
          }
        }
      }
    }

    if (!paired) {
      piecesToPlace.push({
        sourcePiece: p1,
        wMm: p1.largeurNetteMm || Math.round(p1.largeurM * 1000),
        hMm: p1.hauteurNetteMm || Math.round(p1.hauteurM * 1000),
        surfaceM2: p1.surfaceM2,
      });
      processedPieceIds.add(p1.id);
    }
  }

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
                zoneId: sourcePiece.zoneId,
                zoneNom: sourcePiece.zoneNom,
            };

            shelf.pieces.push(decPiece);
            shelf.currentXMm += ori.w + traitDeScieMm;
            sourcePiece.plaqueIndex = sheet.index;
            placed = true;
            break;
          }
        }
        if (placed) break;

        // 2. Créer une nouvelle étagère dans cette plaque si hauteur et largeur suffisantes
        if (rawH - sheet.currentYMm >= ori.h && rawL >= ori.w) {
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
                zoneId: sourcePiece.zoneId,
                zoneNom: sourcePiece.zoneNom,
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
      // Choisir l'orientation qui rentre physiquement dans la plaque (sinon fallback)
      let chosenOri = orientations[0];
      for (const ori of orientations) {
        if (ori.w <= rawL && ori.h <= rawH) {
          chosenOri = ori;
          break;
        }
      }

      const newShelf: Shelf2D = {
        yMm: 0,
        heightMm: chosenOri.h,
        currentXMm: chosenOri.w + traitDeScieMm,
        pieces: [
          {
            id: sourcePiece.id,
            repere: sourcePiece.repere,
            nom: `${sourcePiece.repere} (${chosenOri.w}×${chosenOri.h})`,
            xMm: 0,
            yMm: 0,
            largeurMm: chosenOri.w,
            hauteurMm: chosenOri.h,
            surfaceM2: sourcePiece.surfaceM2,
            type: sourcePiece.type,
            colonne: sourcePiece.colonne,
            rangee: sourcePiece.rangee,
                zoneId: sourcePiece.zoneId,
                zoneNom: sourcePiece.zoneNom,
          },
        ],
      };

      sheets.push({
        index: newSheetIndex,
        shelves: [newShelf],
        currentYMm: chosenOri.h + traitDeScieMm,
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

    const tauxRendementPct = surfacePlaqueM2 > 0 ? Math.min(100, (surfaceUtileM2 / surfacePlaqueM2) * 100) : 0;

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

/**
 * Calcule les quantitatifs quincaillerie DTU 45.4 HPL à partir du résultat de calepinage.
 *
 * Règles métier :
 * - 1 perçage Point Fixe Ø 5,1 mm au centre (en haut) de chaque panneau M (module plein) et R (rive).
 * - 2 perçages Points Coulissants Ø 8 mm par panneau (1 gauche + 1 droite, sur les mêmes chevrons).
 * - Équerres Isolco : 1 porteuse (Point Fixe) + 2 guides (Points Coulissants) par panneau.
 * - Chevilles Spit MP3 Ø12 mm : 2 par équerre.
 * - Tirefonds Inox A2 Ø6×60 mm : 4 vis par équerre porteuse (Point Fixe) + 2 par équerre guide.
 */
function calculerQuincaillerieHPL(
  pieces: PieceCalepinage[],
  lineaireJointsM: number,
  epaisseurIsolantMm: number,
  antiFiletApplique: boolean,
  modeCalepinage: "A_linteau" | "B_symetrique",
  linteauxM: number[]
): QuincaillerieHPL {
  // Filtrer les pièces non pignon (M + R uniquement)
  const piecesMR = pieces.filter((p) => p.type !== "pignon");
  const nbPanneaux = piecesMR.length;

  // Perçages
  const nbPercagesPointFixe51 = nbPanneaux; // 1 PF par panneau
  const nbPercagesPointsCoulissants8 = nbPanneaux * 2; // 2 PC par panneau
  const nbVisParementTotal = nbPercagesPointFixe51 + nbPercagesPointsCoulissants8;

  // Équerres Isolco : 1 porteuse + 2 guides par panneau (3 équerres/panneau)
  const nbEquerresIsolcoPorteuses = nbPanneaux; // 1 porteuse par panneau (Point Fixe)
  const nbEquerresIsolcoGuides = nbPanneaux * 2; // 2 guides par panneau (Points Coulissants)
  const nbEquerresIsolcoTotal = nbEquerresIsolcoPorteuses + nbEquerresIsolcoGuides;

  // Modèle d'équerre Isolco selon épaisseur d'isolant
  const porteeEquerre = epaisseurIsolantMm + 20; // +20mm lame d'air réglementaire
  const tailleEquerre = Math.max(60, Math.ceil(porteeEquerre / 20) * 20);
  const modeleEquerreIsolco = epaisseurIsolantMm > 0
    ? `Isolco 3000 P2 ${tailleEquerre} mm (Isolant ${epaisseurIsolantMm}mm + lame d'air 20mm)`
    : `Isolco 3000 P2 60 mm (lame d'air seule)`;

  // Chevilles Spit MP3 : 2 par équerre
  const nbChevilles_SpitMP3 = nbEquerresIsolcoTotal * 2;

  // Tirefonds Inox A2 Ø6×60mm : 4 par porteuse + 2 par guide
  const nbTirefondsInox = nbEquerresIsolcoPorteuses * 4 + nbEquerresIsolcoGuides * 2;

  // Linéaire de joints mastic (= linéaire total des joints de dilatation)
  const lineaireJointsMastic = lineaireJointsM;

  // Instructions de perçage conformes DTU 45.4
  const instructionPercagePointFixe =
    "Point Fixe HPL : 1 trou Ø 5,1 mm centré en haut de chaque panneau — fraise à 90° pour tête conique — jeu de 0,5 mm entre vis et bord du trou.";
  const instructionPercagePointsCoulissants =
    "Points Coulissants HPL : 2 trous Ø 8 mm (gauche + droite) par panneau — trou oblong Ø8×12mm recommandé pour dilatation — vis à tête ronde Ø 5 mm.";
  const notePercage =
    "DTU 45.4 § 6.4 : Perçage HPL à froid — vitesse lente (< 1000 tr/min), sans percussion. " +
    "Distance bord-trou ≥ 20 mm. Vis INOX A2 minimum, brossée ou laquée assortie. " +
    "Chevillage mural Spit MP3 : Ø 12 mm, profondeur 70 mm mini, couple 15 Nm (clé dynamométrique).";

  // Résumé alignement linteau
  const resumeAlignementLinteau = modeCalepinage === "A_linteau" && linteauxM.length > 0
    ? `Mode A (ouvertures) — joints horizontaux alignés sur ${linteauxM.length} niveaux de linteau : ` +
      linteauxM.map((h) => `${(h * 100).toFixed(0)} cm`).join(", ") + "."
    : "Mode B (symétrique depuis le centre) — aucune ouverture détectée ou pas de hauteur de linteau renseignée.";

  return {
    nbPercagesPointFixe51,
    nbPercagesPointsCoulissants8,
    nbVisParementTotal,
    instructionPercagePointFixe,
    instructionPercagePointsCoulissants,
    notePercage,
    nbEquerresIsolcoPorteuses,
    nbEquerresIsolcoGuides,
    nbEquerresIsolcoTotal,
    modeleEquerreIsolco,
    nbChevilles_SpitMP3,
    instructionChevilles:
      `Chevilles Spit MP3 Ø12×70mm — ${nbChevilles_SpitMP3} unités (2/équerre) — ` +
      "perçage Ø12mm profondeur 70mm, distance mini 10 cm des arêtes maçonnerie, couple 15 Nm.",
    nbTirefondsInox,
    lineaireJointsMastic,
    antiFiletApplique,
    modeCalepinage,
    resumeAlignementLinteau,
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
    jointMm = 8, // Joint de dilatation standard 8 mm (DTU 45.4 / DTU 41.2)
    ouvertures = null,
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
  let dimModuleLargeurAxeMm = modLargeurMm;
  let dimModuleHauteurAxeMm = modHauteurMm;
  
  if (sens === "vertical") {
    // Vertical : la hauteur doit être la plus grande dimension
    dimModuleLargeurAxeMm = Math.min(modLargeurMm, modHauteurMm);
    dimModuleHauteurAxeMm = Math.max(modLargeurMm, modHauteurMm);
  } else {
    // Horizontal : la largeur doit être la plus grande dimension
    dimModuleLargeurAxeMm = Math.max(modLargeurMm, modHauteurMm);
    dimModuleHauteurAxeMm = Math.min(modLargeurMm, modHauteurMm);
  }

  // ================================================================
  // 3. DTU 45.4 HPL — CALEPINAGE HORIZONTAL (COLONNES / LARGEUR)
  //    Remplacé par la Pose à l'Avancement (Calculé dans la boucle de génération)
  // ================================================================

  // ================================================================
  // 4. DTU 45.4 HPL — CALEPINAGE VERTICAL (RANGÉES / HAUTEUR)
  //    Mode A si ouvertures avec linteaux, sinon Mode B (axeEquivalent)
  // ================================================================
  const ouverturesValides: OuvertureCalepinage[] =
    (ouvertures ?? []).filter((o) => o.hauteur > 0);

  const linteauxM = ouverturesValides
    .map((o) => o.hauteurLinteauM != null && o.hauteurLinteauM > 0 ? o.hauteurLinteauM : o.hauteur)
    .filter((h) => h > EPSILON_M && h < hauteurTotale - EPSILON_M);

  const modeCalepinage: "A_linteau" | "B_symetrique" =
    linteauxM.length > 0 ? "A_linteau" : "B_symetrique";

  let rangeesHauteursM: number[];
  if (modeCalepinage === "A_linteau") {
    rangeesHauteursM = axeLinteauHPL(hauteurTotale, dimModuleHauteurAxeMm, ouverturesValides, epaisseurJointMm);
  } else {
    rangeesHauteursM = axeEquivalent(hauteurTotale, dimModuleHauteurAxeMm);
  }

  // ================================================================
  // 5. GÉNÉRATION DES PIÈCES (MODULES / RIVES / PIGNONS)
  // ================================================================
  const pieces: PieceCalepinage[] = [];
  let yCumul = 0;
  let compteurPieces = 1;
  let compteurRives = 1;
  let compteurPignons = 1;

  const dimModuleLargeurAxeM = dimModuleLargeurAxeMm / 1000;
  
  // 5.1 Calepinage Adaptatif Symétrique : Optimisation de la largeur des colonnes
  const traitDeScieM = (traitDeScieMm ?? 3) / 1000;
  const plaqueL_M = (sens === "vertical" ? rawLargeurMm : rawLongueurMm) / 1000;
  const plaqueH_M = (sens === "vertical" ? rawLongueurMm : rawLargeurMm) / 1000;

  const opt = trouverMeilleureGrilleSymetrique(
    largeur,
    hauteurMur,
    hauteurFaite,
    jointM,
    rangeesHauteursM[0] || dimModuleHauteurAxeMm / 1000,
    plaqueL_M,
    plaqueH_M,
    traitDeScieM
  );
  
  const colonnesLargeursM = opt.largeurs;
  
  // Anti-filet n'est techniquement plus un hack fixe, l'optimiseur ne sort pas de pièces < 150mm.
  let antiFiletApplique = false;

  rangeesHauteursM.forEach((hauteurPiece, rangee) => {
    let xCumul = 0;

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
        } else if (estRive) {
          type = "coupe";
          repere = `R-${String(compteurRives++).padStart(2, "0")}`;
        }

        const largeurNetteMm = Math.max(50, Math.round(largeurPiece * 1000)); // L'optimiseur renvoie déjà la cote nette !
        const hauteurNetteMm = Math.max(50, Math.round(hauteurPiece * 1000 - epaisseurJointMm)); // Hauteur est toujours en entraxe

        pieces.push({
          id: `piece-r${rangee}-c${colonne}`,
          repere,
          colonne,
          rangee,
          xM: pieceX,
          yM: yCumul,
          largeurM: largeurPiece, // C'est la cote nette, mais pour l'affichage SVG ça dessine les blocs
          hauteurM: hauteurPiece,
          largeurNetteMm,
          hauteurNetteMm,
          type,
          surfaceM2,
          points: estCoupePignon ? points : undefined,
        });
      }

      xCumul += largeurPiece + jointM; // largeurPiece est nette, on ajoute le joint pour décaler le X de la pièce suivante
    });

    yCumul += hauteurPiece; // hauteurPiece est une cote Axe, donc elle inclut déjà l'espace du joint
  });

  const surfaceZoneM2 = pieces.reduce((s, p) => s + p.surfaceM2, 0);
  const nbPiecesPosees = pieces.length;

  // 6. OPTIMISATION NESTING DANS LES PLAQUES BRUTES FOURNISSEUR
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

  // 7. CALCUL PRÉCIS DES CHUTES & PERTES RÉELLES
  const totalChutesReutilisablesM2 = plaquesDebit.reduce(
    (s, p) => s + p.surfaceChutesReutilisablesM2,
    0
  );

  const totalDechetsPerteM2 = Math.max(
    0,
    surfacePlaquesAchetesM2 - surfaceZoneM2 - totalChutesReutilisablesM2
  );

  const chuteBruteM2 = Math.max(0, surfacePlaquesAchetesM2 - surfaceZoneM2);
  const tauxChuteBrutePct =
    surfacePlaquesAchetesM2 > 0
      ? (chuteBruteM2 / surfacePlaquesAchetesM2) * 100
      : 0;

  const tauxChuteNettePct =
    surfacePlaquesAchetesM2 > 0
      ? (totalDechetsPerteM2 / surfacePlaquesAchetesM2) * 100
      : 0;

  // 8. RÉSUMÉ ET MÉTADONNÉES DE POSE
  // ================================================================
  
  // Total vertical joints = total pieces minus the first piece of each row
  const nbJointsVerticaux = pieces.length - rangeesHauteursM.length;
  // Total horizontal joints = one per row transition
  const nbJointsHorizontaux = Math.max(0, rangeesHauteursM.length - 1);
  
  // Le linéaire des joints verticaux est la somme des hauteurs de toutes les pièces (sauf la première de chaque rangée)
  const lineaireJointsVerticauxM = pieces.reduce((s, p) => p.colonne > 0 ? s + p.hauteurM : s, 0);
  const lineaireJointsHorizontauxM = Math.max(0, rangeesHauteursM.length - 1) * largeur;
  const lineaireJointsM = lineaireJointsVerticauxM + lineaireJointsHorizontauxM;
  const surfaceJointsM2 = lineaireJointsM * jointM;

  const pentePct =
    estPignon && largeur > 0
      ? ((hauteurFaite - hauteurMur) / (largeur / 2)) * 100
      : 0;

  // 9. QUANTITATIFS QUINCAILLERIE DTU 45.4 HPL
  // Épaisseur isolant par défaut 120 mm si non précisé dans l'input
  // (l'input ne porte pas directement l'isolant — utilisé avec poseCalcul séparément)
  const epaisseurIsolantMm = 120; // valeur conservative standard
  const quincaillerie = calculerQuincaillerieHPL(
    pieces,
    lineaireJointsM,
    epaisseurIsolantMm,
    antiFiletApplique,
    modeCalepinage,
    linteauxM
  );

  // 10. CALCUL DES MÈTRES LINÉAIRES DE COUPE (ML)
  // Approximation : on compte la largeur + hauteur nette de chaque pièce débitée.
  // Cela représente les traits de scie croisés dans l'atelier + les rives/pignons.
  const totalCoupesML = pieces.reduce(
    (sum, p) => sum + (p.largeurNetteMm / 1000) + (p.hauteurNetteMm / 1000), 
    0
  );

  return {
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
    totalCoupesML,
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
    quincaillerie,
  };
}


export interface CalepinageGlobalInput {
  zones: (CalepinageInput & { zoneId: string; zoneNom: string })[];
  plaqueLongueurMm: number;
  plaqueLargeurMm: number;
  moduleLargeurMm: number;
  moduleHauteurMm: number;
  traitDeScieMm?: number;
}

export interface ResultatCalepinageGlobal {
  plaquesDebit: PlaqueDebit[];
  pieces: PieceCalepinage[];
  nbPlaquesNecessaires: number;
  surfacePlaquesAchetesM2: number;
  totalChutesReutilisablesM2: number;
  totalDechetsPerteM2: number;
  tauxChuteBrutePct: number;
  tauxChuteNettePct: number;
  resultatsMur: Record<string, ResultatCalepinage>;
}

export function calculerCalepinageGlobal(input: CalepinageGlobalInput): ResultatCalepinageGlobal {
  const { zones, plaqueLongueurMm, plaqueLargeurMm, moduleLargeurMm, moduleHauteurMm, traitDeScieMm = 3 } = input;
  
  let allPieces: PieceCalepinage[] = [];
  const resultatsMur: Record<string, ResultatCalepinage> = {};
  
  for (const zone of zones) {
    const res = calculerCalepinage({
      ...zone,
      plaqueLongueurMm,
      plaqueLargeurMm,
      moduleLargeurMm,
      moduleHauteurMm,
    });
    
    resultatsMur[zone.zoneId] = res;
    for (const p of res.pieces) {
      allPieces.push({
        ...p,
        id: `${zone.zoneId}-${p.id}`,
        repere: `${zone.zoneNom} - ${p.repere}`,
        zoneId: zone.zoneId,
        zoneNom: zone.zoneNom,
      });
    }
  }
  
  const nestingResult = genererPlanDebitNesting(
    allPieces,
    plaqueLongueurMm,
    plaqueLargeurMm,
    moduleLargeurMm,
    moduleHauteurMm,
    traitDeScieMm
  );
  
  const plaquesDebit = nestingResult.plaquesDebit;
  const nbPlaquesNecessaires = plaquesDebit.length;
  const surfacePlaqueBruteM2 = (plaqueLongueurMm * plaqueLargeurMm) / 1_000_000;
  const surfacePlaquesAchetesM2 = nbPlaquesNecessaires * surfacePlaqueBruteM2;
  const surfaceZoneM2 = allPieces.reduce((s, p) => s + p.surfaceM2, 0);
  
  const totalChutesReutilisablesM2 = plaquesDebit.reduce(
    (s, p) => s + p.surfaceChutesReutilisablesM2,
    0
  );

  const totalDechetsPerteM2 = Math.max(
    0,
    surfacePlaquesAchetesM2 - surfaceZoneM2 - totalChutesReutilisablesM2
  );

  const chuteBruteM2 = Math.max(0, surfacePlaquesAchetesM2 - surfaceZoneM2);
  const tauxChuteBrutePct =
    surfacePlaquesAchetesM2 > 0
      ? (chuteBruteM2 / surfacePlaquesAchetesM2) * 100
      : 0;

  const tauxChuteNettePct =
    surfacePlaquesAchetesM2 > 0
      ? (totalDechetsPerteM2 / surfacePlaquesAchetesM2) * 100
      : 0;
      
  return {
    plaquesDebit,
    pieces: allPieces,
    nbPlaquesNecessaires,
    surfacePlaquesAchetesM2,
    totalChutesReutilisablesM2,
    totalDechetsPerteM2,
    tauxChuteBrutePct,
    tauxChuteNettePct,
    resultatsMur,
  };
}
