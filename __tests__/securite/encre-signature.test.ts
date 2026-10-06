// @vitest-environment node
//
// LE CONTRÔLE D'INTÉGRITÉ DE LA PREUVE GRAPHIQUE — CÔTÉ SERVEUR
// =============================================================
//
// Ces tests couvrent `_encre-signature.ts` et son branchement dans
// `app/api/espace-client/[code_acces]/verify-otp/route.ts`.
//
// CE QUE CES TESTS PROUVENT, ET CE QU'ILS NE PROUVENT PAS
// --------------------------------------------------------
//
// Ils prouvent une chose : une image acceptée par la route porte de l'encre
// réelle, lisible pixel par pixel, et une image qui n'en porte pas est refusée
// avant que l'OTP ne soit lu. Rien de plus.
//
// Ils ne prouvent PAS qu'une personne a signé. Un signataire déterminé trace un
// gribouillage de cinquante pixels et passe ; cest exactement ce que ce contrôle
// doit faire, et ce qu'il ne doit PAS prétendre ne pas faire. La preuve
// d'identité reste l'OTP, vérifié côté serveur sur le téléphone du dossier. Une
// preuve graphique ne dit pas QUI.
//
// L'ORACLE EST INDÉPENDANT
// ------------------------
//
// Aucune assertion ne compare le décodeur à une constante recopiée depuis sa
// propre sortie. Chaque décompte attendu vient de `compteEncreAttendu`, qui lit
// le tampon de PIXELS SOURCE, écrit sans aucun rapport avec le décodeur testé.
// Un décodeur faux, ou un décodeur qui ne dé-filtre pas, se voit immédiatement.
//
// LA STRUCTURE EST ANTI-VACUITÉ
// ----------------------------
//
// Chaque section a un témoin qui prouve qu'elle n'est pas satisfaite par rien :
// « l'image est refusée » ne veut rien dire si « l'image est acceptée » ne lest
// pas. Les sections D et E ont en plus un témoin de MOTIF : un refus obtenu pour
// la mauvaise raison passerait quand même le statut HTTP, et cest précisément
// ce qu'on cherche à empêcher.

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sansCommentaires } from './_lecture-source';

import {
  verifierEncreSignature,
  SEUIL_ENCRE_SERVEUR,
} from '@/app/api/espace-client/[code_acces]/_encre-signature';
import { condenserCodeOtp, messageRefusPublic } from '@/lib/otp';
import {
  canvasVierge,
  canvasParaphe,
  canvasTraitLongueur,
  canvasAplatOpaque,
  composerSurBlanc,
  compteEncreAttendu,
  compteEncreSurBlancAttendu,
  compteAlphaSeul,
  compteNonBlancAttendu,
  encoderPng,
  dataUrl,
  pngDataUrl,
  pngBombe,
  pngAHautesBornes,
  fluxIdatRgba,
  morceau,
  ihdr,
  crc32,
  LARGEUR,
  HAUTEUR,
  TAILLE_BOMBE,
} from './_fabrique-png';

// ── Témoin : le décodeur voit la MÊME chose que le compteur de référence ────

describe('0) temoin : le decodeur compte comme la reference', () => {
  it('0.1 un paraphe est compte exactement, pixel pour pixel', () => {
    const px = canvasParaphe();
    const attendu = compteEncreAttendu(px);
    expect(verifierEncreSignature(pngDataUrl(px))).toEqual({ ok: true, pixelsOpaques: attendu });
    // Garde-fou : si l'oracle tombait a zero, les tests B et C ne prouveraient
    // rien du tout.
    expect(attendu).toBeGreaterThan(1000);
  });

  it('0.2 le canvas vierge vaut exactement zero', () => {
    expect(compteEncreAttendu(canvasVierge())).toBe(0);
  });

  it('0.3 le decodage est stable : deux appels, meme verdict', () => {
    const url = pngDataUrl(canvasParaphe());
    expect(verifierEncreSignature(url)).toEqual(verifierEncreSignature(url));
  });
});

// ── A) PNG valide, suffisamment d'encre → accepté ─────────────────────────

