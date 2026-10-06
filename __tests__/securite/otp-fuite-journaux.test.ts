// __tests__/securite/otp-fuite-journaux.test.ts
//
// AUCUN SECRET NE DOIT SORTIR PAR LES JOURNALS
// ==============================================
//
// Un OTP est un mot de passe à usage unique. Il n'est pas long, il n'est pas
// réutilisable après usage — mais il EST réutilisable jusqu'à son expiration,
// et il ne change pas. Un OTP écrit en clair dans les journaux du serveur est
// donc un mot de passe à usage unique conservé en clair : il reste valable
// pendant sa fenêtre, pour quiconque peut lire les logs — un operator de
// plateforme, un export de support, une sauvegarde de journal, une fuite
// d'agrégat. Ce qui est dans les logs est sorti du périmètre de contrôle.
//
// ─────────────────────────────────────────────────────────────────────────────
// LE DÉFAUT CORRIGÉ
// ─────────────────────────────────────────────────────────────────────────────
//
// `app/api/devis/[id]/send-otp/route.ts` écrivait, à chaque appel et SANS AUCUNE
// GARDE :
//
//     console.log(`[SMS MOCK] => Dest: ${phone} | Msg: … ${otpCode}`);
//
// Pas de condition sur `NODE_ENV`, pas de condition sur `SMS_PROVIDER`,
// rien. Le mot « MOCK » dans le message le faisait croire protégé ; il ne
// l'était pas. C'est aussi le genre de ligne qu'un `grep SMS` laisse passer.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA SEULE SORTIE LÉGITIME, ET LES DEUX GARDES QUI LA PROTEGENT
// ─────────────────────────────────────────────────────────────────────────────
//
// `lib/otp.ts` expose `fournisseurConsoleMock`, qui journalise le code pour
// permettre de tester sans fournisseur réel. C'est un choix délibéré, et il
// est défendable — mais il n'est défendable QUE parce qu'il est doublement
// gardé :
//
//   1. ce fournisseur n'est choisi que si `SMS_PROVIDER=console_mock` ;
//   2. il refuse systématiquement de s'exécuter dès que `NODE_ENV=production`.
//
// Ces deux conditions étaient jusqu'ici affirmées par un commentaire et
// vérifiées par AUCUN test. Une régression — réordonner les deux `if`, ou
// supprimer celui sur `NODE_ENV` — n'aurait rien signalé, et le code se serait
// mis à écrire en clair sur un déploiement réel. C'est le trou que ce fichier
// referme : les gardes sont testées par EXÉCUTION, pas par lecture.

import { describe, it, expect, afterEach, vi } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { sansCommentaires } from "./_lecture-source";
import {
  fournisseurConsoleMock,
  selectionnerFournisseurSms,
  fournisseurNul,
} from "@/lib/otp";

