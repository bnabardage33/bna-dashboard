-- =============================================================================
-- DURCISSEMENT — lier_deplacement_devis (correction B1 de l'audit complet)
-- Projet : BNA Dashboard — 2026-09-29
--
-- DÉFAUT CORRIGÉ
-- -------------
-- `public.lier_deplacement_devis(p_deplacement_id, p_devis_id, p_entreprise_id)`
-- (migration 20260929_create_rpc_lier_deplacement_devis.sql) est :
--   * SECURITY DEFINER  -> contourne le RLS des tables sous-jacentes ;
--   * paramétrée par p_entreprise_id, fourni par l'APPELLANT.
--
-- `CREATE FUNCTION` accorde EXECUTE à PUBLIC par défaut et PostgREST expose le
-- schéma `public` : un utilisateur authentifié du tenant B pouvait donc appeler
-- directement
--     rpc('lier_deplacement_devis', { ..., p_entreprise_id: '<uuid tenant A>' })
-- et lier un déplacement du tenant A à un devis du tenant A. Les policies RLS
-- de `frais_deplacement` sont `auth.role() = 'authenticated'` SANS filtre
-- entreprise_id : rien ne bloquait l'appel.
--
-- STRUCTURE RETENUE — convention déjà utilisée par le dépôt
-- -------------------------------------------------------
-- `generer_prochain_numero_{ri,sav,sit,avenant}` sont découpées en
--   *  X_ctx(p_entreprise_id)  : implémentation interne, tenant explicite ;
--   *  X()                    : wrapper public qui résout le tenant DEPUIS LA
--                               SESSION via public.entreprise_courante().
-- `rattacher_entreprise` pose de son côté `set search_path = public`.
-- On reproduit exactement cette convention.
--
--   *  lier_deplacement_devis_ctx(p_deplacement_id, p_devis_id, p_entreprise_id)
--        -> corps métier inchangé (verrous FOR UPDATE, contrôle de chantier,
--           atomicité devis + déplacement). EXECUTE réservé au service_role.
--   *  lier_deplacement_devis(p_deplacement_id, p_devis_id)
--        -> plus aucun paramètre tenant. Résout public.entreprise_courante()
--           (GUC app.entreprise_id, sinon claim JWT app_metadata.entreprise_id)
--           et ÉCHOUE FERMÉ si le contexte est absent. EXECUTE à authenticated.
--
-- L'ANCIENNE SIGNATURE À 3 ARGUMENTS EST SUPPRIMÉE (`drop function`), pas
-- seulement revocée : une surcharge restante resterait un point d'entrée
-- *  d'élévation de privilèges, puisque PostgREST résout par (nom, nb d'args).
--
-- IDEMPOTENTE : `create or replace` + `drop ... if exists`.
-- Ne modifie AUCUNE donnée métier, aucun calcul, aucun tarif.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) IMPLÉMENTATION INTERNE — tenant explicite, service_role uniquement
-- -----------------------------------------------------------------------------
-- Corps strictement identique à la fonction d'origine : la logique métier
-- (verrouillage, contrôle de chantier, mise à jour devis, mise à jour
-- déplacement) n'est pas retouchée.

create or replace function public.lier_deplacement_devis_ctx(
  p_deplacement_id uuid,
  p_devis_id uuid,
  p_entreprise_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_deplacement record;
  v_devis record;
BEGIN
  -- Fail-closed : sans tenant explicite on refuse plutôt que de lier « partout ».
  IF p_entreprise_id IS NULL THEN
    RAISE EXCEPTION 'HTTP_400_CONTEXTE_ENTREPRISE';
  END IF;

  -- 1. Verrouiller et vérifier le déplacement
  SELECT * INTO v_deplacement
  FROM public.frais_deplacement
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
  FROM public.devis
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
  UPDATE public.devis
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
  UPDATE public.frais_deplacement
  SET devis_id = p_devis_id,
      statut = 'effectue',
      updated_at = NOW()
  WHERE id = p_deplacement_id;

  RETURN jsonb_build_object('ok', true, 'devis_id', p_devis_id);
END;
$$;

-- Jamais exposée au navigateur : c'est le seul point d'entrée du service_role.
revoke all on function public.lier_deplacement_devis_ctx(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.lier_deplacement_devis_ctx(uuid, uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 2) WRAPPER PUBLIC — plus aucun paramètre tenant
-- -----------------------------------------------------------------------------
-- Le tenant vient de la session (public.entreprise_courante()), jamais de
-- l'appelant. Un utilisateur du tenant B ne peut donc plus viser le tenant A,
-- même en appelant la RPC directement depuis le navigateur.

create or replace function public.lier_deplacement_devis(
  p_deplacement_id uuid,
  p_devis_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_entreprise uuid;
BEGIN
  v_entreprise := public.entreprise_courante();

  -- Fail-closed : sans contexte de session on refuse, on ne devine pas.
  IF v_entreprise IS NULL THEN
    RAISE EXCEPTION 'HTTP_400_CONTEXTE_ENTREPRISE';
  END IF;

  RETURN public.lier_deplacement_devis_ctx(p_deplacement_id, p_devis_id, v_entreprise);
END;
$$;

revoke all on function public.lier_deplacement_devis(uuid, uuid) from public, anon;
grant execute on function public.lier_deplacement_devis(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3) SUPPRESSION DE LA SIGNATURE VULNÉRABLE À 3 ARGUMENTS
-- -----------------------------------------------------------------------------
-- DROP et non REVOKE : PostgREST résout une surcharge par (nom, nombre
-- d'arguments). Laisser `lier_deplacement_devis(uuid,uuid,uuid)` en place,
-- même sans EXECUTE pour authenticated, maintiendrait une surface d'attaque
-- documentée qu'un grant futur rouvrirait par accident.

drop function if exists public.lier_deplacement_devis(uuid, uuid, uuid);

-- -----------------------------------------------------------------------------
-- 4) COMMENTAIRES
-- -----------------------------------------------------------------------------

COMMENT ON FUNCTION public.lier_deplacement_devis(uuid, uuid) IS
  'Lie atomiquement un déplacement à un devis. Le tenant est résolu depuis la session (entreprise_courante()) — il ne doit JAMAIS être fourni en paramètre. Variante interne tenant-explicite : lier_deplacement_devis_ctx (service_role).';

COMMENT ON FUNCTION public.lier_deplacement_devis_ctx(uuid, uuid, uuid) IS
  'Implémentation interne de la liaison déplacement -> devis, tenant explicite. Réservée au service_role (résolution côté serveur de l''API). Ne jamais accorder EXECUTE à anon/authenticated.';
