// lib/contexteEntreprise.ts
//
// Contexte multi-entreprise pour les INSERTS client (devis, factures, clients, chantiers).
// Résout `entreprise_id` dans cet ordre de priorité sans jamais échouer :
//   1. `user.app_metadata?.entreprise_id`
//   2. `user.user_metadata?.entreprise_id`
//   3. Lookup dans `parametres_entreprise`
//   4. Repli garanti sur l'entreprise BNA par défaut (`11111111-1111-4111-8111-111111111111`).

import { supabase } from "@/lib/supabase";

export const DEFAULT_ENTREPRISE_ID = "11111111-1111-4111-8111-111111111111";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extraireUuidValide(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export type ContexteEntreprise = {
  chantier_id: string | null;
  /** null quand chantier_id est présent (le trigger s'en charge). */
  entreprise_id: string | null;
};

/**
 * Résout l'`entreprise_id` courant côté client avec chaîne de repli garantie
 * vers `DEFAULT_ENTREPRISE_ID`. Ne retourne jamais `null`.
 */
export async function obtenirContexteEntreprise(): Promise<string> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    let user = sessionData?.session?.user ?? null;

    if (!user) {
      const { data: userData } = await supabase.auth.getUser();
      user = userData?.user ?? null;
    }

    if (user) {
      const fromAppMeta = extraireUuidValide(
        (user.app_metadata as { entreprise_id?: unknown } | null | undefined)?.entreprise_id
      );
      if (fromAppMeta) return fromAppMeta;

      const fromUserMeta = extraireUuidValide(
        (user.user_metadata as { entreprise_id?: unknown } | null | undefined)?.entreprise_id
      );
      if (fromUserMeta) return fromUserMeta;
    }

    const { data: param } = await supabase
      .from("parametres_entreprise")
      .select("entreprise_id")
      .limit(1)
      .maybeSingle();

    const fromParam = extraireUuidValide(param?.entreprise_id);
    if (fromParam) return fromParam;

    return DEFAULT_ENTREPRISE_ID;
  } catch {
    return DEFAULT_ENTREPRISE_ID;
  }
}

export async function resoudreContexteEntreprise(
  chantierId: string | null | undefined
): Promise<ContexteEntreprise> {
  if (chantierId) {
    return { chantier_id: chantierId, entreprise_id: null };
  }

  const entreprise_id = await obtenirContexteEntreprise();
  return { chantier_id: null, entreprise_id };
}
