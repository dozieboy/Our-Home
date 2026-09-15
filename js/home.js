import { getShoppingSummary, getShoppingGroups } from "./shopping.js";
import { getStaplesSummary } from "./staples.js";
import { getMenuSummaryFor, goToRecipe, goToTodayMeals } from "./menu.js";
import { getHomeName } from "./settings.js";
import { whoami, setTab } from "./app.js";

const $ = (id) => document.getElementById(id);

function todayText() {
  try {
    return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  } catch { return ""; }
}

// After 18:00 Thailand time, default the Home meals card to tomorrow.
function defaultDayOffset() {
  try {
    const h = Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Bangkok" }).format(new Date()));
    return h >= 18 ? 1 : 0;
  } catch { return 0; }
}
// Which day the Today's-meals card is showing (0 = today). Swipe/arrows change it.
let homeMealOffset = defaultDayOffset();
let userPickedDay = false;   // once the user swipes/taps an arrow, stop auto-defaulting
// Which shopping categories are expanded in the Home dropdown
let shopOpen = new Set();
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
  if (!userPickedDay) homeMealOffset = defaultDayOffset();   // fresh view follows the clock (18:00 → tomorrow)
  const s = getShoppingSummary();
  const st = getStaplesSummary();
  const m = getMenuSummaryFor(offsetISO(homeMealOffset));
  const name = whoami();

  const groups = getShoppingGroups();
  const shopGroupsHtml = groups.length
    ? groups.map((g) => {
        const open = shopOpen.has(g.key);
        const left = g.items.filter((i) => !i.checked).length;
        return `<div class="shop-group ${open ? "open" : ""}">
          <button class="shop-group-head" data-shopcat="${g.key}">
            <span class="dot" style="background:var(--${g.key})"></span>
            <span class="sg-label">${g.emoji} ${esc(g.label)}</span>
            <span class="count">${left}/${g.items.length}</span>
            <span class="cat-caret">▾</span>
          </button>
          ${open ? `<ul class="shop-group-items">${g.items.map((i) =>
            `<li class="${i.checked ? "done" : ""}">${esc(i.name)}${i.qty ? ` <span class="sg-qty">${esc(i.qty)}</span>` : ""}</li>`).join("")}</ul>` : ""}
        </div>`;
      }).join("")
    : `<div class="muted sg-empty">Nothing to buy 🎉</div>`;

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
        <button class="hm-day-title" data-opentoday>🍳 ${offsetLabel(homeMealOffset)}'s meals ›</button>
        <button class="hm-day-nav" data-dayoff="1" aria-label="next day">›</button>
      </div>
      <div class="hm-meals3">${meals3}</div>
      ${homeMealOffset === 0 && m.defrostTomorrow.length ? `<div class="hm-defrost">🧊 Tomorrow: take out ${m.defrostTomorrow.map(esc).join(", ")}</div>` : ""}
    </div>

    <div class="dash-card">
      <button class="dash-head dash-head-btn" data-go="shopping"><span>🛒 Shopping List</span><span class="chev">›</span></button>
      <div class="dash-big"><b>${s.remaining}</b> item(s) to buy</div>
      <div class="shop-groups">${shopGroupsHtml}</div>
    </div>

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

  // Shopping-list category dropdowns (expand to see items right on Home)
  el.querySelectorAll("[data-shopcat]").forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.shopcat;
      if (shopOpen.has(k)) shopOpen.delete(k); else shopOpen.add(k);
      renderHome();
    }));

  // Tap the day title → open the Today-meal screen on the day shown here
  const dayTitle = el.querySelector("[data-opentoday]");
  if (dayTitle) dayTitle.addEventListener("click", () => goToTodayMeals(offsetISO(homeMealOffset)));

  // Tap a meal cell → open that recipe (or the Today-meal screen if empty)
  el.querySelectorAll("[data-mealid]").forEach((c) =>
    c.addEventListener("click", () => {
      const id = c.dataset.mealid;
      if (id) goToRecipe(id); else goToTodayMeals(offsetISO(homeMealOffset));
    }));

  const setDay = (n) => { userPickedDay = true; homeMealOffset = Math.max(-1, Math.min(14, n)); renderHome(); };
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
