-- 20261016_create_catalogue_terrasse.sql
-- Dualisation catalogue : création de tables dédiées Terrasse (séparées de catalogue_ouvrages)

BEGIN;

-- ENUMs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_material_terrasse') THEN
    CREATE TYPE type_material_terrasse AS ENUM ('BOIS_NATUREL', 'COMPOSITE', 'PVC');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cat_accessoire_terrasse') THEN
    CREATE TYPE cat_accessoire_terrasse AS ENUM ('CLIP', 'LAMBOURDE', 'PLOT', 'VIS', 'BANDEROLE');
  END IF;
END$$;

-- 1. catalogue_terrasse_lames
CREATE TABLE IF NOT EXISTS public.catalogue_terrasse_lames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  reference_fournisseur VARCHAR(100),
  essence VARCHAR(100),
  type_material type_material_terrasse,
  longueur_mm INT CHECK (longueur_mm > 0),
  largeur_utile_mm DECIMAL(8,2) CHECK (largeur_utile_mm > 0),
  epaisseur_mm INT CHECK (epaisseur_mm >= 20 AND epaisseur_mm <= 30),
  prix_m2_ht DECIMAL(10,2) CHECK (prix_m2_ht >= 0),
  prix_unitaire_lame DECIMAL(10,2) CHECK (prix_unitaire_lame >= 0),
  image_url TEXT,
  fiche_technique_pdf TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. catalogue_terrasse_accessoires
CREATE TABLE IF NOT EXISTS public.catalogue_terrasse_accessoires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  categorie cat_accessoire_terrasse,
  materiel_compatibles JSONB,
  conditionnement VARCHAR(50),
  prix_conditionnement DECIMAL(10,2) CHECK (prix_conditionnement >= 0),
  unite_mesure VARCHAR(20),
  specifications_dt JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_catalogue_terrasse_lames_entreprise_id ON public.catalogue_terrasse_lames(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_catalogue_terrasse_accessoires_entreprise_id ON public.catalogue_terrasse_accessoires(entreprise_id);

-- RLS
ALTER TABLE public.catalogue_terrasse_lames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogue_terrasse_accessoires ENABLE ROW LEVEL SECURITY;

-- Politiques
DO $$
BEGIN
  -- lames
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='catalogue_terrasse_lames' AND policyname='catalogue_terrasse_lames_tenant') THEN
    EXECUTE $$CREATE POLICY catalogue_terrasse_lames_tenant ON public.catalogue_terrasse_lames
      USING (entreprise_id = public.entreprise_courante())
      WITH CHECK (entreprise_id = public.entreprise_courante());$$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='catalogue_terrasse_lames' AND policyname='catalogue_terrasse_lames_tenant_write') THEN
    EXECUTE $$CREATE POLICY catalogue_terrasse_lames_tenant_write ON public.catalogue_terrasse_lames
      FOR INSERT WITH CHECK (entreprise_id = public.entreprise_courante());$$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='catalogue_terrasse_lames' AND policyname='catalogue_terrasse_lames_tenant_update') THEN
    EXECUTE $$CREATE POLICY catalogue_terrasse_lames_tenant_update ON public.catalogue_terrasse_lames
      FOR UPDATE USING (entreprise_id = public.entreprise_courante()) WITH CHECK (entreprise_id = public.entreprise_courante());$$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='catalogue_terrasse_lames' AND policyname='catalogue_terrasse_lames_tenant_delete') THEN
    EXECUTE $$CREATE POLICY catalogue_terrasse_lames_tenant_delete ON public.catalogue_terrasse_lames
      FOR DELETE USING (entreprise_id = public.entreprise_courante());$$;
  END IF;

  -- accessoires
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='catalogue_terrasse_accessoires' AND policyname='catalogue_terrasse_accessoires_tenant') THEN
    EXECUTE $$CREATE POLICY catalogue_terrasse_accessoires_tenant ON public.catalogue_terrasse_accessoires
      USING (entreprise_id = public.entreprise_courante())
      WITH CHECK (entreprise_id = public.entreprise_courante());$$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='catalogue_terrasse_accessoires' AND policyname='catalogue_terrasse_accessoires_tenant_write') THEN
    EXECUTE $$CREATE POLICY catalogue_terrasse_accessoires_tenant_write ON public.catalogue_terrasse_accessoires
      FOR INSERT WITH CHECK (entreprise_id = public.entreprise_courante());$$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='catalogue_terrasse_accessoires' AND policyname='catalogue_terrasse_accessoires_tenant_update') THEN
    EXECUTE $$CREATE POLICY catalogue_terrasse_accessoires_tenant_update ON public.catalogue_terrasse_accessoires
      FOR UPDATE USING (entreprise_id = public.entreprise_courante()) WITH CHECK (entreprise_id = public.entreprise_courante());$$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='catalogue_terrasse_accessoires' AND policyname='catalogue_terrasse_accessoires_tenant_delete') THEN
    EXECUTE $$CREATE POLICY catalogue_terrasse_accessoires_tenant_delete ON public.catalogue_terrasse_accessoires
      FOR DELETE USING (entreprise_id = public.entreprise_courante());$$;
  END IF;
END$$;

COMMIT;
