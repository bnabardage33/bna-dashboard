-- =============================================================================
-- Migration idempotente : EURL BTP Gironde (TVA multi-taux, Barème FFB, Intérim)
-- =============================================================================

-- 1. Table public.entreprises : Dépôt & Effectif FFB
ALTER TABLE IF EXISTS public.entreprises
  ADD COLUMN IF NOT EXISTS adresse_depot text,
  ADD COLUMN IF NOT EXISTS depot_lat double precision,
  ADD COLUMN IF NOT EXISTS depot_lng double precision,
  ADD COLUMN IF NOT EXISTS effectif_plus_10 boolean NOT NULL DEFAULT false;

-- 2. Table public.chantiers : TVA multi-taux & Zone de déplacement FFB
ALTER TABLE IF EXISTS public.chantiers
  ADD COLUMN IF NOT EXISTS taux_tva numeric(4,2) NOT NULL DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS zone_deplacement text,
  ADD COLUMN IF NOT EXISTS distance_vol_oiseau_km numeric(6,2);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'chantiers' AND constraint_name = 'chantiers_taux_tva_check'
  ) THEN
    ALTER TABLE public.chantiers DROP CONSTRAINT chantiers_taux_tva_check;
  END IF;
  ALTER TABLE public.chantiers
    ADD CONSTRAINT chantiers_taux_tva_check
    CHECK (taux_tva IN (5.50, 10.00, 20.00));

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'chantiers' AND constraint_name = 'chantiers_zone_deplacement_check'
  ) THEN
    ALTER TABLE public.chantiers DROP CONSTRAINT chantiers_zone_deplacement_check;
  END IF;
  ALTER TABLE public.chantiers
    ADD CONSTRAINT chantiers_zone_deplacement_check
    CHECK (
      zone_deplacement IS NULL
      OR zone_deplacement IN ('1A', '1B', '2', '3', '4', '5', 'GRAND_DEPLACEMENT')
    );
END $$;

-- 3. Table public.profiles : Statut emploi & Intérimaire
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS agence_interim text,
  ADD COLUMN IF NOT EXISTS type_contrat_interim text DEFAULT 'delegation',
  ADD COLUMN IF NOT EXISTS taux_horaire_brut numeric(6,2),
  ADD COLUMN IF NOT EXISTS coefficient_agence numeric(4,2) NOT NULL DEFAULT 2.00;

UPDATE public.profiles
SET statut_emploi = CASE
  WHEN lower(coalesce(statut_emploi, '')) IN ('gerant_tns', 'gerant', 'gérant') THEN 'gerant_tns'
  WHEN lower(coalesce(statut_emploi, '')) IN ('interimaire', 'intérimaire', 'interim') THEN 'interimaire'
  ELSE 'salarie'
END
WHERE statut_emploi IS NULL
   OR statut_emploi NOT IN ('gerant_tns', 'salarie', 'interimaire');

ALTER TABLE IF EXISTS public.profiles
  ALTER COLUMN statut_emploi SET DEFAULT 'salarie';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'profiles' AND constraint_name = 'profiles_statut_emploi_check'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_statut_emploi_check;
  END IF;
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_statut_emploi_check
    CHECK (statut_emploi IS NULL OR statut_emploi IN ('gerant_tns', 'salarie', 'interimaire'));

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'profiles' AND constraint_name = 'profiles_type_contrat_interim_check'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_type_contrat_interim_check;
  END IF;
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_type_contrat_interim_check
    CHECK (type_contrat_interim IS NULL OR type_contrat_interim IN ('delegation', 'gestion'));
END $$;

NOTIFY pgrst, 'reload schema';
