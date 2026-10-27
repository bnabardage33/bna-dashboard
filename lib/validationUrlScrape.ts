// lib/validationUrlScrape.ts
//
// Anti-SSRF pour /api/scrape : validation d'une URL publique arbitraire avant
// tout `fetch` côté serveur.
//
// Stratégie : BLOCKLIST (pas allowlist). La route doit contacter des URLs
// e-commerce publiques quelconques — une allowlist d'origines serait inapplicable.
// On bloque à la place toutes les destinations non routables, privées, loopback,
// link-local, métadonnées (cloud IMDS) et multicast.
//
// Fonctions réutilisées depuis lib/urlStockageAutorisee.ts (sans modification) :
//   - estIpLitterale(adresse)     — détecte IPv4/IPv6 littérales dans hostname
//   - adresseInterdite(adresse)   — blocklist plages RFC1918, loopback, metadata…
//
// Limite assumée (documentée honnêtement) :
// Le contrôle porte sur l'adresse IP résolue AU MOMENT de la validation.
// Une re-résolution DNS entre la validation et la connexion TCP (DNS rebinding)
// reste théoriquement possible ; l'API fetch standard de Node.js n'expose pas
// d'option pour figer l'IP de connexion tout en préservant le SNI TLS. Ce risque
// résiduel est assumé pour un usage e-commerce avec session authentifiée.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { estIpLitterale, adresseInterdite } from '@/lib/urlStockageAutorisee';

/** Codes d'erreur stables renvoyés au client par /api/scrape. */
export type CodeErreurScrape =
  | 'URL_INVALIDE'
  | 'HOTE_INTROUVABLE'
  | 'SITE_REFUSE'
  | 'PAGE_INTROUVABLE'
  | 'SITE_INDISPONIBLE'
  | 'DELAI_DEPASSE'
  | 'CONTENU_NON_HTML'
  | 'TROP_VOLUMINEUX'
  | 'REDIRECTION_INVALIDE'
  | 'ERREUR_RESEAU'
  | 'ERREUR_INTERNE';

function codeDepuisStatut(statut: number): CodeErreurScrape {
  if (statut === 403 || statut === 429 || statut === 401) return 'SITE_REFUSE';
  if (statut === 404 || statut === 410) return 'PAGE_INTROUVABLE';
  if (statut === 413) return 'TROP_VOLUMINEUX';
  if (statut === 504) return 'DELAI_DEPASSE';
  if (statut >= 500) return 'SITE_INDISPONIBLE';
  return 'URL_INVALIDE';
}

/** Code pour une réponse HTTP d'erreur renvoyée par le site distant. */
function codeDepuisStatutDistant(statut: number): CodeErreurScrape {
  if (statut === 404 || statut === 410) return 'PAGE_INTROUVABLE';
  if (statut >= 500) return 'SITE_INDISPONIBLE';
  return 'SITE_REFUSE';
}

/**
 * Erreur de validation SSRF ou d'échec de téléchargement.
 * Porte un message générique côté client, un message technique pour les logs serveur,
 * et le statut HTTP approprié.
 */
export class UrlScrapeRefusee extends Error {
  readonly statut: number;
  readonly messageTechnique: string;
  /** Code stable et non sensible, exposé au client. */
  readonly code: CodeErreurScrape;

  constructor(
    messageClient = 'URL non autorisée ou invalide',
    statut = 400,
    messageTechnique?: string,
    code?: CodeErreurScrape,
  ) {
    super(messageClient);
    this.name = 'UrlScrapeRefusee';
    this.statut = statut;
    this.messageTechnique = messageTechnique ?? messageClient;
    this.code = code ?? codeDepuisStatut(statut);
  }
}

/** Schémas autorisés et ports standard associés. */
const PORTS_AUTORISES: Record<string, string[]> = {
  'http:': ['', '80'],
  'https:': ['', '443'],
};

/** Plafond de taille stricte du corps HTML (5 Mo). */
const TAILLE_MAX_OCTETS = 5 * 1024 * 1024;

/** Nombre maximum de redirections autorisées. */
const SAUTS_MAX = 5;

/** Délai d'expiration réseau global (10 s). */
const TIMEOUT_MS = 10_000;

/** Types MIME HTML autorisés. */
const MIME_AUTORISES = ['text/html', 'application/xhtml+xml'];

