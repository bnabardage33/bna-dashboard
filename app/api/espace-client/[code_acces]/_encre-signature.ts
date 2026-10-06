// app/api/espace-client/[code_acces]/_encre-signature.ts
//
// ─────────────────────────────────────────────────────────────────────────────
// LE CONTRÔLE D'INTÉGRITÉ DE LA PREUVE GRAPHIQUE
// ─────────────────────────────────────────────────────────────────────────────
//
// CE QUE CE CONTRÔLE EST, ET CE QU'IL N'EST PAS
// ───────────────────────────────────────────────
//
// IL EST : une vérification d'INTÉGRITÉ. Il établit que l'image stockée dans la
// preuve n'est pas vide — qu'elle porte effectivement de l'encre. Sans cela, la
// base peut contenir une signature d'un pixel et un `devis.statut = 'signe'`.
//
// IL N'EST PAS : une preuve d'identité humaine, ni une mesure anti-fraude. Un
// signataire déterminé trace un gribouillage de cinquante pixels et passe. Rien
// ici ne dit QUl a signé. Cette garantie est l'OTP — le téléphone du dossier,
// vérifié côté serveur. Le geste n'atteste que l'INTENTION, et c'est déjà
// exactement ce que la mission §4 énonce : une preuve technique et une piste
// d'audit, pas une signature électronique qualifiée.
//
// Ne pas relire ce fichier en cherchant une défense qu'il ne contient pas.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI CÔTÉ SERVEUR, ET PAS SEULEMENT DANS LE NAVIGATEUR
// ─────────────────────────────────────────────────────────────────────────────
//
// `SignatureModal` compare déjà l'opacité du canvas avant d'envoyer. Ce contrôle
// est conservé, tel quel, et garde son rôle : il donne au signataire un retour
// immédiat, sans aller-retour réseau. Ce qu'il ne peut pas faire, c'est
// protégé : il s'exécute dans le navigateur, donc il suffit d'un POST direct pour le contourner.
//
// Les deux seuils sont INDÉPENDANTS et c'est délibéré :
//
//   * le seuil client (120) est un guidage d'interface ;
//   * le seuil serveur (50) est un garde-fou d'intégrité.
//
// Ils ne sont pas identiques, et ce n'est pas un oubli — voir le choix du seuil
// plus bas. Le serveur ne lit JAMAIS la valeur du client : il redécode l'image
// reçue et recompte les pixels.
//
// ─────────────────────────────────────────────────────────────────────────────
// LE PIÈGE : LA DÉCOMPRESSION BOMB
// ─────────────────────────────────────────────────────────────────────────────
//
// C'est le risque réel de cette fonctionnalité, et il est inverse de celui qu'on
// attend. Le coût CPU d'un décodage honnête est de quelques millisecondes. Le
// danger, c'est une charge utile minuscule qui force une allocation énorme.
//
// Mesuré sur cette machine (Node 22) : `zlib.deflate` réduit 196 608 octets
// identiques à 214 octets — un facteur 919. La borne de taille que la route
// applique déjà à la chaîne base64 (262 144 caractères) borne donc le flux
// COMPRESSÉ, pas ce que `inflateSync` produira. Sans plafond explicite, un POST
// de quelques kilo-octets suffit à faire allouer plusieurs centaines de
// mégaoctets par requête.
//
// Les quatre lignes de garde ci-dessous sont donc la partie non négociable de
// ce fichier, et elles précèdent TOUTE inflation.
//
// ─────────────────────────────────────────────────────────────────────────────
// LE SEUIL : 50, ET POURQUOI PAS 120
// ─────────────────────────────────────────────────────────────────────────────
//
// Mesuré sur des tracés de référence (400×160, épaisseur ~2,5 px, bord
// antialiasé comme le fait un navigateur) ; le décompte porte sur les pixels
// dont le canal alpha vaut `> 0`, donc il inclut le halo d'antialiasage :
//
//     canvas vierge .........................   0 px
//     un point isolé (clic) ...............  14 px
//     un trait de 5 px .....................  24 px
//     un trait de 20 px ....................  69 px
//     une lettre « A » ..................... 326 px
//     un paraphe réaliste (7 traits) ....... 1744 px
//     une signature pleine page ............ 1996 px
//
// L'instruction est un seuil plus bas que 120, dans la plage 40–60, choisi sur
// une justification technique. Sur ces mesures :
//
//   * 120 refuse le trait de 20 px (69 px) alors qu'il est plus long qu'une
//     signature entière l'était pour un paraphe. Un seuil élevé dégrade ici un
//     contrôle d'INTÉGRITÉ en contrôle de QUALITÉ — c'est-à-dire exactement le
//     travers que la mission a déjà refusé pour `SEUIL_ENCRE` côté client ;
//   * 30 et 40 ne séparent rien de plus que 60 : tous rejettent le trait de
//     5 px (24) et acceptent le trait de 20 px (69). On est dans un PLAT.
//
// Dans un plateau, le bon choix est celui qui maximise la marge au MOINS grand
// des deux côtés — celui qui est le plus loin possible d'un changement
// d'antialiasage entre navigateurs ou entre appareils :
//
//     40 px : distance au seuil discriminant le plus proche = 16
//     50 px : distance au seuil discriminant le plus proche = 19   <-- retenu
//     60 px : distance au seuil discriminant le plus proche =  9
//
// 50 est donc le point le plus robuste du plateau, et il refuse toute marque en
// dessous d'environ quinze pixels de trait visible. Ce qui reste refusé est un
// clic isolé : ce n'est pas une signature, et le message « Signature
// invalide » est le bon message.
//
// AUCUNE NOUVELLE DÉPENDANCE. `node:zlib` est un module natif. `sharp` est
// présent dans `node_modules`, mais il n'est pas déclaré dans `package.json` :
// c'est une transitive de `tesseract.js`, et s'y fier serait fragile.

