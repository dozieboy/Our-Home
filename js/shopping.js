import { supabase } from "./supabase.js";
import { toast, whoami } from "./app.js";
import { renderStaples, markInStockByNameCat } from "./staples.js";
import { openSheet, closeSheet } from "./ui.js";

const CATEGORIES = [
  { key: "food", label: "Food", emoji: "🍎" },
  { key: "household", label: "Household", emoji: "🏠" },
  { key: "health", label: "Health", emoji: "💊" },
];

let items = [];          // in-memory state
let channel = null;      // realtime subscription

const $ = (id) => document.getElementById(id);

// ── Initial load ────────────────────────────────────
async function loadItems() {
  const { data, error } = await supabase
    .from("shopping_items")
    .select("*")
    .order("checked", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) { console.error(error); toast("Failed to load"); return; }
  items = data || [];
  render();
}

// ── Add item ────────────────────────────────────────
async function addItem(name, category, qty) {
  const optimistic = {
    id: "tmp-" + crypto.randomUUID(),
    name, category, qty: qty || null, note: null,
    checked: false, created_by: whoami() || null,
    created_at: new Date().toISOString(),
  };
  items.push(optimistic);
  render();

  const { data, error } = await supabase
    .from("shopping_items")
    .insert({ name, category, qty: qty || null, created_by: whoami() || null })
    .select()
    .single();

  if (error) {
    items = items.filter((i) => i.id !== optimistic.id);
    render();
    toast("Couldn't add");
    return;
  }
  const idx = items.findIndex((i) => i.id === optimistic.id);
  if (idx !== -1) items[idx] = data;
  render();
}

// ── Tick = bought → into pantry as in-stock, leaves the list ──
async function buyItem(id) {
  const it = items.find((i) => i.id === id);
  if (!it || String(id).startsWith("tmp-")) return;
  items = items.filter((x) => x.id !== id); render();   // optimistic remove
  await markInStockByNameCat(it.name, it.category);      // pantry → in stock
  const { error } = await supabase.from("shopping_items").delete().eq("id", id);
  if (error) { toast("Something went wrong"); await loadItems(); return; }
  toast("Bought → pantry: " + it.name);
}

// ── Scan / type from receipt (bulk add) ─────────────
function openReceiptSheet() {
  const wrap = document.createElement("div");
  wrap.className = "receipt-sheet";
  wrap.innerHTML = `
    <input type="file" accept="image/*" id="rc-file" hidden />
    <button type="button" class="btn-primary full" id="rc-pick">📷 Take photo / choose receipt</button>
    <img id="rc-preview" class="rc-preview" hidden alt="receipt" />
    <label>Items (one per line)
      <textarea id="rc-text" rows="8"></textarea></label>
    <label>Category
      <select id="rc-cat">
        <option value="food">🍎 Food</option>
        <option value="household">🏠 Household</option>
        <option value="health">💊 Health</option>
      </select></label>
    <p class="muted rc-note">For now, read the photo and type the items — automatic receipt reading (AI) can be plugged in later.</p>
    <button type="button" class="btn-primary full" id="rc-add">Add to shopping list</button>`;
  openSheet("Scan / type from receipt", wrap);

  const ta = wrap.querySelector("#rc-text");
  ta.placeholder = "Milk\nEggs\nDish soap";
  const file = wrap.querySelector("#rc-file");
  const preview = wrap.querySelector("#rc-preview");
  wrap.querySelector("#rc-pick").addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    const f = file.files && file.files[0];
    if (!f) return;
    preview.src = URL.createObjectURL(f);
    preview.hidden = false;
  });
  wrap.querySelector("#rc-add").addEventListener("click", () =>
    addReceiptItems(ta.value, wrap.querySelector("#rc-cat").value));
}

