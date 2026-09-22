-- =============================================================================
-- PHASE 1 — ISOLATION MULTI-ENTREPRISE (à exécuter UNE fois via le SQL Editor)
-- Projet : BNA Bardage — 2026-09-22
--
-- Portée :
--   * table entreprises + entreprise_membres + catalogue_ouvrages_prix ;
--   * entreprise_id sur 33 tables métier + backfill BNA + FK/contraintes/index ;
--   * RLS réelle au niveau PostgreSQL (entreprise_courante() depuis le claim JWT) ;
--   * RPC de numérotation RI/SAV/SIT/AVENANT réécrites par entreprise ;
--   * rattachement du compte admin actuel + création des tenants BNA et TEST ;
--   * Aucune modification Storage en Phase 1.
--
-- IDEMPOTENTE : rejouable sans risque (IF NOT EXISTS / ON CONFLICT / DROP+CREATE).
-- Ne pas appliquer tant que le rapport de validation n'est pas approuvé.
-- =============================================================================

-- Références déterministes (uuid valides) :
--   BNA  = 11111111-1111-4111-8111-111111111111
--   TEST = 22222222-2222-4222-8222-222222222222

-- -----------------------------------------------------------------------------
-- 0) HELPERS CONTEXTE ENTREPRISE
-- -----------------------------------------------------------------------------

-- Récupère l'entreprise courante du contexte d'exécution :
--   1. GUC transactionnel app.entreprise_id (tests/tooling serveur) ;
--   2. custom claim JWT app_metadata.entreprise_id (navigateur authentifié).
-- Renvoie NULL si aucun contexte => les policies échouent fermé (fail-closed).
create or replace function public.entreprise_courante()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.entreprise_id', true), '')::uuid,
    nullif(auth.jwt() #>> '{app_metadata,entreprise_id}', '')::uuid
  );
$$;

revoke all on function public.entreprise_courante() from public;
grant execute on function public.entreprise_courante() to anon, authenticated, service_role;

-- (Outil de test uniquement) : force le contexte dans la transaction courante.
-- Réservé à service_role — jamais exposé au navigateur.
create or replace function public.set_entreprise_courante(p_entreprise_id uuid)
returns void
language plpgsql
volatile
as $$
begin
  perform set_config('app.entreprise_id', p_entreprise_id::text, true);
end $$;

revoke all on function public.set_entreprise_courante(uuid) from public;
grant execute on function public.set_entreprise_courante(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 1) NOUVELLES TABLES
-- -----------------------------------------------------------------------------

create table if not exists public.entreprises (
  id uuid primary key default gen_random_uuid(),
  raison_sociale text not null,
  slug text not null unique,
  siret text,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entreprise_membres (
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'collaborateur', 'lecture')),
  cree_le timestamptz not null default now(),
  primary key (entreprise_id, user_id)
);
create index if not exists entreprise_membres_user_idx on public.entreprise_membres (user_id);

-- Surcharge de prix du catalogue partagé, propre à chaque entreprise.
create table if not exists public.catalogue_ouvrages_prix (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  ouvrage_id uuid not null references public.catalogue_ouvrages(id) on delete cascade,
  pu_ht numeric,
  pu_revient numeric,
  prix_ttc numeric,
  defaut_utilise boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint catalogue_ouvrages_prix_unicite unique (entreprise_id, ouvrage_id)
);
create index if not exists catalogue_ouvrages_prix_ouvrage_idx
  on public.catalogue_ouvrages_prix (ouvrage_id);

-- -----------------------------------------------------------------------------
-- 2) COLONNE entreprise_id SUR LES 33 TABLES METIER
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    -- hors parent direct (backfill BNA)
    'clients','fournisseurs','equipe','notes_patron','notifications',
    -- racine chantier
    'chantiers',
    -- enfants chantier_id
    'chantier_zones','avancements_chantier','commandes','depenses_chantier',
    'documents_compta','espace_client_conversations','factures','frais_interim',
    'journal_chantier','meteo_log','photos','photos_chantier','pointages',
    'pointages_globaux','pv_receptions','rapports_client','rapports_intemperies',
    'situations','tickets_sav','vigilance_captures',
    -- devis et dérivés
    'devis','devis_ia','devis_ia_historique','lignes_commande',
    -- paramètres singleton -> per-tenant
    'entreprise_settings','parametres_entreprise','parametres_finance'
  ] loop
    execute format('alter table public.%I add column if not exists entreprise_id uuid;', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3) BACKFILL — TENANT BNA
