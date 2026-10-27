// @vitest-environment node
//
// SSRF — `app/api/ia-ocr-ticket` (audit final série B, point E).
//
// CHAÎNE CAUSALE AVANT CORRECTION
// ------------------------------
//     async function imageEnBase64(url) {
//       const res = await fetch(url);            // ← aucune validation
//       const buffer = Buffer.from(await res.arrayBuffer());
//     }
//
// L'URL provenait de DEUX sources entièrement contrôlables par le client :
//   * multipart sans fichier → `fd.get("image_url")` ;
//   * corps JSON             → `body.image_url`.
// (La troisième source, `getPublicUrl` après upload, est construite par le
// serveur : elle n'est pas une entrée SSRF.)
//
// Le contenu récupéré était ensuite envoyé à Gemini. Une cible SSRF était donc
// aussi un canal d'exfiltration du contenu d'une URL interne.
//
// APRÈS CORRECTION
// ----------------
// Validation par ALLOWLIST (bucket public du projet courant) avant tout
// `fetch`, schéma https, refus des IP littérales, refus des identifiants et
// ports non standards, préfixe de chemin imposé, résolution DNS contrôlée
// contre les plages non routables, et REVALIDATION DE CHAQUE REDIRECTION.
// Le téléchargement est en outre plafonné en taille et refuse un contenu non
// image.
//
// `fetch` est injecté dans le validateur : aucun réseau n'est requis par ces
// tests, et le nombre d'appels est vérifié (une destination refusée ne doit
// jamais être contactée).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  adresseInterdite,
  estIpLitterale,
  telechargerImageStockage,
  validerUrlStockage,
  UrlStockageRefusee,
} from '@/lib/urlStockageAutorisee'

const ORIGINE = 'https://stockage.test'
const BUCKET = 'tickets'
const IP_PUBLIQUE = '8.8.8.8'

const LEGITIME = `${ORIGINE}/storage/v1/object/public/${BUCKET}/ia-ocr/1758000000-a1b2c3.jpg`

// ── Mocks de module (niveau module : obligatoire pour `vi.mock`) ─────────────

const spies = vi.hoisted(() => ({
  generateText: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}))

vi.mock('ai', () => ({ generateText: spies.generateText }))
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: () => () => 'modele-test',
}))
vi.mock('@/lib/auth', () => ({
  verifierSession: async () => ({ authentifie: true }),
}))
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        upload: spies.upload,
        getPublicUrl: spies.getPublicUrl,
      }),
    },
  },
}))

// La route appelle le validateur SANS injecter de résolveur : elle utilise donc
// `dns.promises.lookup`. On le mocke pour que ces tests n'exigent aucun réseau
// et que le comportement « hôte non résolvable » reste fail-closed (502) quand
// le DNS répond autre chose que l'attendu.
vi.mock('node:dns/promises', () => ({
  lookup: async (_hote: string) => [{ address: '8.8.8.8', family: 4 }],
}))

/** Résolveur par défaut : l'hôte allowlisté résout vers une IP publique. */
const resolveurPublic = async (): Promise<string[]> => [IP_PUBLIQUE]

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINE
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── A. Plages d'adresses ─────────────────────────────────────────────────────

