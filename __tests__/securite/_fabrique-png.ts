// @vitest-environment node
//
// FABRIQUE DE PNG DE TEST
// =======================
//
// Aucun encodeur PNG n'est declare dans `package.json` — ni `sharp`, ni `pngjs`,
// ni `upng`. `sharp` est bien present dans `node_modules`, mais c'est une
// transitive de `tesseract.js` : s'y fier dans un test donnerait un test qui
// cesse de tourner sans qu'on le voie. Cette fabrique encode donc le PNG elle
// meme, en 90 lignes, ce qui a un avantage secondaire utile : les tests
// controlent les octets, y compris ceux qu'aucun encodeur de production
// produirait.
//
// Elle est DELIBEREMENT capable de produire des fichiers qu'un encodeur correct
// ne produirait jamais — filtre inconnu, CRC faux, IHDR menteuse, troncature
// au milieu d'un IDAT. C'est le materiau des tests de refus.
//
// LE POINT LE PLUS IMPORTANT : `compteAlphaAttendu` est un compteur de
// RÉFÉRENCE, écrit indépendamment du décodeur testé. Il lit le tampon de pixels
// source. Les tests comparent donc le décodeur à la vérité terrain, et non à une
// constante qu'on aurait recopiée depuis la sortie du décodeur — ce qui ne
// prouverait rien.

import { deflateSync } from 'node:zlib';

const EMPREINTE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ── CRC 32 (identique à celui de la spécification PNG) ─────────────────────

let TABLE_CRC: number[] | null = null;

function tableCrc(): number[] {
  if (TABLE_CRC) return TABLE_CRC;
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  TABLE_CRC = t;
  return t;
}

export function crc32(buf: Buffer): number {
  const t = tableCrc();
  let r = 0xffffffff;
  for (let i = 0; i < buf.length; i++) r = t[(r ^ buf[i]) & 0xff] ^ (r >>> 8);
  return (r ^ 0xffffffff) >>> 0;
}

// ── Morceaux PNG ───────────────────────────────────────────────────────────

export type EtatCrc = 'valide' | 'faux' | 'nul';

export function morceau(type: string, data: Buffer, etatCrc: EtatCrc = 'valide'): Buffer {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(data.length, 0);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(etatCrc === 'valide' ? crc32(corps) : etatCrc === 'nul' ? 0 : 0xdeadbeef, 0);
  return Buffer.concat([longueur, corps, crc]);
}

/** Les treize octets de l'IHDR, construits explicitement pour rester lisibles. */
export function ihdr(
  largeur: number,
  hauteur: number,
  options: {
    profondeur?: number;
    colorType?: number;
    compression?: number;
    filtrage?: number;
    entrelacement?: number;
  } = {}
): Buffer {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(largeur >>> 0, 0);
  b.writeUInt32BE(hauteur >>> 0, 4);
  b[8] = options.profondeur ?? 8;
  b[9] = options.colorType ?? 6;
  b[10] = options.compression ?? 0;
  b[11] = options.filtrage ?? 0;
  b[12] = options.entrelacement ?? 0;
  return b;
}

// ── Rendu d'une signature ─────────────────────────────────────────────────

export const LARGEUR = 400;
export const HAUTEUR = 160;

/** Tampon RGBA vide, transparent — l'état d'un canvas juste après `clearRect`. */
export function canvasVierge(largeur = LARGEUR, hauteur = HAUTEUR): Buffer {
  return Buffer.alloc(largeur * hauteur * 4);
}

/**
 * Trace un segment avec bord antialiasé, comme le fait un navigateur.
 *
 * `lineWidth = 3` et `strokeStyle = '#0f172a'` sont les valeurs réelles de
 * `components/SignatureModal.tsx`. Le profil d'opacité est un dégradé de
 * distance au segment, ce qui reproduit le halo que le comptage doit prendre en
 * compte — c'est pourquoi le seuil est justifié sur `alpha > 0` et non `= 255`.
 */
