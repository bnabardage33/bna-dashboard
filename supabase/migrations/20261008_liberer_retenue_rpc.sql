-- =============================================================================
-- MODULE RETENUE DE GARANTIE (5 %) & RÉSERVES — RPC DE LIBÉRATION TRANSACTIONNELLE
-- Migration : 20261008_liberer_retenue_rpc.sql
--
-- Rôle :
--   Exécute de manière atomique la libération d'une retenue de garantie :
--     1. Contrôle strict de l'appartenance tenant via public.entreprise_courante()
--     2. Contrôle de l'état des réserves du PV (sauf motif dérogatoire explicite)
--     3. Vérification que le montant demandé <= montant_restant_a_liberer_ttc
--     4. Insertion immuable dans public.retenues_liberations
--     5. Mise à jour de montant_libere_cumule_ttc et montant_restant_a_liberer_ttc
--     6. Transition de statut ('liberee_partiellement' ou 'liberee_totalement')
-- =============================================================================

CREATE OR REPLACE FUNCTION public.liberer_retenue_garantie_rpc(
  p_chantier_id      uuid,
  p_montant_ttc      numeric,
  p_motif            text,
  p_pv_reception_id  uuid DEFAULT NULL,
  p_observations     text DEFAULT NULL,
  p_document_ref     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entreprise_id   uuid;
  v_crg             public.chantier_retenues_garantie%ROWTYPE;
  v_pv_statut       text;
  v_montant_ht      numeric(12,2);
  v_nouveau_libere  numeric(12,2);
  v_nouveau_restant numeric(12,2);
  v_nouveau_statut  text;
  v_liberation_id   uuid;
BEGIN
  -- 1) Résolution du tenant de session
  v_entreprise_id := public.entreprise_courante();
  IF v_entreprise_id IS NULL THEN
    RAISE EXCEPTION 'contexte entreprise manquant';
  END IF;

  -- 2) Paramètres élémentaires
  IF p_montant_ttc IS NULL OR p_montant_ttc <= 0 THEN
    RAISE EXCEPTION 'le montant a liberer doit etre strictement positif';
  END IF;

  IF p_motif NOT IN ('levee_reserves', 'echeance_1_an_gpa', 'accord_amiable', 'substitution_caution') THEN
    RAISE EXCEPTION 'motif de liberation invalide : %', p_motif;
  END IF;

  -- 3) Verrouillage ligne du compte chantier
  SELECT *
    INTO v_crg
    FROM public.chantier_retenues_garantie
   WHERE chantier_id = p_chantier_id
     AND entreprise_id = v_entreprise_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'compte de retenue de garantie introuvable pour ce chantier';
  END IF;

  -- 4) Vérification de la disponibilité du solde
  IF p_montant_ttc > v_crg.montant_restant_a_liberer_ttc THEN
    RAISE EXCEPTION 'montant demande (% €) superieur au montant restant a liberer (% €)',
      p_montant_ttc, v_crg.montant_restant_a_liberer_ttc;
  END IF;

  -- 5) Contrôle PV de réception
  -- Lorsque le motif est 'levee_reserves', un PV de réception est OBLIGATOIRE
  IF p_motif = 'levee_reserves' AND p_pv_reception_id IS NULL THEN
    RAISE EXCEPTION 'un pv de reception valide est obligatoire pour le motif levee_reserves';
  END IF;

  IF p_pv_reception_id IS NOT NULL THEN
    SELECT statut INTO v_pv_statut
      FROM public.pv_receptions
     WHERE id = p_pv_reception_id
       AND entreprise_id = v_entreprise_id
       AND chantier_id = p_chantier_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'pv de reception introuvable ou non rattache a ce chantier';
    END IF;

    -- Si le motif invoqué est la levée des réserves, le PV doit être purgé
    IF p_motif = 'levee_reserves' AND v_pv_statut NOT IN ('sans_reserve', 'reserves_levees') THEN
      RAISE EXCEPTION 'impossible de liberer au motif de levee_reserves : le pv est actuellement %', v_pv_statut;
    END IF;
  END IF;

  -- 6) Prorata HT estimé
  IF v_crg.montant_retenu_cumule_ttc > 0 THEN
    v_montant_ht := ROUND(p_montant_ttc * (v_crg.montant_retenu_cumule_ht / v_crg.montant_retenu_cumule_ttc), 2);
  ELSE
    v_montant_ht := p_montant_ttc;
  END IF;

  -- 7) Insertion dans le journal d'audit
  INSERT INTO public.retenues_liberations (
    entreprise_id,
    retenue_id,
    chantier_id,
    pv_reception_id,
    montant_libere_ht,
    montant_libere_ttc,
    date_liberation,
    motif,
    utilisateur_id,
    document_ref,
    observations
  ) VALUES (
    v_entreprise_id,
    v_crg.id,
    p_chantier_id,
    p_pv_reception_id,
    v_montant_ht,
    p_montant_ttc,
    CURRENT_DATE,
    p_motif,
    auth.uid(),
    p_document_ref,
    p_observations
  ) RETURNING id INTO v_liberation_id;

  -- 8) Mise à jour du compte de retenue
  v_nouveau_libere := v_crg.montant_libere_cumule_ttc + p_montant_ttc;
  v_nouveau_restant := v_crg.montant_retenu_cumule_ttc - v_nouveau_libere;

  IF v_nouveau_restant = 0.00 THEN
    v_nouveau_statut := 'liberee_totalement';
  ELSE
    v_nouveau_statut := 'liberee_partiellement';
  END IF;

  UPDATE public.chantier_retenues_garantie
     SET montant_libere_cumule_ttc     = v_nouveau_libere,
         montant_restant_a_liberer_ttc = v_nouveau_restant,
         statut                        = v_nouveau_statut,
         date_derniere_liberation      = now(),
         updated_at                    = now()
   WHERE id = v_crg.id;

  -- 9) Retour structuré
  RETURN jsonb_build_object(
    'success', true,
    'liberation_id', v_liberation_id,
    'montant_libere_ttc', p_montant_ttc,
    'montant_libere_ht', v_montant_ht,
    'nouveau_restant_ttc', v_nouveau_restant,
    'statut', v_nouveau_statut
  );
END;
$$;

-- Révocation pour public / anon, attribution explicite à authenticated et service_role
REVOKE ALL ON FUNCTION public.liberer_retenue_garantie_rpc(uuid, numeric, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.liberer_retenue_garantie_rpc(uuid, numeric, text, uuid, text, text) TO authenticated, service_role;
