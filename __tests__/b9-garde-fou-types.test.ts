// O3-B9 — GARDE-FOU COMPILATION : le cast ne peut pas revenir
// ============================================================================
//
// Le défaut B9 était invisible au `tsc` POUR UNE SEULE RAISON : un
// `as TablesInsert<"clients">` (ou `as Omit<TablesInsert<"devis">, "entreprise_id">`)
// neutralisait l'exigence `entreprise_id: string` du type `Insert`.
//
// Ce fichier ne cherche pas la chaîne `"as TablesInsert"` dans les sources — un
// tel test se contente de renommer le cast et passe à côté du vrai risque. Il
// pose la VRAIE question au VRAI compilateur :.
//
//     « TypeScript rejette-t-il aujourd'hui un insert sur table racine sans
//       entreprise_id, et accepte-t-il le même payload avec entreprise_id ? »
//
// La vérification se fait via `tsc` sur des fragments synthétiques, pas via
// `grep` : c'est la seule façon de prouver que le système de types fait
// réellement son travail.
//
// PERFORMANCE : une seule invocation de `tsc` pour TOUS les fragments (ils sont
// écrits dans un même répertoire temporaire puis compilés d'un bloc). Une
// invocation par fragment coûterait ~10 s chacune sur cette machine, soit
// plusieurs minutes pour ce seul fichier.
// ============================================================================

import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RACINE = process.cwd();
const UUID = "11111111-1111-4111-8111-111111111111";

/**
 * Charge utile minimale mais VALIDE pour chaque table, hors `entreprise_id`.
 * (Les colonnes obligatoires ont été relevées dans `types/supabase.ts` : sans
 * elles, le compilateur signalerait des propriétés inconnues et le test
 * verifierait autre chose que ce qu'il prétend.)
 */
const PAYLOAD_VALIDE: Record<string, string> = {
  clients: `nom: "x"`,
  fournisseurs: `nom: "x"`,
  notes_patron: `contenu: "x"`,
  devis: `numero: "D-1"`,
  depenses_chantier: `date: "2026-09-26", nature: "materiaux", montant_ht: 100`,
  frais_interim: `agence_nom: "Adecco", interimaire_nom: "Gael", salaire_brut: 2500`,
  commandes: `designation: "Bardage"`,
};

/** Tables racines (aucun trigger : `entreprise_id` est Incontournable). */
const RACINES = ["clients", "fournisseurs", "notes_patron", "devis"] as const;

/** Tables enfants (`chantier_id` doit rester optionnel). */
const ENFANTS = ["depenses_chantier", "frais_interim", "commandes"] as const;

/** Message d'erreur du compilateur, par nom de fragment. */
const erreursParFragment = new Map<string, string[]>();

/** Fragments à compiler : nom → corps TypeScript. */
const fragments = new Map<string, string>();

for (const t of RACINES) {
  // 1. Sans `entreprise_id` → DOIT être refusé, et pour la bonne raison.
  fragments.set(
    `${t}__sans`,
    `export const v: TablesInsert<"${t}"> = { ${PAYLOAD_VALIDE[t]} };`,
  );
  // 2. Avec `entreprise_id` → doit passer. C'est la forme que le correctif
  //    produit désormais, SANS assertion.
  fragments.set(
    `${t}__avec`,
    `export const v: TablesInsert<"${t}"> = { ${PAYLOAD_VALIDE[t]}, entreprise_id: "${UUID}" };`,
  );
  // 3. Le cast historique réintroduit : il doit redevenir INUTILISABLE.
  fragments.set(
    `${t}__cast`,
    `export const v: TablesInsert<"${t}"> = { ${PAYLOAD_VALIDE[t]} } as Omit<TablesInsert<"${t}">, "entreprise_id">;`,
  );
}

