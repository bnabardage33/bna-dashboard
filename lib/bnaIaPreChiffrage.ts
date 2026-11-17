import { fmtEuro } from "@/lib/financeCalculs";
import { calculerPose, type FamillePose } from "@/lib/bardage/poseCalcul";
import { calculerHabillageOuverturesEtProfils1D } from "@/lib/bardage/pro/profils-finitions";
import {
  CADENCES_DEFAUT,
  calculerTempsPoseBardage,
  calculerTempsPoseTerrasse,
} from "@/lib/tempsPoseCalcul";
import {
  calculerTerrasse,
  convertirChiffrageTerrasseEnLignesDevis,
} from "@/lib/terrasse/calculs";
import type { ChantierTerrasseConfig } from "@/lib/terrasse/types";
import type { FenceConfig, FenceMaterial } from "@/lib/cloture/calepinageCloture";
import { calculerChiffrageCloture } from "@/lib/cloture/calculs";
import type { MetierBna } from "@/lib/bnaIaService";
import type { ResultatMetre } from "@/lib/metre-serialization";
import { calculerParametresTerrasseNormatifs } from "@/lib/bnaReferentielTerrasse";
import { calculerParametresBardageNormatifs } from "@/lib/bnaReferentielBardage";

export interface LigneDevisIaPreRemplie {
  catalogue_id: string | null;
  designation: string;
  description: string;
  qte: number;
  unite: string;
  pu_ht: number;
  pu_revient: number | null;
  type_cout: "matiere" | "main_oeuvre";
  a_chiffrer: boolean;
}

export interface DevisPrefillPayload {
  objet: string;
  typeTravaux: string;
  surfaceM2: number;
  lignes: LigneDevisIaPreRemplie[];
}

export interface PreChiffrageBnaResult {
  metier: MetierBna;
  titre: string;
  surfaceOuLineaire: number;
  unitePrincipale: "m²" | "ml";
  heuresPoseTotal: number;
  totalMateriauxHt: number;
  totalMainOeuvreHt: number;
  totalHt: number;
  syntheseTexte: string;
  devisPrefill: DevisPrefillPayload;
  detailsBardage?: {
    surfaceBruteM2: number;
    surfaceOuverturesM2: number;
    surfaceNetteM2: number;
    nbCouchesIte: number;
    surfaceIsolantACommanderM2: number;
    nbPlaquesHplMeres: number;
    bavetteLongueurM: number;
    tableauLongueurM: number;
    linteauLongueurM: number;
  };
  detailsTerrasse?: {
    entraxeLambourdesMm: number;
    fabricant: string | null;
    visserieInox: "A4" | "A2" | "clips";
    alertePlotsDepassement: string | null;
  };
}

function arrondir(v: number): number {
  return Math.round(v * 100) / 100;
}

function parseNombreFr(raw: string): number {
  return Number(raw.replace(",", "."));
}

function extraireDimensionsOuverture(
  texte: string
): Array<{ id: string; nom: string; type: "fenetre" | "porte"; largeurM: number; hauteurM: number }> {
  const ouvertures: Array<{
    id: string;
    nom: string;
    type: "fenetre" | "porte";
    largeurM: number;
    hauteurM: number;
  }> = [];

  const regexOuv =
    /(?:\b(\d+)\s+)?(fen[êe]tre|baie|porte(?:-fen[êe]tre)?|ouverture)s?\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:m\s*)?[x×*]\s*(\d+(?:[.,]\d+)?)/gi;

  let m: RegExpExecArray | null;
  let idx = 1;
  while ((m = regexOuv.exec(texte)) !== null) {
    const nb = Math.max(1, Number(m[1] || 1));
    const typeRaw = m[2].toLowerCase();
    const largeurM = parseNombreFr(m[3]);
    const hauteurM = parseNombreFr(m[4]);
    if (largeurM > 0 && hauteurM > 0) {
      for (let i = 0; i < nb; i++) {
        ouvertures.push({
          id: `ouv-${idx}`,
          nom: `${typeRaw.includes("porte") ? "Porte" : "Fenêtre"} ${idx}`,
          type: typeRaw.includes("porte") ? "porte" : "fenetre",
          largeurM,
          hauteurM,
        });
        idx++;
      }
    }
  }
  return ouvertures;
}

