// lib/metreVersPostes.ts
// Transformation PURE des résultats techniques persistés (payload metre-complet)
// vers des « postes techniques » quantifiés pour l'IA Devis.
//
// RÈGLES ABSOLUES :
//   * AUCUNE importation des moteurs métier (calculerPose / calculerCalepinage / …).
//   * Aucune règle de calcul parallèle : chaque quantité provient STRICTEMENT
//     du JSONB persisté — une valeur absente → aucun poste, JAMAIS d'estimation.
//   * Traçabilité : chaque poste conserve le zone.id d'origine, jamais fusionné
//     entre zones distinctes.
//   * Ce fichier est une transformation de données, PAS un moteur.

import type { PayloadMetreComplet, EntreeZoneMetreComplet, StatutCompletude } from "@/lib/metre-complet";
import {
  CADENCES_DEFAUT,
  calculerTempsPoseBardage,
  type CadencesTempsPose,
} from "@/lib/tempsPoseCalcul";
import type { ResultatMetre } from "@/lib/metre-serialization";

// ── Types publics ─────────────────────────────────────────────────────

export type CategoriePoste = "metrage" | "pose" | "isolant" | "calepinage" | "main_oeuvre";

export type PosteTechnique = {
  zoneId: string;
  zoneNom: string;
  categorie: CategoriePoste;
  /** Libellé descriptif pour l'appariement catalogue (ex : "Bardage HPL"). */
  libelle: string;
  /** Quantité RÉELLE persistée (> 0 obligatoire pour être un poste valide). */
  quantite: number;
  unite: string;
  /** Précisions techniques (entraxe, joint, type isolant…) — non quantitatives. */
  contexte: string[];
  /** Champs optionnels utilisés pour les postes de main-d'œuvre générés en heures. */
  puHt?: number;
  puRevient?: number;
  typeCout?: "matiere" | "main_oeuvre";
};

export interface OptionsMappingPostes {
  inclureMainOeuvre?: boolean;
  cadences?: Partial<CadencesTempsPose>;
}

export type ResultatMapping = {
  postes: PosteTechnique[];
  meta: {
    statut_completude: StatutCompletude;
    manquants: string[];
    nb_a_chiffrer: number;
  };
};

// ── Mapper interne ─────────────────────────────────────────────────────

function pushSiPositif(
  tableau: PosteTechnique[],
  base: Omit<PosteTechnique, "quantite">,
  quantite: number,
) {
  if (typeof quantite === "number" && Number.isFinite(quantite) && quantite > 0) {
    tableau.push({ ...base, quantite });
  }
}

function postesPourZone(zone: EntreeZoneMetreComplet): PosteTechnique[] {
  const postes: PosteTechnique[] = [];
  const base = { zoneId: zone.zone.id, zoneNom: zone.zone.nom };

  // ── Métrage (resultat_zone) ───────────────────────────────────────
  const m = zone.metrage;
  const c = zone.calepinage;
  if (m) {
    const isCompositeV2 = zone.zone.materiau === "lames" && (m.lamesACommander ?? 0) > 0 && (m.surfaceTheoriqueLames ?? 0) > 0;
    const isHplValid = zone.zone.materiau === "plaques" && !!c;
    
    let quantiteFacturable = m.surfaceACommander;
    let descriptionSurface = `surface nette ${m.surfaceNette} m²`;

    if (isHplValid) {
      // Raccordement HPL : La source de vérité commerciale est la surface
      // brute totale des plaques réellement achetées.
      quantiteFacturable = c.surfacePlaquesAchetesM2;
      descriptionSurface = `calepinage précis : ${c.nbPlaquesNecessaires} plaques entières (${c.tauxChutePct}% de chute)`;
    } else if (isCompositeV2) {
      // Raccordement Composite V2 : si le moteur a calculé des lames
      // la quantité facturable réelle en m² est la surfaceTheoriqueLames.
      quantiteFacturable = m.surfaceTheoriqueLames!;
      descriptionSurface = `calcul précis V2 : ${m.lamesACommander} lames`;
    }

    pushSiPositif(postes, {
      ...base,
      categorie: "metrage",
      libelle: "Bardage — surface à commander",
      unite: "m²",
      contexte: [
        descriptionSurface,
        `${m.nombreOuvertures} ouverture(s)`,
      ],
    }, quantiteFacturable);
  }

  // ── Pose (resultat_pose) ──────────────────────────────────────────
  const p = zone.pose;
  if (p) {
    // Isolant (fusion de paquets et chevilles rosaces au profit d'un forfait m² commercial)
    if (p.isolant.actif) {
      pushSiPositif(postes, {
        ...base,
        categorie: "isolant",
        libelle: `Isolant ${p.isolant.typeIsolant} ép. ${p.isolant.epaisseurMm}mm`,
        unite: "m²",
        contexte: [
          `Inclus : ${p.isolant.nbPaquetsACommander} paquets de ${p.isolant.surfacePaquetM2} m²`,
          `Fixations : ${p.isolant.nbChevillesRosaces} chevilles rosaces incluses`,
        ],
      }, p.isolant.surfaceACommanderM2);
    }

    // L'ossature métallique/bois (Équerres, Chevrons, Chevilles, Vis) n'est PAS extraite ici.
    // Elle est incluse dans le forfait m² du "Bardage" au catalogue, ce qui évite
    // la génération de dizaines de lignes "À CHIFFRER" sur le devis client.
    // Les données techniques (BOM) restent préservées dans la BDD et les plans d'atelier.

    // EPDM (Ligne facturée unitairement au ml selon le catalogue)
    pushSiPositif(postes, {
      ...base,
      categorie: "pose",
      libelle: "Bande EPDM",
      unite: "ml",
      contexte: [],
    }, p.lineaireBandeEPDMM);

    // Joint (non quantitatif — contexte pour catalogue)
    if (p.joint) {
      // Pas de poste : le joint est une information technique, pas une quantité
      // à commander. Il peut aider l'IA à apparter la bonne désignation sur
      // d'autres postes (ex : longueur de joints de rive).
    }
  }

  // Note: Le resultat_calepinage (c) est désormais fusionné dans le poste
  // "Bardage — surface à commander" pour éviter le double comptage commercial.

  return postes;
}

