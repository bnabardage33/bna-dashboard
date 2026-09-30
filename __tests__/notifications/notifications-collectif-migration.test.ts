// __tests__/notifications-collectif-migration.test.ts
// O3-B6 / N1 (modèle collectif) + O3-B6 / N2-N3 (route orpheline)
// ============================================================================
//
// @vitest-environment node
//
// Ce test ne fait que LIRE DES FICHIERS (`readFileSync`, `readdirSync`) : il n'a
// aucun besoin d'un DOM. Le déclarer en `node` évite d'ouvrir un environnement
// jsdom — soit ~10 s de `environment` par exécution, sur une machine où la
// mémoire disponible est le facteur limitant du pool de test.
//
// Gardes de régression sur des décisions NON exprimables en TypeScript :
//   - le contenu de la migration de policies (le RLS vit en base, pas en code) ;
//   - l'absence de la route API (une suppression ne se voit pas au `tsc`).
//
// Approche « invariant texte » : c'est le modèle déjà retenu par le dépôt pour
// les objets SQL (cf. __tests__/migrations.test.ts). L'apport O3-B6 est qu'on
// contrôle ici ce que le RLS NE DOIT PLUS contenir.
// ============================================================================

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const MIG = "./supabase/migrations/20260926_o3b6_notifications_collectif.sql";
const ROUTE = "./app/api/notifications/route.ts";

/**
 * Corps EXÉCUTABLE de la migration, c'est-à-dire l'intérieur du `do $$ … $$`,
 * commentaires de ligne et `comment on …` exclus.
 *
 * L'exclusion est indispensable : l'en-tête de la migration cite
 * volontairement `auth.uid()` et `destinataire_id` pour EXPLIQUER pourquoi
 * l'ancienne politique était invalide. Contrôler le fichier entier
 * confondrait la documentation avec la règle effective.
 */
function blocExecutables(sql: string): string {
  const corps = sql.split("$$")[1] ?? "";
  return corps
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
}

describe("O3-B6/N1 — la migration du modèle collectif", () => {
  const sql = existsSync(MIG) ? readFileSync(MIG, "utf-8") : "";

  it("le fichier de migration existe", () => {
    expect(existsSync(MIG)).toBe(true);
    expect(sql.length).toBeGreaterThan(0);
  });

  it("recrée les 4 policies notifications_ent_* (select/insert/update/delete)", () => {
    for (const op of ["select", "insert", "update", "delete"]) {
      expect(sql, `policy ${op} absente`).toContain(`notifications_ent_${op} on public.notifications for ${op}`);
    }
  });

  it("ne filtre PLUS par destinataire_id (le modèle collectif)", () => {
    // Point central de l'arbitrage produit : plus aucune policy ne mentionne
    // `destinataire_id`.
    expect(blocExecutables(sql)).not.toContain("destinataire_id");
  });

  it("ne compare PLUS rien à auth.uid() (la comparaison était structurellement invalide)", () => {
    expect(blocExecutables(sql)).not.toContain("auth.uid()");
  });

  it("conserve l'isolation par entreprise sur les 4 policies", () => {
    // Une régression qui supprimerait `entreprise_courante()` ouvrirait les
    // notifications de TOUS les tenants : c'est le garde-fou principal.
    const bloc = blocExecutables(sql);
    const occurrences = bloc.split("entreprise_courante()").length - 1;
    // select : 1 (using) · insert : 1 (with check) · update : 2 · delete : 1
    expect(occurrences).toBe(5);
    // et le bloc contient bien les 4 créations
    expect(bloc.split("create policy").length - 1).toBe(4);
  });

  it("reste idempotent (drop policy if exists avant toute création)", () => {
    expect(sql).toContain("drop policy if exists %I on public.notifications");
    expect(sql).toContain("from pg_policies");
  });

  it("n'écrit AUCUNE donnée (policies + commentaires seulement)", () => {
    expect(sql).not.toMatch(/\binsert\s+into\b/i);
    expect(sql).not.toMatch(/\bupdate\s+\w+\s+set\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\balter\s+table\b/i);
  });

  it("documente la destination de la colonne destinataire_id (désormais informative)", () => {
    expect(sql).toContain("comment on column public.notifications.destinataire_id");
  });

  it("ne crée AUCUNE architecture d'identité (pont profiles.user_id interdit)", () => {
    expect(sql).not.toMatch(/alter\s+table\s+[\w.]*profiles/i);
    expect(sql).not.toMatch(/add\s+column/i);
    expect(sql).not.toMatch(/create\s+table/i);
  });
});

