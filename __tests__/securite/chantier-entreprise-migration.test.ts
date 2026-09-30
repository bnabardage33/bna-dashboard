// O3-B8 — Création de chantier (`chantiers`) sans `entreprise_id`
// ============================================================================
//
// @vitest-environment node
//
// Rappel du défaut (cf. /tmp/opencode/rapport-audit-o3b8.md) :
// `chantiers` est la RACINE de la hiérarchie entreprise. Depuis la migration
// d'isolation du 2026-09-22, `chantiers.entreprise_id` est NOT NULL, sans
// DEFAULT, et SANS trigger — `tg_set_entreprise_par_chantier()` résout la valeur
// en lisant le PARENT, or la racine n'a pas de parent. Les deux points d'insert
// navigateur envoyaient un payload sans `entreprise_id`, dissimulé par le double
// cast `Omit<TablesInsert<"chantiers">, "entreprise_id">` qui neutralisait
// l'exigence du compilateur. La création de chantier était donc IMPOSSIBLE
// depuis l'interface : `NOT NULL` (23502) et/ou RLS `with check` (42501)
// rejetaient l'insertion, et l'utilisateur ne voyait qu'un `alert` porteur du
// message brut de PostgREST.
//
// Ce test ne fait que LIRE DES FICHIERS (`readFileSync`) : aucun besoin de DOM.
// L'environnement `node` évite d'ouvrir un jsdom, sur une machine où la mémoire
// disponible est le facteur limitant du pool de test.
//
// Les tests comportementaux qui exécutent réellement `handleSubmit` et
// `transformerEnChantier` sont dans `chantier-entreprise.test.tsx`.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const RACINE = join(process.cwd());

function source(relatif: string): string {
  return readFileSync(join(RACINE, relatif), "utf8");
}

/** Bloc de l'insert chantiers, du `.insert(` à la fermeture de l'appel. */
function blocInsert(texte: string, table: string): string {
  const depart = texte.indexOf(`.from("${table}").insert(`);
  expect(depart, `insert sur ${table} introuvable`).toBeGreaterThan(-1);
  const fin = texte.indexOf(");", depart);
  return texte.slice(depart, fin + 2);
}

const TERRAIN = "app/terrain/chantier/page.tsx";
const DEVIS_FACTURES = "app/bureau/devis-factures/page.tsx";

describe("O3-B8 — invariants de compilation (le cast ne doit plus exister)", () => {
  it("app/terrain/chantier/page.tsx : plus aucun cast Omit sur entreprise_id", () => {
    const s = source(TERRAIN);
    // Le cast peut être CITÉ dans un commentaire, ce qui est autorisé ; ce qui
    // est interdit, c'est qu'il soit appliqué au payload.
    const sansCommentaires = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sansCommentaires).not.toMatch(/as Omit<TablesInsert<"chantiers">/);
    expect(sansCommentaires).not.toMatch(/as TablesInsert<"chantiers">/);
  });

  it("app/bureau/devis-factures/page.tsx : plus aucun cast Omit sur entreprise_id", () => {
    const s = source(DEVIS_FACTURES);
    const sansCommentaires = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sansCommentaires).not.toMatch(/as Omit<TablesInsert<"chantiers">/);
    expect(sansCommentaires).not.toMatch(/as TablesInsert<"chantiers">/);
  });

  it("les 4 autres occurrences du même idiome sont INTACTES (hors périmètre B8)", () => {
    // Garde-fou anti-débordement : B8 ne doit toucher que `chantiers`.
    const s = source(DEVIS_FACTURES);
    // `devis` / `pv_receptions` restent castés ailleurs ; on vérifie ici que
    // les inserts non-chantiers du même fichier n'ont pas été "corrigés".
    const insertsFactures = s.match(/\.from\("factures"\)\.insert\([^;]*?\);/g) || [];
    expect(insertsFactures.length).toBeGreaterThan(0);
    for (const i of insertsFactures) {
      expect(i).toMatch(/as TablesInsert<"factures">/);
    }
  });
});

