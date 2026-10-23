// lib/metiers/registry.ts
//
// REGISTRE CENTRAL DES MÉTIERS — SOCLE MULTI-MÉTIER (ÉTAPE 1A)
// ============================================================
//
// Module PUR (aucune dépendance serveur ni DOM) : importable aussi bien depuis
// les routes API Next.js que depuis les composants clients et les hooks.
//
// Décisions métier structurantes encodées ici :
//   1. Bardage ("BARDAGE") et Terrasse ("TERRASSE") sont deux métiers distincts.
//   2. Un chantier appartient à un seul métier (`MetierCode`).
//   3. Un même client peut posséder plusieurs chantiers de métiers différents.
//   4. La numérotation des devis/factures/situations est commune à l'entreprise ;
//      le métier est affiché sur chaque document.
//   5. Le stock est filtrable par métier (`ScopeStockMetier`) avec une vue consolidée.

import type { CatalogueType, NatureCout } from "@/components/catalogue/types";
import {
  MATERIAU_STRUCTUREL_DEFAUT,
  MOYEN_ACCES_DEFAUT,
  ZONE_VENT_DEFAUT,
} from "@/lib/chantierDefaults";

/** Liste canonique et ordonnée des codes métiers actifs. */
export const METIERS_CODES = ["BARDAGE", "TERRASSE"] as const;

/** Identifiant strict d'un métier de l'entreprise. */
export type MetierCode = (typeof METIERS_CODES)[number];

/** Métier appliqué par défaut lorsqu'aucune qualification explicite n'est fournie. */
export const METIER_DEFAUT: MetierCode = "BARDAGE";

/** Périmètre de filtrage dans les vues transverses (Finance, Chantiers, Stock, Direction). */
export type FiltreMetier = MetierCode | "TOUS";

/** Affectation d'un article de stock (spécifique à un métier ou partagé entre métiers). */
export type ScopeStockMetier = MetierCode | "COMMUN";

/** Clés des phases de main-d'œuvre pour le métier Bardage (alignées sur `lib/mainOeuvreAnalytique.ts`). */
export type PhaseMainOeuvreBardage =
  | "ossature"
  | "isolation"
  | "bardage"
  | "finitions"
  | "general";

/** Clés des phases de main-d'œuvre pour le métier Terrasse. */
export type PhaseMainOeuvreTerrasse =
  | "preparation_support"
  | "structure_plots_lambourdes"
  | "platelage_lames"
  | "finitions_accessoires"
  | "general";

/** Union des clés de phases de main-d'œuvre tous métiers confondus. */
export type PhaseMainOeuvreKey = PhaseMainOeuvreBardage | PhaseMainOeuvreTerrasse;

/** Définition d'une phase analytique de main-d'œuvre. */
export interface PhaseMainOeuvreConfig<K extends string = PhaseMainOeuvreKey> {
  readonly key: K;
  readonly label: string;
  readonly nomAffichage: string;
  /** Termes permettant de rattacher automatiquement une ligne de devis main-d'œuvre à cette phase. */
  readonly motsClesDetection: readonly string[];
}

/** Identité visuelle d'un espace métier dans l'interface et sur les documents PDF. */
export interface IdentiteVisuelleMetier {
  /** Nom d'icône Lucide de référence. */
  readonly icone: string;
  readonly emoji: string;
  /** Couleur hexadécimale principale (badges, graphiques consolidés, PDF). */
  readonly accentHex: string;
  /** Classes Tailwind standards pour un badge métier. */
  readonly badgeClasses: string;
}

/** Outil technique ou calculateur rattaché à un espace métier. */
export interface OutilMetierConfig {
  readonly id: string;
  readonly libelle: string;
  readonly description: string;
  readonly route: string;
}

/** Tables Supabase de catalogue utilisées par les métiers. */
export type TableCatalogueSupabase =
  | "catalogue_ouvrages"
  | "catalogue_ouvrages_prix"
  | "catalogue_temps"
  | "catalogue_terrasse_lames"
  | "catalogue_terrasse_accessoires";

/** Configuration du catalogue associé à un métier. */
export interface CatalogueMetierConfig {
  readonly routeBureau: string;
  readonly typesFormulaires: readonly CatalogueType[];
  readonly tablesSupabase: readonly TableCatalogueSupabase[];
  readonly naturesCoutSupportees: readonly NatureCout[];
}

