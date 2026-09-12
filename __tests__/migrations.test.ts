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

  it('le fichier de migration IA Devis phase 1 est additif et complet', () => {
    const migrationPath = './supabase/migrations/20260913_ia_devis_phase1.sql'
    const content = readFileSync(migrationPath, 'utf-8')

    // catalogue_ouvrages : coût de revient + nature du coût
    expect(content).toContain('pu_revient')
    expect(content).toContain('type_cout')

    // devis : colonnes numériques calculées côté serveur + surface du métré
    expect(content).toContain('total_ht')
    expect(content).toContain('cout_matiere_ht')
    expect(content).toContain('cout_main_oeuvre_ht')
    expect(content).toContain('marge_ht')
    expect(content).toContain('marge_pct')
    expect(content).toContain('surface_m2')
  })

  it('le fichier de migration socle métré + technique est additif et complet', () => {
    const migrationPath = './supabase/migrations/20260912_metre_technique_socle.sql'
    const content = readFileSync(migrationPath, 'utf-8')

    // chantiers : configuration technique réellement utilisée par calculerPose()
    expect(content).toContain('type_isolant')
    expect(content).toContain('epaisseur_isolant_mm')
    expect(content).toContain('surface_paquet_m2')
    expect(content).toContain('zone_vent_rive')

    // chantier_zones : résultat technique VALIDÉ des moteurs (JSONB, jamais recalculé en SQL)
    expect(content).toContain('resultats_techniques')
    expect(content).toContain('jsonb')

    // lignes_commande : rattachement optionnel à la zone d'origine (FK nullable, non destructif)
    expect(content).toContain('zone_id')
    expect(content).toContain('on delete set null')
  })
})
