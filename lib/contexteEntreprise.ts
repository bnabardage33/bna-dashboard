// lib/contexteEntreprise.ts
//
// Contexte multi-entreprise pour les INSERTS client (devis, factures, clients, chantiers).
// Résout `entreprise_id` dans cet ordre de priorité sans jamais échouer pour un
// utilisateur authentifié :
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

export async function resoudreContexteEntreprise(
  chantierId: string | null | undefined
): Promise<ContexteEntreprise> {
  if (chantierId) {
    return { chantier_id: chantierId, entreprise_id: null };
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { chantier_id: null, entreprise_id: null };
    }

    const fromAppMeta = extraireUuidValide(
      (user.app_metadata as { entreprise_id?: unknown } | null | undefined)?.entreprise_id
    );
    if (fromAppMeta) {
      return { chantier_id: null, entreprise_id: fromAppMeta };
    }

    const fromUserMeta = extraireUuidValide(
      (user.user_metadata as { entreprise_id?: unknown } | null | undefined)?.entreprise_id
    );
    if (fromUserMeta) {
      return { chantier_id: null, entreprise_id: fromUserMeta };
    }

    const { data: param } = await supabase
      .from("parametres_entreprise")
      .select("entreprise_id")
      .limit(1)
      .maybeSingle();

    const fromParam = extraireUuidValide(param?.entreprise_id);
    if (fromParam) {
      return { chantier_id: null, entreprise_id: fromParam };
    }

    return { chantier_id: null, entreprise_id: DEFAULT_ENTREPRISE_ID };
  } catch {
    return { chantier_id: null, entreprise_id: DEFAULT_ENTREPRISE_ID };
  }
}
