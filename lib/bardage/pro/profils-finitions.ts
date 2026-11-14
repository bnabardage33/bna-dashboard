// lib/bardage/pro/profils-finitions.ts
// Habillage complet des ouvertures & Profilés de finitions (Angles sortants / rentrants, Arrêts latéraux)
// Optimisation de découpe 1D dans des barres commerciales de 3,00 m (trait de scie 3 mm)

export type TypeProfilFinition =
  | "bavette_appui"
  | "tableau_lateral"
  | "linteau_goutte_eau"
  | "corniere_angle_rive";

export const CONSTANTES_PROFILS_1D = {
  LONGUEUR_BARRE_STANDARD_MM: 3000, // Barres commerciales standard de 3,00 m
  TRAIT_DE_SCIE_MM: 3, // Trait de scie 3 mm
  SURCOTE_BAVETTE_APPUI_MM: 60, // Largeur_ouv + 60 mm (oreilles et relevés latéraux)
  SURCOTE_LINTEAU_GOUTTE_EAU_MM: 40, // Largeur_ouv + 40 mm (débordement linteau goutte d'eau)
} as const;

export interface PieceProfil1D {
  id: string;
  famille: TypeProfilFinition;
  designation: string;
  ouvertureId?: string;
  ouvertureNom?: string;
  longueurMm: number;
  longueurM: number;
}

export interface BarreDebit1D {
  index: number;
  longueurBarreMm: number;
  pieces: {
    id: string;
    designation: string;
    famille: TypeProfilFinition;
    longueurMm: number;
    positionDebutMm: number;
  }[];
  longueurUtileMm: number;
  chuteMm: number;
  tauxChutePct: number;
}

export interface ResultatProfilsFamille1D {
  famille: TypeProfilFinition;
  nomCommercial: string;
  pieces: PieceProfil1D[];
  lineairePoseNetMl: number; // Q_net
  lineaireDebiteMl: number; // Q_tech (nbBarres * 3.00 m)
  nbBarresACommander: number; // Q_appro
  longueurBarreStandardM: number; // 3.00 m
  chuteTotaleMl: number;
  tauxChutePct: number;
  barres: BarreDebit1D[];
}

export interface DetailOuvertureHabillage {
  ouvertureId: string;
  ouvertureNom: string;
  type: string;
  largeurM: number;
  hauteurM: number;
  /** Bavette d'appui alu avec oreilles et relevés (largeur_ouv + 60 mm) */
  bavetteAppui: {
    longueurMm: number;
    longueurM: number;
  } | null;
  /** 2 cornières / joues de tableaux latéraux (hauteur_ouv chacune) */
  tableauxLateraux: {
    longueurUnitaireMm: number;
    longueurUnitaireM: number;
    quantite: 2;
    longueurTotaleM: number;
  };
  /** Profilé linteau avec goutte d'eau (largeur_ouv + 40 mm) */
  linteauGoutteEau: {
    longueurMm: number;
    longueurM: number;
  };
  lineaireTotalOuvertureM: number;
}

export interface HabillageProfilsResult {
  detailsParOuverture: DetailOuvertureHabillage[];
  piecesToutes: PieceProfil1D[];
  familles: {
    bavettesAppui: ResultatProfilsFamille1D;
    tableauxLateraux: ResultatProfilsFamille1D;
    linteauxGoutteEau: ResultatProfilsFamille1D;
    cornieresAnglesRives: ResultatProfilsFamille1D;
  };
  totaux: {
    lineairePoseNetMl: number; // Q_net total profils
    lineaireDebiteMl: number; // Q_tech total profils (somme barres * 3m)
    totalBarres3MACommander: number; // Q_appro total barres
    chuteTotaleMl: number;
    tauxChuteGlobalPct: number;
  };
}

export interface ProfilOuvertureInput {
  id: string;
  nom?: string;
  type?: string;
  largeurM: number;
  hauteurM: number;
}

export interface ProfilFacadeInput {
  id?: string;
  nom?: string;
  type?: "facade" | "pignon";
  largeurM: number;
  hauteurMurM: number;
  hauteurFaiteM?: number | null;
  angle?: boolean;
  nbAnglesSortants?: number;
  nbAnglesRentrants?: number;
  ouvertures?: ProfilOuvertureInput[];
}

