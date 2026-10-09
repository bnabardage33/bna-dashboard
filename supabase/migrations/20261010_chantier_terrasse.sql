CREATE TABLE IF NOT EXISTS chantier_terrasses (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id                 uuid NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  entreprise_id               uuid NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  nom                         text NOT NULL DEFAULT 'Terrasse principale',
  systeme_terrasse            text NOT NULL DEFAULT 'bois_vis',
  zone_environnement          text NOT NULL DEFAULT 'normal',
  fabricant_composite         text,
  gamme_composite             text,
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

CREATE INDEX IF NOT EXISTS idx_chantier_terrasses_chantier
  ON chantier_terrasses (chantier_id);

CREATE INDEX IF NOT EXISTS idx_chantier_terrasses_entreprise
  ON chantier_terrasses (entreprise_id);

CREATE OR REPLACE FUNCTION tg_set_entreprise_par_chantier()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT c.entreprise_id INTO NEW.entreprise_id
    FROM chantiers c
   WHERE c.id = NEW.chantier_id;
  IF NEW.entreprise_id IS NULL THEN
    RAISE EXCEPTION 'chantier introuvable ou non autorise';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_auto_entreprise_terrasse ON chantier_terrasses;

CREATE TRIGGER tg_auto_entreprise_terrasse
  BEFORE INSERT OR UPDATE OF chantier_id ON chantier_terrasses
  FOR EACH ROW EXECUTE FUNCTION tg_set_entreprise_par_chantier();

ALTER TABLE chantier_terrasses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chantier_terrasses_ent_select ON chantier_terrasses;
DROP POLICY IF EXISTS chantier_terrasses_ent_insert ON chantier_terrasses;
DROP POLICY IF EXISTS chantier_terrasses_ent_update ON chantier_terrasses;
DROP POLICY IF EXISTS chantier_terrasses_ent_delete ON chantier_terrasses;

CREATE POLICY chantier_terrasses_ent_select ON chantier_terrasses FOR SELECT
  USING (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_terrasses_ent_insert ON chantier_terrasses FOR INSERT
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_terrasses_ent_update ON chantier_terrasses FOR UPDATE
  USING (entreprise_id = public.entreprise_courante())
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_terrasses_ent_delete ON chantier_terrasses FOR DELETE
  USING (entreprise_id = public.entreprise_courante());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE chantier_terrasses TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS chantier_terrasse_reservations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terrasse_id         uuid NOT NULL REFERENCES chantier_terrasses(id) ON DELETE CASCADE,
  entreprise_id       uuid NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  type_reservation    text NOT NULL DEFAULT 'trappe',
  nom                 text NOT NULL DEFAULT 'Reservation',
  x                   numeric NOT NULL DEFAULT 0.0,
  y                   numeric NOT NULL DEFAULT 0.0,
  largeur             numeric,
  longueur            numeric,
  diametre            numeric,
  metadata            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chantier_terrasse_reservations_terrasse
  ON chantier_terrasse_reservations (terrasse_id);

CREATE INDEX IF NOT EXISTS idx_chantier_terrasse_reservations_entreprise
  ON chantier_terrasse_reservations (entreprise_id);

CREATE OR REPLACE FUNCTION tg_set_entreprise_par_terrasse()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT t.entreprise_id INTO NEW.entreprise_id
    FROM chantier_terrasses t
   WHERE t.id = NEW.terrasse_id;
  IF NEW.entreprise_id IS NULL THEN
    RAISE EXCEPTION 'terrasse introuvable ou non autorisee';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_auto_entreprise_terrasse_reservations ON chantier_terrasse_reservations;

CREATE TRIGGER tg_auto_entreprise_terrasse_reservations
  BEFORE INSERT OR UPDATE OF terrasse_id ON chantier_terrasse_reservations
  FOR EACH ROW EXECUTE FUNCTION tg_set_entreprise_par_terrasse();

ALTER TABLE chantier_terrasse_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chantier_terrasse_reservations_ent_select ON chantier_terrasse_reservations;
DROP POLICY IF EXISTS chantier_terrasse_reservations_ent_insert ON chantier_terrasse_reservations;
DROP POLICY IF EXISTS chantier_terrasse_reservations_ent_update ON chantier_terrasse_reservations;
DROP POLICY IF EXISTS chantier_terrasse_reservations_ent_delete ON chantier_terrasse_reservations;

CREATE POLICY chantier_terrasse_reservations_ent_select ON chantier_terrasse_reservations FOR SELECT
  USING (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_terrasse_reservations_ent_insert ON chantier_terrasse_reservations FOR INSERT
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_terrasse_reservations_ent_update ON chantier_terrasse_reservations FOR UPDATE
  USING (entreprise_id = public.entreprise_courante())
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY chantier_terrasse_reservations_ent_delete ON chantier_terrasse_reservations FOR DELETE
  USING (entreprise_id = public.entreprise_courante());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE chantier_terrasse_reservations TO authenticated, service_role;
