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
  if (m) {
    pushSiPositif(postes, {
      ...base,
      categorie: "metrage",
      libelle: "Bardage — surface à commander",
      unite: "m²",
      contexte: [
        `surface nette ${m.surfaceNette} m²`,
        `${m.nombreOuvertures} ouverture(s)`,
      ],
    }, m.surfaceACommander);
  }

  // ── Pose (resultat_pose) ──────────────────────────────────────────
  const p = zone.pose;
  if (p) {
    // Isolant (paquets + surface)
    if (p.isolant.actif) {
      pushSiPositif(postes, {
        ...base,
        categorie: "isolant",
        libelle: `Isolant ${p.isolant.typeIsolant} ép. ${p.isolant.epaisseurMm}mm`,
        unite: "m²",
        contexte: [
          `${p.isolant.nbPaquetsACommander} paquets de ${p.isolant.surfacePaquetM2} m²`,
          `+8% perte → surface à commander ${p.isolant.surfaceACommanderM2} m²`,
        ],
      }, p.isolant.surfaceACommanderM2);
      pushSiPositif(postes, {
        ...base,
        categorie: "isolant",
        libelle: `Isolant ${p.isolant.typeIsolant} — paquets`,
        unite: "paquets",
        contexte: [`surface nette ${p.isolant.surfaceNetteM2} m²`],
      }, p.isolant.nbPaquetsACommander);
    }

    // Équerres (porteuses + guides)
    const nbEquerres = (p.nbEquerresPorteuses || 0) + (p.nbEquerresGuides || 0);
    pushSiPositif(postes, {
      ...base,
      categorie: "pose",
      libelle: "Équerres",
      unite: "u",
      contexte: [
        `porteuses ${p.nbEquerresPorteuses}`,
        `guides ${p.nbEquerresGuides}`,
      ],
    }, nbEquerres);

    // Chevronnage
    pushSiPositif(postes, {
      ...base,
      categorie: "pose",
      libelle: "Chevronnage",
      unite: "ml",
      contexte: [
        `entraxe vertical ${p.entraxeVertical} m`,
        `entraxe horizontal ${p.entraxeHorizontal} m`,
      ],
    }, p.lineaireChevronsM);

    // Chevilles murales
    pushSiPositif(postes, {
      ...base,
      categorie: "pose",
      libelle: "Chevilles maçonnerie",
      unite: "u",
      contexte: [],
    }, p.nbChevillesMurales);

    // Chevilles rosaces (isolant)
    pushSiPositif(postes, {
      ...base,
      categorie: "pose",
      libelle: "Chevilles rosaces isolant",
      unite: "u",
      contexte: [],
    }, p.isolant.nbChevillesRosaces);

    // Vis
    const nbVisTotal = (p.nbVisChevronEquerre || 0) + (p.nbVisParement || 0);
    pushSiPositif(postes, {
      ...base,
      categorie: "pose",
      libelle: "Vis",
      unite: "u",
      contexte: [
        `chevron-équerre ${p.nbVisChevronEquerre}`,
        `parement ${p.nbVisParement}`,
      ],
    }, nbVisTotal);

    // EPDM
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

  // ── Calepinage (resultat_calepinage) ──────────────────────────────
  const c = zone.calepinage;
  if (c) {
    pushSiPositif(postes, {
      ...base,
      categorie: "calepinage",
      libelle: "Plaques",
      unite: "plaques",
      contexte: [
        `${c.tauxChutePct}% de chute`,
        `surface zone ${c.surfaceZoneM2} m²`,
      ],
    }, c.nbPlaquesNecessaires);
  }

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