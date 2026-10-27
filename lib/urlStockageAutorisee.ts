// lib/urlStockageAutorisee.ts
//
// Anti-SSRF : validation d'une URL de téléchargement AVANT tout `fetch` partant
// du serveur. Corrige le défaut « ia-ocr-ticket » (audit final série B, point E)
// : la route faisait `fetch(url)` sur une URL entièrement fournie par le client,
// puis envoyait le contenu récupéré à Google Gemini.
//
// Le problème n'est pas « une URL qui commence par https:// » : c'est la
// DESTINATION RÉELLEMENT CONTACTÉE. Un nom d'hôte contrôlé par l'attaquant peut
// désigner 127.0.0.1, 169.254.169.254 ou [::1] ; et un nom d'hôte PUBLIC peut
// rediriger vers une adresse interne.
//
// Stratégie, du plus fort au plus faible (toutes appliquées) :
//
//   1. ALLOWLIST de l'origine. La seule destination légitime du produit est le
//      bucket public du projet Supabase courant, donné par
//      NEXT_PUBLIC_SUPABASE_URL. Une allowlist est préférable à une blacklist :
//      elle refuse par défaut tout hôte que le produit n'a pas lui-même émis.
//   2. Schéma `https:` uniquement, origine comparée à l'allowlist. Toute forme
//      d'IP littérale (IPv4 ou IPv6) est donc écartée d'emblée : une IP ne peut
//      pas être égale à un nom de domaine. L'égalité d'origine est faite sur
//      la forme normalisée de l'URL — « HÔTE.cas » et « hôte.cas » se
//      normalisent vers la même origine, mais « allowed.host.evil.test » ne
//      normalise PAS vers `allowed.host`.
//   3. Pas d'identifiants dans l'URL (`https://user:pass@hôte/`), pas de port
//      non standard : les deux servent à contourner un filtrage de chaîne.
//   4. Préfixe de chemin imposé : `/storage/v1/object/public/<bucket>/`.
//      `/rest/v1/`, `/auth/v1/` et la racine de l'API ne sont donc pas
//      téléchargeables, même sur l'hôte autorisé.
//   5. Résolution DNS de l'hôte, puis rejet de TOUTE adresse résolue située dans
//      une plage non routable, privée, de loopback, link-local ou de metadata.
//      C'est ce contrôle qui rend la validation robuste au DNS rebinding simple
//      et aux variantes d'écriture décimale/hexadécimale des IPv4.
//   6. La fonction de TÉLÉCHARGEMENT revalide chaque redirection, avec plafond de
//      sauts. `redirect: "manual"` empêche `fetch` de suivre une redirection sans
//      contrôle.
//
// Limite assumée : le contrôle porte sur l'IP RÉSOLUE AU MOMENT de la validation,
// pas sur l'adresse réellement utilisée par le pool de connexion. Une
// re-résolution DNS (rebinding) après validation resterait théoriquement possible
// ; la fermer exige de fixer l'IP résolue dans la connexion, ce que l'API `fetch`
// standard n'expose pas. L'allowlist d'origine rend ce cas négligeable : il
// faudrait que l'attaquant contrôle le DNS de NOTRE propre projet Supabase.

import { lookup } from "node:dns/promises";

/** Marqueur de chemin d'un objet public Supabase Storage. */
export function prefixeStockagePublic(bucket: string): string {
  return `/storage/v1/object/public/${bucket}/`;
}

