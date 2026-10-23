BEGIN;

-- Ajout des champs Main d'Œuvre à la table accessoires
ALTER TABLE public.catalogue_terrasse_accessoires 
  ADD COLUMN IF NOT EXISTS type_cout TEXT CHECK (type_cout IN ('matiere', 'main_oeuvre')) DEFAULT 'matiere',
  ADD COLUMN IF NOT EXISTS pu_ht NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pu_revient NUMERIC(10,2);

-- Index partiel pour performance si on filtre souvent par type_cout
CREATE INDEX IF NOT EXISTS idx_terrasse_acc_type_cout ON public.catalogue_terrasse_accessoires(type_cout) WHERE type_cout IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
