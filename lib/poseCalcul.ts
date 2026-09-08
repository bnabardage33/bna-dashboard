// lib/poseCalcul.ts
// Moteur de calcul technique complet de pose, ossature et ITE de bardage rapporté,
// conforme aux DTU 41.2 (Bardage bois/composite/HPL), DTU 31.2, et Cahiers CSTB 3194 / 3316.
//
// 1. ISOLANT ITE (Laine de roche / Laine de verre) :
//    - Surface à commander = Surface nette + 8 % de chutes/découpes
//    - Épaisseur isolant (ex: 120 mm) -> Sélection automatique du modèle d'équerre Isolco 3000 P2 (Isolant + 20 mm lame d'air)
//    - Conditionnement en paquets (ex: 4,80 m² par paquet)
//    - Chevilles rosaces d'isolant à frapper : 5 à 6 par m²
//
// 2. OSSATURE PRIMAIRE & ÉQUERRES ISOLCO 3000 P2 :
//    - Chevrons limités à 3,00 m par segment avec jeu de dilatation de 15 mm
//    - Équerres Isolco : 1 Porteuse (Point Fixe) en tête + Guides (Points Coulissants)
//    - Fixation murale : 2 chevilles maçonnerie Spit MP3-S Ø12mm par équerre (serrage 15 Nm)
//    - Fixation chevron sur équerre : 4 vis inox par équerre porteuse, 2 vis par équerre guide
//    - Resserrement en rive / angle (Vent) : entraxe 40 cm sur le 1er et dernier mètre
//    - Bande EPDM 80-100 mm sur 100% des chevrons (+5% recouvrement)

export type FamillePose = "hpl" | "composite" | "bois_naturel" | "cassette";

export const LABELS_FAMILLE: Record<FamillePose, string> = {
  hpl: "HPL Compact",
  composite: "Composite classique",
  bois_naturel: "Bois naturel",
  cassette: "Cassette (ossature métallique)",
};

export type TypeIsolant = "laine_roche" | "laine_verre" | "sans_isolant";

export interface OptionsPose {
  famille: FamillePose;
  largeur: number;
  hauteur: number;
  angle?: boolean;
  zoneVentRive?: boolean;
  epaisseurIsolantMm?: number | null;
  typeIsolant?: TypeIsolant | null;
  surfacePaquetM2?: number | null;
  largeurLameMm?: number | null;
}

export interface ResultatIsolant {
  actif: boolean;
  typeIsolant: string;
  epaisseurMm: number;
  surfaceNetteM2: number;
  surfaceACommanderM2: number;
  tauxPertePct: number;
  surfacePaquetM2: number;
  nbPaquetsACommander: number;
  nbChevillesRosaces: number;
  modeleEquerreIsolco: string;
}

export type ResultatPose = {
  entraxeVertical: number;
  entraxeHorizontal: number;
  positionsChevronsM: number[];
  nbMontants: number;
  nbSegmentsChevrons: number;
  lineaireChevronsM: number;
  fixationsParMontant: number;
  nbFixationsTotal: number;
  nbEquerresPorteuses: number;
  nbEquerresGuides: number;
  nbChevillesMurales: number;
  nbVisChevronEquerre: number;
  nbVisParement: number;
  nbVis: number;
  lineaireBandeEPDMM: number;
  isolant: ResultatIsolant;
  joint: string;
  remarques: string[];
};

// Constantes techniques DTU 41.2 / Isolco 3000 P2 / Spit MP3-S
const ENTRAXE_VERTICAL_STANDARD = 1.35;
const ENTRAXE_VERTICAL_ANGLE = 0.9;
const LONGUEUR_MAX_CHEVRON_M = 3.0;
const MARGE_EXTREMITE_M = 0.15;
const CHEVILLES_PAR_EQUERRE = 2;
const CHEVILLES_ISOLANT_PAR_M2 = 5;
const TAUX_PERTE_ISOLANT = 0.08; // 8% de perte

/**
 * Détermine le modèle d'équerre Isolco 3000 P2 recommandé
 * en ajoutant 20 mm de lame d'air réglementaire ventilée à l'épaisseur d'isolant.
 */
export function getModeleEquerre(epaisseurIsolantMm: number): string {
  if (epaisseurIsolantMm <= 0) return "Isolco 3000 P2 60 mm (lame d'air seule)";
  const porteeMm = epaisseurIsolantMm + 20;
  // Arrondi aux tailles standards Isolco (80, 100, 120, 140, 160, 180, 200, 220, 240, 260 mm)
  const tailleStandard = Math.ceil(porteeMm / 20) * 20;
  return `Isolco 3000 P2 ${tailleStandard} mm (Isolant ${epaisseurIsolantMm}mm + lame d'air 20mm)`;
}

