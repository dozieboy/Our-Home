import { supabase } from "./supabase.js";
import { toast, whoami } from "./app.js";
import { openSheet, closeSheet, esc } from "./ui.js";
import { getStockByName, getStockNames } from "./staples.js";
import { getHasKids } from "./settings.js";

const $ = (id) => document.getElementById(id);

const BASE_SLOTS = [
  { key: "breakfast", label: "Breakfast", emoji: "🌅" },
  { key: "lunch", label: "Lunch", emoji: "☀️" },
  { key: "dinner", label: "Dinner", emoji: "🌙" },
];
const KID_SLOT = { key: "kid", label: "Kid meal", emoji: "👶" };
const ALL_SLOTS = [...BASE_SLOTS, KID_SLOT];
// Visible slots depend on whether the household has kids
function slots() { return getHasKids() ? [...BASE_SLOTS, KID_SLOT] : [...BASE_SLOTS]; }
const DIFF = {
  easy:   { label: "Easy", cls: "d-easy" },
  medium: { label: "Medium", cls: "d-medium" },
  hard:   { label: "Hard", cls: "d-hard" },
};

let dishes = [];        // {id,name,difficulty,ingredients:[{name,defrost}],steps}
let plan = [];          // {id,plan_date,slot,dish_id}
let selectedDate = todayISO();
let subTab = "today";   // 'today' | 'recipes'
let expandedDish = null;
let channels = [];
let recipeSearch = "";          // filter text for the Recipes list
let recipeTagFilter = "";       // "" | breakfast | lunch | dinner
let restockPanel = null;        // null | 'day' | 'week' — which restock preview is expanded
let restockItems = [];          // shortfall items for the open panel
let onShoppingList = new Set();  // lowercased names already on the shopping list

// ── Date helpers ────────────────────────────────────
function isoDate(d) {
  const t = new Date(d);
  t.setMinutes(t.getMinutes() - t.getTimezoneOffset());
  return t.toISOString().slice(0, 10);
}
function todayISO() { return isoDate(new Date()); }
function addDays(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoDate(d); }
function fmtDate(iso) { const p = (iso || "").split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; }
function dayLabel(iso) {
  if (iso === todayISO()) return "Today";
  if (iso === addDays(todayISO(), 1)) return "Tomorrow";
  if (iso === addDays(todayISO(), -1)) return "Yesterday";
  return fmtDate(iso);
}
const dishFor = (id) => dishes.find((d) => d.id === id);

// Quantity helpers — unit is 'g' (grams) or 'ea' (each). Reads legacy `grams` too.
function ingQty(i) {
  const q = i.qty != null ? i.qty : (i.grams != null ? i.grams : null);
  return { qty: q != null ? Number(q) : null, unit: i.unit === "ea" ? "ea" : "g" };
}
const unitLabel = (u) => (u === "ea" ? "EA" : "g");
const qtyTag = (qty, unit) => `${qty}${unit === "ea" ? " EA" : "g"}`;       // compact tag, e.g. 2 EA / 500g
const qtyStr = (qty, unit) => `${Math.round(Number(qty))} ${unitLabel(unit)}`; // shopping qty, e.g. 2 EA / 150 g

// ── Load ────────────────────────────────────────────
async function reload() {
  const [dRes, pRes] = await Promise.all([
    supabase.from("dishes").select("*").order("name"),
    supabase.from("meal_plan").select("*").gte("plan_date", addDays(todayISO(), -1)).order("plan_date"),
  ]);
  if (dRes.error) console.error(dRes.error);
  if (pRes.error) console.error(pRes.error);
  dishes = dRes.data || [];
  plan = pRes.data || [];
  render();
  document.dispatchEvent(new CustomEvent("menu-changed"));
}

// ── Summary for Home ────────────────────────────────
export function getTodayMenuSummary() {
  const t = todayISO();
  const slotList = slots().map((s) => {
    const names = plan.filter((p) => p.plan_date === t && p.slot === s.key)
      .map((p) => dishFor(p.dish_id)?.name).filter(Boolean);
    return { key: s.key, label: s.label, emoji: s.emoji, dishes: names };
  });
  const defrost = defrostFor(addDays(t, 1));
  return { slots: slotList, defrostTomorrow: defrost };
}

