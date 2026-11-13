// Moteur de calcul quantitatif et dimensionnement du platelage TERRASSE (DTU 51.4)
import type {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  LigneChiffrageTerrasse,
  ResultatCalculTerrasse,
  TarifsCatalogueTerrasse,
} from "./types";
import {
  calculerEntraxeMaxLambourdes,
  calculerPorteeMaxLambourde,
  verifierConformiteDTU51_4,
} from "./dtu51_4";
import { calculComposite } from "./composite/calculs";
import { calculerTerrasseProGeometrie } from "./pro/quantitatifs-contrat";

/** Prix unitaires moyens HT de référence (fournitures pro) pour le chiffrage indicatif */
const TARIFS_INDICATIFS: Record<string, number> = {
  // Lames au m²
  lame_pin_cl4: 34.0,
  lame_douglas: 42.0,
  lame_meleze: 52.0,
  lame_cumaru: 78.0,
  lame_ipe: 115.0,
  lame_composite: 68.0,
  lame_bambou_thermo: 85.0,

  // Lambourdes au ml
  lambourde_bois_cl4: 4.8,
  lambourde_bois_exotique: 9.5,
  lambourde_alu_structure: 14.0,

  // Plots à l'unité
  plot_reglable: 3.2,
  plot_autonivelant: 4.6,
  plot_cale_plate: 1.1,
  plot_beton: 6.5,
  plot_vis_fondation: 28.0,

  // Fixations
  vis_inox_boite_200: 36.0,
  clips_boite_100: 58.0,

  // Accessoires
  bande_epdm_rouleau_20m: 24.0,
  geotextile_m2: 1.8,
  cale_isolation_unite: 0.45,

  // Escaliers & Garde-corps
  limon_marche_unite: 45.0,
  garde_corps_ml: 125.0,
};

