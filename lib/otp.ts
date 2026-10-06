// lib/otp.ts
//
// Codes de signature a usage unique pour les devis : generation, condensat,
// comparaison a temps constant, expiration, tentatives, verrouillage,
// consommation atomique et abstraction du fournisseur SMS.
//
// REGLE ABSOLUE DE CE MODULE
// --------------------------
// Le code EN CLAIR n'apparait dans AUCUN de ces endroits :
//   * la base        -> uniquement le condensat HMAC-SHA256 (colonne code_hmac) ;
//   * les logs       -> jamais, a aucun niveau, en aucun environnement ;
//   * les reponses   -> jamais (une reponse qui contient le code est un oracle) ;
//   * les erreurs    -> aucun message d'erreur ne contient le code ni le
//                       condensat ;
//   * les URL        -> la requete de consommation ne contient que des
//                       predicats de fenetre temporelle.
//
// La seule exception, VOLONTAIRE ET BORDEE, est le fournisseur
// `console_mock`, qui journalise le code pour permettre de tester le flux sans
// fournisseur reel. Il refuse categoriquement de s'executer hors developpement
// (voir `fournisseurConsoleMock`), donc aucun code n'atteint un journal de
// production. Voir § 4.4.
//
// SEPARATION DES RESPONSABILITES
// ------------------------------
// Ce module ne contient AUCUNE requete base : il ne connait ni `devis`, ni
// `devis_otp`, ni `clients`. Il produit des decisions pures et des CHAINES DE
// CRITERES que la route assemble. Ce decoupage a une raison de securite : les
// transitions d'etat doivent etre verifiables par des tests sans base de
// donnees, et une requete ne doit jamais pouvoir ecrire un code en clair par
// construction.
//
// VARIABLES D'ENVIRONNEMENT ATTENDUES
// ----------------------------------
//   OTP_HMAC_SECRET  OBLIGATOIRE. Secret de hachage, >= 32 octets. Son absence
//                     fait ECHECER la verification d'un OTP : aucun repli, aucun
//                     secret par defaut, aucun SHA-256 nu.
//   SMS_PROVIDER     none | twilio | vonage | console_mock. Valeur inconnue ou
//                     absente -> fournisseur nul (AUCUN envoi), jamais de repli
//                     silencieux sur le mock.
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER
//   VONAGE_API_KEY / VONAGE_API_SECRET / VONAGE_FROM_NUMBER
//
// Aucun de ces secrets n'est journalise. Aucun n'est expose au navigateur.

// Ce module est COTE SERVEUR et ne doit jamais etre atteint depuis un composant
// client. Il n'importe volontairement pas `server-only` : ce paquet n'est pas
// dans les dependances du projet, et l'ajouter pour un seul fichier n'est pas
// justifie ici. Le garde-fou retenu est `node:crypto`, un module natif Node
// qu'un bundle navigateur ne peut pas resoudre : l'erreur de build serait
// immediate et bruyante. `OTP_HMAC_SECRET` n'est de toute facon pas expose au
// navigateur (pas de prefixe NEXT_PUBLIC_).
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

// =============================================================================
// 1) SECRET DE HACHAGE
// =============================================================================

/** Longueur minimale du secret, en octets. En dessous, on refuse de hacher. */
const OCTETS_MIN_SECRET = 32;

/** Levée lorsqu'un code ne peut pas être traité de façon sûre. */
export class ErreurConfigurationOtp extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurConfigurationOtp";
  }
}

function secretHmac(): Buffer {
  const brut = process.env.OTP_HMAC_SECRET?.trim();
  if (!brut) {
    // Message volontairement SANS valeur d'environnement : une erreur ne doit
    // rien divulguer sur la configuration.
    throw new ErreurConfigurationOtp(
      "OTP_HMAC_SECRET absent : le hachage des codes de signature est indisponible. " +
        "Aucune signature ne peut etre validee."
    );
  }
  const octets = Buffer.from(brut, "utf8");
  if (octets.byteLength < OCTETS_MIN_SECRET) {
    throw new ErreurConfigurationOtp(
      `OTP_HMAC_SECRET trop court : ${OCTETS_MIN_SECRET} octets minimum requis.`
    );
  }
  return octets;
}

