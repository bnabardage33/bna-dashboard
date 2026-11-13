// Moteur de calcul et de modélisation de terrasse mobile coulissante sur rails
// Développé spécifiquement pour la couverture sécurisée de réservations piscine (NF DTU 51.4 / NF P90-308)

import type {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  ConfigTerrasseMobile,
  ResultatPlateauMobile,
  TypeMotorisationTerrasse,
} from "../types";
import {
  CONSTANTES_TERRASSE_PRO,
  type PlacedBladeSegment,
  type PlacedJoistSegment,
  type PlacedMobilePanel,
  type PlacedMobileStructure,
  type Point2D,
} from "./presets-regles";

/**
 * Résout la configuration effective de terrasse mobile pour une réservation piscine
 */
export function resoudreConfigTerrasseMobile(
  config: ChantierTerrasseConfig,
  poolRes?: ChantierTerrasseReservation
): ConfigTerrasseMobile | null {
  if (poolRes?.terrasse_mobile && poolRes.terrasse_mobile.active) {
    const typeMot: TypeMotorisationTerrasse =
      poolRes.terrasse_mobile.type_motorisation ??
      (poolRes.terrasse_mobile.motorise ? "solaire" : "aucune");
    return {
      ...poolRes.terrasse_mobile,
      motorise: typeMot !== "aucune",
      type_motorisation: typeMot,
    };
  }
  if (config.terrasse_mobile && config.terrasse_mobile.active) {
    const typeMot: TypeMotorisationTerrasse =
      config.terrasse_mobile.type_motorisation ??
      (config.terrasse_mobile.motorise ? "solaire" : "aucune");
    return {
      ...config.terrasse_mobile,
      motorise: typeMot !== "aucune",
      type_motorisation: typeMot,
    };
  }
  // Si réservation piscine présente avec metadata terrasse_mobile
  if (poolRes?.metadata?.terrasse_mobile) {
    const meta = poolRes.metadata.terrasse_mobile as Partial<ConfigTerrasseMobile>;
    const typeMot: TypeMotorisationTerrasse =
      meta.type_motorisation ?? (meta.motorise ? "solaire" : "aucune");
    return {
      active: true,
      mode: meta.mode ?? "1_plateau",
      sens_refoulement: meta.sens_refoulement ?? "droite",
      hauteur_chassis_alu_mm: meta.hauteur_chassis_alu_mm ?? 100,
      jeu_fonctionnel_peripherique_mm: meta.jeu_fonctionnel_peripherique_mm ?? 20,
      section_profil_alu_mm: meta.section_profil_alu_mm ?? "80x40",
      charge_exploitation_kn_m2: meta.charge_exploitation_kn_m2 ?? 2.5,
      motorise: typeMot !== "aucune",
      type_motorisation: typeMot,
      puissance_moteur_n: meta.puissance_moteur_n,
    };
  }
  return null;
}

export interface CalculTerrasseMobileParams {
  config: ChantierTerrasseConfig;
  poolReservation: ChantierTerrasseReservation;
  mobileConfig: ConfigTerrasseMobile;
}

export interface CalculTerrasseMobileResult {
  resultatPlateau: ResultatPlateauMobile;
  mobileStructure: PlacedMobileStructure;
}

