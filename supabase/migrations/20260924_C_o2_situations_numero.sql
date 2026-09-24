-- 20260924_C_o2_situations_numero.sql — DRAFT — NON EXÉCUTÉ
--
-- Phase 2 / Option O2 — Situations de Travaux alignées sur factures.
-- Ce fichier est une PRÉPARATION : il ne doit PAS être appliqué automatiquement
-- (aucun workflow CI dans le repo). Exécution manuelle au SQL Editor par
-- l'utilisateur, APRÈS validation humaine du diff Phase 2, en étape séparée.
--
-- But : la source UNIQUE de numérotation SIT devient public.factures
-- (type_facture = 'situation') au lieu de public.situations (0 ligne, orpheline).
-- Signatures, posture SECURITY DEFINER et grants (§6.6 part3) INCHANGÉS.
-- public.situations n'est PAS supprimée (aucun DROP — étape future séparée).

create or replace function public.generer_prochain_numero_sit_ctx(p_entreprise_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_annee text; v_index integer; v_numero text;
begin
  if p_entreprise_id is null then raise exception 'contexte entreprise manquant'; end if;
  v_annee := to_char(now(), 'YYYY');
  lock table public.factures in share row exclusive mode;
  select coalesce(max(cast(nullif(regexp_replace(numero, '^SIT-\d{4}-', ''), '') as integer)), 0) + 1
    into v_index
    from public.factures
   where entreprise_id = p_entreprise_id
     and type_facture = 'situation'
     and numero like 'SIT-' || v_annee || '-%';
  v_numero := 'SIT-' || v_annee || '-' || lpad(v_index::text, 3, '0');
  return v_numero;
end $$;

create or replace function public.generer_prochain_numero_sit()
returns text
language plpgsql
security definer
as $$
declare v_ent uuid := public.entreprise_courante();
begin
  if v_ent is null then raise exception 'contexte entreprise manquant'; end if;
  return public.generer_prochain_numero_sit_ctx(v_ent);
end $$;

create or replace function public.generer_prochain_numero_sit(p_entreprise_id uuid)
returns text
language plpgsql
security definer
as $$
declare v_ent uuid := coalesce(public.entreprise_courante(), p_entreprise_id);
begin
  if v_ent is null then raise exception 'contexte entreprise manquant'; end if;
  return public.generer_prochain_numero_sit_ctx(v_ent);
end $$;

-- Index pour la recherche MAX par entreprise / type / numéro (bonne pratique, volume faible)
create index if not exists factures_situation_idx
  on public.factures (entreprise_id, type_facture, numero);