import { formatValue, visibleFields } from "@epicmkt/shared";

const SCALARS = ["text", "number", "price", "boolean", "select", "multiselect"];

export const SPEC_GROUPS = ["Features & Specs", "Measurements", "Additional details", "User guide", "Item details"];
export const HIGHLIGHT_LIMIT = 5;

const [DEFAULT_GROUP, , , , DETAILS_GROUP] = SPEC_GROUPS;

const isBlank = (value) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

const asGroup = (name, fallback) => (SPEC_GROUPS.includes(name) ? name : fallback);

export function buildSpecGroups({ item, category, attributes }) {
  const buckets = new Map(SPEC_GROUPS.map((name) => [name, []]));
  const seen = new Set();
  const add = (name, label, value) => {
    const key = typeof label === "string" ? label.trim().toLowerCase() : "";
    if (!key || isBlank(value) || seen.has(key)) return;
    seen.add(key);
    buckets.get(name).push({ label, value: String(value) });
  };
  for (const spec of item?.specs ?? []) add(asGroup(spec.group, DEFAULT_GROUP), spec.label, spec.value);
  add(DETAILS_GROUP, "Duration", item?.duration);
  add(DETAILS_GROUP, "Term", item?.term);
  add(DETAILS_GROUP, "Pack size", item?.packSize);
  add(DETAILS_GROUP, "Unit", item?.pricing?.unit);
  for (const field of visibleFields(category?.fields, attributes)) {
    if (!SCALARS.includes(field.type)) continue;
    const value = attributes?.[field.key];
    if (isBlank(value) || (field.type === "boolean" && value === false)) continue;
    add(DETAILS_GROUP, field.label, formatValue(field, value));
  }
  return SPEC_GROUPS.map((name) => ({ name, rows: buckets.get(name) })).filter((g) => g.rows.length > 0);
}

export const countRows = (groups) => groups.reduce((sum, g) => sum + g.rows.length, 0);

export function normalizeHighlights(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    const raw = typeof entry === "string" ? { text: entry } : entry;
    if (!raw || typeof raw !== "object") continue;
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!text && !title) continue;
    out.push(text ? { title, text } : { title: "", text: title });
  }
  return out;
}
