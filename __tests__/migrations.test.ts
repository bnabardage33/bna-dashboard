import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Migrations SQL', () => {
  it('le fichier de migration 20260907 existe', () => {
    const migrationPath = './supabase/migrations/20260907_add_missing_columns.sql'
    const content = readFileSync(migrationPath, 'utf-8')
    expect(content).toContain('avancements_chantier')
    expect(content).toContain('details jsonb')
    expect(content).toContain('commentaire text')
    expect(content).toContain('created_at timestamptz')
    expect(content).toContain('tickets_sav')
    expect(content).toContain('signature_technicien')
  })
})
