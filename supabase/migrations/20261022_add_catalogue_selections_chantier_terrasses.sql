-- 20261022_add_catalogue_selections_chantier_terrasses.sql
--
-- Persistance des sélections du Catalogue Terrasse sur `public.chantier_terrasses` :
--   * `lame_id`             -> `public.catalogue_terrasse_lames(id)`       ON DELETE SET NULL
--   * `clip_id`             -> `public.catalogue_terrasse_accessoires(id)` ON DELETE SET NULL
--   * `lambourde_id`        -> `public.catalogue_terrasse_accessoires(id)` ON DELETE SET NULL
--   * `plot_id`             -> `public.catalogue_terrasse_accessoires(id)` ON DELETE SET NULL
--   * `quantite_accessoires` -> JSONB NOT NULL DEFAULT '{}'::jsonb (objet JSON)
--
-- Migration PUREMENT ADDITIVE et NON DESTRUCTIVE :
--   * Aucune suppression (`DROP`), aucun renommage et aucun écrasement de
--     données valides ou de `resultats_techniques`.
--   * Contrôle en pré-vol des tables cibles et du type/nullabilité des colonnes
--     si certaines préexistaient déjà.
--   * Si `quantite_accessoires` contient des valeurs non-NULL qui ne sont pas
--     des objets JSON (`jsonb_typeof <> 'object'`), la migration s'arrête avec
--     un message explicite sans modifier les données.
--   * Les valeurs NULL de `quantite_accessoires` sont normalisées en `'{}'::jsonb`,
--     puis `SET DEFAULT '{}'::jsonb` et `SET NOT NULL` sont garantis.
--   * Chaque contrainte (`FOREIGN KEY` et `CHECK`) est créée si absente, ou
--     vérifiée par sa définition réelle dans `pg_constraint` si déjà présente.
--     Si une contrainte homonyme existe avec une définition incompatible, la
--     migration s'interrompt explicitement sans la supprimer ni la remplacer.
--
-- ⚠️ NON EXÉCUTÉE PAR L'AGENT. À lancer manuellement après contrôle.
--
-- ---------------------------------------------------------------------------
-- Contrôles AVANT exécution (lecture seule) :
--   SELECT table_name
--     FROM information_schema.tables
--    WHERE table_schema = 'public'
--      AND table_name IN (
--        'chantier_terrasses',
--        'catalogue_terrasse_lames',
--        'catalogue_terrasse_accessoires'
--      );
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name = 'chantier_terrasses'
--      AND column_name IN (
--        'lame_id', 'clip_id', 'lambourde_id', 'plot_id', 'quantite_accessoires'
--      );
--
-- Contrôles APRÈS exécution :
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name = 'chantier_terrasses'
--      AND column_name IN (
--        'lame_id', 'clip_id', 'lambourde_id', 'plot_id', 'quantite_accessoires'
--      );
--   SELECT conname, contype, convalidated, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.chantier_terrasses'::regclass
--      AND conname IN (
--        'chantier_terrasses_lame_id_fkey',
--        'chantier_terrasses_clip_id_fkey',
--        'chantier_terrasses_lambourde_id_fkey',
--        'chantier_terrasses_plot_id_fkey',
--        'chantier_terrasses_quantite_accessoires_object_check'
--      );
-- ---------------------------------------------------------------------------

BEGIN;

-- 0.a) Pré-vol : vérifier la présence des trois tables cibles avant modification.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'chantier_terrasses'
  ) THEN
    RAISE EXCEPTION
      'Migration 20261022 interrompue : table "public.chantier_terrasses" absente. Appliquer d''abord 20261010_chantier_terrasse.sql.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'catalogue_terrasse_lames'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'catalogue_terrasse_accessoires'
  ) THEN
    RAISE EXCEPTION
      'Migration 20261022 interrompue : tables "public.catalogue_terrasse_lames" / "public.catalogue_terrasse_accessoires" absentes. Appliquer d''abord 20261016_create_catalogue_terrasse.sql.';
  END IF;
END $$;

-- 0.b) Pré-vol : contrôler le type et la nullabilité de toute colonne qui préexisterait.
DO $$
DECLARE
  col_id text;
  v_type text;
  v_null text;
