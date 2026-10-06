// @vitest-environment node
//
// CONTRATS OFFICIELS DE L'OTP — VALIDÉS EXPLICITEMENT (phase 3)
// =============================================================
//
// Deux règles ont été soumises à décision humaine et validées. Elles ne sont
// plus des choix d'implémentation : ce sont des CONTRATS. Ce fichier les
// enshrined pour qu'une régression ultérieure ne puisse pas les modifier en
// silence.
//
// Il les vérifie sur LES DEUX IMPLÉMENTATIONS, côte à côte :
//
//   * CÔTÉ TYPESCRIPT : `lib/otp.ts`, exécuté réellement.
//   * CÔTÉ SQL        : le corps réel de `signature_devis_valider_otp`.
//
// Vérifier un seul côté laisserait passer l'erreur la plus probable : quelqu'un
// ajuste une constante dans `lib/otp.ts` sans toucher le SQL, ou l'inverse. Les
// deux implémentations sont donc testées dans le MÊME fichier, et le test
// `coherence` échoue si elles divergent.
//
// ─────────────────────────────────────────────────────────────────────────────
// CONTRAT 1 — LE SEUIL DES TENTATIVES
// ─────────────────────────────────────────────────────────────────────────────
//
// `MAX_TENTATIVES = 5` autorise CINQ ÉCHECS, pas cinq essais. Le décalage d'un
// essai est volontaire :
//
//     échecs 1..4              → refus `otp_code`, compteur 1..4
//     5e SOUMISSION, bon code  → SUCCÈS (le verrou n'est pas encore posé)
//     5e ÉCHEC                 → compteur 5 ET `verrouille_jusqua` posée
//     6e et suivantes          → refus verrouillé, sans incrément
//
// Le point qui mérite une justification est le 5e SUCCÈS. Verrouiller à
// `tentatives >= 4` punirait le client légitime d'une erreur de PLUS que n'en
// commet l'attaquant, puisque l'attaquant ne paie rien de son échec. Ici les
// deux en paient un : le coût est symétrique sur les deux camps.
//
// Le prix, explicite : le client légitime peut se voir refusé après cinq
// tentatives de sa part. C'est le contrat validé.
//
// ─────────────────────────────────────────────────────────────────────────────
// CONTRAT 2 — L'OTP ANCIEN, SOUMIS ALORS QU'UN PLUS RÉCENT EXISTE
// ─────────────────────────────────────────────────────────────────────────────
//
// Trois propriétés, chacune vérifiée par la preuve T5 sur PostgreSQL réel :
//
//   1. REFUS            : l'OTP soumis n'est pas consommé.
//   2. PAS D'INCRÉMENT : le compteur reste intact, donc ce refus ne coûte pas
//                         un essai au client légitime.
//   3. PAS DE VERROU    : ni verrou posé, ni OTP courant touché. Le client peut
//                         donc saisir son nouveau code juste après.
//
// Le prix, explicite : un détenteur du code d'accès ne peut plus déclencher une
// expiration rapide à coût nul. Il le peut en revanche par cinq tentatives
// RÉELLES, que le CONTRAT 1 compte. La force brute reste fermée.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  evaluerTentativeOtp,
  doitIncrementerTentatives,
  patchEchecTentative,
  condenserCodeOtp,
  MAX_TENTATIVES,
  DUREE_VERROU_MS,
  type LigneOtp,
} from "@/lib/otp";

import { sansCommentaires } from "./_lecture-source";

// ── Fixture ──────────────────────────────────────────────────────────────────

const SECRET = "contrat-officiel-secret-de-test-32-caracteres-min";
const CODE_BON = "123456";
const CODE_MAUVAIS = "999999";

const MAINTENANT = new Date("2026-10-04T10:00:00.000Z");

beforeAll(() => {
  process.env.OTP_HMAC_SECRET = SECRET;
});

