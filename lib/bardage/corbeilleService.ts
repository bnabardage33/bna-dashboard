// lib/bardage/corbeilleService.ts
// Gestion sécurisée de la corbeille pour les chantiers Bardage (BNA-Dashboard)
// Harmonisé avec le système validé sur le Hub Terrasse.
// Conforme aux règles d'intégrité BTP, multi-tenant et isolation multi-métiers.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function estUuid(valeur: string | null | undefined): valeur is string {
  return typeof valeur === "string" && UUID_RE.test(valeur.trim());
}

export interface ChantierCorbeilleBardageItem {
  id: string;
  nom: string | null;
  client_id: string | null;
  adresse_chantier: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string | null;
  deleted_at: string;
  deleted_by?: string | null;
  metier_reel: string;
  clients: { nom: string; societe: string | null } | null;
  zones_count: number;
}

interface ChecklistCorbeilleMeta {
  deleted_at: string;
  deleted_by?: string | null;
  previous_statut: string;
  deleted_from: "bardage" | "terrasse";
  metier_reel: string;
}

/**
 * 1. Mise à la corbeille sécurisée (Soft Delete)
 * Ne détruit AUCUNE donnée : ni les zones de bardage, ni les devis,
 * ni les données GPS et frais d'itinéraire de la table frais_deplacement.
 * Marque le chantier statut = 'corbeille' et consigne les métadonnées de traçabilité.
 */
export async function mettreChantierBardageEnCorbeille(
  supabase: SupabaseClient<Database>,
  chantierId: string
): Promise<{ success: boolean; message: string }> {
  if (!estUuid(chantierId)) {
    throw new Error("Identifiant de chantier invalide.");
  }

  // A. Récupérer l'état actuel du chantier
  const { data: chantier, error: fetchErr } = await (supabase
    .from("chantiers") as any)
    .select("id, nom, statut, checklist, metier")
    .eq("id", chantierId)
    .single();

  if (fetchErr || !chantier) {
    throw new Error("Impossible de trouver le chantier à mettre à la corbeille.");
  }

  // B. Déterminer l'utilisateur courant pour traçabilité
  let userId: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id || null;
  } catch {
    // Session non disponible en test
  }

  const currentChecklist =
    chantier.checklist && typeof chantier.checklist === "object"
      ? (chantier.checklist as Record<string, unknown>)
      : {};

  const metierReel = chantier.metier || (currentChecklist.metier as string) || "bardage";

  const now = new Date().toISOString();
  const metaCorbeille: ChecklistCorbeilleMeta = {
    deleted_at: now,
    deleted_by: userId,
    previous_statut: chantier.statut || "prevu",
    deleted_from: "bardage",
    metier_reel: metierReel,
  };

  const updatedChecklist = {
    ...currentChecklist,
    corbeille: metaCorbeille,
  };

  // C. Mise à jour douce : statut = 'corbeille' et conservation stricte de toutes les données
  const { error: updateErr } = await (supabase
    .from("chantiers") as any)
    .update({
      statut: "corbeille",
      checklist: updatedChecklist as unknown as Json,
    })
    .eq("id", chantierId);

  if (updateErr) {
    console.error("Erreur soft delete chantier bardage:", updateErr);
    throw new Error("Erreur lors de la mise à la corbeille : " + updateErr.message);
  }

  return {
    success: true,
    message: `Le chantier "${chantier.nom || "Bardage"}" a été déplacé dans la corbeille.`,
  };
}

/**
 * 2. Restauration d'un chantier depuis la corbeille
 * Réintègre le chantier dans la liste active avec son statut précédent.
 * L'accès complet aux zones, au calepinage et aux itinéraires GPS est immédiatement rétabli.
 */
