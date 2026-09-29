import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function getEntrepriseCouranteId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (user?.app_metadata as any)?.entreprise_id || null;
}

export async function verifierChantier(chantierId: string, entrepriseId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("chantiers")
    .select("id")
    .eq("id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

export async function lireTarifCommercial(entrepriseId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("parametres_finance")
    .select("valeur")
    .eq("cle", "tarif_km_commercial")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();
  return data?.valeur ?? 1.00; // 1.00 par défaut si non configuré
}