describe('SSRF — plages d\'adresses non routables', () => {
  it('A1 — loopback, RFC1918, link-local, CGNAT, multicast, réservées', () => {
    const interdites = [
      '127.0.0.1',
      '127.1.2.3',
      '10.0.0.1',
      '10.255.255.255',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.0.1',
      '192.168.255.255',
      '169.254.169.254', // metadata cloud (CLOUDFLAGS / EKS)
      '169.254.0.1',
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '224.0.0.1', // multicast
      '240.0.0.1', // réservé
      '255.255.255.255',
      '198.18.0.1', // benchmarking
    ]
    for (const ip of interdites) {
      expect([ip, adresseInterdite(ip)]).toEqual([ip, true])
    }
  })

  it('A2 — adresses publiques : autorisées', () => {
    for (const ip of [
      '8.8.8.8',
      '1.1.1.1',
      '172.32.0.1', // juste au-dessus de 172.16/12
      '172.15.255.255', // juste en dessous
      '11.0.0.1', // juste au-dessus de 10/8
      '100.63.255.255', // juste en dessous de CGNAT
      '100.128.0.1', // juste au-dessus
      '169.253.255.255', // juste en dessous du link-local
      '169.255.0.1', // juste au-dessus
      '223.255.255.255', // juste en dessous du multicast
    ]) {
      expect([ip, adresseInterdite(ip)]).toEqual([ip, false])
    }
  })

  it('A3 — IPv6 : loopback, non spécifié, link-local, ULA, multicast', () => {
    for (const ip of [
      '::1',
      '::',
      'fe80::1',
      'fc00::1',
      'fd12:3456::1', // ULA
      'ff02::1', // multicast
    ]) {
      expect([ip, adresseInterdite(ip)]).toEqual([ip, true])
    }
    for (const ip of ['2606:4700::1111', '2001:4860:4860::8888']) {
      expect([ip, adresseInterdite(ip)]).toEqual([ip, false])
    }
  })

  it('A4 — IPv4 mappée en IPv6 : les règles IPv4 s\'appliquent', () => {
    // Sans ce cas, « ::ffff:127.0.0.1 » passerait alors que « 127.0.0.1 »
    // est bloqué : c'est le contournement classique d'un filtre IPv6 naïf.
    for (const ip of ['::ffff:127.0.0.1', '::ffff:169.254.169.254', '::ffff:7f00:1']) {
      expect([ip, adresseInterdite(ip)]).toEqual([ip, true])
    }
    expect(adresseInterdite('::ffff:8.8.8.8')).toBe(false)
  })

  it('A5 — détection d\'IP littérale (vs nom de domaine)', () => {
    expect(estIpLitterale('127.0.0.1')).toBe(true)
    expect(estIpLitterale('::1')).toBe(true)
    expect(estIpLitterale('[::1]')).toBe(true)
    expect(estIpLitterale('stockage.test')).toBe(false)
    expect(estIpLitterale('1a2b3c.test')).toBe(false)
  })

  it('A6 — nouvelles plages IPv4 et frontières de 192.88.99.0/24', () => {
    for (const ip of ['192.88.99.0', '192.88.99.1', '192.88.99.255']) {
      expect([ip, adresseInterdite(ip)]).toEqual([ip, true])
    }
    for (const ip of ['192.88.98.255', '192.88.100.0']) {
      expect([ip, adresseInterdite(ip)]).toEqual([ip, false])
    }
  })

  it('A7 — préfixes IPv6 spéciaux ajoutés et frontières publiques', () => {
    const interdites = [
      '64:ff9b::',
      '64:ff9b::ffff:ffff',
      '64:ff9b:1::',
      '64:ff9b:1:ffff:ffff:ffff:ffff:ffff',
      '100::1',
      '100::ffff:ffff:ffff:ffff',
      '2001:2::1',
      '2001:2:0:ffff:ffff:ffff:ffff:ffff',
      '2001:10::1',
      '2001:1f:ffff:ffff:ffff:ffff:ffff:ffff',
      '2001:db8::1',
      '2002::1',
      '3fff::1',
      '3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff',
      '5f00::1',
    ]
    for (const ip of interdites) {
      expect([ip, adresseInterdite(ip)]).toEqual([ip, true])
    }

    // Les bornes immédiatement extérieures restent admises lorsqu'elles sont
    // dans l'espace global et hors des exclusions de la politique.
    for (const ip of [
      '2001:db7::1',
      '2001:db9::1',
      '2001:200::1',
      '2003::1',
      '3fff:1000::1',
      '2001:4860:4860::8888',
      '2606:4700::1111',
    ]) {
      expect([ip, adresseInterdite(ip)]).toEqual([ip, false])
    }
  })

  it('A8 — 2001::/23 : exceptions IANA exactes et adresses voisines refusées', () => {
    const exceptions = [
      '2001:1::1',
      '2001:1::2',
      '2001:1::3',
      '2001:3::1',
      '2001:4:112::1',
      '2001:20::1',
      '2001:2f:ffff:ffff:ffff:ffff:ffff:ffff',
      '2001:30::1',
      '2001:3f:ffff:ffff:ffff:ffff:ffff:ffff',
    ]
    for (const ip of exceptions) {
      expect([ip, adresseInterdite(ip)]).toEqual([ip, false])
    }

    const voisinesNonAutorisees = [
      '2001::1',
      '2001:1::',
      '2001:1::4',
      '2001:2::1',
      '2001:4::1',
      '2001:4:111::1',
      '2001:4:113::1',
      '2001:1f::1',
      '2001:40::1',
      '2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff',
    ]
    for (const ip of voisinesNonAutorisees) {
      expect([ip, adresseInterdite(ip)]).toEqual([ip, true])
    }

    // Frontière supérieure du /23 : le /23 alloué qui suit est admis.
    expect(adresseInterdite('2001:200::1')).toBe(false)
  })

  it('A9 — IPv4-mapped et entrées malformées : refus fermé cohérent', () => {
    for (const ip of [
      '::ffff:127.0.0.1',
      '::ffff:169.254.169.254',
      '::ffff:7f00:1',
      '::ffff:a00:1',
      '::ffff:999.1.1.1',
      'not-an-ip',
      '192.168.1',
      '256.1.1.1',
      '2001:::1',
      '',
    ]) {
      expect([ip, adresseInterdite(ip)]).toEqual([ip, true])
    }

    for (const ip of ['::ffff:8.8.8.8', '::ffff:808:808']) {
      expect([ip, adresseInterdite(ip)]).toEqual([ip, false])
    }
  })
})

