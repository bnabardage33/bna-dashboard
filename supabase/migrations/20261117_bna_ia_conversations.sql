-- ============================================================================
-- 20261117_bna_ia_conversations.sql
-- Historique sauvegardé des conversations BNA-IA (lecture, restauration,
-- suppression) isolé par entreprise_id (RLS multi-tenant).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.bna_ia_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE DEFAULT public.entreprise_courante(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  titre TEXT NOT NULL,
  metier TEXT NOT NULL DEFAULT 'general'
    CHECK (metier IN ('bardage', 'terrasse', 'cloture', 'general')),
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  dernier_prechiffrage TEXT,
  nb_messages INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bna_ia_conversations_entreprise_updated
  ON public.bna_ia_conversations (entreprise_id, updated_at DESC);

ALTER TABLE public.bna_ia_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bna_ia_conversations_ent_select ON public.bna_ia_conversations;
DROP POLICY IF EXISTS bna_ia_conversations_ent_insert ON public.bna_ia_conversations;
DROP POLICY IF EXISTS bna_ia_conversations_ent_update ON public.bna_ia_conversations;
DROP POLICY IF EXISTS bna_ia_conversations_ent_delete ON public.bna_ia_conversations;

CREATE POLICY bna_ia_conversations_ent_select
  ON public.bna_ia_conversations
  FOR SELECT
  TO authenticated
  USING (
    auth.role() = 'authenticated'
    AND entreprise_id = public.entreprise_courante()
  );

CREATE POLICY bna_ia_conversations_ent_insert
  ON public.bna_ia_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.role() = 'authenticated'
    AND entreprise_id = public.entreprise_courante()
  );

CREATE POLICY bna_ia_conversations_ent_update
  ON public.bna_ia_conversations
  FOR UPDATE
  TO authenticated
  USING (
    auth.role() = 'authenticated'
    AND entreprise_id = public.entreprise_courante()
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND entreprise_id = public.entreprise_courante()
  );

CREATE POLICY bna_ia_conversations_ent_delete
  ON public.bna_ia_conversations
  FOR DELETE
  TO authenticated
  USING (
    auth.role() = 'authenticated'
    AND entreprise_id = public.entreprise_courante()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bna_ia_conversations TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
