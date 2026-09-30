// __tests__/devis-ia-reconcile.test.ts
// ÉTAPE 2 — migration corrective 20260914_devis_ia_reconcile.sql (v2).
// Préflight réel : table legacy public.devis_ia incompatible (version absente,
// ANCIENNE CHECK devis_ia_statut_check = brouillon/analyse/valide,
// devis_ia_historique absente). Ce test garantit que la correction :
//   * supprime EXACTEMENT l'ancienne CHECK (seul drop autorisé), AVANT le mapping ;
//   * n'exécute AUCUNE suppression de données (pas de drop table/column/index,
//     pas de delete from, pas de truncate) ;
//   * ajoute la NOUVELLE CHECK du contrat APRÈS le mapping (une CHECK est
//     validée sur l'existant dès son ajout : impossible avant le mapping) ;
//   * mappe EXACTEMENT 'brouillon' → 'en_attente' (rien d'autre) ;
//   * préserve le contenu de la ligne existante en profondeur ;
//   * laisse le premier POST réel passer par la RÉCUPÉRATION (pas un INSERT
//     23505) : décision pure + archive de la ligne legacy avant remplacement.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  decisionDemarrageAnalyse,
  type StatutAnalyse,
} from "@/lib/devisAnalyse";
import {
  preparerRemplacement,
  snapshotAnalyse,
  type AnalysePersistee,
} from "@/lib/devisHistorique";

function fichierReconcile(): string {
  const dir = "./supabase/migrations";
  const noms = readdirSync(dir).filter((f) => /^20260914_devis_ia_reconcile\.sql$/.test(f));
  expect(noms, "la migration corrective 20260914_devis_ia_reconcile.sql est requise").toHaveLength(1);
  return readFileSync(join(dir, noms[0]), "utf8");
}

const sql = fichierReconcile();

