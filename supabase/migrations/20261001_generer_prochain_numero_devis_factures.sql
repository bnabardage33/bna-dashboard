-- 20261001_generer_prochain_numero_devis_factures.sql
--
-- Devis et factures numerotent aujourd'hui via lib/documents.ts (prochainNumero),
-- qui fait un SELECT puis un max+1 cote navigateur. Trois defauts :
--
--   1. aucune contrainte UNIQUE sur devis.numero ni factures.numero
--      (pv_receptions en a une depuis 20260821_create_pv_receptions.sql).
--      Deux creations concurrentes produisent donc deux lignes de MEME numero,
--      silencieusement. C'est ce qui a permis a deux devis DEV-2026-001
--      de coexister.
--   2. aucun filtre entreprise_id. La perimetrie par tenant ne tient que parce
--      que lib/documents.ts utilise le client Supabase cote utilisateur (donc
--      RLS). Passer cet import en supabaseAdmin reinitialiserait toutes les
--      entreprises a 001 simultanement.
--   3. lecture-ecriture sans verrou : deux appels dans la meme seconde lisent
--      le meme maximum.
--
-- Ce fichier aligne devis et factures sur le pattern deja en place pour
-- situations (20260924_C_o2_situations_numero.sql), repris a l'identique :
--   - variante _ctx(p_entreprise_id) : verrou de table, max scopee tenant+annee
--   - variante 0-arg               : resout entreprise_courante()
--   - variante 1-arg               : contexte explicite, sinon entreprise_courante()
--   - refuse explicitement un contexte NULL plutot que de numeroter « partout »
--   - set search_path = public      : durci par 20260930_c1_search_path_security_definer.sql
--
-- EXECUTION MANUELLE par l'utilisateur dans l'editeur SQL de Supabase.
-- Ne pas appliquer automatiquement (pas de workflow CI dans le repo).
--
-- VERIFICATION PREALABLE (resultat au moment de l'ecriture : aucun doublon,
-- les deux index uniques ci-dessous sont donc applicables) :
--
--   select entreprise_id, numero, count(*)
--     from public.devis
--    group by 1, 2 having count(*) > 1;
--
--   select entreprise_id, numero, count(*)
--     from public.factures
--    group by 1, 2 having count(*) > 1;
--
-- Si l'une des deux requetes renvoie des lignes, l'index unique echouera.
-- Renumeroter ces lignes avant d'appliquer, sinon toute la migration est
-- annulee en bloc par PostgreSQL et AUCUNE fonction n'est creee.