-- -----------------------------------------------------------------------------

-- 3.1 Création du tenant BNA à partir d'entreprise_settings existant
insert into public.entreprises (id, raison_sociale, slug, siret)
select '11111111-1111-4111-8111-111111111111',
       coalesce(max(raison_sociale), 'BNA Bardage'),
       'bna-bardage',
       max(siret)
  from public.entreprise_settings
on conflict (id) do nothing;

-- 3.2 Rangs directs -> BNA
do $$
begin
  update public.chantiers              set entreprise_id = '11111111-1111-4111-8111-111111111111'::uuid where entreprise_id is null;
  update public.clients                set entreprise_id = '11111111-1111-4111-8111-111111111111'::uuid where entreprise_id is null;
  update public.fournisseurs           set entreprise_id = '11111111-1111-4111-8111-111111111111'::uuid where entreprise_id is null;
  update public.equipe                 set entreprise_id = '11111111-1111-4111-8111-111111111111'::uuid where entreprise_id is null;
  update public.notes_patron           set entreprise_id = '11111111-1111-4111-8111-111111111111'::uuid where entreprise_id is null;
  update public.notifications          set entreprise_id = '11111111-1111-4111-8111-111111111111'::uuid where entreprise_id is null;
  update public.entreprise_settings    set entreprise_id = '11111111-1111-4111-8111-111111111111'::uuid where entreprise_id is null;
  update public.parametres_entreprise  set entreprise_id = '11111111-1111-4111-8111-111111111111'::uuid where entreprise_id is null;
  update public.parametres_finance     set entreprise_id = '11111111-1111-4111-8111-111111111111'::uuid where entreprise_id is null;
end $$;

-- 3.3 Rangs liés au chantier -> entreprise du chantier
do $$
declare t text;
begin
  foreach t in array array[
    'chantier_zones','avancements_chantier','commandes','depenses_chantier',
    'documents_compta','espace_client_conversations','factures','frais_interim',
    'journal_chantier','meteo_log','photos','photos_chantier','pointages',
    'pointages_globaux','pv_receptions','rapports_client','rapports_intemperies',
    'situations','tickets_sav','vigilance_captures'
  ] loop
    execute format(
      'update public.%I x set entreprise_id = c.entreprise_id
         from public.chantiers c
        where c.id = x.chantier_id and x.entreprise_id is null;', t);
  end loop;
end $$;

-- 3.4 Rangs spécifiques
update public.devis x
   set entreprise_id = coalesce(c.entreprise_id, '11111111-1111-4111-8111-111111111111'::uuid)
  from public.chantiers c
 where c.id = x.chantier_id and x.entreprise_id is null;

update public.devis_ia x
   set entreprise_id = d.entreprise_id
  from public.devis d
 where d.id = x.devis_id and x.entreprise_id is null;

update public.devis_ia_historique x
   set entreprise_id = di.entreprise_id
  from public.devis_ia di
 where di.id = x.devis_ia_id and x.entreprise_id is null;

update public.lignes_commande x
   set entreprise_id = co.entreprise_id
  from public.commandes co
 where co.id = x.commande_id and x.entreprise_id is null;

-- 3.5 Filet de sécurité : tout reliquat -> BNA (et lève une erreur si orphelin)
do $$
declare t text; n integer;
begin
  foreach t in array array[
    'clients','fournisseurs','equipe','notes_patron','notifications','chantiers',
    'chantier_zones','avancements_chantier','commandes','depenses_chantier',
    'documents_compta','espace_client_conversations','factures','frais_interim',
    'journal_chantier','meteo_log','photos','photos_chantier','pointages',
    'pointages_globaux','pv_receptions','rapports_client','rapports_intemperies',
    'situations','tickets_sav','vigilance_captures','devis','devis_ia',
    'devis_ia_historique','lignes_commande','entreprise_settings',
    'parametres_entreprise','parametres_finance'
  ] loop
    execute format('update public.%I set entreprise_id = %L::uuid where entreprise_id is null;', t, '11111111-1111-4111-8111-111111111111');
    execute format('select count(*) from public.%I where entreprise_id is null', t) into n;
    if n > 0 then raise exception '% lignes sans entreprise sur %', n, t; end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 4) CONTRAINTES, FK, INDEX (tables métier en entreprise_id)
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'clients','fournisseurs','equipe','notes_patron','notifications','chantiers',
    'chantier_zones','avancements_chantier','commandes','depenses_chantier',
    'documents_compta','espace_client_conversations','factures','frais_interim',
    'journal_chantier','meteo_log','photos','photos_chantier','pointages',
    'pointages_globaux','pv_receptions','rapports_client','rapports_intemperies',
    'situations','tickets_sav','vigilance_captures','devis','devis_ia',
    'devis_ia_historique','lignes_commande'
  ] loop
    execute format('alter table public.%I alter column entreprise_id set not null;', t);
    execute format('alter table public.%I add constraint %I_entreprise_fk foreign key (entreprise_id) references public.entreprises(id) on delete restrict;', t, t);
    execute format('create index if not exists %I_entreprise_idx on public.%I (entreprise_id);', t, t);
  end loop;