// ── Fonction principale ────────────────────────────────────────────────

const LIBELLES_PHASES_BARDAGE: Array<{
  cle: "ossature" | "isolation" | "bardage" | "finitions";
  libelle: string;
}> = [
  { cle: "isolation", libelle: "Main-d'œuvre — Pose Isolation ITE" },
  { cle: "ossature", libelle: "Main-d'œuvre — Pose Ossature & EPDM" },
  { cle: "bardage", libelle: "Main-d'œuvre — Pose Parement Bardage" },
  { cle: "finitions", libelle: "Main-d'œuvre — Finitions & Habillage Ouvertures" },
];

function postesMainOeuvrePourZone(
  zone: EntreeZoneMetreComplet,
  cadences: CadencesTempsPose,
): PosteTechnique[] {
  if (!zone.metrage) return [];
  const resMetre: ResultatMetre = {
    version_moteur: "1.0.0",
    calcule_le: "",
    entrees: {
      type: zone.zone.type === "pignon" ? "pignon" : "facade",
      largeur: zone.zone.largeur,
      hauteur_mur: zone.zone.hauteur_mur,
      hauteur_faite: zone.zone.hauteur_faite,
      materiau: zone.zone.materiau === "plaques" ? "plaques" : "lames",
      famille_pose:
        (zone.zone.famille_pose as ResultatMetre["entrees"]["famille_pose"]) ?? null,
      angle: false,
      largeur_lame_mm: null,
      plaque_longueur_mm: null,
      plaque_largeur_mm: null,
      module_largeur_mm: null,
      module_hauteur_mm: null,
      sens_pose:
        (zone.zone.sens_pose as ResultatMetre["entrees"]["sens_pose"]) ?? null,
      type_isolant: null,
      epaisseur_isolant_mm: null,
      surface_paquet_m2: null,
      zone_vent_rive: null,
      coef_perte_rendement: null,
      ouvertures: [],
    },
    resultat_zone: zone.metrage as ResultatMetre["resultat_zone"],
    resultat_pose: zone.pose as ResultatMetre["resultat_pose"],
    resultat_calepinage: zone.calepinage as ResultatMetre["resultat_calepinage"],
  };

  const estimation = calculerTempsPoseBardage(resMetre, { cadences });
  const postesMo: PosteTechnique[] = [];

  for (const phase of LIBELLES_PHASES_BARDAGE) {
    const heures = estimation.parPhase[phase.cle];
    if (heures > 0) {
      postesMo.push({
        zoneId: zone.zone.id,
        zoneNom: zone.zone.nom,
        categorie: "main_oeuvre",
        libelle: phase.libelle,
        quantite: heures,
        unite: "h",
        contexte: [`Zone ${zone.zone.nom}`, `Taux horaire vente ${cadences.taux_horaire_vente_ht.toFixed(2)} € HT/h`],
        puHt: cadences.taux_horaire_vente_ht,
        puRevient: cadences.taux_horaire_charge_ht,
        typeCout: "main_oeuvre",
      });
    }
  }
  return postesMo;
}

export function mapperQuantitesPersistees(
  payload: PayloadMetreComplet,
  options: OptionsMappingPostes = {},
): ResultatMapping {
  const postes: PosteTechnique[] = [];
  const cadences: CadencesTempsPose = { ...CADENCES_DEFAUT, ...options.cadences };

  for (const zone of payload.zones) {
    postes.push(...postesPourZone(zone));
    if (options.inclureMainOeuvre) {
      postes.push(...postesMainOeuvrePourZone(zone, cadences));
    }
  }

  // Zones nécessitant un chiffrage complémentaire :
  //   - zone entièrement non calculée (resultats_techniques null sur toutes les zones)
  //   - zone avec catégories manquantes (metrage/pose/calepinage manquant)
  let nb_a_chiffrer = 0;
  for (const zone of payload.zones) {
    const aManque =
      zone.metrage === null ||
      zone.pose === null ||
      (zone.zone.materiau === "plaques" && zone.calepinage === null);
    if (aManque) nb_a_chiffrer += 1;
  }

  return {
    postes,
    meta: {
      statut_completude: payload.meta.statut_completude,
      manquants: payload.meta.manquants,
      nb_a_chiffrer,
    },
  };
}