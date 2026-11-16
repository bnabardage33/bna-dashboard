-- ============================================================================
-- 20261116_chantier_cloture.sql
-- Socle base de données du 3e pilier métier : CLÔTURE (metier = 'cloture')
--   1. Extension de chantiers.metier & vue v_chantiers_cloture
--   2. Table catalogue_cloture (lames, poteaux, soubassements, portillons...)
--   3. Table chantier_clotures (configuration globale & résultats techniques)
--   4. Table chantier_cloture_troncons (segments A/B/C/D, pentes/redans, portillons)
--   5. Triggers d'intégrité métier + RLS multi-entreprise strict
-- ============================================================================

BEGIN;

-- 1. S'assurer que chantiers.metier accepte 'cloture'
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
    FROM pg_constraint
   WHERE conrelid = 'public.chantiers'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%metier%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.chantiers DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE public.chantiers
    ADD CONSTRAINT chantiers_metier_check
    CHECK (metier IN ('bardage', 'terrasse', 'cloture'));
END $$;

CREATE OR REPLACE VIEW public.v_chantiers_cloture
WITH (security_invoker = true) AS
SELECT * FROM public.chantiers
WHERE metier = 'cloture';

GRANT SELECT ON public.v_chantiers_cloture TO authenticated, service_role;