async function addReceiptItems(text, category) {
  const names = (text || "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (!names.length) { toast("No items yet"); return; }
  const rows = names.map((n) => ({ name: n, category, created_by: whoami() || null }));
  const { error } = await supabase.from("shopping_items").insert(rows);
  if (error) { toast("Couldn't add"); return; }
  closeSheet();
  toast(`Added ${names.length} item(s)`);
}

// ── Delete ──────────────────────────────────────────
async function deleteItem(id) {
  if (String(id).startsWith("tmp-")) return;
  const backup = items.slice();
  items = items.filter((i) => i.id !== id); render();
  const { error } = await supabase.from("shopping_items").delete().eq("id", id);
  if (error) { items = backup; render(); toast("Couldn't delete"); }
}

// ── Edit name (tap the text) ────────────────────────
async function editItem(id) {
  const it = items.find((i) => i.id === id);
  if (!it || String(id).startsWith("tmp-")) return;
  const name = prompt("Edit item name:", it.name);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const old = it.name; it.name = trimmed; render();
  const { error } = await supabase.from("shopping_items").update({ name: trimmed }).eq("id", id);
  if (error) { it.name = old; render(); toast("Couldn't update"); }
}

// ── Realtime ────────────────────────────────────────
function subscribe() {
  channel = supabase
    .channel("shopping-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "shopping_items" }, (payload) => {
      const { eventType, new: row, old } = payload;
      if (eventType === "INSERT") {
        if (!items.some((i) => i.id === row.id)) items.push(row);
      } else if (eventType === "UPDATE") {
        const idx = items.findIndex((i) => i.id === row.id);
        if (idx !== -1) items[idx] = row; else items.push(row);
      } else if (eventType === "DELETE") {
        items = items.filter((i) => i.id !== old.id);
      }
      render();
    })
    .subscribe((status) => {
      const el = $("sync-status");
      if (status === "SUBSCRIBED") { el.textContent = "Live sync"; el.className = "sync-status ok"; }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { el.textContent = "Connection issue"; el.className = "sync-status off"; }
    });
}

// ── Render ──────────────────────────────────────────
function render() {
  const container = $("lists");
  const sorted = items.slice().sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  container.innerHTML = "";
  let total = 0;

  for (const cat of CATEGORIES) {
    const catItems = sorted.filter((i) => i.category === cat.key);
    if (catItems.length === 0) continue;
    total += catItems.length;

    const remaining = catItems.filter((i) => !i.checked).length;
    const section = document.createElement("div");
    section.className = `category cat-${cat.key}`;
    section.innerHTML = `
      <div class="category-head">
        <span class="dot"></span>${cat.emoji} ${cat.label}
        <span class="count">(${remaining}/${catItems.length} left)</span>
      </div>
      <ul class="item-list"></ul>`;
    const ul = section.querySelector(".item-list");

    for (const it of catItems) {
      const li = document.createElement("li");
      li.className = "item" + (it.checked ? " done" : "");
      const meta = [it.qty, it.created_by].filter(Boolean).join(" · ");
      li.innerHTML = `
        <button class="check" aria-label="buy">${it.checked ? "✓" : ""}</button>
        <div class="body">
          <div class="name"></div>
          ${meta ? `<div class="meta"></div>` : ""}
        </div>
        <button class="del" aria-label="delete">🗑</button>`;
      li.querySelector(".name").textContent = it.name;
      if (meta) li.querySelector(".meta").textContent = meta;
      li.querySelector(".check").addEventListener("click", () => buyItem(it.id));
      li.querySelector(".body").addEventListener("click", () => editItem(it.id));
      li.querySelector(".del").addEventListener("click", () => deleteItem(it.id));
      ul.appendChild(li);
    }
    container.appendChild(section);
  }

  $("empty-state").hidden = total > 0;
  document.dispatchEvent(new CustomEvent("shopping-changed"));
}

// Summary for Home dashboard
export function getShoppingSummary() {
  const byCat = { food: 0, household: 0, health: 0 };
  let remaining = 0, done = 0;
  for (const it of items) {
    if (it.checked) { done++; } else { remaining++; if (byCat[it.category] != null) byCat[it.category]++; }
  }
  return { total: items.length, remaining, done, byCat };
}

// ── init / teardown ─────────────────────────────────
export async function initShopping() {
  // Sub-tabs: Shopping list | Pantry
  document.querySelectorAll("[data-shopsub]").forEach((b) =>
    b.addEventListener("click", () => {
      const sub = b.dataset.shopsub;
      document.querySelectorAll("[data-shopsub]").forEach((x) => x.classList.toggle("active", x === b));
      $("shop-list-view").hidden = sub !== "list";
      $("shop-staples-view").hidden = sub !== "staples";
      if (sub === "staples") renderStaples();
      window.scrollTo(0, 0);
    }));

  $("scan-receipt").addEventListener("click", openReceiptSheet);

  $("add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("add-name").value.trim();
    if (!name) return;
    addItem(name, $("add-category").value, $("add-qty").value.trim());
    $("add-name").value = "";
    $("add-qty").value = "";
    $("add-name").focus();
  });

  await loadItems();
  subscribe();
}

export function teardownShopping() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  items = [];
}
