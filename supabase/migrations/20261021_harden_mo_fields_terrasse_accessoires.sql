-- 20261021_harden_mo_fields_terrasse_accessoires.sql
--
-- Correction ciblée (suite à l'audit en lecture seule) de la fonctionnalité
-- « Prestations / Main-d'œuvre » du Catalogue Terrasse.
--
-- Contexte : 20261020 a ajouté `type_cout` / `pu_ht` / `pu_revient` à
-- `catalogue_terrasse_accessoires` via `ADD COLUMN IF NOT EXISTS ... CHECK (...)`.
-- Deux trous en découlent (cf. audit) :
--   * si la colonne `type_cout` préexistait, le CHECK en ligne N'A PAS été
--     ajouté (ADD COLUMN IF NOT EXISTS ignore l'action entière) ;
--   * `type_cout` est resté NULLABLE et `pu_ht` / `pu_revient` n'ont AUCUNE
--     contrainte de non-négativité (contrairement à `prix_conditionnement`).
--
-- Objectifs de CETTE migration :
--   1. normaliser `type_cout` NULL -> 'matiere' (valeur déjà DEFAULT) ;
--   2. rendre `type_cout` NON NULL ;
--   3. garantir que `type_cout` n'autorise EXACTEMENT que 'matiere' /
--      'main_oeuvre' ;
--   4. garantir `pu_ht` / `pu_revient` : NULL autorisé, toute valeur négative
--      refusée.
--
-- Vérification par DÉFINITION (et non par simple nom) — voir le bloc §3/§4 :
--   Pour chaque contrainte, la migration crée la contrainte CANONIQUE sous un
--   nom temporaire, lit sa définition réelle via `pg_get_constraintdef()`, puis
--   la compare à la définition de l'homonyme éventuel :
--     * absente ...................... la canonique est renommée au nom cible ;
--     * présente et IDENTIQUE ........ la temporaire est supprimée (no-op) ;
--     * présente et DIFFÉRENTE ....... l'homonyme est supprimé, la canonique
--                                      est renommée au nom cible.
--   La comparaison porte sur les deux définitions telles qu'imprimées par
--   PostgreSQL : elle est donc indépendante du formatage SQL (IN vs
--   = ANY(ARRAY[...]), casts, parenthèses, espaces). Une contrainte homonyme
--   mal définie est ainsi REPLACÉE, pas seulement détectée.
--   Les contraintes sont créées VALIDATED (aucune étape NOT VALID/VALIDATE).
--
-- Politique « données existantes non conformes » : ÉCHEC (pas de correction
-- silencieuse). Seule la normalisation `type_cout` NULL -> 'matiere' est
-- automatique. S'il existe des `pu_ht`/`pu_revient` négatifs, la migration
-- s'interrompt AVANT toute modification (pré-vol) ; les valeurs doivent être
-- arbitrées manuellement (corriger ou passer à NULL) puis la migration relancée.
-- De même, une valeur `type_cout` inconnue (ni NULL, ni 'matiere', ni
-- 'main_oeuvre') fait échouer la création de la contrainte -> rollback total.
--
-- ⚠️ NON EXÉCUTÉE PAR L'AGENT. À lancer manuellement, après contrôle.
--
-- ---------------------------------------------------------------------------
-- Contrôles AVANT exécution (lecture seule) :
--   SELECT count(*) FROM public.catalogue_terrasse_accessoires WHERE type_cout IS NULL;
--   SELECT count(*) FROM public.catalogue_terrasse_accessoires WHERE pu_ht < 0 OR pu_revient < 0;
--   SELECT count(*) FROM public.catalogue_terrasse_accessoires
--    WHERE type_cout IS NOT NULL AND type_cout NOT IN ('matiere','main_oeuvre');
--   SELECT column_name, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'catalogue_terrasse_accessoires'
--      AND column_name IN ('type_cout','pu_ht','pu_revient');
--   SELECT conname, contype, convalidated, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.catalogue_terrasse_accessoires'::regclass
--      AND conname IN (
--        'catalogue_terrasse_accessoires_type_cout_check',
--        'catalogue_terrasse_accessoires_pu_ht_non_neg',
--        'catalogue_terrasse_accessoires_pu_revient_non_neg');
--
-- Contrôles APRÈS exécution :
--   -- doit renvoyer 0 ligne : plus aucun type_cout NULL
--   SELECT count(*) FROM public.catalogue_terrasse_accessoires WHERE type_cout IS NULL;
--   -- doit renvoyer 0 ligne : plus aucune valeur négative
--   SELECT count(*) FROM public.catalogue_terrasse_accessoires WHERE pu_ht < 0 OR pu_revient < 0;
--   -- is_nullable doit valoir 'NO' pour type_cout
--   SELECT column_name, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'catalogue_terrasse_accessoires'
--      AND column_name = 'type_cout';
--   -- les 3 contraintes doivent être contype='c' et convalidated=true
--   SELECT conname, contype, convalidated, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.catalogue_terrasse_accessoires'::regclass
--      AND conname IN (
--        'catalogue_terrasse_accessoires_type_cout_check',
--        'catalogue_terrasse_accessoires_pu_ht_non_neg',
--        'catalogue_terrasse_accessoires_pu_revient_non_neg');
-- ---------------------------------------------------------------------------

BEGIN;

-- 0.a) Pré-vol : la migration 20261020 doit avoir créé les colonnes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'catalogue_terrasse_accessoires'
       AND column_name = 'type_cout'
  ) THEN
    RAISE EXCEPTION
      'Migration 20261021 interrompue : colonne "type_cout" absente. Appliquer d''abord 20261020_add_mo_fields_terrasse_accessoires.sql.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'catalogue_terrasse_accessoires'
       AND column_name = 'pu_ht'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'catalogue_terrasse_accessoires'
       AND column_name = 'pu_revient'
  ) THEN
    RAISE EXCEPTION
      'Migration 20261021 interrompue : colonnes "pu_ht"/"pu_revient" absentes. Appliquer d''abord 20261020_add_mo_fields_terrasse_accessoires.sql.';
  END IF;
