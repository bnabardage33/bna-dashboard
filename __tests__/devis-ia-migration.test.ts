// __tests__/devis-ia-migration.test.ts
// ÉTAPE 1 — la migration devis_ia est STRICTEMENT additive :
//   * PK / UNIQUE(devis_id) / CHECK statut / CASCADE (devis → devis_ia → historique) ;
//   * AUCUN mot-clé destructif (drop/truncate/update/delete) ;
//   * filmée pour documentation : fichier NON appliqué en base.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

function migrationDevisIa(): string {
  const dir = "./supabase/migrations";
  const fichiers = readdirSync(dir).filter((f) => /^20260913_devis_ia\.sql$/.test(f));
  expect(fichiers, "la migration 20260913_devis_ia.sql doit exister").toHaveLength(1);
  return readFileSync(join(dir, fichiers[0]), "utf8");
}

const sql = migrationDevisIa();

describe("migration devis_ia — structure exigée", () => {
  it("crée public.devis_ia avec PK uuid", () => {
    expect(sql).toContain("create table if not exists public.devis_ia");
    expect(sql).toMatch(/id uuid primary key default gen_random_uuid\(\)/);
  });

  it("UNIQUE(devis_id) : verrou de concurrence structurel", () => {
    expect(sql).toMatch(/devis_id uuid not null unique references public\.devis\(id\) on delete cascade/);
  });

  it("CHECK sur le statut de l'analyse", () => {
    expect(sql).toMatch(/statut in \('en_attente', 'en_cours', 'terminee', 'en_echec'\)/);
  });

  it("crée public.devis_ia_historique (append-only)", () => {
    expect(sql).toContain("create table if not exists public.devis_ia_historique");
    expect(sql).toMatch(
      /devis_ia_id uuid not null references public\.devis_ia\(id\) on delete cascade/,
    );
  });

  it("indexe l'historique par devis_ia_id", () => {
    expect(sql).toContain("devis_ia_historique_devis_ia_id_idx");
  });

  it("PAS de mot-clé destructif : drop / truncate / delete / update", () => {
    expect(sql).not.toMatch(/\bdrop\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\bupdate\s+\b/i);
  });

  it("aucune table existante n'est altérée (creation seule)", () => {
    expect(sql).not.toMatch(/alter table/i);
    expect(sql).not.toMatch(/drop table/i);
  });

  it("le fichier existe bien sur disque (non appliqué en base)", () => {
    expect(existsSync(join("./supabase/migrations", "20260913_devis_ia.sql"))).toBe(true);
  });

  it("CHECK réellement présents : version >= 1 (devis_ia + historique)", () => {
    const occurrences = sql.match(/check \(version >= 1\)/g) ?? [];
    expect(occurrences).toHaveLength(2);
  });

  it("CHECK réellement présent : total_estime >= 0", () => {
    expect(sql).toContain("total_estime numeric not null default 0 check (total_estime >= 0)");
  });

  it("défauts JSONB : objet {} pour analyse_resultats, tableaux [] pour lignes/alertes/recommandations", () => {
    expect(sql).toContain("default '{}'::jsonb");
    const tableaux = sql.match(/default '\[\]'::jsonb/g) ?? [];
    expect(tableaux).toHaveLength(3);
  });

  it("défauts NUMERIC et entier : 0 + default version 1", () => {
    expect(sql).toContain("total_estime numeric not null default 0");
    expect(sql).toContain("marge_estimee numeric not null default 0");
    expect(sql).toContain("marge_pct numeric not null default 0");
    expect(sql).toContain("version integer not null default 1");
  });

  it("colonnes horodatées présentes : created_at + updated_at (default now())", () => {
    expect(sql).toContain("created_at timestamptz not null default now()");
    expect(sql).toContain("updated_at timestamptz not null default now()");
    const defaults = sql.match(/timestamptz not null default now\(\)/g) ?? [];
    expect(defaults).toHaveLength(3); // devis_ia.created_at + updated_at + historique.cree_le
  });
});