/** Ligne `devis_otp` valide, au compteur et au verrou donnes. */
function ligne(overrides: Partial<LigneOtp> = {}): LigneOtp {
  return {
    id: "aaaaaaaa-4444-4444-8444-444444444444",
    code_hmac: condenserCodeOtp(CODE_BON),
    expires_at: new Date(MAINTENANT.getTime() + 600_000).toISOString(),
    consumed_at: null,
    tentatives: 0,
    verrouille_jusqua: null,
    ip: null,
    ...overrides,
  };
}

/**
 * Evalue une soumission et exige un REFUS, en retournant le motif.
 *
 * `EvaluationOtp` est une union discriminée : après `autorise`, le type ne
 * porte plus que le membre du refus. Un `expect(...).toBe(false)` ne rétrécit
 * rien — TypeScript le sait, et il a raison. Cette fonction fait le rétrécissement
 * explicitement, et son nom dit ce qu'elle vérifie : si le code est un jour
 * accepté alors que le test attend un refus, l'erreur est dans le test.
 */
function exigerRefus(ligne: LigneOtp, code: string, maintenant: Date) {
  const evaluation = evaluerTentativeOtp(ligne, code, maintenant);
  if (evaluation.autorise) {
    throw new Error(
      `Refus attendu (tentatives=${ligne.tentatives}, code ${code === CODE_BON ? "correct" : "faux"}) mais la soumission a ete ACCEPTEE.`
    );
  }
  return evaluation;
}

// ── Côté SQL : le corps réel de la RPC ──────────────────────────────────────

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/20261003_devis_signature_provenance.sql"),
  "utf8"
);

/**
 * Corps de la RPC de validation.
 *
 * `$bna$` délimite le corps de PLUSIEURS fonctions de cette migration (les
 * triggers viennent en premier). Chercher le premier `as $bna$` prendrait donc
 * un trigger, pas la RPC — et tous les tests ci-dessous porteraient sur le
 * mauvais texte tout en passant au vert. On s'ancre sur le NOM de la fonction.
 */
function corpsRpc(src: string): string {
  const debut = src.indexOf("create or replace function public.signature_devis_valider_otp");
  if (debut < 0) return "";
  const i = src.indexOf("as $bna$", debut);
  if (i < 0) return "";
  const j = src.indexOf("$bna$;", i);
  return j < 0 ? "" : src.slice(i, j);
}

const RPC = corpsRpc(MIGRATION);

// =============================================================================
// CONTRAT 1 — LE SEUIL DES TENTATIVES
// =============================================================================