BEGIN
  FOREACH col_id IN ARRAY ARRAY['lame_id', 'clip_id', 'lambourde_id', 'plot_id'] LOOP
    SELECT data_type, is_nullable
      INTO v_type, v_null
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'chantier_terrasses'
       AND column_name = col_id;

    IF FOUND THEN
      IF v_type <> 'uuid' THEN
        RAISE EXCEPTION
          'Migration 20261022 interrompue : la colonne "public.chantier_terrasses.%" existe déjà avec le type "%" (attendu : "uuid").',
          col_id, v_type;
      END IF;
      IF v_null <> 'YES' THEN
        RAISE EXCEPTION
          'Migration 20261022 interrompue : la colonne "public.chantier_terrasses.%" existe déjà en NOT NULL (attendu : NULLABLE pour ON DELETE SET NULL).',
          col_id;
      END IF;
    END IF;
  END LOOP;

  SELECT data_type
    INTO v_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'chantier_terrasses'
     AND column_name = 'quantite_accessoires';

  IF FOUND AND v_type <> 'jsonb' THEN
    RAISE EXCEPTION
      'Migration 20261022 interrompue : la colonne "public.chantier_terrasses.quantite_accessoires" existe déjà avec le type "%" (attendu : "jsonb").',
      v_type;
  END IF;
END $$;

-- 1) Ajout additif des colonnes si elles n'existent pas encore.
ALTER TABLE public.chantier_terrasses
  ADD COLUMN IF NOT EXISTS lame_id UUID,
  ADD COLUMN IF NOT EXISTS clip_id UUID,
  ADD COLUMN IF NOT EXISTS lambourde_id UUID,
  ADD COLUMN IF NOT EXISTS plot_id UUID,
  ADD COLUMN IF NOT EXISTS quantite_accessoires JSONB DEFAULT '{}'::jsonb;

-- 2) Validation des données existantes et normalisation de `quantite_accessoires`.
DO $$
DECLARE
  nb_non_objet integer;
BEGIN
  SELECT count(*)
    INTO nb_non_objet
    FROM public.chantier_terrasses
   WHERE quantite_accessoires IS NOT NULL
     AND jsonb_typeof(quantite_accessoires) <> 'object';

  IF nb_non_objet > 0 THEN
    RAISE EXCEPTION
      'Migration 20261022 interrompue : % ligne(s) de "public.chantier_terrasses" ont une valeur "quantite_accessoires" qui n''est pas un objet JSON. Arbitrage manuel requis avant relance.',
      nb_non_objet;
  END IF;
END $$;

UPDATE public.chantier_terrasses
   SET quantite_accessoires = '{}'::jsonb
 WHERE quantite_accessoires IS NULL;

ALTER TABLE public.chantier_terrasses
  ALTER COLUMN quantite_accessoires SET DEFAULT '{}'::jsonb,
  ALTER COLUMN quantite_accessoires SET NOT NULL;

