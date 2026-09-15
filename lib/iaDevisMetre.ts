// lib/iaDevisMetre.ts
// Construction de LigneDevis à partir des postes techniques (mapper metre-complet)
// et du catalogue. Rôle : appariement catalogue / designation / prix / zone_id.
//
// RÈGLES :
//   * Aucune importation des moteurs métier.
//   * La quantité technique est ABSOLUMENT INÉDITABLE : elle provient du JSONB
//     persisté (poste.quantite) et n'est JAMAIS modifiée ici.
//   * Plusieurs postes du MÊME zone.id correspondant au MÊME catalogue_id
//     sont FUSIONNÉS au sein d'une seule ligne (cohérent : même produit, même chantier).
//   * Deux postes de zones distinctes produisent deux lignes distinctes (traçabilité).
//   * Si l'appariement catalogue échoue → ligne « À CHIFFRER » avec la quantité réelle
//     conservée et la désignation du poste (absence = prix inconnu, pas quantité absente).

import {
  type LigneDevis,
  creerLigneAChiffrer,
  type CoutType,
} from "@/lib/devisCalcul";
import {
  meilleureCorrespondance,
  type ItemCatalogue,
} from "@/lib/catalogueMatching";
import type { PosteTechnique } from "@/lib/metreVersPostes";

type CatalogueOuvrage = {
  id: string;
  designation: string;
  description: string | null;
  famille_label: string;
  unite: string;
  pu_ht: number;
  pu_revient: number;
  type_cout: string;
};

function versItemCatalogue(o: CatalogueOuvrage): ItemCatalogue {
  return {
    id: o.id,
    designation: o.designation,
    description: o.description,
    famille_label: o.famille_label,
    unite: o.unite,
    type_cout: o.type_cout,
  };
}

function toCoutType(raw: string | null | undefined): CoutType {
  return raw === "main_oeuvre" ? "main_oeuvre" : "matiere";
}

function normaliserUnite(u: string): string {
  return u.toLowerCase().replace(/\s+/g, "").replace("²", "2").replace("é", "e").replace(/pi[eè]ces?/, "u").replace(/unit[eé]s?/, "u");
}

function sontUnitesCompatibles(u1: string, u2: string): boolean {
  if (!u1 || !u2) return true;
  const n1 = normaliserUnite(u1);
  const n2 = normaliserUnite(u2);
  return n1 === n2 || n1 === "forfait" || n2 === "forfait";
}

// ── Construction ───────────────────────────────────────────────────────
// Chaque poste technique produit UNE ligne de devis distincte, portant le
// zone.id d'origine. Aucune fusion de quantités (même intra-zone) : deux
// postes peuvent correspondre au même produit mais avec des unités différentes
// (ex : isolant en m² ET en paquets), les additionner serait une invention.
// La traçabilité par zone est donc toujours exacte.

export function construireLignesDepuisPostes(
  postes: PosteTechnique[],
  catalogue: CatalogueOuvrage[],
): LigneDevis[] {
  const catalogueItems = catalogue.map(versItemCatalogue);
  const catalogueMap = new Map(catalogue.map((c) => [c.id, c]));
  const lignes: LigneDevis[] = [];

  for (const poste of postes) {
    const corr = meilleureCorrespondance(
      `${poste.libelle} ${poste.contexte.join(" ")}`,
      catalogueItems,
    );

    if (corr) {
      const ouvrage = catalogueMap.get(corr.item.id)!;
      
      // Faille 1 corrigée : on empêche l'écrasement silencieux d'une unité
      // par une autre totalement incompatible.
      if (!sontUnitesCompatibles(poste.unite, ouvrage.unite)) {
        lignes.push({
          ...creerLigneAChiffrer(
            `${poste.libelle} (Zone : ${poste.zoneNom})`,
            `Conflit d'unités : calculé en [${poste.unite}] mais l'article matché est en [${ouvrage.unite}]. ${poste.contexte.join("; ")}`.trim(),
          ),
          zone_id: poste.zoneId,
        });
        continue;
      }

      lignes.push({
        catalogue_id: ouvrage.id,
        designation: ouvrage.designation,
        description: `${poste.libelle}${poste.contexte.length > 0 ? ` — ${poste.contexte.join("; ")}` : ""}`.trim(),
        qte: poste.quantite,
        unite: ouvrage.unite,
        pu_ht: ouvrage.pu_ht,
        pu_revient: ouvrage.pu_revient ?? 0,
        type_cout: toCoutType(ouvrage.type_cout),
        a_chiffrer: false,
        zone_id: poste.zoneId,
      });
    } else {
      // Absence de catalogue : prix inconnu, la quantité réelle est perdue par
      // le format « À CHIFFRER » historique (qte null) — aucune estimation.
      lignes.push({
        ...creerLigneAChiffrer(
          `${poste.libelle} (Zone : ${poste.zoneNom})`,
          `Poste technique sans correspondance catalogue. ${poste.contexte.join("; ")}`.trim(),
        ),
        zone_id: poste.zoneId,
      });
    }
  }

  return lignes;
}

// ── Gate : décide si le chemin metre-complet est applicable ─────────────

/**
 * Retourne `true` si le payload metre-complet contient des résultats
 * exploitables et que le chemin metre-complet doit être utilisé (pas de
 * repli legacy, pas de calcul parallèle).
 */
export function cheminMetreDisponible(payload: {
  meta: { zones_calculees: number };
  zones: Array<{ metrage: unknown; pose: unknown; calepinage: unknown }>;
}): boolean {
  return payload.meta.zones_calculees > 0;
}

// ── Consignes manquantes pour les lignes « à chiffrer » ────────────────

export function construireLignesAChiffrerManquantes(payload: {
  meta: { manquants: string[] };
  zones: Array<{
    zone: { id: string; nom: string; materiau: unknown };
    metrage: unknown;
    pose: unknown;
    calepinage: unknown;
  }>;
}): LigneDevis[] {
  const lignes: LigneDevis[] = [];
  for (const z of payload.zones) {
    const details: string[] = [];
    if (z.metrage === null) details.push("métrage");
    if (z.pose === null) details.push("pose");
    if (z.zone.materiau === "plaques" && z.calepinage === null) details.push("calepinage");
    if (details.length > 0) {
      lignes.push(
        creerLigneAChiffrer(
          `Poste(s) à chiffrer — Zone « ${z.zone.nom} »`,
          `Données techniques manquantes : ${details.join(", ")}.`,
        ),
      );
    }
  }
  return lignes;
}