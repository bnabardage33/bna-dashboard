// lib/poseCalcul.ts
// Moteur de calcul technique de pose de bardage, basé sur le Guide Technique Chantier
// "Manuel intégral de pose de bardage" (v2026.1).
//
// Règle commune à tous les matériaux (infrastructure Isolco 3000 P2 + Spit MP3-S) :
// - Entraxe vertical des équerres : 1,35 m max, réduit à 0,90 m dans les angles
//   (indépendant de la zone de vent — le guide ne fait varier l'entraxe que par la position)
// - Marge d'extrémité : 25 cm max entre la première/dernière équerre et le bout du montant
// - 2 chevilles Spit MP3-S par équerre (trous oblongs standard Isolco)
// L'entraxe HORIZONTAL (espacement des montants/chevrons) varie lui par matériau.

export type FamillePose = "hpl" | "composite" | "bois_naturel" | "cassette";

export const LABELS_FAMILLE: Record<FamillePose, string> = {
  hpl: "HPL Compact",
  composite: "Composite classique",
  bois_naturel: "Bois naturel",
  cassette: "Cassette (ossature métallique)",
};

export type ResultatPose = {
  entraxeVertical: number;
  entraxeHorizontal?: number;
  nbMontants: number;
  fixationsParMontant: number;
  nbFixationsTotal: number;
  nbVis: number;
  joint: string;
  remarques: string[];
};

// Constantes communes issues de l'infrastructure Isolco 3000 P2 / Spit MP3-S
const ENTRAXE_VERTICAL_STANDARD = 1.35;
const ENTRAXE_VERTICAL_ANGLE = 0.9;
const MARGE_EXTREMITE = 0.25; // 25 cm max des bouts du montant
const CHEVILLES_PAR_EQUERRE = 2;

function intervalles(longueur: number, marge: number, entraxeMax: number) {
  const utile = longueur - 2 * marge;
  if (utile <= 0) return 1;
  return Math.max(1, Math.ceil(utile / entraxeMax));
}

function entraxeVerticalCommun(angle: boolean) {
  return angle ? ENTRAXE_VERTICAL_ANGLE : ENTRAXE_VERTICAL_STANDARD;
}

function equerresCommunes(largeur: number, hauteur: number, entraxeHorizontal: number, angle: boolean) {
  const entraxeVertical = entraxeVerticalCommun(angle);
  const nbMontants = intervalles(largeur, 0, entraxeHorizontal) + 1;
  const fixationsParMontant = intervalles(hauteur, MARGE_EXTREMITE, entraxeVertical) + 1;
  const nbFixationsTotal = nbMontants * fixationsParMontant;
  return { entraxeVertical, nbMontants, fixationsParMontant, nbFixationsTotal };
}

const REMARQUE_PERCAGE =
  "Perçage Spit MP3-S : Ø12mm, profondeur 70mm mini, couple de serrage 15 Nm (clé à cliquet) — jamais à moins de 10 cm d'un angle ou tableau de fenêtre";

function calculerHPL(largeur: number, hauteur: number, angle: boolean): ResultatPose {
  const entraxeHorizontal = 0.6; // 60 cm max
  const { entraxeVertical, nbMontants, fixationsParMontant, nbFixationsTotal } = equerresCommunes(
    largeur,
    hauteur,
    entraxeHorizontal,
    angle
  );

  // Vis de fixation panneau (visibles, distinctes des chevilles murales) :
  // grille <600mm, vis de rive à 20-40mm du bord du panneau
  const rangsVissagePanneau = intervalles(hauteur, 0.03, 0.6) + 1;
  const visPanneau = nbMontants * rangsVissagePanneau;

  return {
    entraxeVertical,
    entraxeHorizontal,
    nbMontants,
    fixationsParMontant,
    nbFixationsTotal,
    nbVis: nbFixationsTotal * CHEVILLES_PAR_EQUERRE + visPanneau,
    joint: "1 Point Fixe Ø5,1mm au centre du panneau + Points Coulissants Ø8mm ailleurs — vis de rive à 20-40mm du bord",
    remarques: [
      `Vis panneau (visibles, entraxe <600mm) : ${visPanneau}`,
      "Bande EPDM (80-100mm) agrafée sur 100% des chevrons avant pose",
      angle ? "Angle : doubler les chevrons, jumelés à la vis Superwood" : "",
      REMARQUE_PERCAGE,
    ].filter(Boolean),
  };
}

