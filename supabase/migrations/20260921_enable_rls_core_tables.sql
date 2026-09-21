-- =============================================================================
-- Sécurité : activation de la RLS sur les tables cœur + restriction à
-- auth.role() = 'authenticated' (lecture + écriture).
--
-- Contexte de l'audit (2026-09-21, vérification live via REST avec la clé
-- anon sur le projet connecté) :
--   * notes_patron, chantiers  -> la RLS live bloque déjà l'anonyme ;
--   * devis                    -> table vide : protection NON vérifiable,
--                                 verrouillée ici pour lever le doute ;
--   * parametres_entreprise    -> FUITE CONSTATÉE : 1 ligne lisible par
--     l'anonyme (dont tresorerie_actuelle / charges_fixes_mensuelles) alors
--     que 20260910_parametres_entreprise.sql déclare une politique
--     "authenticated" — preuve que la DB live diverge des migrations
--     (politique permissive créée au dashboard, ou RLS désactivée).
--
-- Stratégie (rend la migration DÉTERMINISTE pour ces 4 tables) :
--   1) activation RLS (idempotente) ;
--   2) suppression de TOUTES les policies existantes, y compris celles créées
--      au dashboard et invisibles dans le repo ;
--   3) création de 4 policies explicites réservées à auth.role()='authenticated'.
--
-- Impact flux existants (vérifié dans le code) :
--   * Portail client /espace-client (chat, signature, OTP, consolidation) :
--     passe par supabaseAdmin (service_role) -> contourne RLS, non impacté.
--   * Pages clientes du dashboard (bureau, terrain, finance) : derrière la
--     barrière du proxy (session requise) -> rôle authenticated -> autorisé.
--   * demo-client : route non publique -> session requise -> autorisé.
--
-- Idempotente : peut être relancée sans risque (DROP + CREATE).
-- =============================================================================

do $$
declare
  tbl text;
  r record;
begin
  foreach tbl in array array[
    'notes_patron',
    'chantiers',
    'devis',
    'parametres_entreprise'
  ] loop
    -- 1) RLS active (échec si la table n'existe pas : fail-closed)
    execute format('alter table public.%I enable row level security;', tbl);

    -- 2) Purge des policies existantes (dashboard comprises)
    for r in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = tbl
    loop
      execute format('drop policy if exists %I on public.%I;', r.policyname, tbl);
    end loop;

    -- 3) Policies authenticated-only
    execute format(
      'create policy %I on public.%I for select using (auth.role() = ''authenticated'');',
      tbl || '_select_authenticated', tbl
    );
    execute format(
      'create policy %I on public.%I for insert with check (auth.role() = ''authenticated'');',
      tbl || '_insert_authenticated', tbl
    );
    execute format(
      'create policy %I on public.%I for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');',
      tbl || '_update_authenticated', tbl
    );
    execute format(
      'create policy %I on public.%I for delete using (auth.role() = ''authenticated'');',
      tbl || '_delete_authenticated', tbl
    );
  end loop;
end $$;

-- Contrôle visuel : chaque table doit afficher exactement 4 policies.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('notes_patron', 'chantiers', 'devis', 'parametres_entreprise')
order by tablename, cmd;