import { inflateSync } from 'node:zlib';

// ─────────────────────────────────────────────────────────────────────────────
// BORNES
// ─────────────────────────────────────────────────────────────────────────────

/** Seuil d'opacité, en pixels, pour qu'une preuve graphique vaille quelque chose. */
export const SEUIL_ENCRE_SERVEUR = 50;

/**
 * Côté maximal d'une dimension.
 *
 * Le canvas du client fait 400×160. Un plafond à 2048 laisse passer une tablette
 * haute résolution et refuse l'abus. Il est volontairement très au-dessus du
 * besoin réel : ce n'est pas un contrôle de qualité, c'est une borne d'allocation.
 */
const COTE_MAX = 2048;

/**
 * Plafond du nombre de pixels.
 *
 * Séparé de `COTE_MAX` parce que les deux bornes n'autorisent pas la même chose :
 * 2048×2048 = 4,2 M pixels, ce qui à 4 octets par pixel ferait 17 Mo par requête.
 * Ce plafond tient la requête sous 8 Mo de pixels quelles que soient les
 * dimensions, donc l'allocation reste prévisible même si les deux bornes
 * tombent.
 */
const PIXELS_MAX = 2_000_000;

/**
 * Plafond de la sortie d'`inflateSync`, en octets.
 *
 * C'est LA borne qui compte. Elle est calculée à partir de l'IHDR — donc après
 * lecture des dimensions et avant toute inflation — et passée à `zlib` qui
 * refuse de dépasser au lieu d'allouer. Sans elle, la borne sur la taille
 * base64 ne protège de rien : elle borne le compressé, pas le décompressé.
 *
 * +1 par ligne : le PNG intercale un octet de filtre devant chaque ligne de
 * pixels, et l'oublier rendrait le calcul faux de `hauteur` octets.
 */
function plafondInflate(largeur: number, hauteur: number, canaux: number): number {
  return hauteur * (1 + largeur * canaux);
}

/** Motifs de refus, tous ramenés au meme refus HTTP par la route. */
export type MotifEncre =
  | 'image_invalide'
  | 'image_blanche'
  | 'image_surdimensionnee'
  | 'image_bomb';

export type VerdictEncre =
  | { ok: true; pixelsOpaques: number }
  | { ok: false; motif: MotifEncre };

