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
export type SensPose = "horizontal" | "vertical";

export const LIMITE_DTU_MM = 600;

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
 * Rive minimale recommandée pour une bande de façade (règle du façadier & DTU).
 * En deçà, la bande de rive est absorbée au profit de plaques réparties
 * afin d'obtenir des rives plus larges, esthétiques et conformes.
 */
export const RIVE_MIN_MM = 150;
export const DEFAULT_MIN_RIVE_WIDTH_MM = 250;
export const MIN_RIVE_WIDTH = DEFAULT_MIN_RIVE_WIDTH_MM;

/**
 * Découpage esthétique CENTRÉ de la façade en plaques entières avec règle anti-micro-plaques :
 *  - le nombre de plaques entières `n` (largeur physique) est maximisé,
 *  - l'espace restant est divisé EXACTEMENT en deux : riveGauche = riveDroite,
 *  - si la rive est trop étroite (< minRiveMm), on retire une plaque pour élargir les rives,
 *  - si nModules === 1 et que la rive reste inférieure au seuil minimal (ex: mur de 1050 mm
 *    avec module de 1000 mm -> rives résiduelles de 25 mm), on élimine la micro-bande
 *    en divisant le mur en 2 panneaux égaux équilibrés (525 mm + 525 mm >= seuil).
 * Cette répartition est la SOURCE UNIQUE utilisée par le calepinage (plaques)
 * et par l'ossature (chevrons) : les deux restent ainsi parfaitement synchronisées.
 */
export function decoupageModulesCentres(
  largeurMm: number,
  moduleMm: number,
  minRiveMm: number = RIVE_MIN_MM
): { nModules: number; riveMm: number } {
  const largeur = Math.max(0, Math.round(largeurMm));
  const module = Math.max(1, Math.round(moduleMm));
  const minRive = Math.max(0, Math.round(minRiveMm));

  if (largeur <= 0) return { nModules: 0, riveMm: 0 };
  if (largeur < module) return { nModules: 0, riveMm: largeur / 2 };
  if (largeur === module) return { nModules: 1, riveMm: 0 };

  let nModules = Math.floor(largeur / module);
  let riveMm = (largeur - nModules * module) / 2;

  while (riveMm < minRive && nModules > 1) {
    nModules -= 1;
    riveMm = (largeur - nModules * module) / 2;
  }

  // Cas nModules === 1 avec micro-rives résiduelles (ex: 25 mm, 50 mm)
  // Découpe en 2 panneaux symétriques pour absorber la micro-chute
  if (riveMm < minRive && nModules === 1) {
    if (largeur >= 2 * minRive) {
      nModules = 0;
      riveMm = largeur / 2;
    }
  }

  return { nModules, riveMm };
}

/**
 * Positions X de l'ossature HPL (STRUCTUREL) :
 *  - l'ossature s'adapte aux plaques du calepinage centré `decoupageModulesCentres`,
 *  - un chevron à X = 0,
 *  - un chevron sous CHAQUE joint de plaque (riveGauche, + largeur de plaque, ...),
 *  - des chevrons INTERMÉDIAIRES à l'intérieur de chaque plaque, tous les entraxes
 *    réels (X = riveGauche + k × entraxe) dès que la largeur physique > LIMITE_DTU_MM,
 *  - un chevron final à X = largeurMur.
 * Les chevrons ne découpent JAMAIS les plaques : ils se placent virtuellement
 * dans la largeur de chaque plaque, en arrière-plan.
 */
