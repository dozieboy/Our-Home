import { supabase, isConfigured } from "./supabase.js";
import { initShopping, teardownShopping } from "./shopping.js";
import { initStaples, teardownStaples } from "./staples.js";
import { initMenu, teardownMenu, renderMenu } from "./menu.js";
import { initPets, teardownPets, renderPets } from "./pets.js";
import { initFinance, teardownFinance, renderFinance } from "./finance.js";
import { renderCompare } from "./compare.js";
import { renderAccount, recordMe } from "./account.js";
import { initSettings, teardownSettings } from "./settings.js";
import { renderHome } from "./home.js";

const $ = (id) => document.getElementById(id);

// ── Modules (bottom tabs) ────────────────────────────
const TABS = [
  { key: "home", label: "Home", emoji: "🏠" },
  { key: "shopping", label: "Shopping", emoji: "🛒" },
  { key: "menu", label: "Meals", emoji: "🍳" },
  { key: "pets", label: "Pets", emoji: "🐾" },
  { key: "finance", label: "Finance", emoji: "💰" },
  { key: "compare", label: "Compare", emoji: "⚖️" },
  { key: "account", label: "Account", emoji: "👤" },
];

const PLACEHOLDERS = {};

// ── Toast ────────────────────────────────────────────
let toastTimer = null;
export function toast(msg) {
  const el = $("toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

// ── My name (stored locally since the login is shared) ──
const WHO_KEY = "baanrao-whoami";
export function whoami() {
  try { return localStorage.getItem(WHO_KEY) || ""; } catch { return ""; }
}
export function setWhoami(name) {
  try { localStorage.setItem(WHO_KEY, name); } catch {}
  $("whoami-name").textContent = name || "—";
}

// ── Switch view (login/app) ──────────────────────────
function showView(which) {
  $("login-view").hidden = which !== "login";
  $("app-view").hidden = which !== "app";
}

// ── Tab router ───────────────────────────────────────
export function setTab(key) {
  const tab = TABS.find((t) => t.key === key) || TABS[0];
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = true));
  const screen = $("screen-" + tab.key);
  if (screen) screen.hidden = false;

  $("screen-icon").textContent = tab.emoji;
  $("screen-title").textContent = tab.label;
  document.querySelectorAll(".tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.key === tab.key));

  if (tab.key === "home") renderHome();
  if (tab.key === "menu") renderMenu();
  if (tab.key === "pets") renderPets();
  if (tab.key === "finance") renderFinance();
  if (tab.key === "compare") renderCompare();
  if (tab.key === "account") renderAccount();
  window.scrollTo(0, 0);
}

function buildTabbar() {
  const nav = $("tabbar");
  nav.innerHTML = "";
  for (const t of TABS) {
    const b = document.createElement("button");
    b.className = "tab";
    b.dataset.key = t.key;
    b.innerHTML = `<span class="tab-emoji">${t.emoji}</span><span class="tab-label">${t.label}</span>`;
    b.addEventListener("click", () => setTab(t.key));
    nav.appendChild(b);
  }
}

function buildPlaceholders() {
  for (const [key, info] of Object.entries(PLACEHOLDERS)) {
    const el = $("screen-" + key);
    if (!el) continue;
    el.innerHTML = `
      <div class="placeholder-card">
        <div class="ph-emoji">${info.emoji}</div>
        <h2>${info.title}</h2>
        <p class="muted">${info.desc}</p>
        <div class="ph-badge">🚧 Coming soon</div>
      </div>`;
  }
}

// ── Login (with optional "Remember me" on this device) ──
const REMEMBER_KEY = "baanrao-remember";
function saveRemember(email, password) {
  try { localStorage.setItem(REMEMBER_KEY, btoa(unescape(encodeURIComponent(JSON.stringify({ email, password }))))); } catch {}
}
function loadRemember() {
  try { const v = localStorage.getItem(REMEMBER_KEY); return v ? JSON.parse(decodeURIComponent(escape(atob(v)))) : null; } catch { return null; }
}
function clearRemember() { try { localStorage.removeItem(REMEMBER_KEY); } catch {} }

function initLoginForm() {
  const saved = loadRemember();
  if (saved) {
    $("login-email").value = saved.email || "";
    $("login-password").value = saved.password || "";
    $("login-remember").checked = true;
  }
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("login-btn"), err = $("login-error");
    const email = $("login-email").value.trim();
    const password = $("login-password").value;
    const remember = $("login-remember").checked;
    err.hidden = true;
    btn.disabled = true; btn.textContent = "Signing in…";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    btn.disabled = false; btn.textContent = "Sign in";
    if (error) {
      err.textContent = "Sign in failed: " + (error.message || "check your email / password");
      err.hidden = false;
      return;
    }
    if (remember) saveRemember(email, password); else clearRemember();
  });
}

function initAppChrome() {
  $("logout-btn").addEventListener("click", async () => { await supabase.auth.signOut(); });
  $("whoami-chip").addEventListener("click", () => {
    const name = prompt("Your name (shown on items you add):", whoami());
    if (name !== null) { setWhoami(name.trim()); if (!$("screen-home").hidden) renderHome(); }
  });
  setWhoami(whoami());
  buildTabbar();
  buildPlaceholders();
}

// ── Boot ─────────────────────────────────────────────
let started = false;

async function boot() {
  if (!isConfigured) {
    $("config-banner").hidden = false;
    showView("login");
    $("login-btn").disabled = true;
    return;
  }
  initLoginForm();
  initAppChrome();

  const { data: { session } } = await supabase.auth.getSession();
  await applySession(session);
  supabase.auth.onAuthStateChange((_e, s) => applySession(s));
}

async function applySession(session) {
  if (session) {
    showView("app");
    setTab("home");
    recordMe();   // record my email as a household member (fire & forget)
    if (!started) { started = true; await Promise.all([initSettings(), initShopping(), initStaples(), initMenu(), initPets(), initFinance()]); }
  } else {
    if (started) { teardownSettings(); teardownShopping(); teardownStaples(); teardownMenu(); teardownPets(); teardownFinance(); started = false; }
    showView("login");
  }
}

boot();
