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

export type ContexteGammeMateriau = "standard" | "ossature";

export interface GammeLibellesContextuels {
  labelInterne: string;
  labelClient: string;
  description: string;
  prefixDevis: "Gamme" | "Classe";
}

export const GAMME_OSSATURE_CONFIG: Record<
  GammeMateriau,
  Omit<GammeLibellesContextuels, "prefixDevis">
> = {
  eco: {
    labelInterne: "Classe 2 (Sapin brut / abrité)",
    labelClient: "Classe 2",
    description: "Ossature secondaire sous abri / derrière pare-pluie étanche (EN 335)",
  },
  standard: {
    labelInterne: "Classe 3 (Pin autoclave / Douglas)",
    labelClient: "Classe 3",
    description: "Standard DTU 45.4 / 41.2 pour ossature de bardage ventilé",
  },
  premium: {
    labelInterne: "Classe 4 (Autoclave CTB-B+ / Mélèze)",
    labelClient: "Classe 4",
    description: "Recommandé pour lambourdes de terrasse, pieds de poteaux et zones humides",
  },
  prestige: {
    labelInterne: "Classe 5 / Bois exotique (Ipé, Cumaru, Alu)",
    labelClient: "Classe 5 / Exotique",
    description: "Imputrescible haute stabilité pour structures exposées et terrasses haut de gamme",
  },
};

/**
 * Retourne les libellés adaptés au contexte métier :
 * - `'standard'` : Essentiel / Classique / Premium / Signature
 * - `'ossature'` : Classe 2 / Classe 3 / Classe 4 / Classe 5 / Exotique (EN 335)
 */
export function getGammeLibellesContextuels(
  gamme: GammeMateriau,
  contexte: ContexteGammeMateriau = "standard"
): GammeLibellesContextuels {
  const g = normaliserGammeMateriau(gamme);
  if (contexte === "ossature") {
    return {
      ...GAMME_OSSATURE_CONFIG[g],
      prefixDevis: "Classe",
    };
  }
  const cfg = GAMME_MATERIAU_CONFIG[g];
  return {
    labelInterne: cfg.labelInterne,
    labelClient: cfg.labelClient,
    description: cfg.description,
    prefixDevis: "Gamme",
  };
}

/**
 * Détecte automatiquement si un article appartient à l'ossature / structure bois
 * (Ossature & Fixations Bardage, lambourdes Terrasse, poteaux/ossature bois Clôture).
 */
export function estContexteOssature(params: {
  categorie?: string | null;
  famille?: string | null;
  designation?: string | null;
  materiau?: string | null;
}): ContexteGammeMateriau {
  const cat = (params.categorie ?? "").toLowerCase();
  const fam = (params.famille ?? "").toLowerCase();
  const desig = (params.designation ?? "").toLowerCase();
  const mat = (params.materiau ?? "").toLowerCase();

  if (
    fam.includes("ossature") ||
    cat.includes("ossature") ||
    cat === "lambourde" ||
    cat === "solive" ||
    cat === "plot" ||
    (cat === "poteau" && (mat === "" || mat.includes("bois"))) ||
    /\b(ossature|lambourde|chevron|tasseau|liteau|solive|poteau\s+bois)\b/.test(desig)
  ) {
    return "ossature";
  }

  return "standard";
}

/**
 * Retourne exclusivement le libellé valorisant destiné au client (devis PDF, portail client, récapitulatifs).
 * N'affiche jamais « Bas de gamme ».
 */
export function getGammeLabelClient(
  gamme: unknown,
  contexte: ContexteGammeMateriau = "standard"
): string {
  return getGammeLibellesContextuels(normaliserGammeMateriau(gamme), contexte).labelClient;
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

/**
 * Parse un champ décimal saisi au clavier (accepte virgule ou point).
 */
export function parseNombreDecimal(valeur: string | number | null | undefined): number {
  if (typeof valeur === "number") return Number.isFinite(valeur) ? valeur : 0;
  if (typeof valeur !== "string") return 0;
  const n = parseFloat(valeur.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Calcule le Prix Unitaire HT conseillé à partir du coût de revient HT
 * et du coefficient de marge cible de la gamme.
 */
export function calculerPrixVenteDepuisRevient(
  puRevient: number,
  gamme: unknown
): number {
  if (!Number.isFinite(puRevient) || puRevient <= 0) return 0;
  const cfg = GAMME_MATERIAU_CONFIG[normaliserGammeMateriau(gamme)];
  return Number((puRevient * cfg.margeCibleDefaut).toFixed(2));
}

export interface IndicateurMargeTarif {
  gamme: GammeMateriau;
  labelClient: string;
  coef: number;
  margeEuro: number;
  margePct: number;
}

/**
 * Calcule les indicateurs de marge HT affichés dans l'onglet Tarifs.
 */
export function calculerIndicateurMargeTarif(
  puVente: number,
  puRevient: number,
  gamme: unknown,
  contexte: ContexteGammeMateriau = "standard"
): IndicateurMargeTarif {
  const gammeNorm = normaliserGammeMateriau(gamme);
  const cfg = GAMME_MATERIAU_CONFIG[gammeNorm];
  const lib = getGammeLibellesContextuels(gammeNorm, contexte);
  const margeEuro = Number((puVente - puRevient).toFixed(2));
  const margePct = puVente > 0 ? (margeEuro / puVente) * 100 : 0;
  return {
    gamme: gammeNorm,
    labelClient: lib.labelClient,
    coef: cfg.margeCibleDefaut,
    margeEuro,
    margePct,
  };
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

const RAL_HEX_MAP: Record<string, string> = {
  "1015": "#E6D690",
  "3004": "#6B1D24",
  "3005": "#5E2129",
  "3009": "#642424",
  "5008": "#2B3A42",
  "6005": "#2F4538",
  "7015": "#434750",
  "7016": "#293133",
  "7022": "#4C4A44",
  "7035": "#CBD0CC",
  "7039": "#6C6960",
  "7040": "#9DA1AA",
  "8014": "#382C1E",
  "8019": "#403A3A",
  "9005": "#0A0A0A",
  "9006": "#A5A5A5",
  "9007": "#8F8F8F",
  "9010": "#FFFFFF",
  "9016": "#F6F6F6",
};

/**
 * Retourne la couleur hexadécimale associée à un code RAL standard (ex: "RAL 7016" -> "#293133"),
 * ou `null` si le code n'est pas reconnu.
 */
export function getRalHexColor(codeRal: string | null | undefined): string | null {
  if (!codeRal) return null;
  const match = codeRal.match(/\b(\d{4})\b/);
  if (!match) return null;
  return RAL_HEX_MAP[match[1]] ?? null;
}
