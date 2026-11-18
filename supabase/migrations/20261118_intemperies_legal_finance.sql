-- =============================================================================
-- Migration idempotente : Évolution légale & financière du module Intempéries
-- (Bardage, Terrasse, Clôture)
-- =============================================================================

-- 1. Table public.rapports_intemperies
ALTER TABLE IF EXISTS public.rapports_intemperies
  ADD COLUMN IF NOT EXISTS heure_arret_constatee time,
  ADD COLUMN IF NOT EXISTS heures_perdues numeric(4,2) NOT NULL DEFAULT 7.0,
  ADD COLUMN IF NOT EXISTS repli_impossible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arret_decide_sur_place boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signature_data_url text;

-- 2. Vue public.rapports_intemperies_jours_arretes (portail client)
CREATE OR REPLACE VIEW public.rapports_intemperies_jours_arretes
WITH (security_invoker = true) AS
SELECT
  id,
  entreprise_id,
  chantier_id,
  numero,
  motif,
  jour_arrete,
  cree_le,
  pluie_cumul,
  rafales_max,
  vigilance_officielle,
  heure_arret_constatee,
  heures_perdues
FROM public.rapports_intemperies
WHERE jour_arrete = true;

GRANT SELECT ON public.rapports_intemperies_jours_arretes TO authenticated, service_role;

-- 3. Table public.chantiers
ALTER TABLE IF EXISTS public.chantiers
  ADD COLUMN IF NOT EXISTS heures_a_rattraper numeric(6,2) NOT NULL DEFAULT 0;

-- 4. Table public.pointages : paniers, déplacements et normalisation type_heure
ALTER TABLE IF EXISTS public.pointages
  ADD COLUMN IF NOT EXISTS panier_repas numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS indemnite_transport numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS indemnite_trajet numeric(6,2) NOT NULL DEFAULT 0;

UPDATE public.pointages
SET type_heure = CASE
  WHEN lower(coalesce(type_heure, '')) IN ('normale', 'productive', '') THEN 'productive'
  WHEN lower(coalesce(type_heure, '')) IN ('intemperie', 'intempérie', 'intempéries', 'intemperies') THEN 'intemperie'
  WHEN lower(coalesce(type_heure, '')) IN ('recuperation_intemperie', 'récupération', 'recuperation') THEN 'recuperation_intemperie'
  WHEN lower(coalesce(type_heure, '')) IN ('supplementaire', 'supplémentaire') THEN 'supplementaire'
  ELSE 'productive'
END
WHERE type_heure IS NULL
   OR type_heure NOT IN ('productive', 'intemperie', 'recuperation_intemperie', 'supplementaire');

ALTER TABLE IF EXISTS public.pointages
  ALTER COLUMN type_heure SET DEFAULT 'productive';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'pointages' AND constraint_name = 'pointages_type_heure_check'
  ) THEN
    ALTER TABLE public.pointages DROP CONSTRAINT pointages_type_heure_check;
  END IF;
  ALTER TABLE public.pointages
    ADD CONSTRAINT pointages_type_heure_check
    CHECK (type_heure IS NULL OR type_heure IN ('productive', 'intemperie', 'recuperation_intemperie', 'supplementaire'));
END $$;

NOTIFY pgrst, 'reload schema';
