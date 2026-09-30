// @vitest-environment node
//
// O3-B4 — isolation multi-entreprise de lib/anonymizeText.ts
//
// Ces tests exercent le VRAI code de loadDynamicDictionary/anonymizeText (aucun
// mock de anonymizeText, contrairement à __tests__/espace-chat-circuit.test.ts qui
// le neutralise en identité et ne couvre donc aucune isolation).
//
// Le client Supabase est un stub « mini-PostgREST » coopératif : `.eq()` applique
// réellement le filtre sur un jeu de données multi-tenant. Il est donc possible
// d'observer ce que chaque tenant voit réellement dans son dictionnaire. Un mode
// `ignorerFiltre` simule en plus une régression serveur (filtre non appliqué en
// base) pour vérifier que la REVALIDATION applicative rejette quand même.
//
// Aucun accès réseau, aucun DML : uniquement des stubs en mémoire.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { anonymizeText, deanonymizeText } from '../../lib/anonymizeText'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

/** Parcourt `dir` et renvoie tous les fichiers TypeScript (hors node_modules / dotfiles). */
function collecterSources(dir: string): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, entree.name)
    if (entree.isDirectory()) {
      if (entree.name === 'node_modules' || entree.name.startsWith('.')) continue
      sortie.push(...collecterSources(chemin))
    } else if (/\.tsx?$/.test(entree.name)) {
      sortie.push(chemin)
    }
  }
  return sortie
}

/**
 * Remplace le contenu des commentaires et des chaînes par des espaces, en
 * conservant EXACTEMENT la longueur et les retours à la ligne : les index restent
 * valides, mais `anonymizeText(` cité dans un commentaire ou une chaîne n'est plus
 * confondu avec un véritable appel.
 */
function masquer(source: string): string {
  let out = ''
  let i = 0
  const espace = (c: string) => (c === '\n' ? '\n' : ' ')

  while (i < source.length) {
    const c = source[i]
    const suivant = source[i + 1]

    if (c === '/' && suivant === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' '
        i++
      }
      continue
    }
    if (c === '/' && suivant === '*') {
      out += '  '
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += espace(source[i])
        i++
      }
      out += '  '
      i += 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const guillemet = c
      out += c
      i++
      while (i < source.length && source[i] !== guillemet) {
        if (source[i] === '\\') {
          out += '  '
          i += 2
          continue
        }
        out += espace(source[i])
        i++
      }
      out += guillemet
      i++
      continue
    }
    out += c
    i++
  }
  return out
}

/**
 * Compte les arguments d'un appel dont la parenthèse ouvrante est à
 * `indexOuverture`. Le source doit avoir été masqué par `masquer()`.
 */
function compterArguments(source: string, indexOuverture: number): number {
  let profondeur = 0
  let virgules = 0
  for (let i = indexOuverture; i < source.length; i++) {
    const c = source[i]
    if (c === '(' || c === '{' || c === '[') profondeur++
    else if (c === ')' || c === '}' || c === ']') {
      profondeur--
      if (profondeur === 0) return virgules + 1
    } else if (c === ',' && profondeur === 1) virgules++
  }
  return -1
}

const BNA = '11111111-1111-4111-8111-111111111111'
const TEST = '22222222-2222-4222-8222-222222222222'
const URL_SUPABASE = 'https://projet.test.supabase.co'
const CLE_SERVICE = 'service-role-key-de-test'

type Row = Record<string, unknown>
type Lecture = { table: string; select: string; eq: [string, unknown] | null }

// Jeu de données calqué sur l'état réel connu des deux tenants.
const CLIENT_BNA: Row = {
  nom: 'TEST_P1 Client',
  societe: 'SCI BNA',
  ville: 'bordeaux ',
  tel: null,
  entreprise_id: BNA,
}
const CLIENT_TEST: Row = {
  nom: 'Client Isolation Test',
  societe: 'SCI TEST',
  ville: 'Lille',
  tel: null,
  entreprise_id: TEST,
}
const CHANTIER_BNA_1: Row = {
  adresse_chantier: '12 rue des Lilas, Bordeaux',
  code_acces: 'BNA-U4OM4Z',
  entreprise_id: BNA,
}
const CHANTIER_BNA_2: Row = {
  adresse_chantier: '5 impasse du Moulin, Talence',
  code_acces: 'BNA-48XN84',
  entreprise_id: BNA,
}
const CHANTIER_TEST: Row = {
  adresse_chantier: '99 rue Nationale, Lille',
  code_acces: null,
  entreprise_id: TEST,
}

const TOUT: Record<string, Row[]> = {
  clients: [CLIENT_BNA, CLIENT_TEST],
  chantiers: [CHANTIER_BNA_1, CHANTIER_BNA_2, CHANTIER_TEST],
}