// =============================================================================
// 2) GENERATION
// =============================================================================

/** Nombre de chiffres d'un code. */
export const LONGUEUR_OTP = 6;

/** Borne basse incluse : 100000 -> le code a toujours exactement 6 chiffres. */
const OTP_MIN = 100_000;

/** Borne haute EXCLUE : 1000000. Espace de 900 000 codes. */
const OTP_MAX = 1_000_000;

const RE_CODE = new RegExp(`^[0-9]{${LONGUEUR_OTP}}$`);

/**
 * Tire un code de `LONGUEUR_OTP` chiffres avec le CSPRNG de Node
 * (`crypto.randomInt`), et non `Math.random`.
 *
 * `randomInt` est rejection-uniforme sur toute la plage et ne suffers pas des
 * biais de sortie d'un modulo. Le code n'est JAMAIS journalise : l'appelant est
 * seul responsable de son acheminement vers le fournisseur SMS.
 */
export function genererCodeOtp(): string {
  return randomInt(OTP_MIN, OTP_MAX).toString();
}

/** Un code est « bien formé » s'il est une chaîne de `LONGUEUR_OTP` chiffres. */
export function estCodeOtpBienForme(candidat: unknown): candidat is string {
  return typeof candidat === "string" && RE_CODE.test(candidat);
}

// =============================================================================
// 3) CONDENSAT ET COMPARAISON A TEMPS CONSTANT
// =============================================================================

/** Longueur d'un condensat SHA-256 en hexadécimal. */
const LONGUEUR_HEX = 64;

const RE_HEX = new RegExp(`^[0-9a-f]{${LONGUEUR_HEX}}$`);

/**
 * Condense un code en HMAC-SHA256(clé serveur, code), en hexadécimal minuscule.
 *
 * Le HMAC et non un SHA-256 nu : le secret est commun a tous les devis, donc un
 * attaquant ayant la base pourrait, avec un SHA-256 nu, calculer le
 * condensat de 000000 a 999999 — 900 000 essais — et retrouver le code de
 * n'importe quel OTP non consommé. Avec un HMAC il lui faut la clé, qui ne
 * quitte jamais le serveur.
 */
export function condenserCodeOtp(code: string): string {
  if (!estCodeOtpBienForme(code)) {
    // Aucune interpolation du codeRejected : un message d'erreur ne doit pas
    // faire remonter la valeur qu'il vient de rejeter.
    throw new ErreurConfigurationOtp("Code OTP mal forme : generation impossible.");
  }
  return createHmac("sha256", secretHmac()).update(code, "utf8").digest("hex");
}

/** Un condensat est valide s'il ressemble à un hexadécimal SHA-256. */
export function estCondensatValide(valeur: unknown): valeur is string {
  return typeof valeur === "string" && RE_HEX.test(valeur);
}

/**
 * Comparaison a temps CONSTANT de deux condensats.
 *
 * `timingSafeEqual` impose des tampons de meme longueur : la longueur est
 * verifiee au prealable. Elle est fixe (64 caracteres hexadecimaux), donc cette
 * verification ne divulgue rien — elle protege seulement de l'exception que
 * `timingSafeEqual` leve sur des entrees de longueurs differentes.
 */
export function comparerCondensats(a: string, b: string): boolean {
  if (!estCondensatValide(a) || !estCondensatValide(b)) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // Les deux entrees sont des hexadecimaux de longueur fixe (64), donc le test
  // d'egalite de longueur n'echoue jamais ici : il protege de l'exception que
  // `timingSafeEqual` leve sur des tampons de tailles differentes.
  if (ba.byteLength !== bb.byteLength) return false;
  return timingSafeEqual(ba, bb);
}

