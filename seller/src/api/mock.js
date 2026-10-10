import { passwordProblems, profileProblems, lockedProblem, pinValue, categoryChangeQuote, LIMITS, LOCKED_FIELDS } from "@epicmkt/shared";
import { ApiError } from "./errors.js";

const DEMO = { sellerId: "ES100001", password: "Demo-Passw0rd", phone: "+254712345678", name: "Demo Shop", plan: "standard", status: "live" };
const PREMIUM_DEMO = { sellerId: "ES100002", name: "Demo Premium Shop", plan: "premium" };
const OTP = "123456";
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const DAY = 86400000;

const CATEGORIES = [
  {
    id: "barber", name: "Barber", grp: "Beauty", plans: { standard: { price: 500 }, premium: { price: 1500 } },
    template: [
      { key: "walk_ins", label: "Accepts walk-ins", type: "boolean" },
      { key: "styles", label: "Styles offered", type: "multiselect", options: [{ value: "fade", label: "Fade" }, { value: "braids", label: "Braids" }, { value: "dye", label: "Dye" }, { value: "kids", label: "Kids cuts" }] },
      { key: "chairs", label: "Number of chairs", type: "number", unit: "chairs" },
      { key: "specialty", label: "Speciality", type: "text" },
    ],
  },
  {
    id: "salon", name: "Hair salon", grp: "Beauty", plans: { standard: { price: 800 }, premium: { price: 2000 } },
    template: [{ key: "appointments", label: "Booking", type: "select", options: [{ value: "walk_in", label: "Walk-ins only" }, { value: "booking", label: "Appointments only" }, { value: "both", label: "Both" }] }],
  },
  { id: "stall", name: "Market stall", grp: "Retail", plans: { standard: { price: 300 }, premium: { price: 900 } }, template: [{ key: "stall_no", label: "Stall number", type: "text" }] },
  { id: "restaurant", name: "Restaurant", grp: "Food", plans: { standard: { price: 1000 }, premium: { price: 2500 } }, template: [{ key: "cuisine", label: "Cuisine", type: "text" }] },
];

const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY).toISOString();

const demoBusiness = (demo = DEMO) => ({
  id: "b0000000-0000-4000-8000-000000000001",
  seller_id: demo.sellerId,
  slug: `${demo.name.toLowerCase().replace(/\s+/g, "-")}-${demo.sellerId.slice(2)}`,
  name: demo.name,
  category_id: "barber",
  plan_key: demo.plan,
  status: DEMO.status,
  verification_level: "verified",
  featured: demo.plan === "premium",
  paid_until: iso(12),
  tagline: null,
  description: null,
  phone: DEMO.phone,
  whatsapp: null,
  email: null,
  socials: {},
  amenities: [],
  payment_methods: [],
  delivery_area: null,
  county: "Kakamega",
  town: "Kakamega",
  address: null,
  lat: 0.2827,
  lng: 34.7519,
  pin: "A123456789B",
  licence: "SBP-2026-0001",
  licence_docs: [],
  logo_path: null,
  cover_path: null,
  tags: [],
  announcement: null,
  profile: {},
  created_at: iso(-90),
  updated_at: iso(-90),
});

const state = {
  password: DEMO.password,
  signedIn: false,
  failures: new Map(),
  changes: [],
  branches: [],
  urls: new Map(),
  business: demoBusiness(),
  priceConfirmedAt: null,
};

const wait = () => new Promise((r) => setTimeout(r, 120));