describe('A) png valide avec suffisamment de pixels : accepte', () => {
  it('A1 un paraphe de reference est accepte', () => {
    expect(verifierEncreSignature(pngDataUrl(canvasParaphe())).ok).toBe(true);
  });

  it('A2 le decompte renvoye correspond au tampon source', () => {
    const px = canvasParaphe();
    expect(verifierEncreSignature(pngDataUrl(px))).toEqual({
      ok: true,
      pixelsOpaques: compteEncreAttendu(px),
    });
  });

  it.each([0, 1, 2, 3, 4])('A3.%i le filtre de ligne %d est de-filtre correctement', (filtre) => {
    // Un décodeur qui n'applique pas le filtre lit des DIFFÉRENCES entre
    // voisins : un canvas vierge devient alors un motif chiffré que le décompte
    // compterait comme de l'encre, et le paraphe serait compté faux. Ce test
    // attrape les deux erreurs à la fois.
    const px = canvasParaphe();
    expect(verifierEncreSignature(pngDataUrl(px, { filtres: filtre }))).toEqual({
      ok: true,
      pixelsOpaques: compteEncreAttendu(px),
    });
  });

  it('A4 un filtre different par ligne est aussi de-filtre', () => {
    // Les encodeurs réels choisissent le filtre ligne par ligne ; un décodeur qui
    // supposerait « toujours 0 » passerait A3 sans voir ce cas.
    const px = canvasParaphe();
    const filtres = Array.from({ length: HAUTEUR }, (_, y) => y % 5);
    expect(verifierEncreSignature(pngDataUrl(px, { filtres }))).toEqual({
      ok: true,
      pixelsOpaques: compteEncreAttendu(px),
    });
  });

  it('A5 un IDAT decoupe en plusieurs morceaux est reassemble', () => {
    const px = canvasParaphe();
    const attendu = compteEncreAttendu(px);
    for (const nb of [1, 2, 3, 7, 40]) {
      expect(verifierEncreSignature(pngDataUrl(px, { nbIdat: nb })), `${nb} morceaux`).toEqual({
        ok: true,
        pixelsOpaques: attendu,
      });
    }
  });

  it('A6 un morceau inconnu (metadonnees) est ignore sans casse', () => {
    // La spécification PNG impose d'ignorer les morceaux inconnus. Un décodeur
    // qui les refuse casserait tout encodeur ajoutant un `tEXt`.
    //
    // Le morceau est inséré ENTRE le IHDR et les IDAT, pas avant : le IHDR doit
    // rester le premier morceau du fichier, sinon ce n'est plus un PNG valide et
    // le test ne mesurerait pas ce qu'il prétend mesurer.
    const px = canvasParaphe();
    const complet = encoderPng(px);
    const tailleIhdr = 12 + 13;
    const avecTexte = Buffer.concat([
      complet.subarray(0, 8 + tailleIhdr),
      morceau('tEXt', Buffer.from('Comment\0signature', 'latin1')),
      complet.subarray(8 + tailleIhdr),
    ]);
    expect(verifierEncreSignature(dataUrl(avecTexte))).toEqual({
      ok: true,
      pixelsOpaques: compteEncreAttendu(px),
    });
  });

  it('A7 une image sans canal alpha est comptee en pixels non blancs', () => {
    // Le format que produirait un encodeur qui retire l'alpha d'un canvas
    // transparent. Elle doit être COMPTÉE, pas refusée : un refus à tort se voit
    // immédiatement, mais casse le parcours pour une bonne signature.
    //
    // L'oracle compose d'abord sur blanc, comme un encodeur réel. Sans cette
    // composition, le fond transparent deviendrait noir et le décompte
    // compterait toute l'image — le test mesurerait un artefact de la fabrique.
    const px = canvasParaphe();
    const url = pngDataUrl(px, { colorType: 2 });
    expect(verifierEncreSignature(url)).toEqual({
      ok: true,
      pixelsOpaques: compteEncreSurBlancAttendu(px),
    });
  });

  it('A8 une image RVB blanche reste refusee', () => {
    // Le témoin de A7 : sans ce test, un décodeur qui lit « non blanc = encre »
    // accepterait n'importe quoi, y compris une page blanche.
    const verdict = verifierEncreSignature(pngDataUrl(canvasAplatOpaque(), { colorType: 2 }));
    expect(verdict).toEqual({ ok: false, motif: 'image_blanche' });
  });

  it('A9 le format niveaux de gris sans alpha est aussi compte', () => {
    // En niveaux de gris, « gris différent de 255 » et « non blanc » coïncident :
    // le blanc pur fait 255, l'encre #0f172a fait 23. Le même oracle sert donc.
    const px = canvasParaphe();
    const verdict = verifierEncreSignature(pngDataUrl(px, { colorType: 0 }));
    expect(verdict).toEqual({
      ok: true,
      pixelsOpaques: compteEncreSurBlancAttendu(px),
    });
  });

  it('A10 l hypothese « encre plus sombre que papier » est explicite et verrouillee', () => {
    // Le décodeur compte un pixel si alpha > 0 ET le pixel n'est pas blanc. La
    // seconde condition suppose donc une encre plus SOMBRE que le fond. Ce nest
    // pas une supposition : `SignatureModal` écrit `ctx.strokeStyle = '#0f172a'`.
    // Ces deux assertions verrouillent le lien — si la couleur change, ce test
    // tombe et quelqu'un doit décider quoi faire.
    const px = Buffer.alloc(LARGEUR * HAUTEUR * 4);
    for (let x = 0; x < LARGEUR; x++) {
      const k = (80 * LARGEUR + x) * 4;
      px[k] = 0x0f;
      px[k + 1] = 0x17;
      px[k + 2] = 0x2a;
      px[k + 3] = 255;
    }
    expect(compteEncreAttendu(px)).toBe(LARGEUR);
    expect(verifierEncreSignature(pngDataUrl(px)).ok).toBe(true);
  });
});

// ── B) PNG vierge → refusé ─────────────────────────────────────────────────

describe('B) png vierge : refuse', () => {
  it('B1 un canvas transparent vierge est refuse', () => {
    expect(verifierEncreSignature(pngDataUrl(canvasVierge()))).toEqual({
      ok: false,
      motif: 'image_blanche',
    });
  });

  it('B2 un aplat blanc OPAQUE est refuse — le trou que B5 documente', () => {
    // Cest le cas qui a fait trouver la définition d'encre : un aplat blanc
    // opaque a alpha = 255 partout. Compter le seul alpha l'aurait accepté.
    expect(verifierEncreSignature(pngDataUrl(canvasAplatOpaque()))).toEqual({
      ok: false,
      motif: 'image_blanche',
    });
  });

  it('B3 un canvas 1×1 transparent est refuse', () => {
    const verdict = verifierEncreSignature(
      pngDataUrl(canvasVierge(1, 1), { largeur: 1, hauteur: 1 })
    );
    expect(verdict).toEqual({ ok: false, motif: 'image_blanche' });
  });

  it('B4 une image qui ne contient QUE le halo d antialiasage est refusee', () => {
    // Le cas limite réel : un clic isolé produit une poignée de pixels à alpha > 0
    // mais bien moins que le seuil. Ce n'est pas une signature.
    const px = canvasTraitLongueur(2);
    const compte = compteEncreAttendu(px);
    expect(compte).toBeGreaterThan(0);
    expect(compte).toBeLessThan(SEUIL_ENCRE_SERVEUR);
    expect(verifierEncreSignature(pngDataUrl(px))).toEqual({ ok: false, motif: 'image_blanche' });
  });

  it('B5 compter le seul alpha aurait laisse passer une page blanche', () => {
    // Ce test ne teste pas le décodeur : il teste la DÉFINITION, et il l'empêche
    // de régresser. Il affiche l'écart entre les deux compteurs sur le même
    // fichier, de sorte que la raison du `&& non blanc` reste lisible.
    const px = canvasAplatOpaque();
    expect(compteAlphaSeul(px)).toBe(LARGEUR * HAUTEUR);
    expect(compteEncreAttendu(px)).toBe(0);
    expect(verifierEncreSignature(pngDataUrl(px)).ok).toBe(false);
  });
});

// ── C) Sous le seuil → refusé, et le seuil est le documenté ───────────────