/** Retire commentaires SQL et chaînes pour tester les INSTRUCTIONS (pas les mots de commentaire). */
function sansCommentaires(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

const sqlPur = sansCommentaires(sql);

/* ── Ligne legacy réellement observée en base (préflight, sans secret) ── */
const LIGNE_LEGACY: AnalysePersistee = {
  version: 1,
  analyse_resultats: { test: "source" },
  lignes_proposees: [],
  alertes: [],
  recommandations: [],
  total_estime: 0,
  marge_estimee: 0,
  marge_pct: 0,
};

describe("migration corrective — NON destructive", () => {
  it("existe sur disque sous l'exact nom contractuel", () => {
    expect(existsSync(join("./supabase/migrations", "20260914_devis_ia_reconcile.sql"))).toBe(true);
  });

  it("le SEUL drop autorisé est l'ancienne CHECK : devis_ia_statut_check", () => {
    expect(sqlPur).toContain(
      "alter table public.devis_ia\n  drop constraint if exists devis_ia_statut_check;",
    );
    const toutMotDrop = sqlPur.match(/\bdrop\b/i);
    expect(toutMotDrop).not.toBeNull();
    const occurrencesDrop = sqlPur.match(/\bdrop\s+constraint\b/gi) ?? [];
    expect(occurrencesDrop.length).toBeGreaterThanOrEqual(1);
    expect(sqlPur.match(/\bdrop\s+(table|column|index|schema|view|function|database|trigger|policy)\b/gi)).toBeNull();
  });

  it("aucun delete from ni truncate", () => {
    expect(sqlPur).not.toMatch(/\bdelete\s+from\b/i);
    expect(sqlPur).not.toMatch(/\btruncate\b/i);
  });

  it("aucune suppression de colonne / index / table", () => {
    expect(sqlPur).not.toMatch(/drop\s+column/i);
    expect(sqlPur).not.toMatch(/drop\s+index/i);
    expect(sqlPur).not.toMatch(/drop\s+table/i);
  });
});

describe("migration corrective — ordre imposé", () => {
  it("historique → drop ancienne CHECK → mapping → nouvelle CHECK → version → unique → fk → defaults", () => {
    const creerHistorique = sql.indexOf("create table if not exists public.devis_ia_historique");
    const indexHistorique = sql.indexOf("devis_ia_historique_devis_ia_id_idx");
    const dropAncienne = sql.indexOf("drop constraint if exists devis_ia_statut_check");
    const mappingBrouillon = sql.indexOf("where statut = 'brouillon'");
    const addVersion = sql.indexOf("add column if not exists version");
    const nouvelleCheck = sql.indexOf("add constraint devis_ia_statut_check");
    const uniqueDevisId = sql.indexOf("devis_ia_devis_id_key");
    const fkCascade = sql.indexOf("devis_ia_devis_id_fkey");
    const defaults = sql.indexOf("alter column created_at set default now()");

    for (const idx of [creerHistorique, indexHistorique, dropAncienne, mappingBrouillon, addVersion, nouvelleCheck, uniqueDevisId, fkCascade, defaults]) {
      expect(idx, "chaque étape doit être présente").toBeGreaterThan(-1);
    }
    expect(creerHistorique).toBeLessThan(dropAncienne);
    expect(dropAncienne).toBeLessThan(mappingBrouillon);
    expect(mappingBrouillon).toBeLessThan(nouvelleCheck);
    expect(nouvelleCheck).toBeLessThan(addVersion);
    expect(addVersion).toBeLessThan(uniqueDevisId);
    expect(fkCascade).toBeGreaterThan(uniqueDevisId);
    expect(defaults).toBeGreaterThan(fkCascade);
  });

  it("la NOUVELLE CHECK est ajoutée APRÈS le mapping brouillon (validation de l'existant)", () => {
    const mapping = sql.indexOf("where statut = 'brouillon'");
    const nouvelleCheck = sql.indexOf("add constraint devis_ia_statut_check");
    const dropAncienne = sql.indexOf("drop constraint if exists devis_ia_statut_check");
    expect(dropAncienne).toBeLessThan(mapping);
    expect(mapping).toBeLessThan(nouvelleCheck);
  });

  it("mappe EXACTEMENT 'brouillon' → 'en_attente' (ciblage conservateur)", () => {
    const re = /update\s+public\.devis_ia\s*[\s\S]{0,120}?set\s+statut\s*=\s*'en_attente'\s+where\s+statut\s*=\s*'brouillon'/i;
    expect(sql).toMatch(re);
  });
});

describe("migration corrective — contrat de schéma restauré", () => {
  it("l'ancienne CHECK est supprimée (DROP CONSTRAINT IF EXISTS)", () => {
    expect(sqlPur).toMatch(/drop\s+constraint\s+if\s+exists\s+devis_ia_statut_check\s*;/i);
  });

  it("nouvelle CHECK contractuelle (4 valeurs)", () => {
    expect(sql).toMatch(/statut in \('en_attente', 'en_cours', 'terminee', 'en_echec'\)/);
  });

  it("colonne version : integer not null default 1 check >= 1", () => {
    expect(sql).toContain("version integer not null default 1 check (version >= 1)");
  });

  it("UNIQUE(devis_id) rétabli (verrou 23505) sous le nom atteint par la cible", () => {
    expect(sql).toMatch(/create unique index if not exists devis_ia_devis_id_key\s+on public\.devis_ia\(devis_id\)/);
  });

  it("FK devis_id → devis(id) ON DELETE CASCADE (idempotente)", () => {
    expect(sql).toContain("devis_ia_devis_id_fkey");
    expect(sql).toMatch(/references public\.devis\(id\) on delete cascade/i);
  });

  it("historique : append-only, snapshot jsonb, cascade depuis devis_ia", () => {
    const creerHistorique = sql.indexOf("create table if not exists public.devis_ia_historique");
    const finHistorique = sql.indexOf("create index if not exists devis_ia_historique_devis_ia_id_idx");
    const ddlHistorique = sql.slice(creerHistorique, finHistorique);
    expect(ddlHistorique).toContain("devis_ia_id uuid not null references public.devis_ia(id) on delete cascade");
    expect(ddlHistorique).toContain("version integer not null check (version >= 1)");
    expect(ddlHistorique).toContain("snapshot jsonb not null");
    expect(ddlHistorique).toContain("cree_le timestamptz not null default now()");
  });

  it("défauts horodatés + NOT NULL devis_id rétablis", () => {
    expect(sql).toContain("alter column created_at set default now()");
    expect(sql).toContain("alter column updated_at set default now()");
    expect(sqlPur).toMatch(/alter column devis_id set not null/i);
  });
});

describe("migration corrective — conservation garantie (pur)", () => {
  it("snapshotAnalyse préserve le contenu legacy en PROFONDEUR", () => {
    const snap = snapshotAnalyse(LIGNE_LEGACY);
    expect(snap.version).toBe(1);
    expect(snap.contenu).toEqual({
      analyse_resultats: { test: "source" },
      lignes_proposees: [],
      alertes: [],
      recommandations: [],
      total_estime: 0,
      marge_estimee: 0,
      marge_pct: 0,
    });
  });

  it("preparerRemplacement : version 2 + snapshot du legacy (rien perdu)", () => {
    const remplacement = preparerRemplacement(LIGNE_LEGACY);
    expect(remplacement.version).toBe(2);
    expect(remplacement.snapshot?.version).toBe(1);
    expect(remplacement.snapshot?.contenu.analyse_resultats).toEqual({ test: "source" });
    expect(remplacement.snapshot?.contenu.lignes_proposees).toEqual([]);
  });

  it("la ligne réconciliée (en_attente, updated_at ancien) est RÉCUPÉRABLE : pas d'INSERT collision", () => {
    const decision = decisionDemarrageAnalyse({
      existe: true,
      statut: "en_attente" as StatutAnalyse,
      derniereMaj: "2026-09-12T20:00:16.367Z",
      maintenant: Date.parse("2026-09-13T12:00:00Z"),
    });
    expect(decision).toEqual({ autorise: true, raison: "recupere" });
  });
});

describe("migration corrective — ne touche pas au fichier gelé 20260913_devis_ia.sql", () => {
  it("le fichier cible 20260913_devis_ia.sql reste exempt du correctif brouillon", () => {
    expect(existsSync(join("./supabase/migrations", "20260913_devis_ia.sql"))).toBe(true);
    const legere = readFileSync(
      join("./supabase/migrations", "20260913_devis_ia.sql"),
      "utf8",
    );
    expect(legere).not.toMatch(/where statut = 'brouillon'/i);
    expect(legere).not.toMatch(/drop constraint/i);
  });
});