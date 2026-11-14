// Types du domaine Métier TERRASSE — DTU 51.4
// Indépendant du domaine Bardage (chantier_zones)

import type {
  TerrasseFormeType,
  TerrassePoseMode,
  TerrasseProGeometricResult,
  TerrasseStructureMode,
  SolicitationCategory,
} from "./pro/presets-regles";

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

export type ModeTerrasseMobile = "1_plateau" | "2_demi_plateaux";
export type SensRefoulementTerrasseMobile = "gauche" | "droite" | "haut" | "bas";
export type TypeMotorisationTerrasse = "aucune" | "solaire" | "filaire";

export interface ConfigTerrasseMobile {
  active: boolean;
  mode: ModeTerrasseMobile;
  sens_refoulement: SensRefoulementTerrasseMobile;
  hauteur_chassis_alu_mm: number;           // Hauteur de réservation châssis (ex: 80 à 120 mm, défaut 100 mm)
  jeu_fonctionnel_peripherique_mm: number;  // Jeu fonctionnel de sécurité périphérique (défaut 20 mm)
  longueur_rails_sol_m?: number;            // Longueur des rails inox au sol (bassin + zone de refoulement)
  largeur_degagement_m?: number;            // Zone de dégagement nécessaire (m)
  section_profil_alu_mm?: string;           // Section des profilés châssis alu (défaut "80x40" ou "100x50")
  charge_exploitation_kn_m2?: number;       // Charge d'exploitation nominale (défaut 2.5 kN/m² selon DTU 51.4)
  motorise?: boolean;                       // Option motorisation / entraînement par crémaillère
  type_motorisation?: TypeMotorisationTerrasse; // "aucune" | "solaire" | "filaire" (défaut "aucune")
  puissance_moteur_n?: number;              // Puissance / effort de traction en Newtons (calculée automatiquement)
  essence_bois?: EssenceBois;               // Dissociation esthétique : essence/coloris du plateau mobile (défaut = identique plage fixe)
  teinte_composite?: string;                // Teinte composite si composite (ex: "anthracite", "havane", "gris_clair")
}

export interface ResultatPlateauMobile {
  active: boolean;
  mode: ModeTerrasseMobile;
  sensRefoulement: SensRefoulementTerrasseMobile;
  hauteurChassisMm: number;
  jeuPeripheriqueMm: number;
  dimensionsPlateau: {
    longueurM: number;
    largeurM: number;
    epaisseurTotaleMm: number;
    surfaceM2: number;
    poidsPropreKg: number;
    poidsTotalChargeKg: number;
    essenceBois: EssenceBois;
    teinteComposite?: string;
  };
  rails: {
    type: "rail_inox_v_sol" | "rail_inox_plat_galet_gorge";
    lineaireTotalM: number;
    nbRails: number;
    longueurUnitaireM: number;
    entraxeRailsM: number;
    zoneRefoulementM: number;
  };
  roulement: {
    nbGaletsTotal: number;
    chargeParGaletKg: number;
    diametreGaletMm: number;
    reference: string;
  };
  structureChassis: {
    lineaireProfilesAluM: number;
    sectionAluMm: string;
    nbTraverses: number;
    entraxeTraversesMm: number;
    poidsAluKg: number;
  };
  platelage: {
    surfaceLamesM2: number;
    lineaireLamesM: number;
    nbLames: number;
    visOuClipsNb: number;
  };
  motorisation: {
    active: boolean;
    typeMotorisation: TypeMotorisationTerrasse;
    nbMoteurs: number; // 1 pour 1_plateau, 2 synchronisés pour 2_demi_plateaux
    puissanceTractionTotaleN: number;
    puissanceMoteurUnitaireN: number;
    lineaireCremaillereM: number;
    barresCremaillereCount: number;
    coffretCommande: {
      type: "solaire_autonome_24v" | "filaire_230v_24v" | "aucun";
      designation: string;
      batteries?: string;
      panneauPhotovoltaiqueWp?: number;
      tensionV: number;
    };
    finsDeCourse: {
      type: "magnetique_ip68";
      nbCapteurs: number;
    };
    telecommande: {
      conformeNFP90_308: boolean;
      nbTelecommandes: number;
      description: string;
    };
  };
  plateaux: Array<{
    id: string;
    nom: string;
    xInitialM: number;
    yInitialM: number;
    longueurM: number;
    largeurM: number;
    sensOuvertureVector: { x: number; y: number };
    courseMaxM: number;
  }>;
}

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
  terrasse_mobile?: ConfigTerrasseMobile;
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

  // Options Géométriques & Structurelles Terrasse Pro (optionnelles, rétrocompatibles)
  forme_terrasse?: TerrasseFormeType;
  mode_calepinage?: TerrassePoseMode;
  mode_structure?: TerrasseStructureMode;
  categorie_sollicitation?: SolicitationCategory;
  vissage_par_dessous_bois?: boolean;
  retour1_longueur_m?: number;
  retour1_largeur_m?: number;
  retour2_longueur_m?: number;
  retour2_largeur_m?: number;

  // Terrasse Mobile coulissante sur rails au-dessus du bassin
  terrasse_mobile?: ConfigTerrasseMobile;

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
  fournituresMobile?: Record<
    string,
    {
      id?: string;
      code: string;
      designation?: string;
      unite?: string;
      pu_ht: number;
      pu_revient?: number;
    }
  >;
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
  categorie:
    | "Structure"
    | "Platelage"
    | "Fixation"
    | "Accessoires"
    | "Escalier"
    | "Garde-corps"
    | "Terrasse Mobile"
    | "Motorisation Mobile";
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
  /** Contrat géométrique, plan de coupe 1D et séparation Q_net / Q_tech / Q_appro issu du moteur Terrasse Pro */
  terrassePro?: TerrasseProGeometricResult;
  /** Sous-ensemble terrasse mobile coulissante sur rails si configurée */
  terrasseMobile?: ResultatPlateauMobile;
  calculeA: string;
}
