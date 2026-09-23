-- =============================================================================
-- P1 #29 — DURCISSEMENT DE public.profiles (RLS / intégrité du rattachement)
-- Projet : BNA Bardage — réconciliation 2026-09-23 (état PROD réel via diagnostic)
--
-- ÉTAT PROD RÉEL (diagnostic 10 CSV, 2026-09-23) :
--   * RLS ACTIVE sur profiles ;
--   * UNE SEULE policy live : "acces_authentifie_uniquement"
--       cmd = ALL, roles = authenticated,
--       USING      = (auth.uid() IS NOT NULL)
--       WITH CHECK = (auth.uid() IS NOT NULL)   -> ubiquitiste, sans scope tenant ;
--   * profiles.entreprise_id -> entreprises.id  ON DELETE SET NULL ;
--   * pointages.user_id      -> profiles.id     ON DELETE SET NULL ;
--   * AUCUN trigger sur profiles (tg_auto_entreprise ne couvre que les 23
--     tables enfants : aucune n'est profiles — vérifié migrations part4).
--
-- Cadre validé (A·B·C·D·E·G) :
--   * A — SELECT limité à l'entreprise du claim (entreprise_courante()).
--   * B — INSERT conservé pour la création des fiches ouvriers SEULEMENT
--         (role = 'ouvrier' forcé côté navigateur), via WITH CHECK vérifiable.
--   * E — entreprise_id d'une fiche créée par le navigateur = entreprise du
--         compte créateur (claim JWT) ; valeur client IGNORÉE (anti-forge
--         BNA/TEST) ; échec fermé si pas de contexte entreprise.
--   * C — UPDATE authenticated retiré (aucune fonctionnalité ne l'utilise ;
--         le rattachement passe par la RPC rattacher_entreprise,
--         SECURITY DEFINER service_role, qui bypasse la RLS).
--   * D — DELETE authenticated retiré : aucune UI ne le nécessite ;
--         T0 live (2026-09-23) : pointages.user_id -> profiles.id en
--         ON DELETE SET NULL (fiche supprimée => pointage orphelin),
--         notifications.destinataire_id / entreprise_membres.user_id en
--         ON DELETE CASCADE.
--   * G — reproductibilité : la policy live avait été créée à la main sur le
--         projet (absente du repo). Cette migration opère une PURGE
--         déterministe (explicite + boucle pg_policies) puis recrée le
--         périmètre durci (même schéma que 20260921_enable_rls_core_tables.sql).
--
-- NON TOUCHÉ (hors périmètre validé) :
--   * les 33 policies RLS des autres tables, entreprise_courante(),
--     rattacher_entreprise(), le mécanisme de claim JWT ;
--   * l'architecture auth.users <-> profiles (deux systèmes distincts) ;
--   * aucun GRANT modifié (authenticated / service_role conservent grant all) ;
--   * aucune donnée : ZÉRO UPDATE / backfill dans cette migration ;
--   * aucune RPC nouvelle, aucun changement de types/supabase.ts.
--
-- SÉCURITÉ : création de fiche via le navigateur interdite hors role='ouvrier' ;
-- auto-attribution entreprise_id par trigger BEFORE INSERT (SECURITY DEFINER,
-- search_path = public) ; UPDATE et DELETE authenticated ABSENTS.
--
-- Idempotente : purge + DROP IF EXISTS + CREATE (rejouable sans risque).
-- ⚠️ NON APPLIQUÉE — à relire puis valider avant exécution dans le SQL Editor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) RLS active (idempotente ; échoue si la table n'existe pas : fail-closed)
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- -----------------------------------------------------------------------------
-- 2) Purge des policies existantes sur public.profiles, rendant la migration
--    déterministe.
--    a) Suppression EXPLICITE de la policy live (état réel vérifié par CSV) :
-- -----------------------------------------------------------------------------
drop policy if exists acces_authentifie_uniquement on public.profiles;

