-- ══════════════════════════════════════════════════════════════
--  Our Home — Finance (shared expenses) — run in Supabase → SQL Editor
--  Safe to re-run (idempotent)
-- ══════════════════════════════════════════════════════════════

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  amount      numeric(12,2) not null,
  note        text,
  category    text not null default 'other' check (category in ('food','household','health','other')),
  payer       text,
  spent_on    date not null default current_date,
  reimbursed  boolean not null default false,   -- settled between the two of you?
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_expenses_date on public.expenses (spent_on);

drop trigger if exists trg_expenses_updated on public.expenses;
create trigger trg_expenses_updated before update on public.expenses
  for each row execute function public.set_updated_at();

alter table public.expenses enable row level security;
drop policy if exists "authenticated full access" on public.expenses;
create policy "authenticated full access" on public.expenses
  for all to authenticated using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='expenses') then
    alter publication supabase_realtime add table public.expenses;
  end if;
end $$;
