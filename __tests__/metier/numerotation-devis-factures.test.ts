// __tests__/metier/numerotation-devis-factures.test.ts
//
// Préflight de la migration 20261001_generer_prochain_numero_devis_factures.sql.
//
// Contexte : devis et factures numérotaient via lib/documents.ts (prochainNumero),
// un SELECT suivi d'un max+1 côté navigateur. Trois défauts, tous structurels :
//   * aucune contrainte UNIQUE sur devis.numero ni factures.numero
//     (pv_receptions en a une depuis 20260821) — deux créations concurrentes
//     coexistaient donc en silence, ce qui a permis à deux DEV-2026-001 de
//     cohabiter ;
//   * aucun filtre entreprise_id — la périmètre par tenant ne tenait que parce
//     que le client Supabase passe par le RLS ;
//   * lecture-écriture sans verrou.
//
// Ce test ne valide pas le SQL auprès de PostgreSQL (aucun accès base ici). Il
// verrouille l'ACCORD entre la migration et le code applicatif, qui est ce qui
// casse en silence : une RPC nommée d'un côté et appelée de l'autre donne un
// numéro vide, pas une erreur de compilation.
//
// Il vérifie aussi que la garantie d'unicité est bien posée, et qu'elle est
// portée par (entreprise_id, numero) et non par numero seul — sinon deux
// entreprises ne pourraient pas legitimement produire le même numéro.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
// Import VOLONTAIREMENT absent de @/lib/documents : ce module importe
// @/lib/supabase, qui construit un client navigateur exigeant
// NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY au chargement.
// L'import ferait echouer la suite avant meme le premier test. La sonde lit
// donc le fichier en statique, comme les autres preflights de __tests__/ia.

const REPO = process.cwd();

function migrationNumerotation(): string {
  const dir = join(REPO, "supabase/migrations");
  const noms = readdirSync(dir).filter((f) =>
    /^20261001_generer_prochain_numero_devis_factures\.sql$/.test(f)
  );
  expect(noms, "la migration 20261001_generer_prochain_numero_devis_factures.sql est requise").toHaveLength(1);
  return readFileSync(join(dir, noms[0]), "utf8");
}

function lire(relatif: string): string {
  return readFileSync(join(REPO, relatif), "utf8");
}

const sql = migrationNumerotation();

/** Retire les commentaires SQL pour tester les instructions, pas les mots des commentaires. */
function sansCommentaires(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

/**
 * Variante TS/TSX : commentaires `//` en début de ligne et `/* … *\/`.
 *
 * Ne retire PAS `--` : ce n'est pas un commentaire en TypeScript, et la
 * suppression casserait les littéraux du type `DEV-2026-001`. Les `//` sont
 * ancrés en début de ligne pour ne pas casser une URL (`https://…`) écrite
 * à l'intérieur d'une chaîne.
 */
function sansCommentairesTs(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => (l.trimStart().startsWith("//") ? "" : l))
    .join("\n");
}

const corps = sansCommentaires(sql);

