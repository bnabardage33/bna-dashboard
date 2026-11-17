/**
 * Types centralisés pour la catégorisation de gamme matériau en 4 niveaux
 * partagés par les catalogues et moteurs de chiffrage/quantitatifs
 * (Bardage, Terrasse, Clôture).
 */

export type GammeMateriau = "eco" | "standard" | "premium" | "prestige";

export const GAMMES_MATERIAU_ORDRE: readonly GammeMateriau[] = [
  "eco",
  "standard",
  "premium",
  "prestige",
] as const;

export interface GammeMateriauConfig {
  labelInterne: string;
  labelClient: string;
  description: string;
  /** Multiplicateur de temps de pose (ex: soin de coupe, fixations invisibles) */
  coefTempsPose: number;
  /** Coefficient de marge commerciale conseillé */
  margeCibleDefaut: number;
}

export const GAMME_MATERIAU_CONFIG: Record<GammeMateriau, GammeMateriauConfig> = {
  eco: {
    labelInterne: "Éco (Bas de gamme)",
    labelClient: "Essentiel",
    description: "Fonctionnel, entretien régulier, budget optimisé",
    coefTempsPose: 1.0,
    margeCibleDefaut: 1.25,
  },
  standard: {
    labelInterne: "Standard (Neutre)",
    labelClient: "Classique",
    description: "Bon rapport qualité/prix, conforme DTU, durabilité éprouvée",
    coefTempsPose: 1.0,
    margeCibleDefaut: 1.30,
  },
  premium: {
    labelInterne: "Premium",
    labelClient: "Premium",
    description: "Haute résistance UV/mécanique, faible entretien, finitions soignées",
    coefTempsPose: 1.15,
    margeCibleDefaut: 1.35,
  },
  prestige: {
    labelInterne: "Ultra-Premium",
    labelClient: "Signature",
    description: "Matériau architectural d’exception, garantie longue durée, finitions sur-mesure",
    coefTempsPose: 1.30,
    margeCibleDefaut: 1.40,
  },
};

/**
 * Normalise toute valeur issue de la BDD ou d'anciens JSONB vers un `GammeMateriau` valide,
 * avec repli systématique sur `'standard'`.
 */
export function normaliserGammeMateriau(valeur: unknown): GammeMateriau {
  if (
    valeur === "eco" ||
    valeur === "standard" ||
    valeur === "premium" ||
    valeur === "prestige"
  ) {
    return valeur;
  }
  return "standard";
}

/**
 * Retourne exclusivement le libellé valorisant destiné au client (devis PDF, portail client, récapitulatifs).
 * N'affiche jamais « Bas de gamme ».
 */
export function getGammeLabelClient(gamme: unknown): string {
  return GAMME_MATERIAU_CONFIG[normaliserGammeMateriau(gamme)].labelClient;
}

/**
 * Classes Tailwind à fort contraste pour badge de gamme sur fond clair.
 */
export function getGammeBadgeClasses(gamme: GammeMateriau): string {
  switch (gamme) {
    case "eco":
      return "bg-slate-200 text-slate-800 border border-slate-300 font-semibold";
    case "standard":
      return "bg-blue-100 text-blue-900 border border-blue-300 font-semibold";
    case "premium":
      return "bg-amber-100 text-amber-950 border border-amber-300 font-semibold";
    case "prestige":
      return "bg-red-100 text-red-900 border border-red-300 font-semibold";
  }
}

export interface MateriauItem {
  id: string;
  designation: string;
  unite: string;
  pu_ht: number;
  pu_revient?: number | null;
  gamme_qualite: GammeMateriau;
}

export interface CatalogueOuvrage extends MateriauItem {
  categorie: string;
  famille_label: string;
  fabricant?: string | null;
  gamme?: string | null;
  fournisseur?: string | null;
  type_cout: "matiere" | "main_oeuvre";
}
