import { calculerPose } from "./poseCalcul";
import { 
  calculerCalepinage, 
  PieceCalepinage, 
  ResultatCalepinageGlobal,
  genererPlanDebitNesting
} from './calepinageCalcul';

export interface OuvertureDetail {
  id: string;
  type: "fenetre" | "porte" | "baie";
  largeurM: number;
  hauteurM: number;
  xM: number; // Distance depuis l'angle gauche
  yM: number; // Distance depuis le sol jusqu'à l'allège (fenêtre) ou sol (porte)
}

export interface MurInput {
  id: string;
  nom: string;
  largeurM: number;
  hauteurM: number;
  estPignon?: boolean;
  hauteurFaiteM?: number;
  ouvertures: OuvertureDetail[];
}

export interface ProjetCalepinageInput {
  murs: MurInput[];
  plaqueBrute: {
    longueurMm: number; // ex: 3500
    largeurMm: number;  // ex: 1350
  };
  moduleCible: {
    largeurMm: number;
    hauteurMm: number;
  };
  jointMm?: number;
  sensPose?: "horizontal" | "vertical";
}

export interface OssatureBois {
  id: string;
  type: "montant_rive" | "traverse" | "montant_intermediaire" | "montant_standard";
  longueurM: number;
  xM: number;
  yM: number;
  murId: string;
}

export interface ProjetCalepinageResultat {
  calepinageGlobal: ResultatCalepinageGlobal;
  ossatures: OssatureBois[];
}