// Frozen ingredients to defrost for a given date
function defrostFor(iso) {
  const names = new Set();
  for (const p of plan.filter((x) => x.plan_date === iso)) {
    const d = dishFor(p.dish_id);
    (d?.ingredients || []).forEach((ing) => { if (ing.defrost && ing.name) names.add(ing.name); });
  }
  return [...names];
}
// All ingredients for a given date (deduped by name, grams summed)
function prepFor(iso) {
  const map = new Map();
  for (const p of plan.filter((x) => x.plan_date === iso)) {
    const d = dishFor(p.dish_id);
    (d?.ingredients || []).forEach((ing) => {
      if (!ing.name) return;
      const key = ing.name.trim().toLowerCase();
      const { qty, unit } = ingQty(ing);
      const cur = map.get(key) || { name: ing.name, qty: 0, unit };
      if (cur.unit === unit) cur.qty += qty || 0;   // only sum matching units
      map.set(key, cur);
    });
  }
  return [...map.values()];
}

// ── Render ──────────────────────────────────────────
function render() {
  const el = $("screen-menu");
  el.innerHTML = `
    <div class="subtabs">
      <button class="subtab ${subTab === "today" ? "active" : ""}" data-sub="today">📅 Today & plan</button>
      <button class="subtab ${subTab === "recipes" ? "active" : ""}" data-sub="recipes">📖 Recipes</button>
    </div>
    <div id="menu-body"></div>`;
  el.querySelectorAll("[data-sub]").forEach((b) =>
    b.addEventListener("click", () => { subTab = b.dataset.sub; render(); }));
  if (subTab === "today") renderToday();
  else renderRecipes();
}

