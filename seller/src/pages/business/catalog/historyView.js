import { formatKes } from "@epicmkt/shared";

export const FIELD_LABEL = {
  name: "Name",
  price: "Price",
  price_max: "Highest price",
  price_type: "Price type",
  sale_price: "Sale price",
  unit: "Unit",
  availability: "Availability",
  stock_count: "Stock",
  visible: "Visibility",
  draft: "Draft",
  hidden_by_admin: "Hidden by EpicMKT",
  removed_by_admin: "Removed by EpicMKT",
  brand: "Brand",
  short_description: "Short description",
  description: "Description",
  section: "Section",
  pack_size: "Pack size",
  terms: "Terms",
  includes: "What is included",
  highlights: "Highlights",
  specs: "Specifications",
};

export const WHO = { seller: "You", admin: "EpicMKT", system: "System" };

const LIST_FIELDS = new Set(["includes", "highlights", "specs"]);
const MONEY = new Set(["price", "price_max", "sale_price"]);
const FLAG = {
  visible: ["Showing", "Hidden"],
  draft: ["Draft", "Published"],
  hidden_by_admin: ["Hidden", "Visible"],
  removed_by_admin: ["Removed", "Restored"],
};

const blank = (v) => v === null || v === undefined || v === "" || v === "[]" || v === "{}";
const words = (v) => String(v).replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

const parse = (v) => {
  if (blank(v)) return [];
  try {
    const out = JSON.parse(v);
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
};

const lineOf = (field, entry) => {
  if (typeof entry === "string") return entry.trim();
  if (field === "highlights") return [entry.title, entry.text].map((s) => String(s ?? "").trim().replace(/:$/, "")).filter(Boolean).join(": ");
  if (field === "specs") return [entry.label, entry.value].map((s) => String(s ?? "").trim().replace(/:$/, "")).filter(Boolean).join(": ");
  return String(entry ?? "");
};

const plain = (field, v) => {
  if (blank(v)) return null;
  if (FLAG[field]) return FLAG[field][v === "true" || v === true ? 0 : 1];
  if (MONEY.has(field) && Number.isFinite(Number(v))) return formatKes(Number(v));
  if (field === "availability" || field === "price_type") return words(v);
  return String(v);
};

export function describeChange(e) {
  const label = FIELD_LABEL[e.field] ?? words(e.field);
  if (LIST_FIELDS.has(e.field)) {
    const before = parse(e.old_value).map((x) => lineOf(e.field, x)).filter(Boolean);
    const after = parse(e.new_value).map((x) => lineOf(e.field, x)).filter(Boolean);
    const added = after.filter((l) => !before.includes(l));
    const removed = before.filter((l) => !after.includes(l));
    return { id: e.id, label, kind: "list", verb: !before.length ? "Added" : !after.length ? "Cleared" : "Changed", added, removed };
  }
  const before = plain(e.field, e.old_value);
  const after = plain(e.field, e.new_value);
  if (FLAG[e.field]) return { id: e.id, label, kind: "flag", verb: "Changed", before, after };
  return { id: e.id, label, kind: "text", verb: before === null ? "Added" : after === null ? "Cleared" : "Changed", before, after };
}

const minute = (iso) => String(iso ?? "").slice(0, 16);

export function groupHistory(entries) {
  const groups = [];
  for (const e of entries) {
    const key = `${e.actor_role}|${minute(e.created_at)}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.changes.push(describeChange(e));
    else groups.push({ key, actor: e.actor_role, at: e.created_at, changes: [describeChange(e)] });
  }
  return groups;
}