END $$;

-- 0.b) Pré-vol : refuser les valeurs négatives existantes (arbitrage humain requis).
DO $$
DECLARE
  nb_neg integer;
BEGIN
  SELECT count(*) INTO nb_neg
    FROM public.catalogue_terrasse_accessoires
   WHERE pu_ht < 0 OR pu_revient < 0;

  IF nb_neg > 0 THEN
    RAISE EXCEPTION
      'Migration 20261021 interrompue : % ligne(s) ont un pu_ht ou pu_revient < 0. Corriger (ou passer à NULL) ces valeurs, puis relancer.', nb_neg;
  END IF;
END $$;

-- 1) Normalisation : type_cout NULL -> 'matiere' (valeur déjà DEFAULT de la colonne).
UPDATE public.catalogue_terrasse_accessoires
   SET type_cout = 'matiere'
 WHERE type_cout IS NULL;

-- 2) type_cout NON NULL.
ALTER TABLE public.catalogue_terrasse_accessoires
  ALTER COLUMN type_cout SET NOT NULL;

-- 3) + 4) Contraintes CHECK, vérifiées par DÉFINITION et remplacées si besoin.
--
-- Pour chaque contrainte canonique ci-dessous, on procède en 5 temps :
--   a. créer la contrainte canonique sous un nom temporaire (VALIDATED) ;
--   b. lire la définition réelle de l'homonyme cible (si présent, contype='c') ;
--   c. lire la définition réelle de la temporaire ;
--   d. si l'homonyme est absent      -> renommer la temporaire au nom cible ;
--      si les définitions sont égales -> supprimer la temporaire (no-op) ;
--      sinon                          -> supprimer l'homonyme, renommer la temporaire.
-- Le nom temporaire reste sous la limite d'identifiant de PostgreSQL (63).
DO $$
DECLARE
  -- (nom cible, expression CHECK canonique)
  specs constant text[][] := ARRAY[
    ['catalogue_terrasse_accessoires_type_cout_check',
     'type_cout IN (''matiere'', ''main_oeuvre'')'],
    ['catalogue_terrasse_accessoires_pu_ht_non_neg',
     'pu_ht IS NULL OR pu_ht >= 0'],
    ['catalogue_terrasse_accessoires_pu_revient_non_neg',
     'pu_revient IS NULL OR pu_revient >= 0']
  ];
  cible   text;
  expr    text;
  tmp     text;
  def_old text;
  def_new text;
  i       integer;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    cible := specs[i][1];
    expr  := specs[i][2];
    tmp   := cible || '__canon_tmp';

    -- (a) Contrainte canonique de référence, sous nom temporaire.
    EXECUTE format(
      'ALTER TABLE public.catalogue_terrasse_accessoires ADD CONSTRAINT %I CHECK (%s)',
      tmp, expr
    );

    -- (b) Définition réelle de l'homonyme cible (CHECK uniquement).
    SELECT pg_get_constraintdef(oid) INTO def_old
      FROM pg_constraint
     WHERE conrelid = 'public.catalogue_terrasse_accessoires'::regclass
       AND conname = cible
       AND contype = 'c';

    -- (c) Définition réelle de la canonique temporaire.
    SELECT pg_get_constraintdef(oid) INTO def_new
      FROM pg_constraint
     WHERE conrelid = 'public.catalogue_terrasse_accessoires'::regclass
       AND conname = tmp
       AND contype = 'c';

    -- (d) Décision.
    IF def_old IS NULL THEN
      -- Absente : la canonique prend le nom cible.
      EXECUTE format(
        'ALTER TABLE public.catalogue_terrasse_accessoires RENAME CONSTRAINT %I TO %I',
        tmp, cible
      );
    ELSIF def_old = def_new THEN
      -- Déjà correcte : on ne garde qu'une seule contrainte.
      EXECUTE format(
        'ALTER TABLE public.catalogue_terrasse_accessoires DROP CONSTRAINT %I',
        tmp
      );
    ELSE
      -- Homonyme incorrecte : remplacement propre.
      EXECUTE format(
        'ALTER TABLE public.catalogue_terrasse_accessoires DROP CONSTRAINT %I',
        cible
      );
      EXECUTE format(
        'ALTER TABLE public.catalogue_terrasse_accessoires RENAME CONSTRAINT %I TO %I',
        tmp, cible
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
