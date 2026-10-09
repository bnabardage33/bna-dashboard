import { describe, it, expect } from 'vitest'
import { PUBLIC_PATHS, PUBLIC_PREFIXES } from '../../lib/supabase/middleware'

describe('Middleware — bouclier PUBLIC_PATHS', () => {
  it('n\'autorise QUE le login comme route publique exacte', () => {
    expect(PUBLIC_PATHS).toContain('/login')
    expect(PUBLIC_PATHS).toHaveLength(1)
  })

  it('expose en PRÉFIXE uniquement le portail client (pages + API)', () => {
    expect(PUBLIC_PREFIXES).toContain('/espace-client')
    expect(PUBLIC_PREFIXES).toContain('/api/espace-client')
    expect(PUBLIC_PREFIXES.length).toBeLessThanOrEqual(2)
  })

  it('ne contient AUCUNE des anciennes routes API privées', () => {
    const anciennesRoutesPubliques = [
      '/api/chat-client',
      '/api/chat-client-summary',
      '/api/meteo',
      '/api/cron/meteo',
      '/api/meteo-vigilance',
      '/api/search',
      '/api/notifications',
      '/api/reformuler-note',
      '/api/transcrire-note',
      '/api/ia-securite',
      '/api/ia-avancement',
      '/api/ia-ocr-ticket',
      '/api/rapports-intemperies/generer',
      '/api/rapports-client/auto',
      '/api/scrape',
      '/api/finance-pin',
      '/api/photos-chantier',
      '/api/documents-compta',
      '/api/chantiers-fournisseurs',
      '/api/dashboard-patron',
      '/manifest.json',
      '/sw.js',
    ]
    for (const route of anciennesRoutesPubliques) {
      expect(PUBLIC_PATHS).not.toContain(route)
      expect(PUBLIC_PREFIXES).not.toContain(route)
    }
  })

  it('protège par session les routes métier et IA', () => {
    const routesProtegees = [
      '/bureau',
      '/terrain',
      '/api/search',
      '/api/dashboard-patron',
      '/api/documents-compta',
      '/api/photos-chantier',
      '/api/ia-devis',
      '/api/chata-client',
    ]
    for (const route of routesProtegees) {
      const estPublicSeul = PUBLIC_PREFIXES.some((p) => route.startsWith(p))
      expect(estPublicSeul).toBe(false)
    }
  })
})