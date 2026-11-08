// lib/bardage/pro/calepinage-decoupe.ts
// Brique 3 — Calepinage Centré, Règle Anti-Micro-Panneaux, Découpe Pignons & Optimiseur de Découpe (Nesting)

import type { PresetBardage } from "./presets-regles";
import { CONSTANTES_BARDAGE_PRO } from "./presets-regles";
import type { FacadeConfigInput, Point2D } from "./geometrie-ossature";
import { getHauteurToitPignon } from "./geometrie-ossature";

export interface PignonDetailsPro {
  hLeftMm: number;
  hRightMm: number;
  hPeakMm: number;
  cutWidthMm: number;
  cutHeightMm: number;
  includesRidge: boolean;
}

export interface PanneauPose {
  id: string;
  repere: string; // Ex : M-01 (pleine), R-01 (rive), P-01 (pignon)
  colonne: number;
  rangee: number;
  xM: number;
  yM: number;
  largeurM: number;
  hauteurM: number;
  type: "pleine" | "rive" | "pignon";
  surfaceM2: number;
  points?: Point2D[];
  pignonDetails?: PignonDetailsPro;
  plaqueIndex?: number;
  coupleAvecId?: string;
  coupleAvecRepere?: string;
  nbPointsFixes: number;
  nbPointsGlissants: number;
}

export interface PlaqueDebitPro {
  index: number;
  largeurBruteMm: number;
  longueurBruteMm: number;
  surfacePlaqueM2: number;
  pieces: {
    id: string;
    repere: string;
    xMm: number;
    yMm: number;
    largeurMm: number;
    hauteurMm: number;
    isRotated: boolean;
    isCoupled: boolean;
    coupleAvecRepere?: string;
  }[];
  surfaceUtileM2: number;
  surfaceChuteM2: number;
  tauxChutePct: number;
}

export interface CalepinageBardageProResult {
  panneaux: PanneauPose[];
  colonnesLargeursM: number[];
  rangeesHauteursM: number[];
  jointsVerticauxX: number[];
  surfaceNetteM2: number;
  lineaireRivesMl: number;
  nbPiecesPleine: number;
  nbPiecesRive: number;
  nbPiecesPignon: number;
  nbPiecesCouplees: number;
  plaquesDebit: PlaqueDebitPro[];
  surfaceBrutePlaquesM2: number;
  tauxChuteReelPct: number;
  totalChutesReemployablesM2: number;
  nbPlaquesMeresConsommees: number;
}

/**
 * Calcule le découpage centré symétriquement par rapport à l'axe de la façade
 * avec application stricte de la règle anti-micro-panneaux.
 */
export function decouperModulesCentresPro(
  largeurFacadeM: number,
  largeurModuleM: number,
  minRiveM: number
): { largeursM: number[]; rivesDecalees: boolean } {
  const W = Math.round(largeurFacadeM * 1000);
  const mod = Math.round(largeurModuleM * 1000);
  const minRiveMm = Math.round(minRiveM * 1000);

  if (W <= mod) {
    if (W < minRiveMm * 2) {
      return { largeursM: [largeurFacadeM], rivesDecalees: false };
    }
    // Mur plus petit qu'un module mais assez large : scission en 2 panneaux symétriques
    return { largeursM: [largeurFacadeM / 2, largeurFacadeM / 2], rivesDecalees: true };
  }

  // Nombre de modules entiers au centre
  let nPleins = Math.floor(W / mod);
  let resteMm = W - nPleins * mod;
  let riveMm = Math.round(resteMm / 2);

  let rivesDecalees = false;

  // Si la rive est inférieure au seuil critique minimal, on réduit d'un module plein
  // pour répartir le reste équitablement sur les deux rives (anti-micro-panneau)
  if (riveMm < minRiveMm && nPleins >= 1) {
    nPleins -= 1;
    resteMm = W - nPleins * mod;
    riveMm = Math.round(resteMm / 2);
    rivesDecalees = true;
  }

  const largeursM: number[] = [];
  if (riveMm > 0) largeursM.push(riveMm / 1000);
  for (let i = 0; i < nPleins; i++) {
    largeursM.push(largeurModuleM);
  }
  if (riveMm > 0) largeursM.push((W - (nPleins * mod + riveMm)) / 1000);

  return { largeursM, rivesDecalees };
}

