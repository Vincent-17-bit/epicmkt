import { formatValue, isInfoGroup, visibleFields } from "@epicmkt/shared";

const SCALARS = ["text", "number", "price", "boolean", "select", "multiselect"];

export const SPEC_GROUPS = ["Features & Specs", "Measurements", "Additional details", "User guide", "Item details"];
export const HIGHLIGHT_LIMIT = 5;

const [DEFAULT_GROUP, , , , DETAILS_GROUP] = SPEC_GROUPS;

const isBlank = (value) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

const asGroup = (name, fallback) => (SPEC_GROUPS.includes(name) ? name : fallback);

export function buildSpecGroups({ item, category, attributes }) {
  const buckets = new Map(SPEC_GROUPS.map((name) => [name, []]));
  const seen = new Set();
  const add = (name, raw, value) => {
    // "• Dietary Claims:" reads as "Dietary Claims": the table draws the label column itself.
    const label = typeof raw === "string" ? cleanLead(raw) || raw.trim() : raw;
    const key = typeof label === "string" ? label.trim().toLowerCase() : "";
    if (!key || isBlank(value) || seen.has(key)) return;
    seen.add(key);
    buckets.get(name).push({ label, value: String(value) });
  };
  for (const spec of item?.specs ?? []) if (!isInfoGroup(spec.group)) add(asGroup(spec.group, DEFAULT_GROUP), spec.label, spec.value);
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

// The bold lead of a highlight, as sellers type it: "• Freshness Guaranteed:", "[Fast charging]", "【Big sound】 -". The page draws the
// brackets and the colon itself, so whatever the seller typed around the words is taken off: bullets, dashes, brackets and a last colon.
export const cleanLead = (title) =>
  String(title ?? "")
    .trim()
    .replace(/^[\s•●▪■◆★✓✔*\-–—·>]+/u, "")
    .replace(/[\s:：\-–—]+$/u, "")
    .replace(/^[[【〔(（「『]+\s*/u, "")
    .replace(/\s*[\]】〕)）」』]+$/u, "")
    .replace(/[\s:：\-–—]+$/u, "")
    .trim();

export function normalizeHighlights(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    const raw = typeof entry === "string" ? { text: entry } : entry;
    if (!raw || typeof raw !== "object") continue;
    const text = typeof raw.text === "string" ? raw.text.trim().replace(/^[:：\-–—]\s*/u, "") : "";
    const title = typeof raw.title === "string" ? cleanLead(raw.title) : "";
    if (!text && !title) continue;
    out.push(text ? { title, text } : { title: "", text: title });
  }
  return out;
}
