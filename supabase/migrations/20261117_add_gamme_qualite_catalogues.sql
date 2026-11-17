-- Migration : Catégorisation de gamme matériau en 4 niveaux (eco, standard, premium, prestige)
-- sur les catalogues Bardage, Terrasse (lames + accessoires) et Clôture.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'gamme_materiau_enum'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.gamme_materiau_enum AS ENUM ('eco', 'standard', 'premium', 'prestige');
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.catalogue_ouvrages
  ADD COLUMN IF NOT EXISTS gamme_qualite public.gamme_materiau_enum NOT NULL DEFAULT 'standard';

ALTER TABLE IF EXISTS public.catalogue_terrasse_lames
  ADD COLUMN IF NOT EXISTS gamme_qualite public.gamme_materiau_enum NOT NULL DEFAULT 'standard';

ALTER TABLE IF EXISTS public.catalogue_terrasse_accessoires
  ADD COLUMN IF NOT EXISTS gamme_qualite public.gamme_materiau_enum NOT NULL DEFAULT 'standard';

ALTER TABLE IF EXISTS public.catalogue_cloture
  ADD COLUMN IF NOT EXISTS gamme_qualite public.gamme_materiau_enum NOT NULL DEFAULT 'standard';

-- Backfill automatique Bardage (catalogue_ouvrages)
UPDATE public.catalogue_ouvrages
SET gamme_qualite = CASE
  WHEN COALESCE(designation, '') || ' ' || COALESCE(fabricant, '') || ' ' || COALESCE(gamme, '') ~* '(trespa\s*pura|trespa\s*lumen|rockpanel|accoya|shou\s*sugi\s*ban|bois\s*br[uû]l[eé])'
    THEN 'prestige'::public.gamme_materiau_enum
  WHEN COALESCE(designation, '') || ' ' || COALESCE(fabricant, '') || ' ' || COALESCE(gamme, '') ~* '(trespa|fundermax|weo|fiberon|trex|ip[eé]|cumaru|red\s*cedar)'
    THEN 'premium'::public.gamme_materiau_enum
  WHEN COALESCE(designation, '') || ' ' || COALESCE(fabricant, '') || ' ' || COALESCE(gamme, '') ~* '(pin\s*autoclave|\bpvc\b|alv[eé]olaire)'
    THEN 'eco'::public.gamme_materiau_enum
  ELSE 'standard'::public.gamme_materiau_enum
END;

-- Backfill automatique Terrasse Lames (catalogue_terrasse_lames)
UPDATE public.catalogue_terrasse_lames
SET gamme_qualite = CASE
  WHEN COALESCE(designation, '') || ' ' || COALESCE(fournisseur, '') || ' ' || COALESCE(essence, '') ~* '(trespa\s*pura|trespa\s*lumen|rockpanel|accoya|shou\s*sugi\s*ban|bois\s*br[uû]l[eé])'
    THEN 'prestige'::public.gamme_materiau_enum
  WHEN COALESCE(designation, '') || ' ' || COALESCE(fournisseur, '') || ' ' || COALESCE(essence, '') ~* '(trespa|fundermax|weo|fiberon|trex|ip[eé]|cumaru|red\s*cedar)'
    THEN 'premium'::public.gamme_materiau_enum
  WHEN COALESCE(designation, '') || ' ' || COALESCE(fournisseur, '') || ' ' || COALESCE(essence, '') ~* '(pin\s*autoclave|\bpvc\b|alv[eé]olaire)'
    THEN 'eco'::public.gamme_materiau_enum
  ELSE 'standard'::public.gamme_materiau_enum
END;

-- Backfill automatique Terrasse Accessoires (catalogue_terrasse_accessoires)
UPDATE public.catalogue_terrasse_accessoires
SET gamme_qualite = CASE
  WHEN COALESCE(designation, '') || ' ' || COALESCE(fournisseur, '') ~* '(trespa\s*pura|trespa\s*lumen|rockpanel|accoya|shou\s*sugi\s*ban|bois\s*br[uû]l[eé])'
    THEN 'prestige'::public.gamme_materiau_enum
  WHEN COALESCE(designation, '') || ' ' || COALESCE(fournisseur, '') ~* '(trespa|fundermax|weo|fiberon|trex|ip[eé]|cumaru|red\s*cedar)'
    THEN 'premium'::public.gamme_materiau_enum
  WHEN COALESCE(designation, '') || ' ' || COALESCE(fournisseur, '') ~* '(pin\s*autoclave|\bpvc\b|alv[eé]olaire)'
    THEN 'eco'::public.gamme_materiau_enum
  ELSE 'standard'::public.gamme_materiau_enum
END;

-- Backfill automatique Clôture (catalogue_cloture)
UPDATE public.catalogue_cloture
SET gamme_qualite = CASE
  WHEN COALESCE(designation, '') || ' ' || COALESCE(materiau, '') ~* '(trespa\s*pura|trespa\s*lumen|rockpanel|accoya|shou\s*sugi\s*ban|bois\s*br[uû]l[eé])'
    THEN 'prestige'::public.gamme_materiau_enum
  WHEN COALESCE(designation, '') || ' ' || COALESCE(materiau, '') ~* '(trespa|fundermax|weo|fiberon|trex|ip[eé]|cumaru|red\s*cedar)'
    THEN 'premium'::public.gamme_materiau_enum
  WHEN COALESCE(designation, '') || ' ' || COALESCE(materiau, '') ~* '(pin\s*autoclave|\bpvc\b|alv[eé]olaire)'
    THEN 'eco'::public.gamme_materiau_enum
  ELSE 'standard'::public.gamme_materiau_enum
END;
