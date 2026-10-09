-- =============================================================================
-- MODULE TERRASSE DÉTAILLÉ — Table chantier_terrasses
--
-- Portée :
--   * Sous-onglet métier indépendant « Terrasse » dans chantier/[id].
--   * Découplé du module Bardage (chantier_zones).
--   * DTU 51.4 (Platelages extérieurs en bois).
--   * Lambourdes, plots, lames, clips, escaliers, garde-corps, conformité.
--
-- Isolation multi-entreprise (pattern 20260922) :
--   * entreprise_id NOT NULL + FK entreprises(id) ;
--   * entreprise_id recopié depuis le chantier par trigger (tg_set_entreprise_par_chantier) ;
--   * RLS : entreprise_id = public.entreprise_courante() (fail-closed).
--
-- IDEMPOTENTE : CREATE ... IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) TABLE CHANTIER_TERRASSES
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chantier_terrasses (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id                 uuid NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  entreprise_id               uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  nom                         text NOT NULL DEFAULT 'Terrasse principale',

  -- Géométrie & Implantation
  longueur_m                  numeric NOT NULL DEFAULT 6.0 CHECK (longueur_m > 0),
  largeur_m                   numeric NOT NULL DEFAULT 4.0 CHECK (largeur_m > 0),
  hauteur_sol_cm              numeric NOT NULL DEFAULT 15.0 CHECK (hauteur_sol_cm >= 0),
  type_sol                    text NOT NULL DEFAULT 'dalle_beton'
                              CHECK (type_sol IN ('dalle_beton', 'terre_meuble', 'stabilise_grave', 'etancheite_toit')),
  pente_pct                   numeric NOT NULL DEFAULT 1.5 CHECK (pente_pct >= 0),

  -- Lames (Platelage)
  essence_bois                text NOT NULL DEFAULT 'pin_cl4'
                              CHECK (essence_bois IN ('pin_cl4', 'douglas', 'meleze', 'cumaru', 'ipe', 'composite', 'bambou_thermo')),
  type_pose                   text NOT NULL DEFAULT 'parallele'
                              CHECK (type_pose IN ('parallele', 'perpendiculaire', 'diagonale')),
  largeur_lame_mm             int NOT NULL DEFAULT 145 CHECK (largeur_lame_mm > 0),
  epaisseur_lame_mm           int NOT NULL DEFAULT 21 CHECK (epaisseur_lame_mm > 0),
  longueur_lame_m             numeric NOT NULL DEFAULT 4.0 CHECK (longueur_lame_m > 0),
  espacement_lames_mm         int NOT NULL DEFAULT 5 CHECK (espacement_lames_mm >= 2),
  type_fixation               text NOT NULL DEFAULT 'vis_inox'
                              CHECK (type_fixation IN ('vis_inox', 'clips_invisibles')),

  -- Lambourdes & Structure
  type_lambourde              text NOT NULL DEFAULT 'bois_cl4'
                              CHECK (type_lambourde IN ('bois_cl4', 'bois_exotique', 'alu_structure')),
  section_largeur_mm          int NOT NULL DEFAULT 45 CHECK (section_largeur_mm > 0),
  section_hauteur_mm          int NOT NULL DEFAULT 70 CHECK (section_hauteur_mm > 0),
  longueur_lambourde_m        numeric NOT NULL DEFAULT 4.0 CHECK (longueur_lambourde_m > 0),
  entraxe_lambourdes_cm       int NOT NULL DEFAULT 40 CHECK (entraxe_lambourdes_cm > 0),
  double_lambourdage_aboutage boolean NOT NULL DEFAULT true,
  bande_etancheite_epdm       boolean NOT NULL DEFAULT true,
  cales_isolation             boolean NOT NULL DEFAULT true,

  -- Plots & Supports
  type_plots                  text NOT NULL DEFAULT 'reglables'
                              CHECK (type_plots IN ('reglables', 'autonivelants', 'cales_plates', 'plots_beton', 'vis_fondation')),
  entraxe_plots_cm            int NOT NULL DEFAULT 60 CHECK (entraxe_plots_cm > 0),
  hauteur_reglage_plots       text NOT NULL DEFAULT '40_60'
                              CHECK (hauteur_reglage_plots IN ('20_30', '40_60', '60_90', '90_150', '150_260')),
  geotextile                  boolean NOT NULL DEFAULT true,

  -- Escaliers
  presence_escalier           boolean NOT NULL DEFAULT false,
  escalier_nb_marches         int NOT NULL DEFAULT 2 CHECK (escalier_nb_marches >= 1),
  escalier_largeur_m          numeric NOT NULL DEFAULT 2.0 CHECK (escalier_largeur_m > 0),
  escalier_giron_cm           numeric NOT NULL DEFAULT 28.0 CHECK (escalier_giron_cm > 0),
  escalier_hauteur_marche_cm  numeric NOT NULL DEFAULT 16.0 CHECK (escalier_hauteur_marche_cm > 0),

  -- Garde-corps (NF P01-012)
  presence_garde_corps        boolean NOT NULL DEFAULT false,
  garde_corps_longueur_ml     numeric NOT NULL DEFAULT 0.0 CHECK (garde_corps_longueur_ml >= 0),
  garde_corps_type            text NOT NULL DEFAULT 'bois_cables'
                              CHECK (garde_corps_type IN ('bois_cables', 'alu_verre', 'tout_bois', 'metal_barreaudage')),
  garde_corps_hauteur_cm      int NOT NULL DEFAULT 100 CHECK (garde_corps_hauteur_cm >= 80),

  -- Coefficients & Pertes
  coef_perte_lames            numeric NOT NULL DEFAULT 1.10 CHECK (coef_perte_lames >= 1.0),
  coef_perte_lambourdes       numeric NOT NULL DEFAULT 1.08 CHECK (coef_perte_lambourdes >= 1.0),

  -- Résultats techniques & conformité (persistance JSONB)
  resultats_techniques        jsonb,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2) INDEX
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS chantier_terrasses_chantier_idx
  ON public.chantier_terrasses (chantier_id);