/**
 * Calcule les positions X précises des chevrons verticaux,
 * avec resserrement d'entraxe à 40 cm en rive/angle si demandé.
 */
function calculerPositionsChevrons(
  largeurM: number,
  entraxeStandardM: number,
  zoneVentRive: boolean
): number[] {
  if (largeurM <= 0) return [0];

  const entraxeRiveM = 0.4;
  const positions: number[] = [0];

  if (zoneVentRive && largeurM > 2.0) {
    // 1er mètre en rive gauche (entraxe 40 cm)
    let x = 0;
    while (x + entraxeRiveM <= 1.0 + 0.01) {
      x += entraxeRiveM;
      positions.push(Math.round(x * 1000) / 1000);
    }

    // Zone centrale (entraxe standard)
    const finCentre = largeurM - 1.0;
    while (x + entraxeStandardM < finCentre) {
      x += entraxeStandardM;
      positions.push(Math.round(x * 1000) / 1000);
    }

    // Dernier mètre en rive droite (entraxe 40 cm)
    x = Math.max(x, finCentre);
    while (x + entraxeRiveM < largeurM - 0.01) {
      x += entraxeRiveM;
      positions.push(Math.round(x * 1000) / 1000);
    }
  } else {
    // Entraxe régulier
    let x = 0;
    while (x + entraxeStandardM < largeurM - 0.01) {
      x += entraxeStandardM;
      positions.push(Math.round(x * 1000) / 1000);
    }
  }

  // Toujours fermer par un montant sur la rive droite
  if (Math.abs(positions[positions.length - 1] - largeurM) > 0.01) {
    positions.push(largeurM);
  }

  return positions;
}

/**
 * Calcule le nombre d'équerres pour une ligne de montant de hauteur H.
 */
function calculerEquerresPourLigne(hauteurTotale: number, entraxeVertical: number): {
  nbSegments: number;
  nbEquerres: number;
  nbPorteuses: number;
  nbGuides: number;
} {
  if (hauteurTotale <= 0) {
    return { nbSegments: 0, nbEquerres: 0, nbPorteuses: 0, nbGuides: 0 };
  }

  let reste = hauteurTotale;
  let nbSegments = 0;
  let nbEquerres = 0;
  let nbPorteuses = 0;
  let nbGuides = 0;

  while (reste > 0.001) {
    const longSegment = Math.min(LONGUEUR_MAX_CHEVRON_M, reste);
    nbSegments++;

    // 1 équerre porteuse en tête
    nbPorteuses++;

    const marge = Math.min(MARGE_EXTREMITE_M, longSegment / 4);
    const utile = longSegment - 2 * marge;
    const inters = utile > 0 ? Math.ceil(utile / entraxeVertical) : 0;
    const totalSurSegment = Math.max(2, inters + 1);

    nbEquerres += totalSurSegment;
    nbGuides += totalSurSegment - 1;

    reste -= longSegment;
  }

  return { nbSegments, nbEquerres, nbPorteuses, nbGuides };
}

/**
 * Calcul complet de l'infrastructure d'ossature et de l'isolation ITE.
 */