// Texte mêlant volontairement des valeurs des DEUX tenants : sous un dictionnaire
// correctement cloisonné, seules les valeurs du tenant attendu sont remplacées.
const TEXTE_MIXTE =
  'Pour TEST_P1 Client de SCI BNA, chantier au 12 rue des Lilas, Bordeaux. ' +
  'Affecter aussi Client Isolation Test au 99 rue Nationale, Lille.'

function installerSupabase(
  donnees: Record<string, Row[]>,
  options: { ignorerFiltre?: boolean } = {}
): { lectures: Lecture[] } {
  const lectures: Lecture[] = []
  const client = {
    from(table: string) {
      return {
        select(colonnes: string) {
          const lecture: Lecture = { table, select: colonnes, eq: null }
          lectures.push(lecture)
          return {
            eq(colonne: string, valeur: unknown) {
              lecture.eq = [colonne, valeur]
              const source = donnees[table] ?? []
              const data = options.ignorerFiltre
                ? source
                : source.filter((r) => r[colonne] === valeur)
              return Promise.resolve({ data, error: null })
            },
          }
        },
      }
    },
  }
  vi.mocked(createClient).mockImplementation(() => client as never)
  return { lectures }
}

beforeEach(() => {
  vi.mocked(createClient).mockReset()
})

