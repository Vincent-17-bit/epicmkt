import { normalizeValueKey } from "../openValues.js";

const fold = (s) => normalizeValueKey(s);

const filled = (v) => {
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.some(filled);
  return false;
};

const FIELD_FALLBACK = { brand: "brand", "pack-size": "packSize", includes: "includes" };

export function specValue(item, row) {
  const label = fold(row.label);
  const specs = Array.isArray(item?.specs) ? item.specs : [];
  const hit = specs.find((s) => fold(s?.label) === label && filled(s?.value));
  return hit ? hit.value : undefined;
}

export function rowValue(item, row) {
  const own = specValue(item, row);
  if (own !== undefined) return own;
  const field = FIELD_FALLBACK[row.key];
  if (field && filled(item?.[field])) return item[field];
  const axes = Array.isArray(item?.options) ? item.options : Array.isArray(item?.axes) ? item.axes : [];
  const axis = axes.find((a) => a?.key === row.key && Array.isArray(a.values) && a.values.length > 0);
  return axis ? axis.values.map((v) => v?.label ?? v?.id).join(", ") : undefined;
}

export const hasRowValue = (item, row) => filled(rowValue(item, row));

function tagsOf(value, row, tags) {
  if (!filled(value)) return [];
  const list = typeof tags === "function" ? tags(value, row) : tags?.[fold(value)];
  return Array.isArray(list) ? list : [];
}

const asList = (v) => (Array.isArray(v) ? v : [v]);

export function evaluate(cond, rowsByKey, item, tags) {
  if (cond === undefined || cond === null) return true;
  if (Array.isArray(cond.all)) return cond.all.every((c) => evaluate(c, rowsByKey, item, tags));
  if (Array.isArray(cond.any)) return cond.any.some((c) => evaluate(c, rowsByKey, item, tags));
  if (cond.not !== undefined) return !evaluate(cond.not, rowsByKey, item, tags);
  const row = rowsByKey.get(cond.row);
  if (!row) return false;
  const value = rowValue(item, row);
  if (cond.present !== undefined) return filled(value) === Boolean(cond.present);
  if (!filled(value)) return false;
  if (cond.tag !== undefined) return tagsOf(value, row, tags).includes(cond.tag);
  const key = fold(value);
  if (cond.equals !== undefined) return fold(cond.equals) === key;
  if (cond.in !== undefined) return asList(cond.in).some((v) => fold(v) === key);
  return false;
}

export function resolveRows(item, rows, { tags } = {}) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out = [];
  for (const row of rows) {
    const visible = row.showIf === undefined ? true : evaluate(row.showIf, byKey, item, tags);
    if (!visible) continue;
    const promoted = row.requiredIf !== undefined && evaluate(row.requiredIf, byKey, item, tags);
    out.push({ ...row, level: promoted ? "required" : row.level });
  }
  return out;
}

const CONDITION_KEYS = ["equals", "in", "tag", "present"];

export function checkCondition(cond, keys, ownKey, path) {
  if (cond === null || typeof cond !== "object" || Array.isArray(cond)) return [`${path}: must be an object`];
  const groups = ["all", "any", "not"].filter((k) => cond[k] !== undefined);
  if (groups.length) {
    if (groups.length > 1 || Object.keys(cond).length > 1) return [`${path}: use only one of all, any, not`];
    const g = groups[0];
    if (g === "not") return checkCondition(cond.not, keys, ownKey, `${path}.not`);
    if (!Array.isArray(cond[g]) || cond[g].length === 0) return [`${path}.${g}: must be a non-empty list`];
    return cond[g].flatMap((c, i) => checkCondition(c, keys, ownKey, `${path}.${g}.${i}`));
  }
  const out = [];
  if (typeof cond.row !== "string" || !keys.includes(cond.row)) out.push(`${path}.row: must be the key of a row of this type`);
  else if (cond.row === ownKey) out.push(`${path}.row: a row cannot depend on itself`);
  const used = CONDITION_KEYS.filter((k) => cond[k] !== undefined);
  if (used.length !== 1) out.push(`${path}: use exactly one of ${CONDITION_KEYS.join(", ")}`);
  if (cond.tag !== undefined && !(typeof cond.tag === "string" && cond.tag.trim())) out.push(`${path}.tag: must be text`);
  if (cond.equals !== undefined && typeof cond.equals !== "string") out.push(`${path}.equals: must be text`);
  if (cond.in !== undefined && !(Array.isArray(cond.in) && cond.in.length > 0 && cond.in.every((v) => typeof v === "string"))) out.push(`${path}.in: must be a list of text`);
  if (cond.present !== undefined && typeof cond.present !== "boolean") out.push(`${path}.present: must be true or false`);
  return out;
}