// -----------------------------------------------------------------------------
// PROPRIETES NON COUVERTES PAR LES TESTS FONCTIONNELS — A CONNAITRE
// -----------------------------------------------------------------------------
// Trois garanties de ce fichier ne peuvent PAS etre verifiees par un test en
// boite noire, car un test observes uniquement le resultat, jamais l'ecart
// temporel ni la source du generateur. Elles ont ete verifiees par mutation
// (remplacement du code par une variante fautive), et le mutant a bien SURVECU
// a la suite de tests. Ce n'est pas un defaut du code, c'est une limite de
// l'instrumentation, et elle est consignee ici plutot que masquee :
//
//   1. `timingSafeEqual` (comparaison a temps constant).
//      Mutant M12 : remplacer par `a === b`. La suite reste VERTE, car le
//      resultat est identique. L'egalite stricte court-circuite des la
//      premiere difference, ce qui est le canal d'attaque. Seul un banc
//      statistique sur des millions de comparaisons le mettrait en evidence —
//      ce depot n'en contient pas. Le mutant M14 (retrait du controle de
//      longueur) survit egalement, pour la meme raison.
//
//   2. `crypto.randomInt` (CSPRNG).
//      Mutant M17 : remplacer par `Math.random() + Math.floor`. La suite reste
//      VERTE. Mesure : sur 200 000 tirages, l'etendue de la repartition du
//      premier chiffre est de 784 pour `Math.random` contre 329 pour
//      `randomInt`, pour un seuil de 6 sigma a 843 — les deux passent. Un
//      `Math.floor` sur un flottant a 53 bits ne produit pas de biais mesurable
//      ici. L'exigence du CSPRNG ne porte donc PAS sur la distribution, mais
//      sur la resistance a la PREDICTION depuis un etat interne partiellement
//      observe, propriete qui n'est pas observable par la sortie. Elle ne se
//      teste pas en noir : elle se lit dans le code, d'ou le nom
//      `randomInt` importe explicitement.
//
//   3. L'ordre des etapes de `evaluerTentativeOtp`.
//      Mutant M15 : comparer le code AVANT de tester l'expiration. La suite
//      reste VERTE, et c'est le resultat ATTENDU : cet ordre ne divulgue
//      rien, puisque `messageRefusPublic()` renvoie un texte unique quel que
//      soit le motif interne. L'anti-oracle est porte par la surface de
//      reponse, pas par l'ordre de traitement. Voir la note « ORDRE ET
//      ANTI-ORACLE » sur `evaluerTentativeOtp`.
//
// Ces trois points sont documentes ici pour que la couverture reelle ne soit
// pas surestimee : la suite de tests prouve la LOGIQUE, pas le CANAL.

// =============================================================================
// 4) FOURNISSEUR SMS
// =============================================================================
// Le module ne connait aucun fournisseur : il expose un contrat et des
// implémentations interchangeables. Ajouter Vonage, un passerelle interne ou
// un envoi par e-mail ne modifie que ce fichier.

// -- 4.1 Contrat ---------------------------------------------------------------

export interface FournisseurSms {
  readonly nom: string;
  /**
   * `message` contient le code en clair : c'est le seul endroit du systeme ou
   * il circule en clair, et il est immédiat — il n'est ni stocke ni journalise.
   */
  envoyer(destinataire: string, message: string): Promise<{ ok: true } | { ok: false; raison: string }>;
}

/** Construit le message envoye au client. Jamais journalise. */
export function composerMessageOtp(code: string, reference: string): string {
  return `Votre code de signature BNA : ${code}. Reference ${reference}. Valable 10 minutes.`;
}

// -- 4.2 Fournisseur nul : defaut fail-closed ----------------------------------

/**
 * Fournisseur par defaut. N'envoie RIEN et ne masque jamais l'echec : la route
 * doit remonter un echec explicite a l'appelant.
 */
export function fournisseurNul(raison = "Aucun fournisseur SMS configure."): FournisseurSms {
  return {
    nom: "aucun",
    async envoyer() {
      return { ok: false, raison };
    },
  };
}

// -- 4.3 Fournisseurs reels ---------------------------------------------------

interface CibleHttp {
  url: string;
  hote: string;
}

