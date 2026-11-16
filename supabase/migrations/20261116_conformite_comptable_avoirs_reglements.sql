-- ============================================================================
-- 20261116_conformite_comptable_avoirs_reglements.sql
-- Conformité comptable & légale :
--   1. Avoirs (facture_origine_id + RPC generer_prochain_numero_avo -> AVO-YYYY-###)
--   2. Autoliquidation TVA sous-traitance BTP & SIREN client B2B
--   3. Table reglements_factures (paiements partiels & solde restant dû) + RLS
-- ============================================================================

BEGIN;

-- 1. Colonnes additionnelles sur factures, devis et clients (idempotent)
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS facture_origine_id UUID REFERENCES public.factures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS autoliquidation_tva BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS siren_client VARCHAR(20);

ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS autoliquidation_tva BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS siren_client VARCHAR(20);

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS siren_client VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_factures_facture_origine_id
  ON public.factures (facture_origine_id);

-- 2. RPC atomique de numérotation des Avoirs : AVO-YYYY-###
CREATE OR REPLACE FUNCTION public.generer_prochain_numero_avo_ctx(p_entreprise_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_annee text;
  v_index integer;
  v_numero text;
BEGIN
  IF p_entreprise_id IS NULL THEN
    RAISE EXCEPTION 'contexte entreprise manquant';
  END IF;
  v_annee := to_char(now(), 'YYYY');
  LOCK TABLE public.factures IN SHARE ROW EXCLUSIVE MODE;
  SELECT coalesce(max(cast(nullif(regexp_replace(numero, '^AVO-\d{4}-', ''), '') AS integer)), 0) + 1
    INTO v_index
    FROM public.factures
   WHERE entreprise_id = p_entreprise_id
     AND numero LIKE 'AVO-' || v_annee || '-%';
  v_numero := 'AVO-' || v_annee || '-' || lpad(v_index::text, 3, '0');
  RETURN v_numero;
END $$;

CREATE OR REPLACE FUNCTION public.generer_prochain_numero_avo()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ent uuid := public.entreprise_courante();
BEGIN
  IF v_ent IS NULL THEN
    RAISE EXCEPTION 'contexte entreprise manquant';
  END IF;
  RETURN public.generer_prochain_numero_avo_ctx(v_ent);
END $$;

CREATE OR REPLACE FUNCTION public.generer_prochain_numero_avo(p_entreprise_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ent uuid := coalesce(public.entreprise_courante(), p_entreprise_id);
BEGIN
  IF v_ent IS NULL THEN
    RAISE EXCEPTION 'contexte entreprise manquant';
  END IF;
  RETURN public.generer_prochain_numero_avo_ctx(v_ent);
END $$;

GRANT EXECUTE ON FUNCTION public.generer_prochain_numero_avo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generer_prochain_numero_avo(uuid) TO authenticated;

-- 3. Table reglements_factures (paiements partiels & suivi des encaissements)
CREATE TABLE IF NOT EXISTS public.reglements_factures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id UUID NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE DEFAULT public.entreprise_courante(),
  montant_ttc NUMERIC(12,2) NOT NULL CHECK (montant_ttc > 0),
  date_reglement DATE NOT NULL DEFAULT CURRENT_DATE,
  mode_paiement TEXT NOT NULL CHECK (mode_paiement IN ('virement', 'cheque', 'cb', 'especes', 'prelevement', 'autre')) DEFAULT 'virement',
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reglements_factures_facture_id
  ON public.reglements_factures (facture_id);

CREATE INDEX IF NOT EXISTS idx_reglements_factures_entreprise_id
  ON public.reglements_factures (entreprise_id);

ALTER TABLE public.reglements_factures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reglements_factures_ent_select ON public.reglements_factures;
DROP POLICY IF EXISTS reglements_factures_ent_insert ON public.reglements_factures;
DROP POLICY IF EXISTS reglements_factures_ent_update ON public.reglements_factures;
DROP POLICY IF EXISTS reglements_factures_ent_delete ON public.reglements_factures;

CREATE POLICY reglements_factures_ent_select
  ON public.reglements_factures
  FOR SELECT
  TO authenticated
  USING (
    auth.role() = 'authenticated'
    AND entreprise_id = public.entreprise_courante()
  );

CREATE POLICY reglements_factures_ent_insert
  ON public.reglements_factures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.role() = 'authenticated'
    AND entreprise_id = public.entreprise_courante()
  );

CREATE POLICY reglements_factures_ent_update
  ON public.reglements_factures
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

CREATE POLICY reglements_factures_ent_delete
  ON public.reglements_factures
  FOR DELETE
  TO authenticated
  USING (
    auth.role() = 'authenticated'
    AND entreprise_id = public.entreprise_courante()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reglements_factures TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