const REFUS: Record<MotifEncre, VerdictEncre> = {
  image_invalide: { ok: false, motif: 'image_invalide' },
  image_blanche: { ok: false, motif: 'image_blanche' },
  image_surdimensionnee: { ok: false, motif: 'image_surdimensionnee' },
  image_bomb: { ok: false, motif: 'image_bomb' },
};

// ─────────────────────────────────────────────────────────────────────────────
// DÉCODAGE PNG
// ─────────────────────────────────────────────────────────────────────────────

/** Les huit octets d'empreinte de tout fichier PNG. */
const EMPREINTE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Nombre d'octets par pixel selon le `colorType` de l'IHDR.
 *
 * Le type 3 (palette) en est ABSENT, et c'est délibéré : l'opacité d'une image
 * en palette vient d'une entrée `tRNS` optionnelle qu'il faudrait charger et
 * interpréter, alors que le reste du fichier ne sait pas le faire. Accepter le
 * type 3 en comptant les octets d'index comme des niveaux donnerait un décompte
 * sans rapport avec l'encre — donc un contrôle qui passe pour la mauvaise
 * raison. Il est refusé, pas mal interprété.
 */
const CANAUX_PAR_COLOR_TYPE: Record<number, number> = {
  0: 1, // niveaux de gris
  2: 3, // RVB
  4: 2, // gris + alpha
  6: 4, // RVBA
};

interface EntetePng {
  largeur: number;
  hauteur: number;
  canaux: number;
  /**
   * true quand l'image porte un canal alpha explicite (colorType 4 ou 6).
   *
   * Ce n'est qu'un indicateur de la MANIERE de compter, pas de la décision :
   * les deux branches comptent de l'encre réelle, voir `compterOpaques`.
   */
  alphaExplicite: boolean;
}

/** Échec de lecture : soit la structure est fausse, soit elle est hors borne. */
type EchecLecture = { erreur: MotifEncre };

/** Réussite de lecture : entête et flux compressé, rien n'a encore été décompressé. */
type ReussiteLecture = { entete: EntetePng; donnees: Buffer };

/**
 * Lit l'IHDR et les IDAT, SANS rien décompresser.
 *
 * Tout ce qui décide d'un refus de sécurité se joue ici, sur quelques
 * dizaines d'octets : si cette fonction renvoie une erreur, l'appelant
 * s'arrête.
 *
 * La distinction entre `image_invalide` et `image_surdimensionnee` n'est pas
 * décorative. Les deux produisent le même 400 au client, mais dire lequel a joué
 * permet d'affirmer, dans un test, que c'est la BORNE qui a refusé et pas une
 * autre vérification par hasard — et, en exploitation, de distinguer « PNG
 * corrompu » de « tentative d'allouer 17 Mo ».
 */
