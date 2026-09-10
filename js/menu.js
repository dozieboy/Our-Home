import { supabase } from "./supabase.js";
import { toast, whoami } from "./app.js";
import { openSheet, closeSheet, esc } from "./ui.js";
import { getStockByName } from "./staples.js";

const $ = (id) => document.getElementById(id);

const SLOTS = [
  { key: "breakfast", label: "Breakfast", emoji: "🌅" },
  { key: "lunch", label: "Lunch", emoji: "☀️" },
  { key: "dinner", label: "Dinner", emoji: "🌙" },
];
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
  const slots = SLOTS.map((s) => {
    const names = plan.filter((p) => p.plan_date === t && p.slot === s.key)
      .map((p) => dishFor(p.dish_id)?.name).filter(Boolean);
    return { label: s.label, emoji: s.emoji, dishes: names };
  });
  const defrost = defrostFor(addDays(t, 1));
  return { slots, defrostTomorrow: defrost };
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
// All ingredients for a given date
function prepFor(iso) {
  const names = new Set();
  for (const p of plan.filter((x) => x.plan_date === iso)) {
    const d = dishFor(p.dish_id);
    (d?.ingredients || []).forEach((ing) => { if (ing.name) names.add(ing.name); });
  }
  return [...names];
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

  const slotsHtml = SLOTS.map((s) => {
    const entries = plan.filter((p) => p.plan_date === selectedDate && p.slot === s.key);
    const rows = entries.map((p) => {
      const d = dishFor(p.dish_id);
      if (!d) return "";
      const diff = DIFF[d.difficulty] || DIFF.easy;
      return `<div class="slot-dish">
        <span class="sd-name">${esc(d.name)}</span>
        <span class="diff ${diff.cls}">${diff.label}</span>
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

    <div class="prep-box">
      <div class="prep-title">🧂 To prep (ingredients — ${dayLabel(selectedDate)})</div>
      ${prep.length ? `<div class="tag-list">${prep.map((n) => `<span class="tag">${esc(n)}</span>`).join("")}</div>`
        : `<div class="muted">— none —</div>`}
    </div>

    <div class="prep-box defrost">
      <div class="prep-title">🧊 Take out of the freezer for ${dayLabel(nextDay)}</div>
      ${defrost.length ? `<div class="tag-list">${defrost.map((n) => `<span class="tag frozen">${esc(n)}</span>`).join("")}</div>`
        : `<div class="muted">— nothing to defrost —</div>`}
    </div>`;

  body.querySelectorAll("[data-datenav]").forEach((b) =>
    b.addEventListener("click", () => { selectedDate = addDays(selectedDate, +b.dataset.datenav); renderToday(); }));
  const todayBtn = $("date-today");
  if (todayBtn) todayBtn.addEventListener("click", () => { selectedDate = todayISO(); renderToday(); });
  body.querySelectorAll("[data-addslot]").forEach((b) =>
    b.addEventListener("click", () => openDishPicker(b.dataset.addslot)));
  body.querySelectorAll("[data-delplan]").forEach((b) =>
    b.addEventListener("click", () => removePlan(b.dataset.delplan)));
}

function renderRecipes() {
  const body = $("menu-body");
  const list = dishes.map((d) => {
    const diff = DIFF[d.difficulty] || DIFF.easy;
    const nIng = (d.ingredients || []).length;
    const open = expandedDish === d.id;
    const steps = (d.steps || "").split("\n").map((s) => s.trim()).filter(Boolean);
    return `<div class="recipe ${open ? "open" : ""}">
      <div class="recipe-head" data-expand="${d.id}">
        <div>
          <div class="recipe-name">${esc(d.name)}</div>
          <div class="recipe-sub muted">${nIng} ingredient(s)</div>
        </div>
        <span class="diff ${diff.cls}">${diff.label}</span>
      </div>
      ${open ? `
        <div class="recipe-body">
          ${nIng ? `<div class="rb-label">Ingredients</div><div class="tag-list">${
            d.ingredients.map((i) => `<span class="tag ${i.defrost ? "frozen" : ""}">${i.defrost ? "🧊 " : ""}${esc(i.name)}${i.grams ? ` · ${i.grams}g` : ""}</span>`).join("")
          }</div>` : ""}
          ${steps.length ? `<div class="rb-label">Steps</div><ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
          ${d.source_url ? `<a class="recipe-link" href="${esc(d.source_url)}" target="_blank" rel="noopener">🔗 View source recipe</a>` : ""}
          ${nIng ? `<button class="link-btn restock-btn" data-restock="${d.id}">🛒 Check stock → add missing to list</button>` : ""}
          <div class="recipe-actions">
            <button class="link-btn" data-editdish="${d.id}">✏️ Edit</button>
            <button class="link-btn danger" data-deldish="${d.id}">🗑 Delete</button>
          </div>
        </div>` : ""}
    </div>`;
  }).join("");

  body.innerHTML = `
    <button class="btn-primary full" id="add-recipe">＋ Add recipe</button>
    ${dishes.length ? `<div class="recipe-list">${list}</div>`
      : `<p class="empty">No recipes yet — add your first 📖</p>`}`;

  $("add-recipe").addEventListener("click", () => openDishForm(null));
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
async function addMissingToShopping(dish) {
  if (!dish) return;
  const ings = (dish.ingredients || []).filter((i) => i.name);
  const toBuy = [];
  for (const ing of ings) {
    const st = getStockByName(ing.name);
    const need = Number(ing.grams) || 0;
    if (!st || !st.in_stock) {
      toBuy.push({ name: ing.name, grams: need || null });          // not in stock at all
    } else if (need && st.qty_g != null && Number(st.qty_g) < need) {
      toBuy.push({ name: ing.name, grams: need - Number(st.qty_g) }); // in stock but not enough grams
    }
  }
  if (!toBuy.length) { toast("You have all ingredients ✓"); return; }

  let added = 0;
  for (const b of toBuy) {
    const { data } = await supabase.from("shopping_items").select("id").eq("name", b.name).eq("category", "food").limit(1);
    if (data && data.length) continue;   // already on the list
    const qty = b.grams ? `${Math.round(b.grams)} g` : null;
    const { error } = await supabase.from("shopping_items").insert({ name: b.name, category: "food", qty, created_by: whoami() || null });
    if (!error) added++;
  }
  toast(added ? `Added ${added} to shopping list 🛒` : "Already on the list");
}

// ── Pick a dish for a slot ──────────────────────────
function openDishPicker(slot) {
  const wrap = document.createElement("div");
  if (!dishes.length) {
    wrap.innerHTML = `<p class="muted">No recipes yet — create one first.</p>`;
  }
  const list = document.createElement("div");
  list.className = "picker-list";
  dishes.forEach((d) => {
    const diff = DIFF[d.difficulty] || DIFF.easy;
    const b = document.createElement("button");
    b.className = "picker-item";
    b.innerHTML = `<span>${esc(d.name)}</span><span class="diff ${diff.cls}">${diff.label}</span>`;
    b.addEventListener("click", () => assignDish(slot, d.id));
    list.appendChild(b);
  });
  wrap.appendChild(list);
  const newBtn = document.createElement("button");
  newBtn.className = "btn-primary full";
  newBtn.textContent = "＋ Create new recipe";
  newBtn.addEventListener("click", () => openDishForm(null));
  wrap.appendChild(newBtn);

  const slotLabel = SLOTS.find((s) => s.key === slot)?.label || "";
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
  const form = document.createElement("div");
  form.className = "dish-form";
  form.innerHTML = `
    <label>Dish name<input type="text" id="df-name" placeholder="e.g. Basil pork stir-fry" value="${d ? esc(d.name) : ""}"></label>
    <div class="search-row">
      <span class="muted">Find a recipe:</span>
      <a class="chip-btn" data-search="google" target="_blank" rel="noopener">🔎 Google</a>
      <a class="chip-btn" data-search="youtube" target="_blank" rel="noopener">▶️ YouTube</a>
      <a class="chip-btn" data-search="tiktok" target="_blank" rel="noopener">🎵 TikTok</a>
      <a class="chip-btn" data-search="cookpad" target="_blank" rel="noopener">🍳 Cookpad</a>
    </div>
    <label>Recipe link <span class="muted">(optional — paste a link to view later)</span>
      <input type="url" id="df-url" placeholder="https://…" value="${d ? esc(d.source_url || "") : ""}"></label>
    <label>Difficulty
      <select id="df-diff">
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </select>
    </label>
    <div class="df-ing-label">Ingredients <span class="muted">(tick 🧊 if frozen and needs defrosting)</span></div>
    <div id="df-ings"></div>
    <button type="button" class="link-btn" id="df-add-ing">＋ Add ingredient</button>
    <label>Steps <span class="muted">(one per line)</span>
      <textarea id="df-steps" rows="5" placeholder="e.g. Heat oil in a pan (new line = next step)">${d ? esc(d.steps || "") : ""}</textarea>
    </label>
    <button type="button" class="btn-primary full" id="df-save">${d ? "Save changes" : "Save recipe"}</button>`;

  openSheet(d ? "Edit recipe" : "Add recipe", form);
  form.querySelector("#df-diff").value = d ? d.difficulty : "easy";

  const ingBox = form.querySelector("#df-ings");
  const addIngRow = (name = "", defrost = false, grams = "") => {
    const row = document.createElement("div");
    row.className = "ing-row";
    row.innerHTML = `
      <input type="text" class="ing-name" placeholder="Ingredient" value="${esc(name)}">
      <input type="number" class="ing-g" placeholder="g" min="0" inputmode="decimal" value="${grams != null ? grams : ""}">
      <label class="ing-frost"><input type="checkbox" class="ing-defrost" ${defrost ? "checked" : ""}> 🧊</label>
      <button type="button" class="ing-del">✕</button>`;
    row.querySelector(".ing-del").addEventListener("click", () => row.remove());
    ingBox.appendChild(row);
  };
  (d?.ingredients?.length ? d.ingredients : [{ name: "", defrost: false }]).forEach((i) => addIngRow(i.name, i.defrost, i.grams));
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
  const difficulty = form.querySelector("#df-diff").value;
  const steps = form.querySelector("#df-steps").value.trim();
  const source_url = form.querySelector("#df-url").value.trim();
  const ingredients = [...form.querySelectorAll(".ing-row")].map((r) => {
    const g = parseFloat(r.querySelector(".ing-g").value);
    return {
      name: r.querySelector(".ing-name").value.trim(),
      grams: g > 0 ? g : null,
      defrost: r.querySelector(".ing-defrost").checked,
    };
  }).filter((i) => i.name);

  const payload = { name, difficulty, steps: steps || null, ingredients, source_url: source_url || null };
  let error;
  if (dishId) {
    ({ error } = await supabase.from("dishes").update(payload).eq("id", dishId));
  } else {
    payload.created_by = whoami() || null;
    ({ error } = await supabase.from("dishes").insert(payload));
  }
  if (error) { console.error(error); toast("Couldn't save"); return; }
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
  closeSheet();
}
