import { PRODUCT_TYPES, TYPE_DEPARTMENTS, TYPE_PLACEMENT } from "@epicmkt/shared";
import { ApiError } from "./errors.js";

const latency = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
const AXIS_DISPLAYS = ["swatch", "image-card", "button", "text-card", "dropdown"];
const CATEGORIES = [
  { id: "phones-electronics", name: "Phones and electronics" },
  { id: "fashion-shoes", name: "Fashion and shoes" },
  { id: "liquor-store", name: "Liquor store" },
  { id: "supermarket-minimart", name: "Supermarket" },
];

let types = [];

export function resetMockProductTypes() {
  types = PRODUCT_TYPES.map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.group === "services" ? "service" : "good",
    departmentId: TYPE_PLACEMENT[t.id]?.department ?? null,
    categoryIds: [...(TYPE_PLACEMENT[t.id]?.categoryIds ?? [])],
    axes: structuredClone(t.axes ?? []),
    active: true,
    items: 0,
  }));
}
resetMockProductTypes();

export async function listTypeSettings() {
  await latency();
  return structuredClone({ types: [...types].sort((a, b) => a.name.localeCompare(b.name)), departments: TYPE_DEPARTMENTS, categories: CATEGORIES });
}

const axesOk = (axes) => Array.isArray(axes) && axes.length <= 3 && new Set(axes.map((a) => a.key)).size === axes.length
  && axes.every((a) => /^[a-z][a-z0-9_]{0,29}$/.test(a.key ?? "") && a.label?.trim() && a.label.length <= 40 && AXIS_DISPLAYS.includes(a.display)
    && (a.suggested ?? []).every((s) => /^[a-z0-9][a-z0-9-]{0,39}$/.test(s.id ?? "") && s.label?.trim()));

export async function saveTypeSettings(id, input) {
  await latency();
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(id)) throw new ApiError("invalid_type_id");
  const name = (input.name ?? "").trim();
  if (!name || name.length > 60) throw new ApiError("invalid_type_name");
  if (input.departmentId && !TYPE_DEPARTMENTS.some((d) => d.id === input.departmentId)) throw new ApiError("invalid_department");
  if ((input.categoryIds ?? []).some((c) => !CATEGORIES.some((k) => k.id === c) && !types.some((t) => t.categoryIds.includes(c)))) throw new ApiError("invalid_categories");
  if (!axesOk(input.axes ?? [])) throw new ApiError("invalid_axes");
  const next = { id, name, kind: "good", departmentId: input.departmentId ?? null, categoryIds: [...new Set(input.categoryIds ?? [])], axes: structuredClone(input.axes ?? []), active: input.active ?? true, items: 0 };
  const at = types.findIndex((t) => t.id === id);
  if (at >= 0) types[at] = { ...types[at], ...next, kind: types[at].kind, items: types[at].items };
  else types.push(next);
  return structuredClone(types.find((t) => t.id === id));
}
