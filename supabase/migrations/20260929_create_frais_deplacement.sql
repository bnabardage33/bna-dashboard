-- =============================================================================
-- MODULE FRAIS DE DÉPLACEMENT — Création de la table frais_deplacement
-- Projet : BNA Dashboard — 2026-09-29
--
-- Portée :
--   * table frais_deplacement (suivi des déplacements kilométriques par chantier) ;
--   * seed du tarif commercial par défaut dans parametres_finance ;
--   * RLS authenticated-only (pattern 20260921) ;
--   * index entreprise_id / chantier_id / date.
--
-- Conventions respectées :
--   * entreprise_id NOT NULL + FK (pattern Phase 1) ;
--   * tarif_km figé au moment du calcul (immuabilité historique) ;
--   * tarif commercial ≠ barème fiscal (pas d'IK / URSSAF dans le libellé) ;
--   * montants stockés (pas GENERATED) — cohérent avec depenses_chantier,
--     frais_interim, documents_compta.
--
-- IDEMPOTENTE : CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) TABLE frais_deplacement
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.frais_deplacement (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id  uuid           NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  chantier_id    uuid           NOT NULL REFERENCES public.chantiers(id) ON DELETE RESTRICT,
  date           date           NOT NULL,
  adresse_depart text,
  adresse_arrivee text,
  distance_aller_km  numeric(8,2) NOT NULL CHECK (distance_aller_km >= 0),
  distance_retour_km numeric(8,2) NOT NULL CHECK (distance_retour_km >= 0),
  tarif_km       numeric(6,2)   NOT NULL CHECK (tarif_km > 0),
  montant_ht     numeric(10,2)  NOT NULL CHECK (montant_ht >= 0),
  taux_tva       numeric(5,2)   NOT NULL DEFAULT 20,
  montant_tva    numeric(10,2),
  montant_ttc    numeric(10,2),
  motif          text           NOT NULL DEFAULT 'Déplacement chantier',
  statut         text           NOT NULL DEFAULT 'prevu'
                                CHECK (statut IN ('prevu', 'effectue', 'annule')),
  commentaire    text,
  devis_id       uuid           REFERENCES public.devis(id) ON DELETE SET NULL,
  created_at     timestamptz    DEFAULT now(),
  updated_at     timestamptz    DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2) INDEX
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS frais_deplacement_entreprise_idx
  ON public.frais_deplacement (entreprise_id);

CREATE INDEX IF NOT EXISTS frais_deplacement_chantier_idx
  ON public.frais_deplacement (chantier_id);

CREATE INDEX IF NOT EXISTS frais_deplacement_date_idx
  ON public.frais_deplacement (date);

-- -----------------------------------------------------------------------------
-- 3) RLS — pattern authenticated-only (20260921)
-- -----------------------------------------------------------------------------

ALTER TABLE public.frais_deplacement ENABLE ROW LEVEL SECURITY;

CREATE POLICY frais_deplacement_select_authenticated
  ON public.frais_deplacement FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY frais_deplacement_insert_authenticated
  ON public.frais_deplacement FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY frais_deplacement_update_authenticated
  ON public.frais_deplacement FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY frais_deplacement_delete_authenticated
  ON public.frais_deplacement FOR DELETE
  USING (auth.role() = 'authenticated');

-- -----------------------------------------------------------------------------
-- 4) SEED — tarif commercial par défaut (1,00 €/km) pour le tenant BNA
-- -----------------------------------------------------------------------------
-- Utilise le pattern clé-valeur de parametres_finance, conforme à la contrainte
-- d'unicité (entreprise_id, cle) établie par la Phase 1 (part1 §271).
-- ON CONFLICT DO NOTHING : idempotent, ne remplace jamais une valeur existante.

INSERT INTO public.parametres_finance (entreprise_id, cle, valeur)
VALUES ('11111111-1111-4111-8111-111111111111'::uuid, 'tarif_km_commercial', 1.00)
ON CONFLICT (entreprise_id, cle) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5) COMMENTAIRES
-- -----------------------------------------------------------------------------

COMMENT ON TABLE public.frais_deplacement IS
  'Suivi des déplacements kilométriques par chantier. Le tarif_km est un TARIF COMMERCIAL DE FACTURATION (≠ barème fiscal IK/URSSAF). Il est figé au moment de l''enregistrement pour garantir l''immuabilité historique.';

COMMENT ON COLUMN public.frais_deplacement.tarif_km IS
  'Tarif commercial HT par kilomètre, figé au moment du calcul. NE REPRÉSENTE PAS le barème fiscal des indemnités kilométriques.';

COMMENT ON COLUMN public.frais_deplacement.montant_ht IS
  'Montant HT = (distance_aller_km + distance_retour_km) × tarif_km. Calculé côté applicatif et stocké.';
