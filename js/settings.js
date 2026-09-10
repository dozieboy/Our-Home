// Household-wide key/value settings (shared across everyone). Currently: has_kids.
import { supabase } from "./supabase.js";

let cache = { has_kids: false, home_name: "" };
let channel = null;

export function getHasKids() { return !!cache.has_kids; }
export function getHomeName() { return cache.home_name || ""; }

export async function loadSettings() {
  const { data, error } = await supabase.from("app_settings").select("*");
  if (error) { console.error(error); return; }
  const map = {};
  (data || []).forEach((r) => { map[r.key] = r.value; });
  cache.has_kids = map.has_kids === "true";
  cache.home_name = map.home_name || "";
  document.dispatchEvent(new CustomEvent("settings-changed"));
}

export async function setHomeName(name) {
  cache.home_name = (name || "").trim();
  document.dispatchEvent(new CustomEvent("settings-changed"));
  const { error } = await supabase.from("app_settings").upsert(
    { key: "home_name", value: cache.home_name, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) console.error(error);
}

export async function setHasKids(on) {
  cache.has_kids = !!on;
  document.dispatchEvent(new CustomEvent("settings-changed"));
  const { error } = await supabase.from("app_settings").upsert(
    { key: "has_kids", value: on ? "true" : "false", updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) console.error(error);
}

export async function initSettings() {
  await loadSettings();
  channel = supabase.channel("settings-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, loadSettings)
    .subscribe();
}

export function teardownSettings() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  cache = { has_kids: false, home_name: "" };
}