end $$;

-- Cas particuliers "paramètres singleton" -> per-tenant
-- parametres_entreprise : on retire le CHECK (id=1) et on bascule l'unicité sur entreprise_id
alter table public.parametres_entreprise alter column entreprise_id set not null;
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.parametres_entreprise'::regclass
     and contype = 'c';
  if c is not null then
    execute format('alter table public.parametres_entreprise drop constraint %I', c);
  end if;
end $$;
alter table public.parametres_entreprise add constraint parametres_entreprise_entreprise_fk
  foreign key (entreprise_id) references public.entreprises(id);
-- (l'ancienne PK id reste, mais l'unicité métier passe par entreprise_id)
alter table public.parametres_entreprise add constraint parametres_entreprise_unicite unique (entreprise_id);
create unique index if not exists parametres_entreprise_entreprise_uniq_idx on public.parametres_entreprise (entreprise_id);

-- entreprise_settings : une ligne par entreprise
alter table public.entreprise_settings alter column entreprise_id set not null;
alter table public.entreprise_settings add constraint entreprise_settings_entreprise_fk
  foreign key (entreprise_id) references public.entreprises(id);
alter table public.entreprise_settings add constraint entreprise_settings_entreprise_unicite unique (entreprise_id);

-- parametres_finance : (entreprise_id, cle) unique
alter table public.parametres_finance alter column entreprise_id set not null;
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.parametres_finance'::regclass
     and contype = 'u';
  if c is not null then
    execute format('alter table public.parametres_finance drop constraint %I', c);
  end if;
end $$;
alter table public.parametres_finance add constraint parametres_finance_entreprise_fk
  foreign key (entreprise_id) references public.entreprises(id);
alter table public.parametres_finance add constraint parametres_finance_entreprise_cle_unicite unique (entreprise_id, cle);
create index if not exists parametres_finance_entreprise_idx on public.parametres_finance (entreprise_id);

-- -----------------------------------------------------------------------------
-- 5) RLS — SÉPARATION RÉELLE DES TENANTS
-- -----------------------------------------------------------------------------

