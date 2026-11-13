// lib/bardage/facadesConfig.ts
// Gestion technique et configuration dynamique des façades du Hub Bardage.

export type EtapeTechniqueId = "ossature" | "isolation" | "bardage" | "finitions";

export interface EtapeTechnique {
  id: EtapeTechniqueId;
  label: string;
}

export const ETAPES_TECHNIQUES: readonly EtapeTechnique[] = [
  { id: "ossature", label: "Pose de l'ossature" },
  { id: "isolation", label: "Pose de l'isolation" },
  { id: "bardage", label: "Pose du bardage" },
  { id: "finitions", label: "Finitions" },
] as const;

export interface FacadeConfig {
  id: string; // Clé stable (ex: "nord", "sud", "est", "ouest" ou "facade_1")
  label: string; // Libellé personnalisable (ex: "Façade rue", "Pignon Est")
}

export type EtatAvancementFacades = Record<string, Record<EtapeTechniqueId, boolean>>;

export const FACADES_SLOTS_DEFAUT = [
  { id: "nord", label1: "Façade Principale", label4: "Façade Nord", label2: "Façade Avant" },
  { id: "sud", label2: "Façade Arrière", label4: "Façade Sud" },
  { id: "est", label3: "Pignon Est", label4: "Façade Est" },
  { id: "ouest", label4: "Façade Ouest" },
] as const;

/**
 * Génère une configuration par défaut selon le nombre de façades choisi (1, 2, 3 ou 4)
 */
export function genererFacadesDefaut(nb: number): FacadeConfig[] {
  const clampNb = Math.min(4, Math.max(1, Math.round(nb))) as 1 | 2 | 3 | 4;

  if (clampNb === 1) {
    return [{ id: "nord", label: "Façade Principale" }];
  }
  if (clampNb === 2) {
    return [
      { id: "nord", label: "Façade Avant" },
      { id: "sud", label: "Façade Arrière" },
    ];
  }
  if (clampNb === 3) {
    return [
      { id: "nord", label: "Façade Avant" },
      { id: "sud", label: "Façade Arrière" },
      { id: "est", label: "Pignon" },
    ];
  }
  return [
    { id: "nord", label: "Façade Nord" },
    { id: "sud", label: "Façade Sud" },
    { id: "est", label: "Façade Est" },
    { id: "ouest", label: "Façade Ouest" },
  ];
}

/**
 * État vierge pour une façade donnée
 */
export function etapeVierge(): Record<EtapeTechniqueId, boolean> {
  return {
    ossature: false,
    isolation: false,
    bardage: false,
    finitions: false,
  };
}

/**
 * Calcul du pourcentage global d'avancement sur les seules façades actives.
 * Formule : (étapes validées sur façades actives / (nb façades actives × 4)) × 100
 */
export function calculerAvancementGlobal(
  facadesActives: FacadeConfig[],
  etat: EtatAvancementFacades
): { pourcentage: number; etapesValidees: number; totalEtapes: number } {
  if (!facadesActives || facadesActives.length === 0) {
    return { pourcentage: 0, etapesValidees: 0, totalEtapes: 0 };
  }

  const totalEtapes = facadesActives.length * 4;
  let etapesValidees = 0;

  for (const f of facadesActives) {
    const etapes = etat[f.id];
    if (etapes) {
      for (const e of ETAPES_TECHNIQUES) {
        if (etapes[e.id] === true) {
          etapesValidees++;
        }
      }
    }
  }

  const pourcentage = totalEtapes > 0 ? Math.round((etapesValidees / totalEtapes) * 100) : 0;

  return {
    pourcentage,
    etapesValidees,
    totalEtapes,
  };
}

/**
 * Détecte si la réduction du nombre de façades masquerait des étapes déjà validées.
 */
export function detecterDonneesPerdues(
  anciennesFacades: FacadeConfig[],
  nouvellesFacades: FacadeConfig[],
  etat: EtatAvancementFacades
): { aDesDonnees: boolean; facadesImpactees: string[] } {
  const nouvellesIds = new Set(nouvellesFacades.map((f) => f.id));
  const supprimees = anciennesFacades.filter((f) => !nouvellesIds.has(f.id));
  const facadesImpactees: string[] = [];

  for (const f of supprimees) {
    const etapes = etat[f.id];
    if (etapes && ETAPES_TECHNIQUES.some((e) => etapes[e.id] === true)) {
      facadesImpactees.push(f.label || f.id);
    }
  }

  return {
    aDesDonnees: facadesImpactees.length > 0,
    facadesImpactees,
  };
}

/**
 * Initialise l'état d'avancement en fusionnant les données existantes
 * et en préservant toutes les clés existantes.
 */
export function initialiserEtatAvancement(
  facades: FacadeConfig[],
  rawDetails?: Record<string, unknown> | null
): EtatAvancementFacades {
  const state: EtatAvancementFacades = {};

  // 1. Initialiser les façades configurées
  for (const f of facades) {
    state[f.id] = etapeVierge();
  }

  // 2. Fusionner les données existantes
  if (rawDetails && typeof rawDetails === "object") {
    for (const [key, val] of Object.entries(rawDetails)) {
      if (key === "facades_config" || key === "_config") continue;
      if (val && typeof val === "object") {
        const etapesRaw = val as Record<string, unknown>;
        state[key] = {
          ossature: etapesRaw.ossature === true,
          isolation: etapesRaw.isolation === true,
          bardage: etapesRaw.bardage === true,
          finitions: etapesRaw.finitions === true,
        };
      }
    }
  }

  return state;
}
