import { supabase } from "./supabase.js";
import { toast, whoami } from "./app.js";
import { openSheet, closeSheet, esc } from "./ui.js";

const $ = (id) => document.getElementById(id);

const KINDS = [
  { key: "vaccine", emoji: "💉", label: "Vaccine" },
  { key: "vet", emoji: "🏥", label: "Vet visit" },
  { key: "flea", emoji: "💊", label: "Flea/tick" },
  { key: "other", emoji: "📌", label: "Other" },
];
const kindOf = (k) => KINDS.find((x) => x.key === k) || KINDS[3];
const PALETTE = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#6366f1"];

let pets = [];
let tasks = [];
let channels = [];

const petFor = (id) => pets.find((p) => p.id === id);

// ── dates ───────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDaysISO(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function daysUntil(iso) {
  const a = new Date(todayISO() + "T00:00:00"); const b = new Date(iso + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
function prettyDate(iso) { const p = (iso || "").split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; }
function ageParts(iso) {
  const b = new Date(iso + "T00:00:00"); const n = new Date();
  let months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
  if (n.getDate() < b.getDate()) months--;
  if (months < 0) months = 0;
  return { y: Math.floor(months / 12), m: months % 12 };
}
function ageShort(iso) { const { y, m } = ageParts(iso); if (y <= 0) return `${m}mo`; return m ? `${y}y ${m}mo` : `${y}y`; }
function ageLong(iso) {
  const { y, m } = ageParts(iso);
  const parts = [];
  if (y) parts.push(`${y} year${y > 1 ? "s" : ""}`);
  parts.push(`${m} month${m !== 1 ? "s" : ""}`);
  return parts.join(" ");
}
function countdown(iso) {
  const d = daysUntil(iso);
  if (d < 0) return { text: `${-d}d overdue`, over: true };
  if (d === 0) return { text: "Today", over: false, soon: true };
  if (d === 1) return { text: "Tomorrow", over: false, soon: true };
  return { text: `in ${d} days`, over: false, soon: d <= 3 };
}

// ── load ────────────────────────────────────────────
async function reload() {
  const [pRes, tRes] = await Promise.all([
    supabase.from("pets").select("*").order("created_at"),
    supabase.from("pet_tasks").select("*").order("due_date"),
  ]);
  if (pRes.error) console.error(pRes.error);
  if (tRes.error) console.error(tRes.error);
  pets = pRes.data || [];
  tasks = tRes.data || [];
  render();
  document.dispatchEvent(new CustomEvent("pets-changed"));
}

// ── summary for Home ────────────────────────────────
export function getPetsSummary() {
  const list = tasks.slice().sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 3).map((t) => {
    const p = petFor(t.pet_id);
    return { color: p?.color || "#888", petName: p?.name || "?", kind: kindOf(t.kind), due: t.due_date, cd: countdown(t.due_date) };
  });
  const overdue = tasks.filter((t) => daysUntil(t.due_date) < 0).length;
  return { upcoming: list, overdue, count: tasks.length };
}

// ── render ──────────────────────────────────────────
function render() {
  const el = $("screen-pets");
  if (!el) return;

  const petChips = pets.map((p) =>
    `<button class="pet-chip" data-editpet="${p.id}"><span class="ev-dot" style="background:${p.color}"></span>${esc(p.name)}${p.birthdate ? ` <span class="pet-age">${ageShort(p.birthdate)}</span>` : ""}</button>`).join("")
    + `<button class="pet-chip add" id="add-pet">＋ Pet</button>`;

  const sorted = tasks.slice().sort((a, b) => a.due_date.localeCompare(b.due_date));
  const rows = sorted.map((t) => {
    const p = petFor(t.pet_id);
    const k = kindOf(t.kind);
    const cd = countdown(t.due_date);
    return `<li class="item pet-task ${cd.over ? "overdue" : ""}">
      <span class="ev-dot" style="background:${p?.color || "#888"}"></span>
      <div class="body">
        <div class="name">${k.emoji} ${k.label} · ${esc(p?.name || "?")}</div>
        <div class="meta">${t.note ? esc(t.note) + " · " : ""}${prettyDate(t.due_date)}${t.repeat_days ? " · 🔁 every " + t.repeat_days + "d" : ""}</div>
      </div>
      <span class="due-badge ${cd.over ? "over" : cd.soon ? "soon" : ""}">${cd.text}</span>
      <button class="mini-action" data-done="${t.id}">✓</button>
      <button class="del" data-deltask="${t.id}">🗑</button>
    </li>`;
  }).join("");

  el.innerHTML = `
    <div class="pet-chips">${petChips}</div>
    ${pets.length
      ? `<button class="btn-primary full" id="add-task">＋ Add reminder</button>
         ${tasks.length ? `<ul class="item-list pet-list">${rows}</ul>`
           : `<p class="empty">No reminders yet — add vaccine, vet or flea/tick dates 🐾</p>`}`
      : `<p class="empty">Add a pet first 🐾</p>`}
  `;

  const addPet = $("add-pet");
  if (addPet) addPet.addEventListener("click", () => openPetForm(null));
  el.querySelectorAll("[data-editpet]").forEach((b) =>
    b.addEventListener("click", () => openPetForm(b.dataset.editpet)));
  const addTask = $("add-task");
  if (addTask) addTask.addEventListener("click", () => openTaskForm());
  el.querySelectorAll("[data-done]").forEach((b) =>
    b.addEventListener("click", () => completeTask(b.dataset.done)));
  el.querySelectorAll("[data-deltask]").forEach((b) =>
    b.addEventListener("click", () => deleteTask(b.dataset.deltask)));
}

