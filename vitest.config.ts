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
    setupFiles: './setup-tests.ts',
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
  },
})
