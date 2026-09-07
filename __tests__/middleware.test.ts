import { describe, it, expect } from 'vitest'
import { PUBLIC_PATHS } from '../lib/supabase/middleware'

describe('Middleware PUBLIC_PATHS', () => {
  it('contient toutes les routes API internes', () => {
    const requiredApiPaths = [
      '/api/espace-client',
      '/api/chat-client',
      '/api/chat-client-summary',
      '/api/meteo',
      '/api/meteo-vigilance',
      '/api/search',
      '/api/notifications',
      '/api/ia-devis',
      '/api/reformuler-note',
      '/api/transcrire-note',
      '/api/ia-securite',
      '/api/rapports-intemperies/generer',
      '/api/scrape',
      '/api/finance-pin',
      '/api/photos-chantier',
      '/api/analyze-chantier',
      '/api/documents-compta',
    ]

    for (const path of requiredApiPaths) {
      expect(PUBLIC_PATHS).toContain(path)
    }
  })

  it('contient les fichiers statiques publics', () => {
    expect(PUBLIC_PATHS).toContain('/manifest.json')
    expect(PUBLIC_PATHS).toContain('/sw.js')
  })

  it('contient les routes de login et espace-client', () => {
    expect(PUBLIC_PATHS).toContain('/login')
    expect(PUBLIC_PATHS).toContain('/espace-client')
  })
})