describe('O3-B4 — anonymizeText : dictionnaire dynamique cloisonné par entreprise', () => {
  it('A. entrepriseId invalide → refus immédiat, AUCUNE requête Supabase émise', async () => {
    const { lectures } = installerSupabase(TOUT)

    const invalides: unknown[] = [
      '',
      '   ',
      'pas-un-uuid',
      BNA.replace(/-/g, ''),
      BNA.toUpperCase().slice(0, -1),
      `${BNA}' OR '1'='1`,
      '11111111-1111-1111-1111-111111111111', // version 1 : hors [1-5]
      '11111111-1111-4111-c111-111111111111', // variante hors [89ab]
      '11111111-1111-4111-8111-11111111111', // trop court
      null,
      undefined,
      42,
      {},
      [],
    ]

    for (const invalide of invalides) {
      await expect(
        anonymizeText('texte', URL_SUPABASE, CLE_SERVICE, invalide as string)
      ).rejects.toThrow(/entreprise invalide/i)
    }

    // Aucune requête n'a été émise : le client n'est même pas instancié.
    expect(createClient).not.toHaveBeenCalled()
    expect(lectures).toHaveLength(0)
  })

  it('B. tenant TEST → le SELECT clients porte obligatoirement .eq("entreprise_id", TEST)', async () => {
    const { lectures } = installerSupabase(TOUT)

    await anonymizeText('bonjour', URL_SUPABASE, CLE_SERVICE, TEST)

    const clients = lectures.find((l) => l.table === 'clients')
    expect(clients, 'aucune lecture de la table clients').toBeDefined()
    expect(clients?.eq).toEqual(['entreprise_id', TEST])
    // `entreprise_id` doit aussi être relu pour la revalidation.
    expect(clients?.select).toContain('entreprise_id')
  })

  it('C. tenant TEST → le SELECT chantiers porte obligatoirement .eq("entreprise_id", TEST)', async () => {
    const { lectures } = installerSupabase(TOUT)

    await anonymizeText('bonjour', URL_SUPABASE, CLE_SERVICE, TEST)

    const chantiers = lectures.find((l) => l.table === 'chantiers')
    expect(chantiers, 'aucune lecture de la table chantiers').toBeDefined()
    expect(chantiers?.eq).toEqual(['entreprise_id', TEST])
    expect(chantiers?.select).toContain('entreprise_id')
  })

  it('D. tenant BNA → aucune donnée TEST n\'entre dans le dictionnaire', async () => {
    installerSupabase(TOUT)

    const { anonymizedText, mapping } = await anonymizeText(
      TEXTE_MIXTE,
      URL_SUPABASE,
      CLE_SERVICE,
      BNA
    )
    const substitues = Object.values(mapping)

    // Les valeurs BNA sont bien masquées.
    expect(substitues).toContain('TEST_P1 Client')
    expect(substitues).toContain('SCI BNA')
    expect(substitues).toContain('12 rue des Lilas, Bordeaux')
    expect(anonymizedText).not.toContain('TEST_P1 Client')
    expect(anonymizedText).not.toContain('12 rue des Lilas, Bordeaux')

    // Les valeurs TEST restent en clair : elles n'étaient pas dans le dictionnaire.
    expect(substitues).not.toContain('Client Isolation Test')
    expect(substitues).not.toContain('99 rue Nationale, Lille')
    expect(substitues).not.toContain('SCI TEST')
    expect(substitues).not.toContain('Lille')
    expect(anonymizedText).toContain('Client Isolation Test')
    expect(anonymizedText).toContain('99 rue Nationale, Lille')
  })

  it('E. tenant TEST → aucune donnée BNA n\'entre dans le dictionnaire', async () => {
    installerSupabase(TOUT)

    const { anonymizedText, mapping } = await anonymizeText(
      TEXTE_MIXTE,
      URL_SUPABASE,
      CLE_SERVICE,
      TEST
    )
    const substitues = Object.values(mapping)

    // Les valeurs TEST sont bien masquées.
    expect(substitues).toContain('Client Isolation Test')
    expect(substitues).toContain('99 rue Nationale, Lille')
    expect(anonymizedText).not.toContain('Client Isolation Test')
    expect(anonymizedText).not.toContain('99 rue Nationale, Lille')

    // Les valeurs BNA restent en clair.
    expect(substitues).not.toContain('TEST_P1 Client')
    expect(substitues).not.toContain('SCI BNA')
    expect(substitues).not.toContain('12 rue des Lilas, Bordeaux')
    expect(substitues).not.toContain('bordeaux ')
    expect(anonymizedText).toContain('TEST_P1 Client')
    expect(anonymizedText).toContain('12 rue des Lilas, Bordeaux')
  })

  it('F. ligne remontée avec un entreprise_id étranger → throw fail-closed (serveur non coopératif)', async () => {
    // Mode dégradé : le serveur ignore `.eq()` et renvoie tout. La revalidation
    // applicative doit malgré tout tout rejeter.
    const { lectures } = installerSupabase(TOUT, { ignorerFiltre: true })

    await expect(
      anonymizeText(TEXTE_MIXTE, URL_SUPABASE, CLE_SERVICE, BNA)
    ).rejects.toThrow(/hors entreprise attendue/i)

    // Coupure au premier défaut : on n'atteint pas la lecture chantiers.
    expect(lectures.map((l) => l.table)).toEqual(['clients'])
  })

  it('F2. régression isolée sur chantiers → throw fail-closed named \'chantiers\'', async () => {
    const { lectures } = installerSupabase(
      {
        clients: [CLIENT_BNA],
        chantiers: [CHANTIER_TEST], // ligne TEST servie à un tenant BNA
      },
      { ignorerFiltre: true }
    )

    await expect(
      anonymizeText('bonjour', URL_SUPABASE, CLE_SERVICE, BNA)
    ).rejects.toThrow(/chantiers/i)

    expect(lectures.map((l) => l.table)).toEqual(['clients', 'chantiers'])
  })

  it('F3. ligne à entreprise_id NULL → throw fail-closed', async () => {
    installerSupabase(
      {
        clients: [{ ...CLIENT_BNA, entreprise_id: null }],
        chantiers: [],
      },
      { ignorerFiltre: true }
    )

    await expect(
      anonymizeText('bonjour', URL_SUPABASE, CLE_SERVICE, BNA)
    ).rejects.toThrow(/hors entreprise attendue/i)
  })

  it('G1. le tenant est un paramètre OBLIGATOIRE (preuve de compilation)', async () => {
    // @ts-expect-error `entrepriseId` est un 4e argument obligatoire : cet appel ne compile pas.
    const promesse = anonymizeText('texte', URL_SUPABASE, CLE_SERVICE)
    // Défense en profondeur : même à l'exécution, l'argument manquant est refusé.
    await expect(promesse).rejects.toThrow(/entreprise invalide/i)
    expect(createClient).not.toHaveBeenCalled()

    // @ts-expect-error le tenant doit être une chaîne, pas un nombre.
    const autre = anonymizeText('texte', URL_SUPABASE, CLE_SERVICE, 42)
    await expect(autre).rejects.toThrow(/entreprise invalide/i)
  })

  it('G2. aucune valeur par défaut ni paramètre optionnel dans le contrat', () => {
    const source = readFileSync(new URL('../../lib/anonymizeText.ts', import.meta.url), 'utf8')

    // Ni `entrepriseId?` (optionnel) ni `entrepriseId = …` (défaut) nulle part.
    expect(source).not.toMatch(/entrepriseId\?/)
    expect(source).not.toMatch(/entrepriseId:\s*string\s*=/)
    expect(source).not.toMatch(/entrepriseId\s*=\s*[^=,)]/)

    // `entrepriseId: string` est présent dans LES DEUX signatures concernées.
    const sigChargement =
      /async function loadDynamicDictionary\([\s\S]*?\): Promise<SupabaseDictEntry\[\]>/.exec(source)
    const sigPrincipale =
      /export async function anonymizeText\([\s\S]*?\): Promise<AnonymizeResult>/.exec(source)

    expect(sigChargement, 'signature de loadDynamicDictionary introuvable').not.toBeNull()
    expect(sigPrincipale, 'signature de anonymizeText introuvable').not.toBeNull()
    expect(sigChargement?.[0]).toMatch(/entrepriseId:\s*string/)
    expect(sigPrincipale?.[0]).toMatch(/entrepriseId:\s*string/)

    // Un seul point d'appel au dictionnaire, et il transmet le tenant.
    const appelsDico = source.match(/await loadDynamicDictionary\([\s\S]*?\)/g) ?? []
    expect(appelsDico.length).toBe(1)
    expect(appelsDico[0]).toMatch(/supabaseUrl,\s*supabaseKey,\s*entrepriseId\s*\)/)
  })

  it('G4. TOUS les appels de anonymizeText du dépôt passent bien 4 arguments', () => {
    const racine = fileURLToPath(new URL('../../', import.meta.url))
    const cibles = [
      ...collecterSources(join(racine, 'app')),
      ...collecterSources(join(racine, 'lib')),
      join(racine, 'lib', 'anonymizeText.ts'),
    ].filter((f) => existsSync(f))

    const sites: Array<{ fichier: string; arguments: number }> = []
    for (const fichier of cibles) {
      const source = masquer(readFileSync(fichier, 'utf8'))
      const motif = /\banonymizeText\s*\(/g
      let m: RegExpExecArray | null
      while ((m = motif.exec(source)) !== null) {
        // Ignore la déclaration (`export async function anonymizeText(`) : elle
        // définit le contrat, ce n'est pas un appel.
        const avant = source.slice(Math.max(0, m.index - 30), m.index)
        if (/function\s+$/.test(avant)) continue
        const args = compterArguments(source, m.index + 'anonymizeText'.length)
        sites.push({ fichier: fichier.slice(racine.length), arguments: args })
      }
    }

    // On a bien trouvé les deux appelants de production.
    const attendus = ['app/api/espace-client/[code_acces]/chat/route.ts', 'app/api/reformuler-note/route.ts']
    for (const attendu of attendus) {
      expect(sites.map((s) => s.fichier)).toContain(attendu)
    }

    // Aucun appel sans le tenant : 4 arguments partout.
    for (const site of sites) {
      expect(site.arguments, `appel à anonymizeText avec ${site.arguments} argument(s) — ${site.fichier}`).toBe(4)
    }
  })

  it('G3. chaque lecture émise est scopée — pour les deux tenants', async () => {
    for (const tenant of [BNA, TEST]) {
      const { lectures } = installerSupabase(TOUT)
      await anonymizeText(TEXTE_MIXTE, URL_SUPABASE, CLE_SERVICE, tenant)

      const tables = lectures.map((l) => l.table)
      expect(tables).toContain('clients')
      expect(tables).toContain('chantiers')
      for (const lecture of lectures) {
        expect(lecture.eq, `lecture non scopée sur ${lecture.table}`).toEqual([
          'entreprise_id',
          tenant,
        ])
      }
    }
  })
})

