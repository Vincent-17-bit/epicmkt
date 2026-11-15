import { PRODUCT_TYPES, TYPE_DEPARTMENTS, TYPE_PLACEMENT, listScales } from "@epicmkt/shared";
import { ApiError } from "./errors.js";

// Mirrors migrations 0108 and 0126: admin_product_types_list, admin_save_product_type, admin_save_type_draft,
// admin_discard_type_draft and admin_publish_type_version.
const latency = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
const AXIS_DISPLAYS = ["swatch", "image-card", "button", "text-card", "dropdown"];
const KINDS = ["good", "service", "package"];
const QUANTITY_MODES = ["units", "measure", "none"];
const CATEGORIES = [
  { id: "phones-electronics", name: "Phones and electronics" },
  { id: "fashion-shoes", name: "Fashion and shoes" },
  { id: "liquor-store", name: "Liquor store" },
  { id: "supermarket-minimart", name: "Supermarket" },
];
const SIZE_CHARTS = [
  { id: "7a1c2d3e-0000-4000-8000-000000000001", name: "Women's shoes (EU)" },
  { id: "7a1c2d3e-0000-4000-8000-000000000002", name: "Men's shirts (collar)" },
  { id: "7a1c2d3e-0000-4000-8000-000000000003", name: "Mattress sizes (Kenya)" },
];

let types = [];
let drafts = new Map();     // type id -> { body, updatedAt }
let history = new Map();    // type id -> [{ version, publishedAt, note }]

const bodyOf = (t) => ({ name: t.name, kind: t.kind, departmentId: t.departmentId, categoryIds: [...t.categoryIds], restrictedTo: [...t.restrictedTo], quantityMode: t.quantityMode, sizeChartId: t.sizeChartId, axes: structuredClone(t.axes), active: t.active });

export function resetMockProductTypes() {
  const at = new Date("2026-10-01T09:00:00Z").toISOString();
  types = PRODUCT_TYPES.map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.group === "services" ? "service" : "good",
    departmentId: TYPE_PLACEMENT[t.id]?.department ?? null,
    categoryIds: [...(TYPE_PLACEMENT[t.id]?.categoryIds ?? [])],
    restrictedTo: [],
    quantityMode: t.unit ? "measure" : "units",
    sizeChartId: null,
    axes: structuredClone(t.axes ?? []),
    active: true,
    items: 0,
  }));
  drafts = new Map();
  history = new Map(types.map((t) => [t.id, [{ version: 1, publishedAt: at, note: "As it was before versions" }]]));
}
resetMockProductTypes();

const view = (t) => {
  const d = drafts.get(t.id);
  const h = history.get(t.id) ?? [];
  const last = h[h.length - 1];
  return { ...t, version: last?.version ?? null, publishedAt: last?.publishedAt ?? null, draft: d ? structuredClone(d.body) : null, draftUpdatedAt: d?.updatedAt ?? null };
};

export async function listTypeSettings() {
  await latency();
  const newDrafts = [...drafts].filter(([id]) => !types.some((t) => t.id === id)).map(([id, d]) => ({ id, draft: structuredClone(d.body), draftUpdatedAt: d.updatedAt }));
  return structuredClone({
    types: [...types].sort((a, b) => a.name.localeCompare(b.name)).map(view),
    newDrafts,
    departments: TYPE_DEPARTMENTS,
    categories: CATEGORIES,
    sizeCharts: SIZE_CHARTS,
  });
}

const SCALE_IDS = new Set(listScales().map((s) => s.id));
const axesOk = (axes) => Array.isArray(axes) && axes.length <= 3 && new Set(axes.map((a) => a.key)).size === axes.length
  && axes.every((a, i) => /^[a-z][a-z0-9_]{0,29}$/.test(a.key ?? "") && a.label?.trim() && a.label.length <= 40 && AXIS_DISPLAYS.includes(a.display)
    && (a.scale === undefined || a.scale === null || SCALE_IDS.has(a.scale))
    && (a.open === undefined || typeof a.open === "boolean" || /^[a-z][a-z-]{1,30}$/.test(a.open)) && (a.optional === undefined || typeof a.optional === "boolean")
    && (a.affectsPrice === undefined || a.affectsPrice === "auto" || typeof a.affectsPrice === "boolean")
    && (typeof a.dependsOn !== "string" || axes.slice(0, i).some((b) => b.key === a.dependsOn))
    && (a.suggested ?? []).every((s) => /^[a-z0-9][a-z0-9-]{0,39}$/.test(s.id ?? "") && s.label?.trim()));