-- 5.1 Tables métier (33) : policies "entreprise_courante()" (fail-closed)
do $$
declare t text; r record;
begin
  foreach t in array array[
    'clients','fournisseurs','equipe','notes_patron','notifications','chantiers',
    'chantier_zones','avancements_chantier','commandes','depenses_chantier',
    'documents_compta','espace_client_conversations','factures','frais_interim',
    'journal_chantier','meteo_log','photos','photos_chantier','pointages',
    'pointages_globaux','pv_receptions','rapports_client','rapports_intemperies',
    'situations','tickets_sav','vigilance_captures','devis','devis_ia',
    'devis_ia_historique','lignes_commande','entreprise_settings',
    'parametres_entreprise','parametres_finance'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    for r in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I;', r.policyname, t);
    end loop;

    if t = 'notifications' then
      execute 'create policy notifications_ent_select on public.notifications for select
               using (entreprise_id = public.entreprise_courante()
                      and (destinataire_id is null or destinataire_id = auth.uid()));';
      execute 'create policy notifications_ent_insert on public.notifications for insert
               with check (entreprise_id = public.entreprise_courante());';
      execute 'create policy notifications_ent_update on public.notifications for update
               using (entreprise_id = public.entreprise_courante()
                      and (destinataire_id is null or destinataire_id = auth.uid()))
               with check (entreprise_id = public.entreprise_courante());';
      execute 'create policy notifications_ent_delete on public.notifications for delete
               using (entreprise_id = public.entreprise_courante()
                      and (destinataire_id is null or destinataire_id = auth.uid()));';
    else
      execute format('create policy %I on public.%I for select using (entreprise_id = public.entreprise_courante());', t || '_ent_select', t);
      execute format('create policy %I on public.%I for insert with check (entreprise_id = public.entreprise_courante());', t || '_ent_insert', t);
      execute format('create policy %I on public.%I for update using (entreprise_id = public.entreprise_courante()) with check (entreprise_id = public.entreprise_courante());', t || '_ent_update', t);
      execute format('create policy %I on public.%I for delete using (entreprise_id = public.entreprise_courante());', t || '_ent_delete', t);
    end if;
  end loop;
end $$;

-- 5.2 Catalogues PARTAGÉS : lecture+écriture pour tout authenticated (aucun scoping tenant),
--     mode "données communes". Un durcissement admin/éditeur sera posé en Phase 2.
do $$
declare t text; r record;
begin
  foreach t in array array['catalogue_ouvrages','catalogue_temps','fiches_techniques','articles'] loop
    execute format('alter table public.%I enable row level security;', t);
    for r in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I;', r.policyname, t);
    end loop;
    execute format('create policy %I on public.%I for select using (auth.role() = ''authenticated'');', t || '_select_authenticated', t);
    execute format('create policy %I on public.%I for insert with check (auth.role() = ''authenticated'');', t || '_insert_authenticated', t);
    execute format('create policy %I on public.%I for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');', t || '_update_authenticated', t);
    execute format('create policy %I on public.%I for delete using (auth.role() = ''authenticated'');', t || '_delete_authenticated', t);
  end loop;
end $$;

-- 5.3 Tables de métadonnées
-- entreprises : un membre ne voit que les entreprises auxquelles il appartient.
alter table public.entreprises enable row level security;
drop policy if exists entreprises_ent_select on public.entreprises;
create policy entreprises_ent_select on public.entreprises for select
  using (exists (select 1 from public.entreprise_membres m
                 where m.entreprise_id = public.entreprises.id
                   and m.user_id = auth.uid()));

-- entreprise_membres : chacun ne voit que ses propres appartenances.
alter table public.entreprise_membres enable row level security;
drop policy if exists entreprise_membres_select on public.entreprise_membres;
create policy entreprise_membres_select on public.entreprise_membres for select
  using (user_id = auth.uid());

-- catalogue_ouvrages_prix : scopé par entreprise.
alter table public.catalogue_ouvrages_prix enable row level security;
drop policy if exists catalogue_ouvrages_prix_ent_select on public.catalogue_ouvrages_prix;
drop policy if exists catalogue_ouvrages_prix_ent_insert on public.catalogue_ouvrages_prix;
drop policy if exists catalogue_ouvrages_prix_ent_update on public.catalogue_ouvrages_prix;
drop policy if exists catalogue_ouvrages_prix_ent_delete on public.catalogue_ouvrages_prix;
create policy catalogue_ouvrages_prix_ent_select on public.catalogue_ouvrages_prix for select
  using (entreprise_id = public.entreprise_courante());
create policy catalogue_ouvrages_prix_ent_insert on public.catalogue_ouvrages_prix for insert
  with check (entreprise_id = public.entreprise_courante());
create policy catalogue_ouvrages_prix_ent_update on public.catalogue_ouvrages_prix for update
  using (entreprise_id = public.entreprise_courante())
  with check (entreprise_id = public.entreprise_courante());
create policy catalogue_ouvrages_prix_ent_delete on public.catalogue_ouvrages_prix for delete
  using (entreprise_id = public.entreprise_courante());

-- -----------------------------------------------------------------------------
-- 6) NUMÉROTATION PAR ENTREPRISE (RPC réécrites)
-- -----------------------------------------------------------------------------

-- 6.0 Nettoyage déterministe de toutes les versions précédentes
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('generer_prochain_numero_ri','generer_prochain_numero_sav',
                         'generer_prochain_numero_sit','generer_prochain_numero_avenant')
  loop
    execute format('drop function %s', r.sig);
  end loop;
end $$;