/** Onglets techniques spécifiques pouvant être activés sur une fiche chantier. */
export type OngletTechniqueChantier = "metres" | "terrasse";

/** Configuration opérationnelle des chantiers et fonctionnalités d'un métier. */
export interface FonctionnalitesMetierConfig {
  readonly routeListeChantiers: string;
  readonly ongletsTechniquesChantier: readonly OngletTechniqueChantier[];
  readonly clesChecklistChantier: readonly string[];
  readonly libelleCreationChantier: string;
  readonly valeursDefautChantier: {
    readonly materiau_structurel: string;
    readonly moyen_acces: string;
    readonly zone_vent: number;
  };
}

/** Règles transverses validées pour les documents commerciaux et le stock. */
export interface ReglesTransversesMetier {
  /** Séquence de numérotation partagée au niveau de l'entreprise (DEV-YYYY-### / FAC-YYYY-###). */
  readonly numerotationCommuneEntreprise: true;
  /** Obligation d'afficher le métier sur les devis, factures, situations et PDF. */
  readonly afficherMetierSurDocuments: true;
  /** Le stock est filtrable sur ce métier et agrégé dans la vue consolidée. */
  readonly stockFiltrableEtConsolide: true;
}

/** Contrat complet d'un métier dans le registre central. */
export interface MetierConfig<M extends MetierCode = MetierCode> {
  readonly code: M;
  readonly slug: Lowercase<M>;
  readonly libelle: string;
  readonly libelleCourt: string;
  readonly libelleDocument: string;
  readonly description: string;
  readonly normeReference: string;
  readonly identiteVisuelle: IdentiteVisuelleMetier;
  readonly phasesMainOeuvre: readonly PhaseMainOeuvreConfig[];
  readonly outils: readonly OutilMetierConfig[];
  readonly fonctionnalites: FonctionnalitesMetierConfig;
  readonly catalogue: CatalogueMetierConfig;
  readonly reglesTransverses: ReglesTransversesMetier;
}

const REGLES_TRANSVERSES_COMMUNES: ReglesTransversesMetier = {
  numerotationCommuneEntreprise: true,
  afficherMetierSurDocuments: true,
  stockFiltrableEtConsolide: true,
};

/**
 * Phases de main-d'œuvre Bardage — strictement alignées sur les clés et libellés
 * existants de `lib/mainOeuvreAnalytique.ts` pour garantir zéro régression.
 */
export const PHASES_MAIN_OEUVRE_BARDAGE: readonly PhaseMainOeuvreConfig<PhaseMainOeuvreBardage>[] = [
  {
    key: "ossature",
    label: "Ossature",
    nomAffichage: "🏗️ Ossature",
    motsClesDetection: ["ossature", "tasseau", "liteau", "chevron", "equerre", "rail"],
  },
  {
    key: "isolation",
    label: "Isolation & Étanchéité",
    nomAffichage: "🌡️ Isolation",
    motsClesDetection: ["isol", "pare-pluie", "laine", "membrane"],
  },
  {
    key: "bardage",
    label: "Pose Bardage",
    nomAffichage: "🪵 Bardage",
    motsClesDetection: ["bardage", "lame", "composite", "claire-voie", "panneau", "cassette", "clin"],
  },
  {
    key: "finitions",
    label: "Finitions & Pliages",
    nomAffichage: "✨ Finitions",
    motsClesDetection: ["finition", "profil", "angle", "encadrement", "pliage", "bavette", "couvertine"],
  },
  {
    key: "general",
    label: "Général & Installation",
    nomAffichage: "📁 Général",
    motsClesDetection: [],
  },
] as const;

/**
 * Phases de main-d'œuvre Terrasse — adaptées au cycle d'exécution DTU 51.4.
 */
