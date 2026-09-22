
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
