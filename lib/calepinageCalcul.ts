// lib/calepinageCalcul.ts
// Calepinage HPL : façade rectangulaire ou pignon complet.
//
// V1 :
// - aucune rotation de la plaque fournisseur
// - axe largeur : calepinage symétrique
// - axe hauteur : rangées équivalentes
// - un pignon est calculé sur toute sa géométrie, triangle compris
// - les pièces du triangle sont des polygones découpés par les rampants
// - l'optimisation avancée du débit dans les plaques brutes fournisseur sera faite
//   dans le moteur de nesting V2.

export type SensPose = "horizontal" | "vertical";

export interface CalepinageInput {
  zoneLargeurM: number;
  zoneHauteurM: number; // hauteur à l'égout / hauteur du rectangle
  plaqueLongueurMm: number;
  plaqueLargeurMm: number;
  sensPose: SensPose;
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
  nbPlaquesNecessaires: number;
  nbPiecesPosees: number;
  surfaceZoneM2: number;
  surfacePlaquesAchetesM2: number;
  tauxChutePct: number;
  nbJoints: number;
  estPignon: boolean;
  hauteurFaiteM: number;
  pentePct: number;
}

const EPSILON_M = 0.0005;

function axeSymetrique(dimTotaleM: number, dimPlaqueMaxMm: number): number[] {
  const dimPlaqueMaxM = dimPlaqueMaxMm / 1000;
  if (dimPlaqueMaxM <= 0 || dimTotaleM <= 0) return [Math.max(0, dimTotaleM)];

  const nFull = Math.floor(dimTotaleM / dimPlaqueMaxM);
  const reste = dimTotaleM - nFull * dimPlaqueMaxM;

  if (reste < EPSILON_M) return Array(Math.max(1, nFull)).fill(dimPlaqueMaxM);
  if (nFull === 0) return [dimTotaleM];

  const bout = reste / 2;
  return [bout, ...Array(nFull).fill(dimPlaqueMaxM), bout];
}

function axeEquivalent(dimTotaleM: number, dimPlaqueMaxMm: number): number[] {
  const dimPlaqueMaxM = dimPlaqueMaxMm / 1000;
  if (dimPlaqueMaxM <= 0 || dimTotaleM <= 0) return [Math.max(0, dimTotaleM)];

  const n = Math.max(1, Math.ceil(dimTotaleM / dimPlaqueMaxM));
  const h = dimTotaleM / n;
  return Array(n).fill(h);
}

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

// Coupe un polygone par une demi-plan a*x + b*y <= c.
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

// Découpe un rectangle de calepinage par les deux rampants du pignon.
// Le pignon est défini par :
// (0,0) -> (largeur,0) -> (largeur,Hmur) -> (largeur/2,Hfaîte) -> (0,Hmur).
function decouperParPignon(
  rectangle: PointCalepinage[],
  largeurM: number,
  hauteurMurM: number,
  hauteurFaiteM: number
): PointCalepinage[] {
  const delta = Math.max(0, hauteurFaiteM - hauteurMurM);
  if (delta <= EPSILON_M) return rectangle;

  // y <= Hmur + pente*x
  const pente = delta / (largeurM / 2);
  let clipped = clipHalfPlane(rectangle, -pente, 1, hauteurMurM);

  // y <= Hmur + pente*(largeur-x)
  // => pente*x + y <= Hmur + pente*largeur
  clipped = clipHalfPlane(clipped, pente, 1, hauteurMurM + pente * largeurM);

  return clipped;
}

export function calculerCalepinage(input: CalepinageInput): ResultatCalepinage {
  const {
    zoneLargeurM,
    zoneHauteurM,
    plaqueLongueurMm,
    plaqueLargeurMm,
    sensPose,
    estPignon = false,
    hauteurFaiteM = null,
  } = input;

  const largeur = Math.max(0, zoneLargeurM);
  const hauteurMur = Math.max(0, zoneHauteurM);
  const hauteurFaite = estPignon
    ? Math.max(hauteurMur, hauteurFaiteM ?? hauteurMur)
    : hauteurMur;

  const dimPlaqueLargeurAxeMm =
    sensPose === "horizontal" ? plaqueLongueurMm : plaqueLargeurMm;
  const dimPlaqueHauteurAxeMm =
    sensPose === "horizontal" ? plaqueLargeurMm : plaqueLongueurMm;

  const colonnesLargeursM = axeSymetrique(largeur, dimPlaqueLargeurAxeMm);
  const rangeesHauteursM = axeEquivalent(hauteurMur, dimPlaqueHauteurAxeMm);
  const dimPlaqueLargeurAxeM = dimPlaqueLargeurAxeMm / 1000;

  const pieces: PieceCalepinage[] = [];
  let yCumul = 0;

  rangeesHauteursM.forEach((hauteur, rangee) => {
    let xCumul = 0;

    colonnesLargeursM.forEach((largeurPiece, colonne) => {
      const rectangle: PointCalepinage[] = [
        { xM: xCumul, yM: yCumul },
        { xM: xCumul + largeurPiece, yM: yCumul },
        { xM: xCumul + largeurPiece, yM: yCumul + hauteur },
        { xM: xCumul, yM: yCumul + hauteur },
      ];

      const points = estPignon
        ? decouperParPignon(rectangle, largeur, hauteurMur, hauteurFaite)
        : rectangle;

      const surfaceM2 = airePolygone(points);
      const pleine =
        !estPignon &&
        Math.abs(largeurPiece - dimPlaqueLargeurAxeM) < EPSILON_M;

      // Un morceau du triangle est forcément une découpe, même si sa largeur
      // au niveau de la base correspond exactement à une plaque entière.
      const type: PieceCalepinage["type"] = pleine ? "pleine" : "coupe";

      if (surfaceM2 > EPSILON_M * EPSILON_M) {
        pieces.push({
          colonne,
          rangee,
          xM: xCumul,
          yM: yCumul,
          largeurM: largeurPiece,
          hauteurM: hauteur,
          type,
          surfaceM2,
          points: estPignon ? points : undefined,
        });
      }

      xCumul += largeurPiece;
    });

    yCumul += hauteur;
  });

  const surfaceZoneM2 = pieces.reduce((s, p) => s + p.surfaceM2, 0);
  const nbPiecesPosees = pieces.length;

  // Jusqu'à l'arrivée du moteur de nesting avancé, on conserve une estimation
  // prudente du nombre de plaques brutes : une plaque achetée doit au minimum
  // couvrir la surface totale à poser. Pour un pignon, on ajoute les chutes de
  // découpe du triangle comme surface réellement consommée.
  const surfacePlaqueBruteM2 =
    Math.max(0, plaqueLongueurMm / 1000) * Math.max(0, plaqueLargeurMm / 1000);
  const nbPlaquesNecessaires =
    surfacePlaqueBruteM2 > 0 ? Math.ceil(surfaceZoneM2 / surfacePlaqueBruteM2) : 0;

  const surfacePlaquesAchetesM2 = nbPlaquesNecessaires * surfacePlaqueBruteM2;
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
  };
}
