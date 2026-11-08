// lib/bardage/pro/presets-regles.ts
// Brique 1 — Presets Fabricants, Règles Métier DTU 31.2 / CSTB et Paramètres de Dilatation

export type BardageTypeMateriau = "panneaux_hpl" | "lames_composite";

export type GammeFabricant =
  | "trespa_meteon"
  | "fundermax_max_exterior"
  | "rockpanel"
  | "weo_composite"
  | "silvadec_composite"
  | "generique_hpl"
  | "generique_composite";

export interface FormatPlaqueMere {
  nom: string;
  longueurMm: number;
  largeurMm: number;
  epaisseurMm: number;
  epaisseurPlaqueMm?: number;
}

export interface FormatBarreLame {
  nom: string;
  longueurM: number;
  largeurUtileMm: number;
  epaisseurMm: number;
}

export interface PresetBardage {
  gamme: GammeFabricant;
  nomCommercial: string;
  typeMateriau: BardageTypeMateriau;
  formatsPlaques?: FormatPlaqueMere[];
  formatsBarres?: FormatBarreLame[];
  entraxeChevronsMaxMm: number;
  entraxeRiveVentMm: number;
  minRiveWidthMm: number;
  jointEntrePanneauxMm: number;
  jeuDilatationLamesMm: number;
  coefDilatationMmParM: number;
  largeurChevronStandardMm: number;
  largeurChevronJointMm: number; // Chevron plus large ou double chevron au droit des joints
  fixationType: "vis_apparentes" | "vis_invisibles" | "clips_rainure";
  diametreTrouFixeMm: number;
  diametreTrouGlissantMm: number;
  diametreVisMm: number;
  nbFixationsM2Estime: number;
}