/** Erreur de validation : porte un statut HTTP pour la route appelante. */
export class UrlStockageRefusee extends Error {
  readonly statut: number;
  constructor(message: string, statut = 400) {
    super(message);
    this.name = "UrlStockageRefusee";
    this.statut = statut;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plages interdites
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IPv4 non routables ou dangereuses pour un SSRF.
 * Entrée : [adresse réseau, nombre de bits de préfixe].
 */
const PLAGES_IPV4_INTERDITES: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // this network
  ["10.0.0.0", 8], // RFC1918 privé
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (CLOUDFLAGS / metadata)
  ["172.16.0.0", 12], // RFC1918 privé
  ["192.0.0.0", 24], // IETF protocol
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // RFC1918 privé
  ["192.88.99.0", 24], // ancien relais 6to4, réservé
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // réservé (dont 255.255.255.255)
];

/**
 * IPv6 : [préfixe textuel, bits]. `::1` et `::` sont traités à part (adresses
 * uniques) car ::/128 ne les couvre pas.
 *
 * Les bases doivent être écrites avec `::` (« fe80:: », pas « fe80 ») : sans
 * la compression, `ipv6EnGroupes` les refuserait comme adresses incomplètes et
 * la plage serait silencieusement ignorée.
 */
const PLAGES_IPV6_INTERDITES: ReadonlyArray<readonly [string, number]> = [
  ["64:ff9b::", 96], // traduction IPv4/IPv6 : IPv4 intégrée
  ["64:ff9b:1::", 48], // préfixe de traduction IPv4/IPv6 non global
  ["100::", 64], // discard-only
  ["2001:2::", 48], // benchmarking, non globalement joignable
  ["2001:10::", 28], // ancien préfixe ORCHID
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 : IPv4 intégrée
  ["fe80::", 10], // fe80::/10 link-local
  ["fc00::", 7], // fc00::/7  ULA (unique local)
  ["ff00::", 8], // ff00::/8  multicast
  ["3fff::", 20], // documentation
  ["5f00::", 16], // SRv6 SIDs, non globalement joignable
];

/**
 * Allocations plus spécifiques de 2001::/23 indiquées globalement joignables
 * dans le registre IANA. Le reste de 2001::/23 est refusé par défaut.
 */
const PLAGES_IPV6_PUBLIQUES_2001: ReadonlyArray<readonly [string, number]> = [
  ["2001:1::1", 128], // PCP anycast
  ["2001:1::2", 128], // TURN anycast
  ["2001:1::3", 128], // DNS-SD anycast
  ["2001:3::", 32], // AMT
  ["2001:4:112::", 48], // AS112-v6
  ["2001:20::", 28], // ORCHIDv2
  ["2001:30::", 28], // DETs
];

/** IPv6 normalisation → 8 groupes de 16 bits, ou `null` si illisible. */
function ipv6EnGroupes(adresse: string): number[] | null {
  let texte = adresse.toLowerCase();
  const pct = texte.indexOf("%");
  if (pct !== -1) texte = texte.slice(0, pct); // retire la zone (`%eth0`)

  let corps = texte.startsWith("[") && texte.endsWith("]") ? texte.slice(1, -1) : texte;

  // IPv4 embarquée (`::ffff:1.2.3.4`, `64:ff9b::1.2.3.4`) : on convertit la
  // queue en deux groupes hexadécimaux, comme l'exige la RFC 4291.
  const ipv4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(corps);
  if (ipv4) {
    const octets = ipv4.slice(1, 5).map(Number);
    if (octets.some((o) => o > 255)) return null;
    const h1 = ((octets[0] << 8) | octets[1]).toString(16);
    const h2 = ((octets[2] << 8) | octets[3]).toString(16);
    corps = corps.slice(0, ipv4.index) + h1 + ":" + h2;
  }

  const morceaux = corps.split("::");
  if (morceaux.length > 2) return null;

  const lire = (s: string): number[] | null => {
    if (s === "") return [];
    const out: number[] = [];
    for (const g of s.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const tete = lire(morceaux[0]);
  if (tete === null) return null;

  if (morceaux.length === 1) return tete.length === 8 ? tete : null;

  const queue = lire(morceaux[1]);
  if (queue === null) return null;
  const manquants = 8 - (tete.length + queue.length);
  if (manquants < 1) return null;
  return [...tete, ...new Array(manquants).fill(0), ...queue];
}

function ipv4EnOctets(adresse: string): number[] | null {
  const corps = adresse.startsWith("[") && adresse.endsWith("]") ? adresse.slice(1, -1) : adresse;
  const parties = corps.split(".");
  if (parties.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parties) {
    // `Number("")` vaut 0 : on exige au moins un chiffre, et on refuse le
    // `+`/`-`/espaces qu'un parseur lenient accepterait.
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    octets.push(v);
  }
  return octets;
}

function ipv4EnEntier(octets: number[]): number {
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function ipv6DansPlage(
  adresse: number[],
  prefixe: string,
  bits: number,
): boolean {
  const base = ipv6EnGroupes(prefixe);
  if (!base) return false;
  const groupes = Math.ceil(bits / 16);
  for (let i = 0; i < groupes; i++) {
    const bitsRestants = bits - i * 16;
    const masque =
      bitsRestants >= 16
        ? 0xffff
        : (0xffff << (16 - bitsRestants)) & 0xffff;
    if ((adresse[i] & masque) !== (base[i] & masque)) return false;
  }
  return true;
}

/** Vrai si l'adresse est une IP littérale (donc jamais un nom de domaine). */
export function estIpLitterale(adresse: string): boolean {
  return ipv4EnOctets(adresse) !== null || ipv6EnGroupes(adresse) !== null;
}

/** Vrai si l'adresse tombe dans une plage interdite pour un SSRF. */
export function adresseInterdite(adresse: string): boolean {
  const v4 = ipv4EnOctets(adresse);
  if (v4) {
    const valeur = ipv4EnEntier(v4);
    for (const [reseau, bits] of PLAGES_IPV4_INTERDITES) {
      const base = ipv4EnOctets(reseau);
      if (!base) continue;
      const masque = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      if ((valeur & masque) === (ipv4EnEntier(base) & masque)) return true;
    }
    return false;
  }

  const v6 = ipv6EnGroupes(adresse);
  if (!v6) return true; // entrée malformée : refusée par défaut

  // IPv4 mappée ::ffff:a.b.c.d (et ::ffff:7f00:1). Les 32 derniers bits DOIVENT
  // être rejoués dans les règles IPv4 : sans ce cas, « ::ffff:127.0.0.1 » et
  // « ::ffff:169.254.169.254 » passeraient, alors que leurs équivalents IPv4
  // sont bloqués. C'est le contournement classique d'un filtre IPv6 naïf.
  if (v6.slice(0, 5).every((g) => g === 0) && v6[5] === 0xffff) {
    return adresseInterdite(
      `${(v6[6] >> 8) & 0xff}.${v6[6] & 0xff}.${(v6[7] >> 8) & 0xff}.${v6[7] & 0xff}`
    );
  }

  // :: (non spécifié) et ::1 (loopback) — adresses uniques.
  if (v6.every((g) => g === 0)) return true;
  if (v6.slice(0, 7).every((g) => g === 0) && v6[7] === 1) return true;

  // Espace IPv6 Global Unicast candidat. Les préfixes spéciaux hors de
  // 2000::/3 sont refusés même s'ils ne figurent pas dans la liste ci-dessous.
  if (!ipv6DansPlage(v6, "2000::", 3)) return true;

  for (const [prefixe, bits] of PLAGES_IPV6_INTERDITES) {
    if (ipv6DansPlage(v6, prefixe, bits)) return true;
  }

  // 2001::/23 est globalement non joignable sauf allocations plus spécifiques.
  // Elles sont examinées seulement après les plages explicitement interdites.
  if (ipv6DansPlage(v6, "2001::", 23)) {
    return !PLAGES_IPV6_PUBLIQUES_2001.some(([prefixe, bits]) =>
      ipv6DansPlage(v6, prefixe, bits),
    );
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/** Origine attendue, lue de l'environnement. `null` si absente ou invalide. */
export function origineStockageAttendue(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

export interface OptionsValidationUrl {
  bucket: string;
  /** Résolveur injectable — pour les tests. Par défaut `dns.promises.lookup`. */
  resolveur?: (hote: string) => Promise<string[]>;
}

async function resoudre(
  hote: string,
  resolveur?: OptionsValidationUrl["resolveur"]
): Promise<string[]> {
  if (resolveur) return resolveur(hote);
  const resultats = await lookup(hote, { all: true });
  return resultats.map((r) => r.address);
}

/**
 * Valide une URL et renvoie sa forme normalisée. Lève `UrlStockageRefusee`
 * (fail-closed) si quoi que ce soit ne colle pas.
 */
export async function validerUrlStockage(
  urlBrute: unknown,
  options: OptionsValidationUrl
): Promise<string> {
  const { bucket, resolveur } = options;

  if (typeof urlBrute !== "string" || urlBrute.trim() === "") {
    throw new UrlStockageRefusee("image_url requis");
  }

  let u: URL;
  try {
    // `new URL` SANS base : sinon une URL relative ou protocol-relative
    // (« //evil.test/x ») serait résolue contre une base arbitraire.
    u = new URL(urlBrute.trim());
  } catch {
    throw new UrlStockageRefusee("image_url invalide");
  }

  if (u.protocol !== "https:") {
    throw new UrlStockageRefusee("image_url : schéma non autorisé");
  }
  if (u.username || u.password) {
    throw new UrlStockageRefusee("image_url : identifiants non autorisés");
  }

  const attendue = origineStockageAttendue();
  if (!attendue) {
    // Fail-closed : sans référence d'origine, AUCUNE URL ne peut être jugée
    // légitime. 503 : c'est une panne de configuration, pas du client.
    throw new UrlStockageRefusee("Origine de stockage non configurée", 503);
  }
  if (u.origin !== attendue) {
    throw new UrlStockageRefusee("image_url : hôte non autorisé");
  }
  if (u.port !== "" && u.port !== "443") {
    throw new UrlStockageRefusee("image_url : port non autorisé");
  }
  if (estIpLitterale(u.hostname)) {
    throw new UrlStockageRefusee("image_url : adresse IP non autorisée");
  }

  const prefixe = prefixeStockagePublic(bucket);
  if (!u.pathname.startsWith(prefixe)) {
    throw new UrlStockageRefusee("image_url : emplacement de stockage non autorisé");
  }
  if (u.pathname.length <= prefixe.length) {
    throw new UrlStockageRefusee("image_url : emplacement de stockage vide");
  }

  // Dernier rempart : l'hôte est autorisé par son NOM ; vérifie-t-on
  // qu'il ne résout pas vers une adresse interne ?
  let adresses: string[];
  try {
    adresses = await resoudre(u.hostname, resolveur);
  } catch {
    throw new UrlStockageRefusee("image_url : hôte non résolvable", 502);
  }
  if (adresses.length === 0) {
    throw new UrlStockageRefusee("image_url : hôte non résolvable", 502);
  }
  for (const ip of adresses) {
    if (adresseInterdite(ip)) {
      throw new UrlStockageRefusee("image_url : destination non autorisée");
    }
  }

  return u.toString();
}

export interface OptionsTelechargement {
  bucket: string;
  /** Plafond de taille lue, en octets. */
  tailleMax: number;
  resolveur?: OptionsValidationUrl["resolveur"];
  /** `fetch` injectable — pour les tests. */
  fetcher?: typeof fetch;
  /** Nombre maximal de redirections suivies. */
  sautsMax?: number;
}

/**
 * Télécharge une image en n'acceptant que des destinations validées, et en
 * revalidant CHAQUE redirection. Retourne un data-URL base64.
 */
export async function telechargerImageStockage(
  urlBrute: unknown,
  options: OptionsTelechargement
): Promise<{ dataUrl: string; octets: number }> {
  const fetcher = options.fetcher ?? fetch;
  const sautsMax = options.sautsMax ?? 3;

  let courante = await validerUrlStockage(urlBrute, options);

  for (let saut = 0; ; saut++) {
    if (saut > sautsMax) {
      throw new UrlStockageRefusee("Trop de redirections", 502);
    }

    const res = await fetcher(courante, { redirect: "manual" });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new UrlStockageRefusee("Redirection sans destination", 502);
      }
      // Destination RÉELLE de la redirection : elle repasse par le validateur.
      let suivante: string;
      try {
        suivante = new URL(location, courante).toString();
      } catch {
        throw new UrlStockageRefusee("Redirection invalide", 502);
      }
      courante = await validerUrlStockage(suivante, options);
      continue;
    }

    if (!res.ok) {
      throw new UrlStockageRefusee("Téléchargement impossible", 502);
    }

    // Plafond de taille : `content-length` d'abord (refus tôt, sans lecture),
    // puis lecture bornée réellement — un en-tête menteur ne doit pas permettre
    // de dépasser le plafond.
    const declare = Number(res.headers.get("content-length"));
    if (Number.isFinite(declare) && declare > options.tailleMax) {
      throw new UrlStockageRefusee("Image trop volumineuse", 413);
    }

    const chunks: Buffer[] = [];
    let total = 0;
    const body = res.body;
    if (body) {
      const lecteur = body.getReader();
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > options.tailleMax) {
          try {
            await lecteur.cancel();
          } catch {
            /* flux déjà abandonné : rien à faire */
          }
          throw new UrlStockageRefusee("Image trop volumineuse", 413);
        }
        chunks.push(Buffer.from(value));
      }
    }

    if (total === 0) {
      throw new UrlStockageRefusee("Image vide", 502);
    }

    const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!/^image\/[a-z0-9.+-]+$/i.test(mime)) {
      throw new UrlStockageRefusee("Type de contenu non image");
    }

    const buffer = Buffer.concat(chunks);
    return {
      dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
      octets: total,
    };
  }
}
