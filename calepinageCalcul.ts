// lib/calepinageCalcul.ts
// Calcule le plan de découpe (calepinage) des plaques HPL pour une zone rectangulaire.
//
// Règles métier (données par l'utilisateur) :
// - Aucune rotation des plaques (sens fixe : laquage/fil directionnel)
// - Axe largeur (gauche/droite du mur) : SYMÉTRIQUE — on pose des plaques pleines au centre,
//   en partant des deux angles vers le centre, avec deux chutes égales aux extrémités
// - Axe hauteur : RANGÉES ÉQUIVALENTES — on divise en hauteurs égales plutôt qu'une pleine + un reste
// - Ne gère que les zones rectangulaires (pour un pignon, n'appeler ce calcul que sur la partie
//   rectangulaire sous l'égout ; le triangle de pente reste à ajuster manuellement sur site)

export type SensPose = "horizontal" | "vertical";

export interface CalepinageInput {
  zoneLargeurM: number;
  zoneHauteurM: number;
  plaqueLongueurMm: number; // grande dimension de la plaque stock
  plaqueLargeurMm: number; // petite dimension de la plaque stock
  sensPose: SensPose;
}

export interface PieceCalepinage {
  colonne: number;
  rangee: number;
  xM: number;
  yM: number;
  largeurM: number;
  hauteurM: number;
  type: "pleine" | "coupe";
}

export interface ResultatCalepinage {
  colonnesLargeursM: number[];
  rangeesHauteursM: number[];
  pieces: PieceCalepinage[];
  nbPlaquesNecessaires: number;
  surfaceZoneM2: number;
  surfacePlaquesAchetesM2: number;
  tauxChutePct: number;
  nbJoints: number;
}

const EPSILON_M = 0.0005; // tolérance 0,5 mm pour les comparaisons flottantes

// Axe symétrique : plaques pleines au centre, deux chutes égales aux extrémités.
function axeSymetrique(dimTotaleM: number, dimPlaqueMaxMm: number): number[] {
  const dimPlaqueMaxM = dimPlaqueMaxMm / 1000;
  if (dimPlaqueMaxM <= 0 || dimTotaleM <= 0) return [Math.max(0, dimTotaleM)];

  const nFull = Math.floor(dimTotaleM / dimPlaqueMaxM);
  const reste = dimTotaleM - nFull * dimPlaqueMaxM;

  if (reste < EPSILON_M) {
    // La largeur tombe pile sur un nombre entier de plaques pleines
    return Array(Math.max(1, nFull)).fill(dimPlaqueMaxM);
  }
  if (nFull === 0) {
    // La zone est plus étroite qu'une plaque : une seule pièce coupée
    return [dimTotaleM];
  }

  const bout = reste / 2;
  return [bout, ...Array(nFull).fill(dimPlaqueMaxM), bout];
}

// Axe équivalent : division en rangées de hauteur égale (pas de logique de symétrie).
function axeEquivalent(dimTotaleM: number, dimPlaqueMaxMm: number): number[] {
  const dimPlaqueMaxM = dimPlaqueMaxMm / 1000;
  if (dimPlaqueMaxM <= 0 || dimTotaleM <= 0) return [Math.max(0, dimTotaleM)];

  const n = Math.max(1, Math.ceil(dimTotaleM / dimPlaqueMaxM));
  const h = dimTotaleM / n;
  return Array(n).fill(h);
}