function calculerPreChiffrageBardage(message: string): PreChiffrageBnaResult | null {
  const lower = message.toLowerCase();
  const sansOuvertures = message.replace(
    /(?:\b\d+\s+)?(fen[êe]tre|baie|porte(?:-fen[êe]tre)?|ouverture)s?\s*(?:de\s*)?\d+(?:[.,]\d+)?\s*(?:m\s*)?[x×*]\s*\d+(?:[.,]\d+)?/gi,
    " "
  );

  const nbFacades =
    /double\s*fa[çc]ade|2\s*fa[çc]ades|deux\s*fa[çc]ades/i.test(message) ? 2 : 1;

  let largeurM = 0;
  let hauteurM = 0;

  const matchDims = sansOuvertures.match(
    /(\d+(?:[.,]\d+)?)\s*(?:m\s*)?(?:[x×*]|sur)\s*(\d+(?:[.,]\d+)?)/i
  );
  if (matchDims) {
    largeurM = parseNombreFr(matchDims[1]);
    hauteurM = parseNombreFr(matchDims[2]);
  } else {
    const matchM2 = sansOuvertures.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
    if (matchM2) {
      const surf = parseNombreFr(matchM2[1]);
      if (surf > 0) {
        hauteurM = 3.0;
        largeurM = arrondir(surf / hauteurM);
      }
    }
  }

  if (largeurM <= 0 || hauteurM <= 0) return null;

  const ouvertures = extraireDimensionsOuverture(message);
  const surfaceBruteM2 = arrondir(nbFacades * largeurM * hauteurM);
  const surfaceOuverturesM2 = arrondir(
    ouvertures.reduce((s, o) => s + o.largeurM * o.hauteurM, 0)
  );
  const surfaceNetteM2 = arrondir(Math.max(0, surfaceBruteM2 - surfaceOuverturesM2));

  const estHpl = /hpl|trespa|polyrey|fundermax|compact/i.test(lower);
  const estComposite = /composite/i.test(lower);
  const estClaireVoie = /claire[-\s]?voie/i.test(lower);
  const famille: FamillePose = estHpl
    ? "hpl"
    : estComposite
      ? "composite"
      : "bois_naturel";

  const iteActif = /ite|isolant|isolation|laine/i.test(lower);
  const nbCouchesIte =
    iteActif && /ite\s*2|2\s*couches|deux\s*couches|double\s*couche/i.test(lower)
      ? 2
      : iteActif
        ? 1
        : 0;

  // 1. Calcul ossature & isolant via le moteur réel BNA (poseCalcul.ts)
  const poseParFacade = calculerPose(famille, largeurM, hauteurM, true, 1, 135, {
    epaisseurIsolantMm: iteActif ? 140 : 0,
    typeIsolant: "laine_roche",
    surfacePaquetM2: 4.8,
    moduleLargeurMm: estHpl ? 1300 : undefined,
    moduleHauteurMm: estHpl ? 3050 : undefined,
  });

  // 2. Calcul habillage ouvertures & profilés 1D (barres 3,00 m)
  const profils = calculerHabillageOuverturesEtProfils1D({
    largeurM: largeurM * nbFacades,
    hauteurMurM: hauteurM,
    nbAnglesSortants: 2 * nbFacades,
    ouvertures,
  });

  // 3. Calcul temps de pose réel (tempsPoseCalcul.ts)
  const zoneMetre: ResultatMetre = {
    version_moteur: "1.0.0",
    calcule_le: new Date().toISOString(),
    entrees: {
      type: "facade",
      largeur: largeurM * nbFacades,
      hauteur_mur: hauteurM,
      hauteur_faite: null,
      materiau: estHpl ? "plaques" : "lames",
      famille_pose: famille,
      angle: true,
      largeur_lame_mm: estHpl ? null : 135,
      plaque_longueur_mm: estHpl ? 3050 : null,
      plaque_largeur_mm: estHpl ? 1300 : null,
      module_largeur_mm: estHpl ? 1300 : null,
      module_hauteur_mm: estHpl ? 3050 : null,
      sens_pose: "horizontal",
      type_isolant: iteActif ? "laine_roche" : "sans_isolant",
      epaisseur_isolant_mm: iteActif ? 140 : 0,
      surface_paquet_m2: 4.8,
      zone_vent_rive: true,
      coef_perte_rendement: 1.1,
      autoriser_rotation: true,
      ouvertures: ouvertures.map((o) => ({
        id: o.id,
        type: o.type,
        largeur: o.largeurM,
        hauteur: o.hauteurM,
      })),
    },
    resultat_zone: {
      bruteFacade: surfaceBruteM2,
      brutePignon: 0,
      pente: 0,
      totalOuvertures: surfaceOuverturesM2,
      surfaceNette: surfaceNetteM2,
      surfaceACommander: arrondir(surfaceNetteM2 * 1.1),
      nombreOuvertures: ouvertures.length,
      totalCoupesML: 0,
      lamesACommander: 0,
      surfaceTheoriqueLames: 0,
      lamesNeuvesSimul: 0,
      morceauxReutilises: 0,
      longueurChutesGenerees: 0,
      longueurChutesReutilisees: 0,
      chutesPerdues: 0,
      marge: 1.1,
    },
    resultat_pose: poseParFacade,
    resultat_calepinage: null,
  };

  const tempsPose = calculerTempsPoseBardage(zoneMetre, {
    claireVoie: estClaireVoie,
  });

  // Heures supplémentaires si ITE 2 couches croisées (+65% sur phase isolation)
  const heuresIte2 =
    nbCouchesIte === 2 ? arrondir(tempsPose.parPhase.isolation * 0.65) : 0;
  const heuresPoseTotal = arrondir(tempsPose.totalHeures + heuresIte2);

  // Quantités HPL plaques mères 3,05 × 1,30 m = 3,965 m² (CSTB 3194)
  const surfaceParementApproM2 = arrondir(surfaceNetteM2 * 1.1);
  const nbPlaquesHplMeres = estHpl
    ? Math.ceil(surfaceParementApproM2 / (3.05 * 1.3))
    : 0;

  const surfaceIsolantACommanderM2 =
    nbCouchesIte > 0 ? arrondir(surfaceNetteM2 * 1.08 * nbCouchesIte) : 0;
  const nbPaquetsIsolant =
    surfaceIsolantACommanderM2 > 0
      ? Math.ceil(surfaceIsolantACommanderM2 / 4.8)
      : 0;

  const nbSegmentsChevrons = poseParFacade.nbSegmentsChevrons * nbFacades;
  const nbEquerresTotal = poseParFacade.nbFixationsTotal * nbFacades;
  const nbChevillesMurales = poseParFacade.nbChevillesMurales * nbFacades;
  const lineaireEpdm = arrondir(poseParFacade.lineaireBandeEPDMM * nbFacades);
  const nbVisParement = poseParFacade.nbVisParement * nbFacades;

  const puParementM2 = estHpl ? 89 : estComposite ? 74 : 52;
  const lignesDevis: LigneDevisIaPreRemplie[] = [
    {
      catalogue_id: null,
      designation: estHpl
        ? `Panneaux HPL (plaques mères 3,05 × 1,30 m — ${nbPlaquesHplMeres} plaques, CSTB 3194)`
        : `Parement bardage ${estComposite ? "Composite" : estClaireVoie ? "Bois claire-voie" : "Bois massif"} (DTU 41.2)`,
      description: `Surface nette ${surfaceNetteM2} m² (brute ${surfaceBruteM2} m² − ouvertures ${surfaceOuverturesM2} m²) + 10 % calepinage`,
      qte: surfaceParementApproM2,
      unite: "m²",
      pu_ht: puParementM2,
      pu_revient: arrondir(puParementM2 * 0.62),
      type_cout: "matiere",
      a_chiffrer: false,
    },
    ...(nbCouchesIte > 0
      ? [
          {
            catalogue_id: null,
            designation: `Isolant ITE laine de roche (${nbCouchesIte} couche${nbCouchesIte > 1 ? "s" : ""} croisée${nbCouchesIte > 1 ? "s" : ""}, ${nbPaquetsIsolant} paquets de 4,8 m²)`,
            description: `Surface nette ${surfaceNetteM2} m² × ${nbCouchesIte} couche(s) + 8 % pertes`,
            qte: surfaceIsolantACommanderM2,
            unite: "m²",
            pu_ht: 24,
            pu_revient: 15,
            type_cout: "matiere" as const,
            a_chiffrer: false,
          },
        ]
      : []),
    {
      catalogue_id: null,
      designation: `Ossature bois chevrons 60×40 (long. 3,00 m) + bande EPDM (${lineaireEpdm} ml)`,
      description: `Lame d'air ventilée ≥ 20 mm · ${nbSegmentsChevrons} chevrons`,
      qte: nbSegmentsChevrons,
      unite: "pièces",
      pu_ht: 14.5,
      pu_revient: 8.8,
      type_cout: "matiere",
      a_chiffrer: false,
    },
    {
      catalogue_id: null,
      designation: `Équerres Isolco (${poseParFacade.nbEquerresPorteuses * nbFacades} porteuses + ${poseParFacade.nbEquerresGuides * nbFacades} guides) + ${nbChevillesMurales} chevilles façade + ${nbVisParement} vis parement`,
      description: estHpl
        ? "Point fixe Ø5,1 mm + points coulissants Ø8 mm (CSTB 3194)"
        : "Fixations inox A2/A4 conformes DTU 41.2",
      qte: nbEquerresTotal,
      unite: "ensembles",
      pu_ht: 4.8,
      pu_revient: 2.9,
      type_cout: "matiere",
      a_chiffrer: false,
    },
    ...(profils.totaux.totalBarres3MACommander > 0
      ? [
          {
            catalogue_id: null,
            designation: `Profilés alu laqués d'habillage & finitions (barres 3,00 m — optimisation 1D)`,
            description: profils.detailsParOuverture
              .map(
                (o) =>
                  `${o.ouvertureNom}: bavette ${o.bavetteAppui ? `${o.bavetteAppui.longueurM.toFixed(2)} m (+60 mm)` : "aucune"}, 2 tableaux ${o.tableauxLateraux.longueurUnitaireM.toFixed(2)} m, linteau ${o.linteauGoutteEau.longueurM.toFixed(2)} m (+40 mm)`
              )
              .join(" · "),
            qte: profils.totaux.totalBarres3MACommander,
            unite: "barres 3m",
            pu_ht: 36,
            pu_revient: 22,
            type_cout: "matiere" as const,
            a_chiffrer: false,
          },
        ]
      : []),
    {
      catalogue_id: null,
      designation: `Main-d'œuvre pose complète Bardage${nbCouchesIte > 0 ? ` + ITE ${nbCouchesIte} couche(s)` : ""}`,
      description: `Ossature + ${nbCouchesIte > 0 ? "ITE + " : ""}parement + habillage ouvertures/angles`,
      qte: heuresPoseTotal,
      unite: "h",
      pu_ht: CADENCES_DEFAUT.taux_horaire_vente_ht,
      pu_revient: CADENCES_DEFAUT.taux_horaire_charge_ht,
      type_cout: "main_oeuvre",
      a_chiffrer: false,
    },
  ];

  const totalMateriauxHt = arrondir(
    lignesDevis
      .filter((l) => l.type_cout === "matiere")
      .reduce((s, l) => s + l.qte * l.pu_ht, 0)
  );
  const totalMainOeuvreHt = arrondir(
    lignesDevis
      .filter((l) => l.type_cout === "main_oeuvre")
      .reduce((s, l) => s + l.qte * l.pu_ht, 0)
  );
  const totalHt = arrondir(totalMateriauxHt + totalMainOeuvreHt);

  const premOuv = profils.detailsParOuverture[0];
  const detailProfilsTxt = premOuv
    ? `- Habillage ouverture (${premOuv.ouvertureNom}) : bavette ${premOuv.bavetteAppui ? `${premOuv.bavetteAppui.longueurM.toFixed(2)} m (+60 mm)` : "aucune"}, 2 tableaux de ${premOuv.tableauxLateraux.longueurUnitaireM.toFixed(2)} m, linteau ${premOuv.linteauGoutteEau.longueurM.toFixed(2)} m (+40 mm) · Total profilés : ${profils.totaux.totalBarres3MACommander} barre(s) de 3,00 m.\n`
    : `- Profilés d'angle/finitions : ${profils.totaux.totalBarres3MACommander} barre(s) de 3,00 m.\n`;

  const paramsBardageNorm = calculerParametresBardageNormatifs(message);
  const normeBardageSynthese = estHpl
    ? "- Normes HPL (NF DTU 45.4 / CSTB 3799_V2) : Point Fixe Ø 5,0 mm au centre + Points Coulissants Ø 8,0 mm, joints ouverts 8–10 mm, EPDM 70 mm (courant) / 100 mm (jonction), anti-micro-rives < 250 mm.\n"
    : estComposite
      ? "- Normes Composite WPC (DTA fabricants) : entraxe 400–600 mm, jeu en bout 5–8 mm, double liteau aux aboutages, 1 vis de Point Fixe obligatoire au centre de chaque lame.\n"
      : `- Normes Bois Massif (NF DTU 41.2) : garde au sol >= 150 mm (sol dur) / >= 200 mm (terre), grille anti-rongeurs >= 50 cm²/ml, visserie Inox ${paramsBardageNorm.visserieInox}${paramsBardageNorm.estLittoralOuTannique ? " OBLIGATOIRE (littoral <= 3 km / bois tannique)" : ""}.\n`;

  const syntheseTexte =
    `=== PRÉ-CHIFFRAGE BNA CERTIFIÉ (BARDAGE ${estHpl ? "HPL CSTB 3194 / NF DTU 45.4" : "DTU 41.2"}) ===\n` +
    `- Surface brute : ${surfaceBruteM2} m² (${nbFacades} façade(s) ${largeurM}×${hauteurM} m) | Déduction ouvertures : ${surfaceOuverturesM2} m² | Surface nette : ${surfaceNetteM2} m²\n` +
    `- Parement Q_appro (+10 %) : ${surfaceParementApproM2} m²` +
    (estHpl ? ` (${nbPlaquesHplMeres} plaques mères HPL 3,05 × 1,30 m = 3,965 m²/u)\n` : `\n`) +
    (nbCouchesIte > 0
      ? `- Isolant ITE ${nbCouchesIte} couche(s) : ${surfaceIsolantACommanderM2} m² (${nbPaquetsIsolant} paquets de 4,8 m²)\n`
      : "") +
    `- Ossature : ${nbSegmentsChevrons} chevrons 60×40 (3,00 m), ${nbEquerresTotal} équerres Isolco (${poseParFacade.nbEquerresPorteuses * nbFacades} porteuses + ${poseParFacade.nbEquerresGuides * nbFacades} guides), ${nbChevillesMurales} chevilles façade, bande EPDM ${lineaireEpdm} ml, lame d'air ventilée ≥ 20 mm, ${nbVisParement} vis parement\n` +
    normeBardageSynthese +
    detailProfilsTxt +
    `- Main-d'œuvre calculée : ${heuresPoseTotal} h (dont ossature ${tempsPose.parPhase.ossature} h, isolation ${arrondir(tempsPose.parPhase.isolation + heuresIte2)} h, parement ${tempsPose.parPhase.bardage} h, finitions ${tempsPose.parPhase.finitions} h)\n` +
    `- Estimation indicative HT : Matériaux ${fmtEuro(totalMateriauxHt)} + Main-d'œuvre ${fmtEuro(totalMainOeuvreHt)} = **${fmtEuro(totalHt)} HT**`;

  return {
    metier: "bardage",
    titre: `Bardage ${estHpl ? "HPL" : "Bois/Composite"}${nbCouchesIte > 0 ? ` + ITE ${nbCouchesIte} couche(s)` : ""} — ${surfaceNetteM2} m² nets`,
    surfaceOuLineaire: surfaceNetteM2,
    unitePrincipale: "m²",
    heuresPoseTotal,
    totalMateriauxHt,
    totalMainOeuvreHt,
    totalHt,
    syntheseTexte,
    devisPrefill: {
      objet: `Travaux de bardage ${estHpl ? "HPL (CSTB 3194)" : "DTU 41.2"}${nbCouchesIte > 0 ? ` avec ITE ${nbCouchesIte} couche(s)` : ""} — ${surfaceNetteM2} m²`,
      typeTravaux: "Bardage & Isolation Extérieure (ITE)",
      surfaceM2: surfaceNetteM2,
      lignes: lignesDevis,
    },
    detailsBardage: {
      surfaceBruteM2,
      surfaceOuverturesM2,
      surfaceNetteM2,
      nbCouchesIte,
      surfaceIsolantACommanderM2,
      nbPlaquesHplMeres,
      bavetteLongueurM: premOuv?.bavetteAppui?.longueurM ?? 0,
      tableauLongueurM: premOuv?.tableauxLateraux.longueurUnitaireM ?? 0,
      linteauLongueurM: premOuv?.linteauGoutteEau.longueurM ?? 0,
    },
  };
}

