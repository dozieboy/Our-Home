-- ══════════════════════════════════════════════════════════════
--  Our Home — Pet Care reminders — run in Supabase → SQL Editor → Run
--  Safe to re-run (idempotent)
-- ══════════════════════════════════════════════════════════════

create table if not exists public.pets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '#3b82f6',
  birthdate   date,
  created_by  text,
  created_at  timestamptz not null default now()
);
alter table public.pets add column if not exists birthdate date;

create table if not exists public.pet_tasks (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references public.pets(id) on delete cascade,
  kind        text not null default 'other' check (kind in ('vaccine','vet','flea','other')),
  note        text,
  due_date    date not null,
  repeat_days int,                                   -- e.g. 30 for monthly flea/tick; null = one-off
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_pet_tasks_due on public.pet_tasks (due_date);

drop trigger if exists trg_pet_tasks_updated on public.pet_tasks;
create trigger trg_pet_tasks_updated before update on public.pet_tasks
  for each row execute function public.set_updated_at();

alter table public.pets enable row level security;
alter table public.pet_tasks enable row level security;

drop policy if exists "authenticated full access" on public.pets;
create policy "authenticated full access" on public.pets
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.pet_tasks;
create policy "authenticated full access" on public.pet_tasks
  for all to authenticated using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='pets') then
    alter publication supabase_realtime add table public.pets;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='pet_tasks') then
    alter publication supabase_realtime add table public.pet_tasks;
  end if;
end $$;
