-- =============================================================================
-- BNA DASHBOARD - GOLDEN SEED MÉTIER
-- Phase : SPRINT 1 (Jeu de données de test et de validation opérationnelle)
-- Date : 2026-10-12
-- Idempotent : ON CONFLICT DO NOTHING
-- Tenant BNA : 11111111-1111-4111-8111-111111111111
-- =============================================================================

DO $$
DECLARE
  v_bna_id CONSTANT uuid := '11111111-1111-4111-8111-111111111111';

  -- IDs fixes pour les relations croisées
  v_cli_particulier CONSTANT uuid := '22222222-0001-4000-8000-000000000001';
  v_cli_promoteur   CONSTANT uuid := '22222222-0002-4000-8000-000000000002';
  v_cli_archi       CONSTANT uuid := '22222222-0003-4000-8000-000000000003';

  v_fournisseur_bois CONSTANT uuid := '33333333-0001-4000-8000-000000000001';
  v_fournisseur_alu  CONSTANT uuid := '33333333-0002-4000-8000-000000000002';

  v_compagnon_marc   CONSTANT uuid := '44444444-0001-4000-8000-000000000001';
  v_compagnon_lucas  CONSTANT uuid := '44444444-0002-4000-8000-000000000002';
  v_compagnon_david  CONSTANT uuid := '44444444-0003-4000-8000-000000000003';
  v_compagnon_karim  CONSTANT uuid := '44444444-0004-4000-8000-000000000004';

  v_chantier_pins    CONSTANT uuid := '55555555-0001-4000-8000-000000000001';
  v_chantier_villa   CONSTANT uuid := '55555555-0002-4000-8000-000000000002';
  v_chantier_bureaux CONSTANT uuid := '55555555-0003-4000-8000-000000000003';

  v_devis_pins       CONSTANT uuid := '66666666-0001-4000-8000-000000000001';
  v_devis_villa      CONSTANT uuid := '66666666-0002-4000-8000-000000000002';

  v_cde_bois         CONSTANT uuid := '77777777-0001-4000-8000-000000000001';
  v_fact_sit1        CONSTANT uuid := '88888888-0001-4000-8000-000000000001';
  v_fact_sit2        CONSTANT uuid := '88888888-0002-4000-8000-000000000002';
