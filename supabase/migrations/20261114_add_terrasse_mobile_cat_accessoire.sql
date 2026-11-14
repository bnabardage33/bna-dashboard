-- 20261114_add_terrasse_mobile_cat_accessoire.sql
-- Extension de l'ENUM cat_accessoire_terrasse pour intégrer la catégorie
-- dédiée « TERRASSE_MOBILE » (Terrasse Mobile Coulissante sur Rails & Motorisation).
--
-- Script idempotent (IF NOT EXISTS) — safe à relancer N fois.
-- Conforme PostgreSQL >= 12.

BEGIN;

ALTER TYPE public.cat_accessoire_terrasse ADD VALUE IF NOT EXISTS 'TERRASSE_MOBILE';

COMMIT;

-- Rechargement du cache de schéma PostgREST (Supabase)
NOTIFY pgrst, 'reload schema';
