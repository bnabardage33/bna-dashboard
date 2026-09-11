import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Migration Espace Client — mémoire multi-sessions (A+B+C)', () => {
  const migrationPath =
    './supabase/migrations/20260912_espace_client_conversations.sql'
  const content = readFileSync(migrationPath, 'utf-8')

  it('crée la table espace_client_conversations avec le bon schéma', () => {
    expect(content).toContain(
      'create table if not exists public.espace_client_conversations'
    )
    expect(content).toContain('cle text not null unique')
    expect(content).toContain('messages_session jsonb not null default')
    expect(content).toContain('resumes_sessions jsonb not null default')
    expect(content).toContain('resume_global jsonb default')
    expect(content).toContain('session_id_en_cours text')
    expect(content).toContain('updated_at timestamptz default now()')
  })

  it('rattache la colonne espace_client_id à notes_patron avec un index unique', () => {
    expect(content).toContain(
      'add column if not exists espace_client_id text'
    )
    expect(content).toContain(
      'create unique index if not exists notes_patron_espace_client_unique_idx'
    )
  })

  it('définit espace_client_append (append de session) avec verrou advisory', () => {
    expect(content).toContain(
      'create or replace function public.espace_client_append'
    )
    expect(content).toContain('pg_advisory_xact_lock')
    expect(content).toContain('on conflict (cle) do update')
    expect(content).toContain('messages_session || excluded.messages_session')
  })

  it('définit espace_client_consolider avec écrasement conditionnel', () => {
    expect(content).toContain(
      'create or replace function public.espace_client_consolider'
    )
    expect(content).toContain('for update')
    expect(content).toContain('jsonb_array_length')
    expect(content).toContain("messages_session = '[]'::jsonb")
    // Le vidage ne doit dépendre d'aucun calcul hasardé : égalité exacte du compte.
    expect(content).toContain('if v_nb_presents = p_nb_messages_calcules then')
  })

  it('accepte aussi un append quand le canal a déjà divergé', () => {
    // Antidote anti-perte : quand les messages ont grandi pendant la génération,
    // on consolide le résumé mais on conserve la mémoire brute.
    expect(content).toContain('cleared')
    expect(content).not.toContain('truncate')
  })
})