/**
 * Calepinage complet et imbrication 2D dans les plaques mères
 */
export function calculerCalepinageBardagePro(
  facade: FacadeConfigInput,
  preset: PresetBardage,
  options: {
    formatPlaqueChoisi?: { longueurMm: number; largeurMm: number };
    formatLameChoisi?: { longueurM: number; largeurUtileMm: number };
    hauteurModuleForceeM?: number;
    largeurModuleForceeM?: number;
    autoriserRotation?: boolean;
    traitDeScieMm?: number;
  } = {}
): CalepinageBardageProResult {
  const W = facade.largeurM;
  const hMur = facade.hauteurMurM;
  const estPignon = facade.type === "pignon" && Boolean(facade.hauteurFaiteM && facade.hauteurFaiteM > hMur);
  const hFaite = estPignon && facade.hauteurFaiteM ? facade.hauteurFaiteM : hMur;

  const minRiveM = preset.minRiveWidthMm / 1000;
  const traitDeScie = options.traitDeScieMm ?? CONSTANTES_BARDAGE_PRO.TRAIT_DE_SCIE_MM;
  const autoriserRotation = options.autoriserRotation ?? true;

  // Format plaque mère de référence
  const formatPlaque =
    options.formatPlaqueChoisi ??
    preset.formatsPlaques?.[0] ?? { longueurMm: 3050, largeurMm: 1300 };

  const plaqueL = Math.max(formatPlaque.longueurMm, formatPlaque.largeurMm);
  const plaqueH = Math.min(formatPlaque.longueurMm, formatPlaque.largeurMm);

  // Module standard en façade
  const largeurModM = options.largeurModuleForceeM ?? (preset.typeMateriau === "panneaux_hpl" ? 1.0 : 3.0);
  const hauteurModM =
    options.hauteurModuleForceeM ??
    (preset.typeMateriau === "panneaux_hpl"
      ? 0.6
      : (options.formatLameChoisi?.largeurUtileMm ?? 160) / 1000);

  // 1. Découpage horizontal centré avec règle anti-micro-panneau
  const { largeursM: colonnesLargeursM } = decouperModulesCentresPro(W, largeurModM, minRiveM);

  // Joints verticaux correspondants
  const jointsVerticauxX: number[] = [];
  let curX = 0;
  for (let i = 0; i < colonnesLargeursM.length - 1; i++) {
    curX += colonnesLargeursM[i];
    jointsVerticauxX.push(Math.round(curX * 1000) / 1000);
  }

  // 2. Découpage vertical par rangées
  const H_total = estPignon ? hFaite : hMur;
  const nbRangees = Math.max(1, Math.ceil(H_total / hauteurModM));
  const rangeesHauteursM: number[] = [];
  for (let r = 0; r < nbRangees; r++) {
    rangeesHauteursM.push(hauteurModM);
  }

  // 3. Génération des panneaux géométriques posés
  const panneaux: PanneauPose[] = [];
  let compteurPleine = 1;
  let compteurRive = 1;
  let compteurPignon = 1;

  let yBasM = 0;
  for (let r = 0; r < nbRangees; r++) {
    const hRangee = rangeesHauteursM[r];
    const yHautM = yBasM + hRangee;
    let xColM = 0;

    for (let c = 0; c < colonnesLargeursM.length; c++) {
      const wCol = colonnesLargeursM[c];
      const xColFinM = xColM + wCol;

      if (estPignon) {
        const z1 = getHauteurToitPignon(xColM, W, hMur, hFaite);
        const z2 = getHauteurToitPignon(xColFinM, W, hMur, hFaite);
        const maxZ = Math.max(z1, z2);

        // Panneau entièrement au-dessus de la toiture : ignoré
        if (maxZ <= yBasM + 0.01) {
          xColM += wCol;
          continue;
        }

        // Panneau traversé par le rampant
        if (z1 < yHautM - 0.01 || z2 < yHautM - 0.01) {
          const hLeft = Math.max(0, Math.min(hRangee, z1 - yBasM));
          const hRight = Math.max(0, Math.min(hRangee, z2 - yBasM));
          const cutHeightM = Math.max(hLeft, hRight);

          if (cutHeightM > 0.05) {
            const hLeftMm = Math.round(hLeft * 1000);
            const hRightMm = Math.round(hRight * 1000);
            const repere = `P-${String(compteurPignon++).padStart(2, "0")}`;

            panneaux.push({
              id: `p-${r}-${c}`,
              repere,
              colonne: c,
              rangee: r,
              xM: xColM,
              yM: yBasM,
              largeurM: wCol,
              hauteurM: cutHeightM,
              type: "pignon",
              surfaceM2: Number((wCol * ((hLeft + hRight) / 2)).toFixed(3)),
              pignonDetails: {
                hLeftMm,
                hRightMm,
                hPeakMm: 0,
                cutWidthMm: Math.round(wCol * 1000),
                cutHeightMm: Math.round(cutHeightM * 1000),
                includesRidge: xColM < W / 2 && xColFinM > W / 2,
              },
              nbPointsFixes: 1, // 1 point fixe au centre du panneau
              nbPointsGlissants: Math.max(3, Math.round(wCol * cutHeightM * preset.nbFixationsM2Estime) - 1),
            });
          }
          xColM += wCol;
          continue;
        }
      }

      // Panneau rectangulaire droit standard ou de rive
      const estRive = c === 0 || c === colonnesLargeursM.length - 1;
      const type = estRive ? "rive" : "pleine";
      const repere = estRive
        ? `R-${String(compteurRive++).padStart(2, "0")}`
        : `M-${String(compteurPleine++).padStart(2, "0")}`;

      const surf = Number((wCol * hRangee).toFixed(3));
      panneaux.push({
        id: `p-${r}-${c}`,
        repere,
        colonne: c,
        rangee: r,
        xM: xColM,
        yM: yBasM,
        largeurM: wCol,
        hauteurM: hRangee,
        type,
        surfaceM2: surf,
        nbPointsFixes: 1,
        nbPointsGlissants: Math.max(3, Math.round(surf * preset.nbFixationsM2Estime) - 1),
      });

      xColM += wCol;
    }
    yBasM += hRangee;
  }

  // 4. Couplage tête-bêche des panneaux de pignon triangulaires compatibles
  const pignons = panneaux.filter((p) => p.type === "pignon" && p.pignonDetails);
  let nbPiecesCouplees = 0;
  const pairedIds = new Set<string>();

  for (let i = 0; i < pignons.length; i++) {
    const pA = pignons[i];
    if (pairedIds.has(pA.id)) continue;
    for (let j = i + 1; j < pignons.length; j++) {
      const pB = pignons[j];
      if (pairedIds.has(pB.id)) continue;

      // Appariement si même largeur de coupe (± 5 mm)
      if (
        pA.pignonDetails &&
        pB.pignonDetails &&
        Math.abs(pA.pignonDetails.cutWidthMm - pB.pignonDetails.cutWidthMm) <= 5
      ) {
        pairedIds.add(pA.id);
        pairedIds.add(pB.id);
        pA.coupleAvecId = pB.id;
        pA.coupleAvecRepere = pB.repere;
        pB.coupleAvecId = pA.id;
        pB.coupleAvecRepere = pA.repere;
        nbPiecesCouplees += 2;
        break;
      }
    }
  }

  // 5. Imbrication 2D (Nesting) dans les plaques mères
  const plaquesDebit: PlaqueDebitPro[] = [];
  const surfacePlaqueM2 = (plaqueL * plaqueH) / 1_000_000;

  type PlaqueSlot = {
    xMm: number;
    yMm: number;
    wMm: number;
    hMm: number;
  };

  const plaquesEnCours: {
    index: number;
    pieces: PlaqueDebitPro["pieces"];
    currentXMm: number;
    currentYMm: number;
    rowMaxHMm: number;
    surfaceUtileM2: number;
  }[] = [];

  const piecesADebiter = [...panneaux].sort((a, b) => b.hauteurM * b.largeurM - a.hauteurM * a.largeurM);

  for (const piece of piecesADebiter) {
    const pW = Math.round(piece.largeurM * 1000);
    const pH = Math.round(piece.hauteurM * 1000);

    let place = false;
    for (const pl of plaquesEnCours) {
      // Test orientation normale
      if (pl.currentXMm + pW <= plaqueL && pl.currentYMm + pH <= plaqueH) {
        pl.pieces.push({
          id: piece.id,
          repere: piece.repere,
          xMm: pl.currentXMm,
          yMm: pl.currentYMm,
          largeurMm: pW,
          hauteurMm: pH,
          isRotated: false,
          isCoupled: Boolean(piece.coupleAvecId),
          coupleAvecRepere: piece.coupleAvecRepere,
        });
        piece.plaqueIndex = pl.index;
        pl.currentXMm += pW + traitDeScie;
        pl.rowMaxHMm = Math.max(pl.rowMaxHMm, pH);
        pl.surfaceUtileM2 += piece.surfaceM2;
        place = true;
        break;
      }
      // Test passage à la rangée suivante
      if (pl.currentYMm + pl.rowMaxHMm + pH <= plaqueH && pW <= plaqueL) {
        pl.currentYMm += pl.rowMaxHMm + traitDeScie;
        pl.currentXMm = 0;
        pl.rowMaxHMm = pH;

        pl.pieces.push({
          id: piece.id,
          repere: piece.repere,
          xMm: pl.currentXMm,
          yMm: pl.currentYMm,
          largeurMm: pW,
          hauteurMm: pH,
          isRotated: false,
          isCoupled: Boolean(piece.coupleAvecId),
          coupleAvecRepere: piece.coupleAvecRepere,
        });
        piece.plaqueIndex = pl.index;
        pl.currentXMm += pW + traitDeScie;
        pl.surfaceUtileM2 += piece.surfaceM2;
        place = true;
        break;
      }
    }

    if (!place) {
      // Nouvelle plaque mère
      const newIdx = plaquesEnCours.length + 1;
      const pl = {
        index: newIdx,
        pieces: [
          {
            id: piece.id,
            repere: piece.repere,
            xMm: 0,
            yMm: 0,
            largeurMm: pW,
            hauteurMm: pH,
            isRotated: false,
            isCoupled: Boolean(piece.coupleAvecId),
            coupleAvecRepere: piece.coupleAvecRepere,
          },
        ],
        currentXMm: pW + traitDeScie,
        currentYMm: 0,
        rowMaxHMm: pH,
        surfaceUtileM2: piece.surfaceM2,
      };
      piece.plaqueIndex = newIdx;
      plaquesEnCours.push(pl);
    }
  }

  for (const pl of plaquesEnCours) {
    const chuteM2 = Math.max(0, surfacePlaqueM2 - pl.surfaceUtileM2);
    plaquesDebit.push({
      index: pl.index,
      largeurBruteMm: plaqueH,
      longueurBruteMm: plaqueL,
      surfacePlaqueM2,
      pieces: pl.pieces,
      surfaceUtileM2: Number(pl.surfaceUtileM2.toFixed(3)),
      surfaceChuteM2: Number(chuteM2.toFixed(3)),
      tauxChutePct: Number(((chuteM2 / surfacePlaqueM2) * 100).toFixed(1)),
    });
  }

  const surfaceNetteM2 = Number(panneaux.reduce((s, p) => s + p.surfaceM2, 0).toFixed(2));
  const lineaireRivesMl = Number((2 * (estPignon ? hFaite : hMur)).toFixed(2));
  const surfaceBrutePlaquesM2 = Number((plaquesDebit.length * surfacePlaqueM2).toFixed(2));
  const totalChutesM2 = Math.max(0, surfaceBrutePlaquesM2 - surfaceNetteM2);
  const tauxChuteReelPct = surfaceBrutePlaquesM2 > 0 ? Number(((totalChutesM2 / surfaceBrutePlaquesM2) * 100).toFixed(1)) : 0;

  return {
    panneaux,
    colonnesLargeursM,
    rangeesHauteursM,
    jointsVerticauxX,
    surfaceNetteM2,
    lineaireRivesMl,
    nbPiecesPleine: panneaux.filter((p) => p.type === "pleine").length,
    nbPiecesRive: panneaux.filter((p) => p.type === "rive").length,
    nbPiecesPignon: panneaux.filter((p) => p.type === "pignon").length,
    nbPiecesCouplees,
    plaquesDebit,
    surfaceBrutePlaquesM2,
    tauxChuteReelPct,
    totalChutesReemployablesM2: Number((totalChutesM2 * 0.45).toFixed(2)),
    nbPlaquesMeresConsommees: plaquesDebit.length,
  };
}
