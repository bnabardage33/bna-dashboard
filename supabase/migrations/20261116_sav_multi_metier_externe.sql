-- ============================================================================
-- 20261116_sav_multi_metier_externe.sql
-- Refonte SAV & Garantie multi-métiers (Bardage, Terrasse & Mobile, Clôture)
-- et support des interventions indépendantes sur clients externes :
--   1. tickets_sav.chantier_id rendu NULLABLE
--   2. Ajout de type_origine, client_id, metier, type_garantie, pv_reception_id, facturable
--   3. Index de recherche & rechargement du schéma PostgREST
-- ============================================================================

BEGIN;

ALTER TABLE public.tickets_sav
  ALTER COLUMN chantier_id DROP NOT NULL;

ALTER TABLE public.tickets_sav
  ADD COLUMN IF NOT EXISTS type_origine TEXT NOT NULL DEFAULT 'chantier_bna'
    CHECK (type_origine IN ('chantier_bna', 'client_externe')),
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metier TEXT NOT NULL DEFAULT 'bardage'
    CHECK (metier IN ('bardage', 'terrasse', 'cloture')),
  ADD COLUMN IF NOT EXISTS type_garantie TEXT DEFAULT 'decennale_10ans'
    CHECK (type_garantie IN ('gpa_1an', 'biennale_2ans', 'decennale_10ans', 'hors_garantie_externe')),
  ADD COLUMN IF NOT EXISTS pv_reception_id UUID REFERENCES public.pv_receptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS facturable BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tickets_sav_metier
  ON public.tickets_sav (entreprise_id, metier, type_origine);

CREATE INDEX IF NOT EXISTS idx_tickets_sav_client_id
  ON public.tickets_sav (client_id);

CREATE INDEX IF NOT EXISTS idx_tickets_sav_pv_reception_id
  ON public.tickets_sav (pv_reception_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
