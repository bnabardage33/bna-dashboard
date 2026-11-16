-- ============================================================================
-- 20261116_harden_catalogue_temps_tenant.sql
-- Isolation multi-entreprise, typage métier et contrainte d'unicité sur
-- `public.catalogue_temps` pour les cadences de pose et taux horaires.
-- ============================================================================

BEGIN;

-- 1. Ajout des colonnes manquantes (idempotent)
ALTER TABLE public.catalogue_temps
  ADD COLUMN IF NOT EXISTS entreprise_id UUID REFERENCES public.entreprises(id) ON DELETE CASCADE DEFAULT public.entreprise_courante(),
  ADD COLUMN IF NOT EXISTS metier TEXT CHECK (metier IN ('bardage', 'terrasse', 'commun')) DEFAULT 'commun',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Index de support et contrainte d'unicité (entreprise_id, nom_tache) pour les upserts
CREATE INDEX IF NOT EXISTS idx_catalogue_temps_entreprise_id
  ON public.catalogue_temps (entreprise_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogue_temps_entreprise_nom_tache_uidx
  ON public.catalogue_temps (entreprise_id, nom_tache);

-- 3. RLS multi-entreprise (remplace les policies ouvertes de 20260922)
ALTER TABLE public.catalogue_temps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalogue_temps_select_authenticated ON public.catalogue_temps;
DROP POLICY IF EXISTS catalogue_temps_insert_authenticated ON public.catalogue_temps;
DROP POLICY IF EXISTS catalogue_temps_update_authenticated ON public.catalogue_temps;
DROP POLICY IF EXISTS catalogue_temps_delete_authenticated ON public.catalogue_temps;
DROP POLICY IF EXISTS catalogue_temps_ent_select ON public.catalogue_temps;
DROP POLICY IF EXISTS catalogue_temps_ent_insert ON public.catalogue_temps;
DROP POLICY IF EXISTS catalogue_temps_ent_update ON public.catalogue_temps;
DROP POLICY IF EXISTS catalogue_temps_ent_delete ON public.catalogue_temps;

CREATE POLICY catalogue_temps_ent_select
  ON public.catalogue_temps
  FOR SELECT
  TO authenticated
  USING (
    auth.role() = 'authenticated'
    AND (entreprise_id = public.entreprise_courante() OR entreprise_id IS NULL)
  );

CREATE POLICY catalogue_temps_ent_insert
  ON public.catalogue_temps
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.role() = 'authenticated'
    AND entreprise_id = public.entreprise_courante()
  );

CREATE POLICY catalogue_temps_ent_update
  ON public.catalogue_temps
  FOR UPDATE
  TO authenticated
  USING (
    auth.role() = 'authenticated'
    AND entreprise_id = public.entreprise_courante()
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND entreprise_id = public.entreprise_courante()
  );

CREATE POLICY catalogue_temps_ent_delete
  ON public.catalogue_temps
  FOR DELETE
  TO authenticated
  USING (
    auth.role() = 'authenticated'
    AND entreprise_id = public.entreprise_courante()
  );

-- 4. Droits explicites pour le rôle authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_temps TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
