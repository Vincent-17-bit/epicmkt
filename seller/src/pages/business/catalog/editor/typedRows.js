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