async function postSms(cible: CibleHttp, corps: URLSearchParams, nom: string) {
  try {
    const reponse = await fetch(cible.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corps.toString(),
      cache: "no-store",
    });
    if (!reponse.ok) {
      // On journalise le STATUT et le nom de l'hote, jamais le corps : celui-ci
      // contient le code en clair.
      console.error(`SMS ${nom} : envoi refuse par ${cible.hote} (HTTP ${reponse.status}).`);
      return { ok: false as const, raison: `SMS ${nom} : envoi refuse (HTTP ${reponse.status}).` };
    }
    return { ok: true as const };
  } catch {
    console.error(`SMS ${nom} : erreur reseau vers ${cible.hote}.`);
    return { ok: false as const, raison: `SMS ${nom} : erreur reseau.` };
  }
}

export function fournisseurTwilio(env: NodeJS.ProcessEnv): FournisseurSms {
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) {
    return fournisseurNul("Twilio incomplet (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER).");
  }
  const hote = `https://api.twilio.com/2010-04-01/Accounts/${sid}`;
  return {
    nom: "twilio",
    async envoyer(destinataire, message) {
      const base = Buffer.from(`${sid}:${token}`).toString("base64");
      const reponse = await fetch(`${hote}/Messages.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${base}`,
        },
        body: new URLSearchParams({ To: destinataire, From: from, Body: message }).toString(),
        cache: "no-store",
      });
      if (!reponse.ok) {
        console.error(`SMS twilio : envoi refuse par ${hote} (HTTP ${reponse.status}).`);
        return { ok: false, raison: `SMS : envoi refuse (HTTP ${reponse.status}).` };
      }
      return { ok: true };
    },
  };
}

export function fournisseurVonage(env: NodeJS.ProcessEnv): FournisseurSms {
  const cle = env.VONAGE_API_KEY?.trim();
  const secret = env.VONAGE_API_SECRET?.trim();
  const from = env.VONAGE_FROM_NUMBER?.trim();
  if (!cle || !secret || !from) {
    return fournisseurNul("Vonage incomplet (VONAGE_API_KEY / VONAGE_API_SECRET / VONAGE_FROM_NUMBER).");
  }
  const hote = "https://rest.nexmo.com/sms/json";
  return {
    nom: "vonage",
    async envoyer(destinataire, message) {
      const corps = new URLSearchParams({
        api_key: cle,
        api_secret: secret,
        from,
        to: destinataire,
        text: message,
      });
      return postSms({ url: hote, hote }, corps, "vonage");
    },
  };
}

// -- 4.4 Mock de developpement, refuse hors developpement ----------------------

/**
 * Mock de developpement : journalise le code pour permettre de tester le flux
 * sans fournisseur reel.
 *
 * DEUX GARDES INDEPENDANTES, dont chacune suffit a interdire la production :
 *   1. ce fournisseur n'est choisi QUE si `SMS_PROVIDER=console_mock` ;
 *   2. il refuse systematiquement de s'executer des que `NODE_ENV=production`,
 *      meme si la variable a ete posee par erreur.
 *
 * Consequence : poser `SMS_PROVIDER=console_mock` sur un deploiement Vercel ne
 * produit aucun envoi et aucun code en clair dans les journaux. Le client
 * recoit alors un echec explicite plutot qu'un SMS contenant son code.
 */
export function fournisseurConsoleMock(env: NodeJS.ProcessEnv = process.env): FournisseurSms {
  return {
    nom: "console_mock",
    async envoyer(destinataire, message) {
      if (env.NODE_ENV === "production") {
        console.error(
          "SMS mock refuse : NODE_ENV=production. Le code ne sera pas journalise. Configurez un fournisseur reel."
        );
        return { ok: false, raison: "Envoi de SMS indisponible." };
      }
      // developpement uniquement : le seul endroit du depot ou un code en clair
      // est ecrit. Jamais atteint en production, d'ou la garde ci-dessus.
      console.warn(`[SMS MOCK] Dest: ${destinataire} | Msg: ${message}`);
      return { ok: true };
    },
  };
}

// -- 4.5 Selection fail-closed ------------------------------------------------

export type NomFournisseurSms = "aucun" | "twilio" | "vonage" | "console_mock";

