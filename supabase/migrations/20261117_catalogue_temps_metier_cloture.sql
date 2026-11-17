-- ============================================================================
-- Migration : Autoriser 'cloture' dans public.catalogue_temps.metier
-- Date      : 2026-11-17
-- ============================================================================

ALTER TABLE public.catalogue_temps
  DROP CONSTRAINT IF EXISTS catalogue_temps_metier_check;

ALTER TABLE public.catalogue_temps
  ADD CONSTRAINT catalogue_temps_metier_check
  CHECK (metier IS NULL OR metier IN ('bardage', 'terrasse', 'cloture', 'commun'));
