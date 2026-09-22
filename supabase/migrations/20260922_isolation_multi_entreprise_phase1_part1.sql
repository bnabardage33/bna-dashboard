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
