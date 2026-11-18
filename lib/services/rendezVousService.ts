import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type RendezVousStatut = "planifie" | "confirme" | "effectue" | "annule";

export interface RendezVousRow {
  id: string;
  entreprise_id: string;
  chantier_id: string | null;
  client_id: string | null;
  titre: string;
  nature: string;
  date: string; // YYYY-MM-DD
  heure_debut: string | null;
  heure_fin: string | null;
  lieu: string | null;
  notes: string | null;
  statut: RendezVousStatut;
  created_at: string;
  updated_at: string;
}

export interface CreerRendezVousInput {
  entreprise_id?: string | null;
  chantier_id?: string | null;
  client_id?: string | null;
  titre: string;
  nature?: string;
  date: string;
  heure_debut?: string | null;
  heure_fin?: string | null;
  lieu?: string | null;
  notes?: string | null;
  statut?: RendezVousStatut;
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    Boolean(error.message?.includes("rendez_vous"))
  );
}

export async function listerRendezVous(
  client: SupabaseClient<Database>,
  entrepriseId?: string | null
): Promise<{ data: RendezVousRow[]; migrationRequired: boolean }> {
  let query = client
    .from("rendez_vous")
    .select("*")
    .order("date", { ascending: true })
    .order("heure_debut", { ascending: true, nullsFirst: false });

  if (entrepriseId) {
    query = query.eq("entreprise_id", entrepriseId);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return { data: [], migrationRequired: true };
    }
    throw new Error(error.message);
  }

  return {
    data: (data ?? []) as RendezVousRow[],
    migrationRequired: false,
  };
}

export async function creerRendezVous(
  client: SupabaseClient<Database>,
  input: CreerRendezVousInput
): Promise<RendezVousRow> {
  const insertPayload: Database["public"]["Tables"]["rendez_vous"]["Insert"] = {
    titre: input.titre.trim(),
    nature: input.nature?.trim() || "technique",
    date: input.date,
    heure_debut: input.heure_debut?.trim() || null,
    heure_fin: input.heure_fin?.trim() || null,
    lieu: input.lieu?.trim() || null,
    notes: input.notes?.trim() || null,
    chantier_id: input.chantier_id || null,
    client_id: input.client_id || null,
    statut: input.statut ?? "planifie",
    ...(input.entreprise_id ? { entreprise_id: input.entreprise_id } : {}),
  };

  const { data, error } = await client
    .from("rendez_vous")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Impossible de créer le rendez-vous.");
  }

  return data as RendezVousRow;
}

export async function basculerStatutRendezVous(
  client: SupabaseClient<Database>,
  id: string,
  currentStatut: string
): Promise<RendezVousStatut> {
  const nextStatut: RendezVousStatut =
    currentStatut === "effectue" ? "planifie" : "effectue";

  const { error } = await client
    .from("rendez_vous")
    .update({
      statut: nextStatut,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  return nextStatut;
}

export async function supprimerRendezVous(
  client: SupabaseClient<Database>,
  id: string
): Promise<void> {
  const { error } = await client.from("rendez_vous").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function mettreAJourDatesChantier(
  client: SupabaseClient<Database>,
  chantierId: string,
  dateDebut: string | null,
  dateFin: string | null
): Promise<void> {
  const { error } = await client
    .from("chantiers")
    .update({
      date_debut: dateDebut || null,
      date_fin: dateFin || null,
    })
    .eq("id", chantierId);

  if (error) {
    throw new Error(error.message);
  }
}
