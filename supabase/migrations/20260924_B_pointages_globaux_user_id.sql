-- M1 rebranchement pointages_globaux equipe_id vers user_id (profiles)
-- BNA Bardage 2026-09-24 GO B3 - aucun DROP de equipe - idempotent

alter table public.pointages_globaux
  drop constraint if exists pointages_globaux_equipe_id_fkey;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pointages_globaux'
      and column_name = 'equipe_id'
  ) then
    alter table public.pointages_globaux rename column equipe_id to user_id;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pointages_globaux_user_id_fkey'
      and conrelid = 'public.pointages_globaux'::regclass
  ) then
    alter table public.pointages_globaux
      add constraint pointages_globaux_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete set null;
  end if;
end $$;

create index if not exists pointages_globaux_user_id_idx
  on public.pointages_globaux (user_id);