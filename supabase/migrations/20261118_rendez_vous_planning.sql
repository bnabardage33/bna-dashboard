-- Migration idempotente : table rendez_vous pour le module Planning BNA
-- Alignée sur l'architecture multi-tenant de bna-dashboard (`public.entreprise_courante()`)

CREATE TABLE IF NOT EXISTS public.rendez_vous (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL DEFAULT COALESCE(
    public.entreprise_courante(),
    '11111111-1111-4111-8111-111111111111'::uuid
  ) REFERENCES public.entreprises(id) ON DELETE CASCADE,
  chantier_id uuid REFERENCES public.chantiers(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  titre text NOT NULL,
  nature text NOT NULL DEFAULT 'technique',
  date date NOT NULL,
  heure_debut text,
  heure_fin text,
  lieu text,
  notes text,
  statut text NOT NULL DEFAULT 'planifie' CHECK (statut IN ('planifie', 'confirme', 'effectue', 'annule')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rendez_vous_entreprise ON public.rendez_vous(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_rendez_vous_chantier ON public.rendez_vous(chantier_id);
CREATE INDEX IF NOT EXISTS idx_rendez_vous_date ON public.rendez_vous(date);

ALTER TABLE public.rendez_vous ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rendez_vous_ent_select" ON public.rendez_vous;
CREATE POLICY "rendez_vous_ent_select"
  ON public.rendez_vous
  FOR SELECT
  TO authenticated
  USING (
    entreprise_id = public.entreprise_courante()
    OR public.entreprise_courante() IS NULL
  );

DROP POLICY IF EXISTS "rendez_vous_ent_insert" ON public.rendez_vous;
CREATE POLICY "rendez_vous_ent_insert"
  ON public.rendez_vous
  FOR INSERT
  TO authenticated
  WITH CHECK (
    entreprise_id = public.entreprise_courante()
    OR public.entreprise_courante() IS NULL
  );

DROP POLICY IF EXISTS "rendez_vous_ent_update" ON public.rendez_vous;
CREATE POLICY "rendez_vous_ent_update"
  ON public.rendez_vous
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

DROP POLICY IF EXISTS "rendez_vous_ent_delete" ON public.rendez_vous;
CREATE POLICY "rendez_vous_ent_delete"
  ON public.rendez_vous
  FOR DELETE
  TO authenticated
  USING (
    entreprise_id = public.entreprise_courante()
    OR public.entreprise_courante() IS NULL
  );

NOTIFY pgrst, 'reload schema';
