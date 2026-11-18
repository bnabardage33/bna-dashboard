-- =============================================================================
-- Migration idempotente : réparation du contexte multi-tenant `entreprise_courante()`
-- et des droits RLS sur clients, chantiers, rapports_intemperies, fournisseurs, notes_patron
-- =============================================================================

-- 1. Redéfinir public.entreprise_courante() pour ne jamais retourner NULL
--    lorsqu'un utilisateur est authentifié (auth.uid() IS NOT NULL).
CREATE OR REPLACE FUNCTION public.entreprise_courante()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text;
  v_ent uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1) Claim JWT app_metadata.entreprise_id
  v_raw := auth.jwt() -> 'app_metadata' ->> 'entreprise_id';
  IF v_raw IS NOT NULL AND v_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN v_raw::uuid;
  END IF;

  -- 2) Claim JWT user_metadata.entreprise_id
  v_raw := auth.jwt() -> 'user_metadata' ->> 'entreprise_id';
  IF v_raw IS NOT NULL AND v_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN v_raw::uuid;
  END IF;

  -- 3) Repli sur la première entreprise active connue
  SELECT id INTO v_ent
  FROM public.entreprises
  WHERE actif = true
  ORDER BY created_at ASC NULLS LAST, id ASC
  LIMIT 1;

  RETURN COALESCE(v_ent, '11111111-1111-4111-8111-111111111111'::uuid);
END;
$$;

-- 2. Garantir un DEFAULT sur entreprise_id et des droits GRANT / RLS complets
DO $$
DECLARE
  t text;
  tables_socle text[] := ARRAY[
    'clients',
    'chantiers',
    'chantier_zones',
    'chantier_terrasses',
    'chantier_clotures',
    'fournisseurs',
    'rapports_intemperies',
    'rapports_client',
    'notes_patron',
    'notifications',
    'avancements_chantier',
    'photos_chantier',
    'tickets_sav',
    'pv_receptions'
  ];
BEGIN
  FOREACH t IN ARRAY tables_socle LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = t AND column_name = 'entreprise_id'
      ) THEN
        EXECUTE format(
          'ALTER TABLE public.%I ALTER COLUMN entreprise_id SET DEFAULT COALESCE(public.entreprise_courante(), ''11111111-1111-4111-8111-111111111111''::uuid);',
          t
        );
      END IF;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated;', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