-- 2. Catalogue Clôture
CREATE TABLE IF NOT EXISTS public.catalogue_cloture (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id  uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE DEFAULT public.entreprise_courante(),
  categorie      text NOT NULL CHECK (categorie IN ('lame', 'panneau', 'poteau', 'soubassement', 'platine', 'portillon', 'accessoire')),
  materiau       text NOT NULL CHECK (materiau IN ('BOIS', 'COMPOSITE', 'ALU', 'BETON', 'ACIER')) DEFAULT 'COMPOSITE',
  reference      text,
  designation    text NOT NULL,
  longueur_m     numeric(6,3),
  hauteur_m      numeric(6,3),
  epaisseur_mm   integer,
  coloris        text,
  unite          text NOT NULL DEFAULT 'u',
  prix_achat_ht  numeric(10,2) NOT NULL DEFAULT 0,
  prix_vente_ht  numeric(10,2) NOT NULL DEFAULT 0,
  actif          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalogue_cloture_entreprise
  ON public.catalogue_cloture (entreprise_id, categorie);

ALTER TABLE public.catalogue_cloture ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalogue_cloture_ent_select ON public.catalogue_cloture;
DROP POLICY IF EXISTS catalogue_cloture_ent_insert ON public.catalogue_cloture;
DROP POLICY IF EXISTS catalogue_cloture_ent_update ON public.catalogue_cloture;
DROP POLICY IF EXISTS catalogue_cloture_ent_delete ON public.catalogue_cloture;

CREATE POLICY catalogue_cloture_ent_select ON public.catalogue_cloture
  FOR SELECT TO authenticated
  USING (entreprise_id = public.entreprise_courante());

CREATE POLICY catalogue_cloture_ent_insert ON public.catalogue_cloture
  FOR INSERT TO authenticated
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY catalogue_cloture_ent_update ON public.catalogue_cloture
  FOR UPDATE TO authenticated
  USING (entreprise_id = public.entreprise_courante())
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY catalogue_cloture_ent_delete ON public.catalogue_cloture
  FOR DELETE TO authenticated
  USING (entreprise_id = public.entreprise_courante());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalogue_cloture TO authenticated, service_role;

-- 3. Table principale chantier_clotures
CREATE TABLE IF NOT EXISTS public.chantier_clotures (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id             uuid NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  entreprise_id           uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  nom                     text NOT NULL DEFAULT 'Clôture principale',
  forme                   text NOT NULL CHECK (forme IN ('DROITE', 'EN_L', 'EN_U', '4_COTES', 'PERSONNALISEE')) DEFAULT 'DROITE',
  materiau                text NOT NULL CHECK (materiau IN ('BOIS', 'COMPOSITE', 'ALU', 'RIGIDE')) DEFAULT 'COMPOSITE',
  hauteur_utile_m         numeric(6,3) NOT NULL DEFAULT 1.80,
  longueur_lame_brute_m   numeric(6,3) NOT NULL DEFAULT 1.80,
  hauteur_lame_m          numeric(6,3) NOT NULL DEFAULT 0.15,
  extremites              text NOT NULL CHECK (extremites IN ('LIBRE', 'DEPART_MUR', 'ENTRE_MURS')) DEFAULT 'LIBRE',
  type_pose_sol           text NOT NULL CHECK (type_pose_sol IN ('DIRECT_SOL', 'SUR_MURET')) DEFAULT 'DIRECT_SOL',
  presence_soubassement   boolean NOT NULL DEFAULT false,
  hauteur_soubassement_m  numeric(6,3) DEFAULT 0.25,
  gestion_pente           text NOT NULL CHECK (gestion_pente IN ('PLAT', 'REDANS', 'SUIVI_PENTE')) DEFAULT 'PLAT',
  resultats_techniques    jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_chantier_clotures_chantier UNIQUE (chantier_id)
);

CREATE INDEX IF NOT EXISTS idx_chantier_clotures_chantier
  ON public.chantier_clotures (chantier_id);

CREATE INDEX IF NOT EXISTS idx_chantier_clotures_entreprise
  ON public.chantier_clotures (entreprise_id);

CREATE OR REPLACE FUNCTION public.tg_set_entreprise_par_chantier_cloture()
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
    RAISE EXCEPTION 'Chantier introuvable ou non autorisé';
  END IF;

  IF v_metier <> 'cloture' THEN
    RAISE EXCEPTION 'Incohérence métier : le chantier % est de type %, impossible de lui associer une clôture', NEW.chantier_id, v_metier;
  END IF;

  NEW.entreprise_id := v_entreprise_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_auto_entreprise_cloture ON public.chantier_clotures;

CREATE TRIGGER tg_auto_entreprise_cloture
  BEFORE INSERT OR UPDATE OF chantier_id ON public.chantier_clotures
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_entreprise_par_chantier_cloture();

ALTER TABLE public.chantier_clotures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chantier_clotures_ent_select ON public.chantier_clotures;
DROP POLICY IF EXISTS chantier_clotures_ent_insert ON public.chantier_clotures;
DROP POLICY IF EXISTS chantier_clotures_ent_update ON public.chantier_clotures;
DROP POLICY IF EXISTS chantier_clotures_ent_delete ON public.chantier_clotures;

CREATE POLICY chantier_clotures_ent_select ON public.chantier_clotures
  FOR SELECT TO authenticated
  USING (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_clotures_ent_insert ON public.chantier_clotures
  FOR INSERT TO authenticated
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_clotures_ent_update ON public.chantier_clotures
  FOR UPDATE TO authenticated
  USING (entreprise_id = public.entreprise_courante())
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_clotures_ent_delete ON public.chantier_clotures
  FOR DELETE TO authenticated
  USING (entreprise_id = public.entreprise_courante());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chantier_clotures TO authenticated, service_role;

-- 4. Table des tronçons (côtés A/B/C/D, dénivelés/redans et portillons)
CREATE TABLE IF NOT EXISTS public.chantier_cloture_troncons (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cloture_id           uuid NOT NULL REFERENCES public.chantier_clotures(id) ON DELETE CASCADE,
  chantier_id          uuid NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  entreprise_id        uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  code_segment         text NOT NULL DEFAULT 'A',
  ordre                integer NOT NULL DEFAULT 1,
  longueur_m           numeric(8,3) NOT NULL CHECK (longueur_m > 0),
  hauteur_utile_m      numeric(6,3),
  denivele_m           numeric(6,3) NOT NULL DEFAULT 0,
  nb_redans            integer NOT NULL DEFAULT 0,
  presence_portillon   boolean NOT NULL DEFAULT false,
  largeur_portillon_m  numeric(6,3),
  position_portillon_m numeric(6,3),
  type_depart          text NOT NULL DEFAULT 'TERMINAISON',
  type_arrivee         text NOT NULL DEFAULT 'TERMINAISON',
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chantier_cloture_troncons_cloture
  ON public.chantier_cloture_troncons (cloture_id, ordre);

CREATE INDEX IF NOT EXISTS idx_chantier_cloture_troncons_chantier
  ON public.chantier_cloture_troncons (chantier_id);

CREATE INDEX IF NOT EXISTS idx_chantier_cloture_troncons_entreprise
  ON public.chantier_cloture_troncons (entreprise_id);

DROP TRIGGER IF EXISTS tg_auto_entreprise_cloture_troncon ON public.chantier_cloture_troncons;

CREATE TRIGGER tg_auto_entreprise_cloture_troncon
  BEFORE INSERT OR UPDATE OF chantier_id ON public.chantier_cloture_troncons
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_entreprise_par_chantier_cloture();

ALTER TABLE public.chantier_cloture_troncons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chantier_cloture_troncons_ent_select ON public.chantier_cloture_troncons;
DROP POLICY IF EXISTS chantier_cloture_troncons_ent_insert ON public.chantier_cloture_troncons;
DROP POLICY IF EXISTS chantier_cloture_troncons_ent_update ON public.chantier_cloture_troncons;
DROP POLICY IF EXISTS chantier_cloture_troncons_ent_delete ON public.chantier_cloture_troncons;

CREATE POLICY chantier_cloture_troncons_ent_select ON public.chantier_cloture_troncons
  FOR SELECT TO authenticated
  USING (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_cloture_troncons_ent_insert ON public.chantier_cloture_troncons
  FOR INSERT TO authenticated
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_cloture_troncons_ent_update ON public.chantier_cloture_troncons
  FOR UPDATE TO authenticated
  USING (entreprise_id = public.entreprise_courante())
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_cloture_troncons_ent_delete ON public.chantier_cloture_troncons
  FOR DELETE TO authenticated
  USING (entreprise_id = public.entreprise_courante());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chantier_cloture_troncons TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
