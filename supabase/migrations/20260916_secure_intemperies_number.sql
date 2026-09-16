-- Fonction pour générer un numéro séquentiel unique de rapport d'intempérie (RI-AAAA-NNN)
-- Protégé contre les accès concurrents grâce au verrouillage explicite.

CREATE OR REPLACE FUNCTION public.generer_prochain_numero_ri()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    annee_courante TEXT;
    prochain_index INTEGER;
    numero_final TEXT;
BEGIN
    annee_courante := to_char(now(), 'YYYY');
    
    -- Verrouillage de la table pour éviter les doublons lors des exécutions parallèles
    LOCK TABLE public.rapports_intemperies IN SHARE ROW EXCLUSIVE MODE;

    -- Trouver l'index maximum actuel pour l'année en cours
    SELECT COALESCE(
        MAX(
            CAST(
                NULLIF(
                    REGEXP_REPLACE(numero, '^RI-\d{4}-', ''), 
                    ''
                ) AS INTEGER
            )
        ), 0
    ) + 1 INTO prochain_index
    FROM public.rapports_intemperies
    WHERE numero LIKE 'RI-' || annee_courante || '-%';

    -- Formatage avec des zéros à gauche (LPAD 3 caractères)
    numero_final := 'RI-' || annee_courante || '-' || LPAD(prochain_index::TEXT, 3, '0');

    RETURN numero_final;
END;
$$;