for (const t of ENFANTS) {
  // `entreprise_id` fourni, `chantier_id` OMIS : le mode « sans affectation »
  // doit rester exprimable. Une erreur ici = la règle métier a été cassée.
  fragments.set(
    `${t}__sansChantier`,
    `export const v: TablesInsert<"${t}"> = { ${PAYLOAD_VALIDE[t]}, entreprise_id: "${UUID}" };`,
  );
  // `chantier_id` fourni : le trigger doit pouvoir faire son travail.
  fragments.set(
    `${t}__avecChantier`,
    `export const v: TablesInsert<"${t}"> = { ${PAYLOAD_VALIDE[t]}, chantier_id: "${UUID}", entreprise_id: "${UUID}" };`,
  );
}

// Cas transverses.
fragments.set(
  `predicat__retrecissement`,
  `
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function estUuid(value: string | null): value is string {
    return typeof value === "string" && UUID_RE.test(value);
  }
  export function f(e: string | null): string {
    if (!estUuid(e)) throw new Error("x");
    return e; // doit rétrécir SANS assertion
  }`,
);

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "o3b9-tsc-"));
  try {
    for (const [nom, corps] of fragments) {
      writeFileSync(
        join(dir, `${nom}.ts`),
        `import type { TablesInsert } from "${join(RACINE, "types/supabase")}";\n${corps}\n`,
        "utf8",
      );
    }
    let sortie = "";
    try {
      sortie = execFileSync(
        "npx",
        [
          "tsc",
          "--noEmit",
          "--strict",
          "--skipLibCheck",
          "--target",
          "ES2017",
          "--module",
          "esnext",
          "--moduleResolution",
          "bundler",
          ...[...fragments.keys()].map((n) => join(dir, `${n}.ts`)),
        ],
        { cwd: RACINE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      sortie = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    // Les messages sont de la forme : chemin/vers/<nom>.ts(l,c): error TSxxxx: …
    for (const ligne of sortie.split("\n")) {
      const m = ligne.match(/o3b9-tsc-[^/]*\/([^/(]+)\.ts/);
      if (!m) continue;
      const nom = m[1];
      const liste = erreursParFragment.get(nom) ?? [];
      liste.push(ligne);
      erreursParFragment.set(nom, liste);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 300_000);

function erreurs(nom: string): string {
  return (erreursParFragment.get(nom) ?? []).join("\n");
}

// ════════════════════════════════════════════════════════════════════════════
// A. Tables racines — entreprise_id est réellement obligatoire
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B9 — le type Insert EXIGE entreprise_id sur les tables racines", () => {
  for (const t of RACINES) {
    it(`${t} : payload SANS entreprise_id → refusé, et pour la bonne raison`, () => {
      const e = erreurs(`${t}__sans`);
      // La preuve utile n'est pas « ça compile mal » mais « ça compile mal À
      // CAUSE de entreprise_id ». Un message invoquant une autre colonne ne
      // prouverait rien.
      expect(e).toMatch(/entreprise_id/);
      expect(e).toMatch(/TS(2322|2341|2739|2741)/);
    });

    it(`${t} : payload AVEC entreprise_id → compile (aucun cast nécessaire)`, () => {
      // C'est la forme que produisent désormais les 6 sites racines. Si ce
      // fragment échoue, c'est que le contrat du dépôt a changé.
      expect(erreurs(`${t}__avec`)).toBe("");
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// B. Le cast ne peut plus servir d'échappatoire
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B9 — réintroduire le cast rendrait le correctif à compiler", () => {
  for (const t of RACINES) {
    it(`${t} : le cast Omit<…, "entreprise_id"> ne satisfait plus TablesInsert`, () => {
      // Réintroduire `as Omit<TablesInsert<T>, "entreprise_id">` sur un des 6
      // sites racines ressusciterait exactement le trou du B9. Cette
      // affectation — le cast suivi d'un Insert typé — doit rester IMPOSSIBLE.
      const e = erreurs(`${t}__cast`);
      expect(e).toMatch(/entreprise_id/);
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// C. B9-bis — le chantier reste optionnel
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B9-bis — le mode « sans chantier » reste exprimable au niveau des types", () => {
  for (const t of ENFANTS) {
    it(`${t} : chantier_id omis du payload → compile (mode sans affectation)`, () => {
      // Si ce fragment cessait de compiler, c'est que `chantier_id` serait
      // devenu obligatoire — c'est-à-dire qu'un changement PRODUIT aurait été
      // introduit par la bande. Le GO l'interdit.
      expect(erreurs(`${t}__sansChantier`)).toBe("");
    });

    it(`${t} : chantier_id fourni → compile (le trigger reste maître)`, () => {
      expect(erreurs(`${t}__avecChantier`)).toBe("");
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// D. La garde de type reste un prédicat
// ════════════════════════════════════════════════════════════════════════════

describe("O3-B9 — estUuid reste un prédicat de type (indispensable aux 6 sites racines)", () => {
  it("permet le rétrécissement de string | null vers string sans assertion", () => {
    // Toute la correction repose là-dessus : sans rétrécissement, il faudrait
    // réintroduire un cast pour écrire `entreprise_id` — exactement le défaut
    // qu'on vient de supprimer.
    expect(erreurs("predicat__retrecissement")).toBe("");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// E. Garde STRUCTUREL — le seul contrôle qui détecte un cast réintroduit
// ════════════════════════════════════════════════════════════════════════════
//
// Pourquoi un contrôle de source ici, alors que le fichier refuse d'en faire un
// ailleurs ? Parce que la mutation l'a montré : réintroduire
// `as TablesInsert<"clients">` dans la page REDONNE au `tsc` un code vert. Une
// assertion de type pure ne voit rien.
//
// Ce contrôle ne REMPLACE donc pas les tests de comportement : il couvre
// précisément le canal que ni le compilateur ni les tests DOM ne peuvent voir.
// Il est volontairement étroit — une table, un motif, un fichier attendu.

/** Fichiers de production où un cast sur la table donnée masquerait le défaut. */
const PRODUCTEURS: Record<(typeof RACINES)[number], string[]> = {
  clients: ["app/bureau/clients/page.tsx"],
  fournisseurs: [
    "app/bureau/fournisseurs/page.tsx",
    "app/bureau/documents-compta/page.tsx",
  ],
  notes_patron: ["app/terrain/notes/page.tsx", "components/DashboardAccueil.tsx"],
  devis: ["app/bureau/sav/[id]/page.tsx"],
};

describe("O3-B9 — garde structurel : aucun cast sur les tables racines", () => {
  for (const [table, fichiers] of Object.entries(PRODUCTEURS)) {
    it(`${table} : aucun des ${fichiers.length} producteur(s) ne porte de cast`, () => {
      // Deux motifs, parce que le B9 en utilisait deux : l'un direct
      // (`as TablesInsert<"x">`) et l'un via `Omit` (sur `devis`), qui retirait
      // `entreprise_id` du type AVANT même l'assertion.
      const motifs = [
        new RegExp(`as\\s+(unknown\\s+as\\s+)?TablesInsert<"${table}"`),
        new RegExp(`Omit<TablesInsert<"${table}">\\s*,\\s*"entreprise_id"`),
      ];
      for (const f of fichiers) {
        const source = readFileSync(join(RACINE, f), "utf8");
        for (const motif of motifs) {
          expect(motif.test(source), `${f} porte encore un cast masquant sur ${table}`)
            .toBe(false);
        }
      }
    });
  }

  it("le contre-exemple est bien réel : le motif détecte un cast s'il existe", () => {
    // Auto-vérification du détecteur : sans elle, un motif mal écrit
    // « détecterait » n'importe quoi et les tests ci-dessus passeraient à vide.
    const fauxPositif = `supabase.from("clients").insert({ nom } as TablesInsert<"clients">)`;
    const motif = new RegExp(`as\\s+(unknown\\s+as\\s+)?TablesInsert<"clients"`);
    expect(motif.test(fauxPositif)).toBe(true);
    expect(motif.test(`supabase.from("clients").insert({ nom, entreprise_id })`)).toBe(
      false,
    );
  });
});