export function calculerSousEnsembleTerrasseMobile(
  params: CalculTerrasseMobileParams
): CalculTerrasseMobileResult {
  const { config, poolReservation: pool, mobileConfig: mob } = params;

  // Dimensions piscine en mm et en mètres
  const poolW_m = pool.largeur || 4.0;
  const poolL_m = pool.longueur || 2.5;
  const poolX_m = pool.x || 1.0;
  const poolY_m = pool.y || 1.0;

  const poolW_mm = Math.round(poolW_m * 1000);
  const poolL_mm = Math.round(poolL_m * 1000);
  const poolX_mm = Math.round(poolX_m * 1000);
  const poolY_mm = Math.round(poolY_m * 1000);

  // Jeu périphérique fonctionnel (défaut 20 mm)
  const jeuMm = Math.max(10, Math.min(50, mob.jeu_fonctionnel_peripherique_mm || 20));
  const jeuM = jeuMm / 1000;

  // Dimensions totales du plateau mobile fermé
  const totalPlateauW_mm = poolW_mm + 2 * jeuMm;
  const totalPlateauL_mm = poolL_mm + 2 * jeuMm;
  const totalPlateauW_m = totalPlateauW_mm / 1000;
  const totalPlateauL_m = totalPlateauL_mm / 1000;

  const originX_mm = poolX_mm - jeuMm;
  const originY_mm = poolY_mm - jeuMm;
  const originX_m = originX_mm / 1000;
  const originY_m = originY_mm / 1000;

  const hauteurChassisMm = mob.hauteur_chassis_alu_mm || 100;
  const epaisseurLameMm = config.epaisseur_lame_mm || 21;
  const epaisseurTotaleMm = hauteurChassisMm + epaisseurLameMm;
  const surfacePlateauM2 = Number((totalPlateauW_m * totalPlateauL_m).toFixed(2));

  // Poids propres estimés (kg/m²)
  const isComp = config.essence_bois === "composite";
  const isExotique = config.essence_bois === "ipe" || config.essence_bois === "cumaru";
  const poidsPlatelageKgM2 = isComp ? 24 : isExotique ? 22 : 16;
  const poidsAluKgM2 = hauteurChassisMm >= 100 ? 14 : 11;
  const surchargeExploitationKgM2 = 255; // 2.5 kN/m² conforme DTU 51.4 et norme abris piscines NF P90-308

  const poidsPropreKg = Math.round(surfacePlateauM2 * (poidsPlatelageKgM2 + poidsAluKgM2));
  const poidsTotalChargeKg = Math.round(
    surfacePlateauM2 * (poidsPlatelageKgM2 + poidsAluKgM2 + surchargeExploitationKgM2)
  );

  // Orientation du coulissement
  const isLateral = mob.sens_refoulement === "gauche" || mob.sens_refoulement === "droite";
  const isNegative = mob.sens_refoulement === "gauche" || mob.sens_refoulement === "haut";

  // Détermination du nombre de rails au sol (2 minimum, 3 si portée perpendiculaire > 4.0 m)
  const spanPerpendicularM = isLateral ? totalPlateauL_m : totalPlateauW_m;
  const nbRails = spanPerpendicularM > 4.0 ? 3 : 2;

  // Calcul de la course et des rails selon le mode
  const isDeuxPlateaux = mob.mode === "2_demi_plateaux";

  const panels: PlacedMobilePanel[] = [];
  const rails: Array<{
    id: string;
    startMm: Point2D;
    endMm: Point2D;
    lengthMm: number;
  }> = [];

  // Lames de platelage mobile
  const lameWidthMm = config.largeur_lame_mm || 145;
  const lameGapMm = config.espacement_lames_mm || 5;
  const lamePitchMm = lameWidthMm + lameGapMm;
  const entraxeTraversesMm = 400; // 40 cm recommandé pour profilés aluminium

  let totalLinearAluMm = 0;
  let totalBladesLinearMm = 0;
  let nbLamesMobile = 0;
  let nbVisMobile = 0;

  if (!isDeuxPlateaux) {
    // MODE 1 PLATEAU MONOBLOC
    const courseMaxM = isLateral ? totalPlateauW_m + 0.2 : totalPlateauL_m + 0.2;
    const courseMaxMm = Math.round(courseMaxM * 1000);
    const dirVector = isLateral
      ? { x: isNegative ? -1 : 1, y: 0 }
      : { x: 0, y: isNegative ? -1 : 1 };

    // Génération du châssis alu (cadre + traverses)
    const chassisJoists: PlacedJoistSegment[] = [];
    // 2 longerons longitudinaux
    chassisJoists.push(
      {
        id: "chassis-mob-cadre-1",
        layer: "PRIMARY_TOP",
        role: "RIVE",
        startMm: { xMm: 0, yMm: 0 },
        endMm: { xMm: totalPlateauW_mm, yMm: 0 },
        lengthNetMm: totalPlateauW_mm,
        widthMm: 40,
        heightMm: hauteurChassisMm,
        supportIds: [],
        maxSpanBetweenSupportsMm: entraxeTraversesMm,
      },
      {
        id: "chassis-mob-cadre-2",
        layer: "PRIMARY_TOP",
        role: "RIVE",
        startMm: { xMm: 0, yMm: totalPlateauL_mm },
        endMm: { xMm: totalPlateauW_mm, yMm: totalPlateauL_mm },
        lengthNetMm: totalPlateauW_mm,
        widthMm: 40,
        heightMm: hauteurChassisMm,
        supportIds: [],
        maxSpanBetweenSupportsMm: entraxeTraversesMm,
      }
    );
    totalLinearAluMm += totalPlateauW_mm * 2;

    // Traverses intermédiaires alu réparties selon le sens perpendiculaire
    const nbTraverses = Math.max(3, Math.ceil(totalPlateauW_mm / entraxeTraversesMm) + 1);
    for (let t = 0; t < nbTraverses; t++) {
      const tx = Math.min(totalPlateauW_mm, t * entraxeTraversesMm);
      chassisJoists.push({
        id: `chassis-mob-traverse-${t + 1}`,
        layer: "PRIMARY_TOP",
        role: "COURANTE",
        startMm: { xMm: tx, yMm: 0 },
        endMm: { xMm: tx, yMm: totalPlateauL_mm },
        lengthNetMm: totalPlateauL_mm,
        widthMm: 40,
        heightMm: hauteurChassisMm,
        supportIds: [],
        maxSpanBetweenSupportsMm: entraxeTraversesMm,
      });
      totalLinearAluMm += totalPlateauL_mm;
    }

    // Platelage mobile : lames alignées sur la largeur
    const mobileBlades: PlacedBladeSegment[] = [];
    const nbRows = Math.floor(totalPlateauL_mm / lamePitchMm);
    for (let r = 0; r < nbRows; r++) {
      const y0 = r * lamePitchMm + 2;
      const y1 = y0 + lameWidthMm;
      mobileBlades.push({
        id: `mob-blade-${r + 1}`,
        rowIndex: r,
        segmentIndexInRow: 0,
        polygonMm: [
          { xMm: 0, yMm: y0 },
          { xMm: totalPlateauW_mm, yMm: y0 },
          { xMm: totalPlateauW_mm, yMm: y1 },
          { xMm: 0, yMm: y1 },
        ],
        lengthNetMm: totalPlateauW_mm,
        widthNetMm: lameWidthMm,
        thicknessMm: epaisseurLameMm,
        supportJoistIds: chassisJoists.map((j) => j.id),
        spanCount: nbTraverses - 1,
        leftJointType: "RIVE_LIBRE",
        rightJointType: "RIVE_LIBRE",
        leftOverhangMm: 15,
        rightOverhangMm: 15,
        sourceCommercialBarId: `commercial-mob-bar-${r + 1}`,
        isFromOffcutReuse: false,
      });
      totalBladesLinearMm += totalPlateauW_mm;
      nbLamesMobile += 1;
      nbVisMobile += nbTraverses * 2;
    }

    // Galets de roulement
    const minWheels = Math.max(4, Math.ceil(poidsTotalChargeKg / 250));
    const wheelsPerRail = Math.max(2, Math.ceil(minWheels / nbRails));
    const wheels: PlacedMobilePanel["wheels"] = [];

    for (let ri = 0; ri < nbRails; ri++) {
      const railId = `rail-inox-${ri + 1}`;
      for (let w = 0; w < wheelsPerRail; w++) {
        const factor = wheelsPerRail === 1 ? 0.5 : w / (wheelsPerRail - 1);
        const wx = isLateral
          ? 50 + factor * (totalPlateauW_mm - 100)
          : 50 + (ri / (nbRails - 1)) * (totalPlateauW_mm - 100);
        const wy = isLateral
          ? 50 + (ri / (nbRails - 1)) * (totalPlateauL_mm - 100)
          : 50 + factor * (totalPlateauL_mm - 100);

        wheels.push({
          id: `wheel-${ri + 1}-${w + 1}`,
          railId,
          centerMm: { xMm: Math.round(wx), yMm: Math.round(wy) },
        });
      }
    }

    panels.push({
      id: "plateau-mobile-monobloc",
      nom: "Plateau Mobile Coulissant",
      xMm: originX_mm,
      yMm: originY_mm,
      widthMm: totalPlateauW_mm,
      lengthMm: totalPlateauL_mm,
      directionVector: dirVector,
      travelDistanceMm: courseMaxMm,
      chassisJoists,
      blades: mobileBlades,
      wheels,
    });
  } else {
    // MODE 2 DEMI-PLATEAUX (OUVERTURE CENTRALE SYMÉTRIQUE)
    // Division en 2 demi-plateaux
    const demiW_mm = isLateral ? Math.round(totalPlateauW_mm / 2) : totalPlateauW_mm;
    const demiL_mm = isLateral ? totalPlateauL_mm : Math.round(totalPlateauL_mm / 2);
    const courseDemiM = isLateral ? demiW_mm / 1000 + 0.15 : demiL_mm / 1000 + 0.15;
    const courseDemiMm = Math.round(courseDemiM * 1000);

    for (let p = 0; p < 2; p++) {
      const isFirst = p === 0;
      const nomPanel = isFirst ? "Demi-plateau 1 (A)" : "Demi-plateau 2 (B)";
      const posX_mm = isLateral && !isFirst ? originX_mm + demiW_mm : originX_mm;
      const posY_mm = !isLateral && !isFirst ? originY_mm + demiL_mm : originY_mm;

      const dirVector = isLateral
        ? { x: isFirst ? -1 : 1, y: 0 }
        : { x: 0, y: isFirst ? -1 : 1 };

      // Châssis alu pour ce demi-plateau
      const chassisJoists: PlacedJoistSegment[] = [];
      const nbTraverses = Math.max(3, Math.ceil(demiW_mm / entraxeTraversesMm) + 1);

      // Longerons périphériques
      chassisJoists.push(
        {
          id: `chassis-demi-${p + 1}-top`,
          layer: "PRIMARY_TOP",
          role: "RIVE",
          startMm: { xMm: 0, yMm: 0 },
          endMm: { xMm: demiW_mm, yMm: 0 },
          lengthNetMm: demiW_mm,
          widthMm: 40,
          heightMm: hauteurChassisMm,
          supportIds: [],
          maxSpanBetweenSupportsMm: entraxeTraversesMm,
        },
        {
          id: `chassis-demi-${p + 1}-bot`,
          layer: "PRIMARY_TOP",
          role: "RIVE",
          startMm: { xMm: 0, yMm: demiL_mm },
          endMm: { xMm: demiW_mm, yMm: demiL_mm },
          lengthNetMm: demiW_mm,
          widthMm: 40,
          heightMm: hauteurChassisMm,
          supportIds: [],
          maxSpanBetweenSupportsMm: entraxeTraversesMm,
        }
      );
      totalLinearAluMm += demiW_mm * 2;

      for (let t = 0; t < nbTraverses; t++) {
        const tx = Math.min(demiW_mm, t * entraxeTraversesMm);
        chassisJoists.push({
          id: `chassis-demi-${p + 1}-trav-${t + 1}`,
          layer: "PRIMARY_TOP",
          role: "COURANTE",
          startMm: { xMm: tx, yMm: 0 },
          endMm: { xMm: tx, yMm: demiL_mm },
          lengthNetMm: demiL_mm,
          widthMm: 40,
          heightMm: hauteurChassisMm,
          supportIds: [],
          maxSpanBetweenSupportsMm: entraxeTraversesMm,
        });
        totalLinearAluMm += demiL_mm;
      }

      // Platelage du demi-plateau
      const demiBlades: PlacedBladeSegment[] = [];
      const nbRows = Math.floor(demiL_mm / lamePitchMm);
      for (let r = 0; r < nbRows; r++) {
        const y0 = r * lamePitchMm + 2;
        const y1 = y0 + lameWidthMm;
        demiBlades.push({
          id: `demi-${p + 1}-blade-${r + 1}`,
          rowIndex: r,
          segmentIndexInRow: 0,
          polygonMm: [
            { xMm: 0, yMm: y0 },
            { xMm: demiW_mm, yMm: y0 },
            { xMm: demiW_mm, yMm: y1 },
            { xMm: 0, yMm: y1 },
          ],
          lengthNetMm: demiW_mm,
          widthNetMm: lameWidthMm,
          thicknessMm: epaisseurLameMm,
          supportJoistIds: chassisJoists.map((j) => j.id),
          spanCount: nbTraverses - 1,
          leftJointType: "RIVE_LIBRE",
          rightJointType: "RIVE_LIBRE",
          leftOverhangMm: 15,
          rightOverhangMm: 15,
          sourceCommercialBarId: `comm-demi-${p + 1}-${r + 1}`,
          isFromOffcutReuse: false,
        });
        totalBladesLinearMm += demiW_mm;
        nbLamesMobile += 1;
        nbVisMobile += nbTraverses * 2;
      }

      // Galets (min 4 par demi-plateau)
      const wheels: PlacedMobilePanel["wheels"] = [];
      for (let ri = 0; ri < nbRails; ri++) {
        const railId = `rail-inox-${ri + 1}`;
        for (let w = 0; w < 2; w++) {
          const wx = isLateral
            ? 50 + w * (demiW_mm - 100)
            : 50 + (ri / (nbRails - 1)) * (demiW_mm - 100);
          const wy = isLateral
            ? 50 + (ri / (nbRails - 1)) * (demiL_mm - 100)
            : 50 + w * (demiL_mm - 100);

          wheels.push({
            id: `wheel-p${p + 1}-${ri + 1}-${w + 1}`,
            railId,
            centerMm: { xMm: Math.round(wx), yMm: Math.round(wy) },
          });
        }
      }

      panels.push({
        id: `demi-plateau-${p + 1}`,
        nom: nomPanel,
        xMm: posX_mm,
        yMm: posY_mm,
        widthMm: demiW_mm,
        lengthMm: demiL_mm,
        directionVector: dirVector,
        travelDistanceMm: courseDemiMm,
        chassisJoists,
        blades: demiBlades,
        wheels,
      });
    }
  }

  // 3. Calcul des rails inox au sol
  // Longueur d'un rail = longueur couverte + course de refoulement + marge de sécurité 20 cm
  let longueurUnitaireRailM = 0;
  if (!isDeuxPlateaux) {
    longueurUnitaireRailM = isLateral
      ? Number((totalPlateauW_m * 2 + 0.2).toFixed(2))
      : Number((totalPlateauL_m * 2 + 0.2).toFixed(2));
  } else {
    // 2 demi-plateaux : les rails s'étendent des deux côtés
    const demiDimM = isLateral ? totalPlateauW_m / 2 : totalPlateauL_m / 2;
    longueurUnitaireRailM = isLateral
      ? Number((totalPlateauW_m + demiDimM * 2 + 0.3).toFixed(2))
      : Number((totalPlateauL_m + demiDimM * 2 + 0.3).toFixed(2));
  }

  // Si longueur_rails_sol_m a été spécifié manuellement, on l'utilise
  if (mob.longueur_rails_sol_m && mob.longueur_rails_sol_m > 0) {
    longueurUnitaireRailM = mob.longueur_rails_sol_m;
  }

  const entraxeRailsM = Number((spanPerpendicularM / (nbRails - 1)).toFixed(2));
  const lineaireTotalRailsM = Number((longueurUnitaireRailM * nbRails).toFixed(2));

  for (let ri = 0; ri < nbRails; ri++) {
    const fraction = ri / (nbRails - 1);
    let startMm: Point2D;
    let endMm: Point2D;

    if (isLateral) {
      const yRail = originY_mm + fraction * totalPlateauL_mm;
      const xStartRail = !isDeuxPlateaux
        ? isNegative
          ? originX_mm - (totalPlateauW_mm + 200)
          : originX_mm
        : originX_mm - Math.round(totalPlateauW_mm / 2 + 150);
      const xEndRail = xStartRail + Math.round(longueurUnitaireRailM * 1000);
      startMm = { xMm: xStartRail, yMm: Math.round(yRail) };
      endMm = { xMm: xEndRail, yMm: Math.round(yRail) };
    } else {
      const xRail = originX_mm + fraction * totalPlateauW_mm;
      const yStartRail = !isDeuxPlateaux
        ? isNegative
          ? originY_mm - (totalPlateauL_mm + 200)
          : originY_mm
        : originY_mm - Math.round(totalPlateauL_mm / 2 + 150);
      const yEndRail = yStartRail + Math.round(longueurUnitaireRailM * 1000);
      startMm = { xMm: Math.round(xRail), yMm: yStartRail };
      endMm = { xMm: Math.round(xRail), yMm: yEndRail };
    }

    rails.push({
      id: `rail-sol-${ri + 1}`,
      startMm,
      endMm,
      lengthMm: Math.round(longueurUnitaireRailM * 1000),
    });
  }

  const totalWheelsCount = panels.reduce((acc, p) => acc + p.wheels.length, 0);
  const chargeParGaletKg = Math.round(poidsTotalChargeKg / Math.max(1, totalWheelsCount));

  // 4. Calcul et dimensionnement de la motorisation (solaire ou filaire)
  const typeMotorisation: TypeMotorisationTerrasse =
    mob.type_motorisation ?? (mob.motorise ? "solaire" : "aucune");
  const isMotorise = typeMotorisation !== "aucune";

  // Effort de traction nécessaire à partir du poids propre du plateau (sans surcharge, NF P90-308)
  // Prise en compte du frottement statique de démarrage + joints (0.20), pente/vent (150 N) et sécurité (1.5)
  const effortTractionTheoriqueN = Math.round(poidsPropreKg * 9.81 * 0.20 * 1.5 + 150);
  const puissanceTractionTotaleN = Math.max(600, Math.ceil(effortTractionTheoriqueN / 50) * 50);

  const nbMoteurs = isMotorise ? (isDeuxPlateaux ? 2 : 1) : 0;
  const puissanceMoteurUnitaireN = isMotorise
    ? isDeuxPlateaux
      ? Math.max(500, Math.ceil(puissanceTractionTotaleN / 2 / 50) * 50)
      : puissanceTractionTotaleN
    : 0;

  // Linéaire de crémaillère à fixer le long d'un rail : Course_max + 0.50 m (doublé si 2_demi_plateaux)
  const coursePlateauM = panels[0] ? panels[0].travelDistanceMm / 1000 : 2.5;
  const lineaireCremaillereM = isMotorise
    ? Number(((coursePlateauM + 0.50) * (isDeuxPlateaux ? 2 : 1)).toFixed(2))
    : 0;
  const barresCremaillereCount = Math.ceil(lineaireCremaillereM); // Barres de 1m module 4 acier/nylon

  const motorisation = {
    active: isMotorise,
    typeMotorisation,
    nbMoteurs,
    puissanceTractionTotaleN: isMotorise ? puissanceTractionTotaleN : 0,
    puissanceMoteurUnitaireN: isMotorise ? puissanceMoteurUnitaireN : 0,
    lineaireCremaillereM,
    barresCremaillereCount,
    coffretCommande: {
      type: (typeMotorisation === "solaire"
        ? "solaire_autonome_24v"
        : typeMotorisation === "filaire"
        ? "filaire_230v_24v"
        : "aucun") as "solaire_autonome_24v" | "filaire_230v_24v" | "aucun",
      designation:
        typeMotorisation === "solaire"
          ? "Coffret autonome solaire IP65 avec régulateur MPPT et 2 batteries 12V 14Ah AGM (24V)"
          : typeMotorisation === "filaire"
          ? "Coffret d'alimentation étanche IP65 transformateur 230V AC / 24V DC TBTS"
          : "Sans motorisation (manuelle)",
      batteries:
        typeMotorisation === "solaire"
          ? "2x Batteries 12V 14Ah étanches AGM en série (24V)"
          : undefined,
      panneauPhotovoltaiqueWp: typeMotorisation === "solaire" ? 30 : undefined,
      tensionV: 24,
    },
    finsDeCourse: {
      type: "magnetique_ip68" as const,
      nbCapteurs: isMotorise ? (isDeuxPlateaux ? 4 : 2) : 0,
    },
    telecommande: {
      conformeNFP90_308: true,
      nbTelecommandes: isMotorise ? 2 : 0,
      description:
        "Télécommandes 4 canaux sécurisées à code tournant avec bouton anti-pincement (norme sécurité NF P90-308)",
    },
  };

  const resultatPlateau: ResultatPlateauMobile = {
    active: true,
    mode: mob.mode,
    sensRefoulement: mob.sens_refoulement,
    hauteurChassisMm,
    jeuPeripheriqueMm: jeuMm,
    dimensionsPlateau: {
      longueurM: totalPlateauL_m,
      largeurM: totalPlateauW_m,
      epaisseurTotaleMm,
      surfaceM2: surfacePlateauM2,
      poidsPropreKg,
      poidsTotalChargeKg,
    },
    rails: {
      type: "rail_inox_v_sol",
      lineaireTotalM: lineaireTotalRailsM,
      nbRails,
      longueurUnitaireM: longueurUnitaireRailM,
      entraxeRailsM,
      zoneRefoulementM: Number(
        (longueurUnitaireRailM - (isLateral ? totalPlateauW_m : totalPlateauL_m)).toFixed(2)
      ),
    },
    roulement: {
      nbGaletsTotal: totalWheelsCount,
      chargeParGaletKg,
      diametreGaletMm: chargeParGaletKg > 200 ? 100 : 80,
      reference: `Galet inox A4 gorge en V Ø${chargeParGaletKg > 200 ? 100 : 80}mm à roulement étanche 2RS`,
    },
    structureChassis: {
      lineaireProfilesAluM: Number((totalLinearAluMm / 1000).toFixed(2)),
      sectionAluMm: mob.section_profil_alu_mm || "80x40",
      nbTraverses: panels.reduce((acc, p) => acc + p.chassisJoists.length, 0),
      entraxeTraversesMm,
      poidsAluKg: Math.round((totalLinearAluMm / 1000) * 2.8),
    },
    platelage: {
      surfaceLamesM2: surfacePlateauM2,
      lineaireLamesM: Number((totalBladesLinearMm / 1000).toFixed(2)),
      nbLames: nbLamesMobile,
      visOuClipsNb: nbVisMobile,
    },
    motorisation,
    plateaux: panels.map((p) => ({
      id: p.id,
      nom: p.nom,
      xInitialM: p.xMm / 1000,
      yInitialM: p.yMm / 1000,
      longueurM: p.lengthMm / 1000,
      largeurM: p.widthMm / 1000,
      sensOuvertureVector: p.directionVector,
      courseMaxM: p.travelDistanceMm / 1000,
    })),
  };

  const mobileStructure: PlacedMobileStructure = {
    active: true,
    panels,
    rails,
    totalRailLinearMeters: lineaireTotalRailsM,
    totalWheelsCount,
    chassisProfilesLinearMeters: Number((totalLinearAluMm / 1000).toFixed(2)),
    motorisation,
  };

  return {
    resultatPlateau,
    mobileStructure,
  };
}