CREATE INDEX IF NOT EXISTS chantier_terrasses_entreprise_idx
  ON public.chantier_terrasses (entreprise_id);

-- -----------------------------------------------------------------------------
-- 3) TRIGGER — entreprise_id recopié depuis chantiers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_set_entreprise_par_chantier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT c.entreprise_id INTO NEW.entreprise_id
    FROM public.chantiers c
   WHERE c.id = NEW.chantier_id;
  IF NEW.entreprise_id IS NULL THEN
    RAISE EXCEPTION 'chantier introuvable ou non autorisé';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_auto_entreprise_terrasse ON public.chantier_terrasses;
CREATE TRIGGER tg_auto_entreprise_terrasse
  BEFORE INSERT OR UPDATE OF chantier_id ON public.chantier_terrasses
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_entreprise_par_chantier();

-- -----------------------------------------------------------------------------
-- 4) RLS — séparation des tenants (fail-closed)
-- -----------------------------------------------------------------------------

ALTER TABLE public.chantier_terrasses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chantier_terrasses_ent_select ON public.chantier_terrasses;
DROP POLICY IF EXISTS chantier_terrasses_ent_insert ON public.chantier_terrasses;
DROP POLICY IF EXISTS chantier_terrasses_ent_update ON public.chantier_terrasses;
DROP POLICY IF EXISTS chantier_terrasses_ent_delete ON public.chantier_terrasses;

CREATE POLICY chantier_terrasses_ent_select ON public.chantier_terrasses FOR SELECT
  USING (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_terrasses_ent_insert ON public.chantier_terrasses FOR INSERT
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_terrasses_ent_update ON public.chantier_terrasses FOR UPDATE
  USING (entreprise_id = public.entreprise_courante())
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_terrasses_ent_delete ON public.chantier_terrasses FOR DELETE
  USING (entreprise_id = public.entreprise_courante());

-- -----------------------------------------------------------------------------
-- 5) GRANTS
-- -----------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chantier_terrasses TO authenticated, service_role;
