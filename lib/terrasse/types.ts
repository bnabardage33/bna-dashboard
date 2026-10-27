// Types du domaine Métier TERRASSE — DTU 51.4
// Indépendant du domaine Bardage (chantier_zones)

export type ZoneEnvironnement = "normal" | "piscine" | "littoral" | "montagne";

export type SystemeTerrasse = "bois_vis" | "bois_clip" | "composite_clip";

export type EssenceBois =
  | "pin_cl4"
  | "douglas"
  | "meleze"
  | "cumaru"
  | "ipe"
  | "composite"
  | "bambou_thermo";

export type TypeSol =
  | "dalle_beton"
  | "terre_meuble"
  | "stabilise_grave"
  | "etancheite_toit";

export type TypePose = "parallele" | "perpendiculaire" | "diagonale";

export type TypeFixation = "vis_inox" | "clips_invisibles";

export type GradeInox = "A2" | "A4";

export type TypeLambourde = "bois_cl4" | "bois_exotique" | "alu_structure";

export type TypePlots =
  | "reglables"
  | "autonivelants"
  | "cales_plates"
  | "plots_beton"
  | "vis_fondation";

export type HauteurReglagePlots =
  | "20_30"
  | "40_60"
  | "60_90"
  | "90_150"
  | "150_260";

export type TypeGardeCorps =
  | "bois_cables"
  | "alu_verre"
  | "tout_bois"
  | "metal_barreaudage";

export type TypeReservationTerrasse =
  | "piscine"
  | "skimmer"
  | "regard"
  | "trappe"
  | "arbre"
  | "poteau"
  | "local_technique"
  | "autre";

export interface ChantierTerrasseReservation {
  id?: string;
  terrasse_id: string;
  entreprise_id?: string;
  type_reservation: TypeReservationTerrasse;
  nom: string;
  x: number;
  y: number;
  largeur?: number;
  longueur?: number;
  diametre?: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ChantierTerrasseConfig {
  id?: string;
  chantier_id: string;
  entreprise_id?: string;
  nom: string;
  systeme_terrasse?: SystemeTerrasse;
  zone_environnement?: ZoneEnvironnement;
  fabricant_composite?: string | null;
  gamme_composite?: string | null;

  // Géométrie
  longueur_m: number;
  largeur_m: number;
  hauteur_sol_cm: number;
  type_sol: TypeSol;
  pente_pct: number;

  // Lames
  essence_bois: EssenceBois;
  type_pose: TypePose;
  largeur_lame_mm: number;
  epaisseur_lame_mm: number;
  longueur_lame_m: number;
  espacement_lames_mm: number;
  type_fixation: TypeFixation;

  // Lambourdes
  type_lambourde: TypeLambourde;
  section_largeur_mm: number;
  section_hauteur_mm: number;
  longueur_lambourde_m: number;
  entraxe_lambourdes_cm: number;
  double_lambourdage_aboutage: boolean;
  bande_etancheite_epdm: boolean;
  cales_isolation: boolean;

  // Plots
  type_plots: TypePlots;
  entraxe_plots_cm: number;
  hauteur_reglage_plots: HauteurReglagePlots;
  geotextile: boolean;

  // Escaliers
  presence_escalier: boolean;
  escalier_nb_marches: number;
  escalier_largeur_m: number;
  escalier_giron_cm: number;
  escalier_hauteur_marche_cm: number;

  // Garde-corps
  presence_garde_corps: boolean;
  garde_corps_longueur_ml: number;
  garde_corps_type: TypeGardeCorps;
  garde_corps_hauteur_cm: number;

  // Pertes
  coef_perte_lames: number;
  coef_perte_lambourdes: number;

  // Sélections du catalogue Terrasse (optionnelles)
  lame_id?: string | null;
  clip_id?: string | null;
  lambourde_id?: string | null;
  plot_id?: string | null;
  quantite_accessoires?: QuantiteAccessoiresTerrasse | null;
  tarifs_catalogue?: TarifsCatalogueTerrasse | null;

  // Timestamp
  created_at?: string;
  updated_at?: string;
}

export interface QuantiteAccessoiresTerrasse {
  clip?: number;
  lambourde?: number;
  plot?: number;
  [cle: string]: number | undefined;
}

export interface TarifLameCatalogueTerrasse {
  id?: string;
  designation?: string | null;
  prix_unitaire_lame?: number | null;
  prix_m2_ht?: number | null;
}

export interface TarifAccessoireCatalogueTerrasse {
  id?: string;
  designation?: string | null;
  conditionnement?: string | null;
  prix_conditionnement?: number | null;
  unite_mesure?: string | null;
}

export interface TarifsCatalogueTerrasse {
  lame?: TarifLameCatalogueTerrasse | null;
  clip?: TarifAccessoireCatalogueTerrasse | null;
  lambourde?: TarifAccessoireCatalogueTerrasse | null;
  plot?: TarifAccessoireCatalogueTerrasse | null;
}

export type StatutControle = "conforme" | "avertissement" | "non_conforme";

export interface ControleDTU51_4 {
  id: string;
  titre: string;
  regleDtu: string;
  valeurConstatee: string;
  statut: StatutControle;
  recommandation: string;
  sourceNormative?: string;
}

export interface RapportConformiteDTU {
  statutGlobal: StatutControle;
  controles: ControleDTU51_4[];
  nbConformes: number;
  nbAvertissements: number;
  nbNonConformes: number;
}

export interface LigneChiffrageTerrasse {
  code: string;
  categorie: "Structure" | "Platelage" | "Fixation" | "Accessoires" | "Escalier" | "Garde-corps";
  designation: string;
  quantite: number;
  unite: string;
  prixUnitaireHt: number;
  totalHt: number;
}

export interface ResultatCalculTerrasse {
  surfaceBruteM2: number;
  surfaceNetteM2: number;
  perimetreM: number;