function calculerInfrastructure(
  largeur: number,
  hauteur: number,
  entraxeHorizontalDefaut: number,
  angle: boolean,
  zoneVentRive: boolean,
  epaisseurIsolantMm: number,
  typeIsolant: TypeIsolant,
  surfacePaquetM2: number
) {
  const entraxeVertical = angle || zoneVentRive ? ENTRAXE_VERTICAL_ANGLE : ENTRAXE_VERTICAL_STANDARD;
  const positionsChevronsM = calculerPositionsChevrons(largeur, entraxeHorizontalDefaut, zoneVentRive);
  const nbMontants = positionsChevronsM.length;

  const ligne = calculerEquerresPourLigne(hauteur, entraxeVertical);

  const nbSegmentsChevrons = nbMontants * ligne.nbSegments;
  const lineaireChevronsM = nbMontants * hauteur;
  const nbFixationsTotal = nbMontants * ligne.nbEquerres;
  const fixationsParMontant = ligne.nbEquerres;
  const nbEquerresPorteuses = nbMontants * ligne.nbPorteuses;
  const nbEquerresGuides = nbMontants * ligne.nbGuides;
  const nbChevillesMurales = nbFixationsTotal * CHEVILLES_PAR_EQUERRE;

  // 4 vis inox par équerre porteuse (Point Fixe) + 2 vis par équerre guide (Point Coulissant)
  const nbVisChevronEquerre = nbEquerresPorteuses * 4 + nbEquerresGuides * 2;
  const lineaireBandeEPDMM = Math.round(lineaireChevronsM * 1.05 * 10) / 10;

  // Calcul ITE Isolant
  const aIsolant = typeIsolant !== "sans_isolant" && epaisseurIsolantMm > 0;
  const surfaceNetteM2 = largeur * hauteur;
  const surfaceACommanderM2 = aIsolant ? Math.round(surfaceNetteM2 * (1 + TAUX_PERTE_ISOLANT) * 100) / 100 : 0;
  const paquetM2 = surfacePaquetM2 && surfacePaquetM2 > 0 ? surfacePaquetM2 : 4.8;
  const nbPaquetsACommander = aIsolant && paquetM2 > 0 ? Math.ceil(surfaceACommanderM2 / paquetM2) : 0;
  const nbChevillesRosaces = aIsolant ? Math.ceil(surfaceNetteM2 * CHEVILLES_ISOLANT_PAR_M2) : 0;
  const modeleEquerreIsolco = getModeleEquerre(aIsolant ? epaisseurIsolantMm : 0);

  const isolant: ResultatIsolant = {
    actif: aIsolant,
    typeIsolant:
      typeIsolant === "laine_verre"
        ? "Laine de verre semi-rigide (ISOVER / Knauf)"
        : aIsolant
        ? "Laine de roche semi-rigide (Rockwool Fixrock)"
        : "Sans isolant rapporté",
    epaisseurMm: aIsolant ? epaisseurIsolantMm : 0,
    surfaceNetteM2,
    surfaceACommanderM2,
    tauxPertePct: TAUX_PERTE_ISOLANT * 100,
    surfacePaquetM2: paquetM2,
    nbPaquetsACommander,
    nbChevillesRosaces,
    modeleEquerreIsolco,
  };

  return {
    entraxeVertical,
    entraxeHorizontal: entraxeHorizontalDefaut,
    positionsChevronsM,
    nbMontants,
    nbSegmentsChevrons,
    lineaireChevronsM,
    fixationsParMontant,
    nbFixationsTotal,
    nbEquerresPorteuses,
    nbEquerresGuides,
    nbChevillesMurales,
    nbVisChevronEquerre,
    lineaireBandeEPDMM,
    isolant,
  };
}

const REMARQUE_PERCAGE =
  "Perçage Spit MP3-S : Ø12mm, profondeur 70mm mini, couple de serrage 15 Nm (clé dynamométrique) — distance mini 10 cm des arêtes maçonnerie";

/**
 * Calcule l'entraxe réel horizontal pour l'HPL conformément à la règle métier :
 * Le DTU de 600 mm est un MAXIMUM absolu.
 * C'est la largeur du module qui dicte la position de l'ossature.
 *
 * Algorithme :
 *   nombreEspaces = Math.ceil(largeurModule / 600)
 *   entraxeReel = largeurModule / nombreEspaces
 *
 * Exemples :
 *   1000mm → 2 espaces → 500mm
 *   1200mm → 2 espaces → 600mm
 *   600mm  → 1 espace  → 600mm
 *   1500mm → 3 espaces → 500mm
 */
export function calculerEntraxeHPL(largeurModuleMm: number): number {
  const limiteDTU = 600;
  const nombreEspaces = Math.ceil(largeurModuleMm / limiteDTU);
  return largeurModuleMm / nombreEspaces;
}

