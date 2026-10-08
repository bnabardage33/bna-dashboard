-- =============================================================================
-- MODULE RETENUE DE GARANTIE & RÉSERVES (LOI N° 71-584) — TRAÇABILITÉ DEVIS
-- Migration : 20261008_devis_retenue_garantie.sql
--
-- Portée :
--   1. Évolution rétrocompatible de public.devis :
--      - retenue_garantie_pct (numeric(5,2) NOT NULL DEFAULT 0.00)
--      - Contrainte CHECK chk_devis_rg_pct_range (0.00 <= retenue_garantie_pct <= 5.00)
--
-- Principe :
--   Le devis constitue la référence contractuelle de la retenue convenue entre
--   les parties (Art. 1er Loi 71-584). Le taux est automatiquement hérité lors de
--   la génération de factures (situations, solde).
--
-- Idempotence :
--   ALTER TABLE ... ADD COLUMN IF NOT EXISTS, DO $$ ... pg_constraint ... $$
-- =============================================================================

ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS retenue_garantie_pct numeric(5,2) NOT NULL DEFAULT 0.00;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_devis_rg_pct_range') THEN
    ALTER TABLE public.devis
      ADD CONSTRAINT chk_devis_rg_pct_range
      CHECK (retenue_garantie_pct >= 0.00 AND retenue_garantie_pct <= 5.00);
  END IF;
END $$;
