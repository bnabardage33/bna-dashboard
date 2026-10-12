-- =============================================================================
-- BNA DASHBOARD - MIGRATION DE STABILISATION & SÉCURISATION
-- Phase : SPRINT 1 (Intégrité des données & Soft Delete)
-- Date : 2026-10-12
-- Idempotente : DROP CONSTRAINT IF EXISTS, ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. MÉCANISME DE SOFT DELETE UNIFIÉ : archived_at
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients',
    'fournisseurs',
    'equipe',
    'chantiers',
    'devis',
    'factures',
    'commandes',
    'chantier_terrasses',
    'pv_receptions',
    'tickets_sav'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_actif ON public.%I (entreprise_id) WHERE archived_at IS NULL;', t, t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. REMPLACEMENT DES CASCADES DANGEREUSES PAR ON DELETE RESTRICT
-- -----------------------------------------------------------------------------

-- A. pv_receptions -> clients(id)
-- Un client ayant un PV légal ne doit JAMAIS disparaître en cascade silencieuse.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pv_receptions_client_id_fkey' AND conrelid = 'public.pv_receptions'::regclass
  ) THEN
    ALTER TABLE public.pv_receptions DROP CONSTRAINT pv_receptions_client_id_fkey;
  END IF;
  ALTER TABLE public.pv_receptions
    ADD CONSTRAINT pv_receptions_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;
END $$;

-- B. devis -> devis(devis_parent_id)
-- La suppression d'un devis racine ne doit pas détruire ses avenants contractuels.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'devis_devis_parent_id_fkey' AND conrelid = 'public.devis'::regclass
  ) THEN
    ALTER TABLE public.devis DROP CONSTRAINT devis_devis_parent_id_fkey;
  END IF;
  ALTER TABLE public.devis
    ADD CONSTRAINT devis_devis_parent_id_fkey
    FOREIGN KEY (devis_parent_id) REFERENCES public.devis(id) ON DELETE RESTRICT;
END $$;

-- C. chantier_retenues_garantie -> chantiers(id)
-- La retenue de garantie (5 %) est une obligation légale : interdiction de destruction accidentelle.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chantier_retenues_garantie_chantier_id_fkey' AND conrelid = 'public.chantier_retenues_garantie'::regclass
  ) THEN
    ALTER TABLE public.chantier_retenues_garantie DROP CONSTRAINT chantier_retenues_garantie_chantier_id_fkey;
  END IF;
  ALTER TABLE public.chantier_retenues_garantie
    ADD CONSTRAINT chantier_retenues_garantie_chantier_id_fkey
    FOREIGN KEY (chantier_id) REFERENCES public.chantiers(id) ON DELETE RESTRICT;
END $$;

-- D. chantier_terrasses -> chantiers(id)
-- Protège les calepinages et métrés complexes de terrasses contre les suppressions par inadvertance.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chantier_terrasses_chantier_id_fkey' AND conrelid = 'public.chantier_terrasses'::regclass
  ) THEN
    ALTER TABLE public.chantier_terrasses DROP CONSTRAINT chantier_terrasses_chantier_id_fkey;
  END IF;
  ALTER TABLE public.chantier_terrasses
    ADD CONSTRAINT chantier_terrasses_chantier_id_fkey
    FOREIGN KEY (chantier_id) REFERENCES public.chantiers(id) ON DELETE RESTRICT;
END $$;