function lireEnteteEtDonnees(png: Buffer): ReussiteLecture | EchecLecture {
  const invalide: EchecLecture = { erreur: 'image_invalide' };
  if (png.length < 8 + 12 + 12 + 8) return invalide;
  for (let i = 0; i < EMPREINTE_PNG.length; i++) {
    if (png[i] !== EMPREINTE_PNG[i]) return invalide;
  }

  const parties: Buffer[] = [];
  let entete: EntetePng | null = null;
  let position = 8;
  let vuIend = false;

  // Le nombre de morceaux est BORNE. Un PNG légitime en a quelques dizaines ;
  // une boucle sans limite sur une charge hostile est une seconde faille.
  for (let morceaux = 0; morceaux < 512; morceaux++) {
    if (position + 8 > png.length) return invalide;
    const longueur = png.readUInt32BE(position);
    const type = png.toString('ascii', position + 4, position + 8);
    // `longueur + 12` plutôt que `longueur + 4` : un `longueur` enorme ferait
    // deborder l'addition et passerait le controle de bord. La comparaison est
    // faite sur `position`, donc le decalage de 12 reste sur.
    if (longueur > png.length || position + 12 + longueur > png.length) return invalide;
    const debut = position + 8;

    if (type === 'IHDR') {
      // L'IHDR doit etre le PREMIER morceau, exactement 13 octets.
      if (position !== 8 || longueur !== 13) return invalide;
      const largeur = png.readUInt32BE(debut);
      const hauteur = png.readUInt32BE(debut + 4);
      const profondeur = png[debut + 8];
      const colorType = png[debut + 9];
      const compression = png[debut + 10];
      const filtrage = png[debut + 11];
      const entrelacement = png[debut + 12];

      const canaux = CANAUX_PAR_COLOR_TYPE[colorType];
      // Profondeur 8 uniquement, et uniquement les méthodes 0 de compression et
      // de filtrage : ce sont les seules que ce fichier sait lire. Le deflate de
      // zlib et les cinq filtres de ligne sont les seules choses que fait un
      // canvas ; tout le reste est refuse plutot que devine.
      if (canaux === undefined) return invalide;
      if (profondeur !== 8 || compression !== 0 || filtrage !== 0) return invalide;
      // Adam7 n'est pas implemente. Un navigateur ne l'produit pas pour un
      // `toDataURL`, donc l'accepter sans le decoder serait accepter une image
      // qu'on analyse mal.
      if (entrelacement !== 0) return invalide;
      // Zero, et surtout pas de debordement de `largeur * hauteur`. Les deux
      // bornes sont evaluees AVANT toute multiplication, donc un `largeur` de
      // 4 294 967 295 ne peut pas produire un produit fantome.
      if (largeur === 0 || hauteur === 0) return invalide;
      // Motif DEDIE, et c'est volontaire : ces deux lignes sont les bornes de
      // securite de ce fichier. Leur donner leur propre motif permet aux tests
      // de prouver qu'elles jouent, au lieu de constater qu'un refus est
      // survenu sans savoir lequel.
      if (largeur > COTE_MAX || hauteur > COTE_MAX) return { erreur: 'image_surdimensionnee' };
      if (largeur * hauteur > PIXELS_MAX) return { erreur: 'image_surdimensionnee' };

      entete = {
        largeur,
        hauteur,
        canaux,
        alphaExplicite: colorType === 4 || colorType === 6,
      };
    } else if (type === 'IDAT') {
      // L'IDAT avant l'IHDR est invalide : cela signifie que l'entete n'est pas
      // encore connue et que l'ordre de lecture n'est pas celui de PNG.
      if (!entete) return invalide;
      parties.push(png.subarray(debut, debut + longueur));
    } else if (type === 'IEND') {
      vuIend = true;
      break;
    } else if (type === 'PLTE') {
      // Ignoree : elle n'affecte pas le comptage d'opacite.
    } else {
      // Un morceau inconnu est IGNORE, conformement a la specification PNG.
      // Refuser ici casserait les encodeurs qui ajoutent des metadonnees.
    }

    position = debut + longueur + 4;
  }

  if (!entete || parties.length === 0 || !vuIend) return invalide;
  return { entete, donnees: Buffer.concat(parties) };
}

