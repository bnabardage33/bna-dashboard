-- ==============================================
-- CORRECTIF DE SÉCURITÉ — RLS tenant sur `frais_deplacement`
-- Projet : BNA Dashboard — 2026-10-15
--
-- FAILLE CORRIGÉE (référence : audit de sécurité, Section A.2)
-- La migration d'origine 20260929_create_frais_deplacement.sql (§3) a créé les
-- quatre policies RLS de `public.frais_deplacement` sur le seul prédicat :
--     auth.role() = 'authenticated'
-- AUCUN filtre `entreprise_id` n'y figurait. Conséquence : tout utilisateur
-- authentifié du tenant B pouvait, via le client anon et PostgREST (où la RLS
-- est la SEULE barrière), lire, modifier et supprimer les lignes
-- `frais_deplacement` du tenant A.
--
-- CORRECTIF
-- On DROP les quatre policies d'origine puis on les recrée avec le filtre
-- tenant : entreprise_id = public.entreprise_courante()
-- ==============================================

-- 1) SUPPRESSION DES POLICIES TROUÉES
drop policy if exists frais_deplacement_select_authenticated on public.frais_deplacement;
drop policy if exists frais_deplacement_insert_authenticated on public.frais_deplacement;
drop policy if exists frais_deplacement_update_authenticated on public.frais_deplacement;
drop policy if exists frais_deplacement_delete_authenticated on public.frais_deplacement;

-- 2) RECRÉATION — prédicat tenant + authentification
create policy frais_deplacement_select_tenant
  on public.frais_deplacement
  for select
  to authenticated
  using (
    entreprise_id = public.entreprise_courante()
    and auth.role() = 'authenticated'
  );

create policy frais_deplacement_insert_tenant
  on public.frais_deplacement
  for insert
  to authenticated
  with check (
    entreprise_id = public.entreprise_courante()
    and auth.role() = 'authenticated'
  );

create policy frais_deplacement_update_tenant
  on public.frais_deplacement
  for update
  to authenticated
  using (
    entreprise_id = public.entreprise_courante()
    and auth.role() = 'authenticated'
  )
  with check (
    entreprise_id = public.entreprise_courante()
    and auth.role() = 'authenticated'
  );

create policy frais_deplacement_delete_tenant
  on public.frais_deplacement
  for delete
  to authenticated
  using (
    entreprise_id = public.entreprise_courante()
    and auth.role() = 'authenticated'
  );

-- 3) INDEX DE SUPPORT
create index if not exists frais_deplacement_entreprise_idx
  on public.frais_deplacement (entreprise_id);