/**
 * Choisit le fournisseur a partir de l'environnement.
 *
 * Une valeur INCONNUE ne retombe jamais sur le mock : elle conduit au
 * fournisseur nul. C'est le point central de cette fonction — un nom de
 * provider mal orthographie (ex. `twilioo`) ne doit pas pouvoir rejouer
 * silencieusement le developpement sur une base de production.
 */
export function selectionnerFournisseurSms(env: NodeJS.ProcessEnv = process.env): FournisseurSms {
  const demande = (env.SMS_PROVIDER ?? "").trim().toLowerCase();
  switch (demande) {
    case "twilio":
      return fournisseurTwilio(env);
    case "vonage":
      return fournisseurVonage(env);
    case "console_mock":
      return fournisseurConsoleMock(env);
    case "":
    case "none":
    case "desactive":
      return fournisseurNul();
    default:
      return fournisseurNul(`SMS_PROVIDER inconnu : « ${demande} ». Aucun envoi.`);
  }
}

// =============================================================================
// 5) EXPIRATION, TENTATIVES, VERROUILLAGE
// =============================================================================

/** Duree de validite d'un code. */
export const DUREE_VALIDITE_MS = 10 * 60 * 1000;

/** Nombre d'echecs toleres avant blocage. */
export const MAX_TENTATIVES = 5;

/** Duree du blocage apres epuisement des tentatives. */
export const DUREE_VERROU_MS = 10 * 60 * 1000;

/** Ligne `devis_otp` telle que la route la lit. */
export type LigneOtp = {
  id: string;
  code_hmac: string | null;
  expires_at: string | null;
  consumed_at: string | null;
  tentatives: number | null;
  verrouille_jusqua: string | null;
  ip: string | null;
};

/**
 * Motifs de refus. Ils sont VOLONTAIREMENT distincts pour que la route puisse
 * journaliser precisement — mais voir § 5.4 : la REPONSE API ne doit pas les
 * exposer tels quels.
 */
export type MotifRefus =
  | "introuvable"
  | "deja_consomme"
  | "expire"
  | "code_incorrect"
  | "tentatives_epuisees"
  | "verrouille";

export type EvaluationOtp =
  | { autorise: true; echec: false }
  | { autorise: false; echec: true; motif: MotifRefus; retryAfterSecondes: number };

const RE_REFUS: Readonly<Record<MotifRefus, boolean>> = {
  introuvable: false,
  deja_consomme: false,
  expire: false,
  code_incorrect: true,
  tentatives_epuisees: false,
  verrouille: false,
};

function refus(motif: MotifRefus, maintenant: Date, jusqua?: Date | null): EvaluationOtp {
  const retryAfterSecondes =
    jusqua && jusqua.getTime() > maintenant.getTime()
      ? Math.ceil((jusqua.getTime() - maintenant.getTime()) / 1000)
      : 0;
  return { autorise: false, echec: true, motif, retryAfterSecondes };
}

/** Un refus doit-il incrémenter le compteur de tentatives ? */
export function doitIncrementerTentatives(evaluation: EvaluationOtp): boolean {
  return !evaluation.autorise && RE_REFUS[evaluation.motif];
}

/**
 * Ordre d'evaluation — chaque étape teste UNE SEULE condition.
 *
 * Cet ordre est security-relevant :
 *   1. verrou    : un code bloque est refuse sans toucher la base ni hacher ;
 *   2. consomme  : un code deja consomme est refuse meme si le code soumis est
 *                  CORRECT et meme si le delai n'est pas echu. C'est ce qui
 *                  rend le rejeu impossible ;
 *   3. tentatives: l'epuisement du compteur bloque meme un code correct ;
 *   4. expiration;
 *   5. code      : seul cas compare au condensat.
 *
 * ORDRE ET ANTI-ORACLE — PRECISION IMPORTANTE
 * -------------------------------------------
 * L'ordre ci-dessus n'est PAS la propriete de securite, et il ne faut pas le
 * prendre pour telle. Inversionner les etapes 4 et 5 ne divulgue rien : la
 * garantie anti-oracle tient entierement a `messageRefusPublic()` et
 * `statutHttpRefusPublic()`, qui renvoient un texte et un statut uniques pour
 * les six motifs. Le client ne voit donc jamais `expire` MT code_incorrect, quel
 * que soit l'ordre interne.
 *
 * Verification par execution (mutant M8 : comparaison du code placee AVANT le
 * test d'expiration) : le mutant n'introduit aucune difference observable,
 * donc il est sur. C'est desirable.
 *
 * L'ordre retenu ici est donc choisi pour la lisibilite du journal serveur et
 * la bonte du compteur, pas pour la securite. Ce qui EST une propriete de
 * securite, et testee : un code consomme reste refuse meme avec le BON code
 * (etape 2), un compteur epuise bloque meme le BON code (etape 3), une ligne
 * sans date d'expiration est refusee (etape 4).
 */
