import { supabase } from "./supabase.js";
import { toast, whoami } from "./app.js";
import { openSheet, closeSheet, esc } from "./ui.js";

const $ = (id) => document.getElementById(id);

const CATS = [
  { key: "personal", label: "Personal", color: "#2563eb" },
  { key: "shared", label: "Shared", color: "#0f766e" },
];
const catColor = (k) => (CATS.find((c) => c.key === k) || CATS[1]).color;

const MOODS = [
  { key: "great", emoji: "😄", label: "Great", color: "#16a34a" },
  { key: "good", emoji: "🙂", label: "Good", color: "#84cc16" },
  { key: "ok", emoji: "😐", label: "Okay", color: "#eab308" },
  { key: "low", emoji: "😕", label: "Low", color: "#f97316" },
  { key: "bad", emoji: "😣", label: "Bad", color: "#dc2626" },
];
const moodFor = (k) => MOODS.find((m) => m.key === k);
const WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

let events = [];
let moodMap = {};       // { 'YYYY-MM-DD': {mood, note} }
let channels = [];
let subTab = "calendar";
const now = new Date();
let viewYear = now.getFullYear();
let viewMonth = now.getMonth();   // 0-11
let selectedDate = todayISO();
let filters = new Set(CATS.map((c) => c.key));

// ── date helpers ────────────────────────────────────
function pad(n) { return String(n).padStart(2, "0"); }
function isoOf(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function todayISO() { const d = new Date(); return isoOf(d.getFullYear(), d.getMonth(), d.getDate()); }
function monthTitle(y, m) { return new Date(y, m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); }
function prettyDate(iso) { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }); } catch { return iso; } }
function daysUntilIso(iso) { const a = new Date(todayISO() + "T00:00:00"); const b = new Date(iso + "T00:00:00"); return Math.round((b - a) / 86400000); }

// ── load ────────────────────────────────────────────
async function reload() {
  const [eRes, mRes] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("moods").select("*"),
  ]);
  if (eRes.error) console.error(eRes.error);
  if (mRes.error) console.error(mRes.error);
  events = eRes.data || [];
  moodMap = {};
  (mRes.data || []).forEach((r) => { moodMap[r.mood_date] = r; });
  render();
  document.dispatchEvent(new CustomEvent("calendar-changed"));
}

// ── summary for Home ────────────────────────────────
export function getTodayEventsSummary() {
  const t = todayISO();
  const evs = events.filter((e) => e.event_date === t)
    .sort((a, b) => (a.event_time || "").localeCompare(b.event_time || ""))
    .map((e) => ({ title: e.title, time: e.event_time, color: catColor(e.category) }));
  const upcoming = events.filter((e) => e.event_date > t)
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.event_time || "").localeCompare(b.event_time || ""))
    .slice(0, 3)
    .map((e) => { const d = daysUntilIso(e.event_date); return { title: e.title, color: catColor(e.category), when: d === 1 ? "Tomorrow" : `in ${d} days` }; });
  const mood = moodMap[t] ? (moodFor(moodMap[t].mood)?.emoji || null) : null;
  return { events: evs, upcoming, mood };
}

// ── render ──────────────────────────────────────────
function render() {
  const el = $("screen-calendar");
  if (!el) return;
  el.innerHTML = `
    <div class="subtabs">
      <button class="subtab ${subTab === "calendar" ? "active" : ""}" data-sub="calendar">📅 Calendar</button>
      <button class="subtab ${subTab === "mood" ? "active" : ""}" data-sub="mood">🌈 Mood</button>
    </div>
    <div class="monthbar">
      <button class="date-nav" data-mnav="-1">‹</button>
      <div class="month-title">${monthTitle(viewYear, viewMonth)}</div>
      <button class="date-nav" data-mnav="1">›</button>
    </div>
    <div id="cal-body"></div>`;
  el.querySelectorAll("[data-sub]").forEach((b) =>
    b.addEventListener("click", () => { subTab = b.dataset.sub; render(); }));
  el.querySelectorAll("[data-mnav]").forEach((b) =>
    b.addEventListener("click", () => {
      viewMonth += +b.dataset.mnav;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      render();
    }));
  if (subTab === "calendar") renderCalendarView();
  else renderMoodView();
}

