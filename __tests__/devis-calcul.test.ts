import { describe, it, expect } from 'vitest'
import {
  typeCoutValide,
  arrondir,
  estLigneChiffrable,
  montantLigne,
  coutLigne,
  calculerDevis,
  creerLigneAChiffrer,
  type LigneDevis,
} from '@/lib/devisCalcul'

function ligne(partial: Partial<LigneDevis>): LigneDevis {
  return {
    catalogue_id: null,
    designation: '',
    qte: null,
    unite: 'forfait',
    pu_ht: null,
    pu_revient: null,
    type_cout: null,
    a_chiffrer: false,
    ...partial,
  }
}

describe('devisCalcul — moteur de calcul IA Devis (phase 1)', () => {
  it('arrondit au centime', () => {
    expect(arrondir(12.3456)).toBe(12.35)
    expect(arrondir(12.344)).toBe(12.34)
  })

  it('typeCoutValide ne retient que matiere / main_oeuvre', () => {
    expect(typeCoutValide('matiere')).toBe(true)
    expect(typeCoutValide('main_oeuvre')).toBe(true)
    expect(typeCoutValide('pose')).toBe(false)
    expect(typeCoutValide(null)).toBe(false)
  })

  describe('estChiffrable / montantLigne', () => {
    it('une ligne À CHIFFRER ne compte jamais', () => {
      const l = ligne({ catalogue_id: 'abc', designation: 'Panneau', qte: 10, pu_ht: 5, pu_revient: 3, a_chiffrer: true })
      expect(estLigneChiffrable(l)).toBe(false)
      expect(montantLigne(l)).toBe(0)
      expect(coutLigne(l)).toBe(0)
    })

    it('une ligne catalogue complète est chiffrable', () => {
      const l = ligne({ catalogue_id: 'abc', designation: 'Panneau', qte: 10, unite: 'm²', pu_ht: 5, pu_revient: 3 })
      expect(estLigneChiffrable(l)).toBe(true)
      expect(montantLigne(l)).toBe(50)
      expect(coutLigne(l)).toBe(30)
    })

    it('une ligne MANUELLE (sans catalogue_id) reste chiffrable — saisie patron préservée', () => {
      const l = ligne({ designation: 'Pose main courante', qte: 2, unite: 'ml', pu_ht: 45 })
      expect(estLigneChiffrable(l)).toBe(true)
      expect(montantLigne(l)).toBe(90)
    })

    it('une ligne incomplète (qte ou prix manquant) n\'est pas chiffrable', () => {
      expect(estLigneChiffrable(ligne({ designation: 'Cheville', qte: 50, pu_ht: null }))).toBe(false)
      expect(estLigneChiffrable(ligne({ designation: 'Cheville', qte: 0, pu_ht: 0.2 }))).toBe(false)
      expect(estLigneChiffrable(ligne({ designation: '', qte: 50, pu_ht: 0.2 }))).toBe(true)
    })
  })

  it('creerLigneAChiffrer fabrique une ligne sans prix ni quantité', () => {
    const l = creerLigneAChiffrer('Liteaux', 'magnéto / bois')
    expect(l.a_chiffrer).toBe(true)
    expect(l.catalogue_id).toBeNull()
    expect(l.qte).toBeNull()
    expect(l.pu_ht).toBeNull()
    expect(estLigneChiffrable(l)).toBe(false)
  })

  describe('calculerDevis — totaux officiels', () => {
    it('cumule total / coûts / marge et exclut À CHIFFRER', () => {
      const lignes: LigneDevis[] = [
        // Matière, 2 lignes
        ligne({ catalogue_id: 'p1', designation: 'Panneau', qte: 10, unite: 'm²', pu_ht: 5, pu_revient: 3, type_cout: 'matiere' }),
        ligne({ catalogue_id: 'p2', designation: 'Cheville', qte: 100, unite: 'unité', pu_ht: 0.2, pu_revient: 0.1, type_cout: 'matiere' }),
        // Main-d'œuvre
        ligne({ catalogue_id: 'm1', designation: 'Pose vêture', qte: 10, unite: 'm²', pu_ht: 12, pu_revient: 12, type_cout: 'main_oeuvre' }),
        // Manuelle (patron) : pas de coût connu
        ligne({ designation: 'Location nacelle', qte: 1, unite: 'forfait', pu_ht: 800 }),
        // À CHIFFRER : jamais dans les totaux
        creerLigneAChiffrer('Divers', ''),
      ]

      const r = calculerDevis(lignes)
      expect(r.total_ht).toBe(50 + 20 + 120 + 800)
      expect(r.cout_matiere_ht).toBe(30 + 10)
      expect(r.cout_main_oeuvre_ht).toBe(120)
      expect(r.marge_ht).toBe(990 - 40 - 120)
      expect(r.marge_pct).toBe(Math.round((830 / 990) * 10000) / 100)
      expect(r.nb_a_chiffrer).toBe(1)
    })

    it('marge_pct = 0 quand total_ht = 0', () => {
      const r = calculerDevis([creerLigneAChiffrer('Seule ligne', '')])
      expect(r.total_ht).toBe(0)
      expect(r.marge_ht).toBe(0)
      expect(r.marge_pct).toBe(0)
      expect(r.nb_a_chiffrer).toBe(1)
    })

    it('une ligne avec type_cout inconnu tombe dans la matière', () => {
      const r = calculerDevis([ligne({ catalogue_id: 'x', designation: 'Divers', qte: 2, unite: 'u', pu_ht: 10, pu_revient: 4, type_cout: 'pose' as never })])
      expect(r.cout_matiere_ht).toBe(8)
      expect(r.cout_main_oeuvre_ht).toBe(0)
    })
  })
})