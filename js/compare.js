// Unit-price comparator — pure client-side calculator (no backend)
const $ = (id) => document.getElementById(id);

function fmt(n) { return n.toLocaleString(undefined, { maximumFractionDigits: 4 }); }

function card(x) {
  return `<div class="cmp-card cmp-${x}">
    <div class="cmp-head">Item ${x}</div>
    <label>Size<input type="number" inputmode="decimal" id="sz-${x}" min="0" placeholder="0"></label>
    <label>Price<input type="number" inputmode="decimal" id="pr-${x}" min="0" placeholder="0"></label>
    <div class="cmp-unitprice" id="up-${x}"></div>
  </div>`;
}

function compute() {
  const per = (x) => {
    const s = parseFloat($("sz-" + x).value);
    const p = parseFloat($("pr-" + x).value);
    if (!(s > 0) || isNaN(p) || p < 0) return null;
    return p / s;
  };
  const a = per("A"), b = per("B");
  const label = (v) => `฿${fmt(v)} / unit`;
  $("up-A").textContent = a == null ? "" : "= " + label(a);
  $("up-B").textContent = b == null ? "" : "= " + label(b);

  const res = $("cmp-result");
  if (a == null || b == null) {
    res.className = "cmp-result";
    res.innerHTML = `<span class="muted">Fill in size &amp; price for both</span>`;
    return;
  }
  if (Math.abs(a - b) < 1e-9) {
    res.className = "cmp-result same";
    res.innerHTML = `🤝 Same price per unit`;
    return;
  }
  const aCheaper = a < b;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const pct = Math.round((hi - lo) / hi * 100);
  res.className = "cmp-result " + (aCheaper ? "win-a" : "win-b");
  res.innerHTML = `🏆 <b>Item ${aCheaper ? "A" : "B"} is cheaper</b>
    <div class="cmp-sub">${label(lo)} vs ${label(hi)} · ${pct}% cheaper</div>`;
}

export function renderCompare() {
  const el = $("screen-compare");
  if (!el) return;
  el.innerHTML = `
    <p class="cmp-intro muted">Enter size &amp; price for each option — see which is cheaper per unit.</p>
    <div class="cmp-cards">${card("A")}${card("B")}</div>
    <div id="cmp-result" class="cmp-result"></div>`;
  el.querySelectorAll("input").forEach((i) => i.addEventListener("input", compute));
  compute();
}