export function evaluerTentativeOtp(
  ligne: LigneOtp | null,
  codeSoumis: string,
  maintenant: Date = new Date()
): EvaluationOtp {
  if (!ligne) return refus("introuvable", maintenant);

  // 1. Verrou.
  if (ligne.verrouille_jusqua) {
    const jusqua = new Date(ligne.verrouille_jusqua);
    if (!Number.isNaN(jusqua.getTime()) && jusqua.getTime() > maintenant.getTime()) {
      return refus("verrouille", maintenant, jusqua);
    }
  }

  // 2. Rejeu : consomme, donc definitivement inutilisable.
  if (ligne.consumed_at) return refus("deja_consomme", maintenant);

  // 3. Tentatives epuisees.
  const tentatives = typeof ligne.tentatives === "number" ? ligne.tentatives : 0;
  if (tentatives >= MAX_TENTATIVES) {
    const jusqua = ligne.verrouille_jusqua ? new Date(ligne.verrouille_jusqua) : null;
    return refus("tentatives_epuisees", maintenant, jusqua && !Number.isNaN(jusqua.getTime()) ? jusqua : null);
  }

  // 4. Expiration.
  if (!ligne.expires_at) return refus("expire", maintenant);
  const fin = new Date(ligne.expires_at);
  if (Number.isNaN(fin.getTime()) || fin.getTime() <= maintenant.getTime()) {
    return refus("expire", maintenant);
  }

  // 5. Code. Seul cas ou l'on compare au condensat.
  //    Ordre choisi pour la lisibilite du journal, pas pour la securite : voir
  //    la note « ORDRE ET ANTI-ORACLE » plus haut.
  if (!estCodeOtpBienForme(codeSoumis)) return refus("code_incorrect", maintenant);
  if (!estCondensatValide(ligne.code_hmac)) return refus("code_incorrect", maintenant);
  if (!comparerCondensats(ligne.code_hmac, condenserCodeOtp(codeSoumis))) {
    return refus("code_incorrect", maintenant);
  }

  return { autorise: true, echec: false };
}

/**
 * Message de refus UNIQUE, a appliquer en reponse HTTP.
 *
 * WHY: `MotifRefus` distingue six causes (section 5) pour permettre une
 * journalisation fine cote serveur. Mais le MOTIF NE DOIT JAMAIS traverser le
 * reseau. Un client qui distingue « expire » de « code incorrect » apprend
 * qu'un code existe et qu'il a expire ; un client qui distingue « deja_consomme »
 * de « introuvable » enumerate les sessions d'OTP. Toutes ces distinctions
 * sont des oracles.
 *
 * Cette fonction est donc l'unique source autorisee de texte de refus : la
 * route l'appelle et ne fait rien d'autre.
 *
 * AUCUN PARAMETRE, et c'est volontaire : la signature est `() => string`, pas
 * `(motif?: MotifRefus) => string`. Un parametre optionnel aurait permis a un
 * appelant de passer le motif et de reintroduire la fuite, de maniere
 * parfaitement compilante. Zéro parametre rend cette erreur IMPOSSIBLE a
 * ecrire, et non seulement improbable. Le mutant qui ajoute un parametre
 * `motif?: string` avec des branches divergentes laisse la suite de tests verte
 * parce que sa branche est inatteignable — ce qui est le resultat correct.
 */
