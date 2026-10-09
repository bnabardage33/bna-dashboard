// Moteur de calcul complet pour terrasse composite + clips invisibles
// Indépendant du moteur DTU 51.4 (régit par DTA CSTB GS 2.1 et prescriptions fabricants)

import {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  LigneChiffrageTerrasse,
  ResultatCalculTerrasse,
} from "../types";
import { auditComposite } from "./audit";
import { calculerClipsComposite } from "./clips";
import { calculerDilatationComposite } from "./dilatation";
import { getFabricantComposite, getGammeDefaut } from "./fabricants";

export function calculComposite(
  config: ChantierTerrasseConfig,
  reservations: ChantierTerrasseReservation[] = []
): ResultatCalculTerrasse {
  const fabricant = getFabricantComposite(config.fabricant_composite || undefined);
  const gamme = config.gamme_composite
    ? (fabricant.gammes.find((g) => g.gamme === config.gamme_composite) || getGammeDefaut(fabricant))
    : getGammeDefaut(fabricant);

  const zone = config.zone_environnement || "normal";

  // 1. Géométrie
  const surfaceBruteM2 = config.longueur_m * config.largeur_m;
  const perimetreM = 2 * (config.longueur_m + config.largeur_m);

  // Surface des réservations (piscines, trappes, découpes)
  let surfaceReservationsM2 = 0;
  for (const res of reservations) {
    if (res.largeur && res.longueur) {
      surfaceReservationsM2 += res.largeur * res.longueur;
    } else if (res.diametre) {
      const rayon = res.diametre / 2;
      surfaceReservationsM2 += Math.PI * rayon * rayon;
    }
  }
  const surfaceNetteM2 = Math.max(0.1, surfaceBruteM2 - surfaceReservationsM2);

  // 2. Dilatation thermique
  const dilatation = calculerDilatationComposite(
    config.longueur_lame_m || gamme.longueursDisponiblesM[0] || 4.0,
    gamme,
    18,
    zone
  );

  // 3. Lambourdes
  // Entraxe max imposé par le DTA du fabricant (ex: 40 cm)
  const entraxeMaxCm = gamme.entraxeMaxCm;
  const entraxeCm = Math.min(config.entraxe_lambourdes_cm || entraxeMaxCm, entraxeMaxCm);
  const entraxeM = entraxeCm / 100;

  // En pose parallèle, lambourdes perpendiculaires aux lames
  const nbRangeesLambourdes = Math.ceil(config.longueur_m / entraxeM) + 1;
  const lineaireLambourdesBaseMl = nbRangeesLambourdes * config.largeur_m;

  // Lignes d'aboutage de lames : si la longueur de la terrasse > longueur d'une lame
  const longueurLameM = config.longueur_lame_m || gamme.longueursDisponiblesM[0] || 4.0;
  const nbLignesAboutage = Math.max(0, Math.ceil(config.longueur_m / longueurLameM) - 1);

  // Double lambourdage obligatoire sous DTA aux aboutages
  let lineaireDoubleLambourdageMl = 0;
  if (nbLignesAboutage > 0 && config.double_lambourdage_aboutage) {
    lineaireDoubleLambourdageMl = nbLignesAboutage * config.largeur_m;
  }

  // Renforts autour des réservations (cadre de lambourdes supplémentaire)
  let lineaireRenfortReservationsMl = 0;
  for (const res of reservations) {
    if (res.largeur && res.longueur) {
      lineaireRenfortReservationsMl += 2 * (res.largeur + res.longueur);
    } else if (res.diametre) {
      lineaireRenfortReservationsMl += Math.PI * res.diametre;
    }
  }

  const lineaireLambourdesTotalMl =
    lineaireLambourdesBaseMl +
    lineaireDoubleLambourdageMl +
    lineaireRenfortReservationsMl;

  const coefPerteLambourdes = config.coef_perte_lambourdes || 1.08;
  const lineaireAvecChutesMl = lineaireLambourdesTotalMl * coefPerteLambourdes;
  const longueurLambourdeM = config.longueur_lambourde_m || 4.0;
  const nbBarresLambourdes = Math.ceil(lineaireAvecChutesMl / longueurLambourdeM);

  // 4. Platelage / Lames
  const largeurLameM = (config.largeur_lame_mm || gamme.largeurMm) / 1000;
  const jointMm = config.espacement_lames_mm || gamme.jeuLateralMm;
  const pasLameM = largeurLameM + jointMm / 1000;
  const nbRangeesLames = Math.ceil(config.largeur_m / pasLameM);

  const lineaireLamesBrutMl = nbRangeesLames * config.longueur_m;
  const coefPerteLames = config.coef_perte_lames || 1.10;
  const lineaireLamesAvecChutesMl = lineaireLamesBrutMl * coefPerteLames;
  const nbLamesTotal = Math.ceil(lineaireLamesAvecChutesMl / longueurLameM);

  // 5. Clips invisibles
  const clips = calculerClipsComposite(
    nbRangeesLames,
    nbRangeesLambourdes,
    nbLignesAboutage,
    gamme,
    zone
  );

  // 6. Plots réglables
  const entraxePlotsM = (config.entraxe_plots_cm || 60) / 100;
  const nbPlotsParLigne = Math.ceil(config.largeur_m / entraxePlotsM) + 1;
  let nbPlots = nbRangeesLambourdes * nbPlotsParLigne;
  if (nbLignesAboutage > 0 && config.double_lambourdage_aboutage) {
    nbPlots += nbLignesAboutage * nbPlotsParLigne;
  }
  // Plots sous renforts de réservations
  if (lineaireRenfortReservationsMl > 0) {
    nbPlots += Math.ceil(lineaireRenfortReservationsMl / entraxePlotsM);
  }

  // 7. Bande EPDM et cales
  const epdmMl = config.type_lambourde === "alu_structure"
    ? 0 // Pas d'EPDM requis sur lambourde alu spécifique avec joint intégré
    : Math.ceil(lineaireLambourdesTotalMl);

  // 8. Chiffrage prévisionnel
  const lignesChiffrage: LigneChiffrageTerrasse[] = [
    {
      code: "COMP-LAME",
      categorie: "Platelage",
      designation: `Lame composite ${fabricant.nom} ${gamme.gamme} ${config.largeur_lame_mm || gamme.largeurMm}x${config.epaisseur_lame_mm || gamme.epaisseurMm}mm L=${longueurLameM}m`,
      quantite: nbLamesTotal,
      unite: "u",
      prixUnitaireHt: 35.0,
      totalHt: Math.round(nbLamesTotal * 35.0 * 100) / 100,
    },
    {
      code: "COMP-CLIP-BOITE",
      categorie: "Fixation",
      designation: `Kit clips invisibles ${gamme.clipType} Inox ${clips.gradeInox} (boîte de ${clips.conditionnementBoite})`,
      quantite: clips.nbBoitesClips,
      unite: "bte",
      prixUnitaireHt: 65.0,
      totalHt: Math.round(clips.nbBoitesClips * 65.0 * 100) / 100,
    },
    {
      code: config.type_lambourde === "alu_structure" ? "STRUCT-ALU" : "STRUCT-BOIS",
      categorie: "Structure",
      designation: config.type_lambourde === "alu_structure"
        ? `Lambourde aluminium structurelle L=${longueurLambourdeM}m`
        : `Lambourde pin autoclave Cl4 ${config.section_largeur_mm}x${config.section_hauteur_mm}mm`,
      quantite: nbBarresLambourdes,
      unite: "u",
      prixUnitaireHt: config.type_lambourde === "alu_structure" ? 38.0 : 18.0,
      totalHt: Math.round(nbBarresLambourdes * (config.type_lambourde === "alu_structure" ? 38.0 : 18.0) * 100) / 100,
    },
    {
      code: "PLOT-REGLABLE",
      categorie: "Structure",
      designation: `Plots réglables ${config.hauteur_reglage_plots || "40-60mm"}`,
      quantite: nbPlots,
      unite: "u",
      prixUnitaireHt: 2.8,
      totalHt: Math.round(nbPlots * 2.8 * 100) / 100,
    },
  ];

  if (epdmMl > 0) {
    lignesChiffrage.push({
      code: "ACC-EPDM",
      categorie: "Accessoires",
      designation: "Bande d'étanchéité EPDM pour lambourdes",
      quantite: epdmMl,
      unite: "ml",
      prixUnitaireHt: 1.5,
      totalHt: Math.round(epdmMl * 1.5 * 100) / 100,
    }, {
      code: "ACC-CALES",
      categorie: "Accessoires",
      designation: "Cales d'isolation et ventilation sous lambourdes",
      quantite: nbPlots,
      unite: "u",
      prixUnitaireHt: 0.8,
      totalHt: Math.round(nbPlots * 0.8 * 100) / 100,
    });
  }

  // Profilé de finition périphérique (cornière alu ou lame de rive composite)
  lignesChiffrage.push({
    code: "ACC-FINITION-PERIPH",
    categorie: "Accessoires",
    designation: `Profilé de finition périphérique / cornière Inox/Alu ${fabricant.nom}`,
    quantite: Math.ceil(perimetreM),
    unite: "ml",
    prixUnitaireHt: 14.0,
    totalHt: Math.round(Math.ceil(perimetreM) * 14.0 * 100) / 100,
  });

  const coutTotalHt = Math.round(
    lignesChiffrage.reduce((acc, l) => acc + l.totalHt, 0) * 100
  ) / 100;
  const coutM2Ht = Math.round((coutTotalHt / surfaceBruteM2) * 100) / 100;

  return {
    surfaceBruteM2,
    surfaceNetteM2,
    perimetreM,
    lambourdes: {
      entraxeCm,
      entraxeMaxDtuCm: entraxeMaxCm,
      nbRangees: nbRangeesLambourdes,
      lineaireMl: Math.round(lineaireLambourdesTotalMl * 10) / 10,
      lineaireAvecChutesMl: Math.round(lineaireAvecChutesMl * 10) / 10,
      nbBarres: nbBarresLambourdes,
      sectionMm: `${config.section_largeur_mm}x${config.section_hauteur_mm}`,
      epdmMl,
      calesIsolationNb: nbPlots,
    },
    plots: {
      type: config.type_plots,
      entraxeCm: config.entraxe_plots_cm,
      porteeMaxAdmissibleCm: 65,
      nbPlotsParLambourde: nbPlotsParLigne,
      nbPlotsTotal: nbPlots,
      densiteParM2: Math.round((nbPlots / surfaceBruteM2) * 10) / 10,
      geotextileM2: config.type_sol === "terre_meuble" ? Math.round(surfaceBruteM2 * 1.15) : 0,
      hauteurReglage: config.hauteur_reglage_plots,
    },
    lames: {
      essence: "composite",
      largeurMm: config.largeur_lame_mm || gamme.largeurMm,
      epaisseurMm: config.epaisseur_lame_mm || gamme.epaisseurMm,
      pasMm: Math.round(pasLameM * 1000),
      nbLignesLames: nbRangeesLames,
      lineaireMl: Math.round(lineaireLamesBrutMl * 10) / 10,
      surfaceACommanderM2: Math.round(lineaireLamesAvecChutesMl * largeurLameM * 10) / 10,
      nbLamesStandard: nbLamesTotal,
      espacementRecommandeMm: jointMm,
      jeuAboutageMm: dilatation.jeuAboutageRecommandeMm,
    },
    fixations: {
      type: "clips_invisibles",
      nbVisOuClipsTotal: clips.nbTotalClips,
      nbBoites: clips.nbBoitesClips,
      clipsDepartFinNb: clips.nbClipsDepart + clips.nbClipsFin,
      conditionnementBoite: clips.conditionnementBoite,
      longueurVisMm: 35,
      diametreVisMm: 4,
      inoxGrade: clips.gradeInox,
    },
    escalier: {
      present: config.presence_escalier,
      nbMarches: config.escalier_nb_marches,
      largeurM: config.escalier_largeur_m,
      gironCm: config.escalier_giron_cm,
      hauteurMarcheCm: config.escalier_hauteur_marche_cm,
      conformeBlondel: true,
      valeurBlondelCm: 2 * config.escalier_hauteur_marche_cm + config.escalier_giron_cm,
      lamesMarchesMl: 0,
      limonsNb: 0,
    },
    gardeCorps: {
      present: config.presence_garde_corps,
      longueurMl: config.garde_corps_longueur_ml,
      hauteurCm: config.garde_corps_hauteur_cm,
      type: config.garde_corps_type,
      nbPoteaux: Math.max(2, Math.ceil(config.garde_corps_longueur_ml / 1.5) + 1),
      conformeNorme: config.garde_corps_hauteur_cm >= 100,
    },
    conformite: auditComposite(config, reservations),
    chiffrage: {
      lignes: lignesChiffrage,
      totalHt: coutTotalHt,
      prixM2Ht: coutM2Ht,
    },
    calculeA: new Date().toISOString(),
  };
}