// ── B. Validation : allowlist ────────────────────────────────────────────────

describe('SSRF — validation de l\'URL', () => {
  const refuser = async (url: unknown) => {
    await expect(
      validerUrlStockage(url, { bucket: BUCKET, resolveur: resolveurPublic })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
  }

  it('B1 — URL légitime du bucket public : acceptée', async () => {
    const ok = await validerUrlStockage(LEGITIME, {
      bucket: BUCKET,
      resolveur: resolveurPublic,
    })
    expect(ok).toBe(LEGITIME)
  })

  it('B2 — hôte non autorisé : refusé, même en https et avec un port standard', async () => {
    await refuser('https://evil.test/storage/v1/object/public/tickets/ia-ocr/a.jpg')
    await refuser('https://localhost/storage/v1/object/public/tickets/ia-ocr/a.jpg')
    await refuser('https://127.0.0.1/storage/v1/object/public/tickets/ia-ocr/a.jpg')
    await refuser('https://[::1]/storage/v1/object/public/tickets/ia-ocr/a.jpg')
    await refuser('https://169.254.169.254/latest/meta-data/')
  })

  it('B3 — suffixe piégé sur l\'hôte autorisé (allowlist par ORIGINE, pas par chaîne)', async () => {
    // « stockage.test.evil.test » ne se normalise PAS vers « stockage.test ».
    await refuser(
      `https://stockage.test.evil.test/storage/v1/object/public/${BUCKET}/ia-ocr/a.jpg`
    )
    // Et le préfixe de sous-domaine non plus.
    await refuser(
      `https://stockage.test@evil.test/storage/v1/object/public/${BUCKET}/ia-ocr/a.jpg`
    )
  })

  it('B4 — schémas non HTTP(S) : refusés', async () => {
    for (const url of [
      'http://stockage.test/storage/v1/object/public/tickets/ia-ocr/a.jpg',
      'file:///etc/passwd',
      'ftp://stockage.test/x.jpg',
      'gopher://stockage.test/x.jpg',
      'data:image/png;base64,iVBORw0KGgo=',
      'javascript:alert(1)',
    ]) {
      await refuser(url)
    }
  })

  it('B5 — URL relatives / protocol-relative : refusées (aucune base de résolution implicite)', async () => {
    await refuser('//stockage.test/storage/v1/object/public/tickets/ia-ocr/a.jpg')
    await refuser('/storage/v1/object/public/tickets/ia-ocr/a.jpg')
    await refuser('stockage.test/x.jpg')
  })

  it('B6 — identifiants dans l\'URL et port non standard : refusés', async () => {
    await refuser(
      `https://user:mdp@stockage.test/storage/v1/object/public/${BUCKET}/ia-ocr/a.jpg`
    )
    await refuser(
      `https://stockage.test:8443/storage/v1/object/public/${BUCKET}/ia-ocr/a.jpg`
    )
  })

  it('B7 — hôte malformé : refusé sans lever d\'exception inattendue', async () => {
    for (const url of [
      'https://',
      'ht!tps://stockage.test/x',
      'https://stockage.test:notaport/x',
      'https://[fe80::1%eth0]/x',
    ]) {
      await refuser(url)
    }
  })

  it('B8 — API Supabase hors bucket public : refusée (même sur l\'hôte autorisé)', async () => {
    await refuser(`${ORIGINE}/rest/v1/chantiers`)
    await refuser(`${ORIGINE}/auth/v1/admin/users`)
    await refuser(`${ORIGINE}/`)
    await refuser(`${ORIGINE}/storage/v1/object/public/autres-buckets/x.jpg`)
    await refuser(`${ORIGINE}/storage/v1/object/public/${BUCKET}/`) // vide
    await refuser(`${ORIGINE}/storage/v1/object/public/${BUCKET}Ia-ocr/a.jpg`) // casse
  })

  it('B9 — hôte autorisé MAIS résolution vers une adresse interne : refusé', async () => {
    for (const ip of ['127.0.0.1', '169.254.169.254', '10.1.2.3', '::1']) {
      await expect(
        validerUrlStockage(LEGITIME, {
          bucket: BUCKET,
          resolveur: async () => [ip],
        })
      ).rejects.toBeInstanceOf(UrlStockageRefusee)
    }
  })

  it('B10 — plusieurs adresses, dont une interne : refus (on n\'accepte pas le « pire cas favorable »)', async () => {
    await expect(
      validerUrlStockage(LEGITIME, {
        bucket: BUCKET,
        resolveur: async () => [IP_PUBLIQUE, '127.0.0.1'],
      })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
  })

  it('B11 — hôte non résolvable : refusé (fail-closed, pas de « on laisse passer »)', async () => {
    await expect(
      validerUrlStockage(LEGITIME, {
        bucket: BUCKET,
        resolveur: async () => {
          throw new Error('NXDOMAIN')
        },
      })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
    await expect(
      validerUrlStockage(LEGITIME, { bucket: BUCKET, resolveur: async () => [] })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
  })

  it('B12 — absence d\'URL ou type non-chaîne : refusée', async () => {
    await refuser(undefined)
    await refuser(null)
    await refuser('')
    await refuser('   ')
    await refuser(42)
    await refuser({ href: LEGITIME })
  })

  it('B13 — fail-closed quand l\'origine attendue n\'est pas configurée', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    // Aucune URL ne peut être jugée légitime : tout est refusé, y compris
    // « la bonne » — c'est bien le comportement attendu d'un garde-fou.
    await expect(
      validerUrlStockage(LEGITIME, { bucket: BUCKET, resolveur: resolveurPublic })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)

    // Une configuration corrompue aussi.
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'pas-une-url'
    await expect(
      validerUrlStockage(LEGITIME, { bucket: BUCKET, resolveur: resolveurPublic })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
  })

  // ── Gardes REDONDANTS, isolés ─────────────────────────────────────────────
  // Le contrôle de schéma et le refus d'IP littérale sont, aujourd'hui,
  // redondants : l'égalité d'origine les couvre déjà (une origine `http` ne
  // peut pas égaler une allowlist `https`, et le parseur d'URL normalise les
  // écritures obscurcies `0177.0.0.1` / `2130706433` / `0x7f000001`).
  // Le mutation testing le prouve : les supprimer ne casse aucun test.
  //
  // On les garde délibérément : ce sont des garde-fous INDÉPENDANTS, et c'est
  // exactement le genre de redondance qui doit rester testée — si l'allowlist
  // est affaiblie un jour (hôte dérivé de l'entrée, wildcard…), ces deux gardes
  // doivent encore tenir. Les tests suivants les ISOLENT en changeant
  // l'allowlist, sinon ils seraient morts-nés.

  it('B14 — garde de schéma, isolé : une allowlist http n\'ouvre PAS la porte à http', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://stockage.test'
    // L'origine correspondrait ; seul le contrôle de schéma peut refuser.
    await expect(
      validerUrlStockage(
        `http://stockage.test/storage/v1/object/public/${BUCKET}/ia-ocr/a.jpg`,
        { bucket: BUCKET, resolveur: resolveurPublic }
      )
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
  })

  it('B15 — garde d\'IP littérale, isolé : une allowlist sur IP est refusée', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://8.8.8.8'
    // L'origine correspondrait, le préfixe aussi, l'adresse est publique…
    await expect(
      validerUrlStockage(
        `https://8.8.8.8/storage/v1/object/public/${BUCKET}/ia-ocr/a.jpg`,
        { bucket: BUCKET, resolveur: async () => ['8.8.8.8'] }
      )
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
  })

  it('B16 — écritures d\'IPv4 obscurcies : neutralisées avant nos guards', async () => {
    // Comportement du parseur d'URL, pas un garde de notre code : `new URL`
    // normalise ces formes en `127.0.0.1`, que l'allowlist rejette donc.
    for (const forme of [
      'https://0177.0.0.1/x',
      'https://2130706433/x',
      'https://0x7f000001/x',
    ]) {
      expect(new URL(forme).hostname).toBe('127.0.0.1')
      await refuser(forme)
    }
  })

  it('B17 — validerUrlStockage refuse les nouvelles plages DNS', async () => {
    const interdites = [
      '192.88.99.1',
      '64:ff9b::c000:201',
      '64:ff9b:1::1',
      '100::1',
      '2001::1',
      '2001:2::1',
      '2001:10::1',
      '2001:db8::1',
      '2002::c000:201',
      '3fff::1',
      '5f00::1',
    ]

    for (const ip of interdites) {
      await expect(
        validerUrlStockage(LEGITIME, {
          bucket: BUCKET,
          resolveur: async () => [ip],
        }),
      ).rejects.toBeInstanceOf(UrlStockageRefusee)
    }
  })

  it('B18 — validerUrlStockage accepte les IPv6 publiques et exceptions prévues', async () => {
    const adresses = [
      '2001:4860:4860::8888',
      '2606:4700::1111',
      '2001:1::1',
      '2001:1::2',
      '2001:1::3',
      '2001:3::1',
      '2001:4:112::1',
      '2001:20::1',
      '2001:2f:ffff:ffff:ffff:ffff:ffff:ffff',
      '2001:30::1',
      '2001:3f:ffff:ffff:ffff:ffff:ffff:ffff',
      '2001:200::1',
    ]

    for (const ip of adresses) {
      await expect(
        validerUrlStockage(LEGITIME, {
          bucket: BUCKET,
          resolveur: async () => [ip],
        }),
      ).resolves.toBe(LEGITIME)
    }
  })

  it('B19 — résolution mixte ou malformée : refus fail-closed', async () => {
    for (const adresses of [
      ['8.8.8.8', '2001:4860:4860::8888', '2001:db8::1'],
      ['pas-une-adresse-ip'],
    ]) {
      await expect(
        validerUrlStockage(LEGITIME, {
          bucket: BUCKET,
          resolveur: async () => adresses,
        }),
      ).rejects.toBeInstanceOf(UrlStockageRefusee)
    }
  })
})

// ── C. Téléchargement : redirections et plafonds ─────────────────────────────

describe('SSRF — téléchargement', () => {
  function reponseImage(octets = 12, entetes: Record<string, string> = {}): Response {
    return new Response(Buffer.alloc(octets, 7), {
      status: 200,
      headers: { 'content-type': 'image/jpeg', ...entetes },
    })
  }

  it('C1 — URL légitime : data-URL base64 construite', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reponseImage())
    const { dataUrl, octets } = await telechargerImageStockage(LEGITIME, {
      bucket: BUCKET,
      tailleMax: 1024,
      resolveur: resolveurPublic,
      fetcher: fetchMock as unknown as typeof fetch,
    })
    expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(octets).toBe(12)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // `redirect: "manual"` : c'est la route qui revalide chaque saut.
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' })
  })

  it('C2 — redirection vers une destination interdite : refusée, et l\'interdit n\'est PAS contacté', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      })
    )
    await expect(
      telechargerImageStockage(LEGITIME, {
        bucket: BUCKET,
        tailleMax: 1024,
        resolveur: resolveurPublic,
        fetcher: fetchMock as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
    // Un seul appel : le premier. La destination interdite n'a jamais été atteinte.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('C3 — redirection vers un AUTRE hôte sur l\'hôte autorisé : refusée', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 301,
        headers: { location: 'https://evil.test/storage/v1/object/public/tickets/ia-ocr/a.jpg' },
      })
    )
    await expect(
      telechargerImageStockage(LEGITIME, {
        bucket: BUCKET,
        tailleMax: 1024,
        resolveur: resolveurPublic,
        fetcher: fetchMock as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('C4 — redirection LÉGITIME : suivie et revalidée', async () => {
    const cible = `${ORIGINE}/storage/v1/object/public/${BUCKET}/ia-ocr/final.jpg`
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 307, headers: { location: cible } })
      )
      .mockResolvedValueOnce(reponseImage())
    const { dataUrl } = await telechargerImageStockage(LEGITIME, {
      bucket: BUCKET,
      tailleMax: 1024,
      resolveur: resolveurPublic,
      fetcher: fetchMock as unknown as typeof fetch,
    })
    expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(cible)
  })

  it('C5 — boucle de redirections : plafonnée', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: LEGITIME } })
    )
    await expect(
      telechargerImageStockage(LEGITIME, {
        bucket: BUCKET,
        tailleMax: 1024,
        resolveur: resolveurPublic,
        fetcher: fetchMock as unknown as typeof fetch,
        sautsMax: 2,
      })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4)
  })

  it('C6 — redirection sans en-tête Location : refusée', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302 }))
    await expect(
      telechargerImageStockage(LEGITIME, {
        bucket: BUCKET,
        tailleMax: 1024,
        resolveur: resolveurPublic,
        fetcher: fetchMock as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
  })

  it('C7 — taille dépassée : refusée par l\'en-tête ET à la lecture', async () => {
    // (a) en-tête content-length menteur
    const parEntete = vi.fn(async () =>
      reponseImage(12, { 'content-length': String(10 * 1024 * 1024) })
    )
    await expect(
      telechargerImageStockage(LEGITIME, {
        bucket: BUCKET,
        tailleMax: 1024,
        resolveur: resolveurPublic,
        fetcher: parEntete as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
    expect(parEntete).toHaveBeenCalledTimes(1)

    // (b) en-tête absent ou faux : le plafond doit s'appliquer À LA LECTURE
    const parLecture = vi.fn(async () => reponseImage(4096))
    await expect(
      telechargerImageStockage(LEGITIME, {
        bucket: BUCKET,
        tailleMax: 1024,
        resolveur: resolveurPublic,
        fetcher: parLecture as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
  })

  it('C8 — contenu non image : refusé (le flux ne part pas vers Gemini)', async () => {
    const fetchMock = vi.fn(async () =>
      reponseImage(12, { 'content-type': 'application/json' })
    )
    await expect(
      telechargerImageStockage(LEGITIME, {
        bucket: BUCKET,
        tailleMax: 1024,
        resolveur: resolveurPublic,
        fetcher: fetchMock as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
  })

  it('C9 — corps vide ou statut d\'erreur : refusés', async () => {
    const vide = vi.fn(async () => reponseImage(0))
    await expect(
      telechargerImageStockage(LEGITIME, {
        bucket: BUCKET,
        tailleMax: 1024,
        resolveur: resolveurPublic,
        fetcher: vide as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)

    const erreur = vi.fn(async () => new Response(null, { status: 404 }))
    await expect(
      telechargerImageStockage(LEGITIME, {
        bucket: BUCKET,
        tailleMax: 1024,
        resolveur: resolveurPublic,
        fetcher: erreur as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
  })

  it('C10 — destination DNS interdite ou malformée : aucun fetch initial', async () => {
    const interdits = [
      '192.88.99.1',
      '64:ff9b::c000:201',
      '64:ff9b:1::1',
      '100::1',
      '2001::1',
      '2001:2::1',
      '2001:10::1',
      '2001:db8::1',
      '2002::c000:201',
      '3fff::1',
      '5f00::1',
      'pas-une-adresse-ip',
    ]
    const fetchMock = vi.fn(async () => reponseImage())

    for (const ip of interdits) {
      await expect(
        telechargerImageStockage(LEGITIME, {
          bucket: BUCKET,
          tailleMax: 1024,
          resolveur: async () => [ip],
          fetcher: fetchMock as unknown as typeof fetch,
        }),
      ).rejects.toBeInstanceOf(UrlStockageRefusee)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('C11 — redirection DNS interdite : refusée avant le second fetch', async () => {
    let appelsDns = 0
    const cible = `${ORIGINE}/storage/v1/object/public/${BUCKET}/ia-ocr/cible.jpg`
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: cible },
      }),
    )

    await expect(
      telechargerImageStockage(LEGITIME, {
        bucket: BUCKET,
        tailleMax: 1024,
        resolveur: async () => {
          appelsDns++
          return appelsDns === 1 ? ['8.8.8.8'] : ['2002::c000:201']
        },
        fetcher: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(UrlStockageRefusee)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ── D. La ROUTE refuse-t-elle avant tout accès réseau ? ──────────────────────

describe('SSRF — la route /api/ia-ocr-ticket', () => {
  let fetchGlobal: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINE
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'cle-test'
    spies.upload.mockReset().mockResolvedValue({ error: null })
    spies.getPublicUrl
      .mockReset()
      .mockReturnValue({ data: { publicUrl: LEGITIME } })
    spies.generateText.mockReset().mockResolvedValue({
      text: JSON.stringify({ montant_ttc: 10, tva: 0, categorie: 'materiaux' }),
    })
    fetchGlobal = vi.fn(async () => new Response(Buffer.alloc(8, 1), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }))
    vi.stubGlobal('fetch', fetchGlobal)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function postJson(imageUrl: unknown) {
    const { POST } = await import('@/app/api/ia-ocr-ticket/route')
    const { NextRequest } = await import('next/server')
    const res = await POST(
      new NextRequest('http://localhost/api/ia-ocr-ticket', {
        method: 'POST',
        body: JSON.stringify({ image_url: imageUrl }),
        headers: { 'content-type': 'application/json' },
      })
    )
    return { statut: res.status, corps: (await res.json()) as Record<string, unknown> }
  }

  async function postMultipart(imageUrl: unknown) {
    const { POST } = await import('@/app/api/ia-ocr-ticket/route')
    const { NextRequest } = await import('next/server')
    const fd = new FormData()
    fd.append('image_url', String(imageUrl))
    const res = await POST(
      new NextRequest('http://localhost/api/ia-ocr-ticket', {
        method: 'POST',
        body: fd,
      })
    )
    return { statut: res.status, corps: (await res.json()) as Record<string, unknown> }
  }

  it('D1 — SOURCE JSON : metadata endpoint : refusée SANS appel réseau', async () => {
    const { statut, corps } = await postJson('http://169.254.169.254/latest/meta-data/')
    expect(statut).toBe(400)
    expect(String(corps.error)).toMatch(/refus/i)
    expect(fetchGlobal).not.toHaveBeenCalled()
    expect(spies.generateText).not.toHaveBeenCalled()
  })

  it('D2 — SOURCE JSON : loopback et IPv6 locale : refusés sans appel réseau', async () => {
    for (const url of [
      'https://127.0.0.1:9000/storage/v1/object/public/tickets/a.jpg',
      'http://localhost/admin',
      'https://[::1]:8080/x.jpg',
    ]) {
      const { statut } = await postJson(url)
      expect(statut).toBe(400)
    }
    expect(fetchGlobal).not.toHaveBeenCalled()
  })

  it('D3 — SOURCE MULTIPART : mêmes refus, sans appel réseau', async () => {
    const { statut } = await postMultipart('http://169.254.169.254/latest/meta-data/')
    expect(statut).toBe(400)
    expect(fetchGlobal).not.toHaveBeenCalled()
    expect(spies.generateText).not.toHaveBeenCalled()
  })

  it('D4 — URL légitime du bucket : le flux OCR aboutit', async () => {
    const { statut, corps } = await postJson(LEGITIME)
    expect(statut).toBe(200)
    expect(fetchGlobal).toHaveBeenCalledTimes(1)
    expect(spies.generateText).toHaveBeenCalledTimes(1)
    expect(corps.image_url).toBe(LEGITIME)
  })

  it('D5 — upload de fichier : l\'URL émise par le serveur passe le même validateur', async () => {
    const { POST } = await import('@/app/api/ia-ocr-ticket/route')
    const { NextRequest } = await import('next/server')
    const fd = new FormData()
    fd.append('file', new File([Buffer.alloc(8, 3)], 'ticket.png', { type: 'image/png' }))
    const res = await POST(
      new NextRequest('http://localhost/api/ia-ocr-ticket', { method: 'POST', body: fd })
    )
    expect(res.status).toBe(200)
    expect(spies.getPublicUrl).toHaveBeenCalledTimes(1)
    expect(fetchGlobal).toHaveBeenCalledTimes(1)
  })

  it('D6 — absence d\'URL : 400, sans appel réseau', async () => {
    const { statut } = await postJson(undefined)
    expect(statut).toBe(400)
    expect(fetchGlobal).not.toHaveBeenCalled()
  })

  it('D7 — la route ne conserve plus de fetch() nu sur une URL client', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/ia-ocr-ticket/route.ts'),
      'utf8'
    )
    const execute = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l))
      .join('\n')
    // Le seul `fetch(` toléré est celui du validateur, qui reçoit une URL
    // normalisée et `redirect: "manual"`.
    const fetches = execute.match(/fetch\(/g) ?? []
    expect(fetches).toEqual([])
    expect(execute).toContain('telechargerImageStockage')
    expect(execute).toContain('validerUrlStockage')
  })
})
