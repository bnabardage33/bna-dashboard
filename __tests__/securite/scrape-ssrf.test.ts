/**
 * __tests__/securite/scrape-ssrf.test.ts
 *
 * Suite de tests de sécurité SSRF pour lib/validationUrlScrape.ts
 * Utilise l'injection de dépendances (resolveur, fetcher) pour isoler
 * complètement les tests (aucune requête réseau externe réelle).
 */

import { describe, it, expect, vi } from 'vitest';
import { scrapeUrlSecurisee, UrlScrapeRefusee } from '@/lib/validationUrlScrape';

// ── Helpers & Mocks ──────────────────────────────────────────────────────────

/** Fetcher qui retourne une réponse HTML valide minimale. */
function htmlFetcher(html = '<html><head><title>Test</title></head><body>OK</body></html>') {
  return async () =>
    new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
}

/** Résolveur DNS mock retournant une adresse IP publique légitime. */
const publicResolver = async (_: string) => ['93.184.216.34']; // example.com (public)

/** Résolveur DNS mock retournant une IP privée RFC1918. */
const privateResolver = async (_: string) => ['192.168.1.1'];

/** Résolveur DNS mock retournant le loopback 127.0.0.1. */
const loopbackResolver = async (_: string) => ['127.0.0.1'];

/** Résolveur DNS mock retournant l'adresse de métadonnées cloud (IMDS AWS/GCP). */
const metadataResolver = async (_: string) => ['169.254.169.254'];

/** Résolveur DNS mock simulant une erreur de résolution (NXDOMAIN). */
const failResolver = async (_: string): Promise<string[]> => {
  throw new Error('getaddrinfo ENOTFOUND host.invalid');
};

// ── Groupe A : URLs publiques valides ────────────────────────────────────────

