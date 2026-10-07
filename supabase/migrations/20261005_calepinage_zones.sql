-- =============================================================================
-- MODULE CALEPINAGE DÉTAILLÉ — tables liées à chantier_zones
-- Tables : chantier_zones_ouvertures, chantier_zones_modules,
--          chantier_zones_module_groups
--
-- Portée :
--   * Calepinage détaillé d'une zone (ouvertures positionnées en mm, modules
--     posés, groupes de modules pour le bordereau).
--   * chantier_zones.ouvertures (JSONB) et chantier_zones.resultats_techniques
--     RESTENT EN PLACE (compatibilité ZoneCard / devis) : cette migration est
--     strictement additive.
--
-- Isolation multi-entreprise (pattern 20260922) :
--   * entreprise_id NOT NULL + FK entreprises(id) ;
--   * entreprise_id recopié depuis la zone par trigger (tg_auto_entreprise) ;
--   * RLS : entreprise_id = public.entreprise_courante() (fail-closed).
--
-- IDEMPOTENTE : CREATE ... IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) TABLES
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chantier_zones_ouvertures (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id       uuid        NOT NULL REFERENCES public.chantier_zones(id) ON DELETE CASCADE,
  entreprise_id uuid        NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  type          text        NOT NULL CHECK (type IN ('fenetre', 'porte', 'vide')),
  x_mm          int         NOT NULL,                       -- coin supérieur gauche
  y_mm          int         NOT NULL,                       -- coin supérieur gauche
  width_mm      int         NOT NULL CHECK (width_mm > 0),
  height_mm     int         NOT NULL CHECK (height_mm > 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chantier_zones_modules (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id       uuid        NOT NULL REFERENCES public.chantier_zones(id) ON DELETE CASCADE,
  entreprise_id uuid        NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  group_number  text        NOT NULL,                       -- ex : "G-001"
  x_mm          int         NOT NULL,
  y_mm          int         NOT NULL,
  width_mm      int         NOT NULL CHECK (width_mm > 0),
  height_mm     int         NOT NULL CHECK (height_mm > 0),
  is_cut        boolean     NOT NULL DEFAULT false,         -- module coupé en bordure
  is_rotated    boolean     NOT NULL DEFAULT false,
  is_flipped    boolean     NOT NULL DEFAULT false,         -- retourné sous-face
  treatment     text        NOT NULL DEFAULT 'none'
                CHECK (treatment IN ('none', 'bird-beak', 'miter', 'bevel')),
  material      text        NOT NULL DEFAULT 'default',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chantier_zones_module_groups (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id       uuid    NOT NULL REFERENCES public.chantier_zones(id) ON DELETE CASCADE,
  entreprise_id uuid    NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  group_number  text    NOT NULL,                           -- ex : "G-001"
  width_mm      int     NOT NULL CHECK (width_mm > 0),
  height_mm     int     NOT NULL CHECK (height_mm > 0),
  is_rotated    boolean NOT NULL DEFAULT false,
  is_flipped    boolean NOT NULL DEFAULT false,
  treatment     text    NOT NULL DEFAULT 'none'
                CHECK (treatment IN ('none', 'bird-beak', 'miter', 'bevel')),
  material      text    NOT NULL DEFAULT 'default',
  count         int     NOT NULL CHECK (count > 0),         -- nombre d'exemplaires
  UNIQUE (zone_id, group_number)
);

-- -----------------------------------------------------------------------------
-- 2) INDEX (FK non indexées par défaut ; servent aussi à la RLS)
--    NB : l'UNIQUE (zone_id, group_number) couvre déjà zone_id de module_groups.
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS chantier_zones_ouvertures_zone_idx
  ON public.chantier_zones_ouvertures (zone_id);
CREATE INDEX IF NOT EXISTS chantier_zones_ouvertures_entreprise_idx
  ON public.chantier_zones_ouvertures (entreprise_id);

CREATE INDEX IF NOT EXISTS chantier_zones_modules_zone_idx
  ON public.chantier_zones_modules (zone_id);
CREATE INDEX IF NOT EXISTS chantier_zones_modules_entreprise_idx
  ON public.chantier_zones_modules (entreprise_id);

CREATE INDEX IF NOT EXISTS chantier_zones_module_groups_entreprise_idx
  ON public.chantier_zones_module_groups (entreprise_id);

-- -----------------------------------------------------------------------------
-- 3) TRIGGER — entreprise_id recopié depuis chantier_zones
--    Joué à l'INSERT et quand zone_id change : l'entreprise de l'enfant ne peut
--    jamais diverger de celle de sa zone. Si la zone est introuvable (ou
--    invisible pour le tenant courant via RLS), l'écriture est rejetée.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_set_entreprise_par_zone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT z.entreprise_id INTO NEW.entreprise_id
    FROM public.chantier_zones z
   WHERE z.id = NEW.zone_id;
  IF NEW.entreprise_id IS NULL THEN
    RAISE EXCEPTION 'zone introuvable';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'chantier_zones_ouvertures',
    'chantier_zones_modules',
    'chantier_zones_module_groups'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_auto_entreprise ON public.%I;', t);
    EXECUTE format(
      'CREATE TRIGGER tg_auto_entreprise BEFORE INSERT OR UPDATE OF zone_id ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tg_set_entreprise_par_zone();', t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4) RLS — séparation des tenants (pattern 20260922 part2 §5.1)
-- -----------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'chantier_zones_ouvertures',
    'chantier_zones_modules',
    'chantier_zones_module_groups'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_ent_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_ent_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_ent_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_ent_delete', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT
                    USING (entreprise_id = public.entreprise_courante());',
                   t || '_ent_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT
                    WITH CHECK (entreprise_id = public.entreprise_courante());',
                   t || '_ent_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE
                    USING (entreprise_id = public.entreprise_courante())
                    WITH CHECK (entreprise_id = public.entreprise_courante());',
                   t || '_ent_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE
                    USING (entreprise_id = public.entreprise_courante());',
                   t || '_ent_delete', t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 5) GRANTS (cf. 20260922 part5 : sans GRANT, un SELECT authenticated échoue
--    avec « permission denied » avant même l'évaluation de la RLS)
-- -----------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chantier_zones_ouvertures   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chantier_zones_modules      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chantier_zones_module_groups TO authenticated, service_role;