BEGIN

  -- 1. TENANT BNA (si non existant)
  INSERT INTO public.entreprises (id, raison_sociale, slug, siret)
  VALUES (v_bna_id, 'BNA Bardage & Isolation', 'bna-bardage', '89123456700012')
  ON CONFLICT (id) DO NOTHING;

  -- 2. CLIENTS RÉALISTES
  INSERT INTO public.clients (id, entreprise_id, nom, type, email, tel, societe, ville, code_postal)
  VALUES
    (v_cli_particulier, v_bna_id, 'M. et Mme Gujan', 'particulier', 'gujan.bassin@example.fr', '0612345678', NULL, 'Gujan-Mestras', '33470'),
    (v_cli_promoteur,   v_bna_id, 'Aquitaine Promotion SAS', 'professionnel', 'travaux@aquitaine-promotion.fr', '0556112233', 'Aquitaine Promotion', 'Bordeaux', '33000'),
    (v_cli_archi,       v_bna_id, 'Atelier Dubreuil Architectes', 'architecte', 'contact@dubreuil-archi.fr', '0556998877', 'Atelier Dubreuil', 'Mérignac', '33700')
  ON CONFLICT (id) DO NOTHING;

  -- 3. FOURNISSEURS NÉGOCE BTP
  INSERT INTO public.fournisseurs (id, entreprise_id, nom, contact, email, telephone, specialite, conditions_paiement)
  VALUES
    (v_fournisseur_bois, v_bna_id, 'Dispano Bois Bordeaux', 'Julien Négociant', 'bordeaux@dispano.fr', '0556443322', 'Bois classe 4 & platelage', '30 jours fin de mois'),
    (v_fournisseur_alu,  v_bna_id, 'Larson Composite France', 'Sophie Façades', 'contact@larson-france.fr', '0144556677', 'Panneaux cassettes aluminium', '45 jours net')
  ON CONFLICT (id) DO NOTHING;

  -- 4. ÉQUIPE COMPAGNONS BNA
  INSERT INTO public.equipe (id, entreprise_id, nom, prenom, role)
  VALUES
    (v_compagnon_marc,  v_bna_id, 'Lemoine', 'Marc',  'Chef d''équipe / Référent Zinc'),
    (v_compagnon_lucas, v_bna_id, 'Dubois',  'Lucas', 'Compagnon Bardage & Terrasse'),
    (v_compagnon_david, v_bna_id, 'Perrot',  'David', 'Poseur ITE'),
    (v_compagnon_karim, v_bna_id, 'Messaoud','Karim', 'Aide-poseur')
  ON CONFLICT (id) DO NOTHING;

  -- 5. CHANTIERS TÉMOINS
  INSERT INTO public.chantiers (id, entreprise_id, client_id, client_nom, nom_chantier, adresse_chantier, statut, date_debut)
  VALUES
    (v_chantier_pins,    v_bna_id, v_cli_promoteur,   'Aquitaine Promotion SAS', 'Résidence Les Pins',     '14 avenue de la Forêt, Pessac',       'en_cours',   CURRENT_DATE - INTERVAL '20 days'),
    (v_chantier_villa,   v_bna_id, v_cli_particulier, 'M. et Mme Gujan',         'Villa Bassin d''Arcachon','8 allée des Mimosas, Gujan-Mestras',  'a_demarrer', CURRENT_DATE + INTERVAL '5 days'),
    (v_chantier_bureaux, v_bna_id, v_cli_archi,       'Atelier Dubreuil Archi',  'Bureaux Tertiaires Mérignac','102 rue Ariane, Mérignac',        'termine',    CURRENT_DATE - INTERVAL '60 days')
  ON CONFLICT (id) DO NOTHING;

  -- 6. DEVIS AVANCÉS
  INSERT INTO public.devis (id, entreprise_id, chantier_id, client_id, numero, objet, montant_ht, montant_ttc, statut, acompte_pct, cout_matiere_ht, cout_main_oeuvre_ht)
  VALUES
    (v_devis_pins,  v_bna_id, v_chantier_pins,  v_cli_promoteur,   'DEV-2026-042', 'Fourniture et pose bardage cassettes composite 280 m²', 68500.00, 82200.00, 'signe', 30.0, 31200.00, 18400.00),
    (v_devis_villa, v_bna_id, v_chantier_villa, v_cli_particulier, 'DEV-2026-043', 'Création terrasse bois Cumaru sur plots 75 m²',          16800.00, 18480.00, 'signe', 40.0,  7800.00,  4200.00)
  ON CONFLICT (id) DO NOTHING;

  -- 7. COMMANDE FOURNISSEUR
  INSERT INTO public.commandes (id, entreprise_id, chantier_id, fournisseur_id, numero_commande, designation, montant_ht, statut, date_commande)
  VALUES
    (v_cde_bois, v_bna_id, v_chantier_villa, v_fournisseur_bois, 'BC-2026-088', 'Lames terrasse Cumaru 21x145mm + lambourdes classe 4', 7450.00, 'envoyee', CURRENT_DATE - INTERVAL '3 days')
  ON CONFLICT (id) DO NOTHING;

  -- 8. FACTURES & SITUATIONS DE TRAVAUX (avec retenue de garantie 5 %)
  INSERT INTO public.factures (id, entreprise_id, chantier_id, client_id, devis_id, numero, objet, total_ht, total_ttc, montant_retenue_ht, montant_retenue_ttc, net_a_payer_ttc, statut, date_emission, echeance)
  VALUES
    (v_fact_sit1, v_bna_id, v_chantier_pins, v_cli_promoteur, v_devis_pins, 'FA-2026-061', 'Situation de travaux n°1 (Avancement 40 %)', 27400.00, 32880.00, 1370.00, 1644.00, 31236.00, 'payee',   CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE + INTERVAL '15 days'),
    (v_fact_sit2, v_bna_id, v_chantier_pins, v_cli_promoteur, v_devis_pins, 'FA-2026-075', 'Situation de travaux n°2 (Avancement 75 %)', 23975.00, 28770.00, 1198.75, 1438.50, 27331.50, 'en_retard',CURRENT_DATE - INTERVAL '35 days', CURRENT_DATE - INTERVAL '5 days')
  ON CONFLICT (id) DO NOTHING;

  -- 9. RÉCEPTION DE CHANTIER (avec réserve technique)
  INSERT INTO public.pv_receptions (id, entreprise_id, chantier_id, client_id, devis_id, type_reception, date_reception, status, res_description)
  VALUES
    ('99999999-0001-4000-8000-000000000001', v_bna_id, v_chantier_bureaux, v_cli_archi, NULL, 'avec_reserves', CURRENT_DATE - INTERVAL '30 days', 'signe', 'Acrotère Nord : bavette de zinc présentant un léger défaut de planéité à réajuster')
  ON CONFLICT (id) DO NOTHING;

  -- 10. TICKET SAV (en cours d'intervention)
  INSERT INTO public.tickets_sav (id, entreprise_id, chantier_id, numero, titre, description, urgence, statut, intervenant)
  VALUES
    ('aaaaaaaa-0001-4000-8000-000000000001', v_bna_id, v_chantier_bureaux, 'SAV-2026-004', 'Reprise bavette zinc acrotère Nord', 'Reprise suite à réserve PV de réception. Dépose partielle et nouveau pliage.', 'normale', 'en_cours', 'Marc Lemoine')
  ON CONFLICT (id) DO NOTHING;

END $$;
