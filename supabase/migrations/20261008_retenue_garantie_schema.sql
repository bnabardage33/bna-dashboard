-- =============================================================================
-- MODULE RETENUE DE GARANTIE (5 %) & RÉSERVES — PHASE 1 : SCHÉMA & INVARIANTS
-- Migration : 20261008_retenue_garantie_schema.sql
--
-- Portée :
--   1. Évolution rétrocompatible de public.factures :
--      - retenue_garantie_pct (plafonnée à 5.00 % par chk_factures_rg_pct_range)
--      - montant_retenue_ht, montant_retenue_ttc, net_a_payer_ttc
--   2. Création de public.chantier_retenues_garantie (registre chantier sécurisé)
--      - Invariants mathématiques stricts :
--        * montant_retenu_cumule_ttc >= 0
--        * montant_libere_cumule_ttc >= 0
--        * montant_restant_a_liberer_ttc >= 0
--        * montant_libere_cumule_ttc <= montant_retenu_cumule_ttc
--        * montant_restant_a_liberer_ttc = (montant_retenu_cumule_ttc - montant_libere_cumule_ttc)
--   3. Création de public.retenues_liberations (journal d'audit immuable)
--   4. Trigger de consolidation automatique sur factures
--      (exclut les factures annulées, protège l'historique de libération)
--   5. RLS multi-entreprise étanche (pattern 20260922 via public.entreprise_courante())
--
-- IDEMPOTENCE : ALTER ... ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
--               CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) EXTENSION DE LA TABLE factures (Rétrocompatible & Immuable)
-- -----------------------------------------------------------------------------

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS retenue_garantie_pct numeric(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS montant_retenue_ht numeric(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS montant_retenue_ttc numeric(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS net_a_payer_ttc numeric(12,2) NOT NULL DEFAULT 0.00;

-- Contraintes sur factures
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_factures_rg_pct_range') THEN
    ALTER TABLE public.factures
      ADD CONSTRAINT chk_factures_rg_pct_range
      CHECK (retenue_garantie_pct >= 0.00 AND retenue_garantie_pct <= 5.00);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_factures_rg_ht_pos') THEN
    ALTER TABLE public.factures
      ADD CONSTRAINT chk_factures_rg_ht_pos
      CHECK (montant_retenue_ht >= 0.00);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_factures_rg_ttc_pos') THEN
    ALTER TABLE public.factures
      ADD CONSTRAINT chk_factures_rg_ttc_pos
      CHECK (montant_retenue_ttc >= 0.00);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_factures_net_a_payer_pos') THEN
    ALTER TABLE public.factures
      ADD CONSTRAINT chk_factures_net_a_payer_pos
      CHECK (net_a_payer_ttc >= 0.00);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) TABLE chantier_retenues_garantie (Registre consolidé par chantier)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chantier_retenues_garantie (
  id                            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id                 uuid          NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  chantier_id                   uuid          NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  devis_id                      uuid          REFERENCES public.devis(id) ON DELETE SET NULL,
  taux_applicable_pct           numeric(5,2)  NOT NULL DEFAULT 5.00,
  type_garantie                 text          NOT NULL DEFAULT 'retenue_financiere',
  caution_organisme             text,
  caution_reference             text,
  caution_date_acte             date,
  montant_retenu_cumule_ht      numeric(12,2) NOT NULL DEFAULT 0.00,
  montant_retenu_cumule_ttc     numeric(12,2) NOT NULL DEFAULT 0.00,
  montant_libere_cumule_ttc     numeric(12,2) NOT NULL DEFAULT 0.00,
  montant_restant_a_liberer_ttc numeric(12,2) NOT NULL DEFAULT 0.00,
  statut                        text          NOT NULL DEFAULT 'en_constitution',
  date_derniere_liberation      timestamptz,
  observations                  text,
  created_at                    timestamptz   NOT NULL DEFAULT now(),
  updated_at                    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_crg_taux_plafond
    CHECK (taux_applicable_pct >= 0.00 AND taux_applicable_pct <= 5.00),
  CONSTRAINT chk_crg_type_garantie
    CHECK (type_garantie IN ('retenue_financiere', 'caution_bancaire', 'garantie_premiere_demande')),
  CONSTRAINT chk_crg_retenu_ht_pos
    CHECK (montant_retenu_cumule_ht >= 0.00),
  CONSTRAINT chk_crg_retenu_ttc_pos
    CHECK (montant_retenu_cumule_ttc >= 0.00),
  CONSTRAINT chk_crg_libere_ttc_pos
    CHECK (montant_libere_cumule_ttc >= 0.00),
  CONSTRAINT chk_crg_restant_ttc_pos
    CHECK (montant_restant_a_liberer_ttc >= 0.00),
  CONSTRAINT chk_crg_libere_lte_retenu
    CHECK (montant_libere_cumule_ttc <= montant_retenu_cumule_ttc),
  CONSTRAINT chk_crg_restant_exact
    CHECK (montant_restant_a_liberer_ttc = (montant_retenu_cumule_ttc - montant_libere_cumule_ttc)),
  CONSTRAINT chk_crg_statut
    CHECK (statut IN ('en_constitution', 'bloquee_avec_reserves', 'liberable', 'liberee_partiellement', 'liberee_totalement')),
  CONSTRAINT uq_chantier_retenues_garantie_chantier
    UNIQUE (chantier_id)
);

-- -----------------------------------------------------------------------------
-- 3) TABLE retenues_liberations (Journal immuable d'audit des déblocages)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.retenues_liberations (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id     uuid          NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  retenue_id        uuid          NOT NULL REFERENCES public.chantier_retenues_garantie(id) ON DELETE CASCADE,
  chantier_id       uuid          NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  pv_reception_id   uuid          REFERENCES public.pv_receptions(id) ON DELETE SET NULL,
  montant_libere_ht numeric(12,2) NOT NULL,
  montant_libere_ttc numeric(12,2) NOT NULL,
  date_liberation   date          NOT NULL DEFAULT CURRENT_DATE,
  motif             text          NOT NULL DEFAULT 'levee_reserves',
  utilisateur_id    uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  document_ref      text,
  observations      text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_rl_montant_ht_strict_pos
    CHECK (montant_libere_ht > 0.00),
  CONSTRAINT chk_rl_montant_ttc_strict_pos
    CHECK (montant_libere_ttc > 0.00),
  CONSTRAINT chk_rl_motif
    CHECK (motif IN ('levee_reserves', 'echeance_1_an_gpa', 'accord_amiable', 'substitution_caution'))
);

-- -----------------------------------------------------------------------------
-- 4) INDEX
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_crg_entreprise_id
  ON public.chantier_retenues_garantie (entreprise_id);
CREATE INDEX IF NOT EXISTS idx_crg_chantier_id
  ON public.chantier_retenues_garantie (chantier_id);

CREATE INDEX IF NOT EXISTS idx_rl_entreprise_id
  ON public.retenues_liberations (entreprise_id);
CREATE INDEX IF NOT EXISTS idx_rl_retenue_id
  ON public.retenues_liberations (retenue_id);
CREATE INDEX IF NOT EXISTS idx_rl_chantier_id
  ON public.retenues_liberations (chantier_id);
CREATE INDEX IF NOT EXISTS idx_rl_pv_id
  ON public.retenues_liberations (pv_reception_id);

CREATE INDEX IF NOT EXISTS idx_factures_chantier_rg
  ON public.factures (chantier_id, statut)
  WHERE retenue_garantie_pct > 0;

-- -----------------------------------------------------------------------------
-- 5) TRIGGER AUTO-ENTREPRISE (Cohérence multi-tenant enfant -> chantier parent)
-- -----------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'chantier_retenues_garantie',
    'retenues_liberations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_auto_entreprise ON public.%I;', t);
    EXECUTE format(
      'CREATE TRIGGER tg_auto_entreprise BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tg_set_entreprise_par_chantier();', t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 6) TRIGGER DE CONSOLIDATION SUR factures