function calculerPreChiffrageTerrasse(message: string): PreChiffrageBnaResult | null {
  const lower = message.toLowerCase();
  let longueurM = 0;
  let largeurM = 0;

  const matchDims = message.match(
    /(\d+(?:[.,]\d+)?)\s*(?:m\s*)?(?:[x×*]|sur)\s*(\d+(?:[.,]\d+)?)/i
  );
  if (matchDims) {
    longueurM = Math.max(parseNombreFr(matchDims[1]), parseNombreFr(matchDims[2]));
    largeurM = Math.min(parseNombreFr(matchDims[1]), parseNombreFr(matchDims[2]));
  } else {
    const matchM2 = message.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
    if (matchM2) {
      const surf = parseNombreFr(matchM2[1]);
      if (surf > 0) {
        largeurM = 4.0;
        longueurM = arrondir(surf / largeurM);
      }
    }
  }
  if (longueurM <= 0 || largeurM <= 0) return null;

  const paramsNorm = calculerParametresTerrasseNormatifs(message);
  const estMobile = paramsNorm.estMobile;
  const estComposite = paramsNorm.estComposite;
  const estMotorise = estMobile && !/manuel/i.test(lower);
  const essenceBois = estComposite
    ? "composite"
    : /ip[ée]/i.test(lower)
      ? "ipe"
      : /cumaru/i.test(lower)
        ? "cumaru"
        : /douglas/i.test(lower)
          ? "douglas"
          : "pin_cl4";

  const config: ChantierTerrasseConfig = {
    chantier_id: "ia-preview",
    entreprise_id: "ia-preview",
    nom: estMobile ? "Terrasse Mobile" : "Terrasse Platelage",
    longueur_m: longueurM,
    largeur_m: largeurM,
    hauteur_sol_cm:
      paramsNorm.hauteurPlotsMm !== null
        ? Math.round(paramsNorm.hauteurPlotsMm / 10)
        : 18,
    type_sol: "dalle_beton",
    pente_pct: 1.5,
    essence_bois: essenceBois,
    systeme_terrasse: estComposite ? "composite_clip" : "bois_vis",
    type_pose: paramsNorm.estDiagonale ? "diagonale" : "parallele",
    largeur_lame_mm: 145,
    epaisseur_lame_mm: 21,
    longueur_lame_m: 4.0,
    espacement_lames_mm: 5,
    type_fixation: estComposite ? "clips_invisibles" : "vis_inox",
    zone_environnement: paramsNorm.estBordDeMerOuPiscine ? "littoral" : "normal",
    type_lambourde: estMobile ? "alu_structure" : "bois_cl4",
    section_largeur_mm: 45,
    section_hauteur_mm: 70,
    longueur_lambourde_m: 4.0,
    entraxe_lambourdes_cm: paramsNorm.entraxeLambourdesCm,
    double_lambourdage_aboutage: true,
    bande_etancheite_epdm: true,
    cales_isolation: true,
    type_plots: "reglables",
    entraxe_plots_cm: 60,
    hauteur_reglage_plots: "40_60",
    geotextile: false,
    presence_escalier: false,
    escalier_nb_marches: 2,
    escalier_largeur_m: 2,
    escalier_giron_cm: 28,
    escalier_hauteur_marche_cm: 16,
    presence_garde_corps: false,
    garde_corps_longueur_ml: 0,
    garde_corps_type: "bois_cables",
    garde_corps_hauteur_cm: 100,
    coef_perte_lames: 1.1,
    coef_perte_lambourdes: 1.08,
    lame_id: null,
    clip_id: null,
    lambourde_id: null,
    plot_id: null,
    quantite_accessoires: {},
    terrasse_mobile: estMobile
      ? {
          active: true,
          mode: "1_plateau",
          sens_refoulement: "droite",
          hauteur_chassis_alu_mm: 100,
          jeu_fonctionnel_peripherique_mm: 20,
          motorise: estMotorise,
          type_motorisation: estMotorise ? "solaire" : "aucune",
        }
      : undefined,
  };

  const res = calculerTerrasse(config, [], null, { inclureMainOeuvre: true });
  const lignesDevis: LigneDevisIaPreRemplie[] = convertirChiffrageTerrasseEnLignesDevis(res).map((l) => ({
    catalogue_id: null,
    designation: l.designation,
    description: l.description || "",
    qte: Number(l.qte ?? 0),
    unite: l.unite,
    pu_ht: Number(l.pu_ht ?? 0),
    pu_revient: l.pu_revient ?? null,
    type_cout: l.type_cout === "main_oeuvre" ? "main_oeuvre" : "matiere",
    a_chiffrer: false,
  }));

  const tempsPoseTerrasse = calculerTempsPoseTerrasse(res);
  const heuresPoseTotal = tempsPoseTerrasse.totalHeures;
  const totalMateriauxHt = arrondir(
    lignesDevis
      .filter((l) => l.type_cout === "matiere")
      .reduce((s, l) => s + l.qte * l.pu_ht, 0)
  );
  const totalMainOeuvreHt = arrondir(
    lignesDevis
      .filter((l) => l.type_cout === "main_oeuvre")
      .reduce((s, l) => s + l.qte * l.pu_ht, 0)
  );
  const totalHt = arrondir(totalMateriauxHt + totalMainOeuvreHt);

  const normeLabel = paramsNorm.fabricant
    ? `COMPOSITE ${paramsNorm.fabricant.nom.toUpperCase()} (Hors NF DTU 51.4)`
    : `${estMobile ? "MOBILE NF P90-308 & " : ""}NF DTU 51.4`;

  const syntheseTexte =
    `=== PRÉ-CHIFFRAGE BNA CERTIFIÉ (TERRASSE ${normeLabel}) ===\n` +
    `- Dimensions : ${longueurM} × ${largeurM} m (${res.surfaceNetteM2} m² nets) | Entraxe lambourdes : ${paramsNorm.entraxeLambourdesMm} mm${paramsNorm.estDiagonale ? " (diagonale)" : ""}\n` +
    `- Lames à commander : ${res.lames.nbLamesStandard} u (${res.lames.surfaceACommanderM2} m²) | Lambourdes : ${res.lambourdes.nbBarres} u (${res.lambourdes.lineaireMl} ml)\n` +
    `- Plots : ${res.plots.nbPlotsTotal} u | Fixations (${paramsNorm.visserieInox === "A4" ? "Inox A4 obligatoire" : paramsNorm.visserieInox === "A2" ? "Inox A2" : "Clips fabricant"}) : ${res.fixations.nbVisOuClipsTotal} u\n` +
    (paramsNorm.fabricant
      ? `- Règles ${paramsNorm.fabricant.nom} : ${paramsNorm.fabricant.reglesSpecifiques[0]} Jeux : aboutage ${paramsNorm.fabricant.jeuAboutageMm}, mur ${paramsNorm.fabricant.jeuMurMm}.\n`
      : "") +
    (paramsNorm.alertePlotsDepassement ? `${paramsNorm.alertePlotsDepassement}\n` : "") +
    (estMobile
      ? `- Kit Terrasse Mobile NF P90-308 : châssis porteur alu + rails inox + galets${estMotorise ? " + motorisation 24V" : ""}\n`
      : "") +
    `- Main-d'œuvre calculée : ${heuresPoseTotal} h\n` +
    `- Estimation indicative HT : Matériaux ${fmtEuro(totalMateriauxHt)} + Main-d'œuvre ${fmtEuro(totalMainOeuvreHt)} = **${fmtEuro(totalHt)} HT**`;

  return {
    metier: "terrasse",
    titre: `Terrasse ${estMobile ? "Mobile " : ""}${paramsNorm.fabricant ? paramsNorm.fabricant.nom : estComposite ? "Composite" : "Bois"} — ${res.surfaceNetteM2} m²`,
    surfaceOuLineaire: res.surfaceNetteM2,
    unitePrincipale: "m²",
    heuresPoseTotal,
    totalMateriauxHt,
    totalMainOeuvreHt,
    totalHt,
    syntheseTexte,
    detailsTerrasse: {
      entraxeLambourdesMm: paramsNorm.entraxeLambourdesMm,
      fabricant: paramsNorm.fabricant?.nom ?? null,
      visserieInox: paramsNorm.visserieInox,
      alertePlotsDepassement: paramsNorm.alertePlotsDepassement,
    },
    devisPrefill: {
      objet: `Terrasse ${estMobile ? "Mobile motorisée (NF P90-308) " : ""}${estComposite ? "Composite" : "Bois"} — ${res.surfaceNetteM2} m²`,
      typeTravaux: estMobile ? "Terrasse & Terrasse Mobile" : "Terrasse & Platelage",
      surfaceM2: res.surfaceNetteM2,
      lignes: lignesDevis,
    },
  };
}