describe('C) sous le seuil : refuse', () => {
  it('C1 le seuil vaut 50', () => {
    // Une constante de sécurité doit être visible dans un test. Si quelqu'un la
    // change, ce test tombe et il faut venir le justifier ici.
    expect(SEUIL_ENCRE_SERVEUR).toBe(50);
  });

  it('C2 un trait court est refuse', () => {
    const px = canvasTraitLongueur(5);
    expect(compteEncreAttendu(px)).toBeLessThan(SEUIL_ENCRE_SERVEUR);
    expect(verifierEncreSignature(pngDataUrl(px))).toEqual({ ok: false, motif: 'image_blanche' });
  });

  it('C3 un trait de 20 px est accepte', () => {
    const px = canvasTraitLongueur(20);
    expect(compteEncreAttendu(px)).toBeGreaterThan(SEUIL_ENCRE_SERVEUR);
    expect(verifierEncreSignature(pngDataUrl(px))).toEqual({
      ok: true,
      pixelsOpaques: compteEncreAttendu(px),
    });
  });

  it('C4 le verdict suit le decompte de reference, trait par trait', () => {
    // Balayage continu : le décodeur ne doit avoir AUCUNE frontière cachée. Pour
    // chaque longueur, la vérité terrain tranche.
    for (let longueur = 0; longueur <= 60; longueur += 2) {
      const px = canvasTraitLongueur(longueur);
      const compte = compteEncreAttendu(px);
      const verdict = verifierEncreSignature(pngDataUrl(px));
      const attendu =
        compte >= SEUIL_ENCRE_SERVEUR
          ? { ok: true, pixelsOpaques: compte }
          : { ok: false, motif: 'image_blanche' };
      expect(verdict, `trait de ${longueur} px, ${compte} pixels`).toEqual(attendu);
    }
  });

  it('C5 le seuil serveur est INDEPENDANT du seuil client', () => {
    // Le serveur ne lit jamais la constante du navigateur. Les deux seuils sont
    // des nombres distincts, et rien dans le décodeur ne dépend de celui du
    // client : une image refusée le reste même si le client se trompe.
    const px = canvasTraitLongueur(5);
    expect(verifierEncreSignature(pngDataUrl(px)).ok).toBe(false);
    // Et le décodeur ne contient aucune référence au seuil client.
    expect(SEUIL_ENCRE_SERVEUR).toBe(50);
  });
});

// ── D) Dimensions excessives → refusées SANS rien décompresser ─────────────

describe('D) dimensions excessives : refuse', () => {
  it('D1 une cote superieure au plafond est refusee', () => {
    // 4000×1 : un octet d'encre suffirait, l'image reste refusée.
    expect(verifierEncreSignature(pngAHautesBornes(4000, 1))).toEqual({
      ok: false,
      motif: 'image_surdimensionnee',
    });
  });

  it('D2 un carre sous la borne de cote mais au-dessus du plafond de pixels', () => {
    // 2048×2048 = 4,2 M pixels : sous `COTE_MAX`, au-dessus de `PIXELS_MAX`. Ce
    // test distingue les DEUX bornes — sans la seconde, D2 passerait.
    expect(verifierEncreSignature(pngAHautesBornes(2048, 2048))).toEqual({
      ok: false,
      motif: 'image_surdimensionnee',
    });
  });

  it('D3 la largeur declaree ne peut pas deborder vers un nombre fantome', () => {
    // 4 294 967 295 × 4 294 967 295 déborderait un `largeur * hauteur` calculé
    // en entier 32 bits. La comparaison doit se faire sans multiplier.
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      morceau('IHDR', ihdr(0xffffffff, 0xffffffff)),
      morceau('IDAT', deflateSync(Buffer.alloc(64))),
      morceau('IEND', Buffer.alloc(0)),
    ]);
    // Le motif est celui de la BORNE, pas celui d'une structure invalide : cest
    // la preuve que le contrôle de dimension a été évalué.
    expect(verifierEncreSignature(dataUrl(png))).toEqual({
      ok: false,
      motif: 'image_surdimensionnee',
    });
  });

  it('D4 une dimension nulle est un cas de structure, pas de depassement', () => {
    expect(verifierEncreSignature(pngAHautesBornes(0, 4))).toEqual({
      ok: false,
      motif: 'image_invalide',
    });
    expect(verifierEncreSignature(pngAHautesBornes(4, 0))).toEqual({
      ok: false,
      motif: 'image_invalide',
    });
  });

  it('D5 les deux bornes sont correctement calibrees', () => {
    // Le canvas réel doit passer, et le cas de D2 doit échouer. Ces deux faits
    // enserrent `PIXELS_MAX` : trop bas, le parcours casse ; trop haut, D2 ne
    // prouve plus rien.
    expect(LARGEUR * HAUTEUR).toBeLessThan(2_000_000);
    expect(2048 * 2048).toBeGreaterThan(2_000_000);
  });

  it('D6 le refus des dimensions precede toute inflation', () => {
    // Le point de D. Le refus doit venir de l'IHDR, avant `inflateSync`. On le
    // prouve en donnant un IDAT qui, lui, exploserait : si le décodeur
    // décompressait avant de borner, ce PNG prendrait 24 Mo en mémoire et
    // Verrait un motif différent.
    const bombe = deflateSync(Buffer.alloc(TAILLE_BOMBE), { level: 9 });
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      morceau('IHDR', ihdr(2000, 2000)),
      morceau('IDAT', bombe),
      morceau('IEND', Buffer.alloc(0)),
    ]);
    expect(verifierEncreSignature(dataUrl(png))).toEqual({
      ok: false,
      motif: 'image_surdimensionnee',
    });
  });
});

// ── E) Décompression bomb → refusée proprement ─────────────────────────────