-- 3) Création ou vérification par définition réelle des clés étrangères et du CHECK
--    (sans suppression ni remplacement silencieux d'une contrainte incompatible).
DO $$
DECLARE
  fks constant text[][] := ARRAY[
    ['chantier_terrasses_lame_id_fkey',      'lame_id',      'public.catalogue_terrasse_lames'],
    ['chantier_terrasses_clip_id_fkey',      'clip_id',      'public.catalogue_terrasse_accessoires'],
    ['chantier_terrasses_lambourde_id_fkey', 'lambourde_id', 'public.catalogue_terrasse_accessoires'],
    ['chantier_terrasses_plot_id_fkey',      'plot_id',      'public.catalogue_terrasse_accessoires']
  ];
  v_conname    text;
  v_col        text;
  v_ref_table  text;
  v_contype    "char";
  v_valid      boolean;
  v_confrelid  oid;
  v_confdel    "char";
  v_attname    text;
  v_ref_att    text;
  v_def        text;
  i            integer;
BEGIN
  FOR i IN 1 .. array_length(fks, 1) LOOP
    v_conname   := fks[i][1];
    v_col       := fks[i][2];
    v_ref_table := fks[i][3];

    SELECT c.contype, c.convalidated, c.confrelid, c.confdeltype, pg_get_constraintdef(c.oid)
      INTO v_contype, v_valid, v_confrelid, v_confdel, v_def
      FROM pg_constraint c
     WHERE c.conrelid = 'public.chantier_terrasses'::regclass
       AND c.conname = v_conname;

    IF NOT FOUND THEN
      EXECUTE format(
        'ALTER TABLE public.chantier_terrasses ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE SET NULL',
        v_conname, v_col, v_ref_table
      );
    ELSE
      SELECT a.attname
        INTO v_attname
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.conrelid = 'public.chantier_terrasses'::regclass
         AND c.conname = v_conname
         AND array_length(c.conkey, 1) = 1;

      SELECT a.attname
        INTO v_ref_att
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.confrelid AND a.attnum = c.confkey[1]
       WHERE c.conrelid = 'public.chantier_terrasses'::regclass
         AND c.conname = v_conname
         AND array_length(c.confkey, 1) = 1;

      IF v_contype <> 'f'
         OR NOT v_valid
         OR v_confrelid <> v_ref_table::regclass
         OR v_confdel <> 'n'
         OR v_attname IS DISTINCT FROM v_col
         OR v_ref_att IS DISTINCT FROM 'id'
      THEN
        RAISE EXCEPTION
          'Migration 20261022 interrompue : la contrainte "%" existe déjà avec une définition incompatible (% / validated=%). Attendu : FOREIGN KEY (%) REFERENCES %(id) ON DELETE SET NULL.',
          v_conname, COALESCE(v_def, 'inconnue'), COALESCE(v_valid::text, 'false'), v_col, v_ref_table;
      END IF;
    END IF;
  END LOOP;

  -- Contrainte CHECK sur `quantite_accessoires`
  SELECT c.contype, c.convalidated, pg_get_constraintdef(c.oid)
    INTO v_contype, v_valid, v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.chantier_terrasses'::regclass
     AND c.conname = 'chantier_terrasses_quantite_accessoires_object_check';

  IF NOT FOUND THEN
    ALTER TABLE public.chantier_terrasses
      ADD CONSTRAINT chantier_terrasses_quantite_accessoires_object_check
      CHECK (jsonb_typeof(quantite_accessoires) = 'object');
  ELSE
    IF v_contype <> 'c'
       OR NOT v_valid
       OR position('jsonb_typeof(quantite_accessoires)' in COALESCE(v_def, '')) = 0
       OR position('object' in COALESCE(v_def, '')) = 0
    THEN
      RAISE EXCEPTION
        'Migration 20261022 interrompue : la contrainte "chantier_terrasses_quantite_accessoires_object_check" existe déjà avec une définition incompatible (% / validated=%). Attendu : CHECK (jsonb_typeof(quantite_accessoires) = ''object'').',
        COALESCE(v_def, 'inconnue'), COALESCE(v_valid::text, 'false');
    END IF;
  END IF;
END $$;

-- 4) Index partiels sur les clés étrangères pour accélérer les jointures et ON DELETE SET NULL.
CREATE INDEX IF NOT EXISTS idx_chantier_terrasses_lame_id
  ON public.chantier_terrasses(lame_id)
  WHERE lame_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chantier_terrasses_clip_id
  ON public.chantier_terrasses(clip_id)
  WHERE clip_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chantier_terrasses_lambourde_id
  ON public.chantier_terrasses(lambourde_id)
  WHERE lambourde_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chantier_terrasses_plot_id
  ON public.chantier_terrasses(plot_id)
  WHERE plot_id IS NOT NULL;

-- 5) Documentation des colonnes dans le catalogue PostgreSQL.
COMMENT ON COLUMN public.chantier_terrasses.lame_id IS
  'Référence optionnelle vers la lame sélectionnée dans public.catalogue_terrasse_lames.';
COMMENT ON COLUMN public.chantier_terrasses.clip_id IS
  'Référence optionnelle vers la fixation/clip sélectionnée dans public.catalogue_terrasse_accessoires.';
COMMENT ON COLUMN public.chantier_terrasses.lambourde_id IS
  'Référence optionnelle vers la lambourde sélectionnée dans public.catalogue_terrasse_accessoires.';
COMMENT ON COLUMN public.chantier_terrasses.plot_id IS
  'Référence optionnelle vers le plot sélectionné dans public.catalogue_terrasse_accessoires.';
COMMENT ON COLUMN public.chantier_terrasses.quantite_accessoires IS
  'Quantités manuelles d''accessoires par catégorie ({ clip, lambourde, plot }).';

COMMIT;

NOTIFY pgrst, 'reload schema';
