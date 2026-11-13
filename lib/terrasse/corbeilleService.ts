// lib/terrasse/corbeilleService.ts
// Gestion sécurisée de la corbeille pour les chantiers Terrasse (BNA-Dashboard)
// Conforme aux règles d'intégrité BTP, multi-tenant et isolation multi-métiers.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function estUuid(valeur: string | null | undefined): valeur is string {
  return typeof valeur === "string" && UUID_RE.test(valeur.trim());
}

export interface ChantierCorbeilleItem {
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
  terrasse_count: number;
}

interface ChecklistCorbeilleMeta {
  deleted_at: string;
  deleted_by?: string | null;
  previous_statut: string;
  deleted_from: "terrasse";
  metier_reel: string;
}

/**
 * 1. Mise à la corbeille sécurisée (Soft Delete)
 * Ne détruit aucune donnée. Marque le chantier comme placé dans la corbeille
 * tout en conservant intégralement sa fiche technique, son calepinage et ses liaisons.
 */
export async function mettreChantierTerrasseEnCorbeille(
  supabase: SupabaseClient<Database>,
  chantierId: string
): Promise<{ success: boolean; message: string }> {
  if (!estUuid(chantierId)) {
    throw new Error("Identifiant de chantier invalide.");
  }

  // A. Récupérer l'état actuel du chantier
  const { data: chantier, error: fetchErr } = await supabase
    .from("chantiers")
    .select("id, nom, statut, checklist")
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
    // Session non disponible, traçabilité anonyme tolérée en mode test
  }

  const currentChecklist =
    chantier.checklist && typeof chantier.checklist === "object"
      ? (chantier.checklist as Record<string, unknown>)
      : {};

  const metierReel =
    ((chantier as unknown as { metier?: string }).metier) ||
    (currentChecklist.metier as string) ||
    "terrasse";

  const now = new Date().toISOString();
  const metaCorbeille: ChecklistCorbeilleMeta = {
    deleted_at: now,
    deleted_by: userId,
    previous_statut: chantier.statut || "prevu",
    deleted_from: "terrasse",
    metier_reel: metierReel,
  };

  const updatedChecklist = {
    ...currentChecklist,
    corbeille: metaCorbeille,
  };

  // C. Mise à jour douce : statut = 'corbeille' et métadonnées dans checklist
  const { error: updateErr } = await supabase
    .from("chantiers")
    .update({
      statut: "corbeille",
      checklist: updatedChecklist as unknown as Json,
    })
    .eq("id", chantierId);

  if (updateErr) {
    console.error("Erreur soft delete chantier:", updateErr);
    throw new Error("Erreur lors de la mise à la corbeille : " + updateErr.message);
  }

  return {
    success: true,
    message: `Le chantier "${chantier.nom || "Terrasse"}" a été déplacé dans la corbeille.`,
  };
}

/**
 * 2. Restauration d'un chantier depuis la corbeille
 * Réintègre le chantier dans la liste active avec son statut précédent
 * et préserve l'ensemble de ses relations techniques et documents.
 */
export async function restaurerChantierTerrasse(
  supabase: SupabaseClient<Database>,
  chantierId: string
): Promise<{ success: boolean; message: string }> {
  if (!estUuid(chantierId)) {
    throw new Error("Identifiant de chantier invalide.");
  }

  const { data: chantier, error: fetchErr } = await supabase
    .from("chantiers")
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

  // Nettoyage de la clé corbeille
  const restChecklist = { ...chk };
  delete restChecklist.corbeille;

  const { error: updateErr } = await supabase
    .from("chantiers")
    .update({
      statut: previousStatut,
      checklist: restChecklist as unknown as Json,
    })
    .eq("id", chantierId);

  if (updateErr) {
    console.error("Erreur restauration chantier:", updateErr);
    throw new Error("Impossible de restaurer le chantier : " + updateErr.message);
  }

  return {
    success: true,
    message: `Le chantier "${chantier.nom || "Terrasse"}" a été restauré dans la liste active.`,
  };
}

/**
 * 3. Suppression définitive sécurisée (Hard Delete)
 * Réservée aux actions explicites et confirmées.
 * RÈGLE D'OR : Si le chantier est en réalité un chantier Bardage (ex: TEST_P1 Bardage HPL)
 * avec une terrasse rattachée par erreur ou test, on ne supprime QUE la fiche terrasse
 * pour préserver le chantier racine Bardage intact !
 */