const knownCategory = (c) => CATEGORIES.some((k) => k.id === c) || types.some((t) => t.categoryIds.includes(c));

// admin_check_product_type: validates and fills what the input leaves out from the live type (or the defaults).
function check(id, input) {
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(id)) throw new ApiError("invalid_type_id");
  const cur = types.find((t) => t.id === id);
  const name = (input.name ?? "").trim();
  if (!name || name.length > 60) throw new ApiError("invalid_type_name");
  if (input.departmentId && !TYPE_DEPARTMENTS.some((d) => d.id === input.departmentId)) throw new ApiError("invalid_department");
  if ((input.categoryIds ?? []).some((c) => !knownCategory(c))) throw new ApiError("invalid_categories");
  if (!axesOk(input.axes ?? [])) throw new ApiError("invalid_axes");
  const kind = input.kind || cur?.kind || "good";
  if (!KINDS.includes(kind)) throw new ApiError("invalid_kind");
  const quantityMode = input.quantityMode || cur?.quantityMode || "units";
  if (!QUANTITY_MODES.includes(quantityMode)) throw new ApiError("invalid_quantity_mode");
  const sizeChartId = "sizeChartId" in input ? input.sizeChartId || null : cur?.sizeChartId ?? null;
  if (sizeChartId && !SIZE_CHARTS.some((s) => s.id === sizeChartId)) throw new ApiError("invalid_size_chart");
  const restrictedTo = "restrictedTo" in input ? [...new Set(input.restrictedTo ?? [])].sort() : [...(cur?.restrictedTo ?? [])];
  if (!Array.isArray(input.restrictedTo ?? []) || restrictedTo.some((c) => !knownCategory(c))) throw new ApiError("invalid_restricted_to");
  return {
    name, kind, departmentId: input.departmentId ?? null, categoryIds: [...new Set(input.categoryIds ?? [])].sort(), restrictedTo, quantityMode, sizeChartId,
    axes: structuredClone(input.axes ?? []), active: input.active ?? cur?.active ?? true,
  };
}

function apply(id, body) {
  const at = types.findIndex((t) => t.id === id);
  if (at >= 0) types[at] = { ...types[at], ...body };
  else types.push({ id, ...body, items: 0 });
}

function record(id, note) {
  const h = history.get(id) ?? [];
  const version = (h[h.length - 1]?.version ?? 0) + 1;
  history.set(id, [...h, { version, publishedAt: new Date().toISOString(), note: note?.trim() || null }]);
  return version;
}

export async function saveTypeSettings(id, input) {
  await latency();
  const body = check(id, input);
  apply(id, body);
  record(id, null);
  return structuredClone(view(types.find((t) => t.id === id)));
}

export async function saveTypeDraft(id, input) {
  await latency();
  const body = check(id, input);
  const updatedAt = new Date().toISOString();
  drafts.set(id, { body, updatedAt });
  return structuredClone({ id, draft: body, draftUpdatedAt: updatedAt });
}

export async function discardTypeDraft(id) {
  await latency();
  if (!drafts.has(id)) throw new ApiError("no_draft");
  drafts.delete(id);
  return { id, draft: null };
}

export async function publishTypeVersion(id, note = null) {
  await latency();
  if (note && note.length > 200) throw new ApiError("invalid_note");
  const d = drafts.get(id);
  if (!d) throw new ApiError("no_draft");
  const body = check(id, d.body);
  apply(id, body);
  drafts.delete(id);
  const version = record(id, note);
  return structuredClone({ id, version, draft: null, ...body });
}

export const MOCK_SIZE_CHARTS = SIZE_CHARTS;
