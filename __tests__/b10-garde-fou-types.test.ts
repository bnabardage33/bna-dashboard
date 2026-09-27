// O3-B10 — GARDE-FOU COMPILATION : le cast ne peut pas revenir
// ============================================================================
//
// Le défaut B10 était invisible au `tsc` POUR UNE SEULE RAISON : l'upsert était
// écrit
//
//     .upsert({ cle, valeur: newVal } as TablesInsert<"parametres_finance">, …)
//
// or `parametres_finance.Insert` EXIGE `entreprise_id: string`. Le cast
// neutralisait l'exigence au compilateur, et l'omission ne pouvait donc pas
// être vue.
//
// Ce fichier ne cherche pas la chaîne `"as TablesInsert"` dans les sources — un
// tel test se contente de renommer le cast et passe à côté du vrai risque. Il
// pose la VRAIE question au VRAI compilateur :
//
//     « TypeScript rejette-t-il aujourd'hui un upsert sur parametres_finance
//       sans entreprise_id, et accepte-t-il le même payload avec ? »
//
// Et surtout, il pose la question inverse (§B) : le cast rend-il effectivement
// le contrôle INOPÉRANT ? Sans ce contre-exemple, un test qui affirmait
// « le cast casse la vérification » pourrait être faux et le suite passerait
// à vide.
//
// PERFORMANCE : une seule invocation de `tsc` pour TOUS les fragments (ils sont
// écrits dans un même répertoire temporaire puis compilés d'un bloc). Une
// invocation par fragment coûterait ~10 s chacune sur cette machine.
// ============================================================================

import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RACINE = process.cwd();

/** Toutes les colonnes de `parametres_finance.Insert` SAUF `entreprise_id`. */
const PAYLOAD_SANS_ENTREPRISE = `
  const payload = { cle: "solde_bancaire", valeur: 2500 };
`;

const fragments = new Map<string, string>();

// A — ce que le correctif fait : la garde de type impose le champ.
fragments.set(
  `parametres_finance__avec`,
  `
  const payload = { entreprise_id: UUID, cle: "solde_bancaire", valeur: 2500 };
  export const t: TablesInsert<"parametres_finance"> = payload;`,
);

fragments.set(
  `parametres_finance__sans`,
  `
  ${PAYLOAD_SANS_ENTREPRISE}
  export const t: TablesInsert<"parametres_finance"> = payload;`,
);

// B — le contre-exemple qui prouve que le garde a des dents.
fragments.set(
  `parametres_finance__avec_cast`,
  `
  ${PAYLOAD_SANS_ENTREPRISE}
  // Le cast EXIGE par le code d'origine : il rend l'omission indétectable.
  export const t = payload as TablesInsert<"parametres_finance">;`,
);

// C — le mécanisme dont dépend le correctif : le prédicat de type rétrécit
// `string | null` en `string` SANS assertion, donc `entreprise_id` est
// conformément un `string` dans le payload.
fragments.set(
  `predicat__retrecissement`,
  `
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function estUuid(value: string | null): value is string {
    return typeof value === "string" && UUID_RE.test(value);
  }
  export function ecrire(entreprise_id: string | null): TablesInsert<"parametres_finance"> {
    if (!estUuid(entreprise_id)) throw new Error("contexte entreprise absent");
    // Aucune assertion : c'est le prédicat qui a rétréci le type.
    return { cle: "solde_bancaire", valeur: 0, entreprise_id };
  }`,
);

const UUID = "11111111-1111-4111-8111-111111111111";

const erreursParFragment = new Map<string, string[]>();

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "o3b10-tsc-"));
  try {
    for (const [nom, corps] of fragments) {
      writeFileSync(
        join(dir, `${nom}.ts`),
        `import type { TablesInsert } from "${join(RACINE, "types/supabase")}";\n` +
          `const UUID = "${UUID}";\n` +
          `${corps}\n`,
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
    for (const ligne of sortie.split("\n")) {
      const m = ligne.match(/o3b10-tsc-[^/]*\/([^/(]+)\.ts/);
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

describe("O3-B10 — le type Insert EXIGE entreprise_id sur parametres_finance", () => {
  it("A1 payload AVEC entreprise_id → accepté par le compilateur", () => {
    expect(erreurs("parametres_finance__avec")).toBe("");
  });

  it("A2 payload SANS entreprise_id → refusé", () => {
    expect(erreurs("parametres_finance__sans")).toMatch(/error TS/);
  });

  it("A3 … et refusé POUR LA BONNE RAISON : c'est bien entreprise_id qui manque", () => {
    // La preuve utile n'est pas « ça compile mal » mais « ça compile mal À
    // CAUSE de entreprise_id ». Un message invoquant une autre colonne ne
    // prouverait rien sur le défaut B10.
    const e = erreurs("parametres_finance__sans");
    expect(e).toMatch(/entreprise_id/);
    expect(e).toMatch(/TS2345|TS2739|TS2741|TS2353/);
  });
});

describe("O3-B10 — le cast neutralisait bien le contrôle (contre-exemple)", () => {
  it("B1 le MÊME payload SANS entreprise_id, mais CASTÉ, compile sans erreur", () => {
    // C'est la preuve que le cast du code d'origine rendait l'omission
    // indétectable. Sans ce test, « le cast casse la vérification » serait une
    // affirmation non vérifiée.
    expect(erreurs("parametres_finance__avec_cast")).toBe("");
  });

  it("B2 le cast dérobe exactement le contrôle que A2 a démontré", () => {
    // B1 le compile, A2 le refuse : même payload, seule différence = le cast.
    expect(erreurs("parametres_finance__avec_cast")).toBe("");
    expect(erreurs("parametres_finance__sans")).toMatch(/error TS/);
  });
});

describe("O3-B10 — le prédicat de type rend le champ conforme SANS assertion", () => {
  it("C1 `estUuid` suffit à produire un payload valide pour le vrai compilateur", () => {
    // C'est le mécanisme qui remplace le cast dans `useParametreFinance` :
    // rétrécir `string | null` en `string` rend `entreprise_id` conforme.
    expect(erreurs("predicat__retrecissement")).toBe("");
  });
});