--    - Recalcule déterministement montant_retenu_cumule_ht/ttc
--    - Exclut formellement les factures 'annulee' et 'brouillon'
--    - Préserve STRICTEMENT l'historique de montant_libere_cumule_ttc
--    - Refuse l'annulation d'une facture si cela rendait montant_retenu < montant_libere
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_recalculer_retenue_chantier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_chantier_id   uuid;
  v_ent_id        uuid;
  v_cumul_ht      numeric(12,2);
  v_cumul_ttc     numeric(12,2);
  v_libere_ttc    numeric(12,2);
  v_restant_ttc   numeric(12,2);
  v_statut_pv     text;
  v_statut_compte text;
  v_taux_facture  numeric(5,2);
  v_chantiers     uuid[];
BEGIN
  -- Déterminer la liste des chantiers concernés
  IF TG_OP = 'DELETE' THEN
    v_chantiers := ARRAY[OLD.chantier_id];
  ELSIF TG_OP = 'UPDATE' AND (OLD.chantier_id IS DISTINCT FROM NEW.chantier_id) THEN
    v_chantiers := ARRAY[OLD.chantier_id, NEW.chantier_id];
  ELSE
    v_chantiers := ARRAY[NEW.chantier_id];
  END IF;

  FOREACH v_chantier_id IN ARRAY v_chantiers LOOP
    -- Si la facture n'est rattachée à aucun chantier, rien à consolider pour cette itération
    IF v_chantier_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Somme des retenues constituées par les factures actives valides (émises ou payées)
    SELECT
      COALESCE(SUM(montant_retenue_ht), 0.00),
      COALESCE(SUM(montant_retenue_ttc), 0.00)
    INTO v_cumul_ht, v_cumul_ttc
    FROM public.factures
    WHERE chantier_id = v_chantier_id
      AND statut IN ('envoyee', 'payee');

    -- Vérifier si le compte existe déjà pour ce chantier
    SELECT montant_libere_cumule_ttc
      INTO v_libere_ttc
      FROM public.chantier_retenues_garantie
     WHERE chantier_id = v_chantier_id
     FOR UPDATE;

    IF NOT FOUND THEN
      -- Créer le compte uniquement s'il y a un cumul constitué ou si la facture applique une retenue sur ce chantier
      IF v_cumul_ttc > 0 OR (TG_OP <> 'DELETE' AND NEW.chantier_id = v_chantier_id AND NEW.retenue_garantie_pct > 0) THEN
        SELECT entreprise_id INTO v_ent_id FROM public.chantiers WHERE id = v_chantier_id;
        v_taux_facture := CASE WHEN TG_OP <> 'DELETE' AND NEW.chantier_id = v_chantier_id AND NEW.retenue_garantie_pct > 0 THEN NEW.retenue_garantie_pct ELSE 5.00 END;

        INSERT INTO public.chantier_retenues_garantie (
          entreprise_id,
          chantier_id,
          taux_applicable_pct,
          montant_retenu_cumule_ht,
          montant_retenu_cumule_ttc,
          montant_libere_cumule_ttc,
          montant_restant_a_liberer_ttc,
          statut
        ) VALUES (
          v_ent_id,
          v_chantier_id,
          v_taux_facture,
          v_cumul_ht,
          v_cumul_ttc,
          0.00,
          v_cumul_ttc,
          'en_constitution'
        )
        ON CONFLICT (chantier_id) DO NOTHING;
      END IF;
      CONTINUE;
    END IF;

    -- Invariant de cohérence : le total retenu ne peut pas devenir inférieur à ce qui a déjà été libéré
    IF v_cumul_ttc < v_libere_ttc THEN
      RAISE EXCEPTION 'Opération interdite : la retenue active (% €) deviendrait inférieure au montant déjà libéré (% €)',
        v_cumul_ttc, v_libere_ttc;
    END IF;

    -- Calcul du solde restant à libérer
    v_restant_ttc := v_cumul_ttc - v_libere_ttc;

    -- Détermination du statut métier du compte
    IF v_cumul_ttc = 0.00 THEN
      v_statut_compte := 'en_constitution';
    ELSIF v_restant_ttc = 0.00 AND v_libere_ttc > 0.00 THEN
      v_statut_compte := 'liberee_totalement';
    ELSIF v_libere_ttc > 0.00 THEN
      v_statut_compte := 'liberee_partiellement';
    ELSE
      -- Vérification du statut du dernier PV de réception
      SELECT statut INTO v_statut_pv
        FROM public.pv_receptions
       WHERE chantier_id = v_chantier_id
       ORDER BY date_reception DESC, created_at DESC
       LIMIT 1;

      IF v_statut_pv IN ('sans_reserve', 'reserves_levees') THEN
        v_statut_compte := 'liberable';
      ELSIF v_statut_pv = 'avec_reserves' THEN
        v_statut_compte := 'bloquee_avec_reserves';
      ELSE
        v_statut_compte := 'en_constitution';
      END IF;
    END IF;

    -- Mise à jour du compte : montant_libere_cumule_ttc n'est JAMAIS altéré
    UPDATE public.chantier_retenues_garantie
       SET montant_retenu_cumule_ht      = v_cumul_ht,
           montant_retenu_cumule_ttc     = v_cumul_ttc,
           montant_restant_a_liberer_ttc = v_restant_ttc,
           statut                        = v_statut_compte,
           updated_at                    = now()
     WHERE chantier_id = v_chantier_id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_factures_consolider_retenue ON public.factures;
