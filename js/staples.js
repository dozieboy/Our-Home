import { supabase } from "./supabase.js";
import { toast, whoami } from "./app.js";

const $ = (id) => document.getElementById(id);
const CATS = [
  { key: "food", emoji: "🍎", label: "Food" },
  { key: "household", emoji: "🏠", label: "Household" },
  { key: "health", emoji: "💊", label: "Health" },
];
const catLabel = (k) => { const c = CATS.find((x) => x.key === k); return c ? `${c.emoji} ${c.label}` : ""; };

let staples = [];
let onList = new Set();   // items already on the shopping list (name|category)
let channel = null;

const keyOf = (name, cat) => (name || "").trim().toLowerCase() + "|" + cat;

async function refreshOnList() {
  const { data } = await supabase.from("shopping_items").select("name,category");
  onList = new Set((data || []).map((r) => keyOf(r.name, r.category)));
}

async function reload() {
  const [sRes] = await Promise.all([
    supabase.from("staples").select("*").order("name"),
    refreshOnList(),
  ]);
  if (sRes.error) console.error(sRes.error);
  staples = sRes.data || [];
  render();
  document.dispatchEvent(new CustomEvent("staples-changed"));
}

export function getStaplesSummary() {
  return { out: staples.filter((s) => !s.in_stock).length, total: staples.length };
}

async function addStaple(name, category, qty, unit) {
  const { error } = await supabase.from("staples").insert({ name, category, qty_g: qty || null, unit: unit || "g", created_by: whoami() || null });
  if (error) {
    console.error(error);
    toast(/column .*(unit|qty_g)/i.test(error.message || "")
      ? "Run schema_staples.sql first (missing column)"
      : "Couldn't add: " + (error.message || error.code || "error"));
    return;
  }
  await reload();
}
async function setQty(id) {
  const s = staples.find((x) => x.id === id);
  if (!s) return;
  const label = (s.unit === "ea" ? "EA" : "g");
  const v = prompt(`Quantity in stock (${label}) — leave empty to clear:`, s.qty_g != null ? s.qty_g : "");
  if (v === null) return;
  const t = String(v).trim();
  const g = t === "" ? null : (parseFloat(t) >= 0 ? parseFloat(t) : null);
  s.qty_g = g; render();   // optimistic
  const { error } = await supabase.from("staples").update({ qty_g: g }).eq("id", id);
  if (error) { toast("Couldn't update"); await reload(); }
}
const stockLabel = (s) => s.qty_g != null ? `${s.qty_g}${s.unit === "ea" ? " EA" : " g"}` : "";

// All stock item names (for ingredient autocomplete in Meals)
export function getStockNames() { return staples.map((s) => (s.name || "").trim()).filter(Boolean); }

// Read stock level for a name (used by Meals to check ingredients)
export function getStockByName(name) {
  const key = (name || "").trim().toLowerCase();
  if (!key) return null;
  return staples.find((s) => s.name.trim().toLowerCase() === key) || null;
}
async function toggleStock(id, next) {
  const s = staples.find((x) => x.id === id);
  if (!s) return;
  s.in_stock = next; render();   // optimistic
  const { error } = await supabase.from("staples").update({ in_stock: next }).eq("id", id);
  if (error) { toast("Couldn't update"); await reload(); return; }
  if (next) {
    await removeFromShoppingByNameCat(s.name, s.category);   // have it → drop from shopping list
  }
  // out → not auto-added; it surfaces under "Out — add to list" for the user to tap "Add to list"
  await reload();
}
async function deleteStaple(id) {
  const { error } = await supabase.from("staples").delete().eq("id", id);
  if (error) { toast("Couldn't delete"); return; }
  await reload();
}
async function shoppingExists(name, category) {
  const { data } = await supabase.from("shopping_items").select("id").eq("name", name).eq("category", category).limit(1);
  return !!(data && data.length);
}
async function addToShoppingIfAbsent(s) {
  if (await shoppingExists(s.name, s.category)) return false;   // avoid duplicates
  const { error } = await supabase.from("shopping_items").insert({ name: s.name, category: s.category, created_by: whoami() || null });
  if (error) { toast("Couldn't add to list"); return false; }
  return true;
}
async function removeFromShoppingByNameCat(name, category) {
  await supabase.from("shopping_items").delete().eq("name", name).eq("category", category);
}
async function addAllOutToShopping() {
  const out = staples.filter((s) => !s.in_stock);
  if (!out.length) return;
  let n = 0;
  for (const s of out) { if (await addToShoppingIfAbsent(s)) n++; }
  await refreshOnList(); render();
  toast(n ? `Added ${n} to list` : "Already on the list");
}
// Called from shopping.js: bought → stock as in-stock (update existing / create new).
// addG (optional grams, e.g. parsed from "200 g") gets added onto the on-hand amount.
export async function markInStockByNameCat(name, category, addQty, addUnit) {
  const key = (name || "").trim();
  if (!key) return;
  const u = addUnit === "ea" ? "ea" : "g";
  const existing = staples.find((s) => s.name.trim().toLowerCase() === key.toLowerCase() && s.category === category);
  if (existing) {
    const patch = { in_stock: true };
    if (addQty) {
      const eu = existing.unit || "g";
      if (existing.qty_g == null || eu === u) {            // same unit (or none yet) → add on
        patch.qty_g = (Number(existing.qty_g) || 0) + addQty;
        patch.unit = existing.qty_g == null ? u : eu;
      }
      // different unit with an existing amount → just mark in stock, don't merge mismatched units
    }
    await supabase.from("staples").update(patch).eq("id", existing.id);
  } else {
    await supabase.from("staples").insert({ name: key, category, in_stock: true, qty_g: addQty || null, unit: u, created_by: whoami() || null });
  }
  await reload();
}

