-- 1. Ajout des colonnes pour la gestion des avenants
ALTER TABLE public.devis
ADD COLUMN devis_parent_id UUID REFERENCES public.devis(id) ON DELETE CASCADE,
ADD COLUMN is_avenant BOOLEAN DEFAULT false;

CREATE INDEX idx_devis_parent_id ON public.devis(devis_parent_id);

-- 2. Fonction SQL sécurisée pour générer le numéro d'avenant
-- Si le devis parent est 'DEV-2026-042', il comptera les avenants existants pour générer 'DEV-2026-042-AV01'
CREATE OR REPLACE FUNCTION public.generer_prochain_numero_avenant(p_parent_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    parent_numero TEXT;
    nb_avenants INTEGER;
    numero_avenant TEXT;
BEGIN
    -- Verrouillage de la table devis pour garantir l'atomicité
    LOCK TABLE public.devis IN SHARE ROW EXCLUSIVE MODE;

    -- Récupérer le numéro du devis parent
    SELECT numero INTO parent_numero
    FROM public.devis
    WHERE id = p_parent_id;

    IF parent_numero IS NULL THEN
        RAISE EXCEPTION 'Devis parent introuvable';
    END IF;

    -- Compter le nombre d'avenants existants pour ce parent
    SELECT COUNT(*) INTO nb_avenants
    FROM public.devis
    WHERE devis_parent_id = p_parent_id AND is_avenant = true;

    -- Construire le numéro (ex: AV01)
    numero_avenant := parent_numero || '-AV' || LPAD((nb_avenants + 1)::TEXT, 2, '0');

    RETURN numero_avenant;
END;
$$;