export interface OptionsScrape {
  /** Résolveur DNS injectable — pour les tests. Défaut : `dns.promises.lookup`. */
  resolveur?: (hote: string) => Promise<string[]>;
  /** `fetch` injectable — pour les tests. */
  fetcher?: typeof fetch;
}

async function resoudreDns(
  hote: string,
  resolveur?: OptionsScrape['resolveur'],
): Promise<string[]> {
  if (resolveur) return resolveur(hote);
  const resultats = await lookup(hote, { all: true });
  return resultats.map((r) => r.address);
}

/**
 * Valide l'URL contre la politique anti-SSRF et renvoie sa forme normalisée.
 * Lève UrlScrapeRefusee (fail-closed) dès qu'un contrôle échoue.
 */
async function validerUrlScrape(
  urlBrute: string,
  resolveur?: OptionsScrape['resolveur'],
): Promise<string> {
  // 1. Parsing strict sans base
  let u: URL;
  try {
    u = new URL(urlBrute.trim());
  } catch {
    throw new UrlScrapeRefusee(
      'URL non autorisée ou invalide',
      400,
      'URL mal formée ou non analysable',
    );
  }

  // 2. Protocole http ou https uniquement
  const portsAutorises = PORTS_AUTORISES[u.protocol];
  if (!portsAutorises) {
    throw new UrlScrapeRefusee(
      'URL non autorisée ou invalide',
      400,
      `Protocole non autorisé : ${u.protocol}`,
    );
  }

  // 3. Rejet des identifiants (user:pass@host)
  if (u.username || u.password) {
    throw new UrlScrapeRefusee(
      'URL non autorisée ou invalide',
      400,
      "Identifiants embarqués dans l'URL refusés",
    );
  }

  // 4. Ports standards uniquement (80 pour http, 443 pour https)
  if (!portsAutorises.includes(u.port)) {
    throw new UrlScrapeRefusee(
      'URL non autorisée ou invalide',
      400,
      `Port non autorisé : ${u.port}`,
    );
  }

  // 5. Rejet immédiat de toute IP littérale dans le nom d'hôte
  if (estIpLitterale(u.hostname)) {
    throw new UrlScrapeRefusee(
      'URL non autorisée ou invalide',
      400,
      `Adresse IP littérale non autorisée : ${u.hostname}`,
    );
  }

  // 6. Résolution DNS de l'hôte et blocage de toutes les IP privées/réservées
  let adresses: string[];
  try {
    adresses = await resoudreDns(u.hostname, resolveur);
  } catch {
    throw new UrlScrapeRefusee(
      'Impossible de récupérer la ressource demandée',
      502,
      `Échec de résolution DNS pour l'hôte ${u.hostname}`,
      'HOTE_INTROUVABLE',
    );
  }

  if (adresses.length === 0) {
    throw new UrlScrapeRefusee(
      'Impossible de récupérer la ressource demandée',
      502,
      `Aucune adresse DNS retournée pour ${u.hostname}`,
      'HOTE_INTROUVABLE',
    );
  }

  for (const ip of adresses) {
    if (typeof ip !== 'string' || isIP(ip) === 0) {
      throw new UrlScrapeRefusee(
        'URL non autorisée ou invalide',
        400,
        'Résultat DNS invalide',
      );
    }

    if (adresseInterdite(ip)) {
      throw new UrlScrapeRefusee(
        'URL non autorisée ou invalide',
        400,
        `Adresse IP résolue interdite (privée/réservée) : ${ip}`,
      );
    }
  }

  return u.toString();
}

/**
 * Télécharge le contenu HTML de l'URL de manière sécurisée en appliquant
 * tous les contrôles anti-SSRF, le plafonnement de taille et la revalidation
 * de chaque redirection.
 */
