// UI helpers ที่ใช้ร่วมกันหลายโมดูล — bottom sheet + escape

export function openSheet(title, contentEl) {
  closeSheet();
  const overlay = document.createElement("div");
  overlay.className = "sheet-overlay";
  overlay.id = "sheet-overlay";
  overlay.innerHTML = `<div class="sheet"><div class="sheet-head"><h3></h3><button class="sheet-close">✕</button></div><div class="sheet-body"></div></div>`;
  overlay.querySelector("h3").textContent = title;
  overlay.querySelector(".sheet-body").appendChild(contentEl);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeSheet(); });
  overlay.querySelector(".sheet-close").addEventListener("click", closeSheet);
  document.body.appendChild(overlay);
}

export function closeSheet() {
  const o = document.getElementById("sheet-overlay");
  if (o) o.remove();
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
