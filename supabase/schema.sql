-- ══════════════════════════════════════════════════════════════
--  บ้านเรา — สคีมา Shopping List (รันใน Supabase → SQL Editor → Run)
--  ปลอดภัยที่จะรันซ้ำได้ (idempotent)
-- ══════════════════════════════════════════════════════════════

create table if not exists public.shopping_items (
  id          uuid primary key default gen_random_uuid(),
  category    text not null check (category in ('food','household','health')),
  name        text not null,
  qty         text,
  note        text,
  checked     boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- อัปเดต updated_at อัตโนมัติทุกครั้งที่แก้
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_shopping_updated on public.shopping_items;
create trigger trg_shopping_updated
  before update on public.shopping_items
  for each row execute function public.set_updated_at();

-- ── Row Level Security: ต้องล็อกอินก่อนถึงอ่าน/เขียนได้ ──
alter table public.shopping_items enable row level security;

drop policy if exists "authenticated full access" on public.shopping_items;
create policy "authenticated full access"
  on public.shopping_items
  for all
  to authenticated
  using (true)
  with check (true);

-- ── เปิด Realtime บนตารางนี้ ──
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'shopping_items'
  ) then
    alter publication supabase_realtime add table public.shopping_items;
  end if;
end $$;
