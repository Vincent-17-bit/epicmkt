import { passwordProblems } from "@epicmkt/shared";
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

export const resetMock = () => {
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
  return { total: 0, visible: 0, hidden: 0, hidden_by_admin: 0, out_of_stock: 0, limited_stock: 0, unavailable: 0, without_photo: 0, stale_prices: 0, items_limit: 20, open_flags: 0, unread_messages: 0 };
};
export const itemSignals = async () => { signedIn(); await wait(); return []; };
export const finalizeMedia = async () => { signedIn(); throw new ApiError("not_implemented"); };
export const exportData = async () => { signedIn(); await wait(); return { business: { ...state.business } }; };
