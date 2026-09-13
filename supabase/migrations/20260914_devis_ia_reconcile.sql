-- Module devis_ia — RÉCONCILIATION (post-préflight, v2).
-- Préflight : une table public.devis_ia LEGACY préexistait avec un schéma
-- incompatible : colonne version absente, et une contrainte CHECK
-- devis_ia_statut_check de l'ANCIEN contrat (brouillon / analyse / valide)
-- qui interdit toute valeur du nouveau contrat (en_attente / en_cours /
-- terminee / en_echec). devis_ia_historique absente.
-- Ce correctif rend public.devis_ia conforme au contrat du module
-- SANS AUCUNE PERTE DE DONNÉES :
--   * aucun drop table / colonne / index / delete / truncate ;
--   * le SEUL drop autorisé est la suppression de l'ANCIENNE CHECK
--     devis_ia_statut_check (DROP CONSTRAINT IF EXISTS) ;
--   * l'unique ligne existante est CONSERVÉE en place (seul le marqueur de
--     cycle de vie 'brouillon' est explicitement mappé vers 'en_attente') ;
--   * son contenu est préservé : archivé en devis_ia_historique (append-only)
--     lors de la première analyse réelle (flux route, preparerRemplacement).
-- Ordre imposé (l'ADD de la CHECK DOIT suivre le mapping : une nouvelle
-- contrainte est validée sur les lignes existantes au moment de son ajout) :
--   1) devis_ia_historique (+ index) en premier ;
--   2) DROP CONSTRAINT IF EXISTS devis_ia_statut_check (ancien contrat) ;
--   3) mapping brouillon -> en_attente ;
--   4) ADD de la nouvelle CHECK (contrat) ;
--   5) contraintes restantes : version, UNIQUE(devis_id), FK, défauts, NOT NULL.

-- ── 1) devis_ia_historique : structure d'archivage (append-only) ──────────
create table if not exists public.devis_ia_historique (
  id uuid primary key default gen_random_uuid(),
  devis_ia_id uuid not null references public.devis_ia(id) on delete cascade,
  version integer not null check (version >= 1),
  snapshot jsonb not null,
  cree_le timestamptz not null default now()
);

create index if not exists devis_ia_historique_devis_ia_id_idx
  on public.devis_ia_historique(devis_ia_id);

-- ── 2) Suppression de l'ANCIENNE CHECK (seul drop autorisé) ────────────────
-- L'ancien contrat (brouillon/analyse/valide) est remplacé : sans ce drop,
-- la nouvelle CHECK (nom identique) ne peut pas être recréée sur ce schéma.
alter table public.devis_ia
  drop constraint if exists devis_ia_statut_check;

-- ── 3) Réconciliation du statut legacy ─────────────────────────────────────
-- Traitement EXPLICITE : seul 'brouillon' est mappé, vers 'en_attente'
-- (analyse jamais réellement exécutée). Aucun autre statut n'est touché,
-- aucun contenu n'est modifié. Doit précéder l'ajout de la nouvelle CHECK :
-- celle-ci est validée sur les lignes existantes dès son ajout.
update public.devis_ia
  set statut = 'en_attente'
  where statut = 'brouillon';

-- ── 4) Nouvelle CHECK contractuelle (idempotente) ──────────────────────────
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    where r.relname = 'devis_ia'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%en_attente%en_cours%terminee%en_echec%'
  ) then
    alter table public.devis_ia
      add constraint devis_ia_statut_check
      check (statut in ('en_attente', 'en_cours', 'terminee', 'en_echec'));
  end if;
end $$;

-- ── 5) Contraintes restantes du contrat ────────────────────────────────────

-- 5a) Colonne version (manquante) + son CHECK.
alter table public.devis_ia
  add column if not exists version integer not null default 1 check (version >= 1);

-- 5b) UNIQUE(devis_id) : verrou structurel de concurrence (erreur 23505).
--     Index unique (équivalent fonctionnel d'une contrainte pour 23505),
--     1 seule ligne -> aucun doublon possible.
create unique index if not exists devis_ia_devis_id_key
  on public.devis_ia(devis_id);

-- 5c) FK devis_id -> devis(id) ON DELETE CASCADE (idempotente).
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    where r.relname = 'devis_ia'
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) like '%ON DELETE CASCADE%'
  ) then
    alter table public.devis_ia
      add constraint devis_ia_devis_id_fkey
      foreign key (devis_id) references public.devis(id) on delete cascade;
  end if;
end $$;

-- 5d) Défauts horodatés + NOT NULL devis_id (contrat). Aucune valeur affectée.
alter table public.devis_ia
  alter column created_at set default now(),
  alter column updated_at set default now(),
  alter column devis_id set not null;

-- Fin : table devis_ia conforme au contrat, historique prête, données intactes.