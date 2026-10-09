import { passwordProblems } from "@epicmkt/shared";
import { ApiError } from "./errors.js";

export const DEMO_PASSWORD = "Demo-Passw0rd";
const OTP = "123456";
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const SENDS_PER_HOUR = 5;
const DAY = 86400000;
const STORE_KEY = "epicmkt-seller-mock";

const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();

const seed = () => ({
  ES100001: { phone: "+254712345678", name: "Fade Kings Barbershop", plan: "standard", status: "live", paid_until: iso(20), stage: "live", outcome: null, reason: null, mustChange: false },
  ES100002: { phone: "+254722345678", name: "Lakeside Chemist", plan: "premium", status: "live", paid_until: iso(5), stage: "live", outcome: null, reason: null, mustChange: false },
  ES100003: { phone: "+254733345678", name: "Green Acres Agrovet", plan: "standard", status: "live", paid_until: iso(30), stage: "live", outcome: null, reason: null, mustChange: true },
  ES100004: { phone: "+254744345678", name: "Pwani Water Refill", plan: "standard", status: "live", paid_until: iso(-1), stage: "live", outcome: null, reason: null, mustChange: false },
  ES100005: { phone: "+254755345678", name: "Tembo Gym", plan: "premium", status: "live", paid_until: iso(-9), stage: "live", outcome: null, reason: null, mustChange: false },
  ES100006: { phone: "+254766345678", name: "Mama Njeri Salon", plan: "standard", status: "paused", paid_until: iso(14), stage: "live", outcome: null, reason: null, mustChange: false },
  ES100007: { phone: "+254777345678", name: "Quick Print Hub", plan: "standard", status: "suspended", paid_until: iso(14), stage: "live", outcome: null, reason: "Reported for misleading prices. Contact support to appeal.", mustChange: false },
  ES100008: { phone: "+254788345678", name: "Savanna Cafe", plan: "premium", status: "pending", paid_until: null, stage: "paid", outcome: null, reason: null, mustChange: false },
  ES100009: { phone: "+254799345678", name: "Old Town Tailors", plan: "standard", status: "deleted", paid_until: iso(-40), stage: "live", outcome: null, reason: null, mustChange: false }
});

const profileFor = (id) => ({
  ES100001: { tagline: "Sharp cuts, fair prices", description: "Walk-ins welcome.", whatsapp: "+254712345678", town: "Kisumu", county: "Kisumu", lat: -0.0917, lng: 34.768, hours: { mon: ["08:00", "19:00"] }, logo_path: "l", cover_path: "c", payment_methods: ["mpesa"], socials: {}, category: "Barbershops" },
  ES100002: { tagline: "Your neighbourhood pharmacy", description: "Open late.", whatsapp: "+254722345678", town: "Nakuru", county: "Nakuru", lat: -0.3031, lng: 36.08, hours: { mon: ["07:00", "21:00"] }, logo_path: "l", cover_path: "c", payment_methods: ["mpesa", "cash"], socials: { instagram: "lakesidechemist" }, category: "Chemists" }
}[id] ?? { tagline: null, description: null, whatsapp: null, town: "Mombasa", county: "Mombasa", lat: -4.0435, lng: 39.6682, hours: {}, logo_path: null, cover_path: null, payment_methods: [], socials: {}, category: "Shops" });

const data = {
  ES100001: { catalog: { total: 12, visible: 11, hidden: 1, hidden_by_admin: 0, out_of_stock: 2, limited_stock: 1, unavailable: 0, without_photo: 3, stale_prices: 4, items_limit: 20, open_flags: 0, unread_messages: 0 }, usage: { gallery: 2, faqs: 1, offers: 1, flash: 0 } },
  ES100002: { catalog: { total: 40, visible: 40, hidden: 0, hidden_by_admin: 0, out_of_stock: 0, limited_stock: 3, unavailable: 0, without_photo: 0, stale_prices: 0, items_limit: 100, open_flags: 1, unread_messages: 1 }, usage: { gallery: 8, faqs: 6, offers: 2, flash: 1 } }
};

const LIMITS = { standard: { gallery: 3, faqs: 5, offers: 2, flash: 0 }, premium: { gallery: 12, faqs: 20, offers: 10, flash: 4 } };

const emptyCatalog = (limit) => ({ total: 0, visible: 0, hidden: 0, hidden_by_admin: 0, out_of_stock: 0, limited_stock: 0, unavailable: 0, without_photo: 0, stale_prices: 0, items_limit: limit, open_flags: 0, unread_messages: 0 });

const state = {
  sellers: seed(),
  current: null,
  passwords: {},
  failures: new Map(),
  otps: new Map(),
  sends: new Map(),
  changes: [],
  patches: {},
  read: new Set(),
  priceConfirmedAt: null
};

const persist = () => {
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ sellers: state.sellers, current: state.current, read: [...state.read], patches: state.patches }));
  } catch {
    return;
  }
};

