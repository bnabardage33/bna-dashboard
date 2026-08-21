// lib/catalogueOuvrages.ts
// Bibliothèque standard des ouvrages et prestations de bardage & façade
// Utilisée pour pré-remplir instantanément les devis et factures.

export type CategorieOuvrage = "bardage" | "etancheite" | "habillage" | "isolation" | "installation";

export type OuvrageType = {
  id: string;
  categorie: CategorieOuvrage;
  familleLabel: string;
  designation: string;
  description: string;
  unite: "m²" | "ml" | "u" | "forfait";
  pu_ht: number;
};

export const CATALOGUE_OUVRAGES: OuvrageType[] = [
  // 1. BARDAGE & PAREMENTS
  {
    id: "hpl-trespa-8mm",
    categorie: "bardage",
    familleLabel: "Bardage HPL",
    designation: "Fourniture et pose bardage HPL Compact 8mm",
    description:
      "Panneaux stratifiés haute pression (HPL) type Trespa Meteon / Fundermax 8mm. Pose sur ossature aluminium Isolco 3000 P2 avec fixations vis laquées, entraxe max 600mm, joint creux 8mm et bande EPDM.",
    unite: "m²",
    pu_ht: 145.0,
  },
  {
    id: "bardage-bois-douglas",
    categorie: "bardage",
    familleLabel: "Bardage Bois",
    designation: "Fourniture et pose bardage bois Douglas claire-voie",
    description:
      "Lames de bardage Douglas de pays purgé d'aubier, profil claire-voie avec coupe d'onglet 15°. Pose sur double liteaunage traité classe 2, pointes inox annelées A2.",
    unite: "m²",
    pu_ht: 95.0,
  },
  {
    id: "bardage-composite-lames",
    categorie: "bardage",
    familleLabel: "Bardage Composite",
    designation: "Fourniture et pose bardage composite fibres de bois/résine",
    description:
      "Lames composites coextrudées anti-taches / UV. Pose horizontale sur ossature bois avec clips inox invisibles et jeu de dilatation 5mm.",
    unite: "m²",
    pu_ht: 120.0,
  },
  {
    id: "bardage-bac-acier",
    categorie: "bardage",
    familleLabel: "Bardage Métallique",
    designation: "Fourniture et pose bardage métallique simple peau bac acier",
    description:
      "Profil acier galvanisé prélaqué 25µm, nervuré trapézoïdal. Fixation sur ossature avec vis autoperceuses et cavaliers avec rondelles EPDM étanches.",
    unite: "m²",
    pu_ht: 65.0,
  },

  // 2. ISOLATION THERMIQUE PAR L'EXTÉRIEUR (ITE)
  {
    id: "ite-laine-roche-120mm",
    categorie: "isolation",
    familleLabel: "Isolation ITE",
    designation: "Fourniture et pose isolation laine de roche 120mm (R=3.40)",
    description:
      "Panneaux semi-rigides laine de roche incombustible (Euroclasse A1) type Rockwool Rockfaçade épaisseur 120mm, chevillés mécaniquement au support béton/maçonnerie.",
    unite: "m²",
    pu_ht: 48.0,
  },
  {
    id: "ite-laine-verre-100mm",
    categorie: "isolation",
    familleLabel: "Isolation ITE",
    designation: "Fourniture et pose isolation laine de verre 100mm (R=3.10)",
    description:
      "Panneaux semi-rigides laine de verre hydrophobe avec voile noir, fixés entre équerres Isolco avec rosaces de maintien.",
    unite: "m²",
    pu_ht: 38.0,
  },

  // 3. ÉTANCHÉITÉ, PARE-PLUIE & VENTILATION
  {
    id: "pare-pluie-hpv",
    categorie: "etancheite",
    familleLabel: "Pare-pluie & Étanchéité",
    designation: "Fourniture et pose membrane pare-pluie respirante HPV",
    description:
      "Écran pare-pluie haute perméabilité à la vapeur d'eau (type Delta-Vent S / Doerken), résistant aux UV. Pose tendue avec recouvrement 100mm et collage des lés au scotch adhésif étanche.",
    unite: "m²",
    pu_ht: 14.5,
  },
  {
    id: "grille-anti-rongeurs",
    categorie: "etancheite",
    familleLabel: "Ventilation",
    designation: "Fourniture et pose grilles anti-rongeurs et profil de ventilation",
    description:
      "Profil perforé en aluminium/acier galvanisé pour ventilation basse et haute du bardage, passage d'air continu conforme DTU 41.2.",
    unite: "ml",
    pu_ht: 18.0,
  },
  {
    id: "bande-epdm-chevrons",
    categorie: "etancheite",
    familleLabel: "Protection Ossature",
    designation: "Fourniture et agrafage bande de protection EPDM",
    description:
      "Bande élastomère EPDM noire 80mm agrafée sur 100% de la face avant des montants bois pour protection contre les ruissellements d'eau aux joints de bardage.",
    unite: "ml",
    pu_ht: 6.5,
  },

  // 4. HABILLAGES & ZINGUERIE / MÉTALLERIE
  {
    id: "angle-alu-laque",
    categorie: "habillage",
    familleLabel: "Habillages & Rives",
    designation: "Fourniture et pose profil d'angle sortant aluminium laqué",
    description:
      "Cornière d'angle en aluminium laqué plié 15/10ème, teinte RAL au choix, fixée sur ossature avec vis laquées discrètes.",
    unite: "ml",
    pu_ht: 32.0,
  },
  {
    id: "bavette-rejet-eau",
    categorie: "habillage",
    familleLabel: "Zinguerie & Bavettes",
    designation: "Fourniture et pose bavette de rejet d'eau sous menuiserie",
    description:
      "Bavette aluminium pliée avec larmier goutte d'eau, embouts latéraux d'étanchéité et joint compribande sous appui de fenêtre.",
    unite: "ml",
    pu_ht: 42.0,
  },
  {
    id: "habillage-tableau-linteau",
    categorie: "habillage",
    familleLabel: "Tableaux de fenêtres",
    designation: "Fourniture et pose habillage tableaux et linteaux aluminium",
    description:
      "Tôles aluminium laqué pliées sur mesure pour habillage complet des ébrasements de fenêtres et portes.",
    unite: "ml",
    pu_ht: 55.0,
  },
  {
    id: "couvertine-acrotere",
    categorie: "habillage",
    familleLabel: "Couvertines",
    designation: "Fourniture et pose couvertine aluminium sur acrotère",
    description:
      "Couvertine alu laqué avec pinces de fixation invisibles et éclisses d'étanchéité avec pente d'écoulement vers l'intérieur.",
    unite: "ml",
    pu_ht: 65.0,
  },

  // 5. INSTALLATION, SÉCURITÉ & REPLI
  {
    id: "echafaudage-montage-location",
    categorie: "installation",
    familleLabel: "Installation & Sécurité",
    designation: "Montage, location et démontage échafaudage de pied R408",
    description:
      "Échafaudage tubulaire en acier galvanisé conforme aux normes R408, planchers alu/bois avec trappes d'accès, plinthes et filets pare-gravats.",
    unite: "forfait",
    pu_ht: 850.0,
  },
  {
    id: "depose-ancien-bardage",
    categorie: "installation",
    familleLabel: "Démolition & Nettoyage",
    designation: "Dépose de l'ancien bardage et évacuation en décharge agréée",
    description:
      "Dépose soignée de l'ancien parement et liteaux, tri des matériaux, transport et mise en décharge agréée avec bordereau de suivi des déchets (BSD).",
    unite: "m²",
    pu_ht: 22.0,
  },
];
