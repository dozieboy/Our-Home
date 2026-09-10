-- ══════════════════════════════════════════════════════════════
--  Our Home — Account / Family members — run in Supabase → SQL Editor
--  Safe to re-run (idempotent)
-- ══════════════════════════════════════════════════════════════

create table if not exists public.household_members (
  email       text primary key,
  name        text,
  status      text not null default 'active' check (status in ('active','invited')),
  invited_by  text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz
);

alter table public.household_members enable row level security;
drop policy if exists "authenticated full access" on public.household_members;
create policy "authenticated full access" on public.household_members
  for all to authenticated using (true) with check (true);

-- Household-wide key/value settings (e.g. has_kids = 'true')
create table if not exists public.app_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists "authenticated full access" on public.app_settings;
create policy "authenticated full access" on public.app_settings
  for all to authenticated using (true) with check (true);

-- Kids (name + birthday) — shown when "We have kids" is on
create table if not exists public.kids (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  birthdate   date,
  gender      text,            -- 'boy' | 'girl' | null
  created_by  text,
  created_at  timestamptz not null default now()
);
alter table public.kids add column if not exists gender text;
alter table public.kids enable row level security;
drop policy if exists "authenticated full access" on public.kids;
create policy "authenticated full access" on public.kids
  for all to authenticated using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='household_members') then
    alter publication supabase_realtime add table public.household_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='app_settings') then
    alter publication supabase_realtime add table public.app_settings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='kids') then
    alter publication supabase_realtime add table public.kids;
  end if;
end $$;
