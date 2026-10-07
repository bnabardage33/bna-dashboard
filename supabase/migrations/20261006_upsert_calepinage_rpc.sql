-- =============================================================================
-- RPC ATOMIQUE — upsert_calepinage_zone
-- Remplace atomiquement les modules et groupes de modules d'une zone
-- dans une unique transaction PostgreSQL.
-- =============================================================================

CREATE OR REPLACE FUNCTION upsert_calepinage_zone(
  p_zone_id UUID,
  p_entreprise_id UUID,
  p_groups JSONB,  -- tableau d'objets {group_number, width_mm, height_mm, is_rotated, is_flipped, treatment, material, count}
  p_modules JSONB  -- tableau d'objets {group_number, x_mm, y_mm, width_mm, height_mm, is_cut, is_rotated, is_flipped, treatment, material}
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

  -- Supprimer l'ancien calepinage
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
    (g->>'is_rotated')::BOOLEAN,
    (g->>'is_flipped')::BOOLEAN,
    (g->>'treatment')::TEXT,
    (g->>'material')::TEXT,
    (g->>'count')::INT
  FROM jsonb_array_elements(p_groups) AS g;

  -- Insérer les nouveaux modules
  INSERT INTO chantier_zones_modules (
    zone_id, entreprise_id, group_number, x_mm, y_mm,
    width_mm, height_mm, is_cut, is_rotated, is_flipped, treatment, material
  )
  SELECT
    p_zone_id,
    p_entreprise_id,
    (m->>'group_number')::TEXT,
    (m->>'x_mm')::INT,
    (m->>'y_mm')::INT,
    (m->>'width_mm')::INT,
    (m->>'height_mm')::INT,
    (m->>'is_cut')::BOOLEAN,
    (m->>'is_rotated')::BOOLEAN,
    (m->>'is_flipped')::BOOLEAN,
    (m->>'treatment')::TEXT,
    (m->>'material')::TEXT
  FROM jsonb_array_elements(p_modules) AS m;

END;
$$;

GRANT EXECUTE ON FUNCTION upsert_calepinage_zone(UUID, UUID, JSONB, JSONB) TO authenticated;
