// Single source of truth for item categories — shared by Shopping list and Stock
// so the two always show exactly the same set. Keep keys in sync with the DB
// CHECK constraints (schema.sql shopping_items, schema_staples.sql staples).
export const CATEGORIES = [
  { key: "food", emoji: "🥩", label: "Meat & Chilled Food" },
  { key: "dry", emoji: "🥫", label: "Dry Goods & Pantry" },
  { key: "beverages", emoji: "🥤", label: "Beverages" },
  { key: "household", emoji: "🏠", label: "Household" },
  { key: "health", emoji: "💊", label: "Health" },
];
// 'ingredient' was merged into 'dry' (Dry Goods & Pantry) — see schema migration.

// "🥩 Fresh food" for a key
export const catLabel = (key) => {
  const c = CATEGORIES.find((x) => x.key === key);
  return c ? `${c.emoji} ${c.label}` : "";
};

// <option> list for a <select>, with `selected` marked on `sel`
export const catOptions = (sel) =>
  CATEGORIES.map((c) => `<option value="${c.key}" ${c.key === sel ? "selected" : ""}>${c.emoji} ${c.label}</option>`).join("");
