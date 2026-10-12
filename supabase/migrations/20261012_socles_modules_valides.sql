-- =============================================================================
-- BNA DASHBOARD - SOCLE DE BASE DE DONNÉES DES MODULES AUDITÉS
-- Phase : SPRINT 3 (Création des schémas de données purs, sans logique applicative)
-- Date : 2026-10-12
-- Multi-tenant : entreprise_id obligatoire sur chaque table, avec RLS active.
-- =============================================================================

-- =============================================================================
-- A. COMPÉTENCES RH
-- =============================================================================

-- 1. rh_compagnons (Extension enrichie de l'entité compagnon)
CREATE TABLE IF NOT EXISTS public.rh_compagnons (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  profile_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  nom                 text NOT NULL,
  prenom              text NOT NULL,
  matricule           text,
  statut_contrat      text NOT NULL DEFAULT 'cdi', -- cdi, cdd, interim, apprenti
  date_entree         date NOT NULL DEFAULT CURRENT_DATE,
  cout_horaire_charge numeric NOT NULL DEFAULT 35.00,
  anciennete_annees   numeric NOT NULL DEFAULT 0.0,
  archived_at         timestamptz DEFAULT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 2. rh_competences (Référentiel des techniques bardage, ITE, terrasse, zinc)
CREATE TABLE IF NOT EXISTS public.rh_competences (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  code                text NOT NULL, -- ex: BARD_BOIS, ZINC_ACROTERE, ITE_ROSACE
  intitule            text NOT NULL,
  domaine             text NOT NULL, -- bardage, terrasse, ite, finitions, securite
  criticite           integer NOT NULL DEFAULT 3, -- 1 à 5
  description         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 3. rh_niveaux (Grille des 5 niveaux de maturité)
CREATE TABLE IF NOT EXISTS public.rh_niveaux (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  niveau              integer NOT NULL CHECK (niveau BETWEEN 1 AND 5),
  libelle             text NOT NULL, -- 1: Découverte, 2: Opérationnel, 3: Autonome, 4: Référent, 5: Expert
  description_attendus text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rh_niveaux_ent_niveau UNIQUE (entreprise_id, niveau)
);

-- 4. rh_evaluations (Matrice d'évaluation compagnon x compétence)
CREATE TABLE IF NOT EXISTS public.rh_evaluations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  compagnon_id        uuid NOT NULL REFERENCES public.rh_compagnons(id) ON DELETE RESTRICT,
  competence_id       uuid NOT NULL REFERENCES public.rh_competences(id) ON DELETE RESTRICT,
  niveau_actuel       integer NOT NULL CHECK (niveau_actuel BETWEEN 1 AND 5),
  evalue_par_user_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  date_evaluation     date NOT NULL DEFAULT CURRENT_DATE,
  commentaire         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rh_evaluations UNIQUE (entreprise_id, compagnon_id, competence_id)
);

-- 5. rh_formations (Plan et suivi des formations professionnelles)
CREATE TABLE IF NOT EXISTS public.rh_formations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  compagnon_id        uuid NOT NULL REFERENCES public.rh_compagnons(id) ON DELETE RESTRICT,
  intitule            text NOT NULL,
  organisme           text,
  date_debut          date NOT NULL,
  date_fin            date,
  cout_ht             numeric NOT NULL DEFAULT 0.0,
  statut              text NOT NULL DEFAULT 'prevue', -- prevue, en_cours, validee, annulee
  heures_effectuees   numeric NOT NULL DEFAULT 0.0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- B. TRANSMISSION & RÉSILIENCE
-- =============================================================================

-- 6. rh_transmissions (Plans stratégiques de transmission du savoir-faire)
CREATE TABLE IF NOT EXISTS public.rh_transmissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  competence_id       uuid NOT NULL REFERENCES public.rh_competences(id) ON DELETE RESTRICT,
  expert_cedant_id    uuid NOT NULL REFERENCES public.rh_compagnons(id) ON DELETE RESTRICT,
  apprenant_id        uuid NOT NULL REFERENCES public.rh_compagnons(id) ON DELETE RESTRICT,
  date_echeance_cible date NOT NULL,
  statut              text NOT NULL DEFAULT 'en_cours', -- en_cours, valide, interrompu
  niveau_cible        integer NOT NULL DEFAULT 3,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 7. rh_tutorats (Séances de compagnonnage in situ sur chantier)
CREATE TABLE IF NOT EXISTS public.rh_tutorats (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  transmission_id     uuid NOT NULL REFERENCES public.rh_transmissions(id) ON DELETE CASCADE,
  chantier_id         uuid REFERENCES public.chantiers(id) ON DELETE SET NULL,
  date_seance         date NOT NULL DEFAULT CURRENT_DATE,
  heures_consacrees   numeric NOT NULL DEFAULT 4.0,
  observations        text,
  gestes_transmis     text[],
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 8. rh_habilitations (CACES Nacelle, SST, Travail en Hauteur)
CREATE TABLE IF NOT EXISTS public.rh_habilitations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  compagnon_id        uuid NOT NULL REFERENCES public.rh_compagnons(id) ON DELETE RESTRICT,
  type_habilitation   text NOT NULL, -- caces_r486, sst, hauteur, echafaudage
  numero_certificat   text,
  date_obtention      date NOT NULL,
  date_expiration     date NOT NULL,
  alerte_renouvellement boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- C. QUALITÉ D'EXÉCUTION & NON-CONFORMITÉS
-- =============================================================================

-- 9. chantier_non_conformites (Anomalies et écarts DTU constatés)
CREATE TABLE IF NOT EXISTS public.chantier_non_conformites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  chantier_id         uuid NOT NULL REFERENCES public.chantiers(id) ON DELETE RESTRICT,
  phase_detection     text NOT NULL, -- pose, autocontrole, reception, gpa
  type_anomalie       text NOT NULL, -- technique, esthetique, documentaire, securite
  gravite             text NOT NULL DEFAULT 'mineure', -- mineure, bloquante, critique
  description         text NOT NULL,
  reference_dtu       text, -- ex: DTU 41.2 art. 6.3
  photos_constat      text[],
  detecte_par         text,
  statut              text NOT NULL DEFAULT 'ouverte', -- ouverte, traitee, cloturee
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 10. chantier_reprises (Actions correctives associées)
CREATE TABLE IF NOT EXISTS public.chantier_reprises (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  non_conformite_id   uuid NOT NULL REFERENCES public.chantier_non_conformites(id) ON DELETE CASCADE,
  responsable_id      uuid REFERENCES public.rh_compagnons(id) ON DELETE SET NULL,
  action_corrective   text NOT NULL,
  date_realisation    date,
  heures_reprise      numeric NOT NULL DEFAULT 0.0,
  materiaux_consommes numeric NOT NULL DEFAULT 0.0,
  validation_chef     boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 11. chantier_cout_non_qualite (Agrégats financiers de la non-qualité)
CREATE TABLE IF NOT EXISTS public.chantier_cout_non_qualite (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  chantier_id         uuid NOT NULL REFERENCES public.chantiers(id) ON DELETE RESTRICT,
  cout_main_oeuvre    numeric NOT NULL DEFAULT 0.0,
  cout_fournitures    numeric NOT NULL DEFAULT 0.0,
  cout_logistique     numeric NOT NULL DEFAULT 0.0,
  cout_total_cnq      numeric GENERATED ALWAYS AS (cout_main_oeuvre + cout_fournitures + cout_logistique) STORED,
  date_cloture        date NOT NULL DEFAULT CURRENT_DATE,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- D. GESTION DES RÉSERVES
-- =============================================================================

-- 12. chantier_reserves (Suivi individualisé des réserves de réception)
CREATE TABLE IF NOT EXISTS public.chantier_reserves (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  chantier_id         uuid NOT NULL REFERENCES public.chantiers(id) ON DELETE RESTRICT,
  pv_reception_id     uuid REFERENCES public.pv_receptions(id) ON DELETE SET NULL,
  numero_reserve      integer NOT NULL,
  localisation        text NOT NULL,
  nature_reserve      text NOT NULL,
  statut              text NOT NULL DEFAULT 'a_lever', -- a_lever, en_cours, levee, contestee
  date_limite_levee   date NOT NULL,
  date_levee_effective date,
  signataire_levee    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 13. chantier_reserves_photos (Preuves visuelles avant/après levée)
CREATE TABLE IF NOT EXISTS public.chantier_reserves_photos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  reserve_id          uuid NOT NULL REFERENCES public.chantier_reserves(id) ON DELETE CASCADE,
  url_photo           text NOT NULL,
  type_vue            text NOT NULL DEFAULT 'constat', -- constat, levee
  commentaires        text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- E. BIBLIOTHÈQUE REX (RETOUR D'EXPÉRIENCE)
-- =============================================================================

-- 14. rex_categories (Classification des fiches de capitalisation)
CREATE TABLE IF NOT EXISTS public.rex_categories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  code                text NOT NULL,
  libelle             text NOT NULL,
  description         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 15. rex_bibliotheque (Fiches de bonnes pratiques et pathologies évitées)
CREATE TABLE IF NOT EXISTS public.rex_bibliotheque (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  categorie_id        uuid REFERENCES public.rex_categories(id) ON DELETE SET NULL,
  chantier_origine_id uuid REFERENCES public.chantiers(id) ON DELETE SET NULL,
  titre               text NOT NULL,
  probleme_rencontre  text NOT NULL,
  solution_adoptee    text NOT NULL,
  regle_a_retenir     text NOT NULL,
  photos_avant_apres  text[],
  gain_estime_euros   numeric DEFAULT 0.0,
  auteur_user_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 16. rex_consultations (Traçabilité des consultations par les équipes)
CREATE TABLE IF NOT EXISTS public.rex_consultations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  rex_id              uuid NOT NULL REFERENCES public.rex_bibliotheque(id) ON DELETE CASCADE,
  consulte_par_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  chantier_concerne_id uuid REFERENCES public.chantiers(id) ON DELETE SET NULL,
  consulte_le         timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- F. GOUVERNANCE & DIRECTION GÉNÉRALE
-- =============================================================================

-- 17. gouvernance_indicateurs (Définition des métriques de pilotage PDG)
CREATE TABLE IF NOT EXISTS public.gouvernance_indicateurs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  cle                 text NOT NULL, -- tresorerie_j60, marge_embarquee, ratio_cnq, etc.
  nom                 text NOT NULL,
  unite               text NOT NULL DEFAULT 'euros', -- euros, pourcentage, jours, points
  seuil_alerte        numeric,
  seuil_critique      numeric,
  description         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 18. gouvernance_snapshots (Photographies temporelles consolidées)
CREATE TABLE IF NOT EXISTS public.gouvernance_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  date_snapshot       date NOT NULL DEFAULT CURRENT_DATE,
  capital_entreprise_score numeric NOT NULL DEFAULT 80.0,
  tresorerie_actuelle numeric NOT NULL,
  tresorerie_previsionnelle_j60 numeric NOT NULL,
  marge_moyenne_embarquee numeric NOT NULL,
  chantiers_actifs    integer NOT NULL DEFAULT 0,
  chantiers_en_alerte integer NOT NULL DEFAULT 0,
  dso_jours           numeric NOT NULL DEFAULT 35.0,
  taux_cnq_pct        numeric NOT NULL DEFAULT 1.0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 19. gouvernance_alertes (Signaux d'avarie précoce adressés au dirigeant)
CREATE TABLE IF NOT EXISTS public.gouvernance_alertes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  snapshot_id         uuid REFERENCES public.gouvernance_snapshots(id) ON DELETE CASCADE,
  niveau              text NOT NULL DEFAULT 'surveillance', -- surveillance, tension, critique
  titre               text NOT NULL,
  detail              text NOT NULL,
  impact_estime_euros numeric DEFAULT 0.0,
  action_recommandee  text,
  est_acquittee       boolean NOT NULL DEFAULT false,
  acquittee_le        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- POLITIQUES RLS MULTI-TENANT & DROITS D'ACCÈS
-- =============================================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'rh_compagnons',
    'rh_competences',
    'rh_niveaux',
    'rh_evaluations',
    'rh_formations',
    'rh_transmissions',
    'rh_tutorats',
    'rh_habilitations',
    'chantier_non_conformites',
    'chantier_reprises',
    'chantier_cout_non_qualite',
    'chantier_reserves',
    'chantier_reserves_photos',
    'rex_categories',
    'rex_bibliotheque',
    'rex_consultations',
    'gouvernance_indicateurs',
    'gouvernance_snapshots',
    'gouvernance_alertes'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I;', tbl, tbl);

    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT USING (entreprise_id = public.entreprise_courante());', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_insert ON public.%I FOR INSERT WITH CHECK (entreprise_id = public.entreprise_courante());', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_update ON public.%I FOR UPDATE USING (entreprise_id = public.entreprise_courante()) WITH CHECK (entreprise_id = public.entreprise_courante());', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_delete ON public.%I FOR DELETE USING (entreprise_id = public.entreprise_courante());', tbl, tbl);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_entreprise ON public.%I (entreprise_id);', tbl, tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role;', tbl);
  END LOOP;
END $$;