export async function supprimerDefinitivementChantierTerrasse(
  supabase: SupabaseClient<Database>,
  chantierId: string
): Promise<{ success: boolean; message: string }> {
  if (!estUuid(chantierId)) {
    throw new Error("Identifiant de chantier invalide.");
  }

  const { data: chantier, error: fetchErr } = await supabase
    .from("chantiers")
    .select("id, nom, statut, checklist")
    .eq("id", chantierId)
    .single();

  if (fetchErr || !chantier) {
    throw new Error("Chantier introuvable pour suppression définitive.");
  }

  const chk =
    chantier.checklist && typeof chantier.checklist === "object"
      ? (chantier.checklist as Record<string, unknown>)
      : {};

  const metierReel =
    ((chantier as unknown as { metier?: string }).metier) ||
    (chk.metier as string) ||
    "terrasse";

  // Cas A : Chantier racine de type BARDAGE (ex: TEST_P1 Bardage HPL)
  // On ne doit JAMAIS détruire le chantier Bardage racine !
  // On purge uniquement sa fiche technique chantier_terrasses et ses réservations.
  if (metierReel === "bardage") {
    // 1. Purger les réservations de terrasses rattachées
    const { data: terrasses } = await supabase
      .from("chantier_terrasses")
      .select("id")
      .eq("chantier_id", chantierId);

    if (terrasses && terrasses.length > 0) {
      const terrasseIds = terrasses.map((t) => t.id);
      await supabase
        .from("chantier_terrasse_reservations")
        .delete()
        .in("terrasse_id", terrasseIds);
    }

    // 2. Supprimer la fiche terrasse
    const { error: errTerrasse } = await supabase
      .from("chantier_terrasses")
      .delete()
      .eq("chantier_id", chantierId);

    if (errTerrasse) {
      throw new Error(
        "Erreur lors de la suppression de la terrasse liée : " +
          errTerrasse.message
      );
    }

    // 3. Restaurer le statut d'origine du chantier Bardage pour ne pas le laisser à l'état 'corbeille'
    const corbeilleMeta = chk.corbeille as ChecklistCorbeilleMeta | undefined;
    const statutBardage = corbeilleMeta?.previous_statut || "en_cours";
    const restChecklist = { ...chk };
    delete restChecklist.corbeille;

    await supabase
      .from("chantiers")
      .update({
        statut: statutBardage,
        checklist: restChecklist as unknown as Json,
      })
      .eq("id", chantierId);

    return {
      success: true,
      message: `La configuration terrasse de "${chantier.nom}" a été définitivement supprimée. Le chantier Bardage d'origine est resté intact.`,
    };
  }

  // Cas B : Chantier purement TERRASSE
  // 1. Contrôle des contraintes comptables strictes (Factures émises ou retenues de garantie)
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

  // 2. Purge ordonnée des tables dépendantes
  const { data: terrasses } = await supabase
    .from("chantier_terrasses")
    .select("id")
    .eq("chantier_id", chantierId);

  if (terrasses && terrasses.length > 0) {
    const terrasseIds = terrasses.map((t) => t.id);
    await supabase
      .from("chantier_terrasse_reservations")
      .delete()
      .in("terrasse_id", terrasseIds);
  }

  await supabase
    .from("chantier_terrasses")
    .delete()
    .eq("chantier_id", chantierId);

  // 3. Purge des frais de déplacement éventuels
  await supabase.from("frais_deplacement").delete().eq("chantier_id", chantierId);

  // 4. Purge des devis brouillons liés
  await supabase.from("devis").delete().eq("chantier_id", chantierId);

  // 5. Suppression finale de la table racine chantiers
  const { error: deleteErr } = await supabase
    .from("chantiers")
    .delete()
    .eq("id", chantierId);

  if (deleteErr) {
    console.error("Erreur destruction définitive chantier terrasse:", deleteErr);
    throw new Error(
      "Erreur lors de la suppression définitive : " + deleteErr.message
    );
  }

  return {
    success: true,
    message: `Le chantier "${chantier.nom || "Terrasse"}" a été définitivement détruit.`,
  };
}

/**
 * 4. Récupération des chantiers placés dans la corbeille pour l'espace Terrasse
 */
export async function recupererChantiersCorbeilleTerrasse(
  supabase: SupabaseClient<Database>
): Promise<ChantierCorbeilleItem[]> {
  // Récupérer les chantiers dont le statut est 'corbeille'
  const { data, error } = (await (supabase
    .from("chantiers") as any)
    .select("*, clients(nom, societe), chantier_terrasses(*)")
    .eq("statut", "corbeille")
    .order("created_at", { ascending: false })) as {
    data: any[] | null;
    error: any;
  };

  if (error) {
    console.error("Erreur récupération chantiers corbeille:", error);
    return [];
  }

  if (!data) return [];

  // Filtrer ceux qui concernent la terrasse :
  // - Présence d'une fiche chantier_terrasses
  // - Ou checklist.metier === 'terrasse'
  // - Ou checklist.corbeille.deleted_from === 'terrasse'
  const corbeilleTerrasse = data.filter((c) => {
    const chk = (c.checklist && typeof c.checklist === "object" ? c.checklist : {}) as Record<string, unknown>;
    const hasTerrasse = Array.isArray(c.chantier_terrasses)
      ? c.chantier_terrasses.length > 0
      : Boolean(c.chantier_terrasses);
    const isMetierTerrasse = c.metier === "terrasse" || chk.metier === "terrasse";
    const fromTerrasse = (chk.corbeille as ChecklistCorbeilleMeta | undefined)?.deleted_from === "terrasse";

    return hasTerrasse || isMetierTerrasse || fromTerrasse;
  });

  return corbeilleTerrasse.map((c) => {
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
      metier_reel: c.metier || (chk.metier as string) || "terrasse",
      clients: c.clients as { nom: string; societe: string | null } | null,
      terrasse_count: Array.isArray(c.chantier_terrasses)
        ? c.chantier_terrasses.length
        : c.chantier_terrasses
        ? 1
        : 0,
    };
  });
}