export function tracerTrait(
  px: Buffer,
  largeur: number,
  points: ReadonlyArray<readonly [number, number]>,
  epaisseur = 3
): Buffer {
  px.fill(0);
  const ctx = { couleur: [15, 23, 42] as const };
  for (let s = 0; s + 1 < points.length; s++) {
    const [x0, y0] = points[s];
    const [x1, y1] = points[s + 1];
    const distance = Math.hypot(x1 - x0, y1 - y0);
    const pas = Math.max(1, distance / 2);
    const rayon = epaisseur / 2 + 0.5;
    const portee = Math.ceil(rayon) + 1;
    for (let t = 0; t <= pas; t++) {
      const cx = x0 + ((x1 - x0) * t) / pas;
      const cy = y0 + ((y1 - y0) * t) / pas;
      for (let dy = -portee; dy <= portee; dy++) {
        for (let dx = -portee; dx <= portee; dx++) {
          const x = Math.round(cx) + dx;
          const y = Math.round(cy) + dy;
          if (x < 0 || y < 0 || x >= largeur || y >= Math.ceil(px.length / 4 / largeur)) continue;
          const d = Math.hypot(Math.round(cx) + dx - cx, Math.round(cy) + dy - cy);
          const alpha = Math.max(0, Math.min(1, rayon - d));
          if (alpha <= 0) continue;
          const k = (y * largeur + x) * 4;
          const valeur = Math.round(alpha * 255);
          px[k] = ctx.couleur[0];
          px[k + 1] = ctx.couleur[1];
          px[k + 2] = ctx.couleur[2];
          px[k + 3] = Math.max(px[k + 3], valeur);
        }
      }
    }
  }
  return px;
}

/** Un paraphe plausible : neuf points, comme un nom cursive. */
export const PARAPHE: ReadonlyArray<readonly [number, number]> = [
  [60, 100], [110, 55], [130, 110], [165, 50], [190, 105], [225, 70], [260, 100], [250, 110], [330, 60],
];

export function canvasParaphe(largeur = LARGEUR, hauteur = HAUTEUR): Buffer {
  return tracerTrait(canvasVierge(largeur, hauteur), largeur, PARAPHE);
}

/** Un trait de longueur donnée, centré — sert à balayer le seuil. */
export function canvasTraitLongueur(
  longueurPx: number,
  largeur = LARGEUR,
  hauteur = HAUTEUR
): Buffer {
  const depart = Math.floor((largeur - longueurPx) / 2);
  return tracerTrait(canvasVierge(largeur, hauteur), largeur, [
    [depart, Math.floor(hauteur / 2)],
    [depart + longueurPx, Math.floor(hauteur / 2)],
  ]);
}

/** Un aplat OPAQUE, sans alpha : ce que donnerait un canvas peint en blanc. */
/**
 * Un aplat OPAQUE. Avec la valeur par défaut c'est une PAGE BLANCHE, pas une
 * signature : c'est le fichier qui a fait trouver le trou de l'aplat blanc, donc
 * il reste dans la fabrique.
 */
export function canvasAplatOpaque(largeur = LARGEUR, hauteur = HAUTEUR, rgba: [number, number, number] = [255, 255, 255]): Buffer {
  const px = Buffer.alloc(largeur * hauteur * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = rgba[0];
    px[i + 1] = rgba[1];
    px[i + 2] = rgba[2];
    px[i + 3] = 255;
  }
  return px;
}

/**
 * COMPTEUR DE RÉFÉRENCE.
 *
 * Indépendant du décodeur testé : il lit le tampon de pixels, pas le PNG. C'est
 * la seule façon d'avoir un oracle qui ne soit pas produit par le code sous
 * test.
 *
 * Il applique la MÊME définition de l'encre que le décodeur — « visible ET pas
 * le papier » — mais il l'écrit sur le tampon source, sans passer par le PNG,
 * l'IHDR, `zlib` ni les filtres de ligne. Si le décodeur se trompe sur l'un de
 * ces étages, l'écart apparaît.
 */
export function compteEncreAttendu(px: Buffer): number {
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 0 && (px[i] !== 255 || px[i + 1] !== 255)) n++;
  }
  return n;
}

/** Nombre de pixels à alpha non nul, SANS la condition « pas le papier ». */
export function compteAlphaSeul(px: Buffer): number {
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
  return n;
}

/** Équivalent RVB de `compteAlphaAttendu` : pixels non blancs. */
export function compteNonBlancAttendu(px: Buffer): number {
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] !== 255 || px[i + 1] !== 255 || px[i + 2] !== 255) n++;
  }
  return n;
}

// ── Encodage ───────────────────────────────────────────────────────────────

/** Applique un filtre de ligne PNG. `type` 0..4. */
function filtrer(
  ligne: Buffer,
  precedente: Buffer,
  type: number,
  canaux: number
): Buffer {
  const sortie = Buffer.alloc(ligne.length);
  for (let x = 0; x < ligne.length; x++) {
    const gauche = x >= canaux ? ligne[x - canaux] : 0;
    const haut = precedente[x];
    const hautGauche = x >= canaux ? precedente[x - canaux] : 0;
    let predicteur = 0;
    if (type === 1) predicteur = gauche;
    else if (type === 2) predicteur = haut;
    else if (type === 3) predicteur = (gauche + haut) >> 1;
    else if (type === 4) {
      const p = gauche + haut - hautGauche;
      const pa = Math.abs(p - gauche);
      const pb = Math.abs(p - haut);
      const pc = Math.abs(p - hautGauche);
      predicteur = pa <= pb && pa <= pc ? gauche : pb <= pc ? haut : hautGauche;
    }
    sortie[x] = (ligne[x] - predicteur) & 0xff;
  }
  return sortie;
}