describe('A — URLs publiques valides', () => {
  it('accepte une URL https:// publique valide', async () => {
    const html = await scrapeUrlSecurisee('https://example.com/produit', {
      resolveur: publicResolver,
      fetcher: htmlFetcher() as typeof fetch,
    });
    expect(html).toContain('<title>Test</title>');
  });

  it('accepte une URL http:// publique valide', async () => {
    const html = await scrapeUrlSecurisee('http://example.com/produit', {
      resolveur: publicResolver,
      fetcher: htmlFetcher() as typeof fetch,
    });
    expect(html).toContain('<title>Test</title>');
  });

  it('accepte une URL https:// avec port explicite 443', async () => {
    await expect(
      scrapeUrlSecurisee('https://example.com:443/produit', {
        resolveur: publicResolver,
        fetcher: htmlFetcher() as typeof fetch,
      }),
    ).resolves.toBeDefined();
  });

  it('accepte une URL http:// avec port explicite 80', async () => {
    await expect(
      scrapeUrlSecurisee('http://example.com:80/produit', {
        resolveur: publicResolver,
        fetcher: htmlFetcher() as typeof fetch,
      }),
    ).resolves.toBeDefined();
  });

  it('accepte les IPv6 publiques usuelles et exceptions 2001::/23', async () => {
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
    ];

    for (const ip of adresses) {
      const fetcher = vi.fn(htmlFetcher());
      const html = await scrapeUrlSecurisee('https://example.com/produit', {
        resolveur: async () => [ip],
        fetcher: fetcher as typeof fetch,
      });
      expect(html).toContain('<title>Test</title>');
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});

// ── Groupe B : Schémas et formats invalides ──────────────────────────────────

describe('B — Schémas et formats invalides', () => {
  it('refuse le protocole ftp://', async () => {
    await expect(
      scrapeUrlSecurisee('ftp://example.com/fichier', { resolveur: publicResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse le protocole file://', async () => {
    await expect(
      scrapeUrlSecurisee('file:///etc/passwd', { resolveur: publicResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse le protocole javascript:', async () => {
    await expect(
      scrapeUrlSecurisee('javascript:alert(1)', { resolveur: publicResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse une chaîne vide', async () => {
    await expect(scrapeUrlSecurisee('')).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse un paramètre non chaîne (ex: null ou undefined)', async () => {
    await expect(scrapeUrlSecurisee(undefined)).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse une URL relative', async () => {
    await expect(
      scrapeUrlSecurisee('/api/donnees-internes', { resolveur: publicResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse une URL protocol-relative //evil.test/', async () => {
    await expect(
      scrapeUrlSecurisee('//evil.test/x', { resolveur: publicResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });
});

// ── Groupe C : IP littérales et ports non standard ───────────────────────────

describe('C — IP littérales et ports non autorisés', () => {
  it('refuse une IPv4 littérale dans le nom d hôte', async () => {
    await expect(
      scrapeUrlSecurisee('https://8.8.8.8/x', { resolveur: publicResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse une IPv6 littérale dans le nom d hôte [::1]', async () => {
    await expect(
      scrapeUrlSecurisee('http://[::1]/x', { resolveur: publicResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse le port 8080 sur http', async () => {
    await expect(
      scrapeUrlSecurisee('http://example.com:8080/x', { resolveur: publicResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse le port 8443 sur https', async () => {
    await expect(
      scrapeUrlSecurisee('https://example.com:8443/x', { resolveur: publicResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse le port sensible 22 (SSH)', async () => {
    await expect(
      scrapeUrlSecurisee('http://example.com:22/', { resolveur: publicResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });
});

// ── Groupe D : DNS résolvant vers des adresses interdites ────────────────────

describe('D — Résolutions DNS vers adresses interdites', () => {
  it('refuse une résolution DNS vers 192.168.1.1 (RFC1918)', async () => {
    await expect(
      scrapeUrlSecurisee('https://routeur.local/', { resolveur: privateResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse une résolution DNS vers 127.0.0.1 (loopback)', async () => {
    await expect(
      scrapeUrlSecurisee('https://localhost.test/', { resolveur: loopbackResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse une résolution DNS vers 169.254.169.254 (IMDS Cloud)', async () => {
    await expect(
      scrapeUrlSecurisee('https://instance-data.test/', { resolveur: metadataResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse une résolution DNS vers 10.0.0.1 (réseau privé A)', async () => {
    await expect(
      scrapeUrlSecurisee('https://corp.test/', {
        resolveur: async () => ['10.0.0.1'],
      }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse les nouvelles plages sans appeler le fetcher', async () => {
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
    ];

    for (const ip of interdites) {
      const fetcher = vi.fn(htmlFetcher());
      await expect(
        scrapeUrlSecurisee('https://destination.example/', {
          resolveur: async () => [ip],
          fetcher: fetcher as typeof fetch,
        }),
      ).rejects.toThrow(UrlScrapeRefusee);
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it('refuse une IPv4 mappée en IPv6 (::ffff:127.0.0.1)', async () => {
    await expect(
      scrapeUrlSecurisee('https://v6-loop.test/', {
        resolveur: async () => ['::ffff:127.0.0.1'],
      }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });
});

// ── Groupe E : Multi-adresses DNS mixtes ─────────────────────────────────────

describe('E — Multi-adresses DNS mixtes (Fail-Closed)', () => {
  it('refuse si au moins une des IP résolues est privée', async () => {
    await expect(
      scrapeUrlSecurisee('https://mixte.example.com/', {
        resolveur: async () => ['93.184.216.34', '10.0.0.2'],
      }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse une réponse mixte si une IPv6 est interdite, avant fetch', async () => {
    const fetcher = vi.fn(htmlFetcher());
    await expect(
      scrapeUrlSecurisee('https://mixte.example.com/', {
        resolveur: async () => [
          '93.184.216.34',
          '2001:4860:4860::8888',
          '2001:db8::1',
        ],
        fetcher: fetcher as typeof fetch,
      }),
    ).rejects.toThrow(UrlScrapeRefusee);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

// ── Groupe F : Échec de résolution DNS ───────────────────────────────────────

describe('F — Échecs DNS', () => {
  it('renvoie un statut 502 si la résolution DNS échoue (NXDOMAIN)', async () => {
    const err = await scrapeUrlSecurisee('https://inexistant.invalid/', {
      resolveur: failResolver,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(UrlScrapeRefusee);
    expect((err as UrlScrapeRefusee).statut).toBe(502);
  });

  it('renvoie un statut 502 si le DNS retourne un tableau vide', async () => {
    const err = await scrapeUrlSecurisee('https://vide.example.com/', {
      resolveur: async () => [],
    }).catch((e) => e);
    expect(err).toBeInstanceOf(UrlScrapeRefusee);
    expect((err as UrlScrapeRefusee).statut).toBe(502);
  });

  it('refuse une adresse malformée renvoyée par le DNS sans appeler le fetcher', async () => {
    let fetchAppele = false;
    const fetcher = async () => {
      fetchAppele = true;
      return new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    };

    const err = await scrapeUrlSecurisee('https://malforme.example.com/', {
      resolveur: async () => ['pas-une-adresse-ip'],
      fetcher: fetcher as typeof fetch,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(UrlScrapeRefusee);
    expect((err as UrlScrapeRefusee).statut).toBe(400);
    expect(fetchAppele).toBe(false);
  });
});

// ── Groupe G : Redirections HTTP ─────────────────────────────────────────────

describe('G — Redirections HTTP', () => {
  it('suit avec succès une redirection valide vers une destination publique', async () => {
    let appels = 0;
    const fetcher = async () => {
      appels++;
      if (appels === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/page-finale' },
        });
      }
      return new Response('<html><body>Redirection OK</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    };

    const html = await scrapeUrlSecurisee('https://example.com/depart', {
      resolveur: publicResolver,
      fetcher: fetcher as typeof fetch,
    });

    expect(html).toContain('Redirection OK');
    expect(appels).toBe(2);
  });

  it('bloque une redirection menant vers une adresse IP privée', async () => {
    const fetcher = async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://prive.local/secret' },
      });

    await expect(
      scrapeUrlSecurisee('https://example.com/piege', {
        resolveur: async (hote) =>
          hote === 'prive.local' ? ['192.168.1.1'] : ['93.184.216.34'],
        fetcher: fetcher as typeof fetch,
      }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('interrompt une boucle infinie de redirections après 5 sauts avec statut 502', async () => {
    const fetcher = async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://example.com/boucle' },
      });

    const err = await scrapeUrlSecurisee('https://example.com/boucle', {
      resolveur: publicResolver,
      fetcher: fetcher as typeof fetch,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(UrlScrapeRefusee);
    expect((err as UrlScrapeRefusee).statut).toBe(502);
  });

  it('refuse une redirection 301 sans en-tête Location avec statut 502', async () => {
    const fetcher = async () => new Response(null, { status: 301 });
    const err = await scrapeUrlSecurisee('https://example.com/sans-location', {
      resolveur: publicResolver,
      fetcher: fetcher as typeof fetch,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(UrlScrapeRefusee);
    expect((err as UrlScrapeRefusee).statut).toBe(502);
  });
});

// ── Groupe H : Délai et annulation ───────────────────────────────────────────

describe('H — Transmission du signal AbortController', () => {
  it('transmet bien le signal d annulation au fetcher', async () => {
    let signalRecu = false;
    const fetcher = async (_url: unknown, init?: RequestInit) => {
      if (init?.signal) signalRecu = true;
      return new Response('<html><body>OK</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    };

    await scrapeUrlSecurisee('https://example.com/', {
      resolveur: publicResolver,
      fetcher: fetcher as typeof fetch,
    });

    expect(signalRecu).toBe(true);
  });
});

// ── Groupe I : Plafond de taille et annulation de flux ───────────────────────

describe('I — Limites de taille et annulation du flux', () => {
  it('refuse avant lecture si Content-Length > 5 Mo (statut 413)', async () => {
    const fetcher = async () =>
      new Response('<html>Trop gros</html>', {
        status: 200,
        headers: {
          'content-type': 'text/html',
          'content-length': String(5 * 1024 * 1024 + 1),
        },
      });

    const err = await scrapeUrlSecurisee('https://example.com/gros', {
      resolveur: publicResolver,
      fetcher: fetcher as typeof fetch,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(UrlScrapeRefusee);
    expect((err as UrlScrapeRefusee).statut).toBe(413);
  });

  it('accepte si Content-Length est exactement 5 Mo', async () => {
    const corpsCourt = '<html>exact</html>';
    const fetcher = async () =>
      new Response(corpsCourt, {
        status: 200,
        headers: {
          'content-type': 'text/html',
          'content-length': String(5 * 1024 * 1024),
        },
      });

    const res = await scrapeUrlSecurisee('https://example.com/exact', {
      resolveur: publicResolver,
      fetcher: fetcher as typeof fetch,
    });
    expect(res).toBe(corpsCourt);
  });

  it('interrompt et annule le flux ReadableStream sans Content-Length lorsque 5 Mo est dépassé', async () => {
    let fluxAnnule = false;
    let morceauxEnvoyes = 0;

    // ReadableStream personnalisé produisant des blocs de 2 Mo chacun
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        morceauxEnvoyes++;
        if (morceauxEnvoyes <= 5) {
          controller.enqueue(new Uint8Array(2 * 1024 * 1024)); // 2 Mo
        } else {
          controller.close();
        }
      },
      cancel() {
        fluxAnnule = true;
      },
    });

    const fetcher = async () =>
      new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'text/html',
          // Aucun en-tête Content-Length fourni (chunked / stream)
        },
      });

    const err = await scrapeUrlSecurisee('https://example.com/flux-infini', {
      resolveur: publicResolver,
      fetcher: fetcher as typeof fetch,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(UrlScrapeRefusee);
    expect((err as UrlScrapeRefusee).statut).toBe(413);
    expect(fluxAnnule).toBe(true);
    // Le flux doit être interrompu dès le 3e morceau (6 Mo > 5 Mo), sans lire les 10 Mo
    expect(morceauxEnvoyes).toBeLessThanOrEqual(4);
  });
});

// ── Groupe J : Validation Content-Type ───────────────────────────────────────

describe('J — Validation du type MIME Content-Type', () => {
  it('accepte text/html avec paramètre de charset', async () => {
    const fetcher = async () =>
      new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });

    await expect(
      scrapeUrlSecurisee('https://example.com/', {
        resolveur: publicResolver,
        fetcher: fetcher as typeof fetch,
      }),
    ).resolves.toBeDefined();
  });

  it('accepte application/xhtml+xml', async () => {
    const fetcher = async () =>
      new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'application/xhtml+xml' },
      });

    await expect(
      scrapeUrlSecurisee('https://example.com/', {
        resolveur: publicResolver,
        fetcher: fetcher as typeof fetch,
      }),
    ).resolves.toBeDefined();
  });

  it('refuse application/json', async () => {
    const fetcher = async () =>
      new Response('{"data": 1}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    await expect(
      scrapeUrlSecurisee('https://example.com/api', {
        resolveur: publicResolver,
        fetcher: fetcher as typeof fetch,
      }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse application/pdf', async () => {
    const fetcher = async () =>
      new Response('%PDF-1.4', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      });

    await expect(
      scrapeUrlSecurisee('https://example.com/doc.pdf', {
        resolveur: publicResolver,
        fetcher: fetcher as typeof fetch,
      }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse une image binaire (image/png)', async () => {
    const fetcher = async () =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });

    await expect(
      scrapeUrlSecurisee('https://example.com/photo.png', {
        resolveur: publicResolver,
        fetcher: fetcher as typeof fetch,
      }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('bloque une redirection vers un préfixe spécial avant le second fetch', async () => {
    let appelsDns = 0;
    const fetcher = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://destination.example/fin' },
      }),
    );

    await expect(
      scrapeUrlSecurisee('https://example.com/depart', {
        resolveur: async () => {
          appelsDns++;
          return appelsDns === 1 ? ['93.184.216.34'] : ['2002::c000:201'];
        },
        fetcher: fetcher as typeof fetch,
      }),
    ).rejects.toThrow(UrlScrapeRefusee);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

// ── Groupe K : Erreurs HTTP distantes ────────────────────────────────────────

describe('K — Erreurs HTTP du serveur distant', () => {
  it('propage le statut 404 du serveur distant', async () => {
    const fetcher = async () => new Response('Page introuvable', { status: 404 });
    const err = await scrapeUrlSecurisee('https://example.com/introuvable', {
      resolveur: publicResolver,
      fetcher: fetcher as typeof fetch,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(UrlScrapeRefusee);
    expect((err as UrlScrapeRefusee).statut).toBe(404);
  });

  it('convertit une erreur 500 distante en statut 502 Bad Gateway', async () => {
    const fetcher = async () => new Response('Erreur interne distante', { status: 500 });
    const err = await scrapeUrlSecurisee('https://example.com/panne', {
      resolveur: publicResolver,
      fetcher: fetcher as typeof fetch,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(UrlScrapeRefusee);
    expect((err as UrlScrapeRefusee).statut).toBe(502);
  });

  it('annule le corps d’une réponse HTTP en erreur', async () => {
    let corpsAnnule = false;
    const corps = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('Erreur distante'));
      },
      cancel() {
        corpsAnnule = true;
      },
    });
    const fetcher = async () => new Response(corps, { status: 500 });

    const err = await scrapeUrlSecurisee('https://example.com/erreur-corps', {
      resolveur: publicResolver,
      fetcher: fetcher as typeof fetch,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(UrlScrapeRefusee);
    expect((err as UrlScrapeRefusee).statut).toBe(502);
    expect(corpsAnnule).toBe(true);
  });
});

// ── Groupe L : Identifiants dans l'URL ───────────────────────────────────────

describe('L — Identifiants d authentification dans l URL', () => {
  it('refuse une URL avec user et password', async () => {
    await expect(
      scrapeUrlSecurisee('https://user:pass@example.com/', { resolveur: publicResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });

  it('refuse une URL avec user seul', async () => {
    await expect(
      scrapeUrlSecurisee('https://admin@example.com/', { resolveur: publicResolver }),
    ).rejects.toThrow(UrlScrapeRefusee);
  });
});

// ── Groupe M : Limite DNS Rebinding ──────────────────────────────────────────

describe('M — Limite assumée du DNS Rebinding', () => {
  it('documente que le fetcher reçoit un hostname et peut subir un rebinding TCP post-validation', async () => {
    let resolutionValidee = false;
    const resolveur = async (_: string) => {
      resolutionValidee = true;
      return ['93.184.216.34']; // Adresse publique valide lors du contrôle
    };

    const fetcher = async () =>
      new Response('<html><body>OK</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });

    await scrapeUrlSecurisee('https://potentiel-rebind.example.com/', {
      resolveur,
      fetcher: fetcher as typeof fetch,
    });

    expect(resolutionValidee).toBe(true);
  });

  it('renvoie 504 lorsque le fetch dépasse le délai maximal', async () => {
    vi.useFakeTimers();

    try {
      const fetcher = async (_url: unknown, init?: RequestInit) => {
        const signal = init?.signal;

        if (!signal) {
          throw new Error('Signal AbortController absent');
        }

        return await new Promise<Response>((_resolve, reject) => {
          const rejeter = () =>
            reject(new DOMException('Requête annulée', 'AbortError'));

          if (signal.aborted) {
            rejeter();
            return;
          }

          signal.addEventListener('abort', rejeter, { once: true });
        });
      };

      const resultat = scrapeUrlSecurisee('https://example.com/', {
        resolveur: publicResolver,
        fetcher: fetcher as typeof fetch,
      }).then(
        () => null,
        (error: unknown) => error,
      );

      await vi.advanceTimersByTimeAsync(10_000);

      const erreur = await resultat;

      expect(erreur).toBeInstanceOf(UrlScrapeRefusee);
      expect((erreur as UrlScrapeRefusee).statut).toBe(504);
    } finally {
      vi.useRealTimers();
    }
  });




});
