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

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='household_members') then
    alter publication supabase_realtime add table public.household_members;
  end if;
end $$;
