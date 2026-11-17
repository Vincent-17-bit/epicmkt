import { INFO_TEMPLATES } from "./templates.js";

export { INFO_TEMPLATES };

export const INFO_PREFIX = "Info: ";

export const infoTemplateById = (id) => INFO_TEMPLATES.find((t) => t.id === id) ?? null;
export const infoGroupKey = (name) => `${INFO_PREFIX}${name}`;
export const isInfoGroup = (group) => typeof group === "string" && group.startsWith(INFO_PREFIX);
export const infoGroupName = (group) => (isInfoGroup(group) ? group.slice(INFO_PREFIX.length) : group);

export const infoTemplateOf = (specs) => {
  const used = new Set((Array.isArray(specs) ? specs : []).filter((s) => isInfoGroup(s?.group)).map((s) => s.group));
  if (!used.size) return null;
  return INFO_TEMPLATES.find((t) => t.groups.some((g) => used.has(infoGroupKey(g.name)))) ?? null;
};

export const plainSpecs = (specs) => (Array.isArray(specs) ? specs.filter((s) => !isInfoGroup(s?.group)) : []);

const filled = (v) => v !== undefined && v !== null && String(v).trim() !== "";

export function buildInfoGroups(specs) {
  const list = (Array.isArray(specs) ? specs : []).filter((s) => isInfoGroup(s?.group) && filled(s.label) && filled(s.value));
  if (!list.length) return [];
  const template = infoTemplateOf(list);
  const order = template ? template.groups.map((g) => g.name) : [];
  const names = [...new Set(list.map((s) => infoGroupName(s.group)))];
  names.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return names.map((name) => {
    const rowOrder = template?.groups.find((g) => g.name === name)?.rows.map((r) => r.label) ?? [];
    const rows = list
      .filter((s) => infoGroupName(s.group) === name)
      .map((s) => ({ label: s.label, value: String(s.value) }))
      .sort((a, b) => {
        const ia = rowOrder.indexOf(a.label);
        const ib = rowOrder.indexOf(b.label);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
    return { name, rows };
  });
}

const BOOL = { yes: "Yes", no: "No" };

export const infoValueText = (row, raw) => {
  if (!filled(raw)) return "";
  if (row.input === "number") return row.unit ? `${String(raw).trim()} ${row.unit}` : String(raw).trim();
  if (row.input === "boolean") return BOOL[String(raw).toLowerCase()] ?? String(raw);
  return String(raw).trim();
};

export const infoValueRaw = (row, stored) => {
  if (!filled(stored)) return "";
  const value = String(stored).trim();
  if (row.input === "number") return value.slice(0, row.unit && value.endsWith(row.unit) ? value.length - row.unit.length : value.length).trim();
  return value;
};

export const INFO_GROUP_LIMIT = 40;
