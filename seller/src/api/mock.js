import { passwordProblems, rowToItem, itemToRow, withStockRules, newId } from "@epicmkt/shared";
import * as backend from "@epicmkt/backend";
import { validateItem } from "../catalog/schema.js";
import { ApiError } from "./errors.js";

const DEMO = { sellerId: "ES100001", password: "Demo-Passw0rd", phone: "+254712345678", name: "Demo Shop", plan: "standard", status: "live" };
const OTP = "123456";
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

const state = {
  password: DEMO.password,
  signedIn: false,
  failures: new Map(),
  changes: [],
  business: { name: DEMO.name, plan_key: DEMO.plan, status: DEMO.status, tagline: null },
  priceConfirmedAt: null,
};

const wait = () => new Promise((r) => setTimeout(r, 120));

const catalog = { items: [], history: [], settings: { sections: [], units: [] }, limit: 25, categoryId: "salons" };

export const resetMock = () => {
  Object.assign(catalog, { items: [], history: [], settings: { sections: [], units: [] }, limit: 25, categoryId: "salons" });
  state.password = DEMO.password;
  state.signedIn = false;
  state.failures.clear();
  state.changes = [];
  state.business = { name: DEMO.name, plan_key: DEMO.plan, status: DEMO.status, tagline: null };
  state.priceConfirmedAt = null;
};

const signedIn = () => {
  if (!state.signedIn) throw new ApiError("unauthorized");
};