export async function restaurerChantierBardage(
  supabase: SupabaseClient<Database>,
  chantierId: string
): Promise<{ success: boolean; message: string }> {
  if (!estUuid(chantierId)) {
    throw new Error("Identifiant de chantier invalide.");
  }

  const { data: chantier, error: fetchErr } = await (supabase
    .from("chantiers") as any)
    .select("id, nom, statut, checklist")
    .eq("id", chantierId)
    .single();

  if (fetchErr || !chantier) {
    throw new Error("Chantier introuvable dans la corbeille.");
  }

  const chk =
    chantier.checklist && typeof chantier.checklist === "object"
      ? (chantier.checklist as Record<string, unknown>)
      : {};

  const corbeilleMeta = chk.corbeille as ChecklistCorbeilleMeta | undefined;
  const previousStatut = corbeilleMeta?.previous_statut || "prevu";

  // Nettoyage propre de la clé corbeille
  const restChecklist = { ...chk };
  delete restChecklist.corbeille;

  const { error: updateErr } = await (supabase
    .from("chantiers") as any)
    .update({
      statut: previousStatut,
      checklist: restChecklist as unknown as Json,
    })
    .eq("id", chantierId);

  if (updateErr) {
    console.error("Erreur restauration chantier bardage:", updateErr);
    throw new Error("Impossible de restaurer le chantier : " + updateErr.message);
  }

  return {
    success: true,
    message: `Le chantier "${chantier.nom || "Bardage"}" a été restauré dans la liste active.`,
  };
}

/**
 * 3. Suppression définitive sécurisée (Hard Delete)
 * Réservée aux actions explicites et confirmées depuis la corbeille.
 * Vérifie d'abord les contraintes comptables (factures non brouillons).
 * Supprime ensuite les dépendances dans l'ordre (frais_deplacement, zones bardage, devis, intempéries)
 * pour éviter tout blocage de clé étrangère ON DELETE RESTRICT et éliminer tout enregistrement orphelin.
 */
export async function supprimerDefinitivementChantierBardage(
  supabase: SupabaseClient<Database>,
  chantierId: string
): Promise<{ success: boolean; message: string }> {
  if (!estUuid(chantierId)) {
    throw new Error("Identifiant de chantier invalide.");
  }

  const { data: chantier, error: fetchErr } = await (supabase
    .from("chantiers") as any)
    .select("id, nom, statut, checklist, metier")
    .eq("id", chantierId)
    .single();

  if (fetchErr || !chantier) {
    throw new Error("Chantier introuvable pour suppression définitive.");
  }

  // A. Contrôle des contraintes comptables strictes (Factures émises)
  const { data: factures } = await supabase
    .from("factures")
    .select("id, numero, statut")
    .eq("chantier_id", chantierId);

  if (factures && factures.length > 0) {
    const facturesValidees = factures.filter((f) => f.statut !== "brouillon");
    if (facturesValidees.length > 0) {
      throw new Error(
        `Suppression définitive impossible : ce chantier possède ${facturesValidees.length} facture(s) légale(s) émise(s). Conformément aux obligations comptables, ce chantier doit être conservé en corbeille ou archivé.`
      );
    }
  }

  // B. Contrôle des retenues de garantie
  const { data: retenues } = await (supabase
    .from("chantier_retenues_garantie") as any)
    .select("id")
    .eq("chantier_id", chantierId);

  if (retenues && retenues.length > 0) {
    await (supabase.from("chantier_retenues_garantie") as any)
      .delete()
      .eq("chantier_id", chantierId);
  }

  // C. Purge ordonnée des données GPS et frais d'itinéraires (frais_deplacement)
  // Résout le problème historique de blocage ON DELETE RESTRICT et élimine les orphelins
  await supabase.from("frais_deplacement").delete().eq("chantier_id", chantierId);

  // D. Purge des zones de bardage et de leurs sous-éléments calepinage
  const { data: zones } = await supabase
    .from("chantier_zones")
    .select("id")
    .eq("chantier_id", chantierId);

  if (zones && zones.length > 0) {
    const zoneIds = zones.map((z) => z.id);
    await (supabase.from("chantier_zones_percages") as any).delete().in("zone_id", zoneIds);
    await (supabase.from("chantier_zones_modules") as any).delete().in("zone_id", zoneIds);
    await (supabase.from("chantier_zones_module_groups") as any).delete().in("zone_id", zoneIds);
    await (supabase.from("chantier_zones_ouvertures") as any).delete().in("zone_id", zoneIds);
    await supabase.from("chantier_zones").delete().eq("chantier_id", chantierId);
  }

  // E. Purge des rapports d'intempéries liés
  await supabase.from("rapports_intemperies").delete().eq("chantier_id", chantierId);

  // F. Purge des avancements et pointages éventuels
  await (supabase.from("avancements_chantier") as any).delete().eq("chantier_id", chantierId);
  await (supabase.from("pointages") as any).delete().eq("chantier_id", chantierId);

  // G. Purge des devis brouillons liés
  await supabase.from("devis").delete().eq("chantier_id", chantierId);

  // H. Suppression finale de la ligne racine dans chantiers
  const { error: deleteErr } = await supabase
    .from("chantiers")
    .delete()
    .eq("id", chantierId);

  if (deleteErr) {
    console.error("Erreur destruction définitive chantier bardage:", deleteErr);
    throw new Error(
      "Erreur lors de la suppression définitive : " + deleteErr.message
    );
  }

  return {
    success: true,
    message: `Le chantier "${chantier.nom || "Bardage"}" a été définitivement supprimé.`,
  };
}

