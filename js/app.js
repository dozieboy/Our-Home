import { supabase, isConfigured } from "./supabase.js";
import { initShopping, teardownShopping } from "./shopping.js";
import { initStaples, teardownStaples, renderStaples } from "./staples.js";
import { initMenu, teardownMenu, renderMenu, renderRecipesScreen } from "./menu.js";
import { renderCompare } from "./compare.js";
import { renderAccount, recordMe } from "./account.js";
import { initSettings, teardownSettings } from "./settings.js";
import { renderHome } from "./home.js";

const $ = (id) => document.getElementById(id);

// ── Modules (bottom tabs) ────────────────────────────
const TABS = [
  { key: "home", label: "Home", emoji: "🏠" },
  { key: "shopping", label: "Shopping", emoji: "🛒", hidden: true },   // reachable from Home, not shown in the bottom bar
  { key: "menu", label: "Meals", emoji: "🍳" },
  { key: "stock", label: "Stock", emoji: "📦" },
  { key: "recipes", label: "Recipes", emoji: "📖" },
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
  if (tab.key === "stock") renderStaples();
  if (tab.key === "recipes") renderRecipesScreen();
  if (tab.key === "compare") renderCompare();
  if (tab.key === "account") renderAccount();
  window.scrollTo(0, 0);
}

function buildTabbar() {
  const nav = $("tabbar");
  nav.innerHTML = "";
  for (const t of TABS) {
    if (t.hidden) continue;   // routable but not a bottom-bar button
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

// ── Login — passwordless: email a one-tap sign-in link (magic link) ──
const EMAIL_KEY = "baanrao-email";   // remember just the email on this device (no password)

function initLoginForm() {
  try { const e = localStorage.getItem(EMAIL_KEY); if (e) $("login-email").value = e; } catch {}
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("login-btn"), err = $("login-error"), sent = $("login-sent");
    const email = $("login-email").value.trim();
    if (!email) return;
    err.hidden = true; sent.hidden = true;
    btn.disabled = true; btn.textContent = "Sending…";
    const redirect = location.origin + location.pathname;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirect, shouldCreateUser: true },
    });
    btn.disabled = false; btn.textContent = "✉️ Send me a sign-in link";
    if (error) {
      err.textContent = "Couldn't send the link: " + (error.message || "try again");
      err.hidden = false;
      return;
    }
    try { localStorage.setItem(EMAIL_KEY, email); } catch {}
    sent.textContent = "✅ Link sent to " + email + ". Open it on this device to sign in.";
    sent.hidden = false;
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
    if (!started) { started = true; await Promise.all([initSettings(), initShopping(), initStaples(), initMenu()]); }
  } else {
    if (started) { teardownSettings(); teardownShopping(); teardownStaples(); teardownMenu(); started = false; }
    showView("login");
  }
}

boot();