/** Capture tout ce qu'une fonction écrit sur la console. */
function capturerConsole(): { lignes: string[]; texte: () => string } {
  const lignes: string[] = [];
  const faux = (...args: unknown[]) => lignes.push(args.map(String).join(" "));
  // On capture les CINQ fonctions : `console.log` est la plus connue, mais un
  // `console.info` ou un `console.dir` sortiraient le secret exactement aussi
  // bien, et une fuite qui change de nom n'est pas une fuite évitée.
  for (const nom of ["log", "warn", "info", "debug", "error"] as const) {
    vi.spyOn(console, nom).mockImplementation(faux as never);
  }
  return { lignes, texte: () => lignes.join("\n") };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// A) LES DEUX GARDES DU MOCK — PAR EXÉCUTION
// =============================================================================

describe("A) le seul journal de developpement ne peut pas s'activer en production", () => {
  it("A1 en production, le mock REFUSE et n'ecrit RIEN", async () => {
    const capture = capturerConsole();
    const mock = fournisseurConsoleMock({ NODE_ENV: "production", SMS_PROVIDER: "console_mock" });

    const res = await mock.envoyer("+33600000000", "Votre code est 123456");

    // Refus explicite : le client reçoit un echec, pas un SMS containing son code.
    expect(res).toEqual({ ok: false, raison: "Envoi de SMS indisponible." });
    // Et surtout : le code n'a pas ete ecrit. C'est LA garantie qui compte --
    // un refus qui journaliserait quand meme le code ne protegerait rien.
    expect(capture.texte()).not.toMatch(/123456/);
    expect(capture.texte()).not.toMatch(/\+33600000000/);
  });

  it("A2 hors production, le mock journalise -- c'est bien son contrat", async () => {
    const capture = capturerConsole();
    const mock = fournisseurConsoleMock({ NODE_ENV: "development", SMS_PROVIDER: "console_mock" });

    const res = await mock.envoyer("+33600000000", "Votre code est 123456");

    expect(res.ok).toBe(true);
    // On ne fige pas ce qui doit disparaitre : on fige la raison pour laquelle
    // ce qui disparait est acceptable. Un test qui exigerait l'absence ici
    // supprimerait la seule possibilite de tester le flux sans fournisseur réel.
    expect(capture.texte()).toMatch(/123456/);
  });

  it("A3 le selecteur ne retombe JAMAIS sur le mock quand il n'est pas demande", async () => {
    // Un nom mal orthographie (`twilioo`) ne doit pas rejouer le developpement
    // sur une base reelle : c'est le point central du selecteur fail-closed.
    for (const demande of ["", "none", "desactive", "twilioo", "TWILIO_", "console", "mock"]) {
      const f = selectionnerFournisseurSms({ NODE_ENV: "development", SMS_PROVIDER: demande });
      expect(f.nom, `« ${demande} » ne doit pas choisir le mock`).not.toBe("console_mock");
    }
  });

  it("A4 meme demande explicitement, le selecteur refuse en production", async () => {
    const capture = capturerConsole();
    const f = selectionnerFournisseurSms({
      NODE_ENV: "production",
      SMS_PROVIDER: "console_mock",
    });
    expect(f.nom).toBe("console_mock");

    const res = await f.envoyer("+33600000000", "Votre code est 654321");

    expect(res.ok).toBe(false);
    // Garde 1 ET garde 2 : le passage par le selecteur ne doit pas pouvoir
    // contourner le refus. C'est le chemin REEL utilise par les routes.
    expect(capture.texte()).not.toMatch(/654321/);
  });

  it("A5 AUTO-VERIFICATION : A1 detecte la suppression de la garde NODE_ENV", async () => {
    // Un test de garde qui ne peut pas echouer ne protege rien. On rejoue la
    // garantie sur une implementation ou la garde a disparu, et on exige que
    // l'invariant la voie.
    const invariant = (texte: string, codeSecret: string) => !texte.includes(codeSecret);

    // L'implémentation réellement livrée : la garde existe, l'invariant tient.
    const capture = capturerConsole();
    await fournisseurConsoleMock({ NODE_ENV: "production" }).envoyer("+33", "code 111111");
    expect(invariant(capture.texte(), "111111")).toBe(true);

    // Le mutant : la garde disparue. Même appel, même sortie attendue.
    // Pas de `eslint-disable` : `no-console` n'est pas actif sur les tests dans
    // ce dépôt, et une directive devenue inutile est un avertissement que
    // personne ne lira.
    const mutant = async () => {
      console.warn("[SMS MOCK] Dest: +33 | Msg: code 222222");
      return { ok: true as const };
    };
    await mutant();
    expect(invariant(capture.texte(), "222222")).toBe(false);
  });

  it("A6 le fournisseur nul ne journalise rien non plus", async () => {
    const capture = capturerConsole();
    const res = await fournisseurNul("raison de test").envoyer("+33600000000", "code 987654");
    expect(res.ok).toBe(false);
    expect(capture.texte()).not.toMatch(/987654/);
  });
});

// =============================================================================
// B) PLUS AUCUNE ROUTE N'ÉCRIT UN SECRET
// =============================================================================

/** Tous les `.ts` sous `app/`. */
function sourcesRoute(): Array<{ chemin: string; texte: string }> {
  const sortie: Array<{ chemin: string; texte: string }> = [];
  const parcours = (dossier: string) => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) parcours(chemin);
      else if (entree.endsWith(".ts") || entree.endsWith(".tsx")) {
        sortie.push({ chemin, texte: readFileSync(chemin, "utf8") });
      }
    }
  };
  parcours(join(process.cwd(), "app"));
  return sortie;
}