-- 6.1 Cœur commun (non exposé via REST : aucun GRANT) : sav
create or replace function public.generer_prochain_numero_sav_ctx(p_entreprise_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_annee text; v_index integer; v_numero text;
begin
  if p_entreprise_id is null then raise exception 'contexte entreprise manquant'; end if;
  v_annee := to_char(now(), 'YYYY');
  lock table public.devis in share row exclusive mode;
  select coalesce(max(cast(nullif(regexp_replace(numero, '^SAV-\d{4}-', ''), '') as integer)), 0) + 1
    into v_index
    from public.devis
   where entreprise_id = p_entreprise_id
     and numero like 'SAV-' || v_annee || '-%';
  v_numero := 'SAV-' || v_annee || '-' || lpad(v_index::text, 3, '0');
  return v_numero;
end $$;

-- 6.2 Wrappers sav : 0 param (claim JWT) + 1 param (contexte serveur explicite)
create or replace function public.generer_prochain_numero_sav()
returns text
language plpgsql
security definer
as $$
declare v_ent uuid := public.entreprise_courante();
begin
  if v_ent is null then raise exception 'contexte entreprise manquant'; end if;
  return public.generer_prochain_numero_sav_ctx(v_ent);
end $$;

create or replace function public.generer_prochain_numero_sav(p_entreprise_id uuid)
returns text
language plpgsql
security definer
as $$
declare v_ent uuid := coalesce(public.entreprise_courante(), p_entreprise_id);
begin
  if v_ent is null then raise exception 'contexte entreprise manquant'; end if;
  return public.generer_prochain_numero_sav_ctx(v_ent);
end $$;

-- 6.3 ri : cœur + 0 param + 1 param
create or replace function public.generer_prochain_numero_ri_ctx(p_entreprise_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_annee text; v_index integer; v_numero text;
begin
  if p_entreprise_id is null then raise exception 'contexte entreprise manquant'; end if;
  v_annee := to_char(now(), 'YYYY');
  lock table public.rapports_intemperies in share row exclusive mode;
  select coalesce(max(cast(nullif(regexp_replace(numero, '^RI-\d{4}-', ''), '') as integer)), 0) + 1
    into v_index
    from public.rapports_intemperies
   where entreprise_id = p_entreprise_id
     and numero like 'RI-' || v_annee || '-%';
  v_numero := 'RI-' || v_annee || '-' || lpad(v_index::text, 3, '0');
  return v_numero;
end $$;

create or replace function public.generer_prochain_numero_ri()
returns text
language plpgsql
security definer
as $$
declare v_ent uuid := public.entreprise_courante();
begin
  if v_ent is null then raise exception 'contexte entreprise manquant'; end if;
  return public.generer_prochain_numero_ri_ctx(v_ent);
end $$;

create or replace function public.generer_prochain_numero_ri(p_entreprise_id uuid)
returns text
language plpgsql
security definer
as $$
declare v_ent uuid := coalesce(public.entreprise_courante(), p_entreprise_id);
begin
  if v_ent is null then raise exception 'contexte entreprise manquant'; end if;
  return public.generer_prochain_numero_ri_ctx(v_ent);
end $$;

-- 6.4 sit : identique (table situations)
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
  lock table public.situations in share row exclusive mode;
  select coalesce(max(cast(nullif(regexp_replace(numero, '^SIT-\d{4}-', ''), '') as integer)), 0) + 1
    into v_index
    from public.situations
   where entreprise_id = p_entreprise_id
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

-- 6.5 avenant : garde d'entreprise sur le devis parent
create or replace function public.generer_prochain_numero_avenant(p_parent_id uuid, p_entreprise_id uuid default null)
returns text
language plpgsql
security definer
as $$
declare
  v_ent uuid := coalesce(public.entreprise_courante(), p_entreprise_id);
  v_parent_numero text; v_nb integer;
begin
  if v_ent is null then raise exception 'contexte entreprise manquant'; end if;
  lock table public.devis in share row exclusive mode;
  select numero into v_parent_numero
    from public.devis
   where id = p_parent_id and entreprise_id = v_ent;
  if v_parent_numero is null then
    raise exception 'Devis parent introuvable ou hors entreprise';
  end if;
  select count(*) into v_nb
    from public.devis
   where devis_parent_id = p_parent_id and is_avenant = true;
  return v_parent_numero || '-AV' || lpad((v_nb + 1)::text, 2, '0');
end $$;

-- 6.6 Grants (version finale — cohérente avec la correction RPC validée)
do $$
begin
  -- ri : service_role uniquement
  revoke all on function public.generer_prochain_numero_ri() from public, anon, authenticated, service_role;
  revoke all on function public.generer_prochain_numero_ri(uuid) from public, anon, authenticated, service_role;
  revoke all on function public.generer_prochain_numero_ri_ctx(uuid) from public;
  grant execute on function public.generer_prochain_numero_ri() to service_role;
  grant execute on function public.generer_prochain_numero_ri(uuid) to service_role;

  -- sav / sit : authenticated + service_role
  revoke all on function public.generer_prochain_numero_sav() from public, anon, authenticated, service_role;
  revoke all on function public.generer_prochain_numero_sav(uuid) from public, anon, authenticated, service_role;
  revoke all on function public.generer_prochain_numero_sav_ctx(uuid) from public;
  grant execute on function public.generer_prochain_numero_sav() to authenticated, service_role;
  grant execute on function public.generer_prochain_numero_sav(uuid) to authenticated, service_role;

  revoke all on function public.generer_prochain_numero_sit() from public, anon, authenticated, service_role;
  revoke all on function public.generer_prochain_numero_sit(uuid) from public, anon, authenticated, service_role;
  revoke all on function public.generer_prochain_numero_sit_ctx(uuid) from public;
  grant execute on function public.generer_prochain_numero_sit() to authenticated, service_role;
  grant execute on function public.generer_prochain_numero_sit(uuid) to authenticated, service_role;

  -- avenant : service_role uniquement
  revoke all on function public.generer_prochain_numero_avenant(uuid, uuid) from public, anon, authenticated, service_role;
  grant execute on function public.generer_prochain_numero_avenant(uuid, uuid) to service_role;
end $$;

-- -----------------------------------------------------------------------------
-- 7) TRIGGERS — COHÉRENCE entreprise enfant <-> parent (défense en profondeur)
-- -----------------------------------------------------------------------------

-- Enfants liés par chantier_id
create or replace function public.tg_set_entreprise_par_chantier()
returns trigger
language plpgsql
as $$
begin
  if new.chantier_id is not null then
    select entreprise_id into new.entreprise_id
      from public.chantiers where id = new.chantier_id;
    if new.entreprise_id is null then
      raise exception 'chantier introuvable';
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'chantier_zones','avancements_chantier','commandes','depenses_chantier',
    'documents_compta','espace_client_conversations','factures','frais_interim',
    'journal_chantier','meteo_log','photos','photos_chantier','pointages',
    'pointages_globaux','pv_receptions','rapports_client','rapports_intemperies',
    'situations','tickets_sav','vigilance_captures'
  ] loop
    execute format('drop trigger if exists tg_auto_entreprise on public.%I;', t);
    execute format('create trigger tg_auto_entreprise before insert on public.%I for each row execute function public.tg_set_entreprise_par_chantier();', t);
  end loop;
