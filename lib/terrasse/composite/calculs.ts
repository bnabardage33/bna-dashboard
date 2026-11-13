// Moteur de calcul complet pour terrasse composite + clips invisibles
// Indépendant du moteur DTU 51.4 (régit par DTA CSTB GS 2.1 et prescriptions fabricants)

import {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  LigneChiffrageTerrasse,
  ResultatCalculTerrasse,
  TarifsCatalogueTerrasse,
} from "../types";
import { auditComposite } from "./audit";
import { calculerClipsComposite } from "./clips";
import { calculerDilatationComposite } from "./dilatation";
import { getFabricantComposite, getGammeDefaut } from "./fabricants";
import { calculerTerrasseProGeometrie } from "../pro/quantitatifs-contrat";

export function calculComposite(
  config: ChantierTerrasseConfig,
  reservations: ChantierTerrasseReservation[] = [],
  tarifsCatalogue?: TarifsCatalogueTerrasse | null
): ResultatCalculTerrasse {
  const catalogue = tarifsCatalogue ?? config.tarifs_catalogue ?? null;
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

  // 8. Chiffrage prévisionnel. La priorité lame est identique au moteur bois : m² puis unité.
  const qteAccessoires = config.quantite_accessoires || {};
  const lameCatalogue = catalogue?.lame;
  const prixLameM2 = lameCatalogue?.prix_m2_ht;
  const prixLameUnitaire = lameCatalogue?.prix_unitaire_lame;
  const surfaceCommandeeCompositeM2 = Math.round(lineaireLamesAvecChutesMl * largeurLameM * 10) / 10;
  const designationLame = lameCatalogue?.designation?.trim() ||
    `Lame composite ${fabricant.nom} ${gamme.gamme} ${config.largeur_lame_mm || gamme.largeurMm}x${config.epaisseur_lame_mm || gamme.epaisseurMm}mm L=${longueurLameM}m`;
  const ligneLame: LigneChiffrageTerrasse =
    typeof prixLameM2 === "number" && Number.isFinite(prixLameM2) && prixLameM2 >= 0
      ? { code: "COMP-LAME", categorie: "Platelage", designation: designationLame, quantite: surfaceCommandeeCompositeM2, unite: "m²", prixUnitaireHt: prixLameM2, totalHt: Math.round(surfaceCommandeeCompositeM2 * prixLameM2 * 100) / 100 }
      : typeof prixLameUnitaire === "number" && Number.isFinite(prixLameUnitaire) && prixLameUnitaire >= 0
        ? { code: "COMP-LAME", categorie: "Platelage", designation: designationLame, quantite: nbLamesTotal, unite: "u", prixUnitaireHt: prixLameUnitaire, totalHt: Math.round(nbLamesTotal * prixLameUnitaire * 100) / 100 }
        : { code: "COMP-LAME", categorie: "Platelage", designation: designationLame, quantite: nbLamesTotal, unite: "u", prixUnitaireHt: 35, totalHt: Math.round(nbLamesTotal * 35 * 100) / 100 };

  const clipCatalogue = catalogue?.clip;
  const uniteClip = (clipCatalogue?.unite_mesure || "").trim().toLocaleLowerCase("fr-FR");
  const tailleBoiteClip = clipCatalogue?.conditionnement?.match(/(?:bo[iî]te|bte)\s*(?:de\s*)?(\d+)/i);
  const clipsParBoite = tailleBoiteClip ? Number(tailleBoiteClip[1]) : null;
  const clipEnBoite = ["boîte", "boite", "bte"].includes(uniteClip) && clipsParBoite === clips.conditionnementBoite;
  const clipUnitaire = ["u", "unité", "unite", "pièce", "piece"].includes(uniteClip);
  const prixClipCatalogue = clipCatalogue?.prix_conditionnement;
  const clipExploitable = (clipEnBoite || clipUnitaire) && typeof prixClipCatalogue === "number" && Number.isFinite(prixClipCatalogue) && prixClipCatalogue >= 0;
  const qteClip = typeof qteAccessoires.clip === "number" ? qteAccessoires.clip : clipEnBoite ? clips.nbBoitesClips : clips.nbTotalClips;
  const tarifClip = clipExploitable ? prixClipCatalogue : 65;

  const lambourdeCatalogue = catalogue?.lambourde;
  const uniteLambourde = (lambourdeCatalogue?.unite_mesure || "").trim().toLocaleLowerCase("fr-FR");
  const longueurConditionnement = lambourdeCatalogue?.conditionnement?.match(/(?:^|\D)(\d+(?:[.,]\d+)?)\s*m(?:ètre|etres|ètres)?\b/i);
  const longueurCatalogueM = longueurConditionnement ? Number(longueurConditionnement[1].replace(",", ".")) : null;
  const lambourdeAuMl = uniteLambourde === "ml" || uniteLambourde === "mètre linéaire" || uniteLambourde === "metre lineaire";
  const lambourdeParBarre = ["barre", "u", "unité", "unite", "pièce", "piece"].includes(uniteLambourde) && longueurCatalogueM === longueurLambourdeM;
  const prixLambourdeCatalogue = lambourdeCatalogue?.prix_conditionnement;
  const lambourdeExploitable = (lambourdeAuMl || lambourdeParBarre) && typeof prixLambourdeCatalogue === "number" && Number.isFinite(prixLambourdeCatalogue) && prixLambourdeCatalogue >= 0;
  const qteLambourde = typeof qteAccessoires.lambourde === "number" ? qteAccessoires.lambourde : lambourdeAuMl ? lineaireAvecChutesMl : nbBarresLambourdes;
  const tarifLambourde = lambourdeExploitable ? prixLambourdeCatalogue : config.type_lambourde === "alu_structure" ? 38 : 18;

  const plotCatalogue = catalogue?.plot;
  const unitePlot = (plotCatalogue?.unite_mesure || "").trim().toLocaleLowerCase("fr-FR");
  const plotExploitable = ["u", "unité", "unite", "pièce", "piece"].includes(unitePlot) && typeof plotCatalogue?.prix_conditionnement === "number" && Number.isFinite(plotCatalogue.prix_conditionnement) && plotCatalogue.prix_conditionnement >= 0;
  const qtePlot = typeof qteAccessoires.plot === "number" ? qteAccessoires.plot : nbPlots;
  const tarifPlot = plotExploitable ? plotCatalogue.prix_conditionnement! : 2.8;

  const lignesChiffrage: LigneChiffrageTerrasse[] = [
    ligneLame,
    {
      code: "COMP-CLIP-BOITE",
      categorie: "Fixation",
      designation: clipCatalogue?.designation?.trim() || `Kit clips invisibles ${gamme.clipType} Inox ${clips.gradeInox} (boîte de ${clips.conditionnementBoite})`,
      quantite: clipExploitable ? qteClip : clips.nbBoitesClips,
      unite: clipEnBoite ? "bte" : clipUnitaire ? "u" : "bte",
      prixUnitaireHt: tarifClip,
      totalHt: Math.round((clipExploitable ? qteClip : clips.nbBoitesClips) * tarifClip * 100) / 100,
    },
    {
      code: config.type_lambourde === "alu_structure" ? "STRUCT-ALU" : "STRUCT-BOIS",
      categorie: "Structure",
      designation: lambourdeCatalogue?.designation?.trim() || (config.type_lambourde === "alu_structure"
        ? `Lambourde aluminium structurelle L=${longueurLambourdeM}m`
        : `Lambourde pin autoclave Cl4 ${config.section_largeur_mm}x${config.section_hauteur_mm}mm`),
      quantite: lambourdeExploitable ? qteLambourde : nbBarresLambourdes,
      unite: lambourdeExploitable && lambourdeAuMl ? "ml" : "u",
      prixUnitaireHt: tarifLambourde,
      totalHt: Math.round((lambourdeExploitable ? qteLambourde : nbBarresLambourdes) * tarifLambourde * 100) / 100,
    },
    {
      code: "PLOT-REGLABLE",
      categorie: "Structure",
      designation: plotCatalogue?.designation?.trim() || `Plots réglables ${config.hauteur_reglage_plots || "40-60mm"}`,
      quantite: plotExploitable ? qtePlot : nbPlots,
      unite: "u",
      prixUnitaireHt: tarifPlot,
      totalHt: Math.round((plotExploitable ? qtePlot : nbPlots) * tarifPlot * 100) / 100,
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

  const terrassePro = calculerTerrasseProGeometrie(config, reservations, {
    formeType: config.forme_terrasse,
    poseMode: config.mode_calepinage,
    structureMode: config.mode_structure,
    solicitationCategory: config.categorie_sollicitation,
    retour1LongueurM: config.retour1_longueur_m,
    retour1LargeurM: config.retour1_largeur_m,
    retour2LongueurM: config.retour2_longueur_m,
    retour2LargeurM: config.retour2_largeur_m,
    conditionnementBoiteClips: clips.conditionnementBoite,
  });

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
    terrassePro,
    terrasseMobile: terrassePro?.terrasseMobile,
    calculeA: new Date().toISOString(),
  };
}