describe("O3-B8 — entreprise_id est explicitement fourni à l'insert", () => {
  it("terrain : le payload de l'insert contient entreprise_id", () => {
    const bloc = blocInsert(source(TERRAIN), "chantiers");
    // Forme abrégée (`entreprise_id,`) ou explicite (`entreprise_id: …`) :
    // les deux recopient la variable résolue, aucune ne peut être un littéral.
    expect(bloc).toMatch(/\n\s*entreprise_id\s*[:,]/);
    // Aucune valeur en dur à la place de la variable résolue.
    expect(bloc).not.toMatch(/entreprise_id\s*:\s*["'`]/);
  });

  it("devis → chantier : le payload de l'insert contient entreprise_id", () => {
    const bloc = blocInsert(source(DEVIS_FACTURES), "chantiers");
    expect(bloc).toMatch(/\n\s*entreprise_id\s*[:,]/);
    expect(bloc).not.toMatch(/entreprise_id\s*:\s*["'`]/);
  });

  it("les deux chemins résolvent l'entreprise via resoudreContexteEntreprise(null)", () => {
    expect(source(TERRAIN)).toMatch(/resoudreContexteEntreprise\(null\)/);
    expect(source(DEVIS_FACTURES)).toMatch(/resoudreContexteEntreprise\(null\)/);
  });

  it("la résolution précède l'insert ET la garde precede l'insert", () => {
    for (const f of [TERRAIN, DEVIS_FACTURES]) {
      const s = source(f);
      const iResoudre = s.indexOf("resoudreContexteEntreprise(null)");
      const iGuarde = s.indexOf("if (!estUuid(entreprise_id))");
      const iInsert = s.indexOf('.from("chantiers").insert(');
      expect(iResoudre, `${f} : résolution introuvable`).toBeGreaterThan(-1);
      expect(iGuarde, `${f} : garde fail-closed introuvable`).toBeGreaterThan(-1);
      expect(iInsert, `${f} : insert introuvable`).toBeGreaterThan(-1);
      expect(iResoudre).toBeLessThan(iGuarde);
      expect(iGuarde).toBeLessThan(iInsert);
    }
  });

  it("aucune constante de tenant en dur (BNA = 1111…, TEST = 2222…)", () => {
    for (const f of [TERRAIN, DEVIS_FACTURES]) {
      expect(source(f)).not.toMatch(/11111111-1111-4111-8111-111111111111/);
      expect(source(f)).not.toMatch(/22222222-2222-4222-8222-222222222222/);
    }
  });
});

describe("O3-B8 — fail-closed sur contexte entreprise absent ou invalide", () => {
  it("terrain : la garde existe, avec log ET message utilisateur", () => {
    const s = source(TERRAIN);
    const garde = s.slice(s.indexOf("if (!estUuid(entreprise_id))"), s.indexOf("if (!estUuid(entreprise_id))") + 700);
    expect(garde).toMatch(/console\.error/);
    expect(garde).toMatch(/alert\(/);
  });

  it("terrain : la garde remet l'indicateur d'état à zéro (pas de bouton bloqué)", () => {
    const s = source(TERRAIN);
    const garde = s.slice(s.indexOf("if (!estUuid(entreprise_id))"), s.indexOf("if (!estUuid(entreprise_id))") + 700);
    expect(garde).toMatch(/setCreationEnCours\(false\)/);
  });

  it("devis → chantier : la garde existe, avec log ET message utilisateur", () => {
    const s = source(DEVIS_FACTURES);
    const garde = s.slice(s.indexOf("if (!estUuid(entreprise_id))"), s.indexOf("if (!estUuid(entreprise_id))") + 700);
    expect(garde).toMatch(/console\.error/);
    expect(garde).toMatch(/alert\(/);
  });

  it("devis → chantier : la garde empêche le passage du devis à 'accepte'", () => {
    // Régression métier : sans ce retour anticipé, un devis finit marqué
    // « accepté » alors qu'aucun chantier n'a été créé. La mise à jour doit être
    // APRÈS la garde (l'ordre du source le garantit), et la garde doit
    // contenir un `return`.
    const s = source(DEVIS_FACTURES);
    const iGuarde = s.indexOf("if (!estUuid(entreprise_id))");
    const iAccepte = s.indexOf('.update({ statut: "accepte" })');
    expect(iAccepte).toBeGreaterThan(-1);
    expect(iGuarde).toBeLessThan(iAccepte);
    const garde = s.slice(iGuarde, iAccepte);
    expect(garde).toMatch(/return;/);
  });

  it("le garde estUuid du dépôt rejette absent, vide, non-UUID et version invalide", () => {
    // On extrait la regex RÉELLEMENT présente dans le code au lieu de la
    // réimplémenter ici. Une copie locale validerait sa propre syntaxe et ne
    // tuerait aucun mutant du garde-fou de production : c'est exactement le
    // piège que ce test a déjà commité une fois (mutant M8 survivant).
    for (const f of [TERRAIN, DEVIS_FACTURES]) {
      const m = source(f).match(/UUID_RE\s*=\s*\/([^\n/]+)\/([a-z]*);/);
      expect(m, `${f} : UUID_RE doit rester une regex littérale explicite`).toBeTruthy();
      const reel = new RegExp(m![1], m![2]);
      const garde = (v: string | null) => typeof v === "string" && reel.test(v);

      expect(garde(null), `${f} : null doit être refusé`).toBe(false);
      expect(garde(""), `${f} : chaîne vide doit être refusée`).toBe(false);
      expect(garde("pas-un-uuid"), `${f} : texte arbitraire doit être refusé`).toBe(false);
      // UUID valides (version 1-5, variante 8/9/a/b) : acceptés.
      expect(garde("11111111-1111-4111-8111-111111111111"), `${f} : BNA`).toBe(true);
      expect(garde("22222222-2222-4222-8222-222222222222"), `${f} : TEST`).toBe(true);
      // La borne basse de version ne doit pas être laxiste : une version 0
      // n'est pas un UUID « d'entreprise » acceptable (choix N9 conservé).
      expect(garde("00000000-0000-0000-0000-000000000000"), `${f} : version 0`).toBe(false);
      expect(garde("11111111-1111-6111-8111-111111111111"), `${f} : version 6`).toBe(false);
    }
  });

  it("les deux gardes estUuid sont identiques (pas de divergence entre fichiers)", () => {
    const regex = (f: string) => source(f).match(/UUID_RE\s*=\s*\/([^\n/]+)\/([a-z]*);/)!.slice(1).join("/");
    expect(regex(TERRAIN)).toBe(regex(DEVIS_FACTURES));
  });
});

describe("O3-B8 — invariants de schéma qui motivent le correctif (non modifiés)", () => {
  it("la migration de la matrice des triggers ne couvre PAS chantiers", () => {
    // Garde-fou : si quelqu'un ajoute un trigger sur `chantiers` (table
    // racine), la stratégie du résolveur doit être revue. Ce test le signale.
    const s = source("supabase/migrations/20260922_isolation_multi_entreprise_phase1_part4.sql");
    const blocTrigger = s.slice(s.indexOf("foreach t in array"), s.indexOf("end $$;", s.indexOf("foreach t in array")));
    expect(blocTrigger).toContain("'photos'");
    expect(blocTrigger).not.toContain("'chantiers'");
  });

  it("chantiers.entreprise_id est bien NOT NULL dans la migration d'isolation", () => {
    const s = source("supabase/migrations/20260922_isolation_multi_entreprise_phase1_part1.sql");
    expect(s).toMatch(/alter column entreprise_id set not null/);
    // et `chantiers` figure bien dans la liste des tables concernées
    expect(s).toMatch(/'notifications','chantiers',/);
  });
});
