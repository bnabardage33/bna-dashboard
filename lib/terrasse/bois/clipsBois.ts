// Règles et calculs pour fixation invisible sur terrasse bois (Clips bois)
// Régit par Avis Techniques CSTB (B-Fix, Cobra, Hapax) et CPT 3669

import { EssenceBois, ZoneEnvironnement } from "../types";
import { getEssenceBoisDetail } from "./essences";

export interface VerificationClipBois {
  estEligible: boolean;
  motif?: string;
  largeurMaxAutoriseeMm: number;
  epaisseurMinAutoriseeMm: number;
  jeuTransversalRecommandeMm: number;
  inoxGrade: "A2" | "A4";
}

export function verifierEligibiliteClipBois(
  essence: EssenceBois,
  largeurLameMm: number,
  epaisseurLameMm: number,
  zone: ZoneEnvironnement = "normal"
): VerificationClipBois {
  const detail = getEssenceBoisDetail(essence);

  const inoxGrade: "A2" | "A4" =
    zone === "piscine" || zone === "littoral" ? "A4" : "A2";

  // 1. Compatibilité essence
  if (!detail.compatibleClipsInvisibles) {
    return {
      estEligible: false,
      motif: `L'essence ${detail.nom} présente une instabilité hygrométrique trop élevée. Les clips invisibles sont proscrits par le DTU 51.4 (risque d'arrachement ou tuilage). Seul le vissage apparent à 2 vis est conforme.`,
      largeurMaxAutoriseeMm: 0,
      epaisseurMinAutoriseeMm: 21,
      jeuTransversalRecommandeMm: 5,
      inoxGrade,
    };
  }

  // 2. Largeur maximale de lame (limite stricte 120 mm)
  if (largeurLameMm > detail.largeurMaxPourClipsMm) {
    return {
      estEligible: false,
      motif: `Largeur de ${largeurLameMm} mm excessive pour fixation invisible. Le DTU 51.4 et les Avis Techniques CSTB limitent les clips bois à ${detail.largeurMaxPourClipsMm} mm max pour maîtriser les contraintes de tuilage.`,
      largeurMaxAutoriseeMm: detail.largeurMaxPourClipsMm,
      epaisseurMinAutoriseeMm: 21,
      jeuTransversalRecommandeMm: 6,
      inoxGrade,
    };
  }

  // 3. Épaisseur minimale
  if (epaisseurLameMm < 20) {
    return {
      estEligible: false,
      motif: `Épaisseur de ${epaisseurLameMm} mm insuffisante (min 20-21 mm requis pour rainurage de clip).`,
      largeurMaxAutoriseeMm: detail.largeurMaxPourClipsMm,
      epaisseurMinAutoriseeMm: 21,
      jeuTransversalRecommandeMm: 6,
      inoxGrade,
    };
  }

  return {
    estEligible: true,
    largeurMaxAutoriseeMm: detail.largeurMaxPourClipsMm,
    epaisseurMinAutoriseeMm: 21,
    jeuTransversalRecommandeMm: 6,
    inoxGrade,
  };
}