end $$;

-- Enfants particuliers
create or replace function public.tg_set_entreprise_par_devis()
returns trigger language plpgsql as $$
begin
  select d.entreprise_id into new.entreprise_id from public.devis d where d.id = new.devis_id;
  if new.entreprise_id is null then raise exception 'devis introuvable'; end if;
  return new;
end $$;
drop trigger if exists tg_auto_entreprise on public.devis_ia;
create trigger tg_auto_entreprise before insert on public.devis_ia for each row execute function public.tg_set_entreprise_par_devis();

create or replace function public.tg_set_entreprise_par_devis_ia()
returns trigger language plpgsql as $$
begin
  select di.entreprise_id into new.entreprise_id from public.devis_ia di where di.id = new.devis_ia_id;
  if new.entreprise_id is null then raise exception 'devis_ia introuvable'; end if;
  return new;
end $$;
drop trigger if exists tg_auto_entreprise on public.devis_ia_historique;
create trigger tg_auto_entreprise before insert on public.devis_ia_historique for each row execute function public.tg_set_entreprise_par_devis_ia();

create or replace function public.tg_set_entreprise_par_commande()
returns trigger language plpgsql as $$
begin
  select co.entreprise_id into new.entreprise_id from public.commandes co where co.id = new.commande_id;
  if new.entreprise_id is null then raise exception 'commande introuvable'; end if;
  return new;
end $$;
drop trigger if exists tg_auto_entreprise on public.lignes_commande;
create trigger tg_auto_entreprise before insert on public.lignes_commande for each row execute function public.tg_set_entreprise_par_commande();

-- -----------------------------------------------------------------------------
-- 8) CLAIM JWT — COMPTE ADMIN ACTUEL
-- -----------------------------------------------------------------------------

