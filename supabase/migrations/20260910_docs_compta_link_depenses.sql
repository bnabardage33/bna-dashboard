-- Liaison documents_compta → depenses_chantier
-- Ajout des colonnes chantier_id, fournisseur_id, categorie pour le cross-linking

ALTER TABLE public.documents_compta
  ADD COLUMN IF NOT EXISTS chantier_id uuid REFERENCES public.chantiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fournisseur_id uuid REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS categorie text DEFAULT 'materiaux';
