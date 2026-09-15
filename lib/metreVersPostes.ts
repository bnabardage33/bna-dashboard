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

// ── Types publics ─────────────────────────────────────────────────────

export type CategoriePoste = "metrage" | "pose" | "isolant" | "calepinage";

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
};

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

export function mapperQuantitesPersistees(payload: PayloadMetreComplet): ResultatMapping {
  const postes: PosteTechnique[] = [];

  for (const zone of payload.zones) {
    postes.push(...postesPourZone(zone));
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