export const PHASES_MAIN_OEUVRE_TERRASSE: readonly PhaseMainOeuvreConfig<PhaseMainOeuvreTerrasse>[] = [
  {
    key: "preparation_support",
    label: "Préparation du support",
    nomAffichage: "🪨 Support & Géotextile",
    motsClesDetection: ["support", "geotextile", "géotextile", "terrassement", "décaissement", "gravier", "dalle"],
  },
  {
    key: "structure_plots_lambourdes",
    label: "Plots & Lambourdage",
    nomAffichage: "🧱 Plots & Lambourdes",
    motsClesDetection: ["plot", "lambourde", "solive", "structure", "calage", "bande bitumeuse"],
  },
  {
    key: "platelage_lames",
    label: "Pose du platelage",
    nomAffichage: "🪵 Platelage & Lames",
    motsClesDetection: ["platelage", "lame", "terrasse", "clip", "vissage"],
  },
  {
    key: "finitions_accessoires",
    label: "Finitions, Rives & Escaliers",
    nomAffichage: "✨ Finitions & Habillages",
    motsClesDetection: ["finition", "rive", "plinthe", "escalier", "marche", "garde-corps", "trappe"],
  },
  {
    key: "general",
    label: "Général & Manutention",
    nomAffichage: "📁 Général",
    motsClesDetection: [],
  },
] as const;

/** Registre central immuable indexé par `MetierCode`. */
export const METIERS_REGISTRY: { readonly [K in MetierCode]: MetierConfig<K> } = {
  BARDAGE: {
    code: "BARDAGE",
    slug: "bardage",
    libelle: "Bardage métallique & Façades",
    libelleCourt: "Bardage",
    libelleDocument: "Métier : Bardage & Façades",
    description:
      "Travaux d'enveloppe du bâtiment, ossature secondaire, isolation thermique par l'extérieur (ITE) et pose de bardage bois, composite, HPL ou métallique.",
    normeReference: "DTU 41.2 / DTU 45.4 / Eurocode 1",
    identiteVisuelle: {
      icone: "Building2",
      emoji: "🏢",
      accentHex: "#3b82f6",
      badgeClasses: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    },
    phasesMainOeuvre: PHASES_MAIN_OEUVRE_BARDAGE,
    outils: [
      {
        id: "calepinage-facade",
        libelle: "Calepinage 2D/3D Façades",
        description: "Dessin des zones de façade, ouvertures, modules et perçages.",
        route: "/calepinage",
      },
      {
        id: "metre-ia-facade",
        libelle: "Métré IA Façade",
        description: "Estimation de surface nette et d'ouvertures par analyse photo.",
        route: "/terrain/metre-ia",
      },
      {
        id: "fiche-technique-bardage",
        libelle: "Fiche Technique & Pose Composite",
        description: "Abaques d'entraxes, simulation de découpe pignon/façade et points singuliers.",
        route: "/terrain/fiche-technique",
      },
      {
        id: "outils-calcul-bardage",
        libelle: "Calculateurs Bardage & Fixations",
        description: "Calcul rapide de surface de clins, tasseaux et densité de fixations.",
        route: "/terrain/outils",
      },
    ],
    fonctionnalites: {
      routeListeChantiers: "/terrain/chantier",
      ongletsTechniquesChantier: ["metres"],
      clesChecklistChantier: ["tasseaux", "pare_pluie", "pose", "finition"],
      libelleCreationChantier: "Nouveau Chantier de Bardage",
      valeursDefautChantier: {
        materiau_structurel: MATERIAU_STRUCTUREL_DEFAUT,
        moyen_acces: MOYEN_ACCES_DEFAUT,
        zone_vent: ZONE_VENT_DEFAUT,
      },
    },
    catalogue: {
      routeBureau: "/bureau/catalogue",
      typesFormulaires: ["BARDAGE"],
      tablesSupabase: ["catalogue_ouvrages", "catalogue_ouvrages_prix", "catalogue_temps"],
      naturesCoutSupportees: ["matiere", "main_oeuvre"],
    },
    reglesTransverses: REGLES_TRANSVERSES_COMMUNES,
  },

  TERRASSE: {
    code: "TERRASSE",
    slug: "terrasse",
    libelle: "Terrasse Bois & Composite",
    libelleCourt: "Terrasse",
    libelleDocument: "Métier : Terrasse (DTU 51.4)",
    description:
      "Conception, dimensionnement et pose de platelages extérieurs en bois naturel ou composite sur plots réglables, lambourdes et solives selon le DTU 51.4.",
    normeReference: "NF DTU 51.4",
    identiteVisuelle: {
      icone: "Layers",
      emoji: "🪵",
      accentHex: "#f59e0b",
      badgeClasses: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    },
    phasesMainOeuvre: PHASES_MAIN_OEUVRE_TERRASSE,
    outils: [
      {
        id: "calculateur-terrasse-dtu514",
        libelle: "Bureau d'Études Terrasse DTU 51.4",
        description: "Dimensionnement lambourdes, plots, lames, réservations, plan 2D/3D et quantitatif.",
        route: "/terrain/chantier",
      },
    ],
    fonctionnalites: {
      routeListeChantiers: "/terrain/chantier",
      ongletsTechniquesChantier: ["terrasse"],
      clesChecklistChantier: ["support_plots", "structure_lambourdes", "platelage", "finition"],
      libelleCreationChantier: "Nouveau Chantier de Terrasse",
      valeursDefautChantier: {
        materiau_structurel: MATERIAU_STRUCTUREL_DEFAUT,
        moyen_acces: MOYEN_ACCES_DEFAUT,
        zone_vent: ZONE_VENT_DEFAUT,
      },
    },
    catalogue: {
      routeBureau: "/bureau/catalogue-terrasse",
      typesFormulaires: ["TERRASSE_LAME", "TERRASSE_ACCESSOIRE"],
      tablesSupabase: ["catalogue_terrasse_lames", "catalogue_terrasse_accessoires"],
      naturesCoutSupportees: ["matiere", "main_oeuvre"],
    },
    reglesTransverses: REGLES_TRANSVERSES_COMMUNES,
  },
} as const;