export const PRESETS_BARDAGE: Record<GammeFabricant, PresetBardage> = {
  trespa_meteon: {
    gamme: "trespa_meteon",
    nomCommercial: "Trespa Meteon HPL",
    typeMateriau: "panneaux_hpl",
    formatsPlaques: [
      { nom: "3050×1300", longueurMm: 3050, largeurMm: 1300, epaisseurMm: 8 },
      { nom: "3650×1860", longueurMm: 3650, largeurMm: 1860, epaisseurMm: 8 },
      { nom: "2550×1860", longueurMm: 2550, largeurMm: 1860, epaisseurMm: 8 },
      { nom: "4100×1300", longueurMm: 4100, largeurMm: 1300, epaisseurMm: 8 },
    ],
    entraxeChevronsMaxMm: 600,
    entraxeRiveVentMm: 450,
    minRiveWidthMm: 250,
    jointEntrePanneauxMm: 8,
    jeuDilatationLamesMm: 0,
    coefDilatationMmParM: 2.5,
    largeurChevronStandardMm: 60,
    largeurChevronJointMm: 90, // Chevron large ou double chevron sous joint vertical
    fixationType: "vis_apparentes",
    diametreTrouFixeMm: 6.0,
    diametreTrouGlissantMm: 8.5,
    diametreVisMm: 4.8,
    nbFixationsM2Estime: 15,
  },
  fundermax_max_exterior: {
    gamme: "fundermax_max_exterior",
    nomCommercial: "Fundermax Max Exterior HPL",
    typeMateriau: "panneaux_hpl",
    formatsPlaques: [
      { nom: "2800×1300", longueurMm: 2800, largeurMm: 1300, epaisseurMm: 8 },
      { nom: "4100×1300", longueurMm: 4100, largeurMm: 1300, epaisseurMm: 8 },
      { nom: "3670×1630", longueurMm: 3670, largeurMm: 1630, epaisseurMm: 8 },
      { nom: "4100×1854", longueurMm: 4100, largeurMm: 1854, epaisseurMm: 8 },
    ],
    entraxeChevronsMaxMm: 600,
    entraxeRiveVentMm: 450,
    minRiveWidthMm: 250,
    jointEntrePanneauxMm: 8,
    jeuDilatationLamesMm: 0,
    coefDilatationMmParM: 2.5,
    largeurChevronStandardMm: 60,
    largeurChevronJointMm: 100,
    fixationType: "vis_apparentes",
    diametreTrouFixeMm: 6.0,
    diametreTrouGlissantMm: 8.5,
    diametreVisMm: 4.8,
    nbFixationsM2Estime: 15,
  },
  rockpanel: {
    gamme: "rockpanel",
    nomCommercial: "Rockpanel Laine de Roche Haute Densité",
    typeMateriau: "panneaux_hpl",
    formatsPlaques: [
      { nom: "2500×1200", longueurMm: 2500, largeurMm: 1200, epaisseurMm: 8 },
      { nom: "3050×1200", longueurMm: 3050, largeurMm: 1200, epaisseurMm: 8 },
    ],
    entraxeChevronsMaxMm: 600,
    entraxeRiveVentMm: 400,
    minRiveWidthMm: 200,
    jointEntrePanneauxMm: 6,
    jeuDilatationLamesMm: 0,
    coefDilatationMmParM: 1.5,
    largeurChevronStandardMm: 50,
    largeurChevronJointMm: 80,
    fixationType: "vis_apparentes",
    diametreTrouFixeMm: 5.5,
    diametreTrouGlissantMm: 8.0,
    diametreVisMm: 4.5,
    nbFixationsM2Estime: 16,
  },
  weo_composite: {
    gamme: "weo_composite",
    nomCommercial: "WEO Composite Coextrudé",
    typeMateriau: "lames_composite",
    formatsBarres: [
      { nom: "3600×170", longueurM: 3.6, largeurUtileMm: 160, epaisseurMm: 13 },
      { nom: "4000×170", longueurM: 4.0, largeurUtileMm: 160, epaisseurMm: 13 },
    ],
    entraxeChevronsMaxMm: 400,
    entraxeRiveVentMm: 300,
    minRiveWidthMm: 150,
    jointEntrePanneauxMm: 0,
    jeuDilatationLamesMm: 4,
    coefDilatationMmParM: 1.2,
    largeurChevronStandardMm: 50,
    largeurChevronJointMm: 70,
    fixationType: "clips_rainure",
    diametreTrouFixeMm: 0,
    diametreTrouGlissantMm: 0,
    diametreVisMm: 4.2,
    nbFixationsM2Estime: 18,
  },
  silvadec_composite: {
    gamme: "silvadec_composite",
    nomCommercial: "Silvadec Lames Composite Atmosphère",
    typeMateriau: "lames_composite",
    formatsBarres: [
      { nom: "3600×160", longueurM: 3.6, largeurUtileMm: 150, epaisseurMm: 18 },
      { nom: "4000×160", longueurM: 4.0, largeurUtileMm: 150, epaisseurMm: 18 },
    ],
    entraxeChevronsMaxMm: 400,
    entraxeRiveVentMm: 300,
    minRiveWidthMm: 150,
    jointEntrePanneauxMm: 0,
    jeuDilatationLamesMm: 5,
    coefDilatationMmParM: 1.5,
    largeurChevronStandardMm: 50,
    largeurChevronJointMm: 70,
    fixationType: "clips_rainure",
    diametreTrouFixeMm: 0,
    diametreTrouGlissantMm: 0,
    diametreVisMm: 4.2,
    nbFixationsM2Estime: 18,
  },
  generique_hpl: {
    gamme: "generique_hpl",
    nomCommercial: "Panneaux HPL Générique",
    typeMateriau: "panneaux_hpl",
    formatsPlaques: [
      { nom: "3050×1300", longueurMm: 3050, largeurMm: 1300, epaisseurMm: 8 },
      { nom: "2800×1300", longueurMm: 2800, largeurMm: 1300, epaisseurMm: 8 },
    ],
    entraxeChevronsMaxMm: 600,
    entraxeRiveVentMm: 450,
    minRiveWidthMm: 250,
    jointEntrePanneauxMm: 8,
    jeuDilatationLamesMm: 0,
    coefDilatationMmParM: 2.5,
    largeurChevronStandardMm: 60,
    largeurChevronJointMm: 90,
    fixationType: "vis_apparentes",
    diametreTrouFixeMm: 6.0,
    diametreTrouGlissantMm: 8.5,
    diametreVisMm: 4.8,
    nbFixationsM2Estime: 15,
  },
  generique_composite: {
    gamme: "generique_composite",
    nomCommercial: "Lames Composite Générique",
    typeMateriau: "lames_composite",
    formatsBarres: [
      { nom: "3600×150", longueurM: 3.6, largeurUtileMm: 150, epaisseurMm: 15 },
    ],
    entraxeChevronsMaxMm: 400,
    entraxeRiveVentMm: 300,
    minRiveWidthMm: 150,
    jointEntrePanneauxMm: 0,
    jeuDilatationLamesMm: 4,
    coefDilatationMmParM: 1.3,
    largeurChevronStandardMm: 50,
    largeurChevronJointMm: 70,
    fixationType: "clips_rainure",
    diametreTrouFixeMm: 0,
    diametreTrouGlissantMm: 0,
    diametreVisMm: 4.2,
    nbFixationsM2Estime: 18,
  },
};

export const CONSTANTES_BARDAGE_PRO = {
  TRAIT_DE_SCIE_MM: 3,
  PURGE_EN_BOUT_MM: 15,
  GARDE_SOL_DTU_MM: 150, // 150 mm minimum par rapport au sol fini (DTU 31.2)
  GARDE_VENTILATION_HAUTE_MM: 30, // Grille de ventilation haute
  MARGE_APPROVISIONNEMENT_DEFAUT_PCT: 4.0, // +4% de marge de tri / chantier
  EPAISSEUR_LAME_AIR_VENTILATION_MIN_MM: 20, // 20 mm minimum selon DTU 31.2
} as const;

export function resoudrePresetBardage(gamme: GammeFabricant): PresetBardage {
  return PRESETS_BARDAGE[gamme] ?? PRESETS_BARDAGE.generique_hpl;
}
