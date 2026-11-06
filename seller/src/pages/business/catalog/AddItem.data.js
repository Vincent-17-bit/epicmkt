import * as api from "../../../api/index.js";
import { fixtureProductTypes } from "./AddItem.fixtures.js";

// Where the picker gets product types from, and the pure rules it applies. No React in here.

// TODO(contract:A06) the seller api wrappers for seller_product_types and seller_request_type are not in api/ yet
// (docs/requests/2026-11-05-lane-b-to-lane-a-type-api-wrappers.md). Until then this reads them if they appear, and otherwise
// falls back to the fixtures in local dev and tests only.
const wrapper = (...names) => {
  for (const n of names) {
    try { if (typeof api[n] === "function") return api[n]; } catch { /* export not defined yet */ }
  }
  return null;
};
const typesFn = () => wrapper("sellerProductTypes", "seller_product_types");
const requestFn = () => wrapper("sellerRequestType", "seller_request_type");
const isProd = () => Boolean(import.meta.env?.PROD);

// True when "Add item" should open the picker first. Until the real types api exists, Add item opens the editor as it always did.
export const productTypesReady = () => typesFn() !== null;
// The picker page may also be opened directly in dev and tests, on fixtures.
export const pickerAvailable = () => productTypesReady() || !isProd();

const normalize = (raw, fallbackDepartments = []) => ({
  types: Array.isArray(raw) ? raw : raw?.types ?? [],
  departments: (!Array.isArray(raw) && raw?.departments) || fallbackDepartments,
});

export async function loadProductTypes({ categoryId } = {}) {
  const fn = typesFn();
  if (fn) return normalize(await fn()); // TODO(contract:A06) argument shape: the server knows the shop from the session
  if (isProd()) throw new Error("Product types are not available yet.");
  return normalize(fixtureProductTypes({ categoryId }));
}

export async function requestType({ name, note = "" }) {
  const fn = requestFn();
  if (fn) return fn(name, note);
  if (isProd()) throw new Error("Type requests are not available yet.");
  return { ok: true };
}

export const words = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

// The server already leaves out types a shop may not sell. This repeats the check so a stale cache can never show one.
// TODO(contract:A08) restrictedTo is assumed to hold shop category ids.
export const canSell = (type, categoryId) => !type.restrictedTo?.length || type.restrictedTo.includes(categoryId);
export const sellableTypes = (types, categoryId) => types.filter((t) => canSell(t, categoryId));

const deptName = (departments, id) => departments.find((d) => d.id === id)?.name ?? "";

// "Your shop usually sells": the types the shop used lately, then types suggested for its category. Never locked to the category.
export function suggestedTypes(types, { categoryId, recentIds = [], max = 6 } = {}) {
  const byId = new Map(types.map((t) => [t.id, t]));
  const picked = [];
  const add = (t) => { if (t && !picked.includes(t)) picked.push(t); };
  recentIds.forEach((id) => add(byId.get(id)));
  types.filter((t) => t.categoryIds?.includes(categoryId)).forEach(add);
  return picked.slice(0, max);
}

// Every typed word must start a word in the type's name or department: "bulb" finds "LED bulb", "a4 pap" finds "A4 paper".
export function searchTypes(types, departments, query) {
  const q = words(query);
  if (!q.length) return [];
  const hits = types.filter((t) => {
    const hay = words(`${t.name} ${deptName(departments, t.departmentId)}`);
    return q.every((w) => hay.some((h) => h.startsWith(w)));
  });
  const starts = (t) => (words(t.name)[0]?.startsWith(q[0]) ? 0 : 1);
  return hits.map((t, i) => ({ t, i })).sort((a, b) => starts(a.t) - starts(b.t) || a.i - b.i).map((x) => x.t);
}

export function groupByDepartment(types, departments) {
  const groups = departments.map((d) => ({ id: d.id, name: d.name, types: types.filter((t) => t.departmentId === d.id) }));
  const known = new Set(departments.map((d) => d.id));
  const loose = types.filter((t) => !known.has(t.departmentId));
  if (loose.length) groups.push({ id: "other", name: "More types", types: loose });
  return groups.filter((g) => g.types.length);
}

export const departmentOf = deptName;

// The types this shop used on its latest items, newest first. Items carry productTypeId once A06 is merged (Contract v1 item list).
export function recentTypeIds(items = []) {
  const stamp = (i) => String(i.updatedAt ?? i.createdAt ?? "");
  const ids = [];
  [...items].sort((a, b) => stamp(b).localeCompare(stamp(a))).forEach((i) => { if (i.productTypeId && !ids.includes(i.productTypeId)) ids.push(i.productTypeId); });
  return ids;
}