describe('O3-B4 — anonymizeText : comportement fonctionnel préservé', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('le dictionnaire du tenant est réellement utilisé (balises + désanonymisation)', async () => {
    installerSupabase(TOUT)

    const { anonymizedText, mapping } = await anonymizeText(
      TEXTE_MIXTE,
      URL_SUPABASE,
      CLE_SERVICE,
      BNA
    )

    expect(anonymizedText).toContain('[NOM_CLIENT_1]')
    expect(anonymizedText).toContain('[SOCIETE_1]')
    expect(anonymizedText).toContain('[ADRESSE_1]')
    expect(mapping['[NOM_CLIENT_1]']).toBe('TEST_P1 Client')

    // La ré-injection restitue le texte initial.
    expect(deanonymizeText(anonymizedText, mapping)).toBe(TEXTE_MIXTE)
  })

  it('les code_acces du tenant sont bien chiffrés dans le dictionnaire (comportement conservé)', async () => {
    installerSupabase(TOUT)

    const { anonymizedText, mapping } = await anonymizeText(
      'Le digicode du chantier est BNA-48XN84 merci',
      URL_SUPABASE,
      CLE_SERVICE,
      BNA
    )

    expect(anonymizedText).toContain('[CODE_ACCES_1]')
    expect(anonymizedText).not.toContain('BNA-48XN84')
    expect(mapping['[CODE_ACCES_1]']).toBe('BNA-48XN84')
  })

  it('un code_acces d\'un AUTRE tenant reste en clair (non masqué, donc non secret connu)', async () => {
    installerSupabase(TOUT)

    const { anonymizedText, mapping } = await anonymizeText(
      'Le digicode du chantier est BNA-48XN84 merci',
      URL_SUPABASE,
      CLE_SERVICE,
      TEST
    )

    expect(Object.values(mapping)).not.toContain('BNA-48XN84')
    expect(anonymizedText).toContain('BNA-48XN84')
  })
})