describe("O3-B6/N2-N3 — la route /api/notifications est supprimée", () => {
  it("le fichier de route n'existe plus", () => {
    expect(existsSync(ROUTE)).toBe(false);
  });

  it("aucune route /api/notifications ne subsiste (routes GET/POST/PATCH)", () => {
    expect(existsSync("./app/api/notifications")).toBe(false);
  });

  it("aucun appelant fonctionnel ne référence la route", () => {
    // Le seul emplacement qui en parle est le test de middleware, qui exige
    // qu'elle NE soit PAS dans la liste blanche : c'est un garde-fou
    // volontaire, pas un appelant. On le tolère explicitement.
    //
    // Analyse en JS pur (pas de `execSync` : un sous-processus dans un worker
    // vitest est lent et fragile sous contrainte de ressources).
    const cibles: string[] = [];
    const parcourir = (rep: string) => {
      for (const entree of readdirSync(rep)) {
        if (entree === "node_modules" || entree === ".next" || entree.startsWith(".")) continue;
        const chemin = join(rep, entree);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entree)) cibles.push(chemin);
      }
    };
    parcourir("./app");
    parcourir("./components");
    parcourir("./lib");

    const referencing = cibles.filter((f) => readFileSync(f, "utf-8").includes("api/notifications"));
    expect(referencing).toEqual([]);
    // ...et la seule mention qui subsiste, dans l'arbre des tests, est bien la
    // liste négative « anciennes routes API privées ».
    const middlewareTest = readFileSync("./__tests__/securite/middleware.test.ts", "utf-8");
    expect(middlewareTest).toContain("anciennes routes API privées");
  });

  it("le composant SearchNav lit bien la table en direct, sans passer par une route", () => {
    const src = readFileSync("./components/SearchNav.tsx", "utf-8");
    expect(src).toContain('supabase.from("notifications").select("*")');
    expect(src).not.toContain("/api/notifications");
  });
});

describe("O3-B6 — invariants de code sur le producteur N9", () => {
  const src = readFileSync("./app/bureau/fournisseurs/page.tsx", "utf-8");

  it("résout entreprise_id via le résolveur EXISTANT (lib/contexteEntreprise)", () => {
    expect(src).toContain('import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise"');
    expect(src).toContain("resoudreContexteEntreprise(null)");
  });

  it("n'introduit AUCUNE constante de tenant en dur", () => {
    expect(src).not.toMatch(/11111111-1111-4111-8111-111111111111/);
    expect(src).not.toMatch(/22222222-2222-4222-8222-222222222222/);
  });

  it("n'impose plus l'assertion `as TablesInsert` qui masquait l'erreur de typage", () => {
    // Le cast masquait `entreprise_id` requis : c'est exactement ce qui a
    // permis à la régression N9 d passer inaperçue.
    expect(src).not.toContain('insert(rows as TablesInsert<"notifications">[])');
    expect(src).toContain('const rows: TablesInsert<"notifications">[]');
  });

  it("traite explicitement l'erreur d'insert", () => {
    expect(src).toContain("const { error: erreurInsert } = await supabase.from(\"notifications\").insert(rows)");
    expect(src).toContain("if (erreurInsert)");
  });
});