const restore = () => {
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.sellers = saved.sellers ?? state.sellers;
    state.current = saved.current ?? null;
    state.read = new Set(saved.read ?? []);
    state.patches = saved.patches ?? {};
  } catch {
    return;
  }
};

restore();

const wait = () => new Promise((r) => setTimeout(r, 120));
const me_ = () => state.sellers[state.current];

export const resetMock = () => {
  state.sellers = seed();
  state.current = null;
  state.passwords = {};
  state.failures.clear();
  state.otps.clear();
  state.sends.clear();
  state.changes = [];
  state.patches = {};
  state.read = new Set();
  state.priceConfirmedAt = null;
  persist();
};

const signedIn = () => {
  if (!state.current || !me_() || me_().status === "deleted") throw new ApiError("unauthorized");
};

const passwordOf = (id) => state.passwords[id] ?? DEMO_PASSWORD;

export const login = async (sellerId, password) => {
  await wait();
  const id = String(sellerId).trim().toUpperCase();
  const key = id.toLowerCase();
  const f = state.failures.get(key) ?? { n: 0, until: 0 };
  if (f.until > Date.now()) throw new ApiError("locked", "Seller ID or password is incorrect.", { retryAfter: Math.ceil((f.until - Date.now()) / 1000) });
  const seller = state.sellers[id];
  if (seller && password === passwordOf(id)) {
    if (seller.status === "deleted") throw new ApiError("deleted", "This business has been deleted. Contact support if you think this is a mistake.");
    state.failures.delete(key);
    state.current = id;
    persist();
    return { expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  }
  f.n = f.until && f.until <= Date.now() ? 1 : f.n + 1;
  f.until = f.n >= MAX_FAILURES ? Date.now() + LOCK_MS : 0;
  state.failures.set(key, f);
  if (f.until) throw new ApiError("locked", "Seller ID or password is incorrect.", { retryAfter: LOCK_MS / 1000 });
  throw new ApiError("invalid_credentials", "Seller ID or password is incorrect.");
};

export const logout = async () => {
  state.current = null;
  persist();
};

const otpKey = (purpose, id) => `${purpose}:${id}`;

const issueOtp = (purpose, id) => {
  const now = Date.now();
  const sends = (state.sends.get(otpKey(purpose, id)) ?? []).filter((t) => now - t < 3600000);
  const last = sends[sends.length - 1];
  if (last && now - last < RESEND_MS) throw new ApiError("rate_limited", undefined, { retryAfter: Math.ceil((RESEND_MS - (now - last)) / 1000) });
  if (sends.length >= SENDS_PER_HOUR) throw new ApiError("rate_limited", undefined, { retryAfter: Math.ceil((3600000 - (now - sends[0])) / 1000) });
  sends.push(now);
  state.sends.set(otpKey(purpose, id), sends);
  state.otps.set(otpKey(purpose, id), { code: OTP, attempts: 0 });
  return { sendsLeft: SENDS_PER_HOUR - sends.length };
};

const checkOtp = (purpose, id, code) => {
  const key = otpKey(purpose, id);
  const rec = state.otps.get(key) ?? { code: OTP, attempts: 0 };
  state.otps.set(key, rec);
  if (rec.attempts >= 5 || String(code) !== rec.code) {
    rec.attempts += 1;
    throw new ApiError("invalid_code", "That code is not valid or has expired.");
  }
  state.otps.delete(key);
};

export const forgotRequest = async (input) => {
  await wait();
  const id = String(typeof input === "string" ? input : input?.sellerId).trim().toUpperCase();
  issueOtp("forgot", id);
  return { ok: true, message: "If this Seller ID exists, we have sent a code to the phone number on the listing." };
};

export const forgotVerify = async ({ sellerId, code, newPassword }) => {
  await wait();
  const id = String(sellerId).trim().toUpperCase();
  const seller = state.sellers[id];
  const problems = passwordProblems(newPassword, { sellerId: id, phone: seller?.phone });
  if (problems.length) throw new ApiError("weak_password", undefined, { problems });
  checkOtp("forgot", id, code);
  if (!seller || seller.status === "deleted") throw new ApiError("invalid_code", "That code is not valid or has expired.");
  state.passwords[id] = newPassword;
  seller.mustChange = false;
  persist();
  return { ok: true };
};

export const requestOtp = async () => {
  signedIn();
  await wait();
  issueOtp("change", state.current);
  const p = me_().phone;
  return { ok: true, sentTo: p.replace(/^(\+254\d)\d{5}(\d{3})$/, "$1*****$2") };
};

export const changePassword = async ({ code, newPassword }) => {
  signedIn();
  await wait();
  const problems = passwordProblems(newPassword, { sellerId: state.current, phone: me_().phone });
  if (problems.length) throw new ApiError("weak_password", undefined, { problems });
  checkOtp("change", state.current, code);
  state.passwords[state.current] = newPassword;
  me_().mustChange = false;
  persist();
  return { ok: true };
};

const NOTES = (id, s) => [
  { id: "n1", title: "Welcome to EpicMKT Business", body: "Your account is ready. Complete your profile to go live.", created_at: iso(-3), read: state.read.has("n1") },
  ...(s.status === "suspended" ? [{ id: "n2", title: "Listing suspended", body: s.reason ?? "", created_at: iso(-1), read: state.read.has("n2") }] : []),
  ...(id === "ES100002" ? [{ id: "n3", title: "Price check", body: "Please confirm your prices this month.", created_at: iso(-2), read: state.read.has("n3") }] : [])
];

export const me = async () => {
  signedIn();
  await wait();
  const id = state.current;
  const s = me_();
  const extra = profileFor(id);
  const d = data[id] ?? { catalog: emptyCatalog(s.plan === "premium" ? 100 : 20), usage: null };
  const patch = state.patches[id] ?? {};
  const business = {
    seller_id: id,
    slug: s.name.toLowerCase().replace(/\W+/g, "-"),
    name: s.name,
    plan_key: s.plan,
    status: s.status,
    paid_until: s.paid_until,
    phone: s.phone,
    verification_level: id === "ES100002" ? "verified" : "unverified",
    category_name: extra.category,
    ...extra,
    ...patch,
    unlisted: s.status !== "deleted" && (s.stage !== "live" || s.outcome === "rejected"),
    status_reason: s.reason
  };
  return {
    business,
    mustChangePassword: s.mustChange,
    application: { stage: s.stage, outcome: s.outcome },
    catalog: d.catalog,
    usage: d.usage,
    limits: LIMITS[s.plan],
    questions: id === "ES100002" ? [{ id: "q1", text: "Is the 24-hour sign still accurate?", created_at: iso(-1) }] : [],
    notifications: NOTES(id, s),
    settings: { idle_minutes: 60 }
  };
};

export const simulate = async (action, sellerId = state.current) => {
  const s = state.sellers[sellerId];
  if (!s) throw new ApiError("not_found");
  const a = {
    approve: () => { s.stage = "approved"; s.outcome = null; },
    request_changes: () => { s.outcome = "changes_requested"; },
    reject: () => { s.outcome = "rejected"; s.reason = "Application rejected."; },
    activate: () => { s.stage = "live"; s.outcome = null; s.status = "live"; s.paid_until = iso(30); s.reason = null; },
    expire: () => { s.status = "live"; s.paid_until = iso(-9); },
    grace: () => { s.status = "live"; s.paid_until = iso(-1); },
    suspend: () => { s.status = "suspended"; s.reason = "Suspended by an admin for review."; },
    pause: () => { s.status = "paused"; },
    reset: () => { state.sellers[sellerId] = seed()[sellerId]; }
  }[action];
  if (!a) throw new ApiError("unknown_action");
  a();
  persist();
  return { ...state.sellers[sellerId] };
};

export const seededSellers = () => Object.entries(state.sellers).map(([id, s]) => ({ id, name: s.name, plan: s.plan, status: s.status, mustChange: s.mustChange }));

export const devSignIn = async (id) => {
  if (!state.sellers[id]) throw new ApiError("not_found");
  state.current = id;
  persist();
};

export const updateProfile = async (patch) => {
  signedIn();
  await wait();
  const allowed = ["tagline", "description", "whatsapp", "email", "socials", "amenities", "payment_methods", "delivery_area", "address", "logo_path", "cover_path", "tags", "announcement", "profile"];
  const bad = Object.keys(patch).find((k) => !allowed.includes(k));
  if (bad) throw new ApiError("field_not_allowed", `field_not_allowed:${bad}`);
  if ("announcement" in patch && patch.announcement && me_().plan !== "premium") throw new ApiError("premium_only");
  state.patches[state.current] = { ...(state.patches[state.current] ?? {}), ...patch };
  persist();
  return { ...me_(), ...state.patches[state.current] };
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
export const markRead = async (ids = null) => {
  signedIn();
  await wait();
  const all = ["n1", "n2", "n3"];
  (ids ?? all).forEach((i) => state.read.add(i));
  persist();
  return (ids ?? all).length;
};
export const pauseListing = async (pause) => {
  signedIn();
  await wait();
  const from = pause ? "live" : "paused";
  if (me_().status !== from) throw new ApiError("invalid_status");
  me_().status = pause ? "paused" : "live";
  persist();
  return me_().status;
};
export const requestDeletion = async (name) => {
  signedIn();
  await wait();
  if (String(name).trim().toLowerCase() !== me_().name.toLowerCase()) throw new ApiError("name_mismatch");
  me_().status = "deleted";
  persist();
};
export const catalogStats = async () => {
  signedIn();
  await wait();
  return (await me()).catalog;
};
export const itemSignals = async () => { signedIn(); await wait(); return []; };
export const finalizeMedia = async () => { signedIn(); throw new ApiError("not_implemented"); };
export const exportData = async () => { signedIn(); await wait(); return { business: { ...me_() } }; };
