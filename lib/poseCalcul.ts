export type FamillePose = "hpl" | "composite" | "bois_naturel" | "cassette";

export const LABELS_FAMILLE: Record<FamillePose, string> = {
  hpl: "HPL",
  composite: "Composite / Bois-fibrociment (lame)",
  bois_naturel: "Lame bois naturel",
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

function intervalles(longueur: number, marge: number, entraxeMax: number) {
  const utile = longueur - 2 * marge;
  if (utile <= 0) return 1;
  return Math.max(1, Math.ceil(utile / entraxeMax));
}

function calculerHPL(largeur: number, hauteur: number, angle: boolean, zoneVent: number): ResultatPose {
  const margeEquerre = 0.15;
  const entraxeHorizontal = 0.6; // chevron 75x75
  const entraxeVerticalAngle = zoneVent === 4 ? 0.45 : 0.9;
  const entraxeVertical = angle ? entraxeVerticalAngle : 1.15;

  const nbFixationsParChevron = intervalles(hauteur, margeEquerre, entraxeVertical) + 1;
  const nbChevrons = intervalles(largeur, 0, entraxeHorizontal) + 1;
  const nbEquerresTotal = nbFixationsParChevron * nbChevrons;

  return {
    entraxeVertical,
    entraxeHorizontal,
    nbMontants: nbChevrons,
    fixationsParMontant: nbFixationsParChevron,
    nbFixationsTotal: nbEquerresTotal,
    nbVis: nbEquerresTotal * 2, // tirefond 8x50, 2 par équerre
    joint: "Joint de dilatation plaque : 8 mm",
    remarques: [
      "Longueur chevron standard : 3 m",
      angle ? "Angle : double chevron fixé ensemble (superwood)" : "",
      zoneVent >= 3 ? `Zone de vent ${zoneVent} : entraxe angle réduit à ${entraxeVerticalAngle * 100} cm` : "",
    ].filter(Boolean),
  };
}

function calculerComposite(largeur: number, hauteur: number, angle: boolean): ResultatPose {
  const margeEquerre = 0.15;
  const entraxeHorizontal = 0.4;
  const entraxeVertical = angle ? 0.9 : 1.15;

  const nbFixationsParChevron = intervalles(hauteur, margeEquerre, entraxeVertical) + 1;
  const nbChevrons = intervalles(largeur, 0, entraxeHorizontal) + 1;
  const nbEquerresTotal = nbFixationsParChevron * nbChevrons;

  const hauteurLameStandard = 0.16;
  const nbRangsLames = Math.ceil(hauteur / hauteurLameStandard);

  return {
    entraxeVertical,
    entraxeHorizontal,
    nbMontants: nbChevrons,
    fixationsParMontant: nbFixationsParChevron,
    nbFixationsTotal: nbEquerresTotal,
    nbVis: nbEquerresTotal * 2,
    joint: "Joint de dilatation 6 mm entre chaque fin de lame (lame standard 360 x 16 cm)",
    remarques: [
      "Double chevron NON fixé ensemble à chaque fin de lame",
      angle ? "Angle : entraxe vertical réduit à 90 cm" : "",
      `~${nbRangsLames} rangs de lames sur la hauteur (fixation clips à chaque chevron)`,
    ].filter(Boolean),
  };
}

function calculerBoisNaturel(largeur: number, hauteur: number, largeurLameMm: number): ResultatPose {
  const entraxeHorizontal = 0.65;
  const entraxeVertical = 1.35;

  const nbFixationsParChevron = intervalles(hauteur, 0, entraxeVertical) + 1;
  const nbChevrons = intervalles(largeur, 0, entraxeHorizontal) + 1;
  const nbEquerresTotal = nbFixationsParChevron * nbChevrons;

  const visParPoint = largeurLameMm > 125 ? 2 : 1;
  const hauteurLameEstimee = 0.15;
  const nbRangsLames = Math.ceil(hauteur / hauteurLameEstimee);

  return {
    entraxeVertical,
    entraxeHorizontal,
    nbMontants: nbChevrons,
    fixationsParMontant: nbFixationsParChevron,
    nbFixationsTotal: nbEquerresTotal,
    nbVis: nbEquerresTotal * 2 + nbChevrons * nbRangsLames * visParPoint,
    joint: "Joint d'emboîtement (rainure/languette) : 2 mm",
    remarques: [
      "Pas de double chevron dans les angles",
      "Garde au sol : 20 cm mini (sol naturel) ou 10 cm mini au-dessus d'une terrasse/balcon",
      `Visserie lames : ${visParPoint} vis par point de fixation (lame ${largeurLameMm} mm)`,
    ],
  };
}

function calculerCassette(largeur: number, hauteur: number, angle: boolean): ResultatPose {
  const entraxeVertical = angle ? 0.9 : 1.35;
  const fixationsParMontant = intervalles(hauteur, 0, entraxeVertical) + 1;
  const montantIntermediaireRequis = largeur > 1.0;
  const nbMontants = montantIntermediaireRequis ? 3 : 2;
  const nbEquerresTotal = fixationsParMontant * nbMontants;

  const hauteurCassetteEstimee = 0.6;
  const nbRangsCassette = Math.ceil(hauteur / hauteurCassetteEstimee);

  return {
    entraxeVertical,
    nbMontants,
    fixationsParMontant,
    nbFixationsTotal: nbEquerresTotal,
    nbVis: nbEquerresTotal * 2 + nbMontants * nbRangsCassette, // autoperf équerres + vis cassette/montant
    joint: "Joint creux entre chaque cassette : 20 mm",
    remarques: [
      montantIntermediaireRequis
        ? "Montant intermédiaire L obligatoire (largeur > 100 cm)"
        : "Pas de montant intermédiaire nécessaire (largeur ≤ 100 cm)",
      "Profil Oméga en jonction entre 2 cassettes ou sur les rives",
      "Vis bi-métal inox A2/A4, pointe acier carbone soudé, Ø 5.5",
      angle ? "Angle : entraxe vertical réduit à 90 cm" : "",
    ].filter(Boolean),
  };
}

export function calculerPose(
  famille: FamillePose,
  largeur: number,
  hauteur: number,
  angle: boolean,
  zoneVent: number,
  largeurLameMm: number
): ResultatPose {
  switch (famille) {
    case "hpl":
      return calculerHPL(largeur, hauteur, angle, zoneVent);
    case "composite":
      return calculerComposite(largeur, hauteur, angle);
    case "bois_naturel":
      return calculerBoisNaturel(largeur, hauteur, largeurLameMm);
    case "cassette":
      return calculerCassette(largeur, hauteur, angle);
  }
}