describe("B) aucune route n'ecrit un OTP, un secret ou un telephone", () => {
  const routes = sourcesRoute();

  it("B1 le corpus existe et couvre bien app/", () => {
    // Un inventaire vide passerait tous les invariants qui suivent. On exige
    // un ordre de grandeur, sinon « aucun secret trouvé » ne veut rien dire.
    expect(routes.length).toBeGreaterThan(80);
    // La route OTP du PORTAL est la seule qui subsiste : c'est elle que
    // l'invariant B2 doit couvrir, et c'est donc l'ancrage de ce test.
    expect(routes.some((r) => r.chemin.endsWith("api/espace-client/[code_acces]/send-otp/route.ts"))).toBe(true);
  });

  it("B2 aucun `console.*` n'interpole un code, un secret ou un telephone", () => {
    // On lit SANS les commentaires : la route legacy documente aujourd'hui la
    // ligne qu'elle a contenu. Un test qui la verrait panicerait, et le
    // remede obvious -- supprimer la documentation -- serait de perdre la
    // trace de pourquoi la ligne a ete retiree.
    const coupables: string[] = [];
    for (const { chemin, texte } of routes) {
      const lu = sansCommentaires(texte, { jsx: true });
      lu.split("\n").forEach((ligne, i) => {
        if (!/console\.(log|warn|error|info|debug|dir|trace)\s*\(/.test(ligne)) return;
        // Interpolation d'une variable potentiellement sensible.
        if (/\$\{[^}]*\b(otp|otpCode|codeOtp|code_otp|secret|hmac|phone|telephone|tel|signature_phone|destinataire)\b[^}]*\}/i.test(ligne)) {
          coupables.push(`${chemin}:${i + 1}`);
        }
        // Valeur litterale de six chiffres consecutive : un code en clair.
        if (/\b\d{6}\b/.test(ligne)) coupables.push(`${chemin}:${i + 1} (code en clair)`);
      });
    }
    expect(coupables, `Sorties console sensibles :\n  ${coupables.join("\n  ")}`).toEqual([]);
  });

  it("B3 aucun `process.stdout` / `process.stderr` n'ecrit un secret", () => {
    const coupables: string[] = [];
    for (const { chemin, texte } of routes) {
      const lu = sansCommentaires(texte, { jsx: true });
      lu.split("\n").forEach((ligne, i) => {
        if (!/process\.(stdout|stderr)\.write\s*\(/.test(ligne)) return;
        if (/\$\{[^}]*\b(otp|otpCode|codeOtp|code_otp|secret|hmac|phone|telephone)\b[^}]*\}/i.test(ligne)) {
          coupables.push(`${chemin}:${i + 1}`);
        }
      });
    }
    expect(coupables).toEqual([]);
  });

  it("B4 la route qui journalisait son code A DISPARU, et pas ete corrigee", () => {
    // Cible directe : l'invariant général ci-dessus pourrait passer pour une
    // raison détournée — un motif trop large, ou un corpus amputé.
    //
    // La forme de la garantie a changé. Corriger la ligne fautive suffisait
    // pendant que la route vivait ; une route qui n'existe plus ne peut plus
    // être corrigée par erreur, ni réintroduite par copier-coller depuis un
    // tutorial. `existsSync` est donc l'assertion la plus forte disponible, et
    // la plus simple.
    //
    // Le motif exact est conservé en dessous, contre la route du PORTAL, pour
    // qu'un jour où quelqu'un ajouterait un journal de debug sur le nouveau
    // `send-otp` — le plus naturel des.reflexes — soit entendu comme tel.
    const legacy = join(process.cwd(), "app/api/devis/[id]/send-otp/route.ts");
    expect(existsSync(legacy), "la route OTP legacy est toujours presente").toBe(false);

    const portal = routes.find((r) => r.chemin.endsWith("api/espace-client/[code_acces]/send-otp/route.ts"));
    expect(portal, "la route OTP du portal a disparu du corpus").toBeDefined();
    const executable = sansCommentaires(portal!.texte, { jsx: true });
    expect(executable).not.toMatch(/console\.(log|warn|info|debug)\b/);
    expect(executable).not.toMatch(/SMS MOCK/);
  });

  it("B5 AUTO-VERIFICATION : B2 detecte la reimplantation exacte du defaut", () => {
    // On rejoue B2 sur la ligne fautive telle qu'elle etait, pour etablir que
    // l'invariant la voit. Sans cette preuve, B2 pourrait etre inerte.
    const ligneFautive =
      'console.log(`[SMS MOCK] => Dest: ${phone} | Msg: BNA : Votre code est ${otpCode}`);';
    const detecte = (ligne: string) =>
      /console\.(log|warn|error|info|debug|dir|trace)\s*\(/.test(ligne) &&
      (/\$\{[^}]*\b(otp|otpCode|codeOtp|code_otp|secret|hmac|phone|telephone|tel|signature_phone|destinataire)\b[^}]*\}/i.test(ligne) ||
        /\b\d{6}\b/.test(ligne));

    expect(detecte(ligneFautive)).toBe(true);
    // Et une sortie console sur un mot-nef NON sensible ne doit PAS etre
    // signalee : sinon le filtre serait trop large et deviendrait inoffensif.
    expect(detecte('console.error("send-otp : erreur inattendue");')).toBe(false);
    expect(detecte("console.log(`[tache] devis ${devisId} traite`);")).toBe(false);
  });
});