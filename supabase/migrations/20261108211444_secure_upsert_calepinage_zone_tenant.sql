-- Ferme l'escalade de tenant de la RPC SECURITY DEFINER du calepinage.
-- Le paramètre entreprise_id est gardé pour compatibilité avec la route, mais
-- n'est jamais une source d'autorité : il doit correspondre au claim signé.

CREATE OR REPLACE FUNCTION public.upsert_calepinage_zone(
  p_zone_id UUID,
  p_entreprise_id UUID,
  p_groups JSONB,
  p_modules JSONB,
  p_percages JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entreprise_id UUID;
BEGIN
  -- Ne jamais dériver l'autorisation du paramètre contrôlé par l'appelant ni
  -- d'une GUC modifiable : la source est le claim app_metadata signé du JWT.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Session authentifiée requise'
      USING ERRCODE = '42501';
  END IF;

  v_entreprise_id := NULLIF(
    auth.jwt() #>> '{app_metadata,entreprise_id}',
    ''
  )::UUID;

  IF v_entreprise_id IS NULL
     OR p_entreprise_id IS DISTINCT FROM v_entreprise_id THEN
    RAISE EXCEPTION 'Contexte entreprise invalide ou accès refusé'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.chantier_zones
    WHERE id = p_zone_id
      AND entreprise_id = v_entreprise_id
  ) THEN
    RAISE EXCEPTION 'Zone non trouvée ou accès refusé'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.chantier_zones_percages WHERE zone_id = p_zone_id;
  DELETE FROM public.chantier_zones_modules WHERE zone_id = p_zone_id;
  DELETE FROM public.chantier_zones_module_groups WHERE zone_id = p_zone_id;

  INSERT INTO public.chantier_zones_module_groups (
    zone_id, entreprise_id, group_number, width_mm, height_mm,
    is_rotated, is_flipped, treatment, material, count
  )
  SELECT
    p_zone_id,
    v_entreprise_id,
    (g->>'group_number')::TEXT,
    (g->>'width_mm')::INT,
    (g->>'height_mm')::INT,
    COALESCE((g->>'is_rotated')::BOOLEAN, false),
    COALESCE((g->>'is_flipped')::BOOLEAN, false),
    COALESCE((g->>'treatment')::TEXT, 'none'),
    COALESCE((g->>'material')::TEXT, 'default'),
    (g->>'count')::INT
  FROM jsonb_array_elements(p_groups) AS g;

  INSERT INTO public.chantier_zones_modules (
    id, zone_id, entreprise_id, group_number, x_mm, y_mm,
    width_mm, height_mm, is_cut, is_rotated, is_flipped, treatment, material
  )
  SELECT
    COALESCE((m->>'id')::UUID, gen_random_uuid()),
    p_zone_id,
    v_entreprise_id,
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

  IF p_percages IS NOT NULL AND jsonb_array_length(p_percages) > 0 THEN
    INSERT INTO public.chantier_zones_percages (
      zone_id, entreprise_id, module_id, x_mm, y_mm,
      diameter_mm, type, depth_mm
    )
    SELECT
      p_zone_id,
      v_entreprise_id,
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

-- La route serveur appelle cette RPC avec le JWT de la session.
-- Aucun accès anon/PUBLIC ou service_role n'est nécessaire.
REVOKE ALL ON FUNCTION public.upsert_calepinage_zone(UUID, UUID, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_calepinage_zone(UUID, UUID, JSONB, JSONB, JSONB)
  TO authenticated;

COMMENT ON FUNCTION public.upsert_calepinage_zone(UUID, UUID, JSONB, JSONB, JSONB) IS
  'Remplace atomiquement le calepinage d''une zone. Le tenant est dérivé du claim JWT app_metadata.entreprise_id et le paramètre p_entreprise_id doit lui correspondre.';