/**
 * Compte les pixels qui portent de l'encre, et renvoie -1 si un filtre de ligne
 * est inconnu.
 *
 * Le de-filtrage est fait en place sur le tampon inflate, ligne par ligne, en
 * appliquant les cinq filtres que PNG definit. C'est ce qui rend le decompte
 * FIABLE : sans de-filtrage, on lirait des differences de voisins et non des
 * valeurs de pixels — un canvas blanc produit alors un motif chiffre que le
 * decompte compterait comme de l'encre.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LA DÉFINITION D'ENCRE, ET LE TROU QU'ELLE A ÉVITÉ
 * ───────────────────────────────────────────────────────────────────────────
 *
 * La première version de ce fichier comptait `alpha > 0`. C'est faux, et un test
 * l'a montré : un aplat blanc OPAQUE a `alpha = 255` partout, donc 64 000
 * « pixels d'encre » pour une page entièrement blanche. Un attaquant n'avait
 * qu'à envoyer un PNG blanc 400×160 opaque pour franchir le contrôle.
 *
 * Ce n'était pas une|image inutilisable : c'est exactement le PNG qu'un
 * `canvas` peint en blanc produit. Le contrôle doit dire « l'image est vierge »,
 * et il disait le contraire sur la forme de fichier la plus banale qui soit.
 *
 * La définition retenue est donc une CONJONCTION de deux conditions, et chacune
 * écarte un cas différent :
 *
 *   * `alpha > 0` — écarte le fond transparent, qui est ce que `clearRect`
 *     produit et ce que le code de `SignatureModal` laisse autour du tracé ;
 *   * le pixel n'est pas blanc — écarte le fond blanc, c'est-à-dire la page.
 *
 * Un pixel n'est compté que s'il est visible ET qu'il n'est pas le papier. Les
 * trois formes que ces deux conditions couvrent :
 *
 *     canvas intact ....... alpha 0 ............ écarté par la première
 *     page blanche opaque . alpha 255, RVB 255 . écarté par la seconde
 *     tracé ............... alpha > 0, RVB foncé  compté
 *
 * Cette définition suppose une seule chose : que l'encre est plus SOMBRE que le
 * papier. C'est vérifié, pas supposé — `components/SignatureModal.tsx` écrit
 * `ctx.strokeStyle = '#0f172a'`, un bleu-noir. Un stylo blanc serait compté
 * comme une page blanche ; si le design change un jour, ce fichier doit changer
 * avec, et le test A10 le dira.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ET SI L'IMAGE N'A PAS DE CANAL ALPHA ?
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Un encodeur qui retire l'alpha d'un canvas transparent doit le composer sur un
 * fond, et ce fond est blanc : la seconde condition suffit alors, la première
 * n'existe pas. Compter au lieu de refuser evite un piege qui n'aurait existe
 * que sur un navigateur inconnu : un refus a tort se voit immediatement, mais
 * casse le parcours de signature pour de bonnes signatures.
 */
function compterOpaques(entete: EntetePng, brut: Buffer): number {
  const { largeur, hauteur, canaux } = entete;
  const pasLigne = 1 + largeur * canaux;
  let precedente: Buffer<ArrayBufferLike> = Buffer.alloc(largeur * canaux);
  let opaques = 0;

  for (let y = 0; y < hauteur; y++) {
    const base = y * pasLigne;
    const filtre = brut[base];
    const ligne = brut.subarray(base + 1, base + pasLigne);

    // De-filtrage dans `ligne`, qui est une VUE sur `brut` : on écrit donc
    // directement dans le tampon inflate, sans copie de ligne.
    for (let x = 0; x < ligne.length; x++) {
      const gauche = x >= canaux ? ligne[x - canaux] : 0;
      const haut = precedente[x];
      const hautGauche = x >= canaux ? precedente[x - canaux] : 0;
      let valeur = ligne[x];

      switch (filtre) {
        case 0:
          break;
        case 1:
          valeur = (valeur + gauche) & 0xff;
          break;
        case 2:
          valeur = (valeur + haut) & 0xff;
          break;
        case 3:
          valeur = (valeur + ((gauche + haut) >> 1)) & 0xff;
          break;
        case 4: {
          const p = gauche + haut - hautGauche;
          const pa = Math.abs(p - gauche);
          const pb = Math.abs(p - haut);
          const pc = Math.abs(p - hautGauche);
          const predicteur = pa <= pb && pa <= pc ? gauche : pb <= pc ? haut : hautGauche;
          valeur = (valeur + predicteur) & 0xff;
          break;
        }
        default:
          // Un filtre inconnu ne doit pas etre pris pour un filtre « aucun ».
          return -1;
      }
      ligne[x] = valeur;
    }

    // `pasAlpha` sert aux deux branches « avec alpha » : il vaut `canaux - 1`
    // pour RVBA et 0 pour gris+alpha, c'est-à-dire l'offset du canal alpha dans
    // le pixel.
    const pasAlpha = canaux - 1;
    if (entete.alphaExplicite) {
      // Cas nominal. Deux conditions, voir le contrat de la fonction.
      //   * `alpha > 0` et non `= 255` : le bord antialiasé d'un trait a un alpha
      //     de 30, et c'est bien de l'encre. Compter `= 255` rendrait le
      //     résultat dépendant du moteur de rendu du navigateur.
      //   * RVB non blanc : sans cette seconde condition, une page blanche
      //     opaque passerait avec 64 000 pixels « d'encre ».
      for (let x = pasAlpha; x < ligne.length; x += canaux) {
        if (ligne[x] > 0 && (ligne[x - pasAlpha] !== 255 || ligne[x - pasAlpha + 1] !== 255)) {
          opaques++;
        }
      }
    } else if (canaux === 1) {
      // Niveaux de gris sans alpha : « non blanc » vaut « encré ».
      for (let x = 0; x < ligne.length; x++) {
        if (ligne[x] !== 255) opaques++;
      }
    } else {
      // RVB sans alpha, meme chose sur les trois canaux.
      for (let x = 0; x + 2 < ligne.length; x += 3) {
        if (ligne[x] !== 255 || ligne[x + 1] !== 255 || ligne[x + 2] !== 255) opaques++;
      }
    }

    precedente = ligne;
  }

  return opaques;
}

