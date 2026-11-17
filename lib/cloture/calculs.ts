import {
  calculateFenceLayout,
  type FenceConfig,
  type FenceMaterial,
  type FenceResult,
} from "@/lib/cloture/calepinageCloture";
import {
  CADENCES_DEFAUT,
  calculerTempsPoseCloture,
  type CadencesTempsPose,
  type ResultatTempsPoseCloture,
} from "@/lib/tempsPoseCalcul";
import {
  GAMME_MATERIAU_CONFIG,
  normaliserGammeMateriau,
  type GammeMateriau,
} from "@/types/catalogue";

export interface TarifsCloture {
  prixLameUnitaireHt: number;
  prixPoteauDroitHt: number;
  prixPoteauAngleHt: number;
  prixDemiPoteauMuralHt: number;
  prixPlatineHt: number;
  prixSacBeton35kgHt: number;
  prixPlaqueSoubassementHt: number;
  prixPortillonHt: number;
}

export const TARIFS_CLOTURE_DEFAUT: Record<FenceMaterial, TarifsCloture> = {
  BOIS: {
    prixLameUnitaireHt: 11.5,
    prixPoteauDroitHt: 34.0,
    prixPoteauAngleHt: 42.0,
    prixDemiPoteauMuralHt: 22.0,
    prixPlatineHt: 16.5,
    prixSacBeton35kgHt: 7.5,
    prixPlaqueSoubassementHt: 28.0,
    prixPortillonHt: 420.0,
  },
  COMPOSITE: {
    prixLameUnitaireHt: 18.9,
    prixPoteauDroitHt: 58.0,
    prixPoteauAngleHt: 68.0,
    prixDemiPoteauMuralHt: 36.0,
    prixPlatineHt: 22.0,
    prixSacBeton35kgHt: 7.5,
    prixPlaqueSoubassementHt: 30.0,
    prixPortillonHt: 680.0,
  },
  ALU: {
    prixLameUnitaireHt: 26.5,
    prixPoteauDroitHt: 64.0,
    prixPoteauAngleHt: 74.0,
    prixDemiPoteauMuralHt: 39.0,
    prixPlatineHt: 24.0,
    prixSacBeton35kgHt: 7.5,
    prixPlaqueSoubassementHt: 32.0,
    prixPortillonHt: 890.0,
  },
};

export interface LigneChiffrageCloture {
  designation: string;
  description?: string;
  qte: number;
  unite: string;
  pu_ht: number;
  pu_revient: number;
  type_cout: "matiere" | "main_oeuvre";
}

export interface OptionsChiffrageCloture {
  inclureMainOeuvre?: boolean;
  gamme_qualite?: GammeMateriau;
  tempsPoseManuelHeures?: number;
  tarifs?: Partial<TarifsCloture>;
  cadences?: Partial<CadencesTempsPose>;
}

export interface ResultatChiffrageCloture {
  calepinage: FenceResult;
  tempsPose: ResultatTempsPoseCloture;
  gamme_qualite: GammeMateriau;
  margeCibleDefaut: number;
  lignesFournitures: LigneChiffrageCloture[];
  lignesMainOeuvre: LigneChiffrageCloture[];
  lignesDevis: LigneChiffrageCloture[];
  totalFournituresHT: number;
  totalMainOeuvreHT: number;
  totalHT: number;
}

