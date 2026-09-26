-- O3-B6 — Isolation multi-entreprise des RPC Espace Client
-- ============================================================================
--
-- POURQUOI CETTE MIGRATION
--
-- `espace_client_append` et `espace_client_consolider` sont toutes deux
-- `security definer`. Elles écrivent donc dans
-- `public.espace_client_conversations` en contournant les policies RLS — qui
-- sont pourtant correctement tenant-scopées (part2 l.41-44 :
-- `entreprise_id = public.entreprise_courante()`). Le RLS n'est donc ici
-- qu'un décor : il ne protège rien de ce que ces deux fonctions écrivent.
--
-- Ces deux fonctions n'ont jamais reçu le moindre `grant`/`revoke` dans ce
-- dépôt (vérifié : `grep -rn "espace_client_append\|espace_client_consolider"
-- supabase/` ne retourne que ce fichier-ci et la migration de création). Or le
-- défaut PostgreSQL sur `create function` est `grant execute ... to public`.
-- `anon` et `authenticated` peuvent donc appeler directement
-- `/rest/v1/rpc/espace_client_append` / `.../espace_client_consolider`, en
-- court-circuitant l'intégralité des protections applicatives des anomalies
-- O3-B1 à O3-B5.
--
-- PREUVES D'EXPOSITION (sondes GET/OPTIONS read-only, 2026-09-25)
--   - les 2 endpoints figurent dans la spec OpenAPI de PostgREST ;
--   - la clé `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publique, livrée dans le bundle
--     navigateur) est valide (HTTP 200 sur /rest/v1/chantiers) ;
--   - `anon` n'a AUCUN droit table sur `espace_client_conversations` (42501),
--     ce qui est sans objet dès lors que la fonction est `security definer`.
--   L'absence de `revoke` est donc établie par lecture des migrations ; le
--   droit d'exécution effectif reste à confirmer par un `has_function_privilege`
--   en console SQL, hors de portée d'une sonde REST.
--
-- CORRECTIONS
--   1) Réserver l'exécution à `service_role`, seul client employé par
--      l'application (`lib/supabaseAdmin`).
--   2) Verrouiller la cohérence tenant DANS la fonction, y compris sur la
--      branche `on conflict (cle) do update`, qui n'était couverte ni par le
--      trigger `tg_auto_entreprise` (`before insert` uniquement, part4 l.33)
--      ni par une policy RLS.
--
-- LES SIGNATURES NE SONT PAS MODIFIÉES. Le tenant est toujours déduit de
-- `p_chantier_id` (append) ou du `chantier_id` porté par la ligne ciblée
-- (consolider) : c'est la seule source de vérité interne, et cela évite
-- d'ajouter un paramètre que l'appelant pourrait fournir incohérent.
--
-- Cette migration remplace les définitions de la migration
-- 20260912_espace_client_conversations.sql (mêmes signatures, garde-fous
-- ajoutés). Aucune autre table, donnée ou trigger n'est touché.

-- -----------------------------------------------------------------------------
-- 1) EXÉCUTION RÉSERVÉE À service_role
-- -----------------------------------------------------------------------------

revoke all on function public.espace_client_append(text, uuid, text, text, jsonb) from public;
revoke all on function public.espace_client_append(text, uuid, text, text, jsonb) from anon;
revoke all on function public.espace_client_append(text, uuid, text, text, jsonb) from authenticated;
grant execute on function public.espace_client_append(text, uuid, text, text, jsonb) to service_role;

revoke all on function public.espace_client_consolider(text, text, integer, jsonb, jsonb) from public;
revoke all on function public.espace_client_consolider(text, text, integer, jsonb, jsonb) from anon;
revoke all on function public.espace_client_consolider(text, text, integer, jsonb, jsonb) from authenticated;
grant execute on function public.espace_client_consolider(text, text, integer, jsonb, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 2) espace_client_append — cohérence du chantier ET de l'entreprise
-- -----------------------------------------------------------------------------

create or replace function public.espace_client_append(
  p_cle text,
  p_chantier_id uuid,
  p_client_nom text,
  p_session_id text,
  p_messages jsonb
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_lock bigint;
  v_entreprise uuid;
  v_existante public.espace_client_conversations%rowtype;
begin
  v_lock := ('x' || substr(md5(p_cle), 1, 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock);

  -- O3-B6 : le tenant est déduit du chantier parent, jamais reçu de
  -- l'appelant. Sans chantier, il n'y a pas de tenant : on refuse.
  if p_chantier_id is null then
    raise exception 'espace_client_append: chantier absent'
      using errcode = 'check_violation';
  end if;

  select c.entreprise_id into v_entreprise
    from public.chantiers c
   where c.id = p_chantier_id;

  if v_entreprise is null then
    raise exception 'espace_client_append: chantier introuvable ou sans entreprise'
      using errcode = 'check_violation';
  end if;

  -- O3-B6 : cohérence obligatoire de la ligne déjà présente sous cette `cle`.
  -- C'est ce contrôle qui bloque le rattachement d'une conversation existante
  -- à un autre tenant via `on conflict (cle) do update` : ni changement de
  -- chantier, ni changement d'entreprise. Le verrou advisory ci-dessus sérialise
  -- la lecture et l'insertion, donc pas de fenêtre de course entre les deux.
  select * into v_existante
    from public.espace_client_conversations
   where cle = p_cle;

  if v_existante.id is not null then
    if v_existante.chantier_id is distinct from p_chantier_id
       or v_existante.entreprise_id is distinct from v_entreprise then
      raise exception 'espace_client_append: cle deja utilisee par un autre chantier'
        using errcode = 'check_violation';
    end if;
  end if;

  if p_messages is null or jsonb_typeof(p_messages) <> 'array' then
    p_messages := '[]'::jsonb;
  end if;

  insert into public.espace_client_conversations
    (cle, chantier_id, client_nom, session_id_en_cours, session_demarree_le, messages_session)
  values
    (p_cle, p_chantier_id, p_client_nom, p_session_id, now(), p_messages)
  on conflict (cle) do update
    set messages_session = public.espace_client_conversations.messages_session || excluded.messages_session,
        client_nom = coalesce(excluded.client_nom, public.espace_client_conversations.client_nom),
        session_id_en_cours = coalesce(excluded.session_id_en_cours, public.espace_client_conversations.session_id_en_cours),
        updated_at = now()
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) espace_client_consolider — cohérence de la ligne consolidée
-- -----------------------------------------------------------------------------
--
-- `consolider` ne reçoit pas de chantier : on le déduit de la LIGNE visée, puis
-- on le confronte à l'entreprise de cette même ligne. Toute conversation sans
-- chantier, ou dont l'entreprise diverge de son chantier parent, est refusée
-- avant la moindre écriture (écrasement de `resume_global`, ajout à
-- `resumes_sessions`, purge de `messages_session`).

create or replace function public.espace_client_consolider(
  p_cle text,
  p_session_id text,
  p_nb_messages_calcules integer,
  p_resume_global jsonb,
  p_resume_session jsonb
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_lock bigint;
  v_ligne public.espace_client_conversations%rowtype;
  v_entreprise uuid;
  v_nb_presents integer;
  v_sessions jsonb;
  v_resume jsonb;
begin
  v_lock := ('x' || substr(md5(p_cle), 1, 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock);

  select * into v_ligne from public.espace_client_conversations
    where cle = p_cle
    for update;

  if v_ligne.id is null then
    return jsonb_build_object('ok', false, 'erreur', 'conversation_inconnue');
  end if;

  -- O3-B6 : fail-closed sur la cohérence tenant de la ligne ciblée.
  if v_ligne.chantier_id is null then
    raise exception 'espace_client_consolider: conversation sans chantier'
      using errcode = 'check_violation';
  end if;

  select c.entreprise_id into v_entreprise
    from public.chantiers c
   where c.id = v_ligne.chantier_id;

  if v_entreprise is null or v_entreprise is distinct from v_ligne.entreprise_id then
    raise exception 'espace_client_consolider: incoherence entreprise conversation'
      using errcode = 'check_violation';
  end if;

  v_nb_presents := jsonb_array_length(coalesce(v_ligne.messages_session, '[]'::jsonb));
  v_resume := coalesce(nullif(p_resume_global, 'null'::jsonb), v_ligne.resume_global);
  v_sessions := coalesce(v_ligne.resumes_sessions, '[]'::jsonb);
  if p_resume_session is not null and jsonb_typeof(p_resume_session) <> 'null' then
    v_sessions := v_sessions || p_resume_session;
  end if;

  if v_nb_presents = p_nb_messages_calcules then
    update public.espace_client_conversations
      set resume_global = v_resume,
          resumes_sessions = v_sessions,
          messages_session = '[]'::jsonb,
          updated_at = now()
      where cle = p_cle;
    return jsonb_build_object('ok', true, 'cleared', true, 'id', v_ligne.id);
  end if;

  -- Des messages sont arrivés pendant la consolidation : on garde la mémoire
  -- brute (ils seront consolidés à la prochaine clôture), on met à jour le reste.
  update public.espace_client_conversations
    set resume_global = v_resume,
        resumes_sessions = v_sessions,
        updated_at = now()
    where cle = p_cle;

  return jsonb_build_object(
    'ok', true,
    'cleared', false,
    'messages_calcules', p_nb_messages_calcules,
    'messages_presents', v_nb_presents,
    'id', v_ligne.id
  );
end;
$$;