export function calculerPose(
  famille: FamillePose,
  largeur: number,
  hauteur: number,
  angle: boolean,
  _zoneVent: number,
  largeurLameMm: number,
  optionsAvancees?: {
    zoneVentRive?: boolean;
    epaisseurIsolantMm?: number | null;
    typeIsolant?: TypeIsolant | null;
    surfacePaquetM2?: number | null;
    moduleLargeurMm?: number | null;
  }
): ResultatPose {
  const zoneVentRive = optionsAvancees?.zoneVentRive ?? angle;
  const epaisseurIsolantMm = optionsAvancees?.epaisseurIsolantMm ?? 120;
  const typeIsolant = optionsAvancees?.typeIsolant ?? "laine_roche";
  const surfacePaquetM2 = optionsAvancees?.surfacePaquetM2 ?? 4.8;

  let entraxeHorizontalDefaut = 0.6; // 60 cm par défaut
  let nbVisParement = 0;
  let joint = "";
  const remarquesSupplementaires: string[] = [];

  if (famille === "hpl") {
    const moduleLargeurMm = optionsAvancees?.moduleLargeurMm ?? null;
    const entraxeReel = moduleLargeurMm !== null
      ? calculerEntraxeHPL(moduleLargeurMm)
      : 0.6;
    entraxeHorizontalDefaut = entraxeReel / 1000;
    const rangsVissagePanneau = Math.max(1, Math.ceil((hauteur - 0.06) / entraxeHorizontalDefaut)) + 1;
    nbVisParement = Math.round((largeur / entraxeHorizontalDefaut + 1) * rangsVissagePanneau);
    joint = "1 Point Fixe Ø5,1mm au centre + Points Coulissants Ø8mm — vis de rive à 20-40mm";
    remarquesSupplementaires.push(`Vis parement HPL tête laquée (entraxe <600mm) : ${nbVisParement} vis`);
  } else if (famille === "composite") {
    entraxeHorizontalDefaut = 0.4;
    const nbRangsLames = Math.ceil(hauteur / 0.16);
    nbVisParement = Math.round((largeur / entraxeHorizontalDefaut + 1) * nbRangsLames);
    joint = "Joint de dilatation ~6mm entre chaque fin de lame (lame standard 3,60m)";
    remarquesSupplementaires.push(`Clips + vis inox de fixation : ${nbVisParement} sur ${nbRangsLames} rangs de lames`);
    remarquesSupplementaires.push("Double chevronnage NON fixé ensemble à chaque jonction de bout de lame");
  } else if (famille === "bois_naturel") {
    entraxeHorizontalDefaut = 0.65;
    const visParPoint = (largeurLameMm || 135) > 125 ? 2 : 1;
    const nbRangsLames = Math.ceil(hauteur / 0.15);
    nbVisParement = Math.round((largeur / entraxeHorizontalDefaut + 1) * nbRangsLames * visParPoint);
    joint = "Jeu d'emboîtement en fond de languette : 2mm (gonflement hivernal)";
    remarquesSupplementaires.push(
      `Pointes/Vis INOX A2/A4 (${visParPoint}/point, lame ${largeurLameMm || 135}mm) : ${nbVisParement}`
    );
    remarquesSupplementaires.push("Acier zingué strictement interdit (coulures de rouille par tanins du bois)");
    remarquesSupplementaires.push("Garde au sol : 20cm mini (sol naturel) ou 10cm mini (terrasse étanche)");
  } else if (famille === "cassette") {
    const jointCreuxM = 0.02;
    entraxeHorizontalDefaut = (largeurLameMm || 600) / 1000 + jointCreuxM;
    nbVisParement = 0;
    joint = `Joint creux entre cassettes : ${(jointCreuxM * 1000).toFixed(0)}mm`;
    remarquesSupplementaires.push("Ossature 100% aluminium (profilés T aux jonctions, L en rives) — bois interdit");
    if (entraxeHorizontalDefaut > 1.0) {
      remarquesSupplementaires.push("Montant intermédiaire en L requis (largeur module > 100cm)");
    }
  }

  const infra = calculerInfrastructure(
    largeur,
    hauteur,
    entraxeHorizontalDefaut,
    angle,
    zoneVentRive,
    epaisseurIsolantMm,
    typeIsolant,
    surfacePaquetM2
  );

  const totalVisGlobal = infra.nbChevillesMurales + infra.nbVisChevronEquerre + nbVisParement;

  const remarques = [
    `Ossature : ${infra.nbMontants} montants verticaux (${infra.nbSegmentsChevrons} chevrons de 3m, ${infra.lineaireChevronsM.toFixed(1)} ml)`,
    `Équerres : ${infra.nbFixationsTotal} ${infra.isolant.modeleEquerreIsolco} (${infra.nbEquerresPorteuses} porteuses + ${infra.nbEquerresGuides} guides)`,
    `Fixation chevron/équerre : ${infra.nbVisChevronEquerre} vis inox (4/porteuse, 2/guide)`,
    `Chevilles maçonnerie Spit MP3-S : ${infra.nbChevillesMurales} chevilles (2 par équerre)`,
    infra.isolant.actif
      ? `Isolant ITE : ${infra.isolant.typeIsolant} ${infra.isolant.epaisseurMm}mm — ${infra.isolant.surfaceACommanderM2} m² (${infra.isolant.nbPaquetsACommander} paquets de ${infra.isolant.surfacePaquetM2} m²)`
      : "Pas d'isolant thermique rapporté",
    infra.isolant.actif
      ? `Chevilles rosaces d'isolant : ${infra.isolant.nbChevillesRosaces} chevilles à frapper (5/m²)`
      : "",
    `Bande EPDM 80-100mm : ${infra.lineaireBandeEPDMM} ml agrafée sur chevrons`,
    zoneVentRive ? "Resserrement vent en rives : entraxe 40 cm sur 1er et dernier mètre" : "",
    angle ? "Angle : doubler les chevrons (chevron jumelé d'angle)" : "",
    ...remarquesSupplementaires,
    REMARQUE_PERCAGE,
  ].filter(Boolean);

  return {
    ...infra,
    nbVisParement,
    nbVis: totalVisGlobal,
    joint,
    remarques,
  };
}