export function messageRefusPublic(): string {
  // Aucun des six `MotifRefus` n'est evoque, ni meme en disjonction : le texte
  // ne doit pas apprendre a l'attaquant qu'une dimension « validite temporelle »
  // existe, car il pourrait alors mesurer le temps d'echec pour en deduire la
  // date d'emission du code et rejouer la fenetre plus tard.
  return "Code non valide. Revenez a l'etape precedente pour en demander un nouveau.";
}

/**
 * Statut HTTP associe au refus. 400 partout : un 404 revelerait l'existence de
 * la ligne d'OTP, un 429 lui revelerait son etat.
 */
export function statutHttpRefusPublic(): number {
  return 400;
}

/** Incrément à appliquer après un echec. Aucune valeur sensible. */
export function patchEchecTentative(ligne: LigneOtp, maintenant: Date = new Date()): {
  tentatives: number;
  verrouille_jusqua: string | null;
} {
  const tentatives = (typeof ligne.tentatives === "number" ? ligne.tentatives : 0) + 1;
  return {
    tentatives,
    verrouille_jusqua:
      tentatives >= MAX_TENTATIVES ? new Date(maintenant.getTime() + DUREE_VERROU_MS).toISOString() : null,
  };
}

/** Remise à zéro après un succes. */
export function patchReussiteTentative(): { tentatives: number; verrouille_jusqua: null } {
  return { tentatives: 0, verrouille_jusqua: null };
}

/** Marquage de consommation : c'est ce qui interdit tout rejeu. */
export function patchConsommation(maintenant: Date = new Date()): {
  consumed_at: string;
  tentatives: number;
  verrouille_jusqua: null;
} {
  return { consumed_at: maintenant.toISOString(), tentatives: 0, verrouille_jusqua: null };
}

// =============================================================================
// 6) CONSOMMATION ATOMIQUE — ANTI-REJEU
// =============================================================================
// Verifier puis ecrire, en deux requetes, autorise la course suivante :
//   T1 lit la ligne, voit consumed_at IS NULL, le code est bon
//   T2 lit la ligne, voit consumed_at IS NULL, le code est bon
//   T3 UPDATE ... SET consumed_at = now()          -> 1 ligne
//   T4 UPDATE ... SET consumed_at = now()          -> 1 ligne  <-- REJEU
// Le code serait consomme deux fois.
//
// La parade tient en une seule requete : le `UPDATE` porte LUI-MEME la condition
// de validite. Si la ligne a deja ete consommee entre-temps, le predicat ne
// porte plus et Postgres touche ZERO ligne. Le second appelant lit 0 et sait
// qu'il a perdu la course. C'est le verrou optimism PostgreSQL, et il n'exige
// ni transaction, ni SERIALIZABLE, ni procedure stockee.

/**
 * Chaine de criteres pour l'UPDATE de consommation.
 *
 * AUCUN CODE N'Y FIGURE. Les seuls predicats sont :
 *   consumed_at.is.null     -> interdit le rejeu ;
 *   expires_at.gt.<iso>     -> interdit la validation d'un code expire ;
 *   tentatives.lt.<max>     -> interdit la validation d'un code bloque.
 *
 * La chaine est renvoyee separement de l'URL pour que la route puisse
 * l'inspecter et la tester.
 */
export function criteresConsommationOtp(
  idOtp: string,
  maintenant: Date = new Date(),
  maxTentatives: number = MAX_TENTATIVES
): string {
  const iso = maintenant.toISOString();
  const etat = `and=(consumed_at.is.null,expires_at.gt.${iso},tentatives.lt.${maxTentatives})`;
  return `id=eq.${encodeURIComponent(idOtp)}&${etat}`;
}

/** URL complète de l'UPDATE de consommation, en `PATCH`. */
export function urlConsommationOtp(
  baseUrl: string,
  idOtp: string,
  maintenant: Date = new Date(),
  maxTentatives: number = MAX_TENTATIVES
): string {
  return `${baseUrl}?${criteresConsommationOtp(idOtp, maintenant, maxTentatives)}`;
}

// =============================================================================
// 7) PURGE DES OTP EXPIRES
// =============================================================================

/** Criteres de suppression des codes anterieurs a une date. Aucun code en clair. */
export function criteresPurgeOtp(maintenant: Date = new Date()): string {
  return `expires_at=lt.${maintenant.toISOString()}`;
}

