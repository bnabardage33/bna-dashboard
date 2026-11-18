-- =============================================================================
-- LOT 1 : Socle SQL unifié Finance & Multi-métiers (Bardage, Terrasse, Clôture)
-- =============================================================================

-- 1. Unification de public.parametres_entreprise comme source unique de vérité
ALTER TABLE public.parametres_entreprise
  ADD COLUMN IF NOT EXISTS tresorerie_actuelle numeric DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS charges_fixes_mensuelles numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taux_horaire_charge_defaut numeric DEFAULT 38,
  ADD COLUMN IF NOT EXISTS objectif_marge_pct numeric DEFAULT 25;

-- Reprise idempotente des soldes existants dans parametres_finance ('solde_bancaire')
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'parametres_finance'
  ) THEN
    INSERT INTO public.parametres_entreprise (entreprise_id, tresorerie_actuelle, charges_fixes_mensuelles)
    SELECT pf.entreprise_id, pf.valeur, 0
    FROM public.parametres_finance pf
    WHERE pf.cle = 'solde_bancaire'
      AND pf.entreprise_id IS NOT NULL
    ON CONFLICT (entreprise_id) DO UPDATE
      SET tresorerie_actuelle = COALESCE(public.parametres_entreprise.tresorerie_actuelle, EXCLUDED.tresorerie_actuelle);
  END IF;
END $$;

-- 2. Normalisation de public.chantiers.metier ('bardage', 'terrasse', 'cloture')
UPDATE public.chantiers
SET metier = CASE
  WHEN lower(coalesce(metier, '')) LIKE '%terrasse%' THEN 'terrasse'
  WHEN lower(coalesce(metier, '')) LIKE '%cloture%'
    OR lower(coalesce(metier, '')) LIKE '%clôture%' THEN 'cloture'
  ELSE 'bardage'
END
WHERE metier IS NULL
   OR metier NOT IN ('bardage', 'terrasse', 'cloture');

ALTER TABLE public.chantiers
  ALTER COLUMN metier SET DEFAULT 'bardage';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chantiers_metier_check'
      AND conrelid = 'public.chantiers'::regclass
  ) THEN
    ALTER TABLE public.chantiers
      ADD CONSTRAINT chantiers_metier_check
      CHECK (metier IN ('bardage', 'terrasse', 'cloture'));
  END IF;
END $$;

-- 3. Droits GRANT & politiques RLS cohérentes sur toutes les tables financières
DO $$
DECLARE
  t text;
  tables_fin text[] := ARRAY[
    'parametres_entreprise',
    'parametres_finance',
    'devis',
    'factures',
    'facture_reglements',
    'depenses_chantier',
    'pointages',
    'frais_interim',
    'documents_compta',
    'chantier_retenues_garantie',
    'commandes'
  ];
BEGIN
  FOREACH t IN ARRAY tables_fin LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated;', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', t);

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_ent_select', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (entreprise_id = public.entreprise_courante() OR public.entreprise_courante() IS NULL);',
        t || '_ent_select', t
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_ent_insert', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (entreprise_id = public.entreprise_courante() OR public.entreprise_courante() IS NULL);',
        t || '_ent_insert', t
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_ent_update', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (entreprise_id = public.entreprise_courante() OR public.entreprise_courante() IS NULL) WITH CHECK (entreprise_id = public.entreprise_courante() OR public.entreprise_courante() IS NULL);',
        t || '_ent_update', t
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_ent_delete', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (entreprise_id = public.entreprise_courante() OR public.entreprise_courante() IS NULL);',
        t || '_ent_delete', t
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
