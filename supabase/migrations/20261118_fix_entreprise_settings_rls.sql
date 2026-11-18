-- Migration idempotente : sécuriser l'INSERT/UPDATE/SELECT sur public.entreprise_settings
-- et garantir un DEFAULT sur entreprise_id si omis lors d'un insert client.

ALTER TABLE public.entreprise_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'entreprise_courante'
  ) THEN
    EXECUTE 'ALTER TABLE public.entreprise_settings ALTER COLUMN entreprise_id SET DEFAULT COALESCE(public.entreprise_courante(), ''11111111-1111-4111-8111-111111111111''::uuid)';
  END IF;
END $$;

DROP POLICY IF EXISTS "entreprise_settings_ent_select" ON public.entreprise_settings;
CREATE POLICY "entreprise_settings_ent_select"
  ON public.entreprise_settings
  FOR SELECT
  TO authenticated
  USING (
    entreprise_id = public.entreprise_courante()
    OR public.entreprise_courante() IS NULL
  );

DROP POLICY IF EXISTS "entreprise_settings_ent_insert" ON public.entreprise_settings;
CREATE POLICY "entreprise_settings_ent_insert"
  ON public.entreprise_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    entreprise_id = public.entreprise_courante()
    OR public.entreprise_courante() IS NULL
  );

DROP POLICY IF EXISTS "entreprise_settings_ent_update" ON public.entreprise_settings;
CREATE POLICY "entreprise_settings_ent_update"
  ON public.entreprise_settings
  FOR UPDATE
  TO authenticated
  USING (
    entreprise_id = public.entreprise_courante()
    OR public.entreprise_courante() IS NULL
  )
  WITH CHECK (
    entreprise_id = public.entreprise_courante()
    OR public.entreprise_courante() IS NULL
  );