/**
 * Algorithme d'optimisation de découpe 1D (Bin-Packing Best-Fit Decreasing)
 * dans des barres commerciales de longueur standard (défaut 3000 mm)
 * avec prise en compte du trait de scie (défaut 3 mm).
 */
export function optimiserDecoupe1D(
  pieces: PieceProfil1D[],
  options: {
    longueurBarreMm?: number;
    traitDeScieMm?: number;
  } = {}
): {
  barres: BarreDebit1D[];
  nbBarres: number;
  lineairePoseNetMl: number;
  lineaireDebiteMl: number;
  chuteTotaleMl: number;
  tauxChutePct: number;
} {
  const L_barre = options.longueurBarreMm ?? CONSTANTES_PROFILS_1D.LONGUEUR_BARRE_STANDARD_MM;
  const traitDeScie = options.traitDeScieMm ?? CONSTANTES_PROFILS_1D.TRAIT_DE_SCIE_MM;

  if (pieces.length === 0) {
    return {
      barres: [],
      nbBarres: 0,
      lineairePoseNetMl: 0,
      lineaireDebiteMl: 0,
      chuteTotaleMl: 0,
      tauxChutePct: 0,
    };
  }

  // 1. Découpage éventuel des pièces trop longues pour une seule barre (> L_barre)
  const piecesTraitees: PieceProfil1D[] = [];
  for (const p of pieces) {
    if (p.longueurMm <= L_barre) {
      piecesTraitees.push(p);
    } else {
      let restantMm = p.longueurMm;
      let tronconIdx = 1;
      while (restantMm > 0) {
        const len = Math.min(L_barre, restantMm);
        piecesTraitees.push({
          ...p,
          id: `${p.id}-t${tronconIdx++}`,
          designation: `${p.designation} (tronçon ${len} mm)`,
          longueurMm: len,
          longueurM: Number((len / 1000).toFixed(3)),
        });
        restantMm -= len;
      }
    }
  }

  // 2. Tri décroissant par longueur (Best-Fit Decreasing)
  const piecesTriees = [...piecesTraitees].sort((a, b) => b.longueurMm - a.longueurMm);

  interface BarreEnCours {
    index: number;
    pieces: BarreDebit1D["pieces"];
    espaceOccupeMm: number;
    longueurUtileMm: number;
  }

  const barres: BarreEnCours[] = [];

  for (const piece of piecesTriees) {
    const pLen = piece.longueurMm;
    let meilleurBarre: BarreEnCours | null = null;
    let plusPetitReste = Infinity;

    for (const b of barres) {
      const surplus = b.pieces.length > 0 ? traitDeScie : 0;
      const espaceNecessaire = surplus + pLen;
      const espaceRestant = L_barre - b.espaceOccupeMm;

      if (espaceNecessaire <= espaceRestant) {
        const resteApres = espaceRestant - espaceNecessaire;
        if (resteApres < plusPetitReste) {
          plusPetitReste = resteApres;
          meilleurBarre = b;
        }
      }
    }

    if (meilleurBarre) {
      const positionDebut = meilleurBarre.espaceOccupeMm + (meilleurBarre.pieces.length > 0 ? traitDeScie : 0);
      meilleurBarre.pieces.push({
        id: piece.id,
        designation: piece.designation,
        famille: piece.famille,
        longueurMm: pLen,
        positionDebutMm: positionDebut,
      });
      meilleurBarre.espaceOccupeMm = positionDebut + pLen;
      meilleurBarre.longueurUtileMm += pLen;
    } else {
      // Nouvelle barre requise
      const nouvelleBarre: BarreEnCours = {
        index: barres.length + 1,
        pieces: [
          {
            id: piece.id,
            designation: piece.designation,
            famille: piece.famille,
            longueurMm: pLen,
            positionDebutMm: 0,
          },
        ],
        espaceOccupeMm: pLen,
        longueurUtileMm: pLen,
      };
      barres.push(nouvelleBarre);
    }
  }

  // 3. Calcul des métriques de sortie
  const barresFinales: BarreDebit1D[] = barres.map((b) => {
    const chuteMm = Math.max(0, L_barre - b.longueurUtileMm);
    return {
      index: b.index,
      longueurBarreMm: L_barre,
      pieces: b.pieces,
      longueurUtileMm: b.longueurUtileMm,
      chuteMm,
      tauxChutePct: Number(((chuteMm / L_barre) * 100).toFixed(1)),
    };
  });

  const totalUtileMm = piecesTraitees.reduce((s, p) => s + p.longueurMm, 0);
  const lineairePoseNetMl = Number((totalUtileMm / 1000).toFixed(2));
  const lineaireDebiteMl = Number(((barresFinales.length * L_barre) / 1000).toFixed(2));
  const chuteTotaleMl = Number(Math.max(0, lineaireDebiteMl - lineairePoseNetMl).toFixed(2));
  const tauxChutePct =
    lineaireDebiteMl > 0 ? Number(((chuteTotaleMl / lineaireDebiteMl) * 100).toFixed(1)) : 0;

  return {
    barres: barresFinales,
    nbBarres: barresFinales.length,
    lineairePoseNetMl,
    lineaireDebiteMl,
    chuteTotaleMl,
    tauxChutePct,
  };
}

