-- ══════════════════════════════════════════════════════════════
--  บ้านเรา — สคีมาโมดูล "เมนู" (รันเพิ่มใน Supabase → SQL Editor → Run)
--  รันซ้ำได้ปลอดภัย (idempotent)
-- ══════════════════════════════════════════════════════════════

-- สูตรอาหาร / จานอาหาร
create table if not exists public.dishes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  difficulty   text not null default 'easy' check (difficulty in ('easy','medium','hard')),
  ingredients  jsonb not null default '[]'::jsonb,   -- [{ "name": "หมูสามชั้น", "defrost": true }, ...]
  steps        text,                                  -- วิธีทำ (บรรทัดละขั้น)
  source_url   text,                                  -- ลิงก์สูตรต้นฉบับ (เว็บ/YouTube)
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- แผนมื้ออาหารรายวัน (จานอะไร วันไหน มื้อไหน)
create table if not exists public.meal_plan (
  id          uuid primary key default gen_random_uuid(),
  plan_date   date not null,
  slot        text not null check (slot in ('breakfast','lunch','dinner')),
  dish_id     uuid not null references public.dishes(id) on delete cascade,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_meal_plan_date on public.meal_plan (plan_date);

-- ทำเอง (cook) หรือ ซื้อจากร้าน (restaurant) — เพิ่มภายหลัง รันซ้ำได้ปลอดภัย
alter table public.dishes add column if not exists kind text not null default 'cook';

-- meal tags (breakfast/lunch/dinner) for filtering recipes — safe to re-run
alter table public.dishes add column if not exists meal_tags jsonb not null default '[]'::jsonb;

-- allow a 'kid' meal slot (for households with kids) — safe to re-run
alter table public.meal_plan drop constraint if exists meal_plan_slot_check;
alter table public.meal_plan add constraint meal_plan_slot_check check (slot in ('breakfast','lunch','dinner','kid'));

-- updated_at อัตโนมัติสำหรับ dishes (ใช้ฟังก์ชันเดิมจาก schema.sql)
drop trigger if exists trg_dishes_updated on public.dishes;
create trigger trg_dishes_updated
  before update on public.dishes
  for each row execute function public.set_updated_at();

-- ── RLS: ต้องล็อกอินก่อน ──
alter table public.dishes enable row level security;
alter table public.meal_plan enable row level security;

drop policy if exists "authenticated full access" on public.dishes;
create policy "authenticated full access" on public.dishes
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.meal_plan;
create policy "authenticated full access" on public.meal_plan
  for all to authenticated using (true) with check (true);

-- ── Realtime ──
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='dishes') then
    alter publication supabase_realtime add table public.dishes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='meal_plan') then
    alter publication supabase_realtime add table public.meal_plan;
  end if;
end $$;
