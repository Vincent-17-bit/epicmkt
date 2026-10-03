import { formatValue, visibleFields } from "@epicmkt/shared";

const kes = (amount) => `KES ${Number(amount).toLocaleString("en-KE")}`;

export function chatMessage({ item, variant, pricing }) {
  const name = variant ? `${item.name} (${variant.label})` : item.name;
  const shown = variant ?? pricing;
  if (!shown || !Number.isFinite(shown.regularPrice)) return `Hi, I saw ${name} on EpicMKT`;
  if (shown.savings > 0) {
    return `Hi, I saw the flash sale on ${name}: ${kes(shown.salePrice)} (was ${kes(shown.regularPrice)}) on EpicMKT`;
  }
  return `Hi, I saw ${name} (${kes(shown.regularPrice)}) on EpicMKT`;
}

export function defaultVariantId(pricing) {
  const variants = pricing?.variants ?? [];
  if (!variants.length) return null;
  return (variants.find((v) => v.regularPrice === pricing.regularPrice) ?? variants[0]).id;
}

const SCALARS = ["text", "number", "price", "boolean", "select", "multiselect"];
const LIMIT_ROWS = 8;

const isBlank = (value) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

export function buildSpecGroups({ item, category, attributes }) {
  const groups = [];
  const seen = new Set();
  const add = (name, label, value) => {
    const key = label.trim().toLowerCase();
    if (!label || isBlank(value) || seen.has(key)) return;
    seen.add(key);
    let group = groups.find((g) => g.name === name);
    if (!group) {
      group = { name, rows: [] };
      groups.push(group);
    }
    group.rows.push({ label, value: String(value) });
  };
  for (const spec of item?.specs ?? []) add(spec.group ?? null, spec.label, spec.value);
  add(null, "Duration", item?.duration);
  add(null, "Term", item?.term);
  add(null, "Pack size", item?.packSize);
  add(null, "Unit", item?.pricing?.unit);
  const fallback = category?.singular ? `${category.singular} details` : null;
  for (const field of visibleFields(category?.fields, attributes)) {
    if (!SCALARS.includes(field.type)) continue;
    const value = attributes?.[field.key];
    if (isBlank(value) || (field.type === "boolean" && value === false)) continue;
    add(field.group ?? fallback, field.label, formatValue(field, value));
  }
  return groups.filter((g) => g.rows.length > 0);
}

export function limitGroups(groups, max = LIMIT_ROWS) {
  let left = max;
  const out = [];
  for (const group of groups) {
    if (left <= 0) break;
    const rows = group.rows.slice(0, left);
    left -= rows.length;
    out.push({ ...group, rows });
  }
  return out;
}

export const countRows = (groups) => groups.reduce((sum, g) => sum + g.rows.length, 0);
export const SPEC_LIMIT = LIMIT_ROWS;
