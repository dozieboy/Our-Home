-- ══════════════════════════════════════════════════════════════
--  บ้านเรา — คลังของใช้ประจำ (Restock) — รันใน SQL Editor → Run
--  รันซ้ำได้ปลอดภัย (idempotent)
-- ══════════════════════════════════════════════════════════════

create table if not exists public.staples (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null default 'household' check (category in ('food','household','health')),
  in_stock    boolean not null default true,   -- true = มี, false = หมด (รอซื้อ)
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_staples_updated on public.staples;
create trigger trg_staples_updated
  before update on public.staples
  for each row execute function public.set_updated_at();

alter table public.staples enable row level security;
drop policy if exists "authenticated full access" on public.staples;
create policy "authenticated full access" on public.staples
  for all to authenticated using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='staples') then
    alter publication supabase_realtime add table public.staples;
  end if;
end $$;
