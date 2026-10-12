import { passwordProblems } from "@epicmkt/shared";
import { ApiError } from "./errors.js";
import { EXCEPTION_LIMIT, checkProofBatch, checkReply, inspectProof, validateException } from "@epicmkt/shared";
import { addCalendarMonth, buildPaymentInstructions, categoryChangeQuote, dayOf, isMpesaCode, normalizeMpesaCode } from "@epicmkt/shared/billing";


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
  resetBilling();
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
export const confirmPrices = async () => { signedIn(); await wait(); state.priceConfirmedAt = new Date().toISOString(); return 0; };
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

// ---------------------------------------------------------------------------
// Subscription, payments, notifications and questions (in memory, same rules as the database)
// ---------------------------------------------------------------------------
const CATEGORIES = {
  barber: { id: "barber", name: "Barber", group: "Beauty", prices: { standard: 500, premium: 1500 } },
  salon: { id: "salon", name: "Salon", group: "Beauty", prices: { standard: 800, premium: 2000 } },
  kiosk: { id: "kiosk", name: "Kiosk", group: "Retail", prices: { standard: 300, premium: 900 } },
};
const FEATURES = {
  standard: { Visibility: ["Listed in category lists and search"], Catalog: ["Up to {items} items", "Up to 7 photos and 1 video per item", "Up to 5 FAQs"], Support: ["Standard support"] },
  premium: { Visibility: ["Featured badge on shop card", "Priority placement in lists and search"], Catalog: ["Up to {items} items", "Up to 15 photos and 3 videos per item", "Up to 20 FAQs"], Promotions: ["Unlimited active offers", "Announcement banner"], Support: ["Priority review and support"] },
};
const ITEMS = { barber: { standard: 30, premium: 100 }, salon: { standard: 30, premium: 100 }, kiosk: { standard: 30, premium: 100 } };
const ISO = (ms) => new Date(ms).toISOString();
const DAY = 86_400_000;

const bill = { exceptions: [], business: null, payments: [], messages: [], questions: [], changes: [], usedCodes: new Set(), paybill: null, application: null, listeners: new Set(), seq: 0, now: null };
export const clockNow = () => (bill.now ? new Date(bill.now) : new Date());

function resetBilling() {
  const now = Date.now();
  bill.seq = 0;
  bill.now = null;
  bill.listeners = new Set();
  bill.usedCodes = new Set(["OTHERBIZ01"]);
  bill.paybill = { type: "paybill", number: "247247", name: "EpicMKT Ltd" };
  bill.application = { referenceNo: "EPM-2026-ABC234", priceAtSubmission: 450 };
  bill.business = { id: "biz-1", sellerId: DEMO.sellerId, name: DEMO.name, status: "live", planKey: "standard", categoryId: "barber", paidUntil: ISO(now + 20 * DAY), verificationLevel: "verified", announcement: null };
  bill.payments = [
    { id: "pay-1", businessId: "biz-1", amount: 500, kind: "renewal", status: "confirmed", mpesaCode: "QA11BB22CC", planKey: "standard", categoryId: "barber", accountRef: DEMO.sellerId, confirmedVia: "admin", declineReason: null, receiptNo: "EPM-R-2026-000001", periodStart: "2026-08-20", periodEnd: "2026-09-20", submittedAt: ISO(now - 50 * DAY), confirmedAt: ISO(now - 49 * DAY), createdAt: ISO(now - 50 * DAY) },
  ];
  bill.messages = [
    { id: "m1", kind: "approval", subject: "Your listing is live", body: "Your business has been approved.", data: {}, readAt: null, createdAt: ISO(now - 3 * DAY) },
    { id: "m2", kind: "report", subject: "Wrong price reported", body: "A customer reported wrong price on \"Fade cut\". Please check your listing.", data: {}, readAt: null, createdAt: ISO(now - 2 * DAY) },
    { id: "m3", kind: "reminder", subject: "Your listing expires in 7 days", body: "Renew before then to stay visible.", data: { days_left: 7 }, readAt: ISO(now - DAY), createdAt: ISO(now - DAY) },
  ];
  bill.questions = [
    { id: "q1", message: "Please send a photo of your price list.", dueAt: ISO(now + 3 * DAY), status: "open", reply: null, repliedAt: null, itemId: "i1", faqId: null, createdAt: ISO(now - DAY), attachments: [], item: { id: "i1", name: "Fade cut" }, faq: null },
    { id: "q2", message: "Is delivery really free?", dueAt: null, status: "open", reply: null, repliedAt: null, itemId: null, faqId: "f1", createdAt: ISO(now - 2 * DAY), attachments: [], item: null, faq: { id: "f1", question: "Do you deliver?" } },
    { id: "q3", message: "Old question", dueAt: null, status: "resolved", reply: "Done", repliedAt: ISO(now - 20 * DAY), itemId: null, faqId: null, createdAt: ISO(now - 30 * DAY), attachments: [{ id: "a1", name: "receipt.pdf", mime: "application/pdf", size: 52000, status: "ready" }], item: null, faq: null },
  ];
  bill.changes = [];
  bill.exceptions = [];
}
resetBilling();