describe("migration de numérotation devis/factures — préflight", () => {
  it("déclare les trois variantes par préfixe, comme le pattern SIT existant", () => {
    // La variante _ctx verrouille, la variante 0-arg résout entreprise_courante(),
    // la variante 1-arg prend un contexte explicite.
    for (const pfx of ["dev", "fac"]) {
      expect(corps).toMatch(
        new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.generer_prochain_numero_${pfx}_ctx\\(p_entreprise_id\\s+uuid\\)`)
      );
      expect(corps).toMatch(
        new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.generer_prochain_numero_${pfx}\\(\\)`)
      );
    }
  });

  it("refuse explicitement un contexte entreprise absent au lieu de numeroter partout", () => {
    // Séquence de numérotation fail-closed : sans tenant, on refuse.
    const refus = corps.match(/raise exception 'contexte entreprise manquant'/g) ?? [];
    expect(refus.length).toBe(6); // 3 variantes × 2 préfixes
  });

  it("verrouille la table avant de calculer le max", () => {
    // Sans verrou, deux appels simultanés lisent le même maximum : c'est
    // exactement la course que la version JS ne pouvait pas éviter.
    expect(corps).toMatch(/lock table public\.devis in share row exclusive mode;/);
    expect(corps).toMatch(/lock table public\.factures in share row exclusive mode;/);
  });

  it("scope le max par entreprise ET par année", () => {
    for (const pfx of ["dev", "fac"]) {
      expect(corps).toMatch(
        new RegExp(`where\\s+entreprise_id\\s*=\\s*p_entreprise_id\\s+and\\s+numero\\s+like\\s+'${pfx.toUpperCase()}-'\\s*\\|\\|\\s*v_annee`)
      );
    }
  });

  it("separe FAC de SIT par le prefixe, pas par type_facture", () => {
    // Les situations partagent public.factures avec les factures. Le filtre
    // `numero like 'FAC-'` les disjoint : ajouter un filtre type_facture
    // serait redondant et fragile.
    const facCtx = corps.slice(corps.indexOf("generer_prochain_numero_fac_ctx"));
    expect(facCtx).toMatch(/numero like 'FAC-' \|\| v_annee \|\| '-%'/);
    expect(facCtx).not.toMatch(/type_facture/);
  });

  it("pose la contrainte d'unicité qui manquait, sur (entreprise_id, numero)", () => {
    // numero seul serait FAUX : la numérotation est par entreprise, deux
    // entreprises doivent pouvoir produire le même numéro.
    expect(corps).toMatch(
      /create unique index if not exists devis_entreprise_numero_uniq\s+on public\.devis \(entreprise_id, numero\);/
    );
    expect(corps).toMatch(
      /create unique index if not exists factures_entreprise_numero_uniq\s+on public\.factures \(entreprise_id, numero\);/
    );
  });

  it("durcit le search_path, comme l'a fait 20260930_c1", () => {
    // security definer + search_path non fixé = la fonction s'exécute avec les
    // droits du propriétaire et cherche ses objets dans le search_path de
    // l'appelant. Le correctif est `set search_path = public`.
    const fonctions = corps.match(/create or replace function public\.generer_prochain_numero_(?:dev|fac)[^(]*\([^)]*\)/g) ?? [];
    expect(fonctions.length).toBe(6);
    expect((corps.match(/security definer/g) ?? []).length).toBe(6);
    // Pas de point-virgule : la clause SET d'un CREATE FUNCTION est une
    // clause, pas une instruction. Un « ; » ici serait une erreur de syntaxe.
    expect((corps.match(/set search_path = public/g) ?? []).length).toBe(6);
  });

  it("revoque PUBLIC avant d'accorder, sinon anon peut appeler les six fonctions", () => {
    // PostgreSQL accorde EXECUTE a PUBLIC par defaut. L'absence de `grant`
    // n'est pas un refus : sans `revoke`, `anon` execute les six fonctions.
    // C'est pourquoi part3 revoke d'abord, puis accorde. On exige les 6.
    const revokes = corps.match(/revoke all on function public\.generer_prochain_numero_(?:dev|fac)[^\n]+/g) ?? [];
    expect(revokes.length).toBe(6);
    // 2 enveloppeures par prefixe, revokees de TOUT le monde…
    const enveloppe = revokes.filter((r) => r.includes(") from public, anon, authenticated, service_role;"));
    expect(enveloppe.length).toBe(4);
    // … et la variante _ctx, revokee de PUBLIC seule.
    const ctx = revokes.filter((r) => r.includes("_ctx(uuid) from public;"));
    expect(ctx.length).toBe(2);
  });

  it("n'accorde l'exécution qu'aux enveloppes, jamais aux variantes _ctx", () => {
    // Une variante _ctx est directement appelable avec un p_entreprise_id
    // choisi par l'appelant : l'accorder a `authenticated` permettrait de
    // numeroter pour une autre entreprise et d'en deduire son volume de devis.
    // Les _ctx doivent donc n'avoir AUCUN grant.
    const grants = corps.match(/grant execute on function [^\n]+/g) ?? [];
    expect(grants.length).toBe(4);
    for (const g of grants) {
      expect(g).toMatch(/to authenticated, service_role;$/);
      expect(g).not.toMatch(/\banon\b/);
      expect(g).not.toMatch(/_ctx/);
    }
  });
});