function calculerPreChiffrageCloture(message: string): PreChiffrageBnaResult | null {
  const lower = message.toLowerCase();
  const matchMl = message.match(/(\d+(?:[.,]\d+)?)\s*(?:ml|m\b|m[èe]tres?)/i);
  if (!matchMl) return null;
  const lineaireM = parseNombreFr(matchMl[1]);
  if (lineaireM <= 0) return null;

  const materiau: FenceMaterial = /alu/i.test(lower)
    ? "ALU"
    : /bois/i.test(lower)
      ? "BOIS"
      : "COMPOSITE";
  const presencePortillon = /portillon/i.test(lower);
  const presenceSoubassement = /soubassement/i.test(lower);

  const config: FenceConfig = {
    forme: "DROITE",
    extremites: "LIBRE",
    materiau,
    hauteurUtile: 1.8,
    longueurLameBrute: 1.8,
    hauteurLame: 0.15,
    typePoseSol: "DIRECT_SOL",
    presenceSoubassement,
    hauteurSoubassementM: 0.25,
    gestionPente: "PLAT",
    segments: { A: lineaireM, B: 0, C: 0 },
    portillons: presencePortillon ? [{ segment: "A", largeurM: 1.0 }] : [],
  };

  const res = calculerChiffrageCloture(config, { inclureMainOeuvre: true });
  const lignesDevis: LigneDevisIaPreRemplie[] = res.lignesDevis.map((l) => ({
    catalogue_id: null,
    designation: l.designation,
    description: l.description || "",
    qte: l.qte,
    unite: l.unite,
    pu_ht: l.pu_ht,
    pu_revient: l.pu_revient,
    type_cout: l.type_cout,
    a_chiffrer: false,
  }));

  const syntheseTexte =
    `=== PRÉ-CHIFFRAGE BNA CERTIFIÉ (CLÔTURE ${materiau}) ===\n` +
    `- Linéaire : ${res.calepinage.lineaireTotalM} ml · ${res.calepinage.nbTraveesTotal} travée(s) · Hauteur ${config.hauteurUtile} m\n` +
    `- Lames : ${res.calepinage.nbTotalLames} u | Poteaux : ${res.calepinage.totalPoteauxComplets} u | Sacs béton 35 kg : ${res.calepinage.nbSacsBeton35kg} u` +
    (presencePortillon ? " | Portillon 1,00 m inclus" : "") +
    `\n- Main-d'œuvre calculée : ${res.tempsPose.totalHeures} h\n` +
    `- Estimation indicative HT : Matériaux ${fmtEuro(res.totalFournituresHT)} + Main-d'œuvre ${fmtEuro(res.totalMainOeuvreHT)} = **${fmtEuro(res.totalHT)} HT**`;

  return {
    metier: "cloture",
    titre: `Clôture ${materiau} — ${res.calepinage.lineaireTotalM} ml`,
    surfaceOuLineaire: res.calepinage.lineaireTotalM,
    unitePrincipale: "ml",
    heuresPoseTotal: res.tempsPose.totalHeures,
    totalMateriauxHt: res.totalFournituresHT,
    totalMainOeuvreHt: res.totalMainOeuvreHT,
    totalHt: res.totalHT,
    syntheseTexte,
    devisPrefill: {
      objet: `Clôture ${materiau} (${res.calepinage.lineaireTotalM} ml${presencePortillon ? " + portillon" : ""})`,
      typeTravaux: "Clôture & Aménagement Extérieur",
      surfaceM2: res.calepinage.lineaireTotalM,
      lignes: lignesDevis,
    },
  };
}

export function detecterEtCalculerPreChiffrage(
  message: string
): PreChiffrageBnaResult | null {
  const lower = message.toLowerCase();
  const aUnChiffre = /\d/.test(message);
  if (!aUnChiffre) return null;

  if (
    /terrasse|platelage|piscine|silvadec|fiberdeck|neowood|oc[ée]wood/i.test(
      lower
    )
  ) {
    return calculerPreChiffrageTerrasse(message);
  }
  if (
    /bardage|\bhpl\b|trespa|fundermax|equitone|cedral|\bweo\b|newtechwood|\bite\b|fa[çc]ade|claire[-\s]?voie/i.test(
      lower
    )
  ) {
    return calculerPreChiffrageBardage(message);
  }
  if (/cl[ôo]ture|palissade|portillon/i.test(lower)) {
    return calculerPreChiffrageCloture(message);
  }
  return null;
}
