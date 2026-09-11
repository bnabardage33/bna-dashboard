import { describe, it, expect } from 'vitest'
import {
  MessageChat,
  SEUIL_TOKENS_SESSION,
  decouperParTokens,
  estimerTokensMessages,
  estimerTokensTexte,
  resumeVide,
} from '../lib/espace-chat-utils'

function message(content: string, role: 'user' | 'assistant' = 'user'): MessageChat {
  return { role, content }
}

describe('espace-chat-utils — estimation tokens', () => {
  it('une chaîne vide ou null vaut 0 token', () => {
    expect(estimerTokensTexte('')).toBe(0)
    expect(estimerTokensTexte(null)).toBe(0)
    expect(estimerTokensTexte(undefined)).toBe(0)
  })

  it('estimation proportionnelle à la longueur (~3,7 caractères par token)', () => {
    const vingtChar = 'a'.repeat(20)
    expect(estimerTokensTexte(vingtChar)).toBe(Math.ceil(20 / 3.7))
    const milleChar = 'text '.repeat(200)
    expect(estimerTokensTexte(milleChar)).toBeGreaterThan(0)
  })

  it('estimation messages = contenu + surcoût par message', () => {
    const contenuSeul = estimerTokensTexte('bonjour')
    const un = estimerTokensMessages([message('bonjour')])
    expect(un).toBeGreaterThan(contenuSeul)
    const deux = estimerTokensMessages([message('bonjour'), message('au revoir')])
    expect(deux).toBeGreaterThan(un)
  })
})

describe('espace-chat-utils — découpage par budget tokens', () => {
  it('restitue exactement les messages d entrée (ordre et contenu préservés)', () => {
    const entree = [
      message('premier message de test'),
      message('deuxième message', 'assistant'),
      message('troisième message'),
    ]
    const paquets = decouperParTokens(entree, Math.floor(estimerTokensMessages(entree) / 2))
    expect(paquets.length).toBeGreaterThan(1)
    const reapian = paquets.flat()
    expect(reapian).toEqual(entree)
  })

  it('aucun paquet ne dépasse le budget (sauf un message seul trop lourd)', () => {
    const entree = Array.from({ length: 200 }, (_, i) => message(`message numéro ${i} avec du contenu`))
    const budget = 500
    for (const paquet of decouperParTokens(entree, budget)) {
      expect(paquet.length).toBeGreaterThan(0)
      const poids = estimerTokensMessages(paquet)
      if (paquet.length > 1) expect(poids).toBeLessThanOrEqual(budget)
    }
  })

  it('une liste vide donne zéro paquet', () => {
    expect(decouperParTokens([], 1000)).toEqual([])
  })

  it('un budget nul ou négatif donne zéro paquet', () => {
    expect(decouperParTokens([message('a')], 0)).toEqual([])
    expect(decouperParTokens([message('a')], -1)).toEqual([])
  })

  it('le seuil global reste une constante positive finie', () => {
    expect(SEUIL_TOKENS_SESSION).toBeGreaterThan(0)
    expect(Number.isFinite(SEUIL_TOKENS_SESSION)).toBe(true)
  })
})

describe('espace-chat-utils — état initial', () => {
  it('resumeVide fournit un état cohérent et typé', () => {
    const vide = resumeVide()
    expect(vide.texte).toBe('')
    expect(vide.sentiment_global).toBe('neutre')
    expect(vide.demandes_en_attente).toEqual([])
    expect(vide.points_cles).toEqual([])
    expect(vide.sessions).toBe(0)
    expect(vide.maj_le).toBeNull()
  })
})