export function calculerCalepinage(input: CalepinageInput): ResultatCalepinage {
  const { zoneLargeurM, zoneHauteurM, plaqueLongueurMm, plaqueLargeurMm, sensPose } = input;

  // Selon le sens de pose, la grande dimension de la plaque court soit le long
  // de la largeur du mur (horizontal), soit le long de la hauteur (vertical).
  const dimPlaqueLargeurAxeMm = sensPose === "horizontal" ? plaqueLongueurMm : plaqueLargeurMm;
  const dimPlaqueHauteurAxeMm = sensPose === "horizontal" ? plaqueLargeurMm : plaqueLongueurMm;

  const colonnesLargeursM = axeSymetrique(zoneLargeurM, dimPlaqueLargeurAxeMm);
  const rangeesHauteursM = axeEquivalent(zoneHauteurM, dimPlaqueHauteurAxeMm);

  const dimPlaqueLargeurAxeM = dimPlaqueLargeurAxeMm / 1000;

  const pieces: PieceCalepinage[] = [];
  let yCumul = 0;
  rangeesHauteursM.forEach((hauteur, rangee) => {
    let xCumul = 0;
    colonnesLargeursM.forEach((largeur, colonne) => {
      const pleine = Math.abs(largeur - dimPlaqueLargeurAxeM) < EPSILON_M;
      pieces.push({
        colonne,
        rangee,
        xM: xCumul,
        yM: yCumul,
        largeurM: largeur,
        hauteurM: hauteur,
        type: pleine ? "pleine" : "coupe",
      });
      xCumul += largeur;
    });
    yCumul += hauteur;
  });

  // Toutes les rangées ont la même hauteur (division équivalente) : au plus 2 largeurs
  // de pièce distinctes existent (pleine + éventuel bout), ce qui permet un calcul de
  // nesting simple (empiler plusieurs pièces identiques dans une même plaque stock).
  const rowHeightM = rangeesHauteursM[0] ?? 0;
  const nbColonnesPleines = colonnesLargeursM.filter(
    (l) => Math.abs(l - dimPlaqueLargeurAxeM) < EPSILON_M
  ).length;
  const largeurBout = colonnesLargeursM.find(
    (l) => Math.abs(l - dimPlaqueLargeurAxeM) >= EPSILON_M
  );
  const nbColonnesBout = colonnesLargeursM.length - nbColonnesPleines;

  const nbRangees = rangeesHauteursM.length;
  const nbPiecesPleines = nbColonnesPleines * nbRangees;
  const nbPiecesBout = nbColonnesBout * nbRangees;

  const piecesParPlaquePleine = Math.max(
    1,
    Math.floor(dimPlaqueHauteurAxeMm / (rowHeightM * 1000))
  );
  const nbPlaquesPleine = nbPiecesPleines > 0 ? Math.ceil(nbPiecesPleines / piecesParPlaquePleine) : 0;

  let nbPlaquesBout = 0;
  if (nbPiecesBout > 0 && largeurBout) {
    const piecesParPlaqueBoutLargeur = Math.max(
      1,
      Math.floor(dimPlaqueLargeurAxeMm / (largeurBout * 1000))
    );
    const piecesParPlaqueBoutHauteur = Math.max(
      1,
      Math.floor(dimPlaqueHauteurAxeMm / (rowHeightM * 1000))
    );
    const piecesParPlaqueBout = piecesParPlaqueBoutLargeur * piecesParPlaqueBoutHauteur;
    nbPlaquesBout = Math.ceil(nbPiecesBout / piecesParPlaqueBout);
  }

  const nbPlaquesNecessaires = nbPlaquesPleine + nbPlaquesBout;

  const surfaceZoneM2 = zoneLargeurM * zoneHauteurM;
  const surfacePlaquesAchetesM2 =
    nbPlaquesNecessaires * (plaqueLongueurMm / 1000) * (plaqueLargeurMm / 1000);
  const tauxChutePct =
    surfacePlaquesAchetesM2 > 0
      ? ((surfacePlaquesAchetesM2 - surfaceZoneM2) / surfacePlaquesAchetesM2) * 100
      : 0;

  const nbJointsVerticaux = (colonnesLargeursM.length - 1) * nbRangees;
  const nbJointsHorizontaux = (nbRangees - 1) * colonnesLargeursM.length;

  return {
    colonnesLargeursM,
    rangeesHauteursM,
    pieces,
    nbPlaquesNecessaires,
    surfaceZoneM2,
    surfacePlaquesAchetesM2,
    tauxChutePct,
    nbJoints: nbJointsVerticaux + nbJointsHorizontaux,
  };
}
