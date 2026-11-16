import { supabase } from "@/lib/supabase";

export interface ChantierCorbeilleCloture {
  id: string;
  nom: string | null;
  adresse_chantier: string | null;
  statut: string;
  date_debut: string | null;
  clients: { nom: string; societe: string | null } | null;
}

export async function recupererChantiersCorbeilleCloture(): Promise<{
  data: ChantierCorbeilleCloture[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("chantiers")
    .select("id, nom, adresse_chantier, statut, date_debut, clients(nom, societe)")
    .eq("metier", "cloture")
    .eq("statut", "corbeille")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }
  return {
    data: (data ?? []) as unknown as ChantierCorbeilleCloture[],
    error: null,
  };
}

export async function mettreChantierClotureEnCorbeille(
  chantierId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/chantiers/${chantierId}/corbeille`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "corbeille" }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    return { ok: false, error: json?.error || "Erreur mise en corbeille" };
  }
  return { ok: true };
}

export async function restaurerChantierCloture(
  chantierId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/chantiers/${chantierId}/corbeille`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restaurer" }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    return { ok: false, error: json?.error || "Erreur restauration" };
  }
  return { ok: true };
}

export async function supprimerDefinitivementChantierCloture(
  chantierId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/chantiers/${chantierId}/corbeille`, {
    method: "DELETE",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    return { ok: false, error: json?.error || "Erreur suppression définitive" };
  }
  return { ok: true };
}
