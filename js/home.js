import { getShoppingSummary } from "./shopping.js";
import { getStaplesSummary } from "./staples.js";
import { getTodayMenuSummary } from "./menu.js";
import { getTodayEventsSummary } from "./calendar.js";
import { getPetsSummary } from "./pets.js";
import { getFinanceSummary } from "./finance.js";
import { whoami, setTab } from "./app.js";

const $ = (id) => document.getElementById(id);

function todayText() {
  try {
    return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  } catch { return ""; }
}

export function renderHome() {
  const el = $("screen-home");
  const s = getShoppingSummary();
  const st = getStaplesSummary();
  const m = getTodayMenuSummary();
  const cal = getTodayEventsSummary();
  const pet = getPetsSummary();
  const fin = getFinanceSummary();
  const name = whoami();

  const catChips = [
    { emoji: "🍎", label: "Food", n: s.byCat.food },
    { emoji: "🏠", label: "Household", n: s.byCat.household },
    { emoji: "💊", label: "Health", n: s.byCat.health },
  ].map((c) => `<span class="mini-chip">${c.emoji} ${c.label} <b>${c.n}</b></span>`).join("");

  const menuRows = m.slots.map((sl) =>
    `<div class="hm-slot"><span class="hm-slot-label">${sl.emoji} ${sl.label}</span>
      <span class="hm-slot-dish ${sl.dishes.length ? "" : "muted"}">${sl.dishes.length ? esc(sl.dishes.join(", ")) : "—"}</span></div>`
  ).join("");

  let eventRows;
  if (cal.events.length) {
    eventRows = cal.events.map((e) => `<div class="hm-event"><span class="ev-dot" style="background:${e.color}"></span>
        <span class="hm-ev-title">${esc(e.title)}</span>
        <span class="hm-ev-time muted">${e.time ? esc(e.time) : ""}</span></div>`).join("");
  } else if (cal.upcoming.length) {
    eventRows = `<div class="hm-upnext muted">Nothing today · upcoming</div>`
      + cal.upcoming.map((e) => `<div class="hm-event"><span class="ev-dot" style="background:${e.color}"></span>
        <span class="hm-ev-title">${esc(e.title)}</span>
        <span class="hm-ev-time muted">${e.when}</span></div>`).join("");
  } else {
    eventRows = `<div class="muted">No upcoming events</div>`;
  }

  const petRows = pet.upcoming.length
    ? pet.upcoming.map((t) => `<div class="hm-event"><span class="ev-dot" style="background:${t.color}"></span>
        <span class="hm-ev-title">${t.kind.emoji} ${t.kind.label} · ${esc(t.petName)}</span>
        <span class="hm-ev-time ${t.cd.over ? "over" : "muted"}">${t.cd.text}</span></div>`).join("")
    : `<div class="muted">No reminders</div>`;

  el.innerHTML = `
    <div class="greeting">
      <div class="hello">Hi${name ? " " + esc(name) : ""} 👋</div>
      <div class="today muted">${todayText()}</div>
    </div>

    <button class="dash-card" data-go="shopping">
      <div class="dash-head"><span>🛒 Shopping</span><span class="chev">›</span></div>
      <div class="dash-big"><b>${s.remaining}</b> item(s) to buy</div>
      <div class="mini-chips">${catChips}</div>
      ${st.out ? `<div class="restock-line">📦 ${st.out} stock item(s) out — restock</div>` : ""}
    </button>

    <button class="dash-card" data-go="menu">
      <div class="dash-head"><span>🍳 Today's meals</span><span class="chev">›</span></div>
      <div class="hm-slots">${menuRows}</div>
      ${m.defrostTomorrow.length ? `<div class="hm-defrost">🧊 Tomorrow: take out ${m.defrostTomorrow.map(esc).join(", ")}</div>` : ""}
    </button>

    <button class="dash-card" data-go="calendar">
      <div class="dash-head"><span>📅 Today${cal.mood ? ` · mood ${cal.mood}` : ""}</span><span class="chev">›</span></div>
      <div class="hm-events">${eventRows}</div>
    </button>

    <button class="dash-card" data-go="pets">
      <div class="dash-head"><span>🐾 Pet reminders</span><span class="chev">›</span></div>
      <div class="hm-events">${petRows}</div>
    </button>

    <button class="dash-card" data-go="finance">
      <div class="dash-head"><span>💰 Finance</span><span class="chev">›</span></div>
      <div class="dash-big"><b>${money(fin.monthTotal)}</b> this month</div>
      ${fin.settleText ? `<div class="muted done-line">💸 ${fin.settleText}</div>` : ""}
    </button>
  `;

  el.querySelectorAll("[data-go]").forEach((btn) =>
    btn.addEventListener("click", () => setTab(btn.getAttribute("data-go"))));
}

function moduleCard(key, emoji, label) {
  return `<button class="dash-mini" data-go="${key}">
    <span class="dash-mini-emoji">${emoji}</span>
    <span class="dash-mini-label">${label}</span>
    <span class="soon">Coming soon</span>
  </button>`;
}

function money(n) { return "฿" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Refresh Home when data changes (if Home is visible)
document.addEventListener("shopping-changed", () => { if (!$("screen-home").hidden) renderHome(); });
document.addEventListener("staples-changed", () => { if (!$("screen-home").hidden) renderHome(); });
document.addEventListener("menu-changed", () => { if (!$("screen-home").hidden) renderHome(); });
document.addEventListener("calendar-changed", () => { if (!$("screen-home").hidden) renderHome(); });
document.addEventListener("pets-changed", () => { if (!$("screen-home").hidden) renderHome(); });
document.addEventListener("finance-changed", () => { if (!$("screen-home").hidden) renderHome(); });