const emit = (table, type = "UPDATE", row = {}) => bill.listeners.forEach((l) => l.tables.includes(table) && l.fn({ table, type, row }));
const copy = (v) => JSON.parse(JSON.stringify(v));
const priceOf = (cat, plan) => CATEGORIES[cat]?.prices?.[plan] ?? null;
const nairobiDay = (d) => dayOf(d);
const businessForInstructions = () => ({
  sellerId: bill.business.sellerId, planKey: bill.business.planKey, categoryId: bill.business.categoryId, paidUntil: bill.business.paidUntil,
  hasConfirmedPayment: bill.payments.some((p) => p.status === "confirmed"),
});
const instructionsFor = (args = {}) => {
  try {
    return buildPaymentInstructions({ business: businessForInstructions(), application: bill.application, priceOf, setting: bill.paybill, now: clockNow(), ...args });
  } catch (e) {
    throw new ApiError(e.code ?? "request_failed");
  }
};
const post = (kind, subject, body, data = {}, dedupe = null) => {
  if (dedupe && bill.messages.some((m) => m.dedupe === dedupe)) return;
  const m = { id: `m${++bill.seq + 100}`, kind, subject, body, data, readAt: null, createdAt: clockNow().toISOString(), dedupe };
  bill.messages.unshift(m);
  emit("messages", "INSERT", m);
};

export const getSubscription = async () => {
  signedIn();
  await wait();
  const cat = CATEGORIES[bill.business.categoryId];
  return {
    business: { ...copy(bill.business), categoryName: cat.name },
    plans: Object.fromEntries(["standard", "premium"].map((k) => [k, {
      price: cat.prices[k], itemsLimit: ITEMS[cat.id][k], badge: k === "premium" ? "Best value" : null,
      topBenefits: k === "premium" ? ["Featured badge", "Priority placement", "Unlimited offers"] : ["Listed in search", "Up to 30 items", "Standard support"],
      features: Object.fromEntries(Object.entries(FEATURES[k]).map(([g, list]) => [g, list.map((t) => t.replace("{items}", ITEMS[cat.id][k]))])),
    }])),
    limits: { standard: { photosPerItem: 7, videosPerItem: 1, faqs: 5, activeOffers: 8 }, premium: { photosPerItem: 15, videosPerItem: 3, faqs: 20, activeOffers: null } },
  };
};
export const getPaymentInstructions = async ({ purpose = null, targetPlan = null, category = null } = {}) => {
  signedIn();
  await wait();
  const r = instructionsFor({ purpose, targetPlan, category });
  return { ...r, hasOpenSubmission: bill.payments.some((p) => p.status === "submitted") };
};
export const submitPayment = async ({ code, purpose = null, targetPlan = null, category = null, changeId = null }) => {
  signedIn();
  await wait();
  const value = normalizeMpesaCode(code);
  if (!isMpesaCode(value)) throw new ApiError("invalid_code_format");
  const mine = bill.payments.find((p) => p.mpesaCode === value && p.status !== "rejected");
  if (mine) return copy(mine);
  if (bill.usedCodes.has(value)) throw new ApiError("code_already_used");
  if (bill.payments.some((p) => p.status === "submitted")) throw new ApiError("payment_already_submitted");
  const q = instructionsFor({ purpose, targetPlan, category });
  if (q.amount <= 0) throw new ApiError("nothing_to_pay");
  if (q.purpose === "category_change" && !bill.changes.some((c) => c.id === changeId && c.status === "pending" && c.newValue === category)) throw new ApiError("change_not_found");
  const row = {
    id: `pay-${++bill.seq + 1}`, businessId: bill.business.id, amount: q.amount, kind: q.purpose, status: "submitted", mpesaCode: value,
    planKey: q.planKey, categoryId: q.categoryId, accountRef: q.account, confirmedVia: null, declineReason: null, receiptNo: null,
    periodStart: null, periodEnd: null, submittedAt: clockNow().toISOString(), confirmedAt: null, createdAt: clockNow().toISOString(), changeId,
  };
  bill.payments.unshift(row);
  emit("payments", "INSERT", row);
  return copy(row);
};
export const listPayments = async () => { signedIn(); await wait(); return copy(bill.payments); };
export const getReceipt = async (id) => {
  signedIn();
  await wait();
  const p = bill.payments.find((x) => x.id === id && x.status === "confirmed");
  if (!p) throw new ApiError("receipt_not_found");
  return { payment: copy(p), business: { ...copy(bill.business), categoryName: CATEGORIES[bill.business.categoryId].name }, categoryName: CATEGORIES[p.categoryId ?? bill.business.categoryId].name };
};
export const quoteCategoryChange = async (category) => {
  signedIn();
  await wait();
  const next = priceOf(category, bill.business.planKey);
  if (next == null) throw new ApiError("invalid_category");
  const old = priceOf(bill.business.categoryId, bill.business.planKey);
  return { ...categoryChangeQuote({ oldPrice: old, newPrice: next, paidUntil: bill.business.paidUntil, now: clockNow() }), oldMonthlyPrice: old, dearer: next > old };
};
export const listCategoryPlans = async () => { signedIn(); await wait(); return copy(Object.values(CATEGORIES)); };