CREATE TRIGGER tg_factures_consolider_retenue
  AFTER INSERT OR UPDATE OF chantier_id, statut, montant_retenue_ht, montant_retenue_ttc OR DELETE
  ON public.factures
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_recalculer_retenue_chantier();

-- -----------------------------------------------------------------------------
-- 7) RLS (Sécurité multi-tenant & protection anti-falsification)
-- -----------------------------------------------------------------------------

ALTER TABLE public.chantier_retenues_garantie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retenues_liberations ENABLE ROW LEVEL SECURITY;

-- chantier_retenues_garantie
DROP POLICY IF EXISTS crg_ent_select ON public.chantier_retenues_garantie;
CREATE POLICY crg_ent_select ON public.chantier_retenues_garantie
  FOR SELECT USING (entreprise_id = public.entreprise_courante());

-- Écritures directes interdites au frontend : les cumuls sont maintenus par trigger et RPC
DROP POLICY IF EXISTS crg_ent_insert ON public.chantier_retenues_garantie;
CREATE POLICY crg_ent_insert ON public.chantier_retenues_garantie
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS crg_ent_update ON public.chantier_retenues_garantie;
CREATE POLICY crg_ent_update ON public.chantier_retenues_garantie
  FOR UPDATE USING (false);

DROP POLICY IF EXISTS crg_ent_delete ON public.chantier_retenues_garantie;
CREATE POLICY crg_ent_delete ON public.chantier_retenues_garantie
  FOR DELETE USING (false);

-- retenues_liberations
DROP POLICY IF EXISTS rl_ent_select ON public.retenues_liberations;
CREATE POLICY rl_ent_select ON public.retenues_liberations
  FOR SELECT USING (entreprise_id = public.entreprise_courante());

-- Journal immuable : aucune écriture ou suppression directe PostgREST
DROP POLICY IF EXISTS rl_ent_insert ON public.retenues_liberations;
CREATE POLICY rl_ent_insert ON public.retenues_liberations
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS rl_ent_update ON public.retenues_liberations;
CREATE POLICY rl_ent_update ON public.retenues_liberations
  FOR UPDATE USING (false);

DROP POLICY IF EXISTS rl_ent_delete ON public.retenues_liberations;
CREATE POLICY rl_ent_delete ON public.retenues_liberations
  FOR DELETE USING (false);

-- -----------------------------------------------------------------------------
-- 8) GRANTS (Permissions de consultation pour utilisateurs authentifiés)
-- -----------------------------------------------------------------------------

GRANT SELECT ON TABLE public.chantier_retenues_garantie TO authenticated, service_role;
GRANT SELECT ON TABLE public.retenues_liberations       TO authenticated, service_role;