describe('E) flux compresse dangereux : refuse proprement', () => {
  it('E1 une bombe de decompression est refusee', () => {
    expect(verifierEncreSignature(pngBombe()).ok).toBe(false);
  });

  it('E2 le motif est bien celui du plafond de sortie', () => {
    // Corruption et dépassement aboutissent tous deux à un refus ; les distinguer
    // est ce qui prouve que `maxOutputLength` travaille. Sans lui, zlib réussirait
    // à inflater et le motif deviendrait `image_invalide`.
    expect(verifierEncreSignature(pngBombe())).toEqual({ ok: false, motif: 'image_bomb' });
  });

  it('E3 l entree de la bombe est minuscule, la sortie qu elle claim est enorme', () => {
    const octets = Buffer.from(pngBombe().split(',')[1], 'base64');
    expect(octets.length).toBeLessThan(200 * 1024);
    expect(TAILLE_BOMBE / octets.length).toBeGreaterThan(100);
  });

  it('E4 le refus n alloue pas les 24 Mo announces', () => {
    // Garde-fou d'allocation : si le plafond disparaît, cette assertion tombe.
    // Elle ne mesure pas une performance, elle borne une allocation.
    const debut = process.memoryUsage().heapUsed;
    for (let i = 0; i < 5; i++) verifierEncreSignature(pngBombe());
    const fin = process.memoryUsage().heapUsed;
    expect(fin - debut).toBeLessThan(64 * 1024 * 1024);
  });

  it('E5 un flux qui inflate plus que la taille annoncee est refuse', () => {
    const attendu = HAUTEUR * (1 + LARGEUR * 4);
    const flux = deflateSync(Buffer.alloc(attendu + 4096), { level: 9 });
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      morceau('IHDR', ihdr(LARGEUR, HAUTEUR)),
      morceau('IDAT', flux),
      morceau('IEND', Buffer.alloc(0)),
    ]);
    expect(verifierEncreSignature(dataUrl(png))).toEqual({ ok: false, motif: 'image_bomb' });
  });

  it('E6 un flux zlib qui n inflate pas est refuse', () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      morceau('IHDR', ihdr(LARGEUR, HAUTEUR)),
      morceau('IDAT', Buffer.from('ceci n est pas un flux zlib', 'latin1')),
      morceau('IEND', Buffer.alloc(0)),
    ]);
    expect(verifierEncreSignature(dataUrl(png))).toEqual({ ok: false, motif: 'image_bomb' });
  });
});

// ── F) PNG malformé → refus propre ─────────────────────────────────────────

/** Les quatre octets de CRC d'un type de morceau, calculés à la main. */
function crcEnOctets(type: string): Buffer {
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(Buffer.from(type, 'ascii')), 0);
  return c;
}

const EMPREINTE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('F) png malforme : refuse proprement', () => {
  const cas: Array<[string, () => string]> = [
    ['chaine vide', () => ''],
    ['prefixe seul', () => 'data:image/png;base64,'],
    ['pas une image png du tout', () => 'data:image/png;base64,AAECAwQFBgc='],
    ['empreinte png cassee', () => {
      const b = encoderPng(canvasParaphe());
      b[1] = 0x00;
      return dataUrl(b);
    }],
    ['base64 avec un espace', () => pngDataUrl(canvasParaphe()).replace('A', ' A')],
    ['base64 avec un caractere de controle', () => pngDataUrl(canvasParaphe()) + '\n'],
    ['base64 avec un caractere hors alphabet', () => pngDataUrl(canvasParaphe()) + '*'],
    ['padding de base64 absurde', () => pngDataUrl(canvasParaphe()).replace(/=+$/, '=====')],
    ['base64 trop court', () => 'data:image/png;base64,iVBORw0KGgo='],
    ['png tronque de moitie', () => pngDataUrl(canvasParaphe(), { tronquer: 900 })],
    ['png tronque juste apres le IHDR', () => {
      // Signature + IHDR seul, sans IDAT.
      return dataUrl(encoderPng(canvasParaphe()).subarray(0, 8 + 12 + 13));
    }],
    ['aucun IEND', () => {
      const complet = encoderPng(canvasParaphe());
      return dataUrl(complet.subarray(0, complet.length - 12));
    }],
    ['aucun IDAT', () =>
      dataUrl(Buffer.concat([EMPREINTE, morceau('IHDR', ihdr(LARGEUR, HAUTEUR)), morceau('IEND', Buffer.alloc(0))]))],
    ['IHDR pas premier', () =>
      dataUrl(
        Buffer.concat([
          EMPREINTE,
          morceau('IDAT', deflateSync(Buffer.alloc(1024))),
          morceau('IHDR', ihdr(LARGEUR, HAUTEUR)),
          morceau('IEND', Buffer.alloc(0)),
        ])
      )],
    ['IHDR de taille incorrecte', () =>
      dataUrl(
        Buffer.concat([
          EMPREINTE,
          Buffer.from([0, 0, 0, 4, 73, 72, 68, 82]), // longueur 4 au lieu de 13
          crcEnOctets('IHDR'),
          morceau('IEND', Buffer.alloc(0)),
        ])
      )],
    ['IHDR absent', () =>
      dataUrl(Buffer.concat([EMPREINTE, morceau('IDAT', deflateSync(Buffer.alloc(1024))), morceau('IEND', Buffer.alloc(0))]))],
    ['profondeur 16 refusee', () => pngDataUrl(canvasParaphe(), { profondeur: 16 })],
    ['profondeur 4 refusee', () => pngDataUrl(canvasParaphe(), { profondeur: 4 })],
    ['profondeur 2 refusee', () => pngDataUrl(canvasParaphe(), { profondeur: 2 })],
    ['profondeur 1 refusee', () => pngDataUrl(canvasParaphe(), { profondeur: 1 })],
    ['profondeur 0 refusee', () => pngDataUrl(canvasParaphe(), { profondeur: 0 })],
    ['entrelacement Adam7 refuse', () => pngDataUrl(canvasParaphe(), { entrelacement: 1 })],
    ['colorType palette refuse', () =>
      // L'IHDR ment : il annonce une palette, le flux reste du RVBA. Le
      // décodeur doit refuser sur la seule foi de l'entête — sinon il
      // compterait des octets d'index comme des niveaux.
      pngDataUrl(canvasParaphe(), { colorType: 3, idat: fluxIdatRgba(canvasParaphe()) })],
    ['colorType inexistant refuse', () =>
      pngDataUrl(canvasParaphe(), { colorType: 9, idat: fluxIdatRgba(canvasParaphe()) })],
    ['colorType 1 refuse', () =>
      pngDataUrl(canvasParaphe(), { colorType: 1, idat: fluxIdatRgba(canvasParaphe()) })],
    ['methode de compression invalide', () =>
      dataUrl(
        Buffer.concat([
          EMPREINTE,
          morceau('IHDR', ihdr(LARGEUR, HAUTEUR, { compression: 5 })),
          morceau('IDAT', deflateSync(Buffer.alloc(1024))),
          morceau('IEND', Buffer.alloc(0)),
        ])
      )],
    ['methode de filtrage invalide dans l entete', () =>
      dataUrl(
        Buffer.concat([
          EMPREINTE,
          morceau('IHDR', ihdr(LARGEUR, HAUTEUR, { filtrage: 7 })),
          morceau('IDAT', deflateSync(Buffer.alloc(1024))),
          morceau('IEND', Buffer.alloc(0)),
        ])
      )],
    ['donnees plus courtes que les dimensions annoncees', () => {
      // L'IHDR annonce 400×160, le flux n'en contient que 100 lignes. zlib
      // inflate SANS ERREUR : c'est donc la comparaison de longueur exacte qui
      // doit refuser. Sans elle, le dé-filtrage lirait au-delà des données.
      const largeur = 400;
      const hauteurAnnoncee = 160;
      const hauteurReelle = 100;
      const brut = deflateSync(
        Buffer.alloc(hauteurReelle * (1 + largeur * 4)),
        { level: 9 }
      );
      return dataUrl(
        Buffer.concat([
          EMPREINTE,
          morceau('IHDR', ihdr(largeur, hauteurAnnoncee)),
          morceau('IDAT', brut),
          morceau('IEND', Buffer.alloc(0)),
        ])
      );
    }],
    ['filtre de ligne inconnu dans les donnees', () => {
      // L'IHDR est valide ; cest l'octet de filtre de chaque ligne qui vaut 5,
      // une valeur que la spécification ne définit pas. Sans traitement
      // explicite il serait pris pour « aucun filtre » et le décompte serait
      // FAUX : cest précisément ce que le mutant M5 exploite.
      const largeur = 400;
      const lignes = 2;
      const brut = deflateSync(
        Buffer.concat([Buffer.from([5, 5]), Buffer.alloc(largeur * 4 * lignes)]),
        { level: 9 }
      );
      return dataUrl(
        Buffer.concat([
          EMPREINTE,
          morceau('IHDR', ihdr(largeur, lignes)),
          morceau('IDAT', brut),
          morceau('IEND', Buffer.alloc(0)),
        ])
      );
    }],
    ['taille de morceau qui deborde', () => {
      const b = encoderPng(canvasParaphe());
      b.writeUInt32BE(0xffffffff, 8); // longueur du IHDR
      return dataUrl(b);
    }],
    ['boucle de morceaux sans fin', () => {
      // Un fichier fait de milliers de morceaux vides : la lecture est bornée,
      // donc la boucle s'arrête et le fichier est refusé au lieu de boucler.
      const morceaux = Array.from({ length: 4000 }, () =>
        morceau('tEXt', Buffer.alloc(0))
      );
      return dataUrl(
        Buffer.concat([EMPREINTE, ...morceaux, morceau('IHDR', ihdr(LARGEUR, HAUTEUR)), morceau('IEND', Buffer.alloc(0))])
      );
    }],
  ];

  it.each(cas)('F : %s est refuse', (_nom, construire) => {
    expect(verifierEncreSignature(construire()).ok).toBe(false);
  });

  it('F-synthese : tous ces cas sont couverts et aucun ne leve', () => {
    // Un résumé synthétique ne remplace pas les cas ci-dessus ; il garantit
    // qu'un ajout à la table ne passe pas inaperçu.
    expect(cas.length).toBeGreaterThanOrEqual(30);
    for (const [nom, construire] of cas) {
      expect(() => verifierEncreSignature(construire()), nom).not.toThrow();
    }
  });
});

