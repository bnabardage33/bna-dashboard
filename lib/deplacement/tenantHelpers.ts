import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function getEntrepriseCouranteId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Même forme que lib/contexteEntreprise.ts : le claim est un objet applicatif
  // libre (UserMetadata), pas une colonne typée par le générateur Supabase.
  const claim = user?.app_metadata as { entreprise_id?: string } | null | undefined;
  return claim?.entreprise_id || null;
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
