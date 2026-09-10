import { supabase } from "./supabase.js";
import { toast, whoami, setWhoami } from "./app.js";
import { getHasKids, setHasKids } from "./settings.js";

const $ = (id) => document.getElementById(id);
let myEmail = "";

const ddmmyyyy = (iso) => { const p = (iso || "").split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : ""; };
function ageFrom(iso) {
  if (!iso) return "";
  const b = new Date(iso + "T00:00:00"); if (isNaN(b)) return "";
  const now = new Date();
  let y = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) y--;
  return y >= 0 ? `${y} yr` : "";
}
async function fetchKids() {
  const { data } = await supabase.from("kids").select("*").order("created_at", { ascending: true });
  return data || [];
}

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

  const hasKids = getHasKids();
  const [members, kids] = await Promise.all([fetchMembers(), hasKids ? fetchKids() : Promise.resolve([])]);
  const meLc = (email || "").toLowerCase();

  const kidRows = kids.map((k) => `
    <li class="item">
      <div class="body"><div class="name">👶 ${esc(k.name)}</div>
        ${k.birthdate ? `<div class="meta">${ddmmyyyy(k.birthdate)}${ageFrom(k.birthdate) ? " · " + ageFrom(k.birthdate) : ""}</div>` : ""}</div>
      <button class="del" data-delkid="${k.id}">🗑</button>
    </li>`).join("");
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
      <label class="kids-toggle"><input type="checkbox" id="kids-on" ${hasKids ? "checked" : ""}> <span>👶 We have kids</span></label>
      <div id="kids-box" ${hasKids ? "" : "hidden"}>
        <p class="muted acct-sub">Add each child's name &amp; birthday. This also adds a “Kid meal” slot in Meals.</p>
        <form id="kid-form" class="fam-form">
          <input type="text" id="kid-name" placeholder="Kid's name" required>
          <input type="date" id="kid-bday" lang="en-GB" class="kid-bday">
          <button type="submit" class="btn-primary add-btn" id="kid-btn">＋</button>
        </form>
        <ul class="item-list">${kidRows || `<li class="muted acct-empty">No kids added yet</li>`}</ul>
      </div>
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

  $("kids-on").addEventListener("change", async (e) => { await setHasKids(e.target.checked); renderAccount(); });
  const kf = $("kid-form");
  if (kf) kf.addEventListener("submit", (e) => { e.preventDefault(); addKid(); });
  el.querySelectorAll("[data-delkid]").forEach((b) =>
    b.addEventListener("click", () => deleteKid(b.dataset.delkid)));
}

async function addKid() {
  const name = $("kid-name").value.trim();
  if (!name) return;
  const birthdate = $("kid-bday").value || null;
  const { error } = await supabase.from("kids").insert({ name, birthdate, created_by: myEmail || null });
  if (error) { toast("Couldn't add: " + (error.message || "error")); return; }
  toast("Added " + name);
  renderAccount();
}

async function deleteKid(id) {
  const { error } = await supabase.from("kids").delete().eq("id", id);
  if (error) { toast("Couldn't remove"); return; }
  renderAccount();
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
