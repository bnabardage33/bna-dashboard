-- Migration idempotente : droits et RLS sur parametres_entreprise et parametres_finance
-- pour la sauvegarde de la trésorerie dans Dashboard Patron.

ALTER TABLE public.parametres_entreprise ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parametres_finance ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.parametres_entreprise TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.parametres_finance TO authenticated;
GRANT ALL ON TABLE public.parametres_entreprise TO service_role;
GRANT ALL ON TABLE public.parametres_finance TO service_role;

DROP POLICY IF EXISTS "parametres_entreprise_ent_select" ON public.parametres_entreprise;
CREATE POLICY "parametres_entreprise_ent_select"
  ON public.parametres_entreprise
  FOR SELECT
  TO authenticated
  USING (
    entreprise_id = public.entreprise_courante()
    OR public.entreprise_courante() IS NULL
  );

DROP POLICY IF EXISTS "parametres_entreprise_ent_insert" ON public.parametres_entreprise;
CREATE POLICY "parametres_entreprise_ent_insert"
  ON public.parametres_entreprise
  FOR INSERT
  TO authenticated
  WITH CHECK (
    entreprise_id = public.entreprise_courante()
    OR public.entreprise_courante() IS NULL
  );

DROP POLICY IF EXISTS "parametres_entreprise_ent_update" ON public.parametres_entreprise;
CREATE POLICY "parametres_entreprise_ent_update"
  ON public.parametres_entreprise
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

NOTIFY pgrst, 'reload schema';