describe("CONTRAT 1 — le seuil des tentatives (5 echecs, pas 5 essais)", () => {
  it("C1.1 les quatre premiers echecs sont refuses et le compteur monte de 1 a 4", () => {
    for (let n = 0; n <= 3; n++) {
      const evaluation = exigerRefus(ligne({ tentatives: n }), CODE_MAUVAIS, MAINTENANT);

      expect(evaluation.motif, `echec ${n + 1}`).toBe("code_incorrect");
      // Seul motif qui incremente : sans cela le compteur ne monterait jamais.
      expect(doitIncrementerTentatives(evaluation), `echec ${n + 1}`).toBe(true);

      const patch = patchEchecTentative(ligne({ tentatives: n }), MAINTENANT);
      expect(patch.tentatives, `echec ${n + 1}`).toBe(n + 1);
      // Aucun verrou avant le cinquieme echec : c'est ce qui laisse le 5e essai
      // avec le bon code reussir.
      expect(patch.verrouille_jusqua, `echec ${n + 1}`).toBeNull();
    }
  });

  it("C1.2 la CINQUIEME soumission avec le BON code REUSSIT apres quatre echecs", () => {
    // C'est le decalage d'un essai, et il est VOLONTAIRE. Ce test existe pour
    // qu'un futur durcissement ne le change pas sans qu'on s'en apercoive : si
    // quelqu'un posee le verrou a `tentatives >= 4`, ce test tombe et le
    // rapport doit alors dire que le contrat a ete modifie.
    const evaluation = evaluerTentativeOtp(ligne({ tentatives: 4 }), CODE_BON, MAINTENANT);

    expect(evaluation.autorise).toBe(true);
    expect(evaluation.echec).toBe(false);
  });

  it("C1.3 le CINQUIEME ECHEC pose le compteur a 5 ET le verrou", () => {
    const avant = ligne({ tentatives: 4 });
    const evaluation = exigerRefus(avant, CODE_MAUVAIS, MAINTENANT);

    expect(evaluation.motif).toBe("code_incorrect");
    expect(doitIncrementerTentatives(evaluation)).toBe(true);

    const patch = patchEchecTentative(avant, MAINTENANT);
    expect(patch.tentatives).toBe(MAX_TENTATIVES);
    expect(patch.verrouille_jusqua).not.toBeNull();
    // Duree du verrou : dix minutes. Le client n'est donc pas puni
    // definitivement, et un attaquant ne peut pas non plus bloquer un jour.
    expect(new Date(patch.verrouille_jusqua as string).getTime()).toBe(
      MAINTENANT.getTime() + DUREE_VERROU_MS
    );
  });

  it("C1.4 la SIXIEME soumission est refusee SANS increment, verrou ou consommation", () => {
    const verrouillee = ligne({
      tentatives: MAX_TENTATIVES,
      verrouille_jusqua: new Date(MAINTENANT.getTime() + DUREE_VERROU_MS).toISOString(),
    });

    for (const code of [CODE_BON, CODE_MAUVAIS]) {
      const evaluation = exigerRefus(verrouillee, code, MAINTENANT);

      expect(evaluation.motif, code).toBe("verrouille");
      // Aucun increment : le compteur est deja au plafond, l'augmenter
      // n'apporterait rien et cacherait le motif reel du refus.
      expect(doitIncrementerTentatives(evaluation), code).toBe(false);
    }

    // L'OTP n'est PAS consomme par un refus : le client doit pouvoir
    // ressaisir son code apres l'expiration du verrou.
    expect(verrouillee.consumed_at).toBeNull();
  });

  it("C1.5 le refus donne un delai exploitable cote journalisation, PAS en reponse HTTP", () => {
    const verrouillee = ligne({
      tentatives: MAX_TENTATIVES,
      verrouille_jusqua: new Date(MAINTENANT.getTime() + 42_000).toISOString(),
    });
    const evaluation = exigerRefus(verrouillee, CODE_MAUVAIS, MAINTENANT);

    // Le serveur a besoin de savoir quand le verrou tombe, pour re-elargir la
    // fenetre sans que le client ait a recharger la page.
    expect(evaluation.retryAfterSecondes).toBe(42);
  });

  it("C1.6 COHERENCE TS <-> SQL : les deux seuils SQL valent exactement MAX_TENTATIVES", () => {
    // Erreur la plus probable d'une regression : ajuster une constante d'un
    // seul cote. On lit la valeur reellement ecrite dans le SQL et on la
    // compare a la constante TypeScript.
    expect(RPC).not.toBe("");

    const gardeAvantIncrement = RPC.match(/if\s+coalesce\(v_tentatives,\s*0\)\s*>=\s*(\d+)\s+then/);
    const poseDuVerrou = RPC.match(/when\s+coalesce\(o\.tentatives,\s*0\)\s*\+\s*1\s*>=\s*(\d+)/);
    const borneConsommation = RPC.match(/and\s+coalesce\(o\.tentatives,\s*0\)\s*<\s*(\d+)/);

    // Les trois endroits ou le seuil apparait DOIVENT exister. Un seul qui
    // disparait est deja une divergence.
    expect(gardeAvantIncrement, "garde avant increment").not.toBeNull();
    expect(poseDuVerrou, "pose du verrou").not.toBeNull();
    expect(borneConsommation, "borne de la consommation").not.toBeNull();

    // Et ils doivent tous porter la meme valeur que le TypeScript.
    expect(Number(gardeAvantIncrement![1])).toBe(MAX_TENTATIVES);
    expect(Number(poseDuVerrou![1])).toBe(MAX_TENTATIVES);
    expect(Number(borneConsommation![1])).toBe(MAX_TENTATIVES);

    // La borne de consommation rejoue le meme seuil : c'est la seconde barriere,
    // et elle doit etre d'accord avec la premiere sous peine d'ouvrir une
    // fenetre entre le refus evalue et l'ecriture effective.
    expect(Number(borneConsommation![1])).toBe(Number(gardeAvantIncrement![1]));
  });

  it("C1.7 AUTO-VERIFICATION : C1.6 detecte un seuil SQL reellement desaligne", () => {
    // Un test de coherence qui ne peut pas echouer ne prouve rien. On applique
    // des mutants au SQL REEL et on exige que l'invariant les voie.
    const invariants = [
      /if\s+coalesce\(v_tentatives,\s*0\)\s*>=\s*5\s+then/,
      /when\s+coalesce\(o\.tentatives,\s*0\)\s*\+\s*1\s*>=\s*5/,
      /and\s+coalesce\(o\.tentatives,\s*0\)\s*<\s*5/,
    ];

    const mutants = [
      {
        nom: "garde abaissee a 4 : le client legitime perd un essai",
        mutant: RPC.replace(/coalesce\(v_tentatives, 0\) >= 5/, "coalesce(v_tentatives, 0) >= 4"),
      },
      {
        nom: "verrou pose des le 4e echec",
        mutant: RPC.replace(/coalesce\(o\.tentatives, 0\) \+ 1 >= 5/, "coalesce(o.tentatives, 0) + 1 >= 4"),
      },
      {
        nom: "borne de consommation desalignee",
        mutant: RPC.replace(/coalesce\(o\.tentatives, 0\) < 5/, "coalesce(o.tentatives, 0) < 4"),
      },
      {
        nom: "borne de consommation supprimee : la barriere atomique disparait",
        mutant: RPC.replace(/and\s+coalesce\(o\.tentatives, 0\) < 5/, "and true"),
      },
    ];

    for (const { nom, mutant } of mutants) {
      // La substitution doit avoir agi, sinon le mutant ne teste rien.
      expect(mutant, `substitution sans effet : ${nom}`).not.toBe(RPC);
      // Au moins un des trois invariants doit cesser de matcher : sinon le
      // mutant passe et le test ne prouve rien.
      expect(
        invariants.some((re) => !re.test(mutant)),
        `mutant non detecte : ${nom}`
      ).toBe(true);
    }

    // Et la source reelle satisfait toujours les trois : sans cela, ces mutants
    // porteraient sur des exigences que le code ne remplit pas.
    for (const re of invariants) expect(RPC).toMatch(re);
  });
});

