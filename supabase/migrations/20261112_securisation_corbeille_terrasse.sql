-- =============================================================================
-- BNA DASHBOARD — MIGRATION PRÉPARÉE : CORBEILLE ET SOFT DELETE SÉCURISÉ TERRASSE
-- Date : 2026-11-12
-- Statut : À EXÉCUTER UNIQUEMENT APRÈS VALIDATION EXPLICITE DE L'UTILISATEUR
-- Idempotente : ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS
-- =============================================================================

-- 1. Ajout des colonnes d'archivage / corbeille sur chantiers
ALTER TABLE public.chantiers 
ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;

ALTER TABLE public.chantiers 
ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

ALTER TABLE public.chantiers 
ADD COLUMN IF NOT EXISTS deleted_by uuid DEFAULT NULL;

-- 2. Index de performance pour filtrer rapidement les chantiers actifs et corbeille
CREATE INDEX IF NOT EXISTS idx_chantiers_actif_metier 
ON public.chantiers (entreprise_id, metier) 
WHERE archived_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chantiers_corbeille 
ON public.chantiers (entreprise_id, deleted_at) 
WHERE deleted_at IS NOT NULL;