function renderToday() {
  const body = $("menu-body");
  const nextDay = addDays(selectedDate, 1);

  const slotsHtml = slots().map((s) => {
    const entries = plan.filter((p) => p.plan_date === selectedDate && p.slot === s.key);
    const rows = entries.map((p) => {
      const d = dishFor(p.dish_id);
      if (!d) return "";
      const diff = DIFF[d.difficulty] || DIFF.easy;
      return `<div class="slot-dish">
        <span class="sd-name" data-gotodish="${d.id}" role="button" tabindex="0">${esc(d.name)} <span class="sd-go">›</span></span>
        ${d.kind === "restaurant" ? `<span class="kind-badge rest">🍽️</span>` : `<span class="diff ${diff.cls}">${diff.label}</span>`}
        <button class="sd-del" data-delplan="${p.id}">✕</button>
      </div>`;
    }).join("") || `<div class="slot-empty muted">No meal yet</div>`;
    return `<div class="slot-card">
      <div class="slot-head">${s.emoji} ${s.label}</div>
      ${rows}
      <button class="slot-add" data-addslot="${s.key}">＋ Add meal</button>
    </div>`;
  }).join("");

  const prep = prepFor(selectedDate);
  const defrost = defrostFor(nextDay);

  body.innerHTML = `
    <div class="datebar">
      <button class="date-nav" data-datenav="-1">‹</button>
      <div class="date-label">
        <div class="dl-main">${dayLabel(selectedDate)}</div>
        <div class="dl-sub muted">${fmtDate(selectedDate)}</div>
      </div>
      <button class="date-nav" data-datenav="1">›</button>
    </div>
    ${selectedDate !== todayISO() ? `<button class="link-btn" id="date-today">↩ Back to today</button>` : ""}

    <div class="slots">${slotsHtml}</div>

    ${plan.some((p) => p.plan_date === selectedDate)
      ? `<button class="btn-primary full restock-toggle" id="add-missing-day">🛒 Missing for ${dayLabel(selectedDate)} <span class="caret">${restockPanel === "day" ? "▾" : "▸"}</span></button>
         ${restockPanel === "day" ? renderRestockPanel() : ""}` : ""}
    ${plan.some((p) => p.plan_date >= todayISO() && p.plan_date <= addDays(todayISO(), 6))
      ? `<button class="link-btn week-restock" id="add-missing-week">🛒 Prep shopping for the next 7 days <span class="caret">${restockPanel === "week" ? "▾" : "▸"}</span></button>
         ${restockPanel === "week" ? renderRestockPanel() : ""}` : ""}

    <div class="prep-box">
      <div class="prep-title">🧂 To prep (ingredients — ${dayLabel(selectedDate)})</div>
      ${prep.length ? `<div class="tag-list">${prep.map((i) => `<span class="tag">${esc(i.name)}${i.qty ? ` · ${qtyTag(i.qty, i.unit)}` : ""}</span>`).join("")}</div>`
        : `<div class="muted">— none —</div>`}
    </div>

    <div class="prep-box defrost">
      <div class="prep-title">🧊 Take out of the freezer for ${dayLabel(nextDay)}</div>
      ${defrost.length ? `<div class="tag-list">${defrost.map((n) => `<span class="tag frozen">${esc(n)}</span>`).join("")}</div>`
        : `<div class="muted">— nothing to defrost —</div>`}
    </div>`;

  body.querySelectorAll("[data-datenav]").forEach((b) =>
    b.addEventListener("click", () => { selectedDate = addDays(selectedDate, +b.dataset.datenav); restockPanel = null; renderToday(); }));
  const todayBtn = $("date-today");
  if (todayBtn) todayBtn.addEventListener("click", () => { selectedDate = todayISO(); restockPanel = null; renderToday(); });
  body.querySelectorAll("[data-addslot]").forEach((b) =>
    b.addEventListener("click", () => openDishPicker(b.dataset.addslot)));
  body.querySelectorAll("[data-delplan]").forEach((b) =>
    b.addEventListener("click", () => removePlan(b.dataset.delplan)));
  body.querySelectorAll("[data-gotodish]").forEach((el) =>
    el.addEventListener("click", () => goToRecipe(el.dataset.gotodish)));
  const amd = $("add-missing-day");
  if (amd) amd.addEventListener("click", () => openRestockPanel("day"));
  const amw = $("add-missing-week");
  if (amw) amw.addEventListener("click", () => openRestockPanel("week"));
  const addAll = $("restock-addall");
  if (addAll) addAll.addEventListener("click", restockAddAll);
  body.querySelectorAll("[data-addone]").forEach((b) =>
    b.addEventListener("click", () => restockAddOne(+b.dataset.addone)));
}

