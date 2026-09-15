// lib/metre-serialization.ts
// Couche PURE de sérialisation du métré technique.
//
// Rôle : construire le JSONB `chantier_zones.resultats_techniques` à partir des
// résultats VALIDÉS produits par les vrais moteurs (calculerZone / calculerPose /
// calculerCalepinage) et comparer de façon stable les entrées qui ont servi au calcul.
//
// Règles :
//   * AUCUN appel Supabase, aucune écriture en base ici.
//   * Aucune logique métier (calculs) déplacée ici : la base conserve le résultat,
//     les moteurs restent la source du calcul.
//   * Aucune quantité inventée : on ne sérialise que ce que les moteurs produisent.
//   * Comparaison d'entrées canonique (ordre des propriétés JSON non significatif).

import type { Zone, ConfigTechnique } from "@/components/ZoneCard";
import type { ResultatPose } from "@/lib/poseCalcul";
import type { ResultatCalepinage } from "@/lib/calepinageCalcul";
import type { calculerZone } from "@/components/ZoneCard";

/**
 * Version du moteur de calcul / de la structure sérialisée.
 * À incrémenter UNIQUEMENT si la logique de calcul ou la structure
 * de `resultats_techniques` change (permet de marquer les anciens
 * résultats comme obsolètes). La comparaison d'entrées ne dépend
 * PAS de cette valeur.
 */
export const VERSION_MOTEUR = "1.0.0";

/* ==================================================================
   TYPES — structure du JSONB `resultats_techniques`
   ================================================================== */

/** Entrées réellement utilisées par les moteurs (rien d'autre n'y figure). */
export type EntreesMetre = {
  type: "facade" | "pignon";
  largeur: number;
  hauteur_mur: number;
  hauteur_faite: number | null;
  materiau: "lames" | "plaques";
  famille_pose: "hpl" | "composite" | "bois_naturel" | "cassette" | null;
  angle: boolean;
  largeur_lame_mm: number | null;
  plaque_longueur_mm: number | null;
  plaque_largeur_mm: number | null;
  module_largeur_mm: number | null;
  module_hauteur_mm: number | null;
  sens_pose: "horizontal" | "vertical" | null;
  // NOTE : zone_vent (grille vent du chantier) a été RETIRÉ des entrées :
  // aucun moteur ne le lit (`_zoneVent` du moteur de pose est inconnu de la
  // sérialisation). Il reste disponible comme donnée brute du chantier dans
  // le payload metre-complet. zone_vent_rive, lui, est conservé (influence réelle).
  type_isolant: "laine_roche" | "laine_verre" | "sans_isolant" | null;
  epaisseur_isolant_mm: number | null;
  surface_paquet_m2: number | null;
  zone_vent_rive: boolean | null;
  coef_perte_rendement: number | null;
  // Paramètre d'optimisation (HPL)
  autoriser_rotation?: boolean | null;
  ouvertures: Array<{
    id: string;
    type: "fenetre" | "porte";
    largeur: number;
    hauteur: number;
  }>;
};

/** Instantané consolidé conservé dans `chantier_zones.resultats_techniques`. */
export type ResultatMetre = {
  version_moteur: string;
  calcule_le: string;
  entrees: EntreesMetre;
  resultat_zone: ReturnType<typeof calculerZone>;
  resultat_pose: ResultatPose | null;
  resultat_calepinage: ResultatCalepinage | null;
};

/* ==================================================================
   EXTRACTION DES ENTRÉES (source des entrées depuis une Zone)
   ================================================================== */

/**
 * Extrait depuis une zone complète les SEULS champs qui influencent les calculs.
 * Les champs de gestion (id, chantier_id, nom) sont exclus du JSONB :
 * ils n'ont aucune influence sur le résultat technique.
 *
 * La configuration isolant/coefficient provient de la config technique du
 * CHANTIER (source de vérité persistée), plus de la zone.
 *
 * Les ouvertures sont triées par id : un simple réordonnancement de la liste
 * (sans changement de contenu) ne déclenche pas de recalcul inutile.
 */
