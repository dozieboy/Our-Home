import { supabase } from "./supabase.js";
import { toast, whoami, setWhoami } from "./app.js";

const $ = (id) => document.getElementById(id);
let myEmail = "";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function currentEmail() {
  if (myEmail) return myEmail;
  const { data: { user } } = await supabase.auth.getUser();
  myEmail = user?.email || "";
  return myEmail;
}

// Record the signed-in user as an active household member (called on login)
export async function recordMe() {
  const email = (await currentEmail()).toLowerCase();
  if (!email) return;
  await supabase.from("household_members").upsert(
    { email, status: "active", last_seen: new Date().toISOString() },
    { onConflict: "email" }
  );
}

async function fetchMembers() {
  const { data, error } = await supabase.from("household_members").select("*").order("created_at", { ascending: true });
  if (error) console.error(error);
  return data || [];
}

export async function renderAccount() {
  const el = $("screen-account");
  if (!el) return;
  const email = await currentEmail();
  el.innerHTML = `<div class="muted acct-loading">Loading…</div>`;

  const members = await fetchMembers();
  const meLc = (email || "").toLowerCase();
  const rows = members.map((m) => {
    const isMe = (m.email || "").toLowerCase() === meLc;
    return `<li class="item">
      <div class="body">
        <div class="name">${esc(m.email)}${isMe ? ` <span class="me-tag">you</span>` : ""}</div>
        ${m.invited_by && !isMe ? `<div class="meta">invited by ${esc(m.invited_by)}</div>` : ""}
      </div>
      <span class="mem-status ${m.status === "active" ? "on" : ""}">${m.status === "active" ? "✅ Joined" : "✉️ Invited"}</span>
      ${isMe ? "" : `<button class="del" data-delmem="${esc(m.email)}">🗑</button>`}
    </li>`;
  }).join("");

  el.innerHTML = `
    <div class="acct-card">
      <div class="acct-label muted">Signed in as</div>
      <div class="acct-email">${esc(email || "—")}</div>
      <div class="acct-row">
        <span class="muted">Name on this device</span>
        <button class="link-btn" id="acct-name">${esc(whoami() || "Set name")} ✏️</button>
      </div>
      <button class="btn-secondary full" id="acct-signout">Sign out</button>
    </div>

    <div class="acct-card">
      <div class="acct-title">👪 Family in this home</div>
      <p class="muted acct-sub">Everyone here shares the same home. Invite family by email — they get a sign-in link to confirm.</p>
      <form id="fam-form" class="fam-form">
        <input type="email" id="fam-email" placeholder="family@email.com" required>
        <button type="submit" class="btn-primary add-btn" id="fam-btn">✉️ Invite</button>
      </form>
      <ul class="item-list">${rows || `<li class="muted acct-empty">No members yet</li>`}</ul>
    </div>`;

  $("acct-name").addEventListener("click", () => {
    const n = prompt("Your name (shown on items you add):", whoami());
    if (n !== null) { setWhoami(n.trim()); renderAccount(); }
  });
  $("acct-signout").addEventListener("click", async () => { await supabase.auth.signOut(); });

  $("fam-form").addEventListener("submit", (e) => { e.preventDefault(); inviteFamily(); });
  el.querySelectorAll("[data-delmem]").forEach((b) =>
    b.addEventListener("click", () => removeMember(b.dataset.delmem)));
}

async function inviteFamily() {
  const input = $("fam-email"), btn = $("fam-btn");
  const email = input.value.trim().toLowerCase();
  if (!email) return;
  btn.disabled = true; btn.textContent = "Sending…";
  const redirect = location.origin + location.pathname;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect, shouldCreateUser: true },
  });
  btn.disabled = false; btn.textContent = "✉️ Invite";
  if (error) { toast("Invite failed: " + (error.message || "error")); return; }
  // record as invited (don't downgrade someone who already joined)
  await supabase.from("household_members").upsert(
    { email, status: "invited", invited_by: myEmail },
    { onConflict: "email", ignoreDuplicates: true }
  );
  toast("Invite link sent to " + email);
  input.value = "";
  renderAccount();
}

async function removeMember(email) {
  const { error } = await supabase.from("household_members").delete().eq("email", email);
  if (error) { toast("Couldn't remove"); return; }
  toast("Removed from list");
  renderAccount();
}