/**
 * 4. Récupération des chantiers placés dans la corbeille pour l'espace Bardage
 * Cloisonnement strict : filtre uniquement les chantiers Bardage (et anciens sans terrasse).
 * Exclut formellement les chantiers terrasse.
 */
export async function recupererChantiersCorbeilleBardage(
  supabase: SupabaseClient<Database>
): Promise<ChantierCorbeilleBardageItem[]> {
  const { data, error } = (await (supabase
    .from("chantiers") as any)
    .select("*, clients(nom, societe), chantier_zones(id, nom), chantier_terrasses(id)")
    .eq("statut", "corbeille")
    .order("created_at", { ascending: false })) as {
    data: any[] | null;
    error: any;
  };

  if (error) {
    console.error("Erreur récupération corbeille bardage:", error);
    return [];
  }

  if (!data) return [];

  // Filtrage strict Bardage :
  // - Exclure les chantiers typés terrasse
  // - Exclure les chantiers disposant d'une fiche terrasse
  // - Exclure ceux marqués comme mis en corbeille depuis l'espace terrasse
  const corbeilleBardage = data.filter((c) => {
    const chk = (c.checklist && typeof c.checklist === "object" ? c.checklist : {}) as Record<string, unknown>;
    const hasTerrasse = Array.isArray(c.chantier_terrasses) && c.chantier_terrasses.length > 0;
    const isMetierTerrasse = c.metier === "terrasse" || chk.metier === "terrasse";
    const fromTerrasse = (chk.corbeille as ChecklistCorbeilleMeta | undefined)?.deleted_from === "terrasse";

    if (hasTerrasse || isMetierTerrasse || fromTerrasse) {
      return false;
    }

    const isBardageExplicite = c.metier === "bardage" || chk.metier === "bardage";
    const fromBardage = (chk.corbeille as ChecklistCorbeilleMeta | undefined)?.deleted_from === "bardage";
    const isHistoriqueSansMetier = !c.metier && !chk.metier;

    return isBardageExplicite || fromBardage || isHistoriqueSansMetier;
  });

  return corbeilleBardage.map((c) => {
    const chk = (c.checklist && typeof c.checklist === "object" ? c.checklist : {}) as Record<string, unknown>;
    const corbeilleMeta = chk.corbeille as ChecklistCorbeilleMeta | undefined;

    return {
      id: c.id,
      nom: c.nom,
      client_id: c.client_id,
      adresse_chantier: c.adresse_chantier,
      date_debut: c.date_debut,
      date_fin: c.date_fin,
      statut: c.statut,
      deleted_at: corbeilleMeta?.deleted_at || c.created_at || new Date().toISOString(),
      deleted_by: corbeilleMeta?.deleted_by || null,
      metier_reel: c.metier || (chk.metier as string) || "bardage",
      clients: c.clients as { nom: string; societe: string | null } | null,
      zones_count: Array.isArray(c.chantier_zones) ? c.chantier_zones.length : 0,
    };
  });
}