export type OptionsEncodage = {
  largeur?: number;
  hauteur?: number;
  colorType?: number;
  profondeur?: number;
  entrelacement?: number;
  /** Filtre par ligne. Un nombre = même filtre partout ; un tableau = par ligne. */
  filtres?: number | readonly number[];
  etatCrc?: EtatCrc;
  /** Nombre de morceaux IDAT : 1 par défaut, 7 pour tester la concatenation. */
  nbIdat?: number;
  /** Octets retirés de la fin du fichier, pour simuler une troncature. */
  tronquer?: number;
  /** Remplace le flux IDAT par ces octets, tels quels. */
  idat?: Buffer;
};

const CANAUX: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/**
 * Compose un tampon RGBA sur un fond blanc, comme le fait un encodeur qui
 * retire le canal alpha d'un canvas transparent.
 *
 * Cette étape n'est pas décorative. Supprimer l'alpha naïvement — en recopiant
 * les trois premiers octets — transformerait le fond TRANSPARENT en fond NOIR,
 * et un décodeur qui compte « pixels non blancs » compterait alors toute
 * l'image. Un encodeur réel ne fait pas ça : il compose. La fabrique doit être
 * fidèle, sinon le test A7 mesurerait un artefact de la fabrique.
 */
export function composerSurBlanc(px: Buffer): Buffer {
  const sortie = Buffer.alloc(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] / 255;
    for (let c = 0; c < 3; c++) {
      sortie[i + c] = Math.round(px[i + c] * a + 255 * (1 - a));
    }
    sortie[i + 3] = 255;
  }
  return sortie;
}

/** Équivalent « pixels non blancs » du tampon composé sur blanc. */
export function compteEncreSurBlancAttendu(px: Buffer): number {
  return compteNonBlancAttendu(composerSurBlanc(px));
}

/** Convertit un tampon RGBA vers les canaux du `colorType` demandé. */
function versCanaux(px: Buffer, colorType: number, largeur: number, hauteur: number): Buffer {
  if (colorType === 6) return px;
  const parPixel = CANAUX[colorType];
  if (parPixel === undefined) throw new Error(`colorType non gere: ${colorType}`);
  // Sans canal alpha, la conversion passe par une composition sur blanc — voir
  // `composerSurBlanc`. Avec canal alpha (type 4), rien n'est composé.
  const src = colorType === 4 ? px : composerSurBlanc(px);
  const sortie = Buffer.alloc(largeur * hauteur * parPixel);
  for (let i = 0, k = 0; i < src.length; i += 4) {
    if (colorType === 0 || colorType === 4) {
      // Rec. 601, ce que fait un encodeur pour gray <- RGB.
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      sortie[k++] = v;
      if (colorType === 4) sortie[k++] = src[i + 3];
    } else {
      sortie[k++] = src[i];
      sortie[k++] = src[i + 1];
      sortie[k++] = src[i + 2];
    }
  }
  return sortie;
}

/** Assemble un PNG complet, prêt à être base64. */
export function encoderPng(px: Buffer, options: OptionsEncodage = {}): Buffer {
  const couleur = options.colorType ?? 6;
  const largeur = options.largeur ?? LARGEUR;
  const hauteur = options.hauteur ?? HAUTEUR;
  const canaux = CANAUX[couleur] ?? 4;
  const etatCrc = options.etatCrc ?? 'valide';

  const stride = largeur * canaux;

  let brut: Buffer;
  if (options.idat) {
    // L appelant fournit deja le flux brut. C'est le seul moyen de produire un
    // IHDR qui announces un `colorType` que cette fabrique ne sait pas encoder
    // — ce que le decodeur doit refuser sur la seule foi de l'entete.
    brut = options.idat;
  } else {
    const plat = versCanaux(px, couleur, largeur, hauteur);
    const filtres = options.filtres ?? 0;
    const morceaux = Buffer.alloc(hauteur * (1 + stride));
    let precedente: Buffer<ArrayBufferLike> = Buffer.alloc(stride);
    for (let y = 0; y < hauteur; y++) {
      const type = typeof filtres === 'number' ? filtres : (filtres[y] ?? 0);
      const ligne = plat.subarray(y * stride, (y + 1) * stride);
      morceaux[y * (1 + stride)] = type;
      filtrer(ligne, precedente, type, canaux).copy(morceaux, y * (1 + stride) + 1);
      precedente = ligne;
    }
    brut = deflateSync(morceaux, { level: 9 });
  }

  const nbIdat = options.nbIdat ?? 1;
  const parties: Buffer[] = [
    morceau('IHDR', ihdr(largeur, hauteur, {
      profondeur: options.profondeur ?? 8,
      colorType: couleur,
      entrelacement: options.entrelacement ?? 0,
    }), etatCrc),
  ];
  // Le flux deflate se coupe en morceaux de taille egale : c'est legal et c'est
  // ce que font les encodeurs reels quand l'image est grande.
  const taille = Math.ceil(brut.length / nbIdat) || 1;
  for (let n = 0; n < nbIdat; n++) {
    const part = brut.subarray(n * taille, Math.min((n + 1) * taille, brut.length));
    if (n === 0 || part.length > 0) parties.push(morceau('IDAT', part, etatCrc));
  }
  parties.push(morceau('IEND', Buffer.alloc(0), etatCrc));

  const complet = Buffer.concat([EMPREINTE_PNG, ...parties]);
  return options.tronquer ? complet.subarray(0, complet.length - options.tronquer) : complet;
}