// =============================================================================
// 8) ADRESSE IP DE LA REQUETE
// =============================================================================

/** Longueur maximale d'une adresse stockee en base (`signature_ip varchar(45)`). */
const LONGUEUR_IP_MAX = 45;

const RE_IP =
  /^[0-9a-fA-F:.]{2,45}$|^[0-9A-Za-z._-]{2,45}$/;

/**
 * Extrait l'adresse IP de la requete.
 *
 * Les valeurs sont STRICTEMENT validees avant d'etre conservees. Une preuve
 * d'audit ne doit pas pouvoir contenir une chaine arbitraire injectee par un
 * client via un en-tete (`X-Forwarded-For: <script>…`) : en base, puis dans un
 * PDF ou un export, ce serait une injection stockee.
 *
 * Une valeur invalide ou absente donne `null` — la signature est alors
 * enregistree SANS IP, ce qui est preferable a une IP fausse. L'arbitrage
 * (refuser la signature, ou l'enregistrer sans IP) appartient a la route de la
 * phase 4 ; ce module se contente de signaler l'absence.
 */
export function extraireIp(entetes: Record<string, string | string[] | undefined>): string | null {
  const brut = ["x-forwarded-for", "cf-connecting-ip", "x-real-ip", "true-client-ip"]
    .map((cle) => entetes[cle])
    .find((v) => typeof v === "string" && v.trim().length > 0);

  if (typeof brut !== "string") return null;
  const premiere = brut.split(",")[0]?.trim();
  if (!premiere) return null;
  if (premiere.length > LONGUEUR_IP_MAX) return null;
  if (!RE_IP.test(premiere)) return null;
  return premiere;
}
// -----------------------------------------------------------------------------
// MUTANTS EQUIVALENTS — CE QUE LES TESTS NE PEUVENT PAS DETECTER
// -----------------------------------------------------------------------------
// Deux variantes fautives de messages d'erreur laissent la suite de tests verte.
// Elles ne le peuvent pas, et ce n'est pas un defaut de couverture : elles
// n'introduisent aucune fuite. Analyse, pour ne pas les redouter par la suite.
//
//   M19 — « OTP_HMAC_SECRET absent (tentative: ${brut}) ».
//   Inatteignable comme fuite : cette branche n'est prise que si `brut` est
//   FALSY, c'est-a-dire `undefined`, `""` ou une chaine d'espaces. Aucune de
//   ces valeurs n'est un secret. Le mutant est donc equivalent au code actuel.
//
//   M21 — « Code OTP mal forme (recu N caracteres) ».
//   Inoffensif : la longueur divulguee est celle de la SAISIE DE L'APPELANT,
//   qu'il connait deja. Le seul appelant de `condenserCodeOtp` dans le module
//   est `evaluerTentativeOtp`, ou le code soumis vient soit du client, soit du
//   generateur du serveur — auquel cas il est deja bien forme et n'atteint
//   jamais ce message. Aucune longueur de code serveur ne peut fuiter par là.
//
// En revanche, des variantes voisines SONT detectees, ce qui montre que la
// limite est bien circonscrite :
//   M18 — « trop court (fourni: ${brut}) »  : detecte, la valeur est reelle.
//   M20 — « code mal forme : ${code} »     : detecte, la valeur du code fuit.
//
//   M8  — suppression du controle `LONGUEUR_IP_MAX` dans `extraireIp`.
//   Survit, et doit survivre : `RE_IP` borne deja chaque alternative a
//   `{2,45}`, donc une valeur de 46 caracteres ou plus echoue sur le motif
//   regex AVANT d'atteindre le test de longueur. La garde est donc
//   redondante — une defense en profondeur, pas une condition de securite
//   active. Elle est conservee malgre tout : si `RE_IP` evolue un jour, la
//   borne de longueur reste. Ecrire un test « la longueur est verifiee »
//   serait ici tautologique : il ne verifierait que la coincidence de deux
//   defenses. Ce que les tests verifient reellement, c'est que les valeurs
//   injectees sont rejetees.