/**
 * Calcule l'habillage complet des ouvertures (bavette, tableaux, linteau)
 * et les cornières d'angle aluminium laqué RAL sur toute la hauteur des rives,
 * avec optimisation 1D dans des barres de 3,00 m.
 */
export function calculerHabillageOuverturesEtProfils1D(
  facade: ProfilFacadeInput,
  options: {
    longueurBarreStandardMm?: number;
    traitDeScieMm?: number;
    margeSecuritePct?: number;
  } = {}
): HabillageProfilsResult {
  const longBarreMm = options.longueurBarreStandardMm ?? CONSTANTES_PROFILS_1D.LONGUEUR_BARRE_STANDARD_MM;
  const traitDeScieMm = options.traitDeScieMm ?? CONSTANTES_PROFILS_1D.TRAIT_DE_SCIE_MM;
  const ouvertures = facade.ouvertures ?? [];

  const piecesBavettes: PieceProfil1D[] = [];
  const piecesTableaux: PieceProfil1D[] = [];
  const piecesLinteaux: PieceProfil1D[] = [];
  const piecesAngles: PieceProfil1D[] = [];

  const detailsParOuverture: DetailOuvertureHabillage[] = [];

  // 1. Habillage des Ouvertures
  let ouvIndex = 1;
  for (const ouv of ouvertures) {
    const ouvId = ouv.id || `ouv-${ouvIndex}`;
    const ouvNom = ouv.nom || `Ouverture ${ouvIndex}`;
    const wMm = Math.round(ouv.largeurM * 1000);
    const hMm = Math.round(ouv.hauteurM * 1000);
    const type = (ouv.type || "fenetre").toLowerCase();
    const estPorte = type === "porte";

    // A. Bavette d'appui alu avec oreilles et relevés latéraux (largeur_ouv + 60 mm)
    // S'applique aux fenêtres et baies (les portes reposent généralement sur le seuil/sol)
    let bavetteDetail: DetailOuvertureHabillage["bavetteAppui"] = null;
    if (!estPorte) {
      const lenBavetteMm = wMm + CONSTANTES_PROFILS_1D.SURCOTE_BAVETTE_APPUI_MM;
      const pieceBavette: PieceProfil1D = {
        id: `bav-${ouvId}`,
        famille: "bavette_appui",
        designation: `Bavette d'appui alu (${ouvNom} ${wMm} mm + 60 mm)`,
        ouvertureId: ouvId,
        ouvertureNom: ouvNom,
        longueurMm: lenBavetteMm,
        longueurM: Number((lenBavetteMm / 1000).toFixed(3)),
      };
      piecesBavettes.push(pieceBavette);
      bavetteDetail = {
        longueurMm: lenBavetteMm,
        longueurM: pieceBavette.longueurM,
      };
    }

    // B. Les 2 cornières / joues de tableaux latéraux (hauteur_ouv chacune)
    const pieceTableauG: PieceProfil1D = {
      id: `tab-g-${ouvId}`,
      famille: "tableau_lateral",
      designation: `Tableau latéral gauche (${ouvNom} H=${hMm} mm)`,
      ouvertureId: ouvId,
      ouvertureNom: ouvNom,
      longueurMm: hMm,
      longueurM: Number((hMm / 1000).toFixed(3)),
    };
    const pieceTableauD: PieceProfil1D = {
      id: `tab-d-${ouvId}`,
      famille: "tableau_lateral",
      designation: `Tableau latéral droit (${ouvNom} H=${hMm} mm)`,
      ouvertureId: ouvId,
      ouvertureNom: ouvNom,
      longueurMm: hMm,
      longueurM: Number((hMm / 1000).toFixed(3)),
    };
    piecesTableaux.push(pieceTableauG, pieceTableauD);

    const tableauxDetail: DetailOuvertureHabillage["tableauxLateraux"] = {
      longueurUnitaireMm: hMm,
      longueurUnitaireM: Number((hMm / 1000).toFixed(3)),
      quantite: 2,
      longueurTotaleM: Number(((2 * hMm) / 1000).toFixed(3)),
    };

    // C. Le profilé linteau avec goutte d'eau en partie haute (largeur_ouv + 40 mm)
    const lenLinteauMm = wMm + CONSTANTES_PROFILS_1D.SURCOTE_LINTEAU_GOUTTE_EAU_MM;
    const pieceLinteau: PieceProfil1D = {
      id: `lint-${ouvId}`,
      famille: "linteau_goutte_eau",
      designation: `Profil linteau goutte d'eau (${ouvNom} ${wMm} mm + 40 mm)`,
      ouvertureId: ouvId,
      ouvertureNom: ouvNom,
      longueurMm: lenLinteauMm,
      longueurM: Number((lenLinteauMm / 1000).toFixed(3)),
    };
    piecesLinteaux.push(pieceLinteau);

    const linteauDetail: DetailOuvertureHabillage["linteauGoutteEau"] = {
      longueurMm: lenLinteauMm,
      longueurM: pieceLinteau.longueurM,
    };

    const lineaireTotalOuvertureM = Number(
      ((bavetteDetail?.longueurM ?? 0) + tableauxDetail.longueurTotaleM + linteauDetail.longueurM).toFixed(3)
    );

    detailsParOuverture.push({
      ouvertureId: ouvId,
      ouvertureNom: ouvNom,
      type,
      largeurM: ouv.largeurM,
      hauteurM: ouv.hauteurM,
      bavetteAppui: bavetteDetail,
      tableauxLateraux: tableauxDetail,
      linteauGoutteEau: linteauDetail,
      lineaireTotalOuvertureM,
    });

    ouvIndex++;
  }

  // 2. Angles sortants / rentrants et arrêts latéraux
  // Cornières d'angle aluminium laqué RAL sur toute la hauteur des rives
  const hRiveMm = Math.round(facade.hauteurMurM * 1000);
  let nbAngles = 0;
  if (facade.nbAnglesSortants !== undefined || facade.nbAnglesRentrants !== undefined) {
    nbAngles = (facade.nbAnglesSortants ?? 0) + (facade.nbAnglesRentrants ?? 0);
  } else if (facade.angle) {
    nbAngles = 2; // Rive d'angle gauche et droite
  } else {
    // Par défaut : 2 rives latérales de façade / arrêt
    nbAngles = 2;
  }

  for (let a = 1; a <= nbAngles; a++) {
    const pieceAngle: PieceProfil1D = {
      id: `angle-${a}`,
      famille: "corniere_angle_rive",
      designation: `Cornière d'angle alu laqué RAL rive #${a} (H=${hRiveMm} mm)`,
      longueurMm: hRiveMm,
      longueurM: Number((hRiveMm / 1000).toFixed(3)),
    };
    piecesAngles.push(pieceAngle);
  }

  // 3. Optimisation de découpe 1D par famille
  const optBavettes = optimiserDecoupe1D(piecesBavettes, { longueurBarreMm: longBarreMm, traitDeScieMm });
  const optTableaux = optimiserDecoupe1D(piecesTableaux, { longueurBarreMm: longBarreMm, traitDeScieMm });
  const optLinteaux = optimiserDecoupe1D(piecesLinteaux, { longueurBarreMm: longBarreMm, traitDeScieMm });
  const optAngles = optimiserDecoupe1D(piecesAngles, { longueurBarreMm: longBarreMm, traitDeScieMm });

  const familles: HabillageProfilsResult["familles"] = {
    bavettesAppui: {
      famille: "bavette_appui",
      nomCommercial: "Bavette d'appui aluminium pliée avec oreilles et relevés",
      pieces: piecesBavettes,
      lineairePoseNetMl: optBavettes.lineairePoseNetMl,
      lineaireDebiteMl: optBavettes.lineaireDebiteMl,
      nbBarresACommander: optBavettes.nbBarres,
      longueurBarreStandardM: longBarreMm / 1000,
      chuteTotaleMl: optBavettes.chuteTotaleMl,
      tauxChutePct: optBavettes.tauxChutePct,
      barres: optBavettes.barres,
    },
    tableauxLateraux: {
      famille: "tableau_lateral",
      nomCommercial: "Cornières / Joues de Tableaux Latéraux aluminium",
      pieces: piecesTableaux,
      lineairePoseNetMl: optTableaux.lineairePoseNetMl,
      lineaireDebiteMl: optTableaux.lineaireDebiteMl,
      nbBarresACommander: optTableaux.nbBarres,
      longueurBarreStandardM: longBarreMm / 1000,
      chuteTotaleMl: optTableaux.chuteTotaleMl,
      tauxChutePct: optTableaux.tauxChutePct,
      barres: optTableaux.barres,
    },
    linteauxGoutteEau: {
      famille: "linteau_goutte_eau",
      nomCommercial: "Profilé linteau aluminium avec goutte d'eau",
      pieces: piecesLinteaux,
      lineairePoseNetMl: optLinteaux.lineairePoseNetMl,
      lineaireDebiteMl: optLinteaux.lineaireDebiteMl,
      nbBarresACommander: optLinteaux.nbBarres,
      longueurBarreStandardM: longBarreMm / 1000,
      chuteTotaleMl: optLinteaux.chuteTotaleMl,
      tauxChutePct: optLinteaux.tauxChutePct,
      barres: optLinteaux.barres,
    },
    cornieresAnglesRives: {
      famille: "corniere_angle_rive",
      nomCommercial: "Cornière d'angle aluminium laqué RAL (rives & arrêts)",
      pieces: piecesAngles,
      lineairePoseNetMl: optAngles.lineairePoseNetMl,
      lineaireDebiteMl: optAngles.lineaireDebiteMl,
      nbBarresACommander: optAngles.nbBarres,
      longueurBarreStandardM: longBarreMm / 1000,
      chuteTotaleMl: optAngles.chuteTotaleMl,
      tauxChutePct: optAngles.tauxChutePct,
      barres: optAngles.barres,
    },
  };

  const piecesToutes = [...piecesBavettes, ...piecesTableaux, ...piecesLinteaux, ...piecesAngles];

  const totalPoseNetMl = Number(
    (
      familles.bavettesAppui.lineairePoseNetMl +
      familles.tableauxLateraux.lineairePoseNetMl +
      familles.linteauxGoutteEau.lineairePoseNetMl +
      familles.cornieresAnglesRives.lineairePoseNetMl
    ).toFixed(2)
  );

  const totalDebiteMl = Number(
    (
      familles.bavettesAppui.lineaireDebiteMl +
      familles.tableauxLateraux.lineaireDebiteMl +
      familles.linteauxGoutteEau.lineaireDebiteMl +
      familles.cornieresAnglesRives.lineaireDebiteMl
    ).toFixed(2)
  );

  const totalBarres3M =
    familles.bavettesAppui.nbBarresACommander +
    familles.tableauxLateraux.nbBarresACommander +
    familles.linteauxGoutteEau.nbBarresACommander +
    familles.cornieresAnglesRives.nbBarresACommander;

  const chuteTotaleMl = Number(Math.max(0, totalDebiteMl - totalPoseNetMl).toFixed(2));
  const tauxChuteGlobalPct =
    totalDebiteMl > 0 ? Number(((chuteTotaleMl / totalDebiteMl) * 100).toFixed(1)) : 0;

  return {
    detailsParOuverture,
    piecesToutes,
    familles,
    totaux: {
      lineairePoseNetMl: totalPoseNetMl,
      lineaireDebiteMl: totalDebiteMl,
      totalBarres3MACommander: totalBarres3M,
      chuteTotaleMl,
      tauxChuteGlobalPct,
    },
  };
}