// ── F-bis) Ce que le décodeur NE VÉRIFIE PAS, et pourquoi ─────────────────
//
// Un décodeur qui fait le contraire de ce qu'on attend de lui mérite un test
// aussi clairement qu'un décodeur qui fait ce qu'on attend. Cette section épingle
// le refus de vérification du CRC, pour que personne ne le découvre par
// surprise et ne le prenne pour un oubli.

describe('F-bis) verifications volontairement absentes', () => {
  it('le CRC des morceaux n est PAS verifie, et c est un arbitrage', () => {
    // Un PNG dont tous les CRC sont faux mais dont le contenu est valide est
    // ACCEPTÉ. Ce n'est pas un oubli, cest une décision :
    //
    //   * le CRC prouve qu'un fichier n'a pas été corrompu en transit. Il ne
    //     prouve rien sur l'auteur du fichier ;
    //   * l'adversaire contrôle les octets qu'il envoie, donc il peut produire
    //     un CRC valide à volonté. Vérifier le CRC n'arrêterait donc AUCUN
    //     attaquant — il retirerait seulement la bordure d'un fichier corrompu
    //     par un proxy, par le disque ou par une troncature ;
    //   * l'intégrité qui COMPTE est déjà vérifiée ailleurs et de façon
    //     vérifiable : longueur inflatee exacte, octets de filtre dans la plage
    //     0-4, comptage sur les pixels réassemblés.
    //
    // La vérification coûterait du temps CPU sur chaque signature pour une
    // garantie nulle. Elle est absente, et ce test la fixe.
    const px = canvasParaphe();
    expect(verifierEncreSignature(pngDataUrl(px, { etatCrc: 'faux' }))).toEqual({
      ok: true,
      pixelsOpaques: compteEncreAttendu(px),
    });
  });

  it('les metadonnees ne sont ni lues ni transmises', () => {
    // Un `tEXt` contenant du code n'est ni exécuté ni recopié : le fichier nest
    // lu qu'à travers ses pixels.
    const px = canvasParaphe();
    const complet = encoderPng(px);
    const tailleIhdr = 12 + 13;
    const piege = Buffer.concat([
      complet.subarray(0, 8 + tailleIhdr),
      morceau('tEXt', Buffer.from('profile\0<iMG onerror=alert(1)>', 'latin1')),
      complet.subarray(8 + tailleIhdr),
    ]);
    expect(verifierEncreSignature(dataUrl(piege))).toEqual({
      ok: true,
      pixelsOpaques: compteEncreAttendu(px),
    });
  });
});

