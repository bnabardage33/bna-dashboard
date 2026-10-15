-- =============================================================================
-- CORRECTIF DE SÉCURITÉ — RLS tenant sur `frais_deplacement`
-- Projet : BNA Dashboard — 2026-10-15
--
-- FAILLE CORRIGÉE (référence : audit de sécurité, Section A.2)
-- -------------------------------------------------------------
-- La migration d'origine 20260929_create_frais_deplacement.sql (§3) a créé les
-- quatre policies RLS de `public.frais_deplacement` sur le seul prédicat :
--
--     auth.role() = 'authenticated'
--
-- AUCUN filtre `entreprise_id` n'y figurait. Conséquence : tout utilisateur
-- authentifié du tenant B pouvait, via le client anon et PostgREST (où la RLS
-- est la SEULE barrière), lire, modifier et supprimer les lignes
-- `frais_deplacement` du tenant A. Les routes applicatives filtrent bien via
-- `supabaseAdmin` + `.eq("entreprise_id", …)`, mais la couche RLS supposée les
-- rattraper était absente : l'isolation inter-entreprise n'était pas garantie
-- au niveau base.
--
-- La migration 20260929_harden_lier_deplacement_devis.sql documentait déjà ce
-- trou (§ commentaire « Les policies RLS de frais_deplacement sont
-- auth.role() = 'authenticated' SANS filtre entreprise_id : rien ne bloquait
-- l'appel ») sans le corriger.
--
-- CORRECTIF
-- ---------
-- On DROP les quatre policies d'origine puis on les recrée avec le filtre
-- tenant, sur le modèle déjà utilisé par les tables cloisonnées du dépôt
-- (cf. 20261010_chantier_terrasse.sql, 20261011_emails_envoyes.sql) :
--
--     entreprise_id = public.entreprise_courante()
--
-- `public.entreprise_courante()` (20260922_isolation_multi_entreprise_phase1
-- part1) est la SOURCE DE VÉRITÉ multi-tenant : elle lit le claim
-- `app_metadata.entreprise_id` du JWT (ou le GUC `app.entreprise_id` pour les
-- outils serveur) et renvoie NULL si aucun contexte — ce qui fait ÉCHOUER FERMÉ.
--
-- IDEMPOTENTE : DROP POLICY IF EXISTS + CREATE, rejouable sans risque.
-- Aucune donnée n'est modifiée : seules les policies sont remplacées.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) SUPPRESSION DES POLICIES TROUÉES (auth.role() seul)
-- -----------------------------------------------------------------------------

drop policy if exists frais_deplacement_select_authenticated on public.frais_deplacement;
drop policy if exists frais_deplacement_insert_authenticated on public.frais_deplacement;
drop policy if exists frais_deplacement_update_authenticated on public.frais_deplacement;
drop policy if exists frais_deplacement_delete_authenticated on public.frais_deplacement;

-- -----------------------------------------------------------------------------
-- 2) RECRÉATION — prédicat tenant + authentification
--    Le double prédicat est volontaire : `auth.role() = 'authenticated'` écarte
--    la clé anon nue, `entreprise_id = entreprise_courante()` cloisonne le
--    tenant. `entreprise_courante()` NULL => aucune ligne (fail-closed).
-- -----------------------------------------------------------------------------

-- SELECT : un tenant ne voit que ses propres déplacements.
create policy frais_deplacement_select_tenant
  on public.frais_deplacement
  for select
  to authenticated
  using (
    entreprise_id = public.entreprise_courante()
    and auth.role() = 'authenticated'
  );

-- INSERT : un tenant ne peut créer que des lignes de sa propre entreprise.
create policy frais_deplacement_insert_tenant
  on public.frais_deplacement
  for insert
  to authenticated
  with check (
    entreprise_id = public.entreprise_courante()
    and auth.role() = 'authenticated'
  );

-- UPDATE : ne cible que ses lignes, et ne peut pas réécrire `entreprise_id`
-- pour basculer la ligne vers un autre tenant (WITH CHECK).
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

-- DELETE : ne supprime que ses propres déplacements.
create policy frais_deplacement_delete_tenant
  on public.frais_deplacement
  for delete
  to authenticated
  using (
    entreprise_id = public.entreprise_courante()
    and auth.role() = 'authenticated'
  );

-- -----------------------------------------------------------------------------
-- 3) INDEX DE SUPPORT
--    Le prédicat RLS filtre désormais sur `entreprise_id` : l'index évite un
--    scan complet à chaque lecture. Idempotent.
-- -----------------------------------------------------------------------------

create index if not exists frais_deplacement_entreprise_idx
  on public.frais_deplacement (entreprise_id);

-- -----------------------------------------------------------------------------
-- 4) VÉRIFICATION POST-MIGRATION (à exécuter manuellement)
--    Doit lister 4 policies « _tenant » et AUCUNE « _authenticated ».
-- -----------------------------------------------------------------------------
-- select policyname, cmd, qual, with_check
--   from pg_policies
--  where schemaname = 'public' and tablename = 'frais_deplacement'
--  order by policyname;
