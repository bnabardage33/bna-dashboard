
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
