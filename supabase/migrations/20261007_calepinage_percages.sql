-- =============================================================================
-- MODULE CALEPINAGE DÉTAILLÉ (PRO) — Table chantier_zones_percages & RPC enrichi
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.chantier_zones_percages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id     uuid        NOT NULL REFERENCES public.chantier_zones_modules(id) ON DELETE CASCADE,
  zone_id       uuid        NOT NULL REFERENCES public.chantier_zones(id) ON DELETE CASCADE,
  entreprise_id uuid        NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  x_mm          int         NOT NULL, -- position x du perçage dans le module (mm)
  y_mm          int         NOT NULL, -- position y du perçage dans le module (mm)
  diameter_mm   int         NOT NULL DEFAULT 6 CHECK (diameter_mm > 0),
  type          text        NOT NULL DEFAULT 'fixe' CHECK (type IN ('fixe', 'coulissante', 'invisible')),
  depth_mm      int,                  -- profondeur en mm si perçage non débouchant
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chantier_zones_percages_zone
  ON public.chantier_zones_percages(zone_id);
CREATE INDEX IF NOT EXISTS idx_chantier_zones_percages_module
  ON public.chantier_zones_percages(module_id);

-- -----------------------------------------------------------------------------
-- TRIGGER AUTO ENTREPRISE_ID
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_auto_entreprise ON public.chantier_zones_percages;
CREATE TRIGGER tg_auto_entreprise
  BEFORE INSERT OR UPDATE OF zone_id ON public.chantier_zones_percages
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_entreprise_par_zone();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.chantier_zones_percages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chantier_zones_percages_ent_select ON public.chantier_zones_percages;
DROP POLICY IF EXISTS chantier_zones_percages_ent_insert ON public.chantier_zones_percages;
DROP POLICY IF EXISTS chantier_zones_percages_ent_update ON public.chantier_zones_percages;
DROP POLICY IF EXISTS chantier_zones_percages_ent_delete ON public.chantier_zones_percages;

CREATE POLICY chantier_zones_percages_ent_select ON public.chantier_zones_percages FOR SELECT
  USING (entreprise_id = public.entreprise_courante());
CREATE POLICY chantier_zones_percages_ent_insert ON public.chantier_zones_percages FOR INSERT
  WITH CHECK (entreprise_id = public.entreprise_courante());
CREATE POLICY chantier_zones_percages_ent_update ON public.chantier_zones_percages FOR UPDATE
  USING (entreprise_id = public.entreprise_courante())
  WITH CHECK (entreprise_id = public.entreprise_courante());
CREATE POLICY chantier_zones_percages_ent_delete ON public.chantier_zones_percages FOR DELETE
  USING (entreprise_id = public.entreprise_courante());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chantier_zones_percages TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC ATOMIQUE — upsert_calepinage_zone (avec gestion des perçages)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_calepinage_zone(
  p_zone_id UUID,
  p_entreprise_id UUID,
  p_groups JSONB,
  p_modules JSONB,
  p_percages JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérifier que la zone appartient à l'entreprise
  IF NOT EXISTS (
    SELECT 1 FROM chantier_zones
    WHERE id = p_zone_id AND entreprise_id = p_entreprise_id
  ) THEN
    RAISE EXCEPTION 'Zone non trouvée ou accès refusé';
  END IF;

  -- Supprimer l'ancien calepinage (perçages supprimés en cascade ou explicitement)
  DELETE FROM chantier_zones_percages WHERE zone_id = p_zone_id;
  DELETE FROM chantier_zones_modules WHERE zone_id = p_zone_id;
  DELETE FROM chantier_zones_module_groups WHERE zone_id = p_zone_id;

  -- Insérer les nouveaux groupes
  INSERT INTO chantier_zones_module_groups (
    zone_id, entreprise_id, group_number, width_mm, height_mm,
    is_rotated, is_flipped, treatment, material, count
  )
  SELECT
    p_zone_id,
    p_entreprise_id,
    (g->>'group_number')::TEXT,
    (g->>'width_mm')::INT,
    (g->>'height_mm')::INT,
    COALESCE((g->>'is_rotated')::BOOLEAN, false),
    COALESCE((g->>'is_flipped')::BOOLEAN, false),
    COALESCE((g->>'treatment')::TEXT, 'none'),
    COALESCE((g->>'material')::TEXT, 'default'),
    (g->>'count')::INT
  FROM jsonb_array_elements(p_groups) AS g;

  -- Insérer les nouveaux modules avec conservation de leur UUID si fourni
  INSERT INTO chantier_zones_modules (
    id, zone_id, entreprise_id, group_number, x_mm, y_mm,
    width_mm, height_mm, is_cut, is_rotated, is_flipped, treatment, material
  )
  SELECT
    COALESCE((m->>'id')::UUID, gen_random_uuid()),
    p_zone_id,
    p_entreprise_id,
    (m->>'group_number')::TEXT,
    (m->>'x_mm')::INT,
    (m->>'y_mm')::INT,
    (m->>'width_mm')::INT,
    (m->>'height_mm')::INT,
    COALESCE((m->>'is_cut')::BOOLEAN, false),
    COALESCE((m->>'is_rotated')::BOOLEAN, false),
    COALESCE((m->>'is_flipped')::BOOLEAN, false),
    COALESCE((m->>'treatment')::TEXT, 'none'),
    COALESCE((m->>'material')::TEXT, 'default')
  FROM jsonb_array_elements(p_modules) AS m;

  -- Insérer les nouveaux perçages si fournis
  IF p_percages IS NOT NULL AND jsonb_array_length(p_percages) > 0 THEN
    INSERT INTO chantier_zones_percages (
      zone_id, entreprise_id, module_id, x_mm, y_mm,
      diameter_mm, type, depth_mm
    )
    SELECT
      p_zone_id,
      p_entreprise_id,
      (p->>'module_id')::UUID,
      (p->>'x_mm')::INT,
      (p->>'y_mm')::INT,
      COALESCE((p->>'diameter_mm')::INT, 6),
      COALESCE((p->>'type')::TEXT, 'fixe'),
      (p->>'depth_mm')::INT
    FROM jsonb_array_elements(p_percages) AS p;
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION upsert_calepinage_zone(UUID, UUID, JSONB, JSONB, JSONB) TO authenticated;
