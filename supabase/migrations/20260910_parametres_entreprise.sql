-- Table Paramètres Entreprise (Dashboard Patron - Prédiction Trésorerie)
-- Store les paramètres financiers de l'artisan solo.

create table if not exists public.parametres_entreprise (
  id bigint primary key default 1 check (id = 1),
  tresorerie_actuelle numeric default 5000 not null,
  charges_fixes_mensuelles numeric default 0 not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.parametres_entreprise enable row level security;

-- Une seule ligne : id = 1. On insère les valeurs par défaut si absent.
insert into public.parametres_entreprise (id, tresorerie_actuelle, charges_fixes_mensuelles)
values (1, 5000, 0)
on conflict (id) do nothing;

-- Politique : lecture pour tous (authentifiés), écriture via service_role (API).
drop policy if exists "parametres_entreprise_select_authenticated" on public.parametres_entreprise;
create policy "parametres_entreprise_select_authenticated"
  on public.parametres_entreprise
  for select
  using (auth.role() = 'authenticated');