# บ้านเรา — Home PWA

แอปครอบครัวแชร์กันสองคน (PWA เปิดจาก iPhone ได้เหมือนแอป) ข้อมูลซิงก์ผ่าน Supabase
โครงแรก (MVP) = **Shopping List** — โมดูลอื่น (Home / Menu / Calendar+Mood / Pet Care / Finance) ต่อยอดทีหลัง

โครงสร้าง: **no-build** (HTML/CSS/JS ล้วน + Supabase จาก CDN) ไม่ต้องมี Node.js

---

## 1) ตั้งค่า Supabase (ทำครั้งเดียว)

1. สร้างโปรเจกต์ที่ https://supabase.com (region แนะนำ: Singapore)
2. เปิด **SQL Editor** → วางเนื้อหาไฟล์ [`supabase/schema.sql`](supabase/schema.sql) → **Run**
3. **Settings → API** → คัดลอก 2 ค่า มาวางใน [`js/config.js`](js/config.js):
   - `SUPABASE_URL`  → ช่อง Project URL
   - `SUPABASE_ANON_KEY` → ช่อง anon public
4. **Authentication → Users → Add user** → สร้าง 1 บัญชี (email + password) ที่สองคนใช้ร่วมกัน
   - ถ้า Supabase บังคับ confirm อีเมล ให้ติ๊ก **Auto Confirm User** ตอนสร้าง

> anon key ใส่ในเว็บ static ได้ ความปลอดภัยจริงมาจาก RLS ในไฟล์ schema (ต้องล็อกอินก่อนถึงอ่าน/เขียนได้)

---

## 2) รันทดสอบในเครื่อง (ไม่มี Node ก็ได้)

ใช้ static server เล็ก ๆ ด้วย PowerShell แล้วเปิด http://localhost:8137
(ไฟล์ตัวอย่าง server อยู่ที่ scratchpad — หรือใช้ Live Server ของ VS Code ก็ได้)

Service worker + ES module ทำงานบน `localhost` และ `https` เท่านั้น (ไม่ทำงานบน `file://`)

---

## 3) Deploy ขึ้น GitHub Pages

```bash
cd F:/Claude/Projects/Trade/home-app
git init
git add .
git commit -m "Initial Shopping List PWA"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

จากนั้นใน repo → **Settings → Pages** → Source = `Deploy from a branch` → Branch = `main` / `/ (root)` → Save
ได้ URL แบบ `https://<user>.github.io/<repo>/`

> `start_url`, `scope` และ path ทั้งหมดเป็นแบบ relative (`./`) จึงใช้ได้กับ subpath ของ GitHub Pages ทันที

---

## 4) ติดตั้งลง iPhone

เปิด URL ด้วย **Safari** → ปุ่ม Share → **Add to Home Screen** → เปิดจากไอคอนหน้าจอโฮม

---

## ไฟล์สำคัญ

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | โครงหน้า + meta สำหรับ iOS PWA |
| `js/config.js` | ⚙️ ใส่ Supabase URL + anon key ที่นี่ |
| `js/supabase.js` | สร้าง Supabase client |
| `js/app.js` | auth / สลับหน้า / toast / ชื่อผู้ใช้ |
| `js/shopping.js` | ตรรกะ Shopping List + realtime |
| `supabase/schema.sql` | ตาราง + RLS + realtime (รันใน Supabase) |
| `sw.js`, `manifest.webmanifest`, `icons/` | ส่วนที่ทำให้เป็น PWA |

## ถัดไป (roadmap)
Home dashboard → Menu (เมนู+เตือนของแช่แข็ง+สูตร) → Calendar+Mood → Pet Care (3 ตัว) → Finance (ค่าใช้จ่ายส่วนกลาง + งบรายเดือน) → push notification (ต้องมี server)
