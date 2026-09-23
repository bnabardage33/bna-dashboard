-- =============================================================================
-- PHASE 2A — RATTACHEMENT PROFILES.ENTREPRISE_ID + CLAIM JWT (P0 #30)
-- Projet : BNA Bardage — 2026-09-22 (à exécuter UNE fois via le SQL Editor)
--
-- Modèle (validé) :
--   * auth.users = identité de connexion ; profiles = registre métier/main-d'œuvre.
--     Deux systèmes DISTINCTS, non fusionnés.
--   * Le claim JWT app_metadata.entreprise_id est la SEULE clé d'isolation RLS.
--   * profiles.entreprise_id = rattachement d'intégrité (nullable), jamais utilisé
--     par la RLS, renseigné UNIQUEMENT sur une fiche existante (aucune création).
--   * profiles.id n'est PAS comparé à auth.users.id : un compte auth sans fiche
--     reçoit le claim sans création de fiche ; une fiche existante reçoit
--     entreprise_id sans modification de son id.
--   * Exécutée après l'analyse du blocage part4 §8 (claim posé sur un id sans
--     compte auth → 0 ligne silencieuse). Ici chaque écriture est vérifiée.
--
-- IDEMPOTENTE : rejouable sans risque (IF NOT EXISTS / ON CONFLICT / gardes).
-- =============================================================================

-- Références déterministes :
--   BNA    = 11111111-1111-4111-8111-111111111111
--   TEST   = 22222222-2222-4222-8222-222222222222
--   Gaël   = 434a6c10-7cab-483e-a5a4-afb9a4e5d024  (fiche patron, sans compte auth)
--   gmail  = 72b9445d-7457-44c7-869c-65ae524273e7  (compte de connexion actuel)
--   outlook= 74b7da04-22f6-4e26-9839-02407b7b0025  (adresse professionnelle)
--   TEST c= f9e60e2f-6157-489b-be08-7d83e589e994   (claim TEST existant conservé)

-- -----------------------------------------------------------------------------
-- 1) COLONNE profiles.entreprise_id (nullable) + FK ON DELETE SET NULL + index
-- -----------------------------------------------------------------------------

alter table public.profiles add column if not exists entreprise_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_entreprise_id_fkey'
  ) then
    alter table public.profiles add constraint profiles_entreprise_id_fkey
      foreign key (entreprise_id) references public.entreprises(id) on delete set null;
  end if;
end $$;

create index if not exists profiles_entreprise_idx on public.profiles (entreprise_id);

-- -----------------------------------------------------------------------------
-- 2) RPC rattacher_entreprise(uuid, uuid) — SECURITY DEFINER, service_role only
-- -----------------------------------------------------------------------------
-- Transaction atomique (un seul bloc plpgsql) :
--   1. valide l'entreprise cible (existe + actif) sinon exception ;
--   2. renseigne profiles.entreprise_id SI une fiche existe pour cet id
--      (aucune création de fiche — 0 ligne est un cas légitime) ;
--   3. pose le claim JWT app_metadata.entreprise_id sur le compte auth (merge
--      des métadonnées existantes) ; lève une exception si aucun compte auth.
-- Aucun lien imposé profiles.id = auth.users.id.

create or replace function public.rattacher_entreprise(p_user_id uuid, p_entreprise_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_col text;
  v_claim jsonb;
  v_naf integer;
begin
  -- 1. L'entreprise cible doit exister et être active
  if not exists (select 1 from public.entreprises where id = p_entreprise_id and actif) then
    raise exception 'entreprise introuvable ou inactive : %', p_entreprise_id;
  end if;

  -- 2. Fiche métier : renseigner entreprise_id si la fiche existe (jamais en créer)
  update public.profiles
     set entreprise_id = p_entreprise_id
   where id = p_user_id;

  -- 3. Claim JWT : détecter la colonne de métadonnées (raw_app_meta_data préférée)
  select column_name into v_col
    from information_schema.columns
   where table_schema = 'auth'
     and table_name = 'users'
     and column_name in ('raw_app_meta_data', 'app_metadata')
   order by (column_name = 'raw_app_meta_data') desc
   limit 1;

  if v_col is null then
    raise exception 'auth.users : ni raw_app_meta_data ni app_metadata trouvée';
  end if;

  v_claim := jsonb_build_object('entreprise_id', p_entreprise_id::text);
  execute format(
    'update auth.users set %I = coalesce(%I, ''{}''::jsonb) || %L where id = %L',
    v_col, v_col, v_claim::text, p_user_id
  );
  get diagnostics v_naf = row_count;

  -- Échec fermé (fail-closed) : id provient de l'appelant, ne jamais poser un
  -- claim sur un compte inexistant (cause racine du blocage part4 §8).
  if v_naf = 0 then
    raise exception 'compte auth introuvable : %', p_user_id;
  end if;

  raise notice 'Claim % posé sur auth.users.% pour %', v_claim, v_col, p_user_id;
end $$;

revoke all on function public.rattacher_entreprise(uuid, uuid) from public;
grant execute on function public.rattacher_entreprise(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 3) BACKFILL DES FICHES MÉTIER EXISTANTES (id non modifié, création jamais)
-- -----------------------------------------------------------------------------

update public.profiles
   set entreprise_id = '11111111-1111-4111-8111-111111111111'::uuid
 where id = '434a6c10-7cab-483e-a5a4-afb9a4e5d024'
   and entreprise_id is distinct from '11111111-1111-4111-8111-111111111111'::uuid;

update public.profiles
   set entreprise_id = '22222222-2222-4222-8222-222222222222'::uuid
 where id = 'f9e60e2f-6157-489b-be08-7d83e589e994'
   and entreprise_id is distinct from '22222222-2222-4222-8222-222222222222'::uuid;

-- -----------------------------------------------------------------------------
-- 4) CLAIM JWT sur les DEUX comptes du dirigeant (gmail + outlook) — via la RPC
-- -----------------------------------------------------------------------------
-- La RPC pose le claim ET renseigne la fiche si elle existait (aucune ici :
-- ces comptes n'ont volontairement pas de fiche → aucune création).
-- Claim TEST : conservé tel quel (aucun appel pour f9e60e2f).

select public.rattacher_entreprise(
  '72b9445d-7457-44c7-869c-65ae524273e7',  -- bna.bardage33@gmail.com
  '11111111-1111-4111-8111-111111111111'   -- BNA
);

select public.rattacher_entreprise(
  '74b7da04-22f6-4e26-9839-02407b7b0025',  -- bna.bardage33@outlook.com
  '11111111-1111-4111-8111-111111111111'   -- BNA
);

-- -----------------------------------------------------------------------------
-- CONTRÔLES (à rejouer en SQL Editor, commentés volontairement) :
--
--   -- Fiches : 2 lignes, Gaël -> BNA, TEST -> TEST, aucune création
--   select id, full_name, role, entreprise_id from public.profiles order by created_at;
--
--   -- Claim JWT : gmail + outlook -> BNA ; TEST -> TEST
--   select email, id,
--          coalesce(raw_app_meta_data, app_metadata) -> 'entreprise_id' as claim
--     from auth.users
--    order by email;
--
--   -- Les deux comptes BNA et le compte TEST n'ont PAS de fiche (0 doublon)
--   select count(*) from public.profiles
--    where id in ('72b9445d-...', '74b7da04-...', 'f9e60e2f-...');
--
--   -- RPC inaccessible aux rôles non privilégiés
--   select has_function_privilege('authenticated', 'public.rattacher_entreprise(uuid,uuid)', 'execute');
-- =============================================================================