export function genererCalepinageGlobal(input: ProjetCalepinageInput): ProjetCalepinageResultat {
  const { murs, plaqueBrute, moduleCible, jointMm = 8, sensPose = "horizontal" } = input;
  
  let allPieces: PieceCalepinage[] = [];
  const resultatsMur: Record<string, any> = {};
  const ossatures: OssatureBois[] = [];
  
  for (const mur of murs) {
    // 1. Calcul du calepinage pour ce mur (en gardant intact le moteur existant DTU 45.4)
    const ouverturesCalepinage = mur.ouvertures.map(o => {
      // Pour le moteur existant, on fournit hauteurLinteauM = yM + hauteurM
      const hauteurLinteauM = o.type === "fenetre" ? o.yM + o.hauteurM : o.yM + o.hauteurM; 
      return {
        id: o.id,
        type: o.type === "baie" ? "porte" : o.type,
        largeur: o.largeurM,
        hauteur: o.hauteurM,
        hauteurLinteauM: hauteurLinteauM
      };
    });

    const resultatMur = calculerCalepinage({
      zoneLargeurM: mur.largeurM,
      zoneHauteurM: mur.hauteurM,
      estPignon: mur.estPignon,
      hauteurFaiteM: mur.hauteurFaiteM,
      plaqueLongueurMm: plaqueBrute.longueurMm,
      plaqueLargeurMm: plaqueBrute.largeurMm,
      moduleLargeurMm: moduleCible.largeurMm,
      moduleHauteurMm: moduleCible.hauteurMm,
      jointMm: jointMm,
      sensPose: sensPose,
      ouvertures: ouverturesCalepinage
    });

    
    const pose = calculerPose(
      "hpl",
      mur.largeurM,
      mur.estPignon && mur.hauteurFaiteM ? mur.hauteurFaiteM : mur.hauteurM,
      0, // angle
      1, // vent
      100, // largeurLame par défaut
      {
        resultats: resultatMur,
        estPignon: mur.estPignon || false,
        pentePct: resultatMur.pentePct || 0
      }
    );
    resultatsMur[mur.id] = { calepinage: resultatMur, pose };
    
    for (const p of resultatMur.pieces) {
      allPieces.push({
        ...p,
        id: `${mur.id}-${p.id}`,
        repere: `${mur.nom} - ${p.repere}`,
        zoneId: mur.id,
        zoneNom: mur.nom,
      });
    }

    // 2. Règles d'Ossature (Le Squelette Bois)
    // Montants standards tous les 60cm max
    let oId = 1;
    const ENTRAXE_MAX = 0.60;
    
    // Génération des ossatures autour des menuiseries
    for (const ouv of mur.ouvertures) {
      // a) Rives de baies: Montants verticaux (max 3m) de chaque côté
      // On divise la hauteur si > 3m
      let hauteurRestante = ouv.hauteurM;
      let yCurrent = ouv.yM;
      while (hauteurRestante > 0) {
        const l = Math.min(hauteurRestante, 3.0);
        
        // Montant Gauche
        ossatures.push({
          id: `oss-${mur.id}-${oId++}`,
          type: "montant_rive",
          longueurM: l,
          xM: ouv.xM,
          yM: yCurrent,
          murId: mur.id
        });
        
        // Montant Droit
        ossatures.push({
          id: `oss-${mur.id}-${oId++}`,
          type: "montant_rive",
          longueurM: l,
          xM: ouv.xM + ouv.largeurM,
          yM: yCurrent,
          murId: mur.id
        });
        
        hauteurRestante -= l;
        yCurrent += l;
      }
      
      // b) Traverses: bois horizontaux haut et bas
      // Traverse bas (allège)
      if (ouv.type === "fenetre") {
        ossatures.push({
          id: `oss-${mur.id}-${oId++}`,
          type: "traverse",
          longueurM: ouv.largeurM,
          xM: ouv.xM,
          yM: ouv.yM,
          murId: mur.id
        });
      }
      
      // Traverse haut (linteau)
      ossatures.push({
        id: `oss-${mur.id}-${oId++}`,
        type: "traverse",
        longueurM: ouv.largeurM,
        xM: ouv.xM,
        yM: ouv.yM + ouv.hauteurM,
        murId: mur.id
      });
      
      // c) Montants intermédiaires (entraxe max 60cm) sous et sur la menuiserie
      const nbEspacements = Math.ceil(ouv.largeurM / ENTRAXE_MAX);
      const entraxeReel = ouv.largeurM / nbEspacements;
      
      for (let i = 1; i < nbEspacements; i++) {
        const xPos = ouv.xM + (i * entraxeReel);
        // Sous la menuiserie (allège)
        if (ouv.type === "fenetre" && ouv.yM > 0) {
          ossatures.push({
            id: `oss-${mur.id}-${oId++}`,
            type: "montant_intermediaire",
            longueurM: ouv.yM,
            xM: xPos,
            yM: 0,
            murId: mur.id
          });
        }
        
        // Sur la menuiserie (jusqu'en haut du mur)
        const hauteurAuDessus = mur.hauteurM - (ouv.yM + ouv.hauteurM);
        if (hauteurAuDessus > 0) {
          ossatures.push({
            id: `oss-${mur.id}-${oId++}`,
            type: "montant_intermediaire",
            longueurM: hauteurAuDessus,
            xM: xPos,
            yM: ouv.yM + ouv.hauteurM,
            murId: mur.id
          });
        }
      }
    }
  }
  
  // 3. Optimisation Globale (Nesting) avec mise en mémoire des chutes
  // Le moteur genererPlanDebitNesting de calepinageCalcul gère déjà les chutes (ChutePlaque)
  // en scannant la mémoire avant d'entamer une nouvelle plaque.
  const nestingResult = genererPlanDebitNesting(
    allPieces,
    plaqueBrute.longueurMm,
    plaqueBrute.largeurMm,
    moduleCible.largeurMm,
    moduleCible.hauteurMm,
    3 // trait de scie
  );
  
  const plaquesDebit = nestingResult.plaquesDebit;
  const nbPlaquesNecessaires = plaquesDebit.length;
  const surfacePlaqueBruteM2 = (plaqueBrute.longueurMm * plaqueBrute.largeurMm) / 1_000_000;
  const surfacePlaquesAchetesM2 = nbPlaquesNecessaires * surfacePlaqueBruteM2;
  const surfaceZoneM2 = allPieces.reduce((s: number, p: any) => s + p.surfaceM2, 0);
  
  const totalChutesReutilisablesM2 = plaquesDebit.reduce(
    (s: number, p: any) => s + p.surfaceChutesReutilisablesM2,
    0
  );

  const totalDechetsPerteM2 = Math.max(
    0,
    surfacePlaquesAchetesM2 - surfaceZoneM2 - totalChutesReutilisablesM2
  );

  const calepinageGlobal: ResultatCalepinageGlobal = {
    plaquesDebit,
    pieces: allPieces,
    nbPlaquesNecessaires,
    surfacePlaquesAchetesM2,
    totalChutesReutilisablesM2,
    totalDechetsPerteM2,
    tauxChuteBrutePct: surfacePlaquesAchetesM2 > 0 ? ((surfacePlaquesAchetesM2 - surfaceZoneM2) / surfacePlaquesAchetesM2) * 100 : 0,
    tauxChuteNettePct: surfacePlaquesAchetesM2 > 0 ? (totalDechetsPerteM2 / surfacePlaquesAchetesM2) * 100 : 0,
    resultatsMur
  };

  return {
    calepinageGlobal,
    ossatures
  };
}
