-- 20261017_add_common_fields_terrasse.sql
--
-- Champs communs aux deux catalogues : le formulaire générique
-- `ProductFormModal` expose les mêmes champs « Général » (Désignation,
-- Description, Fournisseur) pour le Bardage (`catalogue_ouvrages`) et pour le
-- Terrasse. Ces trois colonnes manquaient aux tables Terrasse créées par
-- 20261016_create_catalogue_terrasse.sql.
--
-- Migration PUREMENT ADDITIVE :
--   * `ADD COLUMN IF NOT EXISTS` n'écrase rien — les colonnes n'existent pas
--     encore dans 20261016, et une seconde exécution est sans effet.
--   * Les contraintes en place (PK, FK `entreprise_id`, CHECK `longueur_mm`,
--     `epaisseur_mm BETWEEN 20 AND 30`, `prix_* >= 0`, index, RLS et policies
--     `entreprise_courante()`) ne sont PAS touchées.
--   * Aucun backfill nécessaire : les colonnes sont nullables.

BEGIN;

-- 1. Lames
ALTER TABLE public.catalogue_terrasse_lames
  ADD COLUMN IF NOT EXISTS designation VARCHAR(200),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS fournisseur VARCHAR(100);

-- 2. Accessoires
ALTER TABLE public.catalogue_terrasse_accessoires
  ADD COLUMN IF NOT EXISTS designation VARCHAR(200),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS fournisseur VARCHAR(100);

COMMENT ON COLUMN public.catalogue_terrasse_lames.designation IS
  'Libellé produit affiché dans le catalogue (champ commun Bardage/Terrasse).';
COMMENT ON COLUMN public.catalogue_terrasse_lames.fournisseur IS
  'Fournisseur du produit (champ commun Bardage/Terrasse).';
COMMENT ON COLUMN public.catalogue_terrasse_accessoires.designation IS
  'Libellé produit affiché dans le catalogue (champ commun Bardage/Terrasse).';
COMMENT ON COLUMN public.catalogue_terrasse_accessoires.fournisseur IS
  'Fournisseur du produit (champ commun Bardage/Terrasse).';

COMMIT;