function calculerComposite(largeur: number, hauteur: number, angle: boolean): ResultatPose {
  const entraxeHorizontal = 0.4; // 40 cm max
  const { entraxeVertical, nbMontants, fixationsParMontant, nbFixationsTotal } = equerresCommunes(
    largeur,
    hauteur,
    entraxeHorizontal,
    angle
  );

  const hauteurLameStandard = 0.16;
  const nbRangsLames = Math.ceil(hauteur / hauteurLameStandard);
  // 1 clip + 1 vis inox à chaque chevron rencontré, pour chaque rang de lame
  const visClips = nbMontants * nbRangsLames;

  return {
    entraxeVertical,
    entraxeHorizontal,
    nbMontants,
    fixationsParMontant,
    nbFixationsTotal,
    nbVis: nbFixationsTotal * CHEVILLES_PAR_EQUERRE + visClips,
    joint: "Joint de dilatation ~6mm entre chaque fin de lame (lame standard 3,60m)",
    remarques: [
      `Clips + vis inox (1 par chevron rencontré) : ${visClips} sur ${nbRangsLames} rangs de lames`,
      "Double chevronnage NON fixé ensemble à chaque jonction de bout de lame",
      "Point de blocage central sur le chevron du milieu de chaque lame de 3,60m",
      REMARQUE_PERCAGE,
    ].filter(Boolean),
  };
}

function calculerBoisNaturel(
  largeur: number,
  hauteur: number,
  angle: boolean,
  largeurLameMm: number
): ResultatPose {
  const entraxeHorizontal = 0.65; // 65 cm max
  const { entraxeVertical, nbMontants, fixationsParMontant, nbFixationsTotal } = equerresCommunes(
    largeur,
    hauteur,
    entraxeHorizontal,
    angle
  );

  const visParPoint = largeurLameMm > 125 ? 2 : 1;
  const hauteurLameEstimee = 0.15;
  const nbRangsLames = Math.ceil(hauteur / hauteurLameEstimee);
  const visLames = nbMontants * nbRangsLames * visParPoint;

  return {
    entraxeVertical,
    entraxeHorizontal,
    nbMontants,
    fixationsParMontant,
    nbFixationsTotal,
    nbVis: nbFixationsTotal * CHEVILLES_PAR_EQUERRE + visLames,
    joint: "Jeu d'emboîtement en fond de languette : 2mm (gonflement hivernal)",
    remarques: [
      `Vis/pointes INOX A2-A4 lames (${visParPoint}/point, lame ${largeurLameMm}mm) : ${visLames}`,
      "Acier zingué interdit (coulures de rouille par tanins du bois)",
      "Garde au sol : 20cm mini (sol naturel) ou 10cm mini au-dessus d'une terrasse étanche",
      "Jonction bout à bout sur un même chevron, coupes en sifflet à 45°",
      REMARQUE_PERCAGE,
    ].filter(Boolean),
  };
}

function calculerCassette(
  largeur: number,
  hauteur: number,
  angle: boolean,
  largeurModuleMm: number
): ResultatPose {
  // Entraxe horizontal = largeur du module cassette + joint creux (20mm par défaut)
  const jointCreuxM = 0.02;
  const entraxeHorizontal = largeurModuleMm / 1000 + jointCreuxM;
  const { entraxeVertical, nbMontants, fixationsParMontant, nbFixationsTotal } = equerresCommunes(
    largeur,
    hauteur,
    entraxeHorizontal,
    angle
  );

  const montantIntermediaireRequis = entraxeHorizontal > 1.0 || entraxeHorizontal > 1.2;

  return {
    entraxeVertical,
    entraxeHorizontal,
    nbMontants,
    fixationsParMontant,
    nbFixationsTotal,
    // 2 vis perf bi-métal par équerre Isolco (au lieu des chevilles Spit standard)
    nbVis: nbFixationsTotal * CHEVILLES_PAR_EQUERRE,
    joint: `Joint creux entre cassettes : ${(jointCreuxM * 1000).toFixed(0)}mm`,
    remarques: [
      "Ossature 100% aluminium (profilés T aux jonctions, L en rives) — bois interdit",
      "Vis perf bi-métal Inox/acier carbone, Ø5,5 — 2 par équerre (1 point fixe en tête, reste en trous oblongs)",
      montantIntermediaireRequis
        ? "Montant intermédiaire en L requis (module > 100-120cm)"
        : "Pas de montant intermédiaire nécessaire",
      "⚠️ Respecter le sens des flèches au dos de chaque cassette (toutes dans la même direction)",
      REMARQUE_PERCAGE,
    ].filter(Boolean),
  };
}

export function calculerPose(
  famille: FamillePose,
  largeur: number,
  hauteur: number,
  angle: boolean,
  _zoneVent: number, // conservé pour compatibilité d'appel — n'influence plus l'entraxe (voir guide 2026.1)
  largeurLameMm: number
): ResultatPose {
  switch (famille) {
    case "hpl":
      return calculerHPL(largeur, hauteur, angle);
    case "composite":
      return calculerComposite(largeur, hauteur, angle);
    case "bois_naturel":
      return calculerBoisNaturel(largeur, hauteur, angle, largeurLameMm);
    case "cassette":
      return calculerCassette(largeur, hauteur, angle, largeurLameMm || 600);
  }
}
