// Demo data for the open values review (migration 0090). Local development only; it follows the same rules as the database functions.
import { normalizeValueKey, validateOpenValue } from "@epicmkt/shared";
import { ApiError } from "./errors.js";

const latency = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();

let rows = [];
let links = [];   // { itemId, valueId }
let seq = 0;

export function resetMockValues() {
  seq = 0;
  const make = (kind, label, status, extra = {}) => ({ id: `ov-${++seq}`, kind, key: normalizeValueKey(label), label, status, hex: null, tags: [], mergedInto: null, createdByBusiness: "b-1", createdAt: ago(10 - seq), reviewedAt: null, ...extra });
  rows = [
    make("material", "Mahogany", "approved", { tags: ["wood"], reviewedAt: ago(5) }),
    make("material", "Mahogany veneer", "pending"),
    make("material", "Rose gold", "pending", { tags: ["precious-metal"] }),
    make("brand", "Samsung", "approved", { reviewedAt: ago(8) }),
    make("brand", "Samsng", "pending"),
    make("color", "Wine red", "pending", { hex: "#7b1e3a" }),
    make("color", "Sand", "approved", { reviewedAt: ago(3) }),
  ];
  links = [
    { itemId: "i-1", valueId: "ov-2" }, { itemId: "i-2", valueId: "ov-2" }, { itemId: "i-3", valueId: "ov-1" },
    { itemId: "i-4", valueId: "ov-5" }, { itemId: "i-5", valueId: "ov-4" }, { itemId: "i-6", valueId: "ov-4" },
  ];
}
resetMockValues();

const view = (v) => ({ id: v.id, kind: v.kind, label: v.label, key: v.key, status: v.status, hex: v.hex, tags: [...v.tags], uses: new Set(links.filter((l) => l.valueId === v.id).map((l) => l.itemId)).size, mergedInto: v.mergedInto, createdAt: v.createdAt, reviewedAt: v.reviewedAt });
const need = (id) => { const v = rows.find((r) => r.id === id); if (!v) throw new ApiError("value_not_found"); return v; };
const live = (id) => { const v = need(id); if (v.status === "merged") throw new ApiError("value_merged"); return v; };

export async function listOptionValues({ status = null, kind = null, query = "", limit = 50, offset = 0 } = {}) {
  await latency();
  const key = normalizeValueKey(query);
  const hit = rows.filter((v) => (!status || v.status === status) && (!kind || v.kind === kind) && (!key || v.key.includes(key)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.label.localeCompare(b.label));
  return { total: hit.length, values: hit.slice(offset, offset + Math.min(Math.max(limit, 1), 200)).map(view) };
}

export async function updateOptionValue(id, fields = {}) {
  await latency();
  const v = live(id);
  if ("tags" in fields) {
    const r = validateOpenValue({ kind: v.kind, label: v.label, tags: fields.tags });
    if (!r.ok) throw new ApiError(r.error.code === "too_many_tags" ? "invalid_tags" : "invalid_tags");
    v.tags = r.value.tags.sort();
  }
  if ("hex" in fields) {
    const r = validateOpenValue({ kind: v.kind, label: v.label, hex: fields.hex });
    if (!r.ok) throw new ApiError("invalid_hex");
    v.hex = r.value.hex;
  }
  return view(v);
}

export async function approveOptionValue(id, fields = null) {
  await latency();
  const v = live(id);
  if (fields) await updateOptionValue(id, fields);
  v.status = "approved";
  v.reviewedAt = new Date().toISOString();
  return view(v);
}

export async function renameOptionValue(id, label) {
  await latency();
  const v = live(id);
  const r = validateOpenValue({ kind: v.kind, label });
  if (!r.ok) throw new ApiError(r.error.code === "label_too_long" ? "label_too_long" : "invalid_label");
  if (rows.some((x) => x.id !== id && x.kind === v.kind && x.key === r.value.key && x.status !== "merged")) throw new ApiError("value_exists");
  v.label = r.value.label;
  v.key = r.value.key;
  return { ...view(v), itemsUpdated: new Set(links.filter((l) => l.valueId === id).map((l) => l.itemId)).size };
}

export async function mergeOptionValue(from, into) {
  await latency();
  const a = need(from);
  let b = need(into);
  if (b.status === "merged") b = need(b.mergedInto);
  if (a.status === "merged") throw new ApiError("value_merged");
  if (a.id === b.id) throw new ApiError("same_value");
  if (a.kind !== b.kind) throw new ApiError("kind_mismatch");
  const moved = new Set(links.filter((l) => l.valueId === a.id).map((l) => l.itemId));
  links = links.filter((l) => l.valueId !== a.id || !links.some((o) => o.itemId === l.itemId && o.valueId === b.id)).map((l) => (l.valueId === a.id ? { ...l, valueId: b.id } : l));
  a.status = "merged";
  a.mergedInto = b.id;
  rows.filter((x) => x.mergedInto === a.id).forEach((x) => { x.mergedInto = b.id; });
  b.tags = [...new Set([...b.tags, ...a.tags])].sort();
  b.hex = b.hex ?? a.hex;
  return { ...view(b), itemsUpdated: moved.size, mergedFrom: a.id };
}