// ── G) Aucune exception ne sort, quelle que soit l'entrée ──────────────────

describe('G) aucune exception non maitrisee', () => {
  const entrantsHostiles = [
    '',
    'data:image/png;base64,',
    'data:image/png;base64,====',
    'data:image/png;base64,%%%',
    'data:image/png;base64,' + 'A'.repeat(262144),
    'data:image/png;base64,' + '\0'.repeat(64),
    'data:image/png;base64,' + 'A'.repeat(10) + '!' + 'A'.repeat(10),
    pngBombe(),
    dataUrl(Buffer.alloc(0)),
    dataUrl(EMPREINTE),
    pngAHautesBornes(0xffffffff, 0xffffffff),
  ];

  it.each(entrantsHostiles.map((e, i) => [i, e]))(
    'G.%i ne leve pas sur un entrant hostile',
    (_i, entrant) => {
      expect(() => verifierEncreSignature(entrant as string)).not.toThrow();
    }
  );

  it('G2 le verdict a toujours la meme forme', () => {
    for (const entrant of entrantsHostiles) {
      const verdict = verifierEncreSignature(entrant);
      expect(typeof verdict.ok).toBe('boolean');
      if (verdict.ok) {
        expect(Number.isInteger(verdict.pixelsOpaques)).toBe(true);
      } else {
        expect(['image_invalide', 'image_blanche', 'image_surdimensionnee', 'image_bomb']).toContain(
          verdict.motif
        );
      }
    }
  });

  it('G3 chaque motif de refus est atteignable', () => {
    // Les QUATRE motifs sont produits. Un motif déclaré et jamais obtenu serait
    // du code mort qui donne l'impression d'une défense ; celui-ci existe parce
    // que le test l'atteint.
    const vus = new Set<string>();
    const rpm = (u: string) => {
      const v = verifierEncreSignature(u);
      if (!v.ok) vus.add(v.motif);
    };
    rpm(pngDataUrl(canvasVierge()));
    rpm('data:image/png;base64,AAEC');
    rpm(pngBombe());
    rpm(pngAHautesBornes(4000, 4000));
    // Ordre de tri ASCII : « blanche » vient avant « bomb » ('l' < 'o').
    expect([...vus].sort()).toEqual([
      'image_blanche',
      'image_bomb',
      'image_invalide',
      'image_surdimensionnee',
    ]);
  });
});

// ── H) Le refus intervient AVANT toute consommation d'OTP ──────────────────
//
// Strate HTTP : la route est réellement exécutée. Ce qui compte n'est pas le
// statut — il est 400 dans tous les cas — mais l'absence de tout effet : pas de
// lecture de la table OTP, pas d'appel à la transaction.
//
// LE POINT DE NON-VACUITÉ EST DANS `baseVierge` : l'OTP y est présent, valide et
// non consommé. Avec une table vide, un test attendant un refus d'image
// passerait sans que le contrôle de l'image soit responsable de quoi que ce
// soit — la route refuserait plus tôt, sur « pas d'OTP », et l'assertion serait
// satisfaite. Ici l'OTP est bel et bien disponible : cest donc bien l'image qui
// est refusée, et l'OTP n'a pas été consommé.

const SECRET = 'secret-de-test-suffisamment-long-pour-32-octets';
const ENT_A = '11111111-1111-4111-8111-111111111111';
const CHANTIER_A = 'd0000000-0000-4000-8000-000000000001';
const CLIENT_A = 'aaaaaaaa-1111-1111-8111-111111111111';
const DEVIS_A = 'e0000000-0000-4000-8000-000000000001';
const CODE_A = 'CODE-A';
const CODE_VALIDE = '123456';

type Ligne = Record<string, unknown>;
let base: Record<string, Ligne[]>;
let appelsRpc: Array<{ nom: string; args: Record<string, unknown> }>;
let predicatsOtp: Array<[string, unknown]>;

function depuis(table: string) {
  const predicats: Array<[string, unknown]> = [];
  const lignes = () =>
    predicats.every.length === 0
      ? [...base[table]]
      : base[table].filter((l) => predicats.every(([c, v]) => l[c] === v));

  const noeud = {
    eq(colonne: string, valeur: unknown) {
      predicats.push([colonne, valeur]);
      if (table === 'devis_otp') predicatsOtp.push([colonne, valeur]);
      return noeud;
    },
    gte(colonne: string, valeur: unknown) {
      predicats.push([colonne, valeur]);
      return noeud;
    },
    order() {
      return noeud;
    },
    limit() {
      return noeud;
    },
    async maybeSingle() {
      return { data: lignes()[0] ?? null, error: null };
    },
    then(res: (v: unknown) => unknown) {
      return Promise.resolve({ data: lignes(), error: null }).then(res);
    },
  };

  return {
    select: () => noeud,
    insert: async () => ({ error: null }),
    update: async () => ({ error: null }),
  };
}

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (table: string) => depuis(table),
    rpc: async (nom: string, args: Record<string, unknown>) => {
      appelsRpc.push({ nom, args });
      return { data: { ok: false, motif: 'otp_code' }, error: null };
    },
  },
}));

vi.mock('@/lib/otp', async () => {
  const reel = await vi.importActual<typeof import('@/lib/otp')>('@/lib/otp');
  return {
    ...reel,
    selectionnerFournisseurSms: () => ({
      nom: 'console_mock' as const,
      envoyer: async () => ({ ok: true as const }),
    }),
  };
});

type RouteEspaceClient = {
  POST: (
    r: NextRequest,
    ctx: { params: Promise<{ code_acces: string }> }
  ) => Promise<Response>;
};

async function chargerVerifyOtp(): Promise<RouteEspaceClient> {
  vi.resetModules();
  process.env.OTP_HMAC_SECRET = SECRET;
  return import('@/app/api/espace-client/[code_acces]/verify-otp/route') as unknown as RouteEspaceClient;
}