export const login = async (sellerId, password) => {
  await wait();
  const key = String(sellerId).trim().toLowerCase();
  const f = state.failures.get(key) ?? { n: 0, until: 0 };
  if (f.until > Date.now()) throw new ApiError("locked", "Seller ID or password is incorrect.", { retryAfter: Math.ceil((f.until - Date.now()) / 1000) });
  if (key === DEMO.sellerId.toLowerCase() && password === state.password) {
    state.failures.delete(key);
    state.signedIn = true;
    return { expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  }
  f.n = f.until && f.until <= Date.now() ? 1 : f.n + 1;
  f.until = f.n >= MAX_FAILURES ? Date.now() + LOCK_MS : 0;
  state.failures.set(key, f);
  if (f.until) throw new ApiError("locked", "Seller ID or password is incorrect.", { retryAfter: LOCK_MS / 1000 });
  throw new ApiError("invalid_credentials", "Seller ID or password is incorrect.");
};
export const logout = async () => { state.signedIn = false; };
export const forgotRequest = async () => { await wait(); return { ok: true }; };
export const forgotVerify = async ({ sellerId, code, newPassword }) => {
  await wait();
  const problems = passwordProblems(newPassword, { sellerId, phone: DEMO.phone });
  if (problems.length) throw new ApiError("weak_password", undefined, { problems });
  if (String(sellerId).toUpperCase() !== DEMO.sellerId || code !== OTP) throw new ApiError("invalid_code", "That code is not valid or has expired.");
  state.password = newPassword;
  return { ok: true };
};
export const requestOtp = async () => { signedIn(); await wait(); return { ok: true, sentTo: "+2547*****678" }; };
export const changePassword = async ({ code, newPassword }) => {
  signedIn();
  await wait();
  const problems = passwordProblems(newPassword, { sellerId: DEMO.sellerId, phone: DEMO.phone });
  if (problems.length) throw new ApiError("weak_password", undefined, { problems });
  if (code !== OTP) throw new ApiError("invalid_code", "That code is not valid or has expired.");
  state.password = newPassword;
  return { ok: true };
};
export const updateProfile = async (patch) => {
  signedIn();
  await wait();
  const allowed = ["tagline", "description", "whatsapp", "email", "socials", "amenities", "payment_methods", "delivery_area", "address", "logo_path", "cover_path", "tags", "announcement", "profile"];
  const bad = Object.keys(patch).find((k) => !allowed.includes(k));
  if (bad) throw new ApiError("field_not_allowed", `field_not_allowed:${bad}`);
  if ("announcement" in patch && patch.announcement && state.business.plan_key !== "premium") throw new ApiError("premium_only");
  Object.assign(state.business, patch);
  return { ...state.business };
};
export const requestChange = async (field, value) => {
  signedIn();
  await wait();
  if (!["name", "category_id", "phone", "town", "pin", "licence"].includes(field)) throw new ApiError("field_not_allowed");
  if (state.changes.some((c) => c.field === field && c.status === "pending")) throw new ApiError("change_already_pending");
  const row = { id: `c${state.changes.length + 1}`, field, new_value: String(value), status: "pending", created_at: new Date().toISOString() };
  state.changes.unshift(row);
  return row;
};
export const cancelChange = async (id) => {
  signedIn();
  await wait();
  const row = state.changes.find((c) => c.id === id && c.status === "pending");
  if (!row) throw new ApiError("not_found_or_not_pending");
  row.status = "cancelled";
  return { ...row };
};
export const listChanges = async () => { signedIn(); await wait(); return state.changes.map((c) => ({ ...c })); };
export const confirmPrices = async () => { signedIn(); await wait(); state.priceConfirmedAt = new Date().toISOString(); return 0; };
export const replyFlag = async () => { signedIn(); throw new ApiError("not_found_or_not_open"); };
export const markRead = async () => { signedIn(); await wait(); return 0; };
export const pauseListing = async (pause) => {
  signedIn();
  await wait();
  const from = pause ? "live" : "paused";
  if (state.business.status !== from) throw new ApiError("invalid_status");
  state.business.status = pause ? "paused" : "live";
  return state.business.status;
};
export const requestDeletion = async (name) => {
  signedIn();
  await wait();
  if (String(name).trim().toLowerCase() !== state.business.name.toLowerCase()) throw new ApiError("name_mismatch");
  state.business.status = "deleted";
};
export const catalogStats = async () => {
  signedIn();
  await wait();
  const n = (f) => catalog.items.filter(f).length;
  return {
    total: catalog.items.length,
    visible: n((i) => i.visible && !i.hidden_by_admin),
    hidden: n((i) => !i.visible),
    hidden_by_admin: n((i) => i.hidden_by_admin),
    out_of_stock: n((i) => i.availability === "out_of_stock"),
    limited_stock: n((i) => i.availability === "limited_stock"),
    unavailable: n((i) => i.availability === "unavailable"),
    without_photo: catalog.items.length,
    stale_prices: 0,
    items_limit: catalog.limit,
    open_flags: 0,
    unread_messages: 0,
  };
};
export const itemSignals = async () => { signedIn(); await wait(); return []; };
export const finalizeMedia = async () => { signedIn(); throw new ApiError("not_implemented"); };
export const exportData = async () => { signedIn(); await wait(); return { business: { ...state.business } }; };

// ---- Catalog (S1). The mock plays the database: same stock rules, same checks, same limit error. ----

export const setMockLimit = (limit) => { catalog.limit = limit; };
export const setMockCategory = (id) => { catalog.categoryId = id; };
// Test helper: writes attributes straight into a stored row, the way rows saved before item templates existed look.
export const seedLegacyAttributes = (id, attributes) => { const row = catalog.items.find((r) => r.id === id); if (row) row.attributes = attributes; };
export const mockItemRows = () => catalog.items.map((r) => ({ ...r }));

const TRACKED = [["name", "name"], ["price", "price"], ["price_max", "price_max"], ["price_type", "price_type"], ["unit", "unit"], ["sale_price", "sale_price"], ["availability", "availability"], ["stock_count", "stock_count"], ["visible", "visible"]];

const itemFieldsOfCategory = async () => {
  const cats = await backend.getCategories();
  return cats.find((c) => c.id === catalog.categoryId)?.itemFields ?? [];
};

const checked = async (item) => {
  const { ok, errors } = validateItem(item, { fields: await itemFieldsOfCategory() });
  if (!ok) throw new ApiError("invalid_value", Object.values(errors)[0], { problems: errors });
};

const stamp = (row) => ({ ...row, availability: withStockRules(rowToItem(row)).availability });

export const getCatalogContext = async () => {
  signedIn();
  await wait();
  const cats = await backend.getCategories();
  const cat = cats.find((c) => c.id === catalog.categoryId) ?? cats[0];
  return {
    business: { id: "mock-business", name: state.business.name, categoryId: cat.id, planKey: state.business.plan_key, status: state.business.status },
    category: { id: cat.id, name: cat.name, itemFields: cat.itemFields ?? [] },
    itemsLimit: catalog.limit,
  };
};

export const listItems = async () => {
  signedIn();
  await wait();
  return [...catalog.items].sort((a, b) => a.sort - b.sort).map(rowToItem);
};

export const createItem = async (item) => {
  signedIn();
  await wait();
  await checked(item);
  if (catalog.items.some((r) => r.id === item.id)) throw new ApiError("already_exists");
  if (catalog.limit != null && catalog.items.length >= catalog.limit) throw new ApiError("item_limit_reached", "You have reached the item limit for your plan.");
  const now = new Date().toISOString();
  const row = stamp({ ...itemToRow(item), id: item.id ?? newId(), hidden_by_admin: false, admin_hide_reason: null, removed_by_admin: false, price_confirmed_at: now, created_at: now, updated_at: now });
  catalog.items.push(row);
  return rowToItem(row);
};

export const updateItem = async (id, item) => {
  signedIn();
  await wait();
  const index = catalog.items.findIndex((r) => r.id === id);
  if (index < 0) throw new ApiError("not_found");
  await checked(item);
  const old = catalog.items[index];
  const next = stamp({ ...old, ...itemToRow(item), updated_at: new Date().toISOString() });
  if ([old.price, old.price_max, old.price_type, old.sale_price].join("|") !== [next.price, next.price_max, next.price_type, next.sale_price].join("|")) next.price_confirmed_at = next.updated_at;
  for (const [field, key] of TRACKED) {
    if (old[key] !== next[key]) catalog.history.unshift({ id: catalog.history.length + 1, item_id: id, business_id: "mock-business", field, old_value: old[key] == null ? null : String(old[key]), new_value: next[key] == null ? null : String(next[key]), actor_role: "seller", created_at: next.updated_at });
  }
  catalog.items[index] = next;
  return rowToItem(next);
};

export const deleteItem = async (id) => {
  signedIn();
  await wait();
  catalog.items = catalog.items.filter((r) => r.id !== id);
};

export const restoreItem = (item) => createItem(item);

export const reorderItems = async (order) => {
  signedIn();
  await wait();
  for (const { id, sort } of order) {
    const row = catalog.items.find((r) => r.id === id);
    if (row) row.sort = sort;
  }
};

export const getCatalogSettings = async () => { signedIn(); await wait(); return structuredClone(catalog.settings); };
export const saveCatalogSettings = async (patch) => { signedIn(); await wait(); Object.assign(catalog.settings, patch); return structuredClone(catalog.settings); };

export const listItemHistory = async ({ itemId, limit = 100 } = {}) => {
  signedIn();
  await wait();
  return catalog.history.filter((h) => !itemId || h.item_id === itemId).slice(0, limit).map((h) => ({ ...h }));
};
