-- 20261019_extend_enum_cat_accessoire.sql
-- Extension de l'ENUM cat_accessoire_terrasse pour le « flux de travail
-- chantier » du Catalogue Terrasse (groupes Structure / Préparation / Fixations).
--
-- Valeurs existantes conservées intactes : CLIP, LAMBOURDE, PLOT, VIS, BANDEROLE.
-- Ajouts idempotents (IF NOT EXISTS) — script safe à relancer N fois :
--   Structure   : SOLIVE
--   Préparation : GEOTEXTILE, GRAVIER, CONCASSE, DALLE_BETON
--   Fixations   : CACHE, PROFILE_PVC
--
-- Requiert PostgreSQL >= 12 (ALTER TYPE ... ADD VALUE en transaction).
-- Aucune valeur ajoutée n'est utilisée dans cette transaction (aucun INSERT),
-- conformément à la contrainte PostgreSQL.

BEGIN;

ALTER TYPE public.cat_accessoire_terrasse ADD VALUE IF NOT EXISTS 'SOLIVE';
ALTER TYPE public.cat_accessoire_terrasse ADD VALUE IF NOT EXISTS 'GEOTEXTILE';
ALTER TYPE public.cat_accessoire_terrasse ADD VALUE IF NOT EXISTS 'GRAVIER';
ALTER TYPE public.cat_accessoire_terrasse ADD VALUE IF NOT EXISTS 'CONCASSE';
ALTER TYPE public.cat_accessoire_terrasse ADD VALUE IF NOT EXISTS 'DALLE_BETON';
ALTER TYPE public.cat_accessoire_terrasse ADD VALUE IF NOT EXISTS 'CACHE';
ALTER TYPE public.cat_accessoire_terrasse ADD VALUE IF NOT EXISTS 'PROFILE_PVC';

COMMIT;

-- Rechargement du cache de schéma PostgREST (Supabase) : l'ENUM est alors
-- disponible côté API immédiatement, sans attendre le reload automatique.
NOTIFY pgrst, 'reload schema';