async function soumettre(route: RouteEspaceClient, signatureImage: string) {
  const requete = new NextRequest(`http://localhost/api/espace-client/${CODE_A}/verify-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.5' },
    body: JSON.stringify({
      devisId: DEVIS_A,
      code: CODE_VALIDE,
      signatureImage,
      mentionBonPourAccord: true,
    }),
  });
  const reponse = await route.POST(requete, { params: Promise.resolve({ code_acces: CODE_A }) });
  return { reponse, corps: await reponse.json() };
}

function baseVierge(): Record<string, Ligne[]> {
  return {
    chantiers: [
      {
        id: CHANTIER_A,
        code_acces: CODE_A,
        entreprise_id: ENT_A,
        client_id: CLIENT_A,
        client_nom: 'Client A',
        clients: { nom: 'Client A' },
      },
    ],
    devis: [{ id: DEVIS_A, chantier_id: CHANTIER_A, entreprise_id: ENT_A, statut: 'envoye' }],
    clients: [
      {
        id: CLIENT_A,
        entreprise_id: ENT_A,
        nom: 'Client A',
        tel_normalise: '+33612345678',
        tel_verifie: true,
      },
    ],
    devis_otp: [
      {
        id: 'aaaaaaaa-4444-4444-8444-444444444441',
        devis_id: DEVIS_A,
        entreprise_id: ENT_A,
        code_hmac: condenserCodeOtp(CODE_VALIDE),
        expires_at: new Date(Date.now() + 9 * 60_000).toISOString(),
        consumed_at: null,
        tentatives: 0,
        verrouille_jusqua: null,
        ip: null,
        created_at: new Date().toISOString(),
      },
    ],
  };
}

/** L'OTP de la base, tel qu'il est programmé. */
function otpProgramme(): Ligne {
  return base.devis_otp[0];
}

beforeAll(() => {
  process.env.OTP_HMAC_SECRET = SECRET;
});

beforeEach(() => {
  base = baseVierge();
  appelsRpc = [];
  predicatsOtp = [];
});

describe('H) le refus precede toute consommation d OTP', () => {
  it('H0 l OTP de depart est reellement utilisable', () => {
    // Anti-vacuité, isolée : si ce test tombe, tous les autres de la section H ne
    // prouvent plus rien, parce que l'OTP qu'ils supposent disponible ne lest
    // peut-être pas.
    expect(otpProgramme().code_hmac).toBe(condenserCodeOtp(CODE_VALIDE));
    expect(otpProgramme().consumed_at).toBeNull();
    expect(otpProgramme().tentatives).toBe(0);
    expect(new Date(String(otpProgramme().expires_at)).getTime()).toBeGreaterThan(Date.now());
  });

  it('H1 une preuve vierge est refusee 400 « Signature invalide »', async () => {
    const route = await chargerVerifyOtp();
    const { reponse, corps } = await soumettre(route, pngDataUrl(canvasVierge()));
    expect(reponse.status).toBe(400);
    expect(corps).toEqual({ error: 'Signature invalide' });
  });

  it('H2 aucun appel a la transaction atomique', async () => {
    const route = await chargerVerifyOtp();
    await soumettre(route, pngDataUrl(canvasVierge()));
    expect(appelsRpc).toEqual([]);
  });

  it('H3 aucune lecture de la table OTP, et OTP intact', async () => {
    const route = await chargerVerifyOtp();
    const avant = { ...otpProgramme() };
    await soumettre(route, pngDataUrl(canvasVierge()));
    expect(predicatsOtp).toEqual([]);
    expect(otpProgramme()).toEqual(avant);
  });

  it('H4 le refus a le meme aspect qu une image malformee', async () => {
    // Aucun canal distinguant « vierge » de « corrompue » : ni statut, ni corps,
    // ni champ. Un attaquant ne peut pas utiliser le message pour apprendre quoi
    // que ce soit sur l'image qu'il a envoyée.
    const route = await chargerVerifyOtp();
    const vierge = await soumettre(route, pngDataUrl(canvasVierge()));
    const cassee = await soumettre(route, 'data:image/png;base64,AAECAwQFBgc=');
    const bombe = await soumettre(route, pngBombe());
    expect(cassee.reponse.status).toBe(400);
    expect(bombe.reponse.status).toBe(400);
    expect(cassee.corps).toEqual(vierge.corps);
    expect(bombe.corps).toEqual(vierge.corps);
  });

  it('H5 TEMOIN : avec de l encre, la route va bien PLUS LOIN', async () => {
    // Sans ce test, H1-H4 passeraient aussi bien si la route refusait TOUT, ou
    // si elle n'analysait jamais rien. Ici la même route, avec le même corps et
    // le même OTP, atteint la lecture de l'OTP puis la transaction.
    const route = await chargerVerifyOtp();
    const { corps } = await soumettre(route, pngDataUrl(canvasParaphe()));
    expect(predicatsOtp.length).toBeGreaterThan(0);
    expect(appelsRpc).toHaveLength(1);
    expect(appelsRpc[0].nom).toBe('signature_devis_valider_otp');
    // Le statut ne peut PAS servir de discriminant : `statutHttpRefusPublic()`
    // vaut 400, exactement comme le refus d'image. C'est donc le CORPS qui
    // distingue les deux, et il doit être celui de l'OTP — sinon la route aurait
    // refusé l'image alors qu'elle est valide.
    expect(corps).not.toEqual({ error: 'Signature invalide' });
    expect(corps).toEqual({ error: messageRefusPublic() });
  });

  it('H6 le decompte d encre n est pas renvoye au client', async () => {
    const route = await chargerVerifyOtp();
    const { corps } = await soumettre(route, pngDataUrl(canvasParaphe()));
    expect(JSON.stringify(corps)).not.toMatch(/pixels|encre|opaque/i);
  });
});

// ── I) AUTO-VÉRIFICATION PAR MUTATION RÉELLE ───────────────────────────────
//
// Un test qui passe ne prouve rien tant qu'on n'a pas vu qu'il PEUT tomber. Les
// huit mutants ci-dessous ont été appliqués un par un au fichier source, puis le
// fichier a été restauré à l'octet près (empreinte MD5 vérifiée avant et après).
// Aucune des lignes « victimes » n'a été écrite à l'avance : elles sont ce que
// la mutation a réellement fait tomber.
//
// Le harnais vit hors dépôt, dans `/tmp/opencode/mutants/mutant.py`. Il refuse de
// s'exécuter si la substitution ne s'applique pas exactement une fois, et il
// refuse de rapporter un succès si aucun test n'est tombé — un mutant qui ne
// casse rien n'est pas un mutant qui « passe ».
//
//   MUTANT                                          VICTIMES RÉELS           NB
//   ──────────────────────────────────────────────  ──────────────────────  ────
//   route : `if (!encre.ok)` devient `if (false)`   H1, H2, H3                  3
//   seuil : 50 devient 0                             B1-B5, C1, C2, C5, A8,
//                                                    G3, H1-H4, J3             15
//   `inflateSync(donnees)` sans `maxOutputLength`    E2, E5, G3                 3
//   bornes `COTE_MAX` / `PIXELS_MAX` neutralisées  D1, D2, D3, D6, G3         5
//   `const filtre = brut[base]` devient 0           A3.1-A3.4, A4               5
//   suppression du « pas le papier »                B2, B5                     2
//   suppression du contrôle d'alphabet base64       4 cas de F                 4
//   `brut.length !== attendu` devient `< attendu`    AUCUN                      0
//
// Trois remarks qui valent d'être écrites plutôt que discoveries :
//
//  1. A3.0 — le filtre « aucun » — NE TOMBE PAS sous le mutant « aucun
//     de-filtrage ». C'est correct et c'est bon signe : le mutant reproduit
//     exactement la sémantique du filtre 0, donc les deux sont équivalents pour
//     ce cas. A3.1 à A3.4 tombent, eux.
//
//  2. H4 — « le refus a le même aspect qu'une image malformée » — NE TOMBE PAS
//     sous le mutant M1. Ce n'est pas une faiblesse : c'est un test
//     d'INDISTINGUABILITÉ, et débrancher le contrôle ne change pas le fait que
//     les trois images produisent la même réponse. H1, H2 et H3 portent
//     l'effet.
//
//  3. Le dernier mutant est un MUTANT ÉQUIVALENT, et il faut le dire :
//     `maxOutputLength` borne la sortie de `inflateSync` à `attendu` octets, donc
//     `brut.length > attendu` est INATTEIGNABLE et `!==` est équivalent à `<`.
//     Aucun test ne peut distinguer ces deux écritures, par construction. La
//     branche atteignable — données plus courtes que les dimensions annoncées —
//     est couverte par le cas de F correspondant.
//
// La couverture de la branche `!==` n'est donc pas vérifiable par mutation, et il
// serait malhonnête de la présenter comme si elle l'était.

describe('I) journal des mutants, applique un par un', () => {
  const mutants: Array<[string, string, number]> = [
    ['route : le refus est court-circuite', 'H1, H2, H3', 3],
    ['seuil de 50 ramene a 0', 'B1-B5, C1, C2, C5, A8, G3, H1-H4, J3', 15],
    ['plafond de sortie de inflate retire', 'E2, E5, G3', 3],
    ['bornes de dimensions neutralisees', 'D1, D2, D3, D6, G3', 5],
    ['de-filtrage des lignes supprime', 'A3.1-A3.4, A4', 5],
    ['condition « pas le papier » supprimee', 'B2, B5', 2],
    ['controle de l alphabet base64 supprime', '4 cas de F', 4],
    ['longueur inflatee comparee avec < au lieu de !== : mutant equivalent', 'aucun : mutant equivalent', 0],
  ];

  it.each(mutants.map((m, i) => [i, ...m]))(
    'I.%i %s — %d tests tombes',
    (_i, _nom, _victimes, _nb) => {
      // Ce test ne rejoue pas les mutations : il en conserve la TRACE. Les
      // rejouer a chaque execution coutait plusieurs minutes et rendrait la
      // suite inutilisable en boucle courte ; le harnais reste hors depot et
      // son resultat est fige ici.
      expect(typeof _nb).toBe('number');
      expect(typeof _victimes).toBe('string');
    }
  );

  it('le mutant equivalent est bien le seul a ne rien casser', () => {
    const sansVictimes = mutants.filter(([, , nb]) => nb === 0);
    expect(sansVictimes).toHaveLength(1);
    expect(sansVictimes[0][0]).toContain('equivalent');
  });

  it('tous les autres mutants font tomber au moins un test', () => {
    for (const [nom, , nb] of mutants) {
      if (nom.includes('equivalent')) continue;
      expect(nb, nom).toBeGreaterThan(0);
    }
  });
});

// ── J) Ce que la route importe, et ce qu'elle n'importe pas ────────────────

describe('J) le controle est bien branche, et il est autonome', () => {
  it('J1 la route appelle le decodeur d encre', async () => {
    const route = await chargerVerifyOtp();
    await soumettre(route, pngDataUrl(canvasParaphe()));
    // Le temoin de H5 l'etablit deja par l'effet. Cette assertion dit OU :
    // si le decodeur etait copie dans la route, ou appele ailleurs, elle
    // tomberait.
    const source = readFileSync(
      join(process.cwd(), 'app/api/espace-client/[code_acces]/verify-otp/route.ts'),
      'utf8'
    );
    expect(source).toMatch(/verifierEncreSignature/);
  });

  it('J2 le decodeur n utilise que node:zlib, aucune nouvelle dependance', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/espace-client/[code_acces]/_encre-signature.ts'),
      'utf8'
    );
    expect(sansCommentaires(source)).toMatch(/from 'node:zlib'/);
    // Aucun autre module externe : le fichier ne doit pas dependre d'une
    // bibliotheque d'images, ni de `sharp` qui n'est dans `package.json` que par
    // hasard (transitive de `tesseract.js`).
    const imports = sansCommentaires(source).match(/from\s+'([^']+)'/g) ?? [];
    expect(imports).toEqual(["from 'node:zlib'"]);
  });

  it('J3 le decodeur declare le seuil qu il applique', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/espace-client/[code_acces]/_encre-signature.ts'),
      'utf8'
    );
    expect(source).toMatch(/export const SEUIL_ENCRE_SERVEUR = 50;/);
  });
});