/**
 * Verifie qu'une data URL PNG porte effectivement de l'encre.
 *
 * ÉCHEC CLOSÉ PAR DÉFAUT : toute erreur — base64 invalide, PNG tronqué, filtre
 * inconnu, `zlib` qui refuse — est un refus, jamais une exception. Un decodeur
 * qui leve laisserait remonter une 500, donc un message technique au client, et
 * surtout laisserait « aucune encre détectée » indistinguishable d'une panne.
 *
 * Ne leve jamais.
 */
export function verifierEncreSignature(dataUrlPng: string): VerdictEncre {
  try {
    const base64 = dataUrlPng.slice('data:image/png;base64,'.length);
    if (base64.length === 0) return REFUS.image_invalide;
    // `base64` ne doit contenir que l'alphabet base64 : un espace, un saut de
    // ligne ou un caractere de controle ici signifie une charge qui n'est pas
    // la chainee qu'elle pretend etre. On le verifie AVANT la conversion, pour
    // que `Buffer.from` ne silently ignore ce qui ne lui plait pas.
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return REFUS.image_invalide;

    const png = Buffer.from(base64, 'base64');
    // Recontrole : `Buffer.from` est lenient, et un alphabet valide mais de
    // longueur incompatible se retrouve ici tronque sans erreur.
    if (png.length === 0) return REFUS.image_invalide;

    const lu = lireEnteteEtDonnees(png);
    if ('erreur' in lu) return REFUS[lu.erreur];
    const { entete, donnees } = lu;

    const attendu = plafondInflate(entete.largeur, entete.hauteur, entete.canaux);

    // `Buffer<ArrayBufferLike>` et non `Buffer` : selon la version de
    // `@types/node`, `inflateSync` renvoie un tampon dont le type de backing
    // store n'est pas precise. Le parametre n'est pas utilise — seul `length` et
    // le contenu le sont — donc l'annotation la plus large est la correcte.
    let brut: Buffer<ArrayBufferLike>;
    try {
      // `maxOutputLength` est LA protection contre la decompression bomb. Elle
      // est passee a `zlib`, qui leve `ERR_BUFFER_TOO_LARGE` au lieu d'allouer.
      // Sans elle, un PNG de quelques kilo-octets — 214 suffisent, mesure — peut
      // demander des centaines de megaoctets ici.
      brut = inflateSync(donnees, { maxOutputLength: attendu });
    } catch {
      // `ERR_BUFFER_TOO_LARGE` atterrit ici, avec les PNG corrompus. Le motif
      // distingue les deux pour le journal, sans jamais les distinguer pour le
      // client.
      return REFUS.image_bomb;
    }

    // La longueur inflatee doit etre EXACTE. Trop courte : l'image est
    // tronquee. Plus longue : ce n'est pas un PNG de cette taille. Dans les
    // deux cas, de-filtrer au-dela des lignes reelles lirerait hors tampon.
    if (brut.length !== attendu) return REFUS.image_invalide;

    const opaques = compterOpaques(entete, brut);
    // -1 : filtre de ligne inconnu. Pas de second sentinelle — les images sans
    // canal alpha se comptent, elles ne se refusent pas.
    if (opaques === -1) return REFUS.image_invalide;

    if (opaques < SEUIL_ENCRE_SERVEUR) return REFUS.image_blanche;
    return { ok: true, pixelsOpaques: opaques };
  } catch {
    // Filet de securite : meme une erreur inattendue est un refus.
    return REFUS.image_invalide;
  }
}