export function extraireEntrees(
  zone: Zone,
  configTechnique: ConfigTechnique,
  autoriserRotation: boolean = true
): EntreesMetre {
  const ouverturesTriees = [...zone.ouvertures]
    .map((o) => ({
      id: o.id,
      type: o.type,
      largeur: o.largeur,
      hauteur: o.hauteur,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    type: zone.type,
    largeur: zone.largeur,
    hauteur_mur: zone.hauteur_mur,
    hauteur_faite: zone.hauteur_faite ?? null,
    materiau: zone.materiau,
    famille_pose: zone.famille_pose ?? null,
    angle: zone.angle,
    largeur_lame_mm: zone.largeur_lame_mm ?? null,
    plaque_longueur_mm: zone.plaque_longueur_mm ?? null,
    plaque_largeur_mm: zone.plaque_largeur_mm ?? null,
    module_largeur_mm: zone.module_largeur_mm ?? null,
    module_hauteur_mm: zone.module_hauteur_mm ?? null,
    sens_pose: (zone.sens_pose ?? null) as "horizontal" | "vertical" | null,
    type_isolant: (configTechnique.type_isolant ?? null) as "laine_roche" | "laine_verre" | "sans_isolant" | null,
    epaisseur_isolant_mm: configTechnique.epaisseur_isolant_mm ?? null,
    surface_paquet_m2: configTechnique.surface_paquet_m2 ?? null,
    zone_vent_rive: configTechnique.zone_vent_rive ?? null,
    coef_perte_rendement: configTechnique.coef_perte_rendement ?? null,
    autoriser_rotation: zone.materiau === "plaques" ? autoriserRotation : null,
    ouvertures: ouverturesTriees,
  };
}

/* ==================================================================
   SÉRIALISATION — assemblage du JSONB
   ================================================================== */

/**
 * Construit le JSONB `resultats_techniques` d'une zone.
 *
 * PARAMÈTRES : les résultats sont FOURNIS par les vrais moteurs (calculerZone,
 * calculerPose, calculerCalepinage). Cette fonction ne recalcule rien,
 * ne recopie aucune logique métier et n'invente aucune quantité :
 * elle empaquette uniquement ce que les moteurs ont produit.
 *
 * `resultat_pose` et `resultat_calepinage` peuvent être `null` quand le moteur
 * ne peut pas tourner (ex : famille de pose non renseignée, dimensions nulles).
 */
export function serialiserResultatTechnique(
  zone: Zone,
  configTechnique: ConfigTechnique,
  resultatZone: ReturnType<typeof calculerZone>,
  resultatPose: ResultatPose | null,
  resultatCalepinage: ResultatCalepinage | null,
  autoriserRotation: boolean = true
): ResultatMetre {
  return {
    version_moteur: VERSION_MOTEUR,
    calcule_le: new Date().toISOString(),
    entrees: extraireEntrees(zone, configTechnique, autoriserRotation),
    resultat_zone: resultatZone,
    resultat_pose: resultatPose,
    resultat_calepinage: resultatCalepinage,
  };
}

/* ==================================================================
   COMPARAISON STABLE DES ENTRÉES
   ================================================================== */

/**
 * Représentation canonique déterministe d'une valeur :
 *  - propriétés d'objets triées (l'ordre d'écriture JSON est non significatif),
 *  - tableaux comparés élément par élément, dans l'ordre,
 *  - primitives comparées par représentation stricte.
 *
 * Utilisée uniquement pour comparer des entrées structurées, jamais
 * comme format de stockage.
 */
function representationCanonique(valeur: unknown): string {
  if (valeur === null) return "null";
  if (valeur === undefined) return "undefined";
  if (typeof valeur === "boolean" || typeof valeur === "number" || typeof valeur === "string") {
    return JSON.stringify(valeur);
  }
  if (Array.isArray(valeur)) {
    return `[${valeur.map(representationCanonique).join(",")}]`;
  }
  if (typeof valeur === "object") {
    const objet = valeur as Record<string, unknown>;
    const cles = Object.keys(objet).sort();
    const paires = cles.map((k) => `${k}:${representationCanonique(objet[k])}`);
    return `{${paires.join(",")}}`;
  }
  return String(valeur);
}

/**
 * Compare deux jeux d'entrées de façon structurelle (ordre des clés non
 * significatif, valeurs réellement comparées, tableaux d'ouvertures inclus).
 * Retourne `true` si les entrées sont identiques → aucun recalcul nécessaire.
 */
export function entreesIdentiques(a: EntreesMetre, b: EntreesMetre): boolean {
  return representationCanonique(a) === representationCanonique(b);
}

/**
 * Détermine si les entrées ayant servi au calcul ont changé.
 * `true` → le résultat précédent est OBSOLÈTE, il faut recalculer
 * (et donc réécrire `resultats_techniques`).
 */
export function lesEntreesOntChangent(a: EntreesMetre, b: EntreesMetre): boolean {
  return !entreesIdentiques(a, b);
}