export function calculerTerrasse(
  config: ChantierTerrasseConfig,
  reservations: ChantierTerrasseReservation[] = [],
  tarifsCatalogue?: TarifsCatalogueTerrasse | null
): ResultatCalculTerrasse {
  const catalogue = tarifsCatalogue ?? config.tarifs_catalogue ?? null;

  if (config.systeme_terrasse === "composite_clip" || config.essence_bois === "composite") {
    return calculComposite(config, reservations, catalogue);
  }

  // Exécution amont des 4 briques du moteur Terrasse Pro (NF DTU 51.4 Décembre 2018)
  const terrassePro = calculerTerrasseProGeometrie(config, reservations, {
    formeType: config.forme_terrasse,
    poseMode: config.mode_calepinage,
    structureMode: config.mode_structure,
    solicitationCategory: config.categorie_sollicitation,
    vissageParDessousBois: config.vissage_par_dessous_bois,
    retour1LongueurM: config.retour1_longueur_m,
    retour1LargeurM: config.retour1_largeur_m,
    retour2LongueurM: config.retour2_longueur_m,
    retour2LargeurM: config.retour2_largeur_m,
  });

  const surfaceBruteM2 = Number((config.longueur_m * config.largeur_m).toFixed(2));
  const perimetreM = Number((2 * (config.longueur_m + config.largeur_m)).toFixed(2));
  const surfaceReservationsM2 = terrassePro.quantities.geometricNet.reservationsDeductedAreaM2;

  // --- 1. ESCALIER ---
  let surfaceEscalierM2 = 0;
  let lamesEscalierMl = 0;
  let limonsNb = 0;
  let blondelCm = 0;
  let blondelOk = false;

  if (config.presence_escalier) {
    surfaceEscalierM2 = Number(
      (
        config.escalier_nb_marches *
        (config.escalier_giron_cm / 100) *
        config.escalier_largeur_m
      ).toFixed(2)
    );
    blondelCm = 2 * config.escalier_hauteur_marche_cm + config.escalier_giron_cm;
    blondelOk = blondelCm >= 60 && blondelCm <= 64;

    // Nombre de lames par marche (giron / largeur lame)
    const nbLamesParMarche = Math.max(1, Math.ceil((config.escalier_giron_cm * 10) / config.largeur_lame_mm));
    lamesEscalierMl = Number(
      (
        config.escalier_nb_marches *
        nbLamesParMarche *
        config.escalier_largeur_m
      ).toFixed(2)
    );

    // 1 limon tous les 60 cm d'emmarchement
    limonsNb = Math.max(2, Math.ceil((config.escalier_largeur_m * 100) / 60) + 1);
  }

  const surfaceNetteM2 = Number(
    Math.max(0.1, surfaceBruteM2 - surfaceReservationsM2 + surfaceEscalierM2).toFixed(2)
  );

  // --- 2. LAMBOURDES ---
  const entraxeMaxDtuCm = calculerEntraxeMaxLambourdes(
    config.epaisseur_lame_mm,
    config.essence_bois
  );

  // Disposition : les lambourdes cheminent sur la largeur (ou longueur selon type de pose)
  const dimensionParcoursCm =
    config.type_pose === "perpendiculaire"
      ? config.largeur_m * 100
      : config.longueur_m * 100;
  const longueurLambourdeUnitaireM =
    config.type_pose === "perpendiculaire" ? config.longueur_m : config.largeur_m;

  let nbRangees = Math.ceil(dimensionParcoursCm / config.entraxe_lambourdes_cm) + 1;

  // Si aboutage double lambourdage : renforts sur les lignes d'aboutage
  if (config.double_lambourdage_aboutage && config.longueur_m > config.longueur_lame_m) {
    const nbJointsAboutage = Math.floor(config.longueur_m / config.longueur_lame_m);
    nbRangees += nbJointsAboutage;
  }

  const lineaireChevetresMl =
    terrassePro.quantities.geometricNet.totalJoistNetLinearMetersByLayer.CHEVETRE_RESERVATION || 0;
  const lineaireCroiseMl =
    terrassePro.quantities.geometricNet.totalJoistNetLinearMetersByLayer.SECONDARY_BOTTOM_CROSS || 0;
  const lineaireMl = Number(
    (nbRangees * longueurLambourdeUnitaireM + lineaireChevetresMl + lineaireCroiseMl).toFixed(1)
  );
  const lineaireAvecChutesMl = Number(
    (lineaireMl * config.coef_perte_lambourdes).toFixed(1)
  );
  const nbBarres = Math.ceil(lineaireAvecChutesMl / config.longueur_lambourde_m);
  const sectionMm = `${config.section_largeur_mm}x${config.section_hauteur_mm} mm`;

  // Bande d'étanchéité EPDM
  const epdmMl = config.bande_etancheite_epdm ? lineaireMl : 0;

  // --- 3. PLOTS & SUPPORTS ---
  const porteeMaxAdmissibleCm = calculerPorteeMaxLambourde(
    config.section_hauteur_mm,
    config.section_largeur_mm,
    config.type_lambourde
  );
  const longueurCm = longueurLambourdeUnitaireM * 100;
  const nbPlotsParLambourde = Math.ceil(longueurCm / config.entraxe_plots_cm) + 1;

  let nbPlotsTotal = nbRangees * nbPlotsParLambourde;

  //Plots additionnels sous chevêtres de réservations (issus de la Brique 2)
  const plotsChevetresNb =
    terrassePro.quantities.geometricNet.exactSupportCountByType.PLOT_CHEVETRE || 0;
  nbPlotsTotal += plotsChevetresNb;

  // Renforts plots pour escalier si présent
  if (config.presence_escalier) {
    nbPlotsTotal += limonsNb * 2;
  }

  const densiteParM2 = Number((nbPlotsTotal / Math.max(1, surfaceBruteM2)).toFixed(1));
  const calesIsolationNb = config.cales_isolation ? nbPlotsTotal : 0;
  const geotextileM2 =
    config.type_sol === "terre_meuble" || config.type_sol === "stabilise_grave"
      ? Number((surfaceBruteM2 * 1.15).toFixed(1))
      : 0;

  // --- 4. LAMES (PLATELAGE) ---
  const pasMm = config.largeur_lame_mm + config.espacement_lames_mm;
  const dimensionPoseMm =
    config.type_pose === "perpendiculaire"
      ? config.longueur_m * 1000
      : config.largeur_m * 1000;
  const nbLignesLames = Math.ceil(dimensionPoseMm / pasMm);

  const lineaireLamesBrutMl =
    (nbLignesLames * (config.type_pose === "perpendiculaire" ? config.largeur_m : config.longueur_m)) +
    lamesEscalierMl;

  const lineaireLamesMl = Number(lineaireLamesBrutMl.toFixed(1));
  const surfaceACommanderM2 = Number(
    (surfaceNetteM2 * config.coef_perte_lames).toFixed(2)
  );
  const lineaireACommanderMl = Number(
    (lineaireLamesMl * config.coef_perte_lames).toFixed(1)
  );
  const nbLamesStandard = Math.ceil(lineaireACommanderMl / config.longueur_lame_m);

  // --- 5. FIXATIONS ---
  let nbVisOuClipsTotal = 0;
  let nbBoites = 0;
  let clipsDepartFinNb = 0;

  const nbCroisements = nbLignesLames * nbRangees;

  if (config.type_fixation === "vis_inox") {
    // 2 vis par croisement lame/lambourde + 10% pour rives & aboutages
    nbVisOuClipsTotal = Math.ceil(nbCroisements * 2 * 1.1);
    nbBoites = Math.ceil(nbVisOuClipsTotal / 200); // Boîtes de 200 vis inox
  } else {
    // Clips invisibles : 1 clip par croisement + clips spéciaux de départ/fin
    clipsDepartFinNb = nbRangees * 2;
    nbVisOuClipsTotal = Math.ceil(nbCroisements * 1.05 + clipsDepartFinNb);
    nbBoites = Math.ceil(nbVisOuClipsTotal / 100); // Boîtes de 100 clips
  }

  // --- 6. GARDE-CORPS ---
  let nbPoteaux = 0;
  let conformeGardeCorps = true;

  if (config.presence_garde_corps && config.garde_corps_longueur_ml > 0) {
    nbPoteaux = Math.ceil(config.garde_corps_longueur_ml / 1.1) + 1;
    conformeGardeCorps = config.garde_corps_hauteur_cm >= 100;
  } else if (config.hauteur_sol_cm > 100) {
    conformeGardeCorps = false;
  }

  // --- 7. CONTRÔLE DE CONFORMITÉ DTU 51.4 ---
  const conformite = verifierConformiteDTU51_4(config, reservations);

  // --- 8. CHIFFRAGE / NOMENCLATURE ESTIMATIVE ---
  const lignes: LigneChiffrageTerrasse[] = [];

  // Le prix au m² est prioritaire dans les deux moteurs. Les prix indicatifs
  // restent le repli lorsque le prix sélectionné n'est pas exploitable.
  const lameCatalogue = catalogue?.lame;
  const prixLameM2 = lameCatalogue?.prix_m2_ht;
  const prixLameUnitaire = lameCatalogue?.prix_unitaire_lame;
  const designationLame = lameCatalogue?.designation?.trim() ||
    `Lames ${config.essence_bois.toUpperCase()} ${config.largeur_lame_mm ?? 145}x${config.epaisseur_lame_mm} mm (longueur ${config.longueur_lame_m} m)`;
  if (typeof prixLameM2 === "number" && Number.isFinite(prixLameM2) && prixLameM2 >= 0) {
    lignes.push({
      code: "LAM-01", categorie: "Platelage", designation: designationLame,
      quantite: surfaceACommanderM2, unite: "m²", prixUnitaireHt: prixLameM2,
      totalHt: Number((surfaceACommanderM2 * prixLameM2).toFixed(2)),
    });
  } else if (typeof prixLameUnitaire === "number" && Number.isFinite(prixLameUnitaire) && prixLameUnitaire >= 0) {
    lignes.push({
      code: "LAM-01", categorie: "Platelage", designation: designationLame,
      quantite: nbLamesStandard, unite: "u", prixUnitaireHt: prixLameUnitaire,
      totalHt: Number((nbLamesStandard * prixLameUnitaire).toFixed(2)),
    });
  } else {
  const tarifLame = TARIFS_INDICATIFS[`lame_${config.essence_bois}`] || 45.0;
  lignes.push({
    code: "LAM-01",
    categorie: "Platelage",
    designation: designationLame,
    quantite: surfaceACommanderM2,
    unite: "m²",
    prixUnitaireHt: tarifLame,
    totalHt: Number((surfaceACommanderM2 * tarifLame).toFixed(2)),
  });
  }

  const lambourdeCatalogue = catalogue?.lambourde;
  const uniteLambourde = (lambourdeCatalogue?.unite_mesure || "").trim().toLocaleLowerCase("fr-FR");
  const conditionnementLambourde = lambourdeCatalogue?.conditionnement || "";
  const longueurConditionnement = conditionnementLambourde.match(/(?:^|\D)(\d+(?:[.,]\d+)?)\s*m(?:ètre|etres|ètres)?\b/i);
  const longueurCatalogueM = longueurConditionnement ? Number(longueurConditionnement[1].replace(",", ".")) : null;
  const qteAccessoires = config.quantite_accessoires || {};
  const prixLambourdeCatalogue = lambourdeCatalogue?.prix_conditionnement;
  const lambourdeAuMl = uniteLambourde === "ml" || uniteLambourde === "mètre linéaire" || uniteLambourde === "metre lineaire";
  const lambourdeParBarre = ["barre", "u", "unité", "unite", "pièce", "piece"].includes(uniteLambourde) && longueurCatalogueM === config.longueur_lambourde_m;
  const qteLambourdeCatalogue = typeof qteAccessoires.lambourde === "number"
    ? qteAccessoires.lambourde
    : lambourdeAuMl ? lineaireAvecChutesMl : nbBarres;
  if (lambourdeCatalogue && (lambourdeAuMl || lambourdeParBarre) && typeof prixLambourdeCatalogue === "number" && Number.isFinite(prixLambourdeCatalogue) && prixLambourdeCatalogue >= 0) {
    lignes.push({
      code: "STR-01", categorie: "Structure",
      designation: lambourdeCatalogue.designation?.trim() || `Lambourdes ${config.type_lambourde} section ${sectionMm}`,
      quantite: qteLambourdeCatalogue, unite: lambourdeAuMl ? "ml" : "u",
      prixUnitaireHt: prixLambourdeCatalogue,
      totalHt: Number((qteLambourdeCatalogue * prixLambourdeCatalogue).toFixed(2)),
    });
  } else {
  const tarifLambourde = TARIFS_INDICATIFS[`lambourde_${config.type_lambourde}`] || 5.0;
  lignes.push({
    code: "STR-01",
    categorie: "Structure",
    designation: `Lambourdes ${config.type_lambourde} section ${sectionMm} (barres de ${config.longueur_lambourde_m} m)`,
    quantite: lineaireAvecChutesMl,
    unite: "ml",
    prixUnitaireHt: tarifLambourde,
    totalHt: Number((lineaireAvecChutesMl * tarifLambourde).toFixed(2)),
  });
  }

  // Plots
  const plotCatalogue = catalogue?.plot;
  const unitePlot = (plotCatalogue?.unite_mesure || "").trim().toLocaleLowerCase("fr-FR");
  const prixPlotCatalogue = plotCatalogue?.prix_conditionnement;
  const qtePlotCatalogue = typeof qteAccessoires.plot === "number" ? qteAccessoires.plot : nbPlotsTotal;
  const plotExploitable = ["u", "unité", "unite", "pièce", "piece"].includes(unitePlot) && typeof prixPlotCatalogue === "number" && Number.isFinite(prixPlotCatalogue) && prixPlotCatalogue >= 0;
  const tarifPlot = plotExploitable ? prixPlotCatalogue : TARIFS_INDICATIFS[`plot_${config.type_plots}`] || 3.2;
  const designationPlot = plotCatalogue?.designation?.trim() || `Plots ${config.type_plots} réglables (${config.hauteur_reglage_plots.replace("_", "-")} mm)`;
  lignes.push({
    code: "SUP-01",
    categorie: "Structure",
    designation: designationPlot,
    quantite: plotExploitable ? qtePlotCatalogue : nbPlotsTotal,
    unite: "u",
    prixUnitaireHt: tarifPlot,
    totalHt: Number(((plotExploitable ? qtePlotCatalogue : nbPlotsTotal) * tarifPlot).toFixed(2)),
  });

  // Fixations
  if (config.type_fixation === "vis_inox") {
    lignes.push({
      code: "FIX-01",
      categorie: "Fixation",
      designation: `Vis terrasse inox A2 / A4 auto-foreuses (boîtes de 200)`,
      quantite: nbBoites,
      unite: "bte",
      prixUnitaireHt: TARIFS_INDICATIFS.vis_inox_boite_200,
      totalHt: Number((nbBoites * TARIFS_INDICATIFS.vis_inox_boite_200).toFixed(2)),
    });
  } else {
    const clipCatalogue = catalogue?.clip;
    const uniteClip = (clipCatalogue?.unite_mesure || "").trim().toLocaleLowerCase("fr-FR");
    const conditionnementClip = clipCatalogue?.conditionnement || "";
    const tailleBoite = conditionnementClip.match(/(?:bo[iî]te|bte)\s*(?:de\s*)?(\d+)/i);
    const clipsParBoite = tailleBoite ? Number(tailleBoite[1]) : null;
    const clipEnBoite = ["boîte", "boite", "bte"].includes(uniteClip) && clipsParBoite === 100;
    const clipUnitaire = ["u", "unité", "unite", "pièce", "piece"].includes(uniteClip);
    const qteClipCatalogue = typeof qteAccessoires.clip === "number"
      ? qteAccessoires.clip
      : clipEnBoite ? nbBoites : nbVisOuClipsTotal;
    const prixClipCatalogue = clipCatalogue?.prix_conditionnement;
    const clipExploitable = (clipEnBoite || clipUnitaire) && typeof prixClipCatalogue === "number" && Number.isFinite(prixClipCatalogue) && prixClipCatalogue >= 0;
    const tarifClip = clipExploitable ? prixClipCatalogue : TARIFS_INDICATIFS.clips_boite_100;
    lignes.push({
      code: "FIX-02",
      categorie: "Fixation",
      designation: clipCatalogue?.designation?.trim() || `Clips invisibles inox + vis de serrage (boîtes de 100)`,
      quantite: clipExploitable ? qteClipCatalogue : nbBoites,
      unite: clipEnBoite ? "bte" : clipUnitaire ? "u" : "bte",
      prixUnitaireHt: tarifClip,
      totalHt: Number(((clipExploitable ? qteClipCatalogue : nbBoites) * tarifClip).toFixed(2)),
    });
  }

  // EPDM
  if (config.bande_etancheite_epdm && epdmMl > 0) {
    const nbRlxEpdm = Math.ceil(epdmMl / 20);
    lignes.push({
      code: "ACC-01",
      categorie: "Accessoires",
      designation: `Bande de protection bitumineuse / EPDM (rouleau 20m x 75mm)`,
      quantite: nbRlxEpdm,
      unite: "rlx",
      prixUnitaireHt: TARIFS_INDICATIFS.bande_epdm_rouleau_20m,
      totalHt: Number((nbRlxEpdm * TARIFS_INDICATIFS.bande_epdm_rouleau_20m).toFixed(2)),
    });
  }

  // Cales
  if (config.cales_isolation && calesIsolationNb > 0) {
    lignes.push({
      code: "ACC-02",
      categorie: "Accessoires",
      designation: `Cales d'isolation caoutchouc sous lambourdes`,
      quantite: calesIsolationNb,
      unite: "u",
      prixUnitaireHt: TARIFS_INDICATIFS.cale_isolation_unite,
      totalHt: Number((calesIsolationNb * TARIFS_INDICATIFS.cale_isolation_unite).toFixed(2)),
    });
  }

  // Géotextile
  if (geotextileM2 > 0) {
    lignes.push({
      code: "ACC-03",
      categorie: "Accessoires",
      designation: `Feutre géotextile anti-repousse 150g/m²`,
      quantite: geotextileM2,
      unite: "m²",
      prixUnitaireHt: TARIFS_INDICATIFS.geotextile_m2,
      totalHt: Number((geotextileM2 * TARIFS_INDICATIFS.geotextile_m2).toFixed(2)),
    });
  }

  // Escalier
  if (config.presence_escalier && limonsNb > 0) {
    lignes.push({
      code: "ESC-01",
      categorie: "Escalier",
      designation: `Limons découpés et kit de marche d'accès (${config.escalier_nb_marches} marches)`,
      quantite: limonsNb,
      unite: "u",
      prixUnitaireHt: TARIFS_INDICATIFS.limon_marche_unite * config.escalier_nb_marches,
      totalHt: Number(
        (limonsNb * TARIFS_INDICATIFS.limon_marche_unite * config.escalier_nb_marches).toFixed(2)
      ),
    });
  }

  // Garde-corps
  if (config.presence_garde_corps && config.garde_corps_longueur_ml > 0) {
    lignes.push({
      code: "GDC-01",
      categorie: "Garde-corps",
      designation: `Garde-corps périphérique modèle ${config.garde_corps_type} (H: ${config.garde_corps_hauteur_cm} cm, ${nbPoteaux} poteaux)`,
      quantite: config.garde_corps_longueur_ml,
      unite: "ml",
      prixUnitaireHt: TARIFS_INDICATIFS.garde_corps_ml,
      totalHt: Number((config.garde_corps_longueur_ml * TARIFS_INDICATIFS.garde_corps_ml).toFixed(2)),
    });
  }

  // Fournitures Terrasse Mobile & Motorisation (si présente)
  const mob = terrassePro.terrasseMobile;
  if (mob && mob.active) {
    lignes.push({
      code: "MOB-01",
      categorie: "Terrasse Mobile",
      designation: `Rails de guidage extra-plats en acier Inox 316L (AISI 316) anti-corrosion`,
      quantite: mob.rails.lineaireTotalM,
      unite: "ml",
      prixUnitaireHt: 58.0,
      totalHt: Number((mob.rails.lineaireTotalM * 58.0).toFixed(2)),
    });

    lignes.push({
      code: "MOB-02",
      categorie: "Terrasse Mobile",
      designation: `Profilés porteurs aluminium ${mob.structureChassis.sectionAluMm}mm pour châssis mobile`,
      quantite: mob.structureChassis.lineaireProfilesAluM,
      unite: "ml",
      prixUnitaireHt: 34.0,
      totalHt: Number((mob.structureChassis.lineaireProfilesAluM * 34.0).toFixed(2)),
    });

    lignes.push({
      code: "MOB-03",
      categorie: "Terrasse Mobile",
      designation: `${mob.roulement.reference} (charge max ${mob.roulement.chargeParGaletKg}kg/pt)`,
      quantite: mob.roulement.nbGaletsTotal,
      unite: "u",
      prixUnitaireHt: 42.0,
      totalHt: Number((mob.roulement.nbGaletsTotal * 42.0).toFixed(2)),
    });

    if (mob.motorisation && mob.motorisation.active) {
      const mot = mob.motorisation;
      lignes.push({
        code: "MOT-01",
        categorie: "Motorisation Mobile",
        designation: `Motoréducteur basse tension 24V DC spécial terrasse mobile (${mot.puissanceMoteurUnitaireN} N traction)`,
        quantite: mot.nbMoteurs,
        unite: "u",
        prixUnitaireHt: 480.0,
        totalHt: Number((mot.nbMoteurs * 480.0).toFixed(2)),
      });

      if (mot.lineaireCremaillereM > 0) {
        lignes.push({
          code: "MOT-02",
          categorie: "Motorisation Mobile",
          designation: `Crémaillère renforcée module 4 à âme acier surmoulée nylon anti-bruit`,
          quantite: mot.barresCremaillereCount,
          unite: "m",
          prixUnitaireHt: 28.0,
          totalHt: Number((mot.barresCremaillereCount * 28.0).toFixed(2)),
        });
      }

      lignes.push({
        code: "MOT-03",
        categorie: "Motorisation Mobile",
        designation: mot.coffretCommande.designation,
        quantite: 1,
        unite: "kit",
        prixUnitaireHt: mot.typeMotorisation === "solaire" ? 340.0 : 190.0,
        totalHt: mot.typeMotorisation === "solaire" ? 340.0 : 190.0,
      });

      lignes.push({
        code: "MOT-04",
        categorie: "Motorisation Mobile",
        designation: `Kit capteurs fins de course magnétiques étanches IP68 (${mot.finsDeCourse.nbCapteurs} capteurs)`,
        quantite: 1,
        unite: "kit",
        prixUnitaireHt: 75.0,
        totalHt: 75.0,
      });

      lignes.push({
        code: "MOT-05",
        categorie: "Motorisation Mobile",
        designation: mot.telecommande.description,
        quantite: mot.telecommande.nbTelecommandes,
        unite: "u",
        prixUnitaireHt: 48.0,
        totalHt: Number((mot.telecommande.nbTelecommandes * 48.0).toFixed(2)),
      });
    }
  }

  const totalHt = Number(
    lignes.reduce((acc, curr) => acc + curr.totalHt, 0).toFixed(2)
  );

  return {
    surfaceBruteM2,
    surfaceNetteM2,
    perimetreM,
    lambourdes: {
      entraxeCm: config.entraxe_lambourdes_cm,
      entraxeMaxDtuCm,
      nbRangees,
      lineaireMl,
      lineaireAvecChutesMl,
      nbBarres,
      sectionMm,
      epdmMl,
      calesIsolationNb,
    },
    plots: {
      type: config.type_plots,
      entraxeCm: config.entraxe_plots_cm,
      porteeMaxAdmissibleCm,
      nbPlotsParLambourde,
      nbPlotsTotal,
      densiteParM2,
      geotextileM2,
    },
    lames: {
      essence: config.essence_bois,
      largeurMm: config.largeur_lame_mm,
      epaisseurMm: config.epaisseur_lame_mm,
      pasMm,
      nbLignesLames,
      lineaireMl: lineaireLamesMl,
      surfaceACommanderM2,
      nbLamesStandard,
      espacementRecommandeMm: config.espacement_lames_mm || 5,
      jeuAboutageMm: 5,
    },
    fixations: {
      type: config.type_fixation,
      nbVisOuClipsTotal,
      nbBoites,
      clipsDepartFinNb,
      diametreVisMm: terrassePro.quantities.commercialSupply.fastenerSpec.diameterMm,
      longueurVisMm: terrassePro.quantities.commercialSupply.fastenerSpec.minLengthMm,
      inoxGrade: terrassePro.quantities.commercialSupply.fastenerSpec.stainlessGrade,
    },
    escalier: {
      present: config.presence_escalier,
      nbMarches: config.escalier_nb_marches,
      largeurM: config.escalier_largeur_m,
      gironCm: config.escalier_giron_cm,
      hauteurMarcheCm: config.escalier_hauteur_marche_cm,
      conformeBlondel: blondelOk,
      valeurBlondelCm: blondelCm,
      lamesMarchesMl: lamesEscalierMl,
      limonsNb,
    },
    gardeCorps: {
      present: config.presence_garde_corps,
      longueurMl: config.garde_corps_longueur_ml,
      hauteurCm: config.garde_corps_hauteur_cm,
      type: config.garde_corps_type,
      nbPoteaux,
      conformeNorme: conformeGardeCorps,
    },
    conformite,
    chiffrage: {
      lignes,
      totalHt,
    },
    terrassePro,
    terrasseMobile: terrassePro.terrasseMobile,
    calculeA: new Date().toISOString(),
  };
}