function monthGrid(cellFn) {
  const first = new Date(viewYear, viewMonth, 1).getDay();
  const days = new Date(viewYear, viewMonth + 1, 0).getDate();
  let cells = WEEK.map((w) => `<div class="cal-wd">${w}</div>`).join("");
  for (let i = 0; i < first; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= days; d++) cells += cellFn(isoOf(viewYear, viewMonth, d), d);
  return `<div class="cal-grid">${cells}</div>`;
}

function renderCalendarView() {
  const body = $("cal-body");

  const chips = CATS.map((c) =>
    `<button class="filter-chip ${filters.has(c.key) ? "on" : ""}" data-filter="${c.key}">
      <span class="ev-dot" style="background:${c.color}"></span>${c.label}</button>`).join("");

  const grid = monthGrid((iso, d) => {
    const dayEvents = events.filter((e) => e.event_date === iso && filters.has(e.category));
    const dots = dayEvents.slice(0, 3).map((e) => `<span class="ev-dot" style="background:${catColor(e.category)}"></span>`).join("");
    const cls = [
      "cal-cell",
      iso === todayISO() ? "today" : "",
      iso === selectedDate ? "selected" : "",
    ].join(" ").trim();
    return `<button class="${cls}" data-day="${iso}"><span class="cal-num">${d}</span><span class="cal-dots">${dots}</span></button>`;
  });

  const dayEvents = events.filter((e) => e.event_date === selectedDate)
    .sort((a, b) => (a.event_time || "").localeCompare(b.event_time || ""));
  const detail = dayEvents.length
    ? dayEvents.map((e) => `<li class="ev-row">
        <span class="ev-dot" style="background:${catColor(e.category)}"></span>
        <div class="ev-body"><div class="ev-title">${esc(e.title)}</div>
          <div class="ev-meta muted">${e.event_time ? esc(e.event_time) + " · " : ""}${catLabel(e.category)}</div></div>
        <button class="del" data-delev="${e.id}">🗑</button></li>`).join("")
    : `<li class="muted ev-empty">No events</li>`;

  body.innerHTML = `
    <div class="filter-row">${chips}</div>
    ${grid}
    <div class="day-detail">
      <div class="day-detail-head">${prettyDate(selectedDate)}</div>
      <ul class="ev-list">${detail}</ul>
      <button class="btn-primary full" id="add-event">＋ Add event</button>
    </div>`;

  body.querySelectorAll("[data-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.filter;
      if (filters.has(k)) filters.delete(k); else filters.add(k);
      renderCalendarView();
    }));
  body.querySelectorAll("[data-day]").forEach((b) =>
    b.addEventListener("click", () => { selectedDate = b.dataset.day; renderCalendarView(); }));
  body.querySelectorAll("[data-delev]").forEach((b) =>
    b.addEventListener("click", () => deleteEvent(b.dataset.delev)));
  $("add-event").addEventListener("click", () => openEventForm());
}

const catLabel = (k) => (CATS.find((c) => c.key === k) || {}).label || "";

function renderMoodView() {
  const body = $("cal-body");
  const today = todayISO();
  const todayMood = moodMap[today]?.mood;

  const picker = MOODS.map((m) =>
    `<button class="mood-btn ${todayMood === m.key ? "on" : ""}" data-moodtoday="${m.key}" style="--mc:${m.color}">
      <span class="mood-emoji">${m.emoji}</span><span class="mood-label">${m.label}</span></button>`).join("");

  const grid = monthGrid((iso, d) => {
    const mk = moodMap[iso]?.mood;
    const m = mk ? moodFor(mk) : null;
    const style = m ? `style="background:${m.color}22;border-color:${m.color}"` : "";
    const cls = "cal-cell mood-cell" + (iso === today ? " today" : "");
    return `<button class="${cls}" ${style} data-moodday="${iso}">
      <span class="cal-num">${d}</span><span class="mood-cell-emoji">${m ? m.emoji : ""}</span></button>`;
  });

  const legend = MOODS.map((m) => `<span class="mood-legend"><span class="ev-dot" style="background:${m.color}"></span>${m.emoji} ${m.label}</span>`).join("");

  body.innerHTML = `
    <div class="mood-today">
      <div class="mood-today-title">How do you feel today?</div>
      <div class="mood-picker">${picker}</div>
    </div>
    ${grid}
    <div class="mood-legend-row">${legend}</div>
    <p class="muted mood-hint">Tap any day to set or change its mood.</p>`;

  body.querySelectorAll("[data-moodtoday]").forEach((b) =>
    b.addEventListener("click", () => setMood(today, b.dataset.moodtoday)));
  body.querySelectorAll("[data-moodday]").forEach((b) =>
    b.addEventListener("click", () => openMoodPicker(b.dataset.moodday)));
}

// ── events CRUD ─────────────────────────────────────
function openEventForm() {
  const form = document.createElement("div");
  form.className = "dish-form";
  form.innerHTML = `
    <label>Title<input type="text" id="ev-t" placeholder="e.g. Dentist appointment"></label>
    <label>Date<input type="date" id="ev-d" lang="en-GB" value="${selectedDate}"></label>
    <label>Time (optional)<input type="time" id="ev-tm"></label>
    <label>Type
      <select id="ev-c">
        ${CATS.map((c) => `<option value="${c.key}">${c.label}</option>`).join("")}
      </select></label>
    <button type="button" class="btn-primary full" id="ev-save">Save event</button>`;
  openSheet("Add event", form);
  form.querySelector("#ev-save").addEventListener("click", async () => {
    const title = form.querySelector("#ev-t").value.trim();
    if (!title) { toast("Enter a title first"); return; }
    const { error } = await supabase.from("events").insert({
      title,
      event_date: form.querySelector("#ev-d").value || selectedDate,
      event_time: form.querySelector("#ev-tm").value || null,
      category: form.querySelector("#ev-c").value,
      created_by: whoami() || null,
    });
    if (error) { toast("Couldn't save"); return; }
    closeSheet();
    toast("Event added");
    await reload();
  });
}

async function deleteEvent(id) {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) { toast("Couldn't delete"); return; }
  await reload();
}

// ── mood ────────────────────────────────────────────
async function setMood(dateIso, moodKey) {
  const { error } = await supabase.from("moods")
    .upsert({ mood_date: dateIso, mood: moodKey, created_by: whoami() || null }, { onConflict: "mood_date" });
  if (error) { toast("Couldn't save"); return; }
  await reload();
}
async function clearMood(dateIso) {
  const { error } = await supabase.from("moods").delete().eq("mood_date", dateIso);
  if (error) { toast("Couldn't clear"); return; }
  await reload();
}
function openMoodPicker(dateIso) {
  const wrap = document.createElement("div");
  wrap.className = "mood-sheet";
  wrap.innerHTML = `
    <div class="mood-picker big">${MOODS.map((m) =>
      `<button class="mood-btn" data-pick="${m.key}" style="--mc:${m.color}">
        <span class="mood-emoji">${m.emoji}</span><span class="mood-label">${m.label}</span></button>`).join("")}</div>
    ${moodMap[dateIso] ? `<button class="link-btn danger" id="mood-clear">Clear mood</button>` : ""}`;
  openSheet(prettyDate(dateIso), wrap);
  wrap.querySelectorAll("[data-pick]").forEach((b) =>
    b.addEventListener("click", async () => { await setMood(dateIso, b.dataset.pick); closeSheet(); }));
  const clr = wrap.querySelector("#mood-clear");
  if (clr) clr.addEventListener("click", async () => { await clearMood(dateIso); closeSheet(); });
}

// ── init / teardown ─────────────────────────────────
export function renderCalendar() { render(); }

export async function initCalendar() {
  await reload();
  channels.push(
    supabase.channel("events-rt").on("postgres_changes", { event: "*", schema: "public", table: "events" }, reload).subscribe(),
    supabase.channel("moods-rt").on("postgres_changes", { event: "*", schema: "public", table: "moods" }, reload).subscribe(),
  );
}
export function teardownCalendar() {
  channels.forEach((c) => supabase.removeChannel(c));
  channels = [];
  events = []; moodMap = {};
  closeSheet();
}
