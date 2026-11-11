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

  // Step 1 — email the 6-digit code
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
      options: { emailRedirectTo: redirect, shouldCreateUser: false },   // invite-only: existing members only
    });
    btn.disabled = false; btn.textContent = "✉️ Send me a code";
    if (error) {
      const m = (error.message || "").toLowerCase();
      err.textContent = /signup|not allowed|not found|disabled/.test(m)
        ? "This email isn't invited yet — ask the home owner to add you in Account › Add Family."
        : "Couldn't send the code: " + (error.message || "try again");
      err.hidden = false;
      return;
    }
    try { localStorage.setItem(EMAIL_KEY, email); } catch {}
    $("login-code-box").hidden = false;                 // reveal the code field
    sent.textContent = "✅ We emailed a 6-digit code to " + email + ". Enter it here to sign in.";
    sent.hidden = false;
    $("login-code").focus();
  });

  // Step 2 — verify the code typed into THIS app (works inside an installed PWA)
  $("login-verify").addEventListener("click", async () => {
    const vbtn = $("login-verify"), err = $("login-error");
    const email = $("login-email").value.trim();
    const token = $("login-code").value.trim();
    if (!email || !token) return;
    err.hidden = true;
    vbtn.disabled = true; vbtn.textContent = "Signing in…";
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    vbtn.disabled = false; vbtn.textContent = "Sign in";
    if (error) {
      err.textContent = "Wrong or expired code — check the email or send a new one.";
      err.hidden = false;
      return;
    }
    // success → onAuthStateChange(applySession) switches to the app view
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

  // No login screen: open straight into the app via an anonymous session.
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) console.error("anon sign-in:", error);   // (enable Anonymous sign-ins in Supabase)
    session = data?.session || null;
  }
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