/** Base64 avec le préfixe data URL attendu par la route. */
export function dataUrl(buffer: Buffer, prefixe = 'data:image/png;base64,'): string {
  return prefixe + buffer.toString('base64');
}

/** PNG encodé et mis en data URL, en une expression. */
export function pngDataUrl(px: Buffer, options: OptionsEncodage = {}): string {
  return dataUrl(encoderPng(px, options));
}

/**
 * Arme une « decompression bomb » : l'IHDR annonce 1×1, donc
 * `hauteur * (1 + largeur * canaux)` vaut neuf octets, tandis que l'IDAT inflate
 * vers des dizaines de megaoctets.
 *
 * C'est la charge la plus petite qui ferait allouer le plus gros : quelques
 * kilo-octets a l'entree, des dizaines de megaoctets si le plafond n'est pas
 * impose. Elle est construite ici pour etre utilisee par le test E.
 */
/**
 * Le flux de lignes tel qu'il doit aller dans l'IDAT, pour un tampon RGBA.
 *
 * Utilise quand l'IHDR annonce autre chose que RGBA : le contenu reste un flux
 * RVBA valide, et seule l'entete ment. C'est ce qui permet de verifier que le
 * decodeur lit l'entete — et non le contenu — pour savoir combien de canaux
 * lire.
 */
export function fluxIdatRgba(px: Buffer, largeur = LARGEUR, hauteur = HAUTEUR): Buffer {
  const stride = largeur * 4;
  const morceaux = Buffer.alloc(hauteur * (1 + stride));
  let precedente: Buffer<ArrayBufferLike> = Buffer.alloc(stride);
  for (let y = 0; y < hauteur; y++) {
    const ligne = px.subarray(y * stride, (y + 1) * stride);
    morceaux[y * (1 + stride)] = 0;
    ligne.copy(morceaux, y * (1 + stride) + 1);
    precedente = ligne;
  }
  return deflateSync(morceaux, { level: 9 });
}

/**
 * PNG dont SEULE l'entete compte, avec des dimensions a proprement parler
 * absurdes.
 *
 * L'IDAT ne contient qu'un octet. C'est volontaire : le decodeur doit refuser sur
 * la lecture de l'IHDR, donc il ne doit jamais atteindre l'inflation. Construire
 * un vrai flux 2000×2000 allouerait 64 Mo par appel pour un fichier que personne
 * ne doit lire jusqu'au bout — le test mesurerait la memoire de la fabrique
 * autant que la borne du decodeur.
 */
export function pngAHautesBornes(largeur: number, hauteur: number): string {
  return dataUrl(
    Buffer.concat([
      EMPREINTE_PNG,
      morceau('IHDR', ihdr(largeur, hauteur)),
      morceau('IDAT', Buffer.from([0x78])),
      morceau('IEND', Buffer.alloc(0)),
    ])
  );
}

export const TAILLE_BOMBE = 24 * 1024 * 1024;

/** Mémoïsation : `deflateSync` de 24 Mo n'est pas gratuit, et E l'appelle six fois. */
let BOMME_MEMO: string | null = null;

export function pngBombe(taille = TAILLE_BOMBE): string {
  if (taille === TAILLE_BOMBE && BOMME_MEMO !== null) return BOMME_MEMO;
  const bombe = deflateSync(Buffer.alloc(taille), { level: 9 });
  // IHDR honnete : 1 pixel, canal alpha compris. Rien de menteur dans l'entete.
  const url = dataUrl(encoderPng(Buffer.alloc(4), { largeur: 1, hauteur: 1, idat: bombe }));
  if (taille === TAILLE_BOMBE) BOMME_MEMO = url;
  return url;
}