function arrondir(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Calcule le calepinage complet, les temps de pose par phase et les lignes
 * prêtes pour un devis client (fournitures + main-d'œuvre optionnelle).
 */
export function calculerChiffrageCloture(
  config: FenceConfig,
  options: OptionsChiffrageCloture = {}
): ResultatChiffrageCloture {
  const calepinage = calculateFenceLayout(config);
  const gammeQualite = normaliserGammeMateriau(
    options.gamme_qualite ??
      (config as FenceConfig & { gamme_qualite?: unknown }).gamme_qualite
  );
  const cadences: CadencesTempsPose = { ...CADENCES_DEFAUT, ...options.cadences };
  const tempsPose = calculerTempsPoseCloture(calepinage, {
    cadences,
    gamme_qualite: gammeQualite,
    tempsPoseManuelHeures: options.tempsPoseManuelHeures,
  });
  const tarifs: TarifsCloture = {
    ...TARIFS_CLOTURE_DEFAUT[config.materiau],
    ...options.tarifs,
  };

  const lignesFournitures: LigneChiffrageCloture[] = [];

  if (calepinage.nbTotalLames > 0) {
    lignesFournitures.push({
      designation: `Lames de clôture ${config.materiau} (L=${calepinage.config.longueurLameBrute.toFixed(2)} m)`,
      description: `Hauteur lame ${Math.round(calepinage.config.hauteurLame * 1000)} mm · ${calepinage.nbLamesParTravee} lames/travée`,
      qte: calepinage.nbTotalLames,
      unite: "u",
      pu_ht: tarifs.prixLameUnitaireHt,
      pu_revient: arrondir(tarifs.prixLameUnitaireHt * 0.65),
      type_cout: "matiere",
    });
  }

  if (calepinage.nbPoteauxDroitsTotal > 0) {
    lignesFournitures.push({
      designation: `Poteaux droits à feuillures (L=${calepinage.longueurCommandePoteauM.toFixed(2)} m)`,
      description: `Section 70×70 mm · Intermédiaires (${calepinage.nbPoteauxIntermediaires}), bouts (${calepinage.nbPoteauxBoutStandards}) et portillons (${calepinage.nbPoteauxPortillon})`,
      qte: calepinage.nbPoteauxDroitsTotal,
      unite: "u",
      pu_ht: tarifs.prixPoteauDroitHt,
      pu_revient: arrondir(tarifs.prixPoteauDroitHt * 0.65),
      type_cout: "matiere",
    });
  }

  if (calepinage.nbPoteauxAngle > 0) {
    lignesFournitures.push({
      designation: `Poteaux d'angle 90° (L=${calepinage.longueurCommandePoteauM.toFixed(2)} m)`,
      qte: calepinage.nbPoteauxAngle,
      unite: "u",
      pu_ht: tarifs.prixPoteauAngleHt,
      pu_revient: arrondir(tarifs.prixPoteauAngleHt * 0.65),
      type_cout: "matiere",
    });
  }

  if (calepinage.nbDemiPoteauxMuraux > 0) {
    lignesFournitures.push({
      designation: `Demi-poteaux muraux de départ/arrivée`,
      qte: calepinage.nbDemiPoteauxMuraux,
      unite: "u",
      pu_ht: tarifs.prixDemiPoteauMuralHt,
      pu_revient: arrondir(tarifs.prixDemiPoteauMuralHt * 0.65),
      type_cout: "matiere",
    });
  }

  if (calepinage.nbPlaquesSoubassement > 0) {
    lignesFournitures.push({
      designation: `Plaques de soubassement béton (H=${Math.round(calepinage.hauteurSoubassementRetenueM * 1000)} mm)`,
      qte: calepinage.nbPlaquesSoubassement,
      unite: "u",
      pu_ht: tarifs.prixPlaqueSoubassementHt,
      pu_revient: arrondir(tarifs.prixPlaqueSoubassementHt * 0.65),
      type_cout: "matiere",
    });
  }

  if (calepinage.nbPlatines > 0) {
    lignesFournitures.push({
      designation: "Platines acier galvanisé sur muret + goujons d'ancrage",
      qte: calepinage.nbPlatines,
      unite: "u",
      pu_ht: tarifs.prixPlatineHt,
      pu_revient: arrondir(tarifs.prixPlatineHt * 0.65),
      type_cout: "matiere",
    });
  }

  if (calepinage.nbSacsBeton35kg > 0) {
    lignesFournitures.push({
      designation: "Béton prêt à l'emploi pour scellement poteaux (sac 35 kg)",
      qte: calepinage.nbSacsBeton35kg,
      unite: "sac",
      pu_ht: tarifs.prixSacBeton35kgHt,
      pu_revient: arrondir(tarifs.prixSacBeton35kgHt * 0.65),
      type_cout: "matiere",
    });
  }

  if (calepinage.nbPortillonsTotal > 0) {
    lignesFournitures.push({
      designation: "Portillon complet avec serrure, gâche et quincaillerie",
      qte: calepinage.nbPortillonsTotal,
      unite: "u",
      pu_ht: tarifs.prixPortillonHt,
      pu_revient: arrondir(tarifs.prixPortillonHt * 0.65),
      type_cout: "matiere",
    });
  }

  const lignesMainOeuvre: LigneChiffrageCloture[] = [];
  if (options.inclureMainOeuvre) {
    const tauxVente = cadences.taux_horaire_vente_ht;
    const tauxCharge = cadences.taux_horaire_charge_ht;
    const phases: Array<[string, number]> = [
      ["Main-d'œuvre — Implantation & scellements", tempsPose.parPhase.implantation_scellement],
      ["Main-d'œuvre — Pose poteaux & soubassements", tempsPose.parPhase.pose_poteaux_soubassement],
      ["Main-d'œuvre — Pose lames / panneaux", tempsPose.parPhase.pose_panneaux_lames],
      ["Main-d'œuvre — Portillons & finitions", tempsPose.parPhase.portillons_finitions],
    ];
    for (const [designation, heures] of phases) {
      if (heures > 0) {
        lignesMainOeuvre.push({
          designation,
          qte: heures,
          unite: "h",
          pu_ht: tauxVente,
          pu_revient: tauxCharge,
          type_cout: "main_oeuvre",
        });
      }
    }
  }

  const totalFournituresHT = arrondir(
    lignesFournitures.reduce((sum, l) => sum + l.qte * l.pu_ht, 0)
  );
  const totalMainOeuvreHT = arrondir(
    lignesMainOeuvre.reduce((sum, l) => sum + l.qte * l.pu_ht, 0)
  );
  const totalHT = arrondir(totalFournituresHT + totalMainOeuvreHT);

  return {
    calepinage,
    tempsPose,
    gamme_qualite: gammeQualite,
    margeCibleDefaut: GAMME_MATERIAU_CONFIG[gammeQualite].margeCibleDefaut,
    lignesFournitures,
    lignesMainOeuvre,
    lignesDevis: [...lignesFournitures, ...lignesMainOeuvre],
    totalFournituresHT,
    totalMainOeuvreHT,
    totalHT,
  };
}