function renderRecipes() {
  const body = $("menu-body");
  const list = dishes.map((d) => {
    const isRest = d.kind === "restaurant";
    const diff = DIFF[d.difficulty] || DIFF.easy;
    const nIng = (d.ingredients || []).length;
    const open = expandedDish === d.id;
    const steps = (d.steps || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const tags = d.meal_tags || [];
    const tagStr = tags.map((k) => (BASE_SLOTS.find((s) => s.key === k)?.emoji || "")).join("");
    return `<div class="recipe ${open ? "open" : ""}" data-rn="${esc(d.name.toLowerCase())}" data-tags="${esc(tags.join(" "))}">
      <div class="recipe-head" data-expand="${d.id}">
        <div>
          <div class="recipe-name">${esc(d.name)}${tagStr ? ` <span class="recipe-tags">${tagStr}</span>` : ""}</div>
          <div class="recipe-sub muted">${isRest ? "🍽️ Restaurant · bought" : `🍳 Cook · ${nIng} ingredient(s)`}</div>
        </div>
        ${isRest ? `<span class="kind-badge rest">🍽️</span>` : `<span class="diff ${diff.cls}">${diff.label}</span>`}
      </div>
      ${open ? `
        <div class="recipe-body">
          ${isRest ? `
            ${d.source_url ? `<a class="recipe-link" href="${esc(d.source_url)}" target="_blank" rel="noopener">🔗 Open link (map / delivery / menu)</a>`
              : `<div class="muted">Bought / eat out — no ingredients needed 🍽️</div>`}
          ` : `
            ${nIng ? `<div class="rb-label">Ingredients</div><div class="tag-list">${
              d.ingredients.map((i) => { const { qty, unit } = ingQty(i); return `<span class="tag ${i.defrost ? "frozen" : ""}">${i.defrost ? "🧊 " : ""}${esc(i.name)}${qty ? ` · ${qtyTag(qty, unit)}` : ""}</span>`; }).join("")
            }</div>` : ""}
            ${steps.length ? `<div class="rb-label">Steps</div><ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
            ${d.source_url ? `<a class="recipe-link" href="${esc(d.source_url)}" target="_blank" rel="noopener">🔗 View source recipe</a>` : ""}
            ${nIng ? `<button class="link-btn restock-btn" data-restock="${d.id}">🛒 Check stock → add missing to list</button>` : ""}
          `}
          <div class="recipe-actions">
            <button class="link-btn" data-editdish="${d.id}">✏️ Edit</button>
            <button class="link-btn danger" data-deldish="${d.id}">🗑 Delete</button>
          </div>
        </div>` : ""}
    </div>`;
  }).join("");

  const filterChips = `<div class="recipe-filters">
    <button class="rfilter ${recipeTagFilter === "" ? "active" : ""}" data-rfilter="">All</button>
    ${BASE_SLOTS.map((s) => `<button class="rfilter ${recipeTagFilter === s.key ? "active" : ""}" data-rfilter="${s.key}">${s.emoji} ${s.label}</button>`).join("")}
  </div>`;

  body.innerHTML = `
    <button class="btn-primary full" id="add-recipe">＋ Add recipe</button>
    ${dishes.length ? `<input type="search" id="recipe-search" class="search-box" placeholder="🔎 Search saved recipes…" value="${esc(recipeSearch)}">${filterChips}` : ""}
    ${dishes.length ? `<div class="recipe-list">${list}</div><p class="empty" id="recipe-none" hidden>No recipe matches your filter</p>`
      : `<p class="empty">No recipes yet — add your first 📖</p>`}`;

  const applyRecipeFilter = () => {
    const q = recipeSearch.trim().toLowerCase();
    const tf = recipeTagFilter;
    let shown = 0;
    body.querySelectorAll(".recipe").forEach((r) => {
      const okText = !q || (r.dataset.rn || "").includes(q);
      const okTag = !tf || (r.dataset.tags || "").split(" ").includes(tf);
      const hit = okText && okTag;
      r.hidden = !hit;
      if (hit) shown++;
    });
    const none = $("recipe-none");
    if (none) none.hidden = !((q || tf) && shown === 0);
  };

  $("add-recipe").addEventListener("click", () => openDishForm(null));
  const rs = $("recipe-search");
  if (rs) rs.addEventListener("input", () => { recipeSearch = rs.value; applyRecipeFilter(); });
  body.querySelectorAll("[data-rfilter]").forEach((b) =>
    b.addEventListener("click", () => { recipeTagFilter = b.dataset.rfilter; renderRecipes(); }));
  applyRecipeFilter();
  body.querySelectorAll("[data-expand]").forEach((b) =>
    b.addEventListener("click", () => { const id = b.dataset.expand; expandedDish = expandedDish === id ? null : id; renderRecipes(); }));
  body.querySelectorAll("[data-editdish]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); openDishForm(b.dataset.editdish); }));
  body.querySelectorAll("[data-deldish]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); deleteDish(b.dataset.deldish); }));
  body.querySelectorAll("[data-restock]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); addMissingToShopping(dishFor(b.dataset.restock)); }));
}

// ── Stock check → add missing/short ingredients to the shopping list ──
// Given a list of ingredients, return which ones are missing / short in stock.
function shortfallFor(ingredients) {
  const toBuy = [];
  const seen = new Set();
  for (const ing of ingredients || []) {
    if (!ing.name) continue;
    const key = ing.name.trim().toLowerCase();
    if (seen.has(key)) continue;   // dedup across dishes
    seen.add(key);
    const st = getStockByName(ing.name);
    const { qty: need, unit } = ingQty(ing);
    if (!st || !st.in_stock) {
      toBuy.push({ name: ing.name, qty: need || null, unit });                 // not in stock at all
    } else if (need && st.qty_g != null && (st.unit || "g") === unit && Number(st.qty_g) < need) {
      toBuy.push({ name: ing.name, qty: need - Number(st.qty_g), unit });      // in stock but not enough (same unit)
    }
  }
  return toBuy;
}

async function addToShopping(toBuy) {
  let added = 0;
  for (const b of toBuy) {
    const { data } = await supabase.from("shopping_items").select("id").eq("name", b.name).eq("category", "food").limit(1);
    if (data && data.length) continue;   // already on the list
    const qty = b.qty ? qtyStr(b.qty, b.unit) : null;
    const { error } = await supabase.from("shopping_items").insert({ name: b.name, category: "food", qty, created_by: whoami() || null });
    if (!error) added++;
  }
  return added;
}

async function addMissingToShopping(dish) {
  if (!dish) return;
  if (dish.kind === "restaurant") { toast("Bought / eat out — nothing to buy 🍽️"); return; }
  const toBuy = shortfallFor(dish.ingredients || []);
  if (!toBuy.length) { toast("You have all ingredients ✓"); return; }
  const added = await addToShopping(toBuy);
  toast(added ? `Added ${added} to shopping list 🛒` : "Already on the list");
}

// Gather ingredients across every dish planned within [from, to] (inclusive ISO dates).
function ingredientsInRange(from, to) {
  const ings = [];
  for (const p of plan.filter((x) => x.plan_date >= from && x.plan_date <= to)) {
    const d = dishFor(p.dish_id);
    if (!d || d.kind === "restaurant") continue;   // eating out → nothing to buy
    (d.ingredients || []).forEach((i) => ings.push(i));
  }
  return ings;
}

// Expand/collapse the restock preview for a single day ('day') or the week ('week').
async function openRestockPanel(kind) {
  if (restockPanel === kind) { restockPanel = null; restockItems = []; renderToday(); return; }
  const ings = kind === "week"
    ? ingredientsInRange(todayISO(), addDays(todayISO(), 6))
    : ingredientsInRange(selectedDate, selectedDate);
  restockItems = shortfallFor(ings);
  const { data } = await supabase.from("shopping_items").select("name").eq("category", "food");
  onShoppingList = new Set((data || []).map((r) => (r.name || "").trim().toLowerCase()));
  restockPanel = kind;
  renderToday();
}

// The collapsible list of missing/short ingredients, each addable on its own.
function renderRestockPanel() {
  if (!restockItems.length) return `<div class="restock-box ok">✅ You have everything — nothing to buy</div>`;
  const pending = restockItems.filter((b) => !onShoppingList.has(b.name.trim().toLowerCase())).length;
  const rows = restockItems.map((b, idx) => {
    const on = onShoppingList.has(b.name.trim().toLowerCase());
    return `<li class="item">
      <div class="body"><div class="name">${esc(b.name)}</div>${b.qty ? `<div class="meta">need ${qtyStr(b.qty, b.unit)}</div>` : ""}</div>
      ${on ? `<span class="on-list-tag">✓ On list</span>`
           : `<button class="mini-action cart" data-addone="${idx}">🛒 Add</button>`}
    </li>`;
  }).join("");
  return `<div class="restock-box">
    <div class="restock-head">🔴 Missing (${restockItems.length})${pending ? ` <button class="link-btn" id="restock-addall">Add all</button>` : ""}</div>
    <ul class="item-list">${rows}</ul></div>`;
}

async function restockAddOne(idx) {
  const b = restockItems[idx];
  if (!b) return;
  const key = b.name.trim().toLowerCase();
  if (onShoppingList.has(key)) return;
  const qty = b.grams ? `${Math.round(b.grams)} g` : null;
  const { error } = await supabase.from("shopping_items").insert({ name: b.name, category: "food", qty, created_by: whoami() || null });
  if (error) { toast("Couldn't add"); return; }
  onShoppingList.add(key);
  toast("Added: " + b.name);
  renderToday();
}

async function restockAddAll() {
  const pending = restockItems.filter((b) => !onShoppingList.has(b.name.trim().toLowerCase()));
  if (!pending.length) { toast("Already on the list"); return; }
  const added = await addToShopping(pending);
  pending.forEach((b) => onShoppingList.add(b.name.trim().toLowerCase()));
  toast(added ? `Added ${added} 🛒` : "Already on the list");
  renderToday();
}

// Jump from a planned meal straight to its recipe (Recipes tab, expanded)
function goToRecipe(dishId) {
  if (!dishFor(dishId)) return;
  subTab = "recipes";
  expandedDish = dishId;
  render();
  const rec = document.querySelector(`[data-expand="${dishId}"]`);
  if (rec) rec.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ── Pick a dish for a slot ──────────────────────────
function openDishPicker(slot) {
  const wrap = document.createElement("div");
  let search = null;
  if (dishes.length) {
    search = document.createElement("input");
    search.type = "search";
    search.className = "search-box";
    search.placeholder = "🔎 Search saved recipes…";
    wrap.appendChild(search);
  } else {
    wrap.innerHTML = `<p class="muted">No recipes yet — create one first.</p>`;
  }
  const list = document.createElement("div");
  list.className = "picker-list";
  const items = [];
  dishes.forEach((d) => {
    const diff = DIFF[d.difficulty] || DIFF.easy;
    const b = document.createElement("button");
    b.className = "picker-item";
    b.dataset.rn = d.name.toLowerCase();
    b.innerHTML = `<span>${esc(d.name)}</span>${d.kind === "restaurant" ? `<span class="kind-badge rest">🍽️</span>` : `<span class="diff ${diff.cls}">${diff.label}</span>`}`;
    b.addEventListener("click", () => assignDish(slot, d.id));
    list.appendChild(b);
    items.push(b);
  });
  wrap.appendChild(list);
  const none = document.createElement("p");
  none.className = "empty"; none.hidden = true;
  wrap.appendChild(none);
  if (search) search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    items.forEach((b) => { const hit = !q || b.dataset.rn.includes(q); b.hidden = !hit; if (hit) shown++; });
    none.hidden = !(q && shown === 0);
    none.textContent = shown === 0 ? `No recipe matches “${search.value.trim()}”` : "";
  });
  const newBtn = document.createElement("button");
  newBtn.className = "btn-primary full";
  newBtn.textContent = "＋ Create new recipe";
  newBtn.addEventListener("click", () => openDishForm(null));
  wrap.appendChild(newBtn);

  const slotLabel = ALL_SLOTS.find((s) => s.key === slot)?.label || "";
  openSheet(`Add ${slotLabel} · ${dayLabel(selectedDate)}`, wrap);
}

async function assignDish(slot, dishId) {
  closeSheet();
  const { error } = await supabase.from("meal_plan").insert({
    plan_date: selectedDate, slot, dish_id: dishId, created_by: whoami() || null,
  });
  if (error) { toast("Couldn't add meal"); return; }
  await reload();
  await addMissingToShopping(dishFor(dishId));   // ingredients not in stock / short → shopping list
}

async function removePlan(id) {
  const { error } = await supabase.from("meal_plan").delete().eq("id", id);
  if (error) { toast("Couldn't delete"); return; }
  await reload();
}

// ── Add / edit recipe form ──────────────────────────
function openDishForm(dishId) {
  const d = dishId ? dishFor(dishId) : null;
  // Autocomplete suggestions: ingredient names used before + stock item names
  const known = [...new Set([
    ...dishes.flatMap((x) => (x.ingredients || []).map((i) => (i.name || "").trim())),
    ...getStockNames(),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const ingOptions = known.map((n) => `<option value="${esc(n)}"></option>`).join("");
  const form = document.createElement("div");
  form.className = "dish-form";
  form.innerHTML = `
    <div class="kind-seg-row">
      <button type="button" class="kind-seg" data-kind="cook">🍳 Cook</button>
      <button type="button" class="kind-seg" data-kind="restaurant">🍽️ Restaurant</button>
    </div>
    <label>Name<input type="text" id="df-name" placeholder="e.g. Basil pork stir-fry" value="${d ? esc(d.name) : ""}"></label>
    <div class="df-ing-label">Good for <span class="muted">(tag to find it faster)</span></div>
    <div class="tag-picker">
      ${BASE_SLOTS.map((s) => `<label class="tag-check"><input type="checkbox" class="mt-check" value="${s.key}"> ${s.emoji} ${s.label}</label>`).join("")}
    </div>
    <div id="cook-fields">
      <div class="search-row">
        <span class="muted">Find a recipe:</span>
        <a class="chip-btn" data-search="google" target="_blank" rel="noopener">🔎 Google</a>
        <a class="chip-btn" data-search="youtube" target="_blank" rel="noopener">▶️ YouTube</a>
        <a class="chip-btn" data-search="tiktok" target="_blank" rel="noopener">🎵 TikTok</a>
        <a class="chip-btn" data-search="cookpad" target="_blank" rel="noopener">🍳 Cookpad</a>
      </div>
      <label>Difficulty
        <select id="df-diff">
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </label>
      <div class="df-ing-label">Ingredients <span class="muted">(tick 🧊 if frozen and needs defrosting)</span></div>
      <datalist id="ing-names">${ingOptions}</datalist>
      <div id="df-ings"></div>
      <button type="button" class="link-btn" id="df-add-ing">＋ Add ingredient</button>
      <label>Steps <span class="muted">(one per line)</span>
        <textarea id="df-steps" rows="5" placeholder="e.g. Heat oil in a pan (new line = next step)">${d ? esc(d.steps || "") : ""}</textarea>
      </label>
    </div>
    <label id="df-url-label"><span class="lbl-txt">Recipe link</span> <span class="muted">(optional)</span>
      <input type="url" id="df-url" placeholder="https://…" value="${d ? esc(d.source_url || "") : ""}"></label>
    <button type="button" class="btn-primary full" id="df-save">${d ? "Save changes" : "Save recipe"}</button>`;

  openSheet(d ? "Edit recipe" : "Add recipe", form);
  form.querySelector("#df-diff").value = d ? d.difficulty : "easy";
  const savedTags = (d && d.meal_tags) || [];
  form.querySelectorAll(".mt-check").forEach((c) => { c.checked = savedTags.includes(c.value); });

  // Cook vs Restaurant toggle
  let kind = d?.kind === "restaurant" ? "restaurant" : "cook";
  const applyKind = () => {
    form.dataset.kind = kind;
    form.querySelectorAll(".kind-seg").forEach((b) => b.classList.toggle("active", b.dataset.kind === kind));
    form.querySelector("#cook-fields").hidden = kind === "restaurant";
    form.querySelector("#df-url-label .lbl-txt").textContent = kind === "restaurant" ? "Link (map / delivery / menu)" : "Recipe link";
  };
  form.querySelectorAll(".kind-seg").forEach((b) =>
    b.addEventListener("click", () => { kind = b.dataset.kind; applyKind(); }));
  applyKind();

  const ingBox = form.querySelector("#df-ings");
  const addIngRow = (name = "", defrost = false, qty = "", unit = "g") => {
    const row = document.createElement("div");
    row.className = "ing-row";
    row.innerHTML = `
      <input type="text" class="ing-name" list="ing-names" placeholder="Ingredient" value="${esc(name)}">
      <input type="number" class="ing-g" placeholder="qty" min="0" inputmode="decimal" value="${qty != null ? qty : ""}">
      <select class="ing-unit"><option value="g">g</option><option value="ea">EA</option></select>
      <label class="ing-frost"><input type="checkbox" class="ing-defrost" ${defrost ? "checked" : ""}> 🧊</label>
      <button type="button" class="ing-del">✕</button>`;
    row.querySelector(".ing-unit").value = unit === "ea" ? "ea" : "g";
    row.querySelector(".ing-del").addEventListener("click", () => row.remove());
    ingBox.appendChild(row);
  };
  (d?.ingredients?.length ? d.ingredients : [{ name: "", defrost: false }]).forEach((i) => {
    const { qty, unit } = ingQty(i);
    addIngRow(i.name, i.defrost, qty != null ? qty : "", unit);
  });
  form.querySelector("#df-add-ing").addEventListener("click", () => addIngRow());

  // Recipe search links — real <a> (opens more reliably than window.open on PWA/iOS)
  const nameInput = form.querySelector("#df-name");
  const updateSearchLinks = () => {
    const q = nameInput.value.trim();
    const enc = encodeURIComponent(q + " recipe");
    const urls = {
      google: "https://www.google.com/search?q=" + enc,
      youtube: "https://www.youtube.com/results?search_query=" + enc,
      tiktok: "https://www.tiktok.com/search?q=" + enc,
      cookpad: "https://cookpad.com/en/search/" + encodeURIComponent(q),
    };
    form.querySelectorAll("[data-search]").forEach((a) => { a.href = q ? urls[a.dataset.search] : "#"; });
  };
  nameInput.addEventListener("input", updateSearchLinks);
  updateSearchLinks();
  form.querySelectorAll("[data-search]").forEach((a) =>
    a.addEventListener("click", (e) => { if (!nameInput.value.trim()) { e.preventDefault(); toast("Enter a dish name first"); } }));

  form.querySelector("#df-save").addEventListener("click", () => saveDish(dishId, form));
}

async function saveDish(dishId, form) {
  const name = form.querySelector("#df-name").value.trim();
  if (!name) { toast("Enter a dish name first"); return; }
  const kind = form.dataset.kind === "restaurant" ? "restaurant" : "cook";
  const difficulty = form.querySelector("#df-diff").value;
  const source_url = form.querySelector("#df-url").value.trim();
  let steps = form.querySelector("#df-steps").value.trim();
  let ingredients = [...form.querySelectorAll(".ing-row")].map((r) => {
    const q = parseFloat(r.querySelector(".ing-g").value);
    return {
      name: r.querySelector(".ing-name").value.trim(),
      qty: q > 0 ? q : null,
      unit: r.querySelector(".ing-unit").value === "ea" ? "ea" : "g",
      defrost: r.querySelector(".ing-defrost").checked,
    };
  }).filter((i) => i.name);
  if (kind === "restaurant") { ingredients = []; steps = ""; }   // bought — no cooking data
  const meal_tags = [...form.querySelectorAll(".mt-check:checked")].map((c) => c.value);

  const payload = { name, kind, difficulty, steps: steps || null, ingredients, source_url: source_url || null, meal_tags };
  let error;
  if (dishId) {
    ({ error } = await supabase.from("dishes").update(payload).eq("id", dishId));
  } else {
    payload.created_by = whoami() || null;
    ({ error } = await supabase.from("dishes").insert(payload));
  }
  if (error) {
    console.error(error);
    toast(/column .*kind/i.test(error.message || "")
      ? "Run schema_menu.sql first (missing 'kind')"
      : "Couldn't save: " + (error.message || error.code || "error"));
    return;
  }
  closeSheet();
  toast(dishId ? "Updated" : "Recipe added");
  await reload();
}

async function deleteDish(dishId) {
  if (!confirm("Delete this recipe? (meals using it will be removed too)")) return;
  const { error } = await supabase.from("dishes").delete().eq("id", dishId);
  if (error) { toast("Couldn't delete"); return; }
  if (expandedDish === dishId) expandedDish = null;
  await reload();
}

// ── init / teardown ─────────────────────────────────
export function renderMenu() { render(); }

// Kid meal slot appears/disappears when the household's "has kids" setting changes
document.addEventListener("settings-changed", () => {
  const el = $("screen-menu");
  if (el && !el.hidden && subTab === "today") render();
});

export async function initMenu() {
  await reload();
  channels.push(
    supabase.channel("dishes-rt").on("postgres_changes", { event: "*", schema: "public", table: "dishes" }, reload).subscribe(),
    supabase.channel("meal-rt").on("postgres_changes", { event: "*", schema: "public", table: "meal_plan" }, reload).subscribe(),
  );
}

export function teardownMenu() {
  channels.forEach((c) => supabase.removeChannel(c));
  channels = [];
  dishes = []; plan = [];
  restockPanel = null; restockItems = []; onShoppingList = new Set();
  recipeSearch = ""; recipeTagFilter = "";
  closeSheet();
}
