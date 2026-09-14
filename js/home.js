import { getShoppingSummary } from "./shopping.js";
import { getStaplesSummary } from "./staples.js";
import { getMenuSummaryFor, goToRecipe } from "./menu.js";
import { getHomeName } from "./settings.js";
import { whoami, setTab } from "./app.js";

const $ = (id) => document.getElementById(id);

function todayText() {
  try {
    return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  } catch { return ""; }
}

// Which day the Today's-meals card is showing (0 = today). Swipe/arrows change it.
let homeMealOffset = 0;
const pad = (n) => String(n).padStart(2, "0");
function offsetISO(n) { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function offsetLabel(n) {
  if (n === 0) return "Today";
  if (n === -1) return "Yesterday";
  if (n === 1) return "Tomorrow";
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function renderHome() {
  const el = $("screen-home");
  const title = $("screen-title");
  if (title) title.textContent = getHomeName() || "Home";   // custom household name in the top bar
  const s = getShoppingSummary();
  const st = getStaplesSummary();
  const m = getMenuSummaryFor(offsetISO(homeMealOffset));
  const name = whoami();

  const catChips = [
    { emoji: "🥩", label: "Fresh", n: s.byCat.food },
    { emoji: "🥫", label: "Dry", n: s.byCat.dry },
    { emoji: "🥕", label: "Ingredient", n: s.byCat.ingredient },
    { emoji: "🏠", label: "Household", n: s.byCat.household },
    { emoji: "💊", label: "Health", n: s.byCat.health },
  ].map((c) => `<span class="mini-chip">${c.emoji} ${c.label} <b>${c.n}</b></span>`).join("");

  const meals3 = m.slots.map((sl) => {
    const kid = (sl.key || "").startsWith("kid");
    const label = kid ? (sl.label || "").replace("Kid ", "") : sl.label;
    const id = sl.ids && sl.ids.length ? sl.ids[0] : "";
    return `<div class="hm-meal ${kid ? "hm-meal-kid" : ""} hm-meal-link" data-mealid="${esc(id)}">
      <div class="hm-meal-label"><span class="hm-meal-emoji">${sl.emoji}</span><br>${esc(label)}</div>
      <div class="hm-meal-dish ${sl.dishes.length ? "" : "muted"}">${sl.dishes.length ? esc(sl.dishes.join(", ")) : "—"}</div>
    </div>`;
  }).join("");

  el.innerHTML = `
    <div class="greeting">
      <div class="hello">Hi${name ? " " + esc(name) : ""} 👋</div>
      <div class="today muted">${todayText()}</div>
    </div>

    <div class="dash-card hm-meal-card">
      <div class="hm-meal-head">
        <button class="hm-day-nav" data-dayoff="-1" aria-label="previous day">‹</button>
        <button class="hm-day-title" data-go="menu">🍳 ${offsetLabel(homeMealOffset)}'s meals ›</button>
        <button class="hm-day-nav" data-dayoff="1" aria-label="next day">›</button>
      </div>
      <div class="hm-meals3">${meals3}</div>
      ${homeMealOffset === 0 && m.defrostTomorrow.length ? `<div class="hm-defrost">🧊 Tomorrow: take out ${m.defrostTomorrow.map(esc).join(", ")}</div>` : ""}
    </div>

    <button class="dash-card" data-go="shopping">
      <div class="dash-head"><span>🛒 Shopping List</span><span class="chev">›</span></div>
      <div class="dash-big"><b>${s.remaining}</b> item(s) to buy</div>
      <div class="mini-chips">${catChips}</div>
    </button>

    <button class="dash-card" data-go="stock">
      <div class="dash-head"><span>📦 Stock</span><span class="chev">›</span></div>
      ${st.total
        ? `<div class="dash-big"><b>${st.total}</b> item(s) tracked</div>
           <div class="${st.out ? "restock-line" : "muted done-line"}">${st.out ? `🔴 ${st.out} out — restock` : "✅ All in stock"}</div>`
        : `<div class="muted">No stock items yet</div>`}
    </button>
  `;

  el.querySelectorAll("[data-go]").forEach((btn) =>
    btn.addEventListener("click", () => setTab(btn.getAttribute("data-go"))));

  // Tap a meal cell → open that recipe (or the Meals tab if empty)
  el.querySelectorAll("[data-mealid]").forEach((c) =>
    c.addEventListener("click", () => {
      const id = c.dataset.mealid;
      if (id) goToRecipe(id); else setTab("menu");
    }));

  const setDay = (n) => { homeMealOffset = Math.max(-1, Math.min(14, n)); renderHome(); };
  el.querySelectorAll("[data-dayoff]").forEach((b) =>
    b.addEventListener("click", () => setDay(homeMealOffset + (+b.dataset.dayoff))));
  const card = el.querySelector(".hm-meal-card");
  if (card) {
    let x0 = null;
    card.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    card.addEventListener("touchend", (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) < 45) return;
      setDay(homeMealOffset + (dx < 0 ? 1 : -1));   // swipe left → next day, right → previous
    }, { passive: true });
  }
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Refresh Home when data changes (if Home is visible)
document.addEventListener("shopping-changed", () => { if (!$("screen-home").hidden) renderHome(); });
document.addEventListener("staples-changed", () => { if (!$("screen-home").hidden) renderHome(); });
document.addEventListener("menu-changed", () => { if (!$("screen-home").hidden) renderHome(); });
document.addEventListener("settings-changed", () => { if (!$("screen-home").hidden) renderHome(); });
