// Référentiel des essences de bois pour terrasses et compatibilité DTU 51.4 / CPT 3669

import { EssenceBois } from "../types";
import { EssenceBoisDetail } from "./types";

export const ESSENCES_BOIS_DETAILS: Record<EssenceBois, EssenceBoisDetail> = {
  pin_cl4: {
    id: "pin_cl4",
    nom: "Pin Sylvestre autoclave Classe 4",
    famille: "resineux",
    classeEmploi: "cl4",
    densiteKgM3: 550,
    retraitVolumiquePct: 12.5,
    compatibleClipsInvisibles: false, // Résineux instable : clips exclus
    largeurMaxPourClipsMm: 0,
    prepercageObligatoire: false,
    ratioEntraxeEpaisseur: 20,
    guidePose: "DTU 51.4 P1-1 § 5.2.1",
  },
  douglas: {
    id: "douglas",
    nom: "Douglas hors aubier Classe 3b",
    famille: "resineux",
    classeEmploi: "cl3b",
    densiteKgM3: 580,
    retraitVolumiquePct: 11.8,
    compatibleClipsInvisibles: false,
    largeurMaxPourClipsMm: 0,
    prepercageObligatoire: false,
    ratioEntraxeEpaisseur: 20,
    guidePose: "DTU 51.4 P1-1 § 5.2.1",
  },
  meleze: {
    id: "meleze",
    nom: "Mélèze de Sibérie / Alpes Classe 3b",
    famille: "resineux",
    classeEmploi: "cl3b",
    densiteKgM3: 600,
    retraitVolumiquePct: 12.0,
    compatibleClipsInvisibles: false,
    largeurMaxPourClipsMm: 0,
    prepercageObligatoire: false,
    ratioEntraxeEpaisseur: 20,
    guidePose: "DTU 51.4 P1-1 § 5.2.1",
  },
  cumaru: {
    id: "cumaru",
    nom: "Cumaru (Bois exotique)",
    famille: "exotique_feuillu",
    classeEmploi: "cl4",
    densiteKgM3: 1050,
    retraitVolumiquePct: 14.5,
    compatibleClipsInvisibles: false, // Fort retrait tangentiel : déconseillé en clips
    largeurMaxPourClipsMm: 100,
    prepercageObligatoire: true,
    ratioEntraxeEpaisseur: 23,
    guidePose: "DTU 51.4 P1-1 § 5.2.2 & Vissage apparent obligatoire",
  },
  ipe: {
    id: "ipe",
    nom: "Ipé (Bois exotique de référence)",
    famille: "exotique_feuillu",
    classeEmploi: "cl4",
    densiteKgM3: 1050,
    retraitVolumiquePct: 9.5, // Faible retrait : très stable
    compatibleClipsInvisibles: true,
    largeurMaxPourClipsMm: 120, // Max 120 mm selon Avis Techniques B-Fix / Cobra
    prepercageObligatoire: true,
    ratioEntraxeEpaisseur: 23,
    guidePose: "DTU 51.4 et Avis Techniques de fixation invisible",
  },
  bambou_thermo: {
    id: "bambou_thermo",
    nom: "Bambou thermo-traité haute densité",
    famille: "thermo_traite",
    classeEmploi: "cl4",
    densiteKgM3: 1150,
    retraitVolumiquePct: 8.0,
    compatibleClipsInvisibles: true,
    largeurMaxPourClipsMm: 137,
    prepercageObligatoire: true,
    ratioEntraxeEpaisseur: 23,
    guidePose: "Avis Technique / DTA fabricant bambou",
  },
  composite: {
    id: "composite",
    nom: "Composite (voir sous-module dédié Composite)",
    famille: "thermo_traite",
    classeEmploi: "cl4",
    densiteKgM3: 1200,
    retraitVolumiquePct: 0.1,
    compatibleClipsInvisibles: true,
    largeurMaxPourClipsMm: 195,
    prepercageObligatoire: false,
    ratioEntraxeEpaisseur: 20,
    guidePose: "DTA CSTB GS 2.1",
  },
};

export function getEssenceBoisDetail(essence: EssenceBois): EssenceBoisDetail {
  return ESSENCES_BOIS_DETAILS[essence] || ESSENCES_BOIS_DETAILS.pin_cl4;
}