describe("accord migration ↔ code applicatif", () => {
  it("déclare chaque RPC appelée dans types/supabase.ts", () => {
    const types = lire("types/supabase.ts");
    for (const nom of [
      "generer_prochain_numero_dev",
      "generer_prochain_numero_dev_ctx",
      "generer_prochain_numero_fac",
      "generer_prochain_numero_fac_ctx",
    ]) {
      expect(types, `RPC ${nom} absente de types/supabase.ts`).toContain(nom);
    }
  });

  it("lib/documents.ts appelle les RPC par le nom exact déclaré en base", () => {
    const lib = lire("lib/documents.ts");
    // Un nom d'appel divergent de la fonction créée ne donne aucune erreur de
    // compilation : PostgREST répond simplement { error: ... } et le numéro
    // devient undefined. C'est le point à verrouiller.
    for (const pfx of ["dev", "fac"]) {
      expect(lib).toContain(`supabase.rpc("generer_prochain_numero_${pfx}")`);
    }
  });

  it("plus aucun appel JS de numérotation pour devis ou factures", () => {
    // La garantie est Tenue par le TYPE : prochainNumero n'accepte plus que
    // pv_receptions. Un nouvel appel sur devis/factures devient une erreur de
    // compilation plutôt qu'un doublon silencieux.
    const code = [
      lire("app/bureau/devis-factures/page.tsx"),
      lire("app/bureau/factures/page.tsx"),
      lire("app/bureau/fin-chantier/page.tsx"),
    ].join("\n");

    const appels = code.match(/prochainNumero\("([a-z_]+)"/g) ?? [];
    for (const a of appels) {
      expect(a, `appel interdit à ${a}`).toContain('"pv_receptions"');
    }
    // Et il en reste au moins un : si les deux RPC n'étaient pas encore
    // appliquées, ce serait le seul moyen de numéroter une réception.
    expect(appels.length).toBeGreaterThan(0);
  });

  it("ne fabrique aucun numéro de repli quand la RPC échoue", () => {
    // Un repli du type « DEV-2026-001 » en cas d'erreur RPC masquerait la panne
    // ET entrerait potentiellement en collision. Les deux chemins doivent lever.
    // Commentaires retirés : entre `catch (…) {` et l'alerte, les blocs
    // comportent une explication en commentaire.
    const pages = sansCommentairesTs(
      lire("app/bureau/devis-factures/page.tsx") + "\n" + lire("app/bureau/factures/page.tsx")
    );

    // 5 sites de numérotation protégés, tous par RPC :
    //   devis-factures : creerDevisViergeIA, creerDevis (DEV)
    //                    handleGenererFacture, genererFactureAcompte (FAC ou SIT)
    //   factures       : creerFacture (FAC)
    const sites = pages.match(/(prochainNumeroDevis\(\)|prochainNumeroFacture\(\))/g) ?? [];
    expect(sites.length).toBe(5);

    // Chaque appel doit avoir un catch qui alerte l'utilisateur. On cible les
    // alertes propres à la numérotation (« … numéroter … ») plutôt que de
    // compter tous les catch du fichier : ces pages en contiennent d'autres,
    // sans rapport, et le total serait un nombre magique.
    const alertsNumerotation = pages.match(/(afficherToast|alert)\([^)]*numéroter/gi) ?? [];
    expect(alertsNumerotation.length).toBe(5);

    // Et aucun repli artisanal ne doit subsister : pas de max+1, pas de
    // valeur codée en dur sur le préfixe DEV/FAC.
    expect(pages).not.toMatch(/DEV-20\d\d-001/);
    expect(pages).not.toMatch(/FAC-20\d\d-001/);
  });

  it("prochainNumero reste disponible et typé sur la seule table à contrainte UNIQUE", () => {
    // pv_receptions porte `numero TEXT NOT NULL UNIQUE` depuis
    // 20260821_create_pv_receptions.sql : une collision y est rejetée par
    // PostgreSQL, donc le défaut reste visible. C'est ce qui autorise le
    // maintien de la version JS pour cette table uniquement.
    const lib = lire("lib/documents.ts");
    expect(lib).toMatch(/table:\s*"pv_receptions"/);
    // Et le module exporte bien les deux chemins RPC : sans cet export, les
    // imports des pages casseraient en build, pas ici.
    expect(lib).toMatch(/export async function prochainNumeroDevis/);
    expect(lib).toMatch(/export async function prochainNumeroFacture/);
    expect(lib).toMatch(/export async function prochainNumero\(/);
  });
});
