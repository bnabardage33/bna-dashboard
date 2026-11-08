// lib/bardage/pro/quantitatifs-contrat.ts
// Brique 4 — Contrat de Sortie BardageProGeometricResult & Séparation stricte Q_net / Q_tech / Q_appro

import type { GammeFabricant, PresetBardage } from "./presets-regles";
import { CONSTANTES_BARDAGE_PRO, resoudrePresetBardage } from "./presets-regles";
import type { FacadeConfigInput } from "./geometrie-ossature";
import { genererOssatureSecondaire, type OssatureSecondaireResult } from "./geometrie-ossature";
import {
  calculerCalepinageBardagePro,
  type CalepinageBardageProResult,
  type PanneauPose,
  type PlaqueDebitPro,
} from "./calepinage-decoupe";

export interface DistinctQuantitiesBardage {
  /** Quantités nettes géométriques posées (aucun déchet) */
  qNet: {
    surfacePoseeM2: number;
    lineaireChevronsMl: number;
    nbVisPointsFixes: number;
    nbVisPointsGlissants: number;
    nbVisTotal: number;
    lineaireRivesMl: number;
    lineaireVentilationBasseMl: number;
    lineaireVentilationHauteMl: number;
    lineaireCornieresAnglesMl: number;
  };
  /** Quantités techniques découpées (matière brute consommée avec chutes et traits de scie) */
  qTech: {
    surfacePlaquesConsommeesM2: number;
    nbPlaquesMeresDebitees: number;
    lineaireChevronsDebitesMl: number;
    surfaceChutesTotaleM2: number;
    surfaceChutesReemployablesM2: number;
    tauxChuteReelPct: number;
  };
  /** Quantités d'approvisionnement (marge chantier + colisage / conditionnement boîtes et unités de vente) */
  qAppro: {
    nbPlaquesMeresACommander: number;
    surfacePlaquesACommanderM2: number;
    barresChevronsACommander: {
      longueurBarreM: number;
      quantiteBarres: number;
      lineaireTotalM: number;
    };
    fixations: {
      designation: string;
      nbVisReellesAvecMarge: number;
      nbBoites: number;
      unitesParBoite: number;
    };
    profilsDepartEtVentilation: {
      grillesVentilationBassePieces: number;
      grillesVentilationHautePieces: number;
      cornieresAnglesPieces: number;
      longueurPieceM: number;
    };
    margeTriColisagePct: number;
  };
}

export interface BardageProGeometricResult {
  facadeId?: string;
  facadeNom?: string;
  preset: PresetBardage;
  geometry: {
    surfaceNetteM2: number;
    lineaireRivesMl: number;
    panneauxPoses: PanneauPose[];
    ossature: OssatureSecondaireResult;
    debitPlaques: PlaqueDebitPro[];
  };
  quantities: DistinctQuantitiesBardage;
  diagnostic: {
    estPignon: boolean;
    nbPiecesCoupleesPignon: number;
    jointChevronConforme: boolean;
    entraxeMaxRespecte: boolean;
    avertissements: string[];
  };
}

export interface CalculerBardageProOptions {
  gamme?: GammeFabricant;
  formatPlaqueChoisi?: { longueurMm: number; largeurMm: number };
  formatLameChoisi?: { longueurM: number; largeurUtileMm: number };
  hauteurModuleForceeM?: number;
  largeurModuleForceeM?: number;
  entraxeForceMm?: number;
  longueurBarreChevronM?: number;
  conditionnementBoiteVis?: number;
  margeApproPct?: number;
}

/**
 * Moteur complet Bardage Pro : orchestre la géométrie, l'ossature, le calepinage
 * et produit le contrat BardageProGeometricResult avec séparation des 3 niveaux de quantitatifs.
 */