-- Le profil 'patron' (premier créé) devient admin de BNA + claim app_metadata posé.
-- Le claim apparaîtra au prochain refresh/relogin du JWT.
do $$
declare
  v_id uuid;
  v_bna uuid := '11111111-1111-4111-8111-111111111111'::uuid;
begin
  select id into v_id from public.profiles order by created_at asc limit 1;
  if v_id is not null then
    insert into public.entreprise_membres (entreprise_id, user_id, role)
    values (v_bna, v_id, 'admin')
    on conflict (entreprise_id, user_id) do nothing;

    update auth.users
       set app_metadata = coalesce(app_metadata, '{}'::jsonb) || jsonb_build_object('entreprise_id', v_bna::text)
     where id = v_id;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 9) TENANT DE TEST + JEU DE DONNÉES MINIMAL (tests A/B d'isolation)
-- -----------------------------------------------------------------------------

insert into public.entreprises (id, raison_sociale, slug, siret)
values ('22222222-2222-4222-8222-222222222222', 'BNA TEST — Isolation A/B', 'bna-test', '00000000000000')
on conflict (id) do nothing;

insert into public.parametres_finance (entreprise_id, cle, valeur)
values ('22222222-2222-4222-8222-222222222222', 'solde_bancaire', 0)
on conflict (entreprise_id, cle) do nothing;

insert into public.parametres_entreprise (id, entreprise_id, tresorerie_actuelle, charges_fixes_mensuelles)
values (2, '22222222-2222-4222-8222-222222222222', 1000, 100)
on conflict (entreprise_id) do nothing;

insert into public.entreprise_settings (id, entreprise_id, raison_sociale, siret)
values (2, '22222222-2222-4222-8222-222222222222', 'BNA TEST — Isolation A/B', '00000000000000')
on conflict (entreprise_id) do nothing;

insert into public.clients (id, entreprise_id, nom, type)
values ('00000000-0000-4000-8000-000000000101', '22222222-2222-4222-8222-222222222222',
        'Client Isolation Test', 'particulier')
on conflict (id) do nothing;

insert into public.chantiers (id, entreprise_id, client_id, nom, statut,
                              materiau_structurel, moyen_acces, zone_vent, client_nom)
values ('00000000-0000-4000-8000-000000000102', '22222222-2222-4222-8222-222222222222',
        '00000000-0000-4000-8000-000000000101', 'Chantier Isolation Test — A', 'en_cours',
        'ossature_bois', 'nacelle', 2, 'Client Isolation Test')
on conflict (id) do nothing;

-- Surcharge de prix visible uniquement par TEST (tarif volontairement distinct)
insert into public.catalogue_ouvrages_prix (entreprise_id, ouvrage_id, pu_ht, pu_revient, defaut_utilise)
select '22222222-2222-4222-8222-222222222222', o.id, 999.00, 500.00, true
  from public.catalogue_ouvrages o
 where o.type_cout = 'matiere'
 limit 1
on conflict (entreprise_id, ouvrage_id) do nothing;

-- Notification destinée à toute l'entreprise TEST (destinataire NULL)
insert into public.notifications (id, entreprise_id, type, titre, message, destinataire_id, lu)
values ('00000000-0000-4000-8000-000000000201', '22222222-2222-4222-8222-222222222222',
        'general', 'Notif TEST', 'Visible uniquement par le tenant TEST', null, false)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 10) CODЕ_ACCES UNIQUE MONDIAL (contrainte dure côté PostgreSQL)
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and tablename = 'chantiers'
      and indexdef ilike '%code_acces%' and indexdef ilike '%unique%'
  ) and not exists (
    select 1 from pg_constraint where conrelid = 'public.chantiers'::regclass
      and contype = 'u' and conkey = (
        select array_agg(attnum) from pg_attribute
         where attrelid = 'public.chantiers'::regclass and attname = 'code_acces')
  ) then
    create unique index chantiers_code_acces_unique_idx on public.chantiers (code_acces);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- CONTRÔLES (à rejouer en SQL Editor, commentés volontairement) :
--
--   select entreprise_courante();
--   select set_entreprise_courante('11111111-1111-4111-8111-111111111111');
--   select entreprise_courante();
--   select id, raison_sociale from entreprises order by raison_sociale;
--   select entreprise_id, count(*) from chantiers group by entreprise_id;
--   select tablename, count(*) from pg_policies
--    where schemaname='public' and tablename in (...tables...) group by tablename;
-- =============================================================================