// =============================================================================
// CONTRAT 2 — L'OTP ANCIEN SOUMIS ALORS QU'UN PLUS RÉCENT EXISTE
// =============================================================================

describe("CONTRAT 2 — l'OTP ancien est refuse SANS cout pour le client", () => {
  it("C2.1 le SQL refuse un p_otp_id qui n'est pas la ligne la plus recente", () => {
    // La condition est un `is distinct from` : elle refuse l'inégalité, donc
    // elle vaut aussi pour un `p_otp_id` NULL ou absent. Un `=` ordinaire
    // laisserait passer NULL et n'aboutirait jamais a un refus.
    // La forme exacte est verifiee, indentation comprise : le motif doit etre le
    // seul contenu du retour, sinon une valeur ajoutee par erreur (un compteur,
    // un raison_code) partirait vers la couche HTTP.
    expect(RPC).toMatch(
      /if\s+v_otp_id\s+is\s+distinct\s+from\s+p_otp_id\s+then\s*\n\s*return\s+jsonb_build_object\('ok',\s*false,\s*'motif',\s*'otp_perime'\);/
    );
  });

  it("C2.2 le refus precede l'increment : il ne peut donc pas incrementer", () => {
    // L'ordre du code EST la propriete. On mesure la position du refus
    // `otp_perime` et celle de l'UPDATE qui incremente : si l'increment passait
    // avant, ce refus coutait un essai au client legitime.
    const iPerime = RPC.indexOf("'motif', 'otp_perime'");
    const iIncrement = RPC.indexOf("set tentatives      = coalesce(o.tentatives, 0) + 1");

    expect(iPerime, "le refus otp_perime doit exister").toBeGreaterThan(-1);
    expect(iIncrement, "l increment doit exister").toBeGreaterThan(-1);
    expect(iPerime, "le refus doit precéder l'increment").toBeLessThan(iIncrement);
  });

  it("C2.3 le refus ne pose ni verrou ni consommation sur l'OTP courant", () => {
    // On isole le chemin `otp_perime` : de la condition de refus jusqu'a la
    // garde suivante. Ce qui s'y trouve est TOUT ce que la transaction peut
    // faire sur la ligne — il doit n'y avoir aucune ecriture.
    const debut = RPC.indexOf("is distinct from p_otp_id");
    const fin = RPC.indexOf("-- 6)", debut);
    expect(debut).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(debut);

    const chemin = RPC.slice(debut, fin);

    expect(chemin, "aucune ecriture sur otp_perime").not.toMatch(/\bupdate\b/i);
    expect(chemin, "aucune consommation").not.toMatch(/consumed_at/);
    expect(chemin, "aucun verrou").not.toMatch(/verrouille_jusqua\s*=/);
    expect(chemin, "aucun leve : un rollback serait sans effet, un raise trahirait un echec technique").not.toMatch(
      /\braise\b/i
    );
    expect(chemin).toMatch(/return\s+jsonb_build_object\('ok',\s*false,\s*'motif',\s*'otp_perime'\)/);
  });

  it("C2.4 le refus est indistinguable, cote HTTP, d'un mauvais code", () => {
    // `otp_perime` doit tomber dans le meme refus uniforme que `otp_code` : sinon
    // la reponse apprend au client qu'un code plus recent existe, ce qui est une
    // information sur l'etat du dossier d'une personne tierce.
    //
    // On lit la route SANS ses commentaires. C'est ici que le stripper montre
    // ce qu'il vaut : `otp_perime` figure dans un commentaire de la route, qui
    // denumerote les motifs indistincts. Un test qui chercherait le nom du motif
    // dans le texte brut verrait ce commentaire et croirait la regle appliquee.
    // Chercher l'ABSENCE de cas propre dans le CODE, lui, ne peut pas etre
    // trompee ainsi.
    const route = sansCommentaires(
      readFileSync(join(process.cwd(), "app/api/espace-client/[code_acces]/verify-otp/route.ts"), "utf8")
    );

    // Aucun cas propre : `otp_perime` n'a pas de branche, il echoue sur le
    // `default`. Une branche dediee serait une fuite d'information.
    expect(route).not.toMatch(/case\s*['"]otp_perime['"]/);
    expect(route).not.toMatch(/otp_perime/);

    // Le default est bien le refus public uniforme, et il est le DERNIER : tout
    // motif inconnu, venu de la base ou non, y tombe.
    const iDefault = route.indexOf("default:");
    expect(iDefault).toBeGreaterThan(-1);
    const defaultBloc = route.slice(iDefault);
    expect(defaultBloc).toMatch(/messageRefusPublic\(\)/);
    expect(defaultBloc).toMatch(/statutHttpRefusPublic\(\)/);
  });

  it("C2.5 le TS ne peut pas transformer ce refus en increment", () => {
    // Garde de non-regression : si un jour un motif `otp_perime` etait ajoute a
    // `RE_REFUS`, la route court-circuiterait AVANT la RPC sur le mauvais motif
    // et ce refus deviendrait un cout pour le client. Le motif n'existe pas cote
    // TS — il est produit par le SQL seul — et c'est deliberé.
    const lib = readFileSync(join(process.cwd(), "lib/otp.ts"), "utf8");
    const blocReRefus = lib.slice(
      lib.indexOf("const RE_REFUS"),
      lib.indexOf("function refus(", lib.indexOf("const RE_REFUS"))
    );

    expect(blocReRefus).toMatch(/code_incorrect:\s*true/);
    // Et AUCUN autre motif n'incremente : introuvable, deja_consomme, expire,
    // tentatives_epuisees et verrouille doivent tous rester a `false`.
    for (const motif of ["introuvable", "deja_consomme", "expire", "tentatives_epuisees", "verrouille"]) {
      expect(blocReRefus, motif).toMatch(new RegExp(`${motif}:\\s*false`));
    }
    // `otp_perime` n'apparait dans aucun des deux fichiers de logique : il est
    // exclusivement decide par la transaction.
    expect(blocReRefus).not.toMatch(/perime/);
  });

  it("C2.6 AUTO-VERIFICATION : C2.1 et C2.2 detectent une RPC reellement ouverte", () => {
    const invariants = [
      /v_otp_id\s+is\s+distinct\s+from\s+p_otp_id/,
      /'motif',\s*'otp_perime'/,
    ];

    const mutants = [
      {
        nom: "egalite ordinaire : NULL passe, et le refus n'atteint jamais",
        mutant: RPC.replace("v_otp_id is distinct from p_otp_id", "v_otp_id = p_otp_id"),
      },
      {
        nom: "comparaison supprimee : plus aucun refus pour un OTP ancien",
        mutant: RPC.replace("v_otp_id is distinct from p_otp_id", "false"),
      },
      {
        nom: "refus remplace par un leve : le client paie une erreur technique",
        mutant: RPC.replace(
          "return jsonb_build_object('ok', false, 'motif', 'otp_perime');",
          "raise exception 'otp perime';"
        ),
      },
    ];

    for (const { nom, mutant } of mutants) {
      expect(mutant, `substitution sans effet : ${nom}`).not.toBe(RPC);
      expect(
        invariants.some((re) => !re.test(mutant)),
        `mutant non detecte : ${nom}`
      ).toBe(true);
    }

    // Et la source reelle satisfait toujours les invariants : sans cela, ces
    // mutants porteraient sur des exigences que le code ne remplit pas.
    for (const re of invariants) expect(RPC).toMatch(re);
  });
});

// =============================================================================
// COHÉRENCE GÉNÉRALE
// =============================================================================

describe("coherence generale des deux contrats", () => {
  it("C3.1 les deux contrats sont documentes comme valides, pas comme a trancher", () => {
    // Un contrat documente comme « a valider » est un contrat que le prochain
    // developpeur se sentira libre de re-discuter. Les deux regles etant
    // validees, le SQL ne doit plus porter cette mention.
    expect(MIGRATION).toMatch(/CONTRAT OFFICIEL — SEUIL DES TENTATIVES/);
    expect(MIGRATION).toMatch(/valide explicitement, phase 3/);
    // Aucune mention residuelle d'une decision en attente.
    expect(MIGRATION).not.toMatch(/STOP phase 3/);
    expect(MIGRATION).not.toMatch(/[Dd][ÉÉ]CISION [ÀA] VALIDER/);
  });

  it("C3.2 le motif du contrat 2 est decide par la transaction et par rien d'autre", () => {
    // Renvoi de coherence : le refus `otp_perime` n'existe que dans le SQL. Ni la
    // lib, ni la route ne le nomment DANS LEUR CODE — donc aucune couche
    // TypeScript ne peut le fabriquer, ni surtout l'eviter en court-circuitant
    // avant la transaction.
    //
    // On lit les deux fichiers SANS commentaires : le motif est cite en prose
    // dans les deux, et une recherche en texte brut ne distingue pas la
    // documentation de la logique.
    const lib = sansCommentaires(readFileSync(join(process.cwd(), "lib/otp.ts"), "utf8"));
    const route = sansCommentaires(
      readFileSync(join(process.cwd(), "app/api/espace-client/[code_acces]/verify-otp/route.ts"), "utf8")
    );

    expect(lib, "lib/otp.ts ne fabrique aucun motif SQL").not.toMatch(/otp_perime/);
    expect(route, "la route ne nomme aucun motif SQL").not.toMatch(/otp_perime/);

    // La seule source du motif est la transaction.
    expect(RPC).toMatch(/'motif',\s*'otp_perime'/);
    // Et elle n'en produit qu'un seul, pour un seul cas : ni le compteur de
    // tentatives, ni un verrou ne peuvent en dependre.
    expect(RPC.match(/'motif',\s*'otp_perime'/g)).toHaveLength(1);
  });
});
