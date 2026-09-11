-- Espace client : mémoire multi-sessions des conversations chat (design A+B+C validé)
-- Consolidation incrémentale en 2 niveaux : messages bruts de session (Niveau 1)
-- + resume_global condensé (Niveau 2). Le LLM ne reçoit jamais l'intégralité
-- de l'historique : resume_global + session en cours seulement.
--
-- Concurrence : écritures sérialisées par verrou advisory par clé (chantier),
-- et consolider() ne vide messages_session QUE si elle n'a pas grandi pendant le
-- calcul (un append arrivé pendant la consolidation n'est jamais perdu).

create extension if not exists pgcrypto;

create table if not exists public.espace_client_conversations (
  id uuid primary key default gen_random_uuid(),
  cle text not null unique,
  chantier_id uuid references public.chantiers(id) on delete cascade,
  client_nom text,
  session_id_en_cours text,
  messages_session jsonb not null default '[]'::jsonb,
  session_demarree_le timestamptz,
  resumes_sessions jsonb not null default '[]'::jsonb,
  resume_global jsonb default '{"texte":"","sentiment_global":"neutre","demandes_en_attente":[],"points_cles":[],"maj_le":null}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.notes_patron
  add column if not exists espace_client_id text;

create index if not exists espace_client_conversations_chantier_idx
  on public.espace_client_conversations (chantier_id)
  where chantier_id is not null;

create unique index if not exists notes_patron_espace_client_unique_idx
  on public.notes_patron (espace_client_id)
  where espace_client_id is not null;

-- Serre la main d'écriture par conversation (verrou advisory sur la clé).
-- Crée la ligne si absente, sinon concatène les messages bruts de la session
-- courante et rafraîchit le marqueur de session.
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
begin
  v_lock := ('x' || substr(md5(p_cle), 1, 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock);

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

-- Consolide en sécurité : attache le résumé de session (append-only), remplace
-- resume_global, et ne vide messages_session QUE si son contenu n'a pas grandi
-- pendant la génération du résumé (antidote à l'écrasement de mémoire entre
-- deux consolidations simultanées — le verrou advisory sérialise).
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