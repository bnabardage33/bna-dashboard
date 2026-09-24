// lib/contexteEntreprise.ts
//
// Contexte multi-entreprise pour les INSERTS client (devis, factures).
// Depuis la Phase 1 d'isolation (22/09), entreprise_id est NOT NULL sans
// default sur devis / factures. Deux mécanismes coexistent :
//
//  - chantier_id présent  → le trigger `tg_auto_entreprise`
//    (`tg_set_entreprise_par_chantier`, migration part4 §7) dérive
//    entreprise_id depuis le chantier (pattern existant, ex. acompte auto).
//  - chantier_id absent    → on pose entreprise_id explicitement depuis le
//    claim app_metadata.entreprise_id de la session (même source que
//    `entreprise_courante()` côté PostgREST).
//
// Le trigger est CONSERVÉ (règle produit) : on ne renvoie jamais entreprise_id
// quand chantier_id est présent, pour laisser le trigger faire son travail et
// garantir la cohérence chantier ↔ entreprise.

import { supabase } from "@/lib/supabase";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const entreprise_id =
    (user?.app_metadata as { entreprise_id?: string } | null | undefined)
      ?.entreprise_id ?? null;
  return { chantier_id: null, entreprise_id };
}