// ── pets ────────────────────────────────────────────
function openPetForm(petId) {
  const p = petId ? petFor(petId) : null;
  const form = document.createElement("div");
  form.className = "dish-form";
  form.innerHTML = `
    <label>Pet name<input type="text" id="pet-name" placeholder="e.g. Mochi" value="${p ? esc(p.name) : ""}"></label>
    <label>Birthday (optional)<input type="date" id="pet-bday" lang="en-GB" value="${p && p.birthdate ? p.birthdate : ""}"></label>
    <div id="age-hint" class="muted age-hint"></div>
    <div class="df-ing-label">Color</div>
    <div class="swatches" id="pet-colors">
      ${PALETTE.map((c) => `<button type="button" class="swatch" data-color="${c}" style="background:${c}"></button>`).join("")}
    </div>
    <button type="button" class="btn-primary full" id="pet-save">${p ? "Save changes" : "Add pet"}</button>
    ${p ? `<button type="button" class="link-btn danger" id="pet-del">🗑 Delete pet (and its reminders)</button>` : ""}`;
  openSheet(p ? "Edit pet" : "Add pet", form);

  let chosen = p ? p.color : PALETTE[0];
  const marks = () => form.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("on", s.dataset.color === chosen));
  form.querySelectorAll(".swatch").forEach((s) => s.addEventListener("click", () => { chosen = s.dataset.color; marks(); }));
  marks();

  const bday = form.querySelector("#pet-bday");
  const hint = form.querySelector("#age-hint");
  const updateAge = () => { hint.textContent = bday.value ? "Age: " + ageLong(bday.value) : ""; };
  bday.addEventListener("change", updateAge);
  updateAge();

  form.querySelector("#pet-save").addEventListener("click", async () => {
    const name = form.querySelector("#pet-name").value.trim();
    if (!name) { toast("Enter a name first"); return; }
    const birthdate = bday.value || null;
    let error;
    if (petId) ({ error } = await supabase.from("pets").update({ name, color: chosen, birthdate }).eq("id", petId));
    else ({ error } = await supabase.from("pets").insert({ name, color: chosen, birthdate, created_by: whoami() || null }));
    if (error) { toast("Couldn't save"); return; }
    closeSheet(); await reload();
  });
  const del = form.querySelector("#pet-del");
  if (del) del.addEventListener("click", async () => {
    if (!confirm("Delete this pet and all its reminders?")) return;
    const { error } = await supabase.from("pets").delete().eq("id", petId);
    if (error) { toast("Couldn't delete"); return; }
    closeSheet(); await reload();
  });
}

// ── reminders ───────────────────────────────────────
function openTaskForm() {
  const form = document.createElement("div");
  form.className = "dish-form";
  form.innerHTML = `
    <label>Pet
      <select id="tk-pet">${pets.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
    <label>Type
      <select id="tk-kind">${KINDS.map((k) => `<option value="${k.key}">${k.emoji} ${k.label}</option>`).join("")}</select></label>
    <label>Due date<input type="date" id="tk-due" lang="en-GB" value="${todayISO()}"></label>
    <label class="repeat-row"><input type="checkbox" id="tk-rep"> Repeats every
      <input type="number" id="tk-repn" value="30" min="1" class="rep-n"> days</label>
    <label>Note (optional)<input type="text" id="tk-note" placeholder="e.g. 2nd dose"></label>
    <button type="button" class="btn-primary full" id="tk-save">Add reminder</button>`;
  openSheet("Add reminder", form);

  form.querySelector("#tk-save").addEventListener("click", async () => {
    const due = form.querySelector("#tk-due").value;
    if (!due) { toast("Pick a date first"); return; }
    const repeat = form.querySelector("#tk-rep").checked ? Math.max(1, parseInt(form.querySelector("#tk-repn").value, 10) || 30) : null;
    const { error } = await supabase.from("pet_tasks").insert({
      pet_id: form.querySelector("#tk-pet").value,
      kind: form.querySelector("#tk-kind").value,
      due_date: due,
      repeat_days: repeat,
      note: form.querySelector("#tk-note").value.trim() || null,
      created_by: whoami() || null,
    });
    if (error) { toast("Couldn't save"); return; }
    closeSheet(); await reload();
  });
}

async function completeTask(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  if (t.repeat_days) {
    // advance to next due date from today (keeps it as an upcoming reminder)
    const base = daysUntil(t.due_date) < 0 ? todayISO() : t.due_date;
    const next = addDaysISO(base, t.repeat_days);
    const { error } = await supabase.from("pet_tasks").update({ due_date: next }).eq("id", id);
    if (error) { toast("Couldn't update"); return; }
    toast(`Done · next on ${prettyDate(next)}`);
  } else {
    const { error } = await supabase.from("pet_tasks").delete().eq("id", id);
    if (error) { toast("Couldn't update"); return; }
    toast("Done ✓");
  }
  await reload();
}

async function deleteTask(id) {
  const { error } = await supabase.from("pet_tasks").delete().eq("id", id);
  if (error) { toast("Couldn't delete"); return; }
  await reload();
}

// ── init / teardown ─────────────────────────────────
export function renderPets() { render(); }

export async function initPets() {
  await reload();
  channels.push(
    supabase.channel("pets-rt").on("postgres_changes", { event: "*", schema: "public", table: "pets" }, reload).subscribe(),
    supabase.channel("pet-tasks-rt").on("postgres_changes", { event: "*", schema: "public", table: "pet_tasks" }, reload).subscribe(),
  );
}
export function teardownPets() {
  channels.forEach((c) => supabase.removeChannel(c));
  channels = [];
  pets = []; tasks = [];
  closeSheet();
}