export function positionsChevronsCalepinage(
  largeurM: number,
  moduleLargeurMm: number,
  entraxeReelMm: number,
  minRiveMm: number = RIVE_MIN_MM
): number[] {
  const largeurMm = Math.round(largeurM * 1000);
  const moduleMm = Math.max(1, Math.round(moduleLargeurMm));
  const entraxeMm = Math.max(1, Math.round(entraxeReelMm));

  if (largeurMm <= 0) return [0];

  const { nModules, riveMm } = decoupageModulesCentres(largeurMm, moduleMm, minRiveMm);
  if (nModules === 0) {
    if (riveMm > 0 && largeurMm >= 2 * minRiveMm) {
      const riveM = Math.round(riveMm) / 1000;
      return [0, riveM, largeurMm / 1000];
    }
    return [0, largeurMm / 1000];
  }

  const riveM = Math.round(riveMm) / 1000;
  // Chaque plaque (moduleMm) est divisée en `moduleMm / entraxeMm` intervalles.
  const nEspacesParModule = Math.max(1, Math.round(moduleMm / entraxeMm));
  const nIntervallesTotal = nModules * nEspacesParModule;

  const positionsM: number[] = [0];
  for (let k = 0; k <= nIntervallesTotal; k++) {
    const posM = Math.round((riveM + (k * entraxeMm) / 1000) * 1000) / 1000;
    if (posM + 1e-6 < largeurM && posM > 1e-6) positionsM.push(posM);
  }
  positionsM.push(largeurM);
  return positionsM;
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
  surfacePaquetM2: number,
  positionsChevronsSurcharge?: number[]
) {
  const entraxeVertical = angle || zoneVentRive ? ENTRAXE_VERTICAL_ANGLE : ENTRAXE_VERTICAL_STANDARD;
  const positionsChevronsM =
    positionsChevronsSurcharge && positionsChevronsSurcharge.length > 0
      ? positionsChevronsSurcharge
      : calculerPositionsChevrons(largeur, entraxeHorizontalDefaut, zoneVentRive);
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
  const m = Math.max(1, largeurModuleMm);
  const nombreEspaces = Math.ceil(m / limiteDTU);
  return m / nombreEspaces;
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
    moduleHauteurMm?: number | null;
    sensPose?: SensPose | null;
  }
): ResultatPose {
  const zoneVentRive = optionsAvancees?.zoneVentRive ?? angle;
  const epaisseurIsolantMm = optionsAvancees?.epaisseurIsolantMm ?? 120;
  const typeIsolant = optionsAvancees?.typeIsolant ?? "laine_roche";
  const surfacePaquetM2 = optionsAvancees?.surfacePaquetM2 ?? 4.8;
  const sensPose: SensPose =
    (optionsAvancees?.sensPose ?? "horizontal").toString().toLowerCase() === "vertical"
      ? "vertical"
      : "horizontal";

  let entraxeHorizontalDefaut = 0.5; // initialisé par le calcul dynamique HPL
  let nbVisParement = 0;
  let joint = "";
  let positionsChevronsHpl: number[] | null = null;
  const remarquesSupplementaires: string[] = [];

  if (famille === "hpl") {
    // Algorithme obligatoire : LIMITE_DTU = 600mm uniquement
    const moduleLargeurMm = optionsAvancees?.moduleLargeurMm ?? null;
    const moduleHauteurMm = optionsAvancees?.moduleHauteurMm ?? null;
    const dimension = (sensPose === "vertical" ? moduleHauteurMm : moduleLargeurMm) ?? null;
    const moduleHorizontalMm = Math.max(1, dimension ?? 1000);
    const nombreEspaces = Math.ceil(moduleHorizontalMm / LIMITE_DTU_MM);
    const entraxeReel = moduleHorizontalMm / nombreEspaces;
    entraxeHorizontalDefaut = entraxeReel / 1000;
    // Ossature adaptée aux plaques : chevron sous chaque joint + chevrons
    // intermédiaires dans chaque plaque (entraxe réel) — les chevrons ne
    // découpent jamais la plaque (ils restent en arrière-plan).
    positionsChevronsHpl = positionsChevronsCalepinage(largeur, moduleHorizontalMm, entraxeReel);
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
    surfacePaquetM2,
    positionsChevronsHpl ?? undefined
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

/**
 * Fonction simplifiée pour calculer rapidement les besoins d'ossature d'un bardage
 * selon les normes DTU 41.2 et 45.4, à utiliser dans le module de devis automatique.
 * 
 * @param surfaceM2 Surface totale du bardage (si largeur/hauteur inconnues, sert de base approchée)
 * @param largeurFacade Largeur optionnelle (pour un calcul plus précis du nombre de montants)
 * @param hauteurFacade Hauteur optionnelle (pour un calcul plus précis)
 */
export function calculerBesoinsBardage(surfaceM2: number, largeurFacade?: number, hauteurFacade?: number) {
  // Entraxes DTU
  const entraxeHorizontalMax = 0.60; // 60 cm max pour les chevrons
  const entraxeVerticalMax = 1.20; // 1,20m max sur le chevron pour les équerres

  let mlChevrons = 0;
  let nbEquerres = 0;

  // Si on a les dimensions exactes, on simule une grille
  if (largeurFacade && largeurFacade > 0 && hauteurFacade && hauteurFacade > 0) {
    const nbMontants = Math.ceil(largeurFacade / entraxeHorizontalMax) + 1;
    mlChevrons = nbMontants * hauteurFacade;

    const nbEquerresParMontant = Math.ceil(hauteurFacade / entraxeVerticalMax) + 1;
    nbEquerres = nbMontants * nbEquerresParMontant;
  } else {
    // Calcul approché purement basé sur la surface (ratio DTU classique)
    // 1 m² = environ 1.7 to 2 ml de chevrons (ex: 1 / 0.6 = 1.66 + marges)
    mlChevrons = surfaceM2 * (1 / entraxeHorizontalMax); 
    // 4.5 équerres par m² est une excellente moyenne sécurité pour l'entraxe vertical de 1.20m sur chevrons espacés de 0.60m
    nbEquerres = Math.ceil(surfaceM2 * 4.5);
  }

  // Arrondi au ml supérieur pour les chevrons
  mlChevrons = Math.ceil(mlChevrons * 1.05); // +5% de perte/chute

  // 1 ou 2 chevilles d'ancrage par équerre (Généralement 2 pour la sécurité sur maçonnerie standard)
  const nbChevilles = nbEquerres * 2;

  // 2 vis auto-foreuses par équerre (obligation DTU pour bloquer la rotation)
  const nbVisAutoForeuses = nbEquerres * 2;

  return {
    mlChevrons,
    nbEquerres,
    nbChevilles,
    nbVisAutoForeuses
  };
}
