import { SPEC_DEFAULT_GROUP, normalizeValueKey, resolveRows } from "@epicmkt/shared";

export const LEVEL_TEXT = { required: "required", recommended: "recommended", optional: "optional" };

const ORDER = { required: 0, recommended: 1, optional: 2 };

export const hasTemplate = (type) => Array.isArray(type?.specRows) && type.specRows.length > 0;

const itemOf = (form) => ({ specs: form.specs ?? [], brand: form.brand, packSize: form.packSize, includes: form.includes ?? [], axes: form.options?.axes ?? [] });

export function rowsOf(form, type) {
  const rows = hasTemplate(type) ? resolveRows(itemOf(form), type.specRows) : [];
  return {
    required: rows.filter((r) => r.level === "required"),
    extra: rows.filter((r) => r.level !== "required").sort((a, b) => ORDER[a.level] - ORDER[b.level])
  };
}

export const ownValue = (form, row) => {
  const key = normalizeValueKey(row.label);
  const hit = (form.specs ?? []).find((s) => normalizeValueKey(s.label) === key);
  return hit ? String(hit.value ?? "") : "";
};

export function withRow(form, row, value) {
  const key = normalizeValueKey(row.label);
  const specs = form.specs ?? [];
  const at = specs.findIndex((s) => normalizeValueKey(s.label) === key);
  if (value === "") return at === -1 ? specs : specs.filter((_, i) => i !== at);
  if (at !== -1) return specs.map((s, i) => (i === at ? { ...s, value } : s));
  return [...specs, { group: SPEC_DEFAULT_GROUP, label: row.label, value }];
}

const KINDS = [[/brand/, "brand"], [/colo(u)?r/, "color"], [/finish/, "finish"], [/flavo(u)?r/, "flavour"], [/material/, "material"]];

export const valueKindOf = (row) => {
  const hit = KINDS.find(([re]) => re.test(row.key));
  return hit ? hit[1] : null;
};

export function valueOf(form, row) {
  const text = ownValue(form, row);
  if (!text) return null;
  const stored = form.specValues?.[row.key];
  if (stored && stored.label === text) return stored;
  return { id: null, kind: valueKindOf(row), label: text, key: normalizeValueKey(text), status: "approved", hex: null, tags: [] };
}

export function withValue(form, row, value) {
  const rest = { ...form.specValues };
  delete rest[row.key];
  return { specs: withRow(form, row, value?.label ?? ""), specValues: value ? { ...rest, [row.key]: value } : rest };
}

export const specLinks = (form) => {
  const ids = Object.values(form.specValues ?? {}).map((v) => v?.id).filter(Boolean);
  return [...new Set(ids)].map((valueId) => ({ slot: "spec", valueId }));
};
