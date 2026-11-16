// lib/fetchWithTimeout.ts
//
// Wrapper `fetch` borné dans le temps — correctif point C5 de l'audit
// (« timeouts des fetch externes »).
//
// POURQUOI UN WRAPPER PARTAGÉ ET NON DES COPIES
// ---------------------------------------------
// Tous les appels sortants (Groq, Gemini, Météo-France, Open-Meteo, OTP SMS)
// doivent échouer de la MÊME façon : bornés, journalisés, convertibles en 504.
// Dupliquer ce bloc dans six fichiers garantit qu'un correctif futur n'en
// touchera qu'un.
//
// `AbortController` MANUEL (et non `AbortSignal.timeout`) : on maîtrise le nom
// de l'erreur (`AbortError`) et on journalise service + durée.
// Compatibilité : Node ≥ 17.3 / Next 16 (Node ≥ 20.9).

/** Options `fetch` élargies de l'extension Next.js `next` (cache / revalidate). */
type OptionsFetch = RequestInit & {
  next?: { revalidate?: number | false; tags?: string[] };
};

/** Erreur levée quand un service tiers dépasse le délai imparti. */
export class ErreurTimeout extends Error {
  constructor(
    public readonly service: string,
    public readonly delaiMs: number,
  ) {
    super(`[TIMEOUT] Service ${service} a dépassé ${delaiMs}ms`);
    this.name = 'ErreurTimeout';
  }
}

/** Étiquette lisible d'un service à partir de son URL (hôte, sinon URL brute). */
function etiquetteService(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * `fetch` avec délai maximal.
 *
 * @param url     URL cible
 * @param options options `fetch` (method, headers, body…)
 * @param ms      délai maximal en millisecondes
 * @returns la `Response` telle quelle (le contrôle `response.ok` reste à l'appelant)
 * @throws ErreurTimeout si le délai est dépassé ; toute autre erreur est relayée
 */
export async function fetchWithTimeout(
  url: string,
  options: OptionsFetch,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      const service = etiquetteService(url);
      console.error(`[TIMEOUT] Service ${service} a dépassé ${ms}ms`);
      throw new ErreurTimeout(service, ms);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Détecte un dépassement de délai, quel que soit son enveloppement :
 * `ErreurTimeout` directe (fetchWithTimeout) ou DOMException
 * `AbortError`/`TimeoutError` remontée par `AbortSignal.timeout` à travers un SDK.
 */
export function estDelaiDepasse(err: unknown): boolean {
  if (err instanceof ErreurTimeout) return true;
  if (!err || typeof err !== 'object') return false;
  const nom = (err as { name?: unknown }).name;
  if (nom === 'AbortError' || nom === 'TimeoutError') return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const nomCause = (cause as { name?: unknown }).name;
    if (nomCause === 'AbortError' || nomCause === 'TimeoutError') return true;
  }
  return false;
}
