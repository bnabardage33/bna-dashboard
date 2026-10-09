CREATE TABLE IF NOT EXISTS public.chantier_terrasses (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id                 uuid NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  entreprise_id               uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  nom                         text NOT NULL DEFAULT 'Terrasse principale',
  longueur_m                  numeric NOT NULL DEFAULT 6.0,
  largeur_m                   numeric NOT NULL DEFAULT 4.0,
  hauteur_sol_cm              numeric NOT NULL DEFAULT 15.0,
  type_sol                    text NOT NULL DEFAULT 'dalle_beton',
  pente_pct                   numeric NOT NULL DEFAULT 1.5,
  essence_bois                text NOT NULL DEFAULT 'pin_cl4',
  type_pose                   text NOT NULL DEFAULT 'parallele',
  largeur_lame_mm             integer NOT NULL DEFAULT 145,
  epaisseur_lame_mm           integer NOT NULL DEFAULT 21,
  longueur_lame_m             numeric NOT NULL DEFAULT 4.0,
  espacement_lames_mm         integer NOT NULL DEFAULT 5,
  type_fixation               text NOT NULL DEFAULT 'vis_inox',
  type_lambourde              text NOT NULL DEFAULT 'bois_cl4',
  section_largeur_mm          integer NOT NULL DEFAULT 45,
  section_hauteur_mm          integer NOT NULL DEFAULT 70,
  longueur_lambourde_m        numeric NOT NULL DEFAULT 4.0,
  entraxe_lambourdes_cm       integer NOT NULL DEFAULT 40,
  double_lambourdage_aboutage boolean NOT NULL DEFAULT true,
  bande_etancheite_epdm       boolean NOT NULL DEFAULT true,
  cales_isolation             boolean NOT NULL DEFAULT true,
  type_plots                  text NOT NULL DEFAULT 'reglables',
  entraxe_plots_cm            integer NOT NULL DEFAULT 60,
  hauteur_reglage_plots       text NOT NULL DEFAULT '40_60',
  geotextile                  boolean NOT NULL DEFAULT true,
  presence_escalier           boolean NOT NULL DEFAULT false,
  escalier_nb_marches         integer DEFAULT 2,
  escalier_largeur_m          numeric DEFAULT 2.0,
  escalier_giron_cm           numeric DEFAULT 28.0,
  escalier_hauteur_marche_cm  numeric DEFAULT 16.0,
  presence_garde_corps        boolean NOT NULL DEFAULT false,
  garde_corps_longueur_ml     numeric DEFAULT 0.0,
  garde_corps_type            text DEFAULT 'bois_cables',
  garde_corps_hauteur_cm      integer DEFAULT 100,
  coef_perte_lames            numeric NOT NULL DEFAULT 1.10,
  coef_perte_lambourdes       numeric NOT NULL DEFAULT 1.08,
  resultats_techniques        jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chantier_terrasses_chantier_idx
  ON public.chantier_terrasses (chantier_id);

CREATE INDEX IF NOT EXISTS chantier_terrasses_entreprise_idx
  ON public.chantier_terrasses (entreprise_id);

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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chantier_terrasses TO authenticated, service_role;
