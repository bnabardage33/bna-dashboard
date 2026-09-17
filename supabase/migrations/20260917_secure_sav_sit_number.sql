-- Fonction 1: Génération atomique des numéros de Devis SAV (SAV-AAAA-NNN)
-- Verrouille la table `devis` sur les lignes de type travaux SAV de l'année en cours.
CREATE OR REPLACE FUNCTION public.generer_prochain_numero_sav()
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

    LOCK TABLE public.devis IN SHARE ROW EXCLUSIVE MODE;

    SELECT COALESCE(
        MAX(
            CAST(
                NULLIF(
                    REGEXP_REPLACE(numero, '^SAV-\d{4}-', ''),
                    ''
                ) AS INTEGER
            )
        ), 0
    ) + 1 INTO prochain_index
    FROM public.devis
    WHERE numero LIKE 'SAV-' || annee_courante || '-%';

    numero_final := 'SAV-' || annee_courante || '-' || LPAD(prochain_index::TEXT, 3, '0');

    RETURN numero_final;
END;
$$;


-- Fonction 2: Génération atomique des numéros de Situation de Travaux (SIT-AAAA-NNN)
-- Verrouille la table `situations` et compte les documents de l'année en cours.
CREATE OR REPLACE FUNCTION public.generer_prochain_numero_sit()
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

    LOCK TABLE public.situations IN SHARE ROW EXCLUSIVE MODE;

    SELECT COALESCE(
        MAX(
            CAST(
                NULLIF(
                    REGEXP_REPLACE(numero, '^SIT-\d{4}-', ''),
                    ''
                ) AS INTEGER
            )
        ), 0
    ) + 1 INTO prochain_index
    FROM public.situations
    WHERE numero LIKE 'SIT-' || annee_courante || '-%';

    numero_final := 'SIT-' || annee_courante || '-' || LPAD(prochain_index::TEXT, 3, '0');

    RETURN numero_final;
END;
$$;
