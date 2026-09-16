-- Ajout des colonnes designation_devis et code_ral à la table catalogue_ouvrages
ALTER TABLE public.catalogue_ouvrages 
ADD COLUMN IF NOT EXISTS designation_devis text,
ADD COLUMN IF NOT EXISTS code_ral text;