  lambourdes: {
    entraxeCm: number;
    entraxeMaxDtuCm: number;
    nbRangees: number;
    lineaireMl: number;
    lineaireAvecChutesMl: number;
    nbBarres: number;
    sectionMm: string;
    epdmMl: number;
    calesIsolationNb: number;
  };

  plots: {
    type: TypePlots;
    entraxeCm: number;
    porteeMaxAdmissibleCm: number;
    nbPlotsParLambourde: number;
    nbPlotsTotal: number;
    densiteParM2: number;
    geotextileM2: number;
    hauteurReglage?: string;
  };

  lames: {
    essence: EssenceBois;
    largeurMm: number;
    epaisseurMm: number;
    pasMm: number;
    nbLignesLames: number;
    lineaireMl: number;
    surfaceACommanderM2: number;
    nbLamesStandard: number;
    espacementRecommandeMm?: number;
    jeuAboutageMm?: number;
  };

  fixations: {
    type: TypeFixation;
    nbVisOuClipsTotal: number;
    nbBoites: number;
    clipsDepartFinNb: number;
    conditionnementBoite?: number;
    longueurVisMm?: number;
    diametreVisMm?: number;
    inoxGrade?: string;
  };

  escalier: {
    present: boolean;
    nbMarches: number;
    largeurM: number;
    gironCm: number;
    hauteurMarcheCm: number;
    conformeBlondel: boolean;
    valeurBlondelCm: number;
    lamesMarchesMl: number;
    limonsNb: number;
  };

  gardeCorps: {
    present: boolean;
    longueurMl: number;
    hauteurCm: number;
    type: TypeGardeCorps;
    nbPoteaux: number;
    conformeNorme: boolean;
  };

  conformite: RapportConformiteDTU;
  chiffrage: {
    lignes: LigneChiffrageTerrasse[];
    totalHt: number;
    prixM2Ht?: number;
  };
  calculeA: string;
}