export async function scrapeUrlSecurisee(
  urlBrute: unknown,
  options: OptionsScrape = {},
): Promise<string> {
  if (typeof urlBrute !== 'string' || urlBrute.trim() === '') {
    throw new UrlScrapeRefusee(
      'Paramètre URL requis',
      400,
      'URL absente ou vide',
    );
  }

  const { resolveur, fetcher = fetch } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let courante = await validerUrlScrape(urlBrute, resolveur);

    for (let saut = 0; ; saut++) {
      if (saut > SAUTS_MAX) {
        throw new UrlScrapeRefusee(
          'Impossible de récupérer la ressource demandée',
          502,
          'Nombre maximal de redirections dépassé',
          'REDIRECTION_INVALIDE',
        );
      }

      const res = await fetcher(courante, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      // Gestion et revalidation de chaque redirection intermédiaire
      if (res.status >= 300 && res.status < 400) {
        try { await res.body?.cancel(); } catch {}

        const location = res.headers.get('location');
        if (!location) {
          throw new UrlScrapeRefusee(
            'Impossible de récupérer la ressource demandée',
            502,
            'Redirection sans en-tête Location',
            'REDIRECTION_INVALIDE',
          );
        }

        let suivante: string;
        try {
          suivante = new URL(location, courante).toString();
        } catch {
          throw new UrlScrapeRefusee(
            'Impossible de récupérer la ressource demandée',
            502,
            'En-tête Location invalide',
            'REDIRECTION_INVALIDE',
          );
        }

        // Revalidation intégrale de la nouvelle destination (protocol, IP, DNS...)
        courante = await validerUrlScrape(suivante, resolveur);
        continue;
      }

      // Erreur HTTP distante : libérer le corps avant de lever l'erreur
      if (!res.ok) {
        try {
          await res.body?.cancel();
        } catch {
          // L'échec de l'annulation ne doit pas masquer l'erreur HTTP initiale.
        }

        const statutHttp = res.status >= 400 && res.status < 500 ? res.status : 502;
        throw new UrlScrapeRefusee(
          'Impossible de récupérer la ressource demandée',
          statutHttp,
          `Erreur HTTP distante : ${res.status}`,
          codeDepuisStatutDistant(res.status),
        );
      }

      // Vérification du Content-Type (HTML uniquement)
      const rawContentType = res.headers.get('content-type') ?? '';
      const mimeBase = rawContentType.split(';')[0].trim().toLowerCase();
      if (!MIME_AUTORISES.includes(mimeBase)) {
        try { await res.body?.cancel(); } catch {}
        throw new UrlScrapeRefusee(
          'Type de contenu non supporté',
          400,
          `Type de contenu refusé : ${mimeBase || 'inconnu'}`,
          'CONTENU_NON_HTML',
        );
      }

      // Vérification anticipée du Content-Length si fourni
      const declare = Number(res.headers.get('content-length'));
      if (Number.isFinite(declare) && declare > TAILLE_MAX_OCTETS) {
        try { await res.body?.cancel(); } catch {}
        throw new UrlScrapeRefusee(
          'Ressource trop volumineuse',
          413,
          `Content-Length déclaré (${declare} octets) supérieur à 5 Mo`,
        );
      }

      // Lecture bornée en continu (protège contre streams infinis sans Content-Length fiable)
      const chunks: Uint8Array[] = [];
      let total = 0;
      const body = res.body;

      if (body) {
        const lecteur = body.getReader();
        for (;;) {
          const { done, value } = await lecteur.read();
          if (done) break;
          if (!value) continue;
          total += value.byteLength;
          if (total > TAILLE_MAX_OCTETS) {
            try { await lecteur.cancel(); } catch {}
            throw new UrlScrapeRefusee(
              'Ressource trop volumineuse',
              413,
              `Flux lu supérieur à la limite de 5 Mo (atteint ${total} octets)`,
            );
          }
          chunks.push(value);
        }
      }

      // Assemblage du corps
      const buffer = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder().decode(buffer);
    }

    throw new UrlScrapeRefusee(
      'Impossible de récupérer la ressource demandée',
      502,
      'Nombre maximal de redirections dépassé',
      'REDIRECTION_INVALIDE',
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new UrlScrapeRefusee(
        'La ressource distante met trop de temps à répondre',
        504,
        'Timeout du scraping après 10 secondes',
        'DELAI_DEPASSE',
      );
    }
    if (error instanceof UrlScrapeRefusee) throw error;
    // Échec réseau/TLS : détail technique limité à la nature de l'erreur (jamais l'URL).
    const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
    const natureErreur = typeof cause?.code === 'string'
      ? cause.code
      : error instanceof Error ? error.name : 'inconnue';
    throw new UrlScrapeRefusee(
      'Impossible de récupérer la ressource demandée',
      502,
      `Erreur réseau lors de la récupération (${natureErreur})`,
      'ERREUR_RESEAU',
    );
  } finally {
    clearTimeout(timer);
  }
}