/**
 * Garde de type stricte : vérifie si une valeur inconnue est un `MetierCode` valide (`"BARDAGE"` | `"TERRASSE"`).
 */
export function estMetierCode(valeur: unknown): valeur is MetierCode {
  return (
    typeof valeur === "string" &&
    (METIERS_CODES as readonly string[]).includes(valeur)
  );
}

/**
 * Garde de type pour les filtres de vues consolidées (`"BARDAGE"` | `"TERRASSE"` | `"TOUS"`).
 */
export function estFiltreMetier(valeur: unknown): valeur is FiltreMetier {
  return valeur === "TOUS" || estMetierCode(valeur);
}

/**
 * Garde de type pour le périmètre métier d'un article de stock (`"BARDAGE"` | `"TERRASSE"` | `"COMMUN"`).
 */
export function estScopeStockMetier(valeur: unknown): valeur is ScopeStockMetier {
  return valeur === "COMMUN" || estMetierCode(valeur);
}

/**
 * Normalise une entrée externe (paramètre d'URL, colonne nullable en transition)
 * vers un `MetierCode` garanti valide, avec repli sur `fallback` (`"BARDAGE"` par défaut).
 */
export function resoudreMetierCode(
  valeur: unknown,
  fallback: MetierCode = METIER_DEFAUT
): MetierCode {
  if (typeof valeur === "string") {
    const normalise = valeur.trim().toUpperCase();
    if (estMetierCode(normalise)) {
      return normalise;
    }
  }
  return fallback;
}

/**
 * Retourne la configuration complète du métier demandé.
 */
export function getMetierConfig<M extends MetierCode>(metier: M): MetierConfig<M> {
  return METIERS_REGISTRY[metier];
}

/**
 * Retourne la liste ordonnée des configurations de tous les métiers déclarés.
 */
export function listerMetiers(): readonly MetierConfig[] {
  return METIERS_CODES.map((code) => METIERS_REGISTRY[code]);
}

/**
 * Associe un discriminant de formulaire catalogue (`CatalogueType`) à son métier propriétaire.
 */
export function getMetierParCatalogueType(type: CatalogueType): MetierCode {
  switch (type) {
    case "BARDAGE":
      return "BARDAGE";
    case "TERRASSE_LAME":
    case "TERRASSE_ACCESSOIRE":
      return "TERRASSE";
  }
}

/**
 * Retourne les phases analytiques de main-d'œuvre propres au métier indiqué.
 */
export function getPhasesMainOeuvre(
  metier: MetierCode
): readonly PhaseMainOeuvreConfig[] {
  return METIERS_REGISTRY[metier].phasesMainOeuvre;
}

/**
 * Construit l'objet de checklist initiale (`Record<string, boolean>`) pour un nouveau chantier du métier donné.
 */
export function creerChecklistChantierInitiale(
  metier: MetierCode
): Record<string, boolean> {
  const cles = METIERS_REGISTRY[metier].fonctionnalites.clesChecklistChantier;
  const checklist: Record<string, boolean> = {};
  for (const cle of cles) {
    checklist[cle] = false;
  }
  return checklist;
}
