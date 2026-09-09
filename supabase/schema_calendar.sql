-- ══════════════════════════════════════════════════════════════
--  Our Home — Calendar + Mood — run in Supabase → SQL Editor → Run
--  Safe to re-run (idempotent)
-- ══════════════════════════════════════════════════════════════

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  event_date  date not null,
  event_time  text,                                  -- "HH:MM" or null
  category    text not null default 'shared' check (category in ('personal','shared')),
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_events_date on public.events (event_date);

create table if not exists public.moods (
  mood_date   date primary key,                      -- one mood per day (shared household)
  mood        text not null,                         -- great|good|ok|low|bad
  note        text,
  created_by  text,
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_events_updated on public.events;
create trigger trg_events_updated before update on public.events
  for each row execute function public.set_updated_at();

drop trigger if exists trg_moods_updated on public.moods;
create trigger trg_moods_updated before update on public.moods
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.moods enable row level security;

drop policy if exists "authenticated full access" on public.events;
create policy "authenticated full access" on public.events
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.moods;
create policy "authenticated full access" on public.moods
  for all to authenticated using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='events') then
    alter publication supabase_realtime add table public.events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='moods') then
    alter publication supabase_realtime add table public.moods;
  end if;
end $$;
