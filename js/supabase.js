import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// ยังไม่ได้ตั้งค่า config?
export const isConfigured =
  !!SUPABASE_URL && !SUPABASE_URL.startsWith("PASTE") &&
  !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith("PASTE");

// สร้าง client เฉพาะเมื่อตั้งค่าแล้ว (กัน error จาก URL ปลอม)
export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,      // จำ session ไว้ ไม่ต้องล็อกอินบ่อย
        autoRefreshToken: true,
        storageKey: "baanrao-auth",
      },
    })
  : null;