-- ─────────────────────────────────────────────────────────────────────────────
-- Devis — DEV-YYYY-###
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.generer_prochain_numero_dev_ctx(p_entreprise_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_annee text; v_index integer; v_numero text;
begin
  if p_entreprise_id is null then raise exception 'contexte entreprise manquant'; end if;
  v_annee := to_char(now(), 'YYYY');
  lock table public.devis in share row exclusive mode;
  select coalesce(max(cast(nullif(regexp_replace(numero, '^DEV-\d{4}-', ''), '') as integer)), 0) + 1
    into v_index
    from public.devis
   where entreprise_id = p_entreprise_id
     and numero like 'DEV-' || v_annee || '-%';
  v_numero := 'DEV-' || v_annee || '-' || lpad(v_index::text, 3, '0');
  return v_numero;
end $$;

create or replace function public.generer_prochain_numero_dev()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_ent uuid := public.entreprise_courante();
begin
  if v_ent is null then raise exception 'contexte entreprise manquant'; end if;
  return public.generer_prochain_numero_dev_ctx(v_ent);
end $$;

create or replace function public.generer_prochain_numero_dev(p_entreprise_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_ent uuid := coalesce(public.entreprise_courante(), p_entreprise_id);
begin
  if v_ent is null then raise exception 'contexte entreprise manquant'; end if;
  return public.generer_prochain_numero_dev_ctx(v_ent);
end $$;

comment on function public.generer_prochain_numero_dev_ctx(uuid) is
  'Prochain numero DEV-YYYY-### pour une entreprise donnee. Atomique (verrou de table).';
comment on function public.generer_prochain_numero_dev() is
  'Prochain numero DEV-YYYY-### pour l entreprise courante. Refuse si le contexte est absent.';
comment on function public.generer_prochain_numero_dev(uuid) is
  'Prochain numero DEV-YYYY-### ; contexte explicite, sinon entreprise_courante().';


-- ─────────────────────────────────────────────────────────────────────────────
-- Factures — FAC-YYYY-###
--
-- Meme table que les situations, prefixe different : le filtre
-- `numero like 'FAC-'` les separe, donc aucun recouvrement avec les
-- SIT-* produits par generer_prochain_numero_sit. Aucune colonne type_facture
-- n'est filtree ici : le numero suffit a les separer, et FAC- couvre l'acompte
-- comme le solde.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.generer_prochain_numero_fac_ctx(p_entreprise_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_annee text; v_index integer; v_numero text;
begin
  if p_entreprise_id is null then raise exception 'contexte entreprise manquant'; end if;
  v_annee := to_char(now(), 'YYYY');
  lock table public.factures in share row exclusive mode;
  select coalesce(max(cast(nullif(regexp_replace(numero, '^FAC-\d{4}-', ''), '') as integer)), 0) + 1
    into v_index
    from public.factures
   where entreprise_id = p_entreprise_id
     and numero like 'FAC-' || v_annee || '-%';
  v_numero := 'FAC-' || v_annee || '-' || lpad(v_index::text, 3, '0');
  return v_numero;
end $$;

create or replace function public.generer_prochain_numero_fac()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_ent uuid := public.entreprise_courante();
begin
  if v_ent is null then raise exception 'contexte entreprise manquant'; end if;
  return public.generer_prochain_numero_fac_ctx(v_ent);
end $$;

create or replace function public.generer_prochain_numero_fac(p_entreprise_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_ent uuid := coalesce(public.entreprise_courante(), p_entreprise_id);
begin
  if v_ent is null then raise exception 'contexte entreprise manquant'; end if;
  return public.generer_prochain_numero_fac_ctx(v_ent);
end $$;

comment on function public.generer_prochain_numero_fac_ctx(uuid) is
  'Prochain numero FAC-YYYY-### pour une entreprise donnee. Atomique (verrou de table).';
comment on function public.generer_prochain_numero_fac() is
  'Prochain numero FAC-YYYY-### pour l entreprise courante. Refuse si le contexte est absent.';
comment on function public.generer_prochain_numero_fac(uuid) is
  'Prochain numero FAC-YYYY-### ; contexte explicite, sinon entreprise_courante().';


-- ─────────────────────────────────────────────────────────────────────────────
-- Index uniques — la garantie qui manquait
--
-- (entreprise_id, numero) et non numero seul : la numerotation est par
-- entreprise, donc deux entreprises peuvent legitimement produire le meme
-- numero. Sur (entreprise_id, numero), deux devis de MEME entreprise et de
-- MEME numero sont rejetes par PostgreSQL au lieu d coexister en silence.
-- ─────────────────────────────────────────────────────────────────────────────

create unique index if not exists devis_entreprise_numero_uniq
  on public.devis (entreprise_id, numero);

create unique index if not exists factures_entreprise_numero_uniq
  on public.factures (entreprise_id, numero);


-- ─────────────────────────────────────────────────────────────────────────────
-- Grants — alignes sur les grants part3 (lignes 190-197)
--
-- `authenticated` suffit : la numerotation est appelee depuis le navigateur par
-- les pages bureau. `service_role` ajoute pour les crons et imports serveur.
-- Rien n'est accorde a `anon`.
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function public.generer_prochain_numero_dev_ctx(uuid) to authenticated, service_role;
grant execute on function public.generer_prochain_numero_dev() to authenticated, service_role;
grant execute on function public.generer_prochain_numero_dev(uuid) to authenticated, service_role;

grant execute on function public.generer_prochain_numero_fac_ctx(uuid) to authenticated, service_role;
grant execute on function public.generer_prochain_numero_fac() to authenticated, service_role;
grant execute on function public.generer_prochain_numero_fac(uuid) to authenticated, service_role;
