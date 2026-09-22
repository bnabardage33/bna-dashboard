
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
--
-- Colonne de métadonnées : détectée dynamiquement, car selon la version de
-- GoTrue, auth.users expose app_metadata (colonne générée, non modifiable) ou
-- raw_app_meta_data (stockage brut). On écrit TOUJOURS sur raw_app_meta_data
-- quand elle existe, sinon sur app_metadata.
do $$
declare
  v_id uuid;
  v_bna uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  v_col text;
  v_claim jsonb;
begin
  select id into v_id from public.profiles order by created_at asc limit 1;
  if v_id is null then
    raise notice 'aucun profile : claim JWT non posé';
    return;
  end if;

  insert into public.entreprise_membres (entreprise_id, user_id, role)
  values (v_bna, v_id, 'admin')
  on conflict (entreprise_id, user_id) do nothing;

  -- Détection de la colonne de métadonnées (raw_app_meta_data préférée)
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

  v_claim := jsonb_build_object('entreprise_id', v_bna::text);
  execute format(
    'update auth.users set %I = coalesce(%I, ''{}''::jsonb) || %L where id = %L',
    v_col, v_col, v_claim::text, v_id
  );
  raise notice 'claim % posé sur auth.users.% pour %', v_claim, v_col, v_id;
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