export const requestChange = async (field, value) => {
  signedIn();
  await wait();
  if (!["name", "category_id", "phone", "town", "pin", "licence"].includes(field)) throw new ApiError("field_not_allowed");
  if (bill.changes.some((c) => c.field === field && c.status === "pending")) throw new ApiError("change_already_pending");
  let extra = { extraDue: 0, newMonthlyPrice: null, appliesFromNextRenewal: true };
  if (field === "category_id") {
    const q = await quoteCategoryChange(value);
    if (q.dearer && listingStateOf() !== "active") throw new ApiError("renew_first");
    extra = { extraDue: q.extraDueNow, newMonthlyPrice: q.newMonthlyPrice, appliesFromNextRenewal: true };
  }
  const row = { id: `c${++bill.seq}`, field, oldValue: null, newValue: String(value), status: "pending", adminNote: null, createdAt: clockNow().toISOString(), ...extra };
  bill.changes.unshift(row);
  return copy(row);
};
const listingStateOf = () => instructionsFor({ purpose: "renewal" }).listingState;
export const cancelChange = async (id) => {
  signedIn();
  await wait();
  const row = bill.changes.find((c) => c.id === id && c.status === "pending");
  if (!row) throw new ApiError("not_found_or_not_pending");
  row.status = "cancelled";
  return copy(row);
};
export const listChanges = async () => { signedIn(); await wait(); return copy(bill.changes); };

export const listMessages = async ({ kinds = null } = {}) => {
  signedIn();
  await wait();
  return copy(bill.messages.filter((m) => !kinds?.length || kinds.includes(m.kind)).map(({ dedupe, ...m }) => m));
};
export const unreadCount = async () => { signedIn(); return bill.messages.filter((m) => !m.readAt).length; };
export const markRead = async (ids = null) => {
  signedIn();
  await wait();
  let n = 0;
  for (const m of bill.messages) {
    if (!m.readAt && (!ids || ids.includes(m.id))) { m.readAt = clockNow().toISOString(); n += 1; }
  }
  if (n) emit("messages", "UPDATE", {});
  return n;
};

export const listQuestions = async () => { signedIn(); await wait(); return copy(bill.questions); };
const pendingUploads = new Map();
export const uploadProofs = async (flagId, files, { alreadyAttached = 0 } = {}) => {
  signedIn();
  await wait();
  const q = bill.questions.find((x) => x.id === flagId);
  if (!q) throw new ApiError("flag_not_found");
  if (q.status !== "open") throw new ApiError("flag_not_open");
  const check = checkProofBatch(files, q.attachments.length);
  if (check.error) throw new ApiError(check.error, undefined, { file: check.file });
  const staged = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const bad = inspectProof(bytes, f.type);
    if (bad) { pendingUploads.delete(flagId); throw new ApiError(bad, undefined, { file: f.name }); }
    staged.push({ id: `a${++bill.seq + 10}`, name: f.name, mime: f.type, size: bytes.length, status: "ready" });
  }
  pendingUploads.set(flagId, staged);
  q.attachments.push(...staged);
  return copy(staged);
};
export const replyFlag = async (id, reply) => {
  signedIn();
  await wait();
  const bad = checkReply(reply);
  if (bad) throw new ApiError(bad);
  const q = bill.questions.find((x) => x.id === id);
  if (!q || q.status !== "open") throw new ApiError("not_found_or_not_open");
  q.reply = String(reply).trim();
  q.status = "replied";
  q.repliedAt = clockNow().toISOString();
  emit("flags", "UPDATE", q);
  return { id: q.id, status: q.status };
};

