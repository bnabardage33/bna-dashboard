-- Fonction RPC pour lier atomiquement un déplacement à un devis (LOT 6)

CREATE OR REPLACE FUNCTION lier_deplacement_devis(
  p_deplacement_id UUID,
  p_devis_id UUID,
  p_entreprise_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deplacement RECORD;
  v_devis RECORD;
BEGIN
  -- 1. Verrouiller et vérifier le déplacement
  SELECT * INTO v_deplacement 
  FROM frais_deplacement 
  WHERE id = p_deplacement_id AND entreprise_id = p_entreprise_id
  FOR UPDATE;

  IF v_deplacement.id IS NULL THEN
    RAISE EXCEPTION 'Déplacement introuvable ou accès refusé.';
  END IF;

  IF v_deplacement.devis_id IS NOT NULL THEN
    RAISE EXCEPTION 'HTTP_409_CONFLICT';
  END IF;

  -- 2. Vérifier le devis
  SELECT * INTO v_devis 
  FROM devis 
  WHERE id = p_devis_id AND entreprise_id = p_entreprise_id
  FOR UPDATE;

  IF v_devis.id IS NULL THEN
    RAISE EXCEPTION 'Devis introuvable ou accès refusé.';
  END IF;

  IF v_devis.chantier_id IS DISTINCT FROM v_deplacement.chantier_id THEN
    RAISE EXCEPTION 'Le devis et le déplacement n''appartiennent pas au même chantier.';
  END IF;

  -- 3. Mise à jour devis
  -- Logique métier strictement équivalente à calculerDevis() en TS,
  -- car pu_revient = 0 n'impacte ni cout_matiere_ht ni cout_main_oeuvre_ht.
  UPDATE devis
  SET lignes = COALESCE(lignes, '[]'::jsonb) || jsonb_build_object(
        'designation', 'Frais de déplacement',
        'qte', 1,
        'unite', 'Forfait',
        'pu_ht', v_deplacement.montant_ht,
        'pu_revient', null,
        'type_cout', null,
        'type_ligne', 'frais_deplacement',
        'catalogue_id', null
      ),
      total_ht = total_ht + v_deplacement.montant_ht,
      marge_ht = marge_ht + v_deplacement.montant_ht,
      marge_pct = CASE 
                    WHEN (total_ht + v_deplacement.montant_ht) > 0 
                    THEN ROUND(((marge_ht + v_deplacement.montant_ht) / (total_ht + v_deplacement.montant_ht) * 100)::numeric, 2)
                    ELSE 0 
                  END
  WHERE id = p_devis_id;

  -- 4. Mise à jour déplacement
  UPDATE frais_deplacement
  SET devis_id = p_devis_id,
      statut = 'effectue',
      updated_at = NOW()
  WHERE id = p_deplacement_id;

  RETURN jsonb_build_object('ok', true, 'devis_id', p_devis_id);
END;
$$;
