import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'

describe('Logo et PWA', () => {
  it('le fichier logo-bna.png existe et a une taille correcte', () => {
    const stats = readFileSync('./public/logo-bna.png')
    expect(stats.length).toBeGreaterThan(0)
    expect(stats.length).toBeGreaterThan(10000)
  })

  it('le manifest.json contient les icônes PWA', () => {
    const manifest = JSON.parse(readFileSync('./public/manifest.json', 'utf-8'))
    expect(manifest.icons).toBeDefined()
    expect(manifest.icons.length).toBeGreaterThan(0)

    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
  })

  it('les icônes existent dans le répertoire public', () => {
    expect(existsSync('./public/icon-192.png')).toBe(true)
    expect(existsSync('./public/icon-512.png')).toBe(true)
  })
})