const todayNairobi = () => nairobiDay(clockNow());
const pruneExceptions = () => { bill.exceptions = bill.exceptions.filter((e) => e.date >= todayNairobi()).sort((a, b) => (a.date < b.date ? -1 : 1)); };
export const listExceptions = async () => { signedIn(); await wait(); pruneExceptions(); return copy(bill.exceptions); };
export const saveException = async ({ id = null, date, kind, intervals = [], note = null }) => {
  signedIn();
  await wait();
  const v = validateException({ date, kind, intervals, note }, todayNairobi());
  if (!v.ok) throw new ApiError(v.error);
  pruneExceptions();
  const key = id ?? `x${++bill.seq + 500}`;
  const known = bill.exceptions.some((e) => e.id === key);
  if (bill.exceptions.some((e) => e.date === date && e.id !== key)) throw new ApiError("date_taken");
  if (!known && bill.exceptions.length >= EXCEPTION_LIMIT) throw new ApiError("limit_reached", "limit_reached:exceptions");
  bill.exceptions = [...bill.exceptions.filter((e) => e.id !== key), { id: key, ...v.value }].sort((a, b) => (a.date < b.date ? -1 : 1));
  emit("businesses", "UPDATE", bill.business);
  return copy(bill.exceptions.find((e) => e.id === key));
};
export const deleteException = async (id) => {
  signedIn();
  await wait();
  const found = bill.exceptions.some((e) => e.id === id);
  bill.exceptions = bill.exceptions.filter((e) => e.id !== id);
  emit("businesses", "UPDATE", bill.business);
  return found;
};

export const subscribe = (tables, onEvent) => {
  const entry = { tables: tables?.length ? tables : ["payments", "businesses", "messages", "flags", "flag_attachments"], fn: onEvent };
  bill.listeners.add(entry);
  return () => bill.listeners.delete(entry);
};

// Test and demo hooks: what the admin or the automatic matcher does on the server.
export const __mock = {
  state: bill,
  emit,
  setClock: (iso) => { bill.now = iso; },
  setPaybill: (v) => { bill.paybill = v; emit("businesses"); },
  setBusiness: (patch) => { Object.assign(bill.business, patch); emit("businesses", "UPDATE", bill.business); },
  setPaidInDays: (days) => { bill.business.paidUntil = ISO(clockNow().getTime() + days * DAY); emit("businesses", "UPDATE", bill.business); },
  post,
  confirmPayment(id, via = "admin") {
    const p = bill.payments.find((x) => x.id === id);
    if (!p || p.status === "confirmed") return p;
    const today = nairobiDay(clockNow());
    const paid = bill.business.paidUntil ? nairobiDay(bill.business.paidUntil) : null;
    const next = (d) => addCalendarMonth(d).toISOString().slice(0, 10);
    const day = (s) => new Date(`${s}T00:00:00+03:00`).toISOString();
    if (p.kind === "first" || p.kind === "renewal") {
      const start = paid && today <= new Date(new Date(`${paid}T00:00:00Z`).getTime() + DAY).toISOString().slice(0, 10) ? paid : today;
      const end = next(start);
      Object.assign(p, { periodStart: start, periodEnd: end });
      bill.business.paidUntil = day(end);
      if (["pending", "expired"].includes(bill.business.status)) bill.business.status = "live";
    } else if (p.kind === "upgrade") {
      bill.business.planKey = p.planKey;
      Object.assign(p, { periodStart: today, periodEnd: paid });
    }
    p.status = "confirmed";
    p.confirmedVia = via;
    p.confirmedAt = clockNow().toISOString();
    p.receiptNo = `EPM-R-2026-${String(900 + ++bill.seq).padStart(6, "0")}`;
    emit("payments", "UPDATE", p);
    emit("businesses", "UPDATE", bill.business);
    post("payment", "Payment received", `We received KES ${p.amount}. Receipt ${p.receiptNo}.`, { payment_id: p.id }, `payment:${p.id}`);
    return p;
  },
  rejectPayment(id, reason = null) {
    const p = bill.payments.find((x) => x.id === id);
    p.status = "rejected";
    p.declineReason = reason;
    bill.usedCodes.delete(p.mpesaCode);
    emit("payments", "UPDATE", p);
  },
};