export function calculerBardagePro(
  facade: FacadeConfigInput,
  options: CalculerBardageProOptions = {}
): BardageProGeometricResult {
  const gamme = options.gamme ?? "trespa_meteon";
  const preset = resoudrePresetBardage(gamme);
  const margePct = options.margeApproPct ?? CONSTANTES_BARDAGE_PRO.MARGE_APPROVISIONNEMENT_DEFAUT_PCT;
  const longBarreChevM = options.longueurBarreChevronM ?? 3.0;
  const condBoiteVis = options.conditionnementBoiteVis ?? 100;

  // 1. Calcul du calepinage des panneaux et imbrication (Brique 3)
  const calepinage = calculerCalepinageBardagePro(facade, preset, {
    formatPlaqueChoisi: options.formatPlaqueChoisi,
    formatLameChoisi: options.formatLameChoisi,
    hauteurModuleForceeM: options.hauteurModuleForceeM,
    largeurModuleForceeM: options.largeurModuleForceeM,
  });

  // 2. Génération de l'ossature secondaire alignée obligatoirement sur les joints verticaux (Brique 2)
  const ossature = genererOssatureSecondaire(
    facade,
    preset,
    calepinage.jointsVerticauxX,
    { entraxeForceMm: options.entraxeForceMm }
  );

  // 3. Calculs des quantitatifs stricts (Q_net, Q_tech, Q_appro)
  const nbVisPointsFixes = calepinage.panneaux.reduce((s, p) => s + p.nbPointsFixes, 0);
  const nbVisPointsGlissants = calepinage.panneaux.reduce((s, p) => s + p.nbPointsGlissants, 0);
  const nbVisTotalNet = nbVisPointsFixes + nbVisPointsGlissants;

  const qNet: DistinctQuantitiesBardage["qNet"] = {
    surfacePoseeM2: calepinage.surfaceNetteM2,
    lineaireChevronsMl: ossature.lineaireTotalChevronsMl,
    nbVisPointsFixes,
    nbVisPointsGlissants,
    nbVisTotal: nbVisTotalNet,
    lineaireRivesMl: calepinage.lineaireRivesMl,
    lineaireVentilationBasseMl: ossature.grilleVentilationBasseMl,
    lineaireVentilationHauteMl: ossature.grilleVentilationHauteMl,
    lineaireCornieresAnglesMl: ossature.cornieresAnglesMl,
  };

  const qTech: DistinctQuantitiesBardage["qTech"] = {
    surfacePlaquesConsommeesM2: calepinage.surfaceBrutePlaquesM2,
    nbPlaquesMeresDebitees: calepinage.nbPlaquesMeresConsommees,
    lineaireChevronsDebitesMl: ossature.lineaireTotalChevronsMl,
    surfaceChutesTotaleM2: Number((calepinage.surfaceBrutePlaquesM2 - calepinage.surfaceNetteM2).toFixed(2)),
    surfaceChutesReemployablesM2: calepinage.totalChutesReemployablesM2,
    tauxChuteReelPct: calepinage.tauxChuteReelPct,
  };

  // Approvisionnement avec marge et conditionnements marchands
  const coefMarge = 1 + margePct / 100;
  const nbPlaquesAppro = Math.ceil(calepinage.nbPlaquesMeresConsommees * coefMarge);
  const formatPlaque = options.formatPlaqueChoisi ?? preset.formatsPlaques?.[0] ?? { longueurMm: 3050, largeurMm: 1300 };
  const surfacePlaqueUnitaireM2 = (formatPlaque.longueurMm * formatPlaque.largeurMm) / 1_000_000;

  const totalChevronsAvecMargeM = ossature.lineaireTotalChevronsMl * coefMarge;
  const nbBarresChevrons = Math.ceil(totalChevronsAvecMargeM / longBarreChevM);

  const nbVisAvecMarge = Math.ceil(nbVisTotalNet * coefMarge);
  const nbBoitesVis = Math.ceil(nbVisAvecMarge / condBoiteVis);

  const longPieceProfilM = 2.5; // Longueur marchande des profilés alu / PVC
  const nbGrillesBasse = Math.ceil((ossature.grilleVentilationBasseMl * coefMarge) / longPieceProfilM);
  const nbGrillesHaute = Math.ceil((ossature.grilleVentilationHauteMl * coefMarge) / longPieceProfilM);
  const nbCornieresAngles = ossature.cornieresAnglesMl > 0 ? Math.ceil((ossature.cornieresAnglesMl * coefMarge) / longPieceProfilM) : 0;

  const qAppro: DistinctQuantitiesBardage["qAppro"] = {
    nbPlaquesMeresACommander: nbPlaquesAppro,
    surfacePlaquesACommanderM2: Number((nbPlaquesAppro * surfacePlaqueUnitaireM2).toFixed(2)),
    barresChevronsACommander: {
      longueurBarreM: longBarreChevM,
      quantiteBarres: nbBarresChevrons,
      lineaireTotalM: Number((nbBarresChevrons * longBarreChevM).toFixed(2)),
    },
    fixations: {
      designation:
        preset.typeMateriau === "panneaux_hpl"
          ? `Vis Torx Inox A2 Ø${preset.diametreVisMm}mm laquées + rondelles EPDM`
          : "Clips inox + vis pour rainure composite",
      nbVisReellesAvecMarge: nbVisAvecMarge,
      nbBoites: nbBoitesVis,
      unitesParBoite: condBoiteVis,
    },
    profilsDepartEtVentilation: {
      grillesVentilationBassePieces: nbGrillesBasse,
      grillesVentilationHautePieces: nbGrillesHaute,
      cornieresAnglesPieces: nbCornieresAngles,
      longueurPieceM: longPieceProfilM,
    },
    margeTriColisagePct: margePct,
  };

  const avertissements: string[] = [];
  if (calepinage.tauxChuteReelPct > 28) {
    avertissements.push(`Taux de chute élevé (${calepinage.tauxChuteReelPct} %). Envisager un autre format de plaque brute.`);
  }

  return {
    facadeId: facade.id,
    facadeNom: facade.nom,
    preset,
    geometry: {
      surfaceNetteM2: calepinage.surfaceNetteM2,
      lineaireRivesMl: calepinage.lineaireRivesMl,
      panneauxPoses: calepinage.panneaux,
      ossature,
      debitPlaques: calepinage.plaquesDebit,
    },
    quantities: {
      qNet,
      qTech,
      qAppro,
    },
    diagnostic: {
      estPignon: facade.type === "pignon",
      nbPiecesCoupleesPignon: calepinage.nbPiecesCouplees,
      jointChevronConforme: true,
      entraxeMaxRespecte: ossature.entraxeReelMm <= preset.entraxeChevronsMaxMm,
      avertissements,
    },
  };
}