--    b) Purge de TOUTE autre policy profiles résiduelle (legacy "plates"
--       éventuelles créées au dashboard) — retire aussi les éventuelles
--       policies UPDATE et DELETE : elles ne sont PAS recréées en aval (C/D).
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles;', r.policyname);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3) A — SELECT scopé sur l'entreprise du claim JWT.
--    Un compte authentifié ne voit que les fiches de SON entreprise.
--    Les 2 fiches prod sont déjà rattachées (Gaël -> BNA, Test -> TEST) :
--    les listes de main-d'œuvre restent fonctionnelles. Une fiche NULL
--    (orpheline) est invisible pour tous — plus aucune ne peut naître (cf. E).
-- -----------------------------------------------------------------------------
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (entreprise_id = public.entreprise_courante());

-- -----------------------------------------------------------------------------
-- 4) E — Trigger BEFORE INSERT : entreprise_id = entreprise du créateur.
--    La valeur éventuellement envoyée par le client est IGNORÉE (nouvelle
--    valeur forcée depuis le claim JWT) : impossible de rattacher une fiche
--    créée par le navigateur vers une autre entreprise que la sienne.
--    Échec fermé si le compte n'a pas de contexte entreprise (0 claim).
--    Rien d'autre dans la ligne n'est modifié.
-- -----------------------------------------------------------------------------
create or replace function public.profiles_auto_entreprise() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.entreprise_id := public.entreprise_courante();
  if new.entreprise_id is null then
    raise exception 'contexte entreprise manquant';
  end if;
  return new;
end $$;

drop trigger if exists tg_profiles_auto_entreprise on public.profiles;
create trigger tg_profiles_auto_entreprise
  before insert on public.profiles
  for each row
  execute function public.profiles_auto_entreprise();

-- -----------------------------------------------------------------------------
-- 5) B — INSERT réservé aux fiches ouvriers.
--    with check (coalesce(role,'') = 'ouvrier') : impossible de créer via le
--    navigateur un profil admin/chef ou un rôle libre. L'entreprise_id est
--    garanti par le trigger (E). L'insertion feuille-heures (role='ouvrier',
--    sans entreprise_id — vérifié dans le code navigateur) reste fonctionnelle
--    sans aucune modification applicative.
-- -----------------------------------------------------------------------------
create policy profiles_insert_authenticated on public.profiles
  for insert to authenticated
  with check (coalesce(role, '') = 'ouvrier');

-- -----------------------------------------------------------------------------
-- 6) C / D — UPDATE et DELETE authenticated : ABSENTS (retirés en 2)).
--    Conséquences vérifiées côté code (recensement P1 #29 + scan app/) :
--      * AUCUN .update()/.delete() navigateur sur profiles (seuls select +
--        insert fiche ouvrier existent) ;
--      * la RPC rattacher_entreprise (service_role, SECURITY DEFINER) bypasse
--        la RLS : le rattachement reste possible côté serveur ;
--      * les écritures administratives futures passeront par une RPC dédiée
--        (F — hors périmètre aujourd'hui).
-- -----------------------------------------------------------------------------

-- =============================================================================
-- CONTRÔLES (à lancer dans le SQL Editor APRÈS application)
--   -- Exactement 2 policies sur profiles, rôles authenticated, cmd select/insert :
--   select policyname, cmd, roles from pg_policies
--    where schemaname='public' and tablename='profiles' order by 1;
--   -- Aucune policy UPDATE/DELETE sur profiles (0 ligne pour cmd update/delete) :
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename='profiles' and cmd in ('UPDATE','DELETE');
--   -- Trigger présent :
--   select tgname from pg_trigger where tgrelid='public.profiles'::regclass;
--   -- Fonction présente + SECURITY DEFINER + search_path :
--   select proname, prosecdef, proconfig from pg_proc
--    where proname='profiles_auto_entreprise';
--   -- Aucune autre table touchée (nb total de policies inchangé ailleurs) :
--   select count(*) from pg_policies where schemaname='public';
-- =============================================================================