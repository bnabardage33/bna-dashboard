// Types du module calepinage détaillé — alignés sur
// supabase/migrations/20261005_calepinage_zones.sql
// Toutes les dimensions des nouvelles tables sont en millimètres.
// Isolation : chaque ligne porte `entreprise_id` (recopié depuis la zone par trigger).

import type { Database } from "@/types/supabase";

export type OpeningType = "fenetre" | "porte" | "vide";
export type Treatment = "none" | "bird-beak" | "miter" | "bevel";

/** Ligne complète de `chantier_zones` (table existante, dimensions de la zone en mètres). */
export type ChantierZone = Database["public"]["Tables"]["chantier_zones"]["Row"];

/**
 * Version allégée d'une zone pour les listes mobiles : exclut les JSONB lourds
 * (`ouvertures`, `resultats_techniques`).
 */
export type ChantierZoneResume = Pick<
  ChantierZone,
  | "id"
  | "chantier_id"
  | "entreprise_id"
  | "nom"
  | "type"
  | "largeur"
  | "hauteur_mur"
  | "hauteur_faite"
  | "materiau"
  | "created_at"
>;

/** Table `chantier_zones_ouvertures`. */
export interface Opening {
  id: string;
  zone_id: string;
  entreprise_id: string;
  type: OpeningType;
  /** Position x du coin supérieur gauche */
  x_mm: number;
  /** Position y du coin supérieur gauche */
  y_mm: number;
  width_mm: number;
  height_mm: number;
  created_at: string;
}

/** Table `chantier_zones_modules`. */
export interface Module {
  id: string;
  zone_id: string;
  entreprise_id: string;
  /** Ex : "G-001" */
  group_number: string;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  /** Module coupé en bordure */
  is_cut: boolean;
  is_rotated: boolean;
  /** Retourné sous-face */
  is_flipped: boolean;
  treatment: Treatment;
  material: string;
  created_at: string;
}

/** Table `chantier_zones_module_groups` (unique par `zone_id` + `group_number`). */
export interface ModuleGroup {
  id: string;
  zone_id: string;
  entreprise_id: string;
  /** Ex : "G-001" */
  group_number: string;
  width_mm: number;
  height_mm: number;
  is_rotated: boolean;
  is_flipped: boolean;
  treatment: Treatment;
  material: string;
  /** Nombre d'exemplaires */
  count: number;
}

/**
 * Ligne du bordereau de débit : un groupe de modules identiques à fabriquer.
 * Calculée côté serveur à partir des groupes (non stockée en base).
 */
export interface CuttingListItem {
  group_number: string;
  count: number;
  width_mm: number;
  height_mm: number;
  /** Surface TOTALE du groupe (largeur × hauteur × count), en m². */
  surface_m2: number;
  treatment: Treatment;
  material: string;
}

/** Corps de la requête POST /api/calepinage/calculer. */
export interface CalepinageCalculerRequest {
  zone_id: string;
}

/**
 * Module renvoyé par l'API : ligne persistée + `repere`, numéro de pièce du
 * moteur préfixé « P- » (ex. « P-M-01 »). `repere` n'est PAS stocké en base.
 */
export type ModuleCalcule = Module & { repere: string };

/** Statistiques du calcul renvoyées par l'API. */
export interface CalepinageStats {
  nombrePlaques: number;
  tauxChuteBrut: number;
  tauxChuteNet: number;
  joints: number;
  entraxeReelMm: number;
}

export type PercageType = "fixe" | "coulissante" | "invisible";

/** Table `chantier_zones_percages`. */
export interface Percage {
  id: string;
  module_id: string;
  zone_id: string;
  entreprise_id: string;
  /** Position X du perçage dans le panneau en mm */
  x_mm: number;
  /** Position Y du perçage dans le panneau en mm */
  y_mm: number;
  diameter_mm: number;
  type: PercageType;
  depth_mm?: number | null;
  created_at: string;
}

/** Réponse 200 de POST /api/calepinage/calculer. */
export interface CalepinageCalculerResponse {
  success: true;
  modules: ModuleCalcule[];
  groups: ModuleGroup[];
  cuttingList: CuttingListItem[];
  stats: CalepinageStats;
  percages: Percage[];
}
