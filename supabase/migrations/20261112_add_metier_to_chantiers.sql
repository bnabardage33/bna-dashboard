-- BNA DASHBOARD - MIGRATION MULTI-METIERS CHANTIER TERRASSE
-- Date: 2026-11-12

BEGIN;

-- 1. Ajout de la colonne metier sur chantiers
ALTER TABLE public.chantiers 
ADD COLUMN IF NOT EXISTS metier text NOT NULL DEFAULT 'bardage'
CHECK (metier IN ('bardage', 'terrasse', 'cloture'));

-- 2. Index par metier
CREATE INDEX IF NOT EXISTS idx_chantiers_entreprise_metier 
ON public.chantiers (entreprise_id, metier);

-- 3. Contrainte unicite chantier_terrasses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'uq_chantier_terrasses_chantier' 
       AND conrelid = 'public.chantier_terrasses'::regclass
  ) THEN
    ALTER TABLE public.chantier_terrasses
      ADD CONSTRAINT uq_chantier_terrasses_chantier UNIQUE (chantier_id);
  END IF;
END $$;

-- 4. Trigger d integrite metier
CREATE OR REPLACE FUNCTION public.tg_set_entreprise_par_chantier_terrasse()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_entreprise_id uuid;
  v_metier text;
BEGIN
  SELECT c.entreprise_id, c.metier 
    INTO v_entreprise_id, v_metier
    FROM public.chantiers c
   WHERE c.id = NEW.chantier_id;

  IF v_entreprise_id IS NULL THEN
    RAISE EXCEPTION 'Chantier introuvable ou non autorise';
  END IF;

  IF v_metier <> 'terrasse' THEN
    RAISE EXCEPTION 'Incoherence metier : le chantier % est de type %, impossible de lui associer une terrasse', NEW.chantier_id, v_metier;
  END IF;

  NEW.entreprise_id := v_entreprise_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_auto_entreprise_terrasse ON public.chantier_terrasses;

CREATE TRIGGER tg_auto_entreprise_terrasse
  BEFORE INSERT OR UPDATE OF chantier_id ON public.chantier_terrasses
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_entreprise_par_chantier_terrasse();

-- 5. Vues securisees avec security_invoker
CREATE OR REPLACE VIEW public.v_chantiers_bardage 
WITH (security_invoker = true) AS
SELECT * FROM public.chantiers 
WHERE metier = 'bardage';

CREATE OR REPLACE VIEW public.v_chantiers_terrasse 
WITH (security_invoker = true) AS
SELECT * FROM public.chantiers 
WHERE metier = 'terrasse';

GRANT SELECT ON public.v_chantiers_bardage TO authenticated, service_role;
GRANT SELECT ON public.v_chantiers_terrasse TO authenticated, service_role;

COMMIT;
