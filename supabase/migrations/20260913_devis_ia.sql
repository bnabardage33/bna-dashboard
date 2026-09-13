-- Module devis_ia : analyse IA 1→1 d'un devis (ÉTAPE 1)
-- Strictement additif : aucune table existante n'est modifiée.
-- devis_ia              : résultat d'analyse, UNIQUE(devis_id), verrou de concurrence via statut.
-- devis_ia_historique   : append-only, snapshot archivé avant remplacement, version incrémentée.

create table if not exists public.devis_ia (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null unique references public.devis(id) on delete cascade,
  analyse_resultats jsonb not null default '{}'::jsonb,
  lignes_proposees jsonb not null default '[]'::jsonb,
  alertes jsonb not null default '[]'::jsonb,
  recommandations jsonb not null default '[]'::jsonb,
  total_estime numeric not null default 0 check (total_estime >= 0),
  marge_estimee numeric not null default 0,
  marge_pct numeric not null default 0,
  version integer not null default 1 check (version >= 1),
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'en_cours', 'terminee', 'en_echec')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devis_ia_historique (
  id uuid primary key default gen_random_uuid(),
  devis_ia_id uuid not null references public.devis_ia(id) on delete cascade,
  version integer not null check (version >= 1),
  snapshot jsonb not null,
  cree_le timestamptz not null default now()
);

create index if not exists devis_ia_historique_devis_ia_id_idx
  on public.devis_ia_historique(devis_ia_id);