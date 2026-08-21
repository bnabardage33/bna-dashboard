// lib/meteoFranceToken.ts
//
// Gestion du token OAuth2 pour l'API Météo-France.
//
// Les tokens générés manuellement sur le portail expirent en ~24-28h.
// Ce module régénère automatiquement un token via l'endpoint OAuth2
// officiel, avec un cache mémoire pour éviter de spammer l'API à
// chaque requête.
//
// Variable d'env nécessaire :
//   METEOFRANCE_APPLICATION_ID
//   (trouvable sur portail-api.meteofrance.fr > Mes APIs > ton app
//    > "Application ID", déjà en base64, PAS le JWT généré à la main)

const URL_TOKEN =
  "https://portail-api.meteofrance.fr/token";

// -----------------------------------------------------------------------
// Cache mémoire (survit tant que le process Node/Deno reste chaud)
// -----------------------------------------------------------------------

let tokenCache: {
  accessToken: string;
  expireLe: number; // timestamp ms
} | null = null;

// Marge de sécurité : on régénère 5 minutes avant l'expiration réelle
const MARGE_SECURITE_MS = 5 * 60 * 1000;

export async function obtenirTokenMeteoFrance(): Promise<string> {
  const maintenant = Date.now();

  // Token en cache encore valide -> on le réutilise
  if (
    tokenCache &&
    tokenCache.expireLe - MARGE_SECURITE_MS > maintenant
  ) {
    return tokenCache.accessToken;
  }

  const applicationId =
    process.env.METEOFRANCE_APPLICATION_ID;

  if (!applicationId) {
    throw new Error(
      "METEOFRANCE_APPLICATION_ID non configurée"
    );
  }

  const response = await fetch(URL_TOKEN, {
    method: "POST",
    headers: {
      Authorization: `Basic ${applicationId}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const texte = await response.text();
    throw new Error(
      `Échec génération token Météo-France (${response.status}): ${texte}`
    );
  }

  const data = await response.json();

  // La réponse OAuth2 standard contient access_token + expires_in (secondes)
  const accessToken: string = data.access_token;
  const expiresInSec: number = data.expires_in ?? 3600;

  if (!accessToken) {
    throw new Error(
      "Réponse token Météo-France sans access_token"
    );
  }

  tokenCache = {
    accessToken,
    expireLe: maintenant + expiresInSec * 1000,
  };

  return accessToken;
}

// Utilitaire pour forcer l'invalidation du cache (utile si un appel
// échoue avec 401 malgré un token "valide" en cache)
export function invaliderCacheToken() {
  tokenCache = null;
}