export const resetMock = () => {
  state.password = DEMO.password;
  state.signedIn = false;
  state.failures.clear();
  state.changes = [];
  state.branches = [];
  state.urls.clear();
  state.business = demoBusiness();
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
  const demo = key === DEMO.sellerId.toLowerCase() ? DEMO : key === PREMIUM_DEMO.sellerId.toLowerCase() ? PREMIUM_DEMO : null;
  if (demo && password === state.password) {
    state.failures.delete(key);
    state.signedIn = true;
    if (demo === PREMIUM_DEMO) state.business = demoBusiness(PREMIUM_DEMO);
    return { expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  }
  f.n = f.until && f.until <= Date.now() ? 1 : f.n + 1;
  f.until = f.n >= MAX_FAILURES ? Date.now() + LOCK_MS : 0;
  state.failures.set(key, f);
  if (f.until) throw new ApiError("locked", "Seller ID or password is incorrect.", { retryAfter: LOCK_MS / 1000 });
  throw new ApiError("invalid_credentials", "Seller ID or password is incorrect.");
};
export const logout = async () => { state.signedIn = false; };
export const hasSession = async () => state.signedIn;
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

export const getMyBusiness = async () => { signedIn(); await wait(); return structuredClone(state.business); };
export const listCategories = async () => { signedIn(); await wait(); return structuredClone(CATEGORIES); };

const ownsPath = (path) => typeof path === "string" && path.startsWith(`${state.business.id}/`) && !path.includes("..");

export const updateProfile = async (patch) => {
  signedIn();
  await wait();
  const allowed = ["tagline", "description", "whatsapp", "email", "socials", "amenities", "payment_methods", "delivery_area", "address", "logo_path", "cover_path", "tags", "announcement", "profile"];
  const bad = Object.keys(patch).find((k) => !allowed.includes(k));
  if (bad) throw new ApiError("field_not_allowed", `field_not_allowed:${bad}`);
  if ("announcement" in patch && patch.announcement && state.business.plan_key !== "premium") throw new ApiError("premium_only");
  const problem = Object.keys(profileProblems(patch, { plan: state.business.plan_key }))[0];
  if (problem) throw new ApiError(`invalid_${problem}`);
  for (const k of ["logo_path", "cover_path"]) if (patch[k] && !ownsPath(patch[k])) throw new ApiError(`invalid_${k}`);
  if (patch.profile?.shopfront_path && !ownsPath(patch.profile.shopfront_path)) throw new ApiError("invalid_shopfront_path");
  const next = { ...patch };
  if ("whatsapp" in next) next.whatsapp = next.whatsapp ? `+254${String(next.whatsapp).replace(/\D/g, "").slice(-9)}` : null;
  for (const k of ["tagline", "description", "email", "delivery_area", "address", "announcement"]) if (k in next) next[k] = String(next[k] ?? "").trim() || null;
  Object.assign(state.business, next, { updated_at: new Date().toISOString() });
  return structuredClone(state.business);
};

const businessValue = (field) => {
  const b = state.business;
  if (field === "location") return b.lat == null ? null : pinValue(b.lat, b.lng);
  if (field === "licence_docs") return JSON.stringify(b.licence_docs);
  return b[field] == null ? null : String(b[field]);
};

export const requestChange = async (field, value) => {
  signedIn();
  await wait();
  if (!LOCKED_FIELDS.includes(field) && field !== "pin") throw new ApiError("field_not_allowed");
  if (field !== "pin" && lockedProblem(field, value)) throw new ApiError(`invalid_${field}`);
  let next = String(value).trim();
  let quote = null;
  if (field === "phone") next = `+254${next.replace(/\D/g, "").slice(-9)}`;
  if (field === "category_id") {
    const from = CATEGORIES.find((c) => c.id === state.business.category_id);
    const to = CATEGORIES.find((c) => c.id === next);
    if (!to) throw new ApiError("invalid_category");
    const plan = state.business.plan_key;
    quote = categoryChangeQuote({ oldPrice: from.plans[plan].price, newPrice: to.plans[plan].price, paidUntil: state.business.paid_until }).extraDueNow;
  }
  if (field === "location") {
    const [lat, lng] = next.split(",").map(Number);
    next = pinValue(lat, lng);
  }
  const old = businessValue(field);
  if (old === next) throw new ApiError("no_change");
  if (state.changes.some((c) => c.field === field && c.status === "pending")) throw new ApiError("change_already_pending");
  const row = { id: `c${state.changes.length + 1}`, field, old_value: old, new_value: next, quote_kes: quote, status: "pending", decided_at: null, created_at: new Date().toISOString() };
  state.changes.unshift(row);
  return { ...row };
};
export const cancelChange = async (id) => {
  signedIn();
  await wait();
  const row = state.changes.find((c) => c.id === id && c.status === "pending");
  if (!row) throw new ApiError("not_found_or_not_pending");
  row.status = "cancelled";
  row.decided_at = new Date().toISOString();
  return { ...row };
};
export const listChanges = async () => { signedIn(); await wait(); return state.changes.map((c) => ({ ...c })); };

export const listBranches = async () => { signedIn(); await wait(); return state.branches.map((b) => ({ ...b })); };
export const saveBranch = async (branch) => {
  signedIn();
  await wait();
  const name = String(branch.name ?? "").trim();
  if (name.length < 2 || name.length > 80) throw new ApiError("invalid_name");
  if (branch.phone && !/^(\+?254|0)[71]\d{8}$/.test(String(branch.phone).replace(/[ ()\-.]/g, ""))) throw new ApiError("invalid_phone");
  const phone = branch.phone ? `+254${String(branch.phone).replace(/\D/g, "").slice(-9)}` : null;
  const fields = { name, address: branch.address ?? null, town: branch.town ?? null, lat: branch.lat ?? null, lng: branch.lng ?? null, phone, hours: branch.hours ?? {}, sort: branch.sort ?? 0 };
  if (branch.id) {
    const row = state.branches.find((b) => b.id === branch.id);
    if (!row) throw new ApiError("not_found");
    Object.assign(row, fields, { updated_at: new Date().toISOString() });
    return { ...row };
  }
  if (state.business.plan_key !== "premium") throw new ApiError("premium_only");
  if (state.branches.length >= LIMITS.branches) throw new ApiError("limit_reached");
  const now = new Date().toISOString();
  const row = { id: `br${Date.now()}${state.branches.length}`, business_id: state.business.id, ...fields, created_at: now, updated_at: now };
  state.branches.push(row);
  return { ...row };
};
export const deleteBranch = async (id) => {
  signedIn();
  await wait();
  state.branches = state.branches.filter((b) => b.id !== id);
};

export const uploadMedia = async ({ businessId, kind, blob }) => {
  signedIn();
  await wait();
  const path = `${businessId}/profile/${kind}-${Date.now()}.webp`;
  try { state.urls.set(path, URL.createObjectURL(blob)); } catch { state.urls.set(path, null); }
  return path;
};
export const uploadDoc = async ({ businessId, file }) => {
  signedIn();
  await wait();
  return `${businessId}/licence/${Date.now()}-${String(file.name).toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`;
};
export const mediaUrl = (path) => (path ? state.urls.get(path) ?? null : null);

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
