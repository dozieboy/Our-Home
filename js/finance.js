import { supabase } from "./supabase.js";
import { toast, whoami } from "./app.js";
import { openSheet, closeSheet, esc } from "./ui.js";

const $ = (id) => document.getElementById(id);

const CATS = [
  { key: "food", emoji: "🍎", label: "Food" },
  { key: "household", emoji: "🏠", label: "Household" },
  { key: "health", emoji: "💊", label: "Health" },
  { key: "other", emoji: "📌", label: "Other" },
];
const catOf = (k) => CATS.find((c) => c.key === k) || CATS[3];

let expenses = [];
let channel = null;
const nowD = new Date();
let vY = nowD.getFullYear();
let vM = nowD.getMonth();   // 0-11

const pad = (n) => String(n).padStart(2, "0");
const monthKey = () => `${vY}-${pad(vM + 1)}`;
function money(n) { return "฿" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function ddmmyyyy(iso) { const p = (iso || "").split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; }
function monthLabel() { return new Date(vY, vM, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// ── load ────────────────────────────────────────────
async function reload() {
  const { data, error } = await supabase.from("expenses").select("*").order("spent_on", { ascending: false });
  if (error) console.error(error);
  expenses = data || [];
  render();
  document.dispatchEvent(new CustomEvent("finance-changed"));
}

// ── settlement (all-time unsettled, 50/50 between 2 payers) ──
function settlement() {
  const un = expenses.filter((e) => !e.reimbursed);
  const byPayer = {};
  for (const e of un) { const k = (e.payer || "?").trim() || "?"; byPayer[k] = (byPayer[k] || 0) + Number(e.amount); }
  const payers = Object.keys(byPayer);
  if (payers.length === 2) {
    const [a, b] = payers;
    const net = (byPayer[a] - byPayer[b]) / 2;   // positive → b owes a
    if (Math.abs(net) < 0.005) return { text: "All settled up 🎉", byPayer, none: false };
    const owes = net > 0 ? b : a, to = net > 0 ? a : b;
    return { text: `${esc(owes)} owes ${esc(to)} ${money(Math.abs(net))}`, byPayer };
  }
  return { byPayer, payers };
}

// ── summary for Home ────────────────────────────────
export function getFinanceSummary() {
  const mk = monthKey();
  const total = expenses.filter((e) => (e.spent_on || "").startsWith(mk)).reduce((s, e) => s + Number(e.amount), 0);
  const st = settlement();
  return { monthTotal: total, settleText: st.text || "" };
}

// ── render ──────────────────────────────────────────
function render() {
  const el = $("screen-finance");
  if (!el) return;
  const mk = monthKey();
  const monthExp = expenses.filter((e) => (e.spent_on || "").startsWith(mk));
  const total = monthExp.reduce((s, e) => s + Number(e.amount), 0);

  const byCat = {};
  monthExp.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
  const catChips = CATS.filter((c) => byCat[c.key]).map((c) =>
    `<span class="mini-chip">${c.emoji} ${c.label} <b>${money(byCat[c.key])}</b></span>`).join("") || `<span class="muted">No spending yet</span>`;

  const st = settlement();
  const settleHtml = st.text
    ? `<div class="settle-net">${st.text}</div>`
    : Object.keys(st.byPayer).length
      ? Object.entries(st.byPayer).map(([p, v]) => `<div class="settle-row">${esc(p)} fronted <b>${money(v)}</b></div>`).join("")
      : `<div class="muted">Nothing unsettled</div>`;

  const rows = monthExp.map((e) => {
    const c = catOf(e.category);
    return `<li class="item exp ${e.reimbursed ? "reimb" : ""}">
      <div class="body">
        <div class="name">${c.emoji} ${esc(e.note || c.label)}</div>
        <div class="meta">${e.payer ? esc(e.payer) + " · " : ""}${ddmmyyyy(e.spent_on)}</div>
      </div>
      <span class="exp-amt">${money(e.amount)}</span>
      <button class="reimb-pill ${e.reimbursed ? "on" : ""}" data-reimb="${e.id}">${e.reimbursed ? "✓ Settled" : "Unsettled"}</button>
      <button class="del" data-delexp="${e.id}">🗑</button>
    </li>`;
  }).join("");

  el.innerHTML = `
    <div class="monthbar">
      <button class="date-nav" data-fnav="-1">‹</button>
      <div class="month-title">${monthLabel()}</div>
      <button class="date-nav" data-fnav="1">›</button>
    </div>

    <div class="fin-total">
      <div class="fin-total-label muted">Total this month</div>
      <div class="fin-total-amt">${money(total)}</div>
      <div class="mini-chips">${catChips}</div>
    </div>

    <div class="settle-box">
      <div class="settle-title">💸 To settle</div>
      ${settleHtml}
    </div>

    <button class="btn-primary full" id="add-exp">＋ Add expense</button>
    ${monthExp.length ? `<ul class="item-list fin-list">${rows}</ul>`
      : `<p class="empty">No expenses this month — add the first one 💰</p>`}
  `;

  el.querySelectorAll("[data-fnav]").forEach((b) =>
    b.addEventListener("click", () => { vM += +b.dataset.fnav; if (vM < 0) { vM = 11; vY--; } if (vM > 11) { vM = 0; vY++; } render(); }));
  $("add-exp").addEventListener("click", () => openExpenseForm());
  el.querySelectorAll("[data-reimb]").forEach((b) =>
    b.addEventListener("click", () => toggleReimb(b.dataset.reimb)));
  el.querySelectorAll("[data-delexp]").forEach((b) =>
    b.addEventListener("click", () => deleteExpense(b.dataset.delexp)));
}

// ── actions ─────────────────────────────────────────
function openExpenseForm() {
  const form = document.createElement("div");
  form.className = "dish-form";
  form.innerHTML = `
    <label>Amount<input type="number" inputmode="decimal" id="ex-amt" min="0" placeholder="0.00"></label>
    <label>Note<input type="text" id="ex-note" placeholder="e.g. Groceries at Lotus's"></label>
    <label>Category
      <select id="ex-cat">${CATS.map((c) => `<option value="${c.key}">${c.emoji} ${c.label}</option>`).join("")}</select></label>
    <label>Paid by<input type="text" id="ex-payer" value="${esc(whoami() || "")}" placeholder="who paid"></label>
    <label>Date<input type="date" id="ex-date" lang="en-GB" value="${todayISO()}"></label>
    <button type="button" class="btn-primary full" id="ex-save">Add expense</button>`;
  openSheet("Add expense", form);
  form.querySelector("#ex-save").addEventListener("click", async () => {
    const amount = parseFloat(form.querySelector("#ex-amt").value);
    if (!(amount > 0)) { toast("Enter an amount first"); return; }
    const { error } = await supabase.from("expenses").insert({
      amount,
      note: form.querySelector("#ex-note").value.trim() || null,
      category: form.querySelector("#ex-cat").value,
      payer: form.querySelector("#ex-payer").value.trim() || null,
      spent_on: form.querySelector("#ex-date").value || todayISO(),
      created_by: whoami() || null,
    });
    if (error) { toast("Couldn't save"); return; }
    closeSheet(); await reload();
  });
}

async function toggleReimb(id) {
  const e = expenses.find((x) => x.id === id);
  if (!e) return;
  const next = !e.reimbursed;
  e.reimbursed = next; render();
  const { error } = await supabase.from("expenses").update({ reimbursed: next }).eq("id", id);
  if (error) { toast("Couldn't update"); await reload(); }
}

async function deleteExpense(id) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) { toast("Couldn't delete"); return; }
  await reload();
}

// ── init / teardown ─────────────────────────────────
export function renderFinance() { render(); }

export async function initFinance() {
  await reload();
  channel = supabase.channel("expenses-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, reload)
    .subscribe();
}
export function teardownFinance() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  expenses = [];
  closeSheet();
}
