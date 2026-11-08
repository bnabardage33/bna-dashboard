import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['__tests__/**/*.test.{ts,tsx}'],
    // O3-B6 : chaque fichier de test ouvre son propre environnement jsdom.
    // Avec le pool `forks` par défaut (1 worker par cœur, 8 sur cette machine)
    // et ~900 Mo réellement disponibles, le démarrage des workers se fait
    // interroger ("Timeout waiting for worker to respond") : le symptôme est
    // un fichier de test DIFFÉRENT à chaque exécution, jamais le même, et
    // AUCUN échec d'assertion. Le facteur limitant est le nombre de fichiers,
    // pas les assertions. Borner le pool rend `npm test` déterministe — et plus
    // rapide (151 s contre 113 s, `environment` 300 s contre 378 s).
    maxWorkers: 3,
    // Certains tests montent un DOM complet (React 19 + jsdom) et dépassent
    // 5 s quand les 3 workers sont occupés : le timeout par défaut produisait
    // des échecs intermittents sans rapport avec le code testé. On garde une
    // borne (15 s) pour détecter les vraies boucles infinies.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
})