function render() {
  const el = $("shop-staples-view");
  if (!el) return;
  const out = staples.filter((s) => !s.in_stock);
  const waiting = out.filter((s) => !onList.has(keyOf(s.name, s.category)));   // out + not yet on list

  const catHtml = CATS.map((c) => {
    const items = staples.filter((s) => s.category === c.key);
    if (!items.length) return "";
    const rows = items.map((s) => `
      <li class="item staple ${s.in_stock ? "" : "out"}">
        <div class="body"><div class="name">${esc(s.name)}</div>${s.qty_g != null ? `<div class="meta">${stockLabel(s)} in stock</div>` : ""}</div>
        <button class="g-pill" data-setg="${s.id}">${s.qty_g != null ? stockLabel(s) : "⚖️"}</button>
        <button class="stock-pill ${s.in_stock ? "in" : "out"}" data-toggle="${s.id}" data-next="${s.in_stock ? 0 : 1}">${s.in_stock ? "✅ Have" : "❌ Out"}</button>
        <button class="del" data-del="${s.id}">🗑</button>
      </li>`).join("");
    return `<div class="category cat-${c.key}">
      <div class="category-head"><span class="dot"></span>${c.emoji} ${c.label} <span class="count">(${items.length})</span></div>
      <ul class="item-list">${rows}</ul></div>`;
  }).join("");

  el.innerHTML = `
    <form id="staple-add" class="add-form">
      <input type="text" id="staple-name" placeholder="Add a staple… (e.g. Dish soap)" required />
      <div class="add-row">
        <select id="staple-cat">
          <option value="household">🏠 Household</option>
          <option value="food">🍎 Food</option>
          <option value="health">💊 Health</option>
        </select>
        <input type="number" id="staple-g" class="staple-g" placeholder="qty" min="0" inputmode="decimal" />
        <select id="staple-unit" class="staple-unit"><option value="g">g</option><option value="ea">EA</option></select>
        <button type="submit" class="btn-primary add-btn">＋ Add</button>
      </div>
    </form>

    ${waiting.length ? `
      <div class="restock-box">
        <div class="restock-head">🔴 Out — add to list (${waiting.length})
          <button class="link-btn" id="restock-all">Add all to list</button></div>
        <ul class="item-list">${waiting.map((s) => `
          <li class="item">
            <div class="body"><div class="name">${esc(s.name)}</div><div class="meta">${catLabel(s.category)}</div></div>
            <button class="mini-action cart" data-cart="${s.id}">🛒 Add to list</button>
            <button class="mini-action" data-toggle="${s.id}" data-next="1">Have it</button>
          </li>`).join("")}</ul>
      </div>`
      : `<div class="restock-box ok">✅ Nothing to add to the list</div>`}

    ${staples.length ? `<div class="staples-label">📦 Stock</div>${catHtml}`
      : `<p class="empty">No staples yet — add things you keep at home, then tap “Out” when they run low 📦</p>`}
  `;

  $("staple-add").addEventListener("submit", (e) => {
    e.preventDefault();
    const n = $("staple-name").value.trim();
    if (!n) return;
    const g = parseFloat($("staple-g").value);
    addStaple(n, $("staple-cat").value, g > 0 ? g : null, $("staple-unit").value);
    $("staple-name").value = "";
    $("staple-g").value = "";
    $("staple-name").focus();
  });
  el.querySelectorAll("[data-setg]").forEach((b) =>
    b.addEventListener("click", () => setQty(b.dataset.setg)));
  const all = $("restock-all");
  if (all) all.addEventListener("click", addAllOutToShopping);
  el.querySelectorAll("[data-toggle]").forEach((b) =>
    b.addEventListener("click", () => toggleStock(b.dataset.toggle, b.dataset.next === "1")));
  el.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteStaple(b.dataset.del)));
  el.querySelectorAll("[data-cart]").forEach((b) =>
    b.addEventListener("click", async () => {
      const s = staples.find((x) => x.id === b.dataset.cart);
      if (!s) return;
      const added = await addToShoppingIfAbsent(s);
      await refreshOnList(); render();   // added → drops off "Out — add to list"
      toast(added ? "Added to list: " + s.name : "Already on the list");
    }));
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function renderStaples() { render(); }

// When the shopping list changes (bought/removed) → refresh the pantry's "on list" state
document.addEventListener("shopping-changed", async () => {
  if (!$("shop-staples-view")) return;
  await refreshOnList();
  render();
});

export async function initStaples() {
  await reload();
  channel = supabase.channel("staples-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "staples" }, reload)
    .subscribe();
}
export function teardownStaples() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  staples = [];
}
