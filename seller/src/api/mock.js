import { passwordProblems, enrichItems, computeStats, previewPriceChange, applyPricePreview, validateSavedViews, MAX_SAVED_VIEWS } from "@epicmkt/shared";
import { ApiError } from "./errors.js";
import { BULK_ACTIONS, EXCEPTION_LIMIT, FLASH_MAX_MS, checkProofBatch, checkReply, flashQuota, inspectProof, validateException, validateFlashSale, validateOffer, offerPhase, offerQuota } from "@epicmkt/shared";
import { addCalendarMonth, buildPaymentInstructions, categoryChangeQuote, dayOf, isMpesaCode, normalizeMpesaCode } from "@epicmkt/shared/billing";


const DEMO = { sellerId: "ES100001", password: "Demo-Passw0rd", phone: "+254712345678", name: "Demo Shop", plan: "standard", status: "live" };
const OTP = "123456";
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

const state = {
  password: DEMO.password,
  otp: null, // what the last code was for: { purpose, channel, target }
  signedIn: false,
  failures: new Map(),
  changes: [],
  business: { name: DEMO.name, plan_key: DEMO.plan, status: DEMO.status, tagline: null },
  priceConfirmedAt: null,
};

const wait = () => new Promise((r) => setTimeout(r, 120));

export const resetMock = () => {
  state.password = DEMO.password;
  state.otp = null;
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
// Same rule as the server: a suspended seller can read and answer messages, and do nothing else.
const writer = () => {
  signedIn();
  if (bill.business?.status === "suspended") throw new ApiError("account_suspended");
};

// The seller's own email works as a sign-in name once they have verified it.
const sellerIdFor = (identifier) => {
  const id = String(identifier ?? "").trim();
  if (id.includes("@")) {
    const b = bill.business;
    return b?.loginEmailVerified && b.loginEmail === id.toLowerCase() ? DEMO.sellerId : null;
  }
  return id.toUpperCase() === DEMO.sellerId ? DEMO.sellerId : null;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const maskEmail = (e) => e.replace(/^([^@])[^@]*(@.+)$/, "$1*******$2");

export const login = async (identifier, password) => {
  await wait();
  const typed = String(identifier).trim().toLowerCase();
  const sid = sellerIdFor(identifier);
  const key = sid ? sid.toLowerCase() : typed;
  const f = state.failures.get(key) ?? { n: 0, until: 0 };
  if (f.until > Date.now()) throw new ApiError("locked", "Seller ID or password is incorrect.", { retryAfter: Math.ceil((f.until - Date.now()) / 1000) });
  if (sid && password === state.password) {
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
const FORGOT_MESSAGE = "If we found an account, we have sent a code. Email codes only work once you have added and verified your email in Account.";
export const forgotRequest = async ({ identifier, channel = "sms" } = {}) => {
  await wait();
  const b = bill.business;
  const emailOk = channel !== "email" || b?.loginEmailVerified;
  state.otp = sellerIdFor(identifier) && emailOk ? { purpose: "forgot_password", channel, target: null } : null;
  return { ok: true, message: FORGOT_MESSAGE };
};
export const forgotVerify = async ({ identifier, code, newPassword }) => {
  await wait();
  const sid = sellerIdFor(identifier);
  const problems = passwordProblems(newPassword, { sellerId: sid ?? String(identifier).toUpperCase(), phone: DEMO.phone });
  if (problems.length) throw new ApiError("weak_password", undefined, { problems });
  if (!sid || code !== OTP) throw new ApiError("invalid_code", "That code is not valid or has expired.");
  state.password = newPassword;
  bill.business.mustChangePassword = false;
  bill.business.passwordChangedAt = new Date().toISOString();
  return { ok: true };
};
export const requestOtp = async ({ purpose = "change_password", channel = "sms", email } = {}) => {
  signedIn();
  await wait();
  const b = bill.business;
  if (purpose === "verify_email") {
    const address = String(email ?? "").trim().toLowerCase();
    if (!EMAIL.test(address)) throw new ApiError("bad_request");
    if (address === "taken@example.com") throw new ApiError("email_in_use");
    state.otp = { purpose, channel: "email", target: address };
    return { ok: true, channel: "email", sentTo: maskEmail(address) };
  }
  if (channel === "email") {
    if (!b.loginEmailVerified) throw new ApiError("email_not_verified");
    state.otp = { purpose, channel: "email", target: null };
    return { ok: true, channel: "email", sentTo: maskEmail(b.loginEmail) };
  }
  state.otp = { purpose, channel: "sms", target: null };
  return { ok: true, channel: "sms", sentTo: "+2547*****678" };
};
export const changePassword = async ({ code, newPassword }) => {
  signedIn();
  await wait();
  const problems = passwordProblems(newPassword, { sellerId: DEMO.sellerId, phone: DEMO.phone });
  if (problems.length) throw new ApiError("weak_password", undefined, { problems });
  if (code !== OTP) throw new ApiError("invalid_code", "That code is not valid or has expired.");
  state.password = newPassword;
  bill.business.mustChangePassword = false;
  bill.business.passwordChangedAt = new Date().toISOString();
  return { ok: true };
};
export const setLoginEmail = async ({ code, currentPassword }) => {
  signedIn();
  await wait();
  if (currentPassword !== state.password) throw new ApiError("invalid_password");
  if (code !== OTP || state.otp?.purpose !== "verify_email") throw new ApiError("invalid_code", "That code is not valid or has expired.");
  bill.business.loginEmail = state.otp.target;
  bill.business.loginEmailVerified = true;
  state.otp = null;
  return { ok: true, loginEmail: bill.business.loginEmail };
};
export const updateProfile = async (patch) => {
  writer();
  await wait();
  const allowed = ["tagline", "description", "whatsapp", "email", "socials", "amenities", "payment_methods", "delivery_area", "address", "logo_path", "cover_path", "tags", "announcement", "profile"];
  const bad = Object.keys(patch).find((k) => !allowed.includes(k));
  if (bad) throw new ApiError("field_not_allowed", `field_not_allowed:${bad}`);
  if ("announcement" in patch && patch.announcement && state.business.plan_key !== "premium") throw new ApiError("premium_only");
  Object.assign(state.business, patch);
  return { ...state.business };
};
export const confirmPrices = async () => { writer(); await wait(); state.priceConfirmedAt = new Date().toISOString(); return 0; };
export const pauseListing = async (pause) => {
  writer();
  await wait();
  const from = pause ? "live" : "paused";
  if (state.business.status !== from) throw new ApiError("invalid_status");
  state.business.status = pause ? "paused" : "live";
  return state.business.status;
};
export const requestDeletion = async (name) => {
  writer();
  await wait();
  if (String(name).trim().toLowerCase() !== state.business.name.toLowerCase()) throw new ApiError("name_mismatch");
  state.business.status = "deleted";
};
export const catalogStats = async () => {
  signedIn();
  await wait();
  const now = clockNow().getTime();
  const rows = enrichItems(bill.items, bill.signals, { now });
  const c = computeStats(rows);
  return {
    total: c.total, visible: rows.filter((i) => i.visibility === "showing").length, hidden: rows.filter((i) => !i.visible).length,
    hidden_by_me: c.hidden_me, hidden_by_admin: c.hidden_admin, drafts: c.draft, available: c.available, out_of_stock: c.out_of_stock,
    limited_stock: c.limited_stock, unavailable: rows.filter((i) => i.availability === "unavailable").length, by_appointment: c.by_appointment,
    seasonal: c.seasonal, coming_soon: c.coming_soon, low_stock: c.low_stock, without_photo: c.no_photo, stale_prices: c.stale_price,
    reported: c.reported, flagged: c.flagged, items_limit: null, open_flags: 0, unread_messages: 0,
  };
};
export const itemSignals = async () => { signedIn(); await wait(); return copy(bill.signals); };
export const finalizeMedia = async () => { signedIn(); throw new ApiError("not_implemented"); };
export const uploadItemPhoto = async (itemId, file) => {
  signedIn();
  await wait();
  const item = bill.items.find((i) => i.id === itemId && !i.removedByAdmin);
  if (!item) throw new ApiError("item_not_found");
  if (item.imagePaths.length >= (bill.business.planKey === "premium" ? 15 : 7)) throw new ApiError("photo_limit");
  const path = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : `mock/${itemId}/${++bill.seq}.webp`;
  item.imagePaths.push(path);
  item.imageCount = item.imagePaths.length;
  return { path };
};
export const removeItemPhoto = async (path) => {
  signedIn();
  await wait();
  const item = bill.items.find((i) => i.imagePaths.includes(path));
  if (!item) return;
  item.imagePaths = item.imagePaths.filter((p) => p !== path);
  item.imageCount = item.imagePaths.length;
};
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
  standard: { Visibility: ["Listed in category lists and search"], Catalog: ["Unlimited items", "Up to 7 photos and 1 video per item", "Up to 5 FAQs"], Support: ["Standard support"] },
  premium: { Visibility: ["Featured badge on shop card", "Priority placement in lists and search"], Catalog: ["Unlimited items", "Up to 15 photos and 3 videos per item", "Up to 20 FAQs"], Promotions: ["Unlimited active offers", "Announcement banner"], Support: ["Priority review and support"] },
};
const ISO = (ms) => new Date(ms).toISOString();
const DAY = 86_400_000;

const bill = { items: [], flash: [], offers: [], exceptions: [], business: null, payments: [], messages: [], questions: [], changes: [], usedCodes: new Set(), paybill: null, application: null, listeners: new Set(), seq: 0, now: null };
export const clockNow = () => (bill.now ? new Date(bill.now) : new Date());

function resetBilling() {
  const now = Date.now();
  bill.seq = 0;
  bill.now = null;
  bill.listeners = new Set();
  bill.usedCodes = new Set(["OTHERBIZ01"]);
  bill.intent = null;
  bill.paybill = { type: "paybill", number: "247247", name: "EpicMKT Ltd" };
  bill.application = { referenceNo: "EPM-2026-ABC234", priceAtSubmission: 450 };
  bill.business = { id: "biz-1", sellerId: DEMO.sellerId, name: DEMO.name, status: "live", planKey: "standard", categoryId: "barber", paidUntil: ISO(now + 20 * DAY), verificationLevel: "verified", announcement: null, creditKes: 0, strikes: 0, statusReason: null, loginEmail: null, loginEmailVerified: false, mustChangePassword: false, passwordChangedAt: null };
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
  const mk = (n, id, name, price, priceType, availability, visible, extra = {}) => ({
    id, name, price, priceType, availability, visible, hiddenByAdmin: false,
    description: "", section: null, priceMax: null, unit: null, salePrice: null, stockCount: null, trackStock: false, lowStockThreshold: 3, showStockCount: false,
    availableFrom: null, season: null, draft: false, sort: n, removedByAdmin: false, adminHideReason: null, tags: [], badge: null, variants: [],
    priceConfirmedAt: ISO(now - 5 * DAY), createdAt: ISO(now - (60 - n) * DAY), updatedAt: ISO(now - (30 - n) * DAY), imageCount: 1, imagePaths: [`demo/${id}.webp`], hasVideo: false, ...extra,
  });
  bill.items = [
    mk(1, "it-fade", "Fade cut", 500, "fixed", "available", true, { section: "Haircuts", tags: ["barber", "fade"], description: "A clean fade finished with a hot towel and styling." }),
    mk(2, "it-beard", "Beard trim", 300, "fixed", "available", true, { section: "Haircuts", salePrice: 250 }),
    mk(3, "it-dye", "Hair dye", 1200, "from", "available", true, { section: "Colour", imageCount: 0, imagePaths: [] }),
    mk(4, "it-gel", "Styling gel", 400, "fixed", "out_of_stock", true, { section: "Products", trackStock: true, stockCount: 0, priceConfirmedAt: ISO(now - 200 * DAY) }),
    mk(5, "it-old", "Old special", 250, "fixed", "available", false, { section: "Haircuts" }),
    mk(6, "it-quote", "Wedding package", null, "contact", "available", true),
  ];
  bill.signals = [];
  bill.views = [];
  bill.flash = [];
  bill.offers = [];
}
resetBilling();

const emit = (table, type = "UPDATE", row = {}) => bill.listeners.forEach((l) => l.tables.includes(table) && l.fn({ table, type, row }));
const copy = (v) => JSON.parse(JSON.stringify(v));
const priceOf = (cat, plan) => CATEGORIES[cat]?.prices?.[plan] ?? null;
const nairobiDay = (d) => dayOf(d);
// start + n calendar months, from the start date itself (31 Jan + 1 month = 28 Feb, + 2 months = 31 Mar), as the server does.
const addMonthsTo = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
};
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
      price: cat.prices[k], itemsLimit: null, badge: k === "premium" ? "Best value" : null,
      topBenefits: k === "premium" ? ["Featured badge", "Priority placement", "Unlimited offers"] : ["Listed in search", "Unlimited items", "Standard support"],
      features: Object.fromEntries(Object.entries(FEATURES[k]).map(([g, list]) => [g, list])),
    }])),
    limits: { standard: { photosPerItem: 7, videosPerItem: 1, faqs: 5, activeOffers: 8 }, premium: { photosPerItem: 15, videosPerItem: 3, faqs: 20, activeOffers: null } },
  };
};
export const getPaymentInstructions = async ({ purpose = null, targetPlan = null, category = null } = {}) => {
  signedIn();
  await wait();
  const r = instructionsFor({ purpose, targetPlan, category });
  const credit = bill.business.creditKes ?? 0;
  return { ...r, creditKes: credit, amountDue: Math.max(r.amount - credit, 0), maxPrepayMonths: 12, hasOpenSubmission: bill.payments.some((p) => p.status === "submitted") };
};
// Spend credit on an upgrade or category change: a confirmed payment funded from credit (the server does the same).
const spendCredit = (q, changeId = null) => {
  bill.business.creditKes -= q.amount;
  const row = {
    id: `pay-${++bill.seq + 1}`, businessId: bill.business.id, amount: q.amount, kind: q.purpose, status: "submitted", mpesaCode: null,
    planKey: q.planKey, categoryId: q.categoryId, accountRef: q.account, confirmedVia: null, declineReason: null, receiptNo: null,
    periodStart: null, periodEnd: null, months: 1, submittedAt: clockNow().toISOString(), confirmedAt: null, createdAt: clockNow().toISOString(), changeId,
  };
  bill.payments.unshift(row);
  __mock.confirmPayment(row.id, "auto");
  return { outcome: "applied", payment_id: row.id };
};
export const applyCredit = async ({ purpose = null, targetPlan = null, category = null, changeId = null } = {}) => {
  signedIn();
  await wait();
  const q = instructionsFor({ purpose, targetPlan, category });
  if (q.amount <= 0) throw new ApiError("nothing_to_pay");
  if ((bill.business.creditKes ?? 0) < q.amount) throw new ApiError("not_enough_credit");
  if (q.purpose === "category_change" && !bill.changes.some((c) => c.id === changeId && c.status === "pending" && c.newValue === category)) throw new ApiError("change_not_found");
  if (q.purpose === "first" || q.purpose === "renewal") return __mock.autoPay(0);
  return spendCredit(q, changeId);
};
export const setPaymentIntent = async ({ purpose = null, targetPlan = null, category = null, changeId = null } = {}) => {
  signedIn();
  bill.intent = purpose === "upgrade" || purpose === "category_change" ? { purpose, targetPlan, category, changeId } : null;
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
  writer();
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
  writer();
  await wait();
  const row = bill.changes.find((c) => c.id === id && c.status === "pending");
  if (!row) throw new ApiError("not_found_or_not_pending");
  row.status = "cancelled";
  return copy(row);
};
export const listChanges = async () => { signedIn(); await wait(); return copy(bill.changes); };

const fillMessage = ({ dedupe, ...m }) => ({
  sender: "system", threadId: m.id, parentId: null, needsReply: false, deliveredAt: null, adminDeliveredAt: null, adminReadAt: null, attachments: [], ...m,
});
export const listMessages = async ({ kinds = null } = {}) => {
  signedIn();
  await wait();
  return copy(bill.messages.filter((m) => !kinds?.length || kinds.includes(m.kind)).map(fillMessage));
};
export const ackDelivered = async () => {
  signedIn();
  let n = 0;
  for (const m of bill.messages) {
    if (m.sender && m.sender !== "seller" && !m.deliveredAt) { m.deliveredAt = clockNow().toISOString(); n += 1; }
  }
  if (n) emit("messages", "UPDATE", {});
  return n;
};
export const sendMessage = async ({ parentId, body, files = [] }) => {
  signedIn();
  await wait();
  const parent = bill.messages.find((m) => m.id === parentId);
  if (!parent) throw new ApiError("message_not_found");
  const thread = bill.messages.filter((m) => (m.threadId ?? m.id) === (parent.threadId ?? parent.id));
  if (!thread.some((m) => m.sender === "admin" && m.needsReply)) throw new ApiError("reply_not_allowed");
  const check = checkProofBatch(files);
  if (check.error) throw new ApiError(check.error, undefined, { file: check.file });
  let text = String(body ?? "").trim();
  if (!text) {
    if (!files.length) throw new ApiError("reply_too_short");
    text = "Sent a file.";
  }
  if (text.length > 2000) throw new ApiError("reply_too_long");
  const attachments = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const bad = inspectProof(bytes, f.type);
    if (bad) throw new ApiError(bad, undefined, { file: f.name });
    attachments.push({ id: `ma${++bill.seq}`, name: f.name, mime: f.type, size: bytes.length, path: `biz-1/${f.name}`, by: "seller" });
  }
  const now = clockNow().toISOString();
  const m = {
    id: `msg${++bill.seq}`, kind: "general", subject: `Re: ${String(parent.subject ?? "Message").replace(/^(Re: )+/, "")}`, body: text, data: {},
    readAt: now, createdAt: now, sender: "seller", threadId: parent.threadId ?? parent.id, parentId, needsReply: false, deliveredAt: now,
    adminDeliveredAt: null, adminReadAt: null, attachments,
  };
  bill.messages.unshift(m);
  emit("messages", "INSERT", m);
  return copy(m);
};
export const openAttachment = async (path) => { signedIn(); return `https://files.invalid/${encodeURIComponent(path)}`; };
export const unreadCount = async () => { signedIn(); return bill.messages.filter((m) => !m.readAt).length; };
export const markRead = async (ids = null) => {
  signedIn();
  await wait();
  let n = 0;
  for (const m of bill.messages) {
    if (!m.readAt && (!ids || ids.includes(m.id))) { m.readAt = clockNow().toISOString(); m.deliveredAt ??= m.readAt; n += 1; }
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

const FLASH_LIMITS = { standard: { flashSalesConcurrent: 1, flashSalesPerMonth: 3 }, premium: { flashSalesConcurrent: 5, flashSalesPerMonth: 10 } };
const nowMs = () => clockNow().getTime();

const settleFlash = () => {
  const at = nowMs();
  for (const sale of bill.flash) {
    if (sale.status === "scheduled" && Date.parse(sale.startsAt) <= at) sale.status = "live";
    if ((sale.status === "live" || sale.status === "scheduled") && Date.parse(sale.endsAt) <= at) closeFlash(sale, "time");
  }
};
function closeFlash(sale, reason) {
  const at = clockNow().toISOString();
  Object.assign(sale, { status: sale.status === "scheduled" && Date.parse(sale.startsAt) > nowMs() ? "cancelled" : "ended", endedAt: at, endedReason: reason });
  const item = bill.items.find((i) => i.id === sale.itemId);
  if (sale.afterEnd === "unlist" && item && item.visible && (reason === "time" || reason === "seller")) item.visible = false;
  if (reason === "time") post("general", "Flash sale ended", `Your flash sale on "${sale.itemName}" has ended.${sale.afterEnd === "unlist" ? " The item was unlisted as you chose." : ""}`, { flash_sale_id: sale.id }, `flash_end:${sale.id}`);
  emit("flash_sales", "UPDATE", sale);
}
const flashView = (sale) => ({ ...copy(sale), regularPrice: bill.items.find((i) => i.id === sale.itemId)?.price ?? null });
const flashCheckItem = (item) => {
  if (!item) throw new ApiError("item_not_found");
  if (!item.visible || item.hiddenByAdmin || ["out_of_stock", "unavailable"].includes(item.availability)) throw new ApiError("item_unavailable");
  if (!(item.price > 0) || !["fixed", "from"].includes(item.priceType)) throw new ApiError("item_not_discountable");
};

export const getServerTime = async () => ({ now: clockNow().toISOString() });
export const listItems = async () => { signedIn(); await wait(); return copy(bill.items); };
const shopLive = () => bill.business.status === "live" && Boolean(bill.business.paidUntil) && Date.parse(bill.business.paidUntil) > clockNow().getTime();
const inFlashSale = (id) => bill.flash.some((s) => s.itemId === id && ["scheduled", "live"].includes(s.status));
export const getCatalog = async () => {
  signedIn();
  await wait();
  settleFlash();
  return { shop: { slug: "demo-shop", status: bill.business.status, live: shopLive(), planKey: bill.business.planKey, itemsLimit: null }, items: copy(bill.items).map((i) => ({ ...i, inFlashSale: inFlashSale(i.id) })).sort((a, b) => a.sort - b.sort) };
};
export const getShopPreview = async () => {
  signedIn();
  await wait();
  settleFlash();
  const cat = await getCatalog();
  const hours = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, ["08:00", "18:00"]]));
  const shop = {
    slug: cat.shop.slug, name: bill.business.name, tagline: "Quality you can trust", description: "A demo shop used to preview how customers see your page.",
    planKey: bill.business.planKey, status: bill.business.status, live: cat.shop.live, verified: bill.business.verificationLevel === "verified",
    county: "Kisumu", town: "Maseno", address: "Main Street", lat: -0.09, lng: 34.6, phone: "0712345678", whatsapp: "0712345678",
    socials: { instagram: "demoshop" }, hours, exceptions: bill.exceptions.filter((e) => e.date >= todayNairobi()).map(({ id, date, kind, intervals, note }) => ({ id, date, kind, intervals, note })), tags: ["demo"], logoPath: null, coverPath: null, categoryName: "Barbershop",
  };
  const flashSales = bill.flash.map(flashView).filter((s) => s.status === "live" && Date.parse(s.startsAt) <= nowMs() && Date.parse(s.endsAt) > nowMs());
  return copy({ shop, items: cat.items.filter((i) => i.visible && !i.draft && !i.hiddenByAdmin && !i.removedByAdmin).sort((a, b) => a.sort - b.sort), flashSales, offers: bill.offers.filter((o) => offerPhase(o, nowMs()) === "live") });
};
export const saveItem = async (id, f) => {
  signedIn();
  await wait();
  const now = clockNow().toISOString();
  const fields = { name: f.name, description: f.description ?? "", section: f.section || null, priceType: f.priceType, price: f.price ?? null, priceMax: f.priceMax ?? null, salePrice: f.salePrice ?? null, unit: f.unit || null, availability: f.availability };
  if (id) {
    const item = bill.items.find((i) => i.id === id && !i.removedByAdmin);
    if (!item) throw new ApiError("item_not_found");
    const priceChanged = [item.price, item.priceMax, item.priceType, item.salePrice].join() !== [fields.price, fields.priceMax, fields.priceType, fields.salePrice].join();
    if (priceChanged && bill.flash.some((s) => s.itemId === id && ["scheduled", "live"].includes(s.status))) throw new ApiError("item_in_flash_sale");
    Object.assign(item, fields, { updatedAt: now, priceConfirmedAt: priceChanged ? now : item.priceConfirmedAt });
    return id;
  }
  const made = { id: `it-new-${++bill.seq}`, ...fields, visible: false, draft: true, hiddenByAdmin: false, removedByAdmin: false, adminHideReason: null, stockCount: null, trackStock: false, lowStockThreshold: 3, showStockCount: false, availableFrom: null, season: null, sort: Math.max(0, ...bill.items.map((i) => i.sort)) + 1, tags: [], badge: null, variants: [], priceConfirmedAt: now, createdAt: now, updatedAt: now, imageCount: 0, imagePaths: [], hasVideo: false };
  bill.items.push(made);
  return made.id;
};
export const bulkItems = async (action, ids, args = {}) => {
  signedIn();
  await wait();
  if (!BULK_ACTIONS.includes(action)) throw new ApiError("invalid_action");
  if (!Array.isArray(ids) || ids.length === 0) throw new ApiError("no_items");
  if (ids.length > 500) throw new ApiError("too_many_items");
  const targets = bill.items.filter((i) => ids.includes(i.id) && !i.removedByAdmin);
  let skipped = ids.length - targets.length;
  let affected = 0;
  const now = clockNow().toISOString();
  if (action === "hide") targets.forEach((i) => { if (i.visible) { i.visible = false; affected += 1; } });
  else if (action === "show") targets.forEach((i) => { if (!i.visible || i.draft) { i.visible = true; i.draft = false; affected += 1; } });
  else if (action === "delete") {
    const gone = new Set(targets.map((i) => i.id));
    bill.items = bill.items.filter((i) => !gone.has(i.id));
    affected = gone.size;
  } else if (action === "move_section") {
    const section = String(args.section ?? "").trim() || null;
    if (section && section.length > 60) throw new ApiError("invalid_section");
    targets.forEach((i) => { if (i.section !== section) { i.section = section; affected += 1; } });
  } else if (action === "set_availability") {
    if (!["available", "limited_stock", "out_of_stock", "unavailable", "by_appointment"].includes(args.availability)) throw new ApiError("invalid_availability");
    targets.forEach((i) => { if (i.availability !== args.availability) { i.availability = args.availability; affected += 1; } });
  } else if (action === "price_percent") {
    settleFlash();
    const eligible = targets.filter((i) => !inFlashSale(i.id));
    const preview = previewPriceChange(eligible, args.percent);
    if (!preview.ok) throw new ApiError("invalid_percent");
    const next = applyPricePreview(eligible, preview);
    skipped += targets.length - eligible.length;
    eligible.forEach((i, n) => { Object.assign(i, { price: next[n].price, priceMax: next[n].priceMax, salePrice: next[n].salePrice, priceConfirmedAt: next[n].price === i.price ? i.priceConfirmedAt : now }); });
    affected = preview.affected;
    skipped += preview.skipped;
  } else targets.forEach((i) => { i.priceConfirmedAt = now; affected += 1; });
  targets.forEach((i) => { i.updatedAt = now; });
  return { affected, skipped };
};
export const reorderItems = async (ids) => {
  signedIn();
  await wait();
  if (!Array.isArray(ids) || ids.length === 0) throw new ApiError("no_items");
  let changed = 0;
  ids.forEach((id, n) => {
    const item = bill.items.find((i) => i.id === id);
    if (item && item.sort !== n + 1) { item.sort = n + 1; changed += 1; }
  });
  return changed;
};
export const duplicateItem = async (id) => {
  signedIn();
  await wait();
  const src = bill.items.find((i) => i.id === id && !i.removedByAdmin);
  if (!src) throw new ApiError("item_not_found");
  const now = clockNow().toISOString();
  const copyOf = { ...copy(src), id: `it-copy-${++bill.seq}`, name: `${src.name.slice(0, 111)} (copy)`, visible: false, draft: true, sort: src.sort + 1, imageCount: 0, imagePaths: [], hasVideo: false, createdAt: now, updatedAt: now, priceConfirmedAt: now };
  bill.items.push(copyOf);
  return copyOf.id;
};
export const importItems = async (rows) => {
  signedIn();
  await wait();
  if (bill.business.planKey !== "premium") throw new ApiError("premium_required");
  if (!Array.isArray(rows) || rows.length === 0) throw new ApiError("no_rows");
  if (rows.length > 500) throw new ApiError("too_many_rows");
  if (rows.some((r) => [r.name, r.section, r.unit].some((v) => /^[=+\-@]/.test(String(v ?? ""))))) throw new ApiError("formula_rejected");
  const now = clockNow().toISOString();
  let sort = Math.max(0, ...bill.items.map((i) => i.sort));
  const made = rows.map((r) => ({
    id: `it-imp-${++bill.seq}`, name: r.name, price: r.price ?? null, priceMax: r.price_max ?? null, priceType: r.price_type, unit: r.unit ?? null, salePrice: null,
    availability: r.availability ?? "available", visible: false, draft: true, hiddenByAdmin: false, removedByAdmin: false, adminHideReason: null, description: "",
    section: r.section ?? null, stockCount: null, trackStock: false, lowStockThreshold: 3, showStockCount: false, availableFrom: null, season: null, sort: (sort += 1),
    tags: r.tags ?? [], badge: null, variants: [], priceConfirmedAt: now, createdAt: now, updatedAt: now, imageCount: 0, imagePaths: [], hasVideo: false,
  }));
  bill.items.push(...made);
  return { created: made.length };
};
export const getSavedViews = async () => { signedIn(); await wait(); return copy(bill.views); };
export const saveSavedViews = async (views) => {
  signedIn();
  await wait();
  const check = validateSavedViews(views);
  if (!check.ok) throw new ApiError(views?.length > MAX_SAVED_VIEWS ? "too_many_views" : "invalid_view", check.message);
  bill.views = copy(views);
  return copy(bill.views);
};
export const listFlashSales = async () => { signedIn(); await wait(); settleFlash(); return bill.flash.map(flashView).sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1)); };
export const getFlashQuota = async () => {
  signedIn();
  await wait();
  settleFlash();
  return flashQuota(bill.flash, FLASH_LIMITS[bill.business.planKey], nowMs());
};
export const createFlashSale = async (input) => {
  writer();
  await wait();
  settleFlash();
  const item = bill.items.find((i) => i.id === input.itemId);
  flashCheckItem(item);
  const v = validateFlashSale({ ...input, itemPrice: item.price }, nowMs());
  if (!v.ok) throw new ApiError(v.error);
  const { startsAt, endsAt } = v.value;
  const open = bill.flash.filter((s) => ["scheduled", "live"].includes(s.status));
  if (open.some((s) => s.itemId === item.id && s.startsAt < endsAt && startsAt < s.endsAt)) throw new ApiError("item_has_sale");
  const limits = FLASH_LIMITS[bill.business.planKey];
  if (open.filter((s) => s.startsAt < endsAt && startsAt < s.endsAt).length >= limits.flashSalesConcurrent) throw new ApiError("limit_reached", "limit_reached:flash_concurrent");
  if (flashQuota([...bill.flash, { status: "scheduled", startsAt, endsAt }], limits, nowMs()).monthlyUsed > limits.flashSalesPerMonth) throw new ApiError("limit_reached", "limit_reached:flash_per_month");
  const sale = {
    id: `fs-${++bill.seq}`, itemId: item.id, itemName: item.name, headline: v.value.headline, startsAt, endsAt, discountType: v.value.discountType, discountValue: v.value.discountValue,
    quantityNote: v.value.quantityNote, afterEnd: v.value.afterEnd, status: Date.parse(startsAt) <= nowMs() ? "live" : "scheduled", endedAt: null, endedReason: null, createdAt: clockNow().toISOString(),
  };
  bill.flash.push(sale);
  emit("flash_sales", "INSERT", sale);
  return flashView(sale);
};
export const updateFlashSale = async (id, { headline, quantityNote }) => {
  writer();
  await wait();
  settleFlash();
  const sale = bill.flash.find((s) => s.id === id);
  if (!sale) throw new ApiError("not_found");
  if (!["scheduled", "live"].includes(sale.status)) throw new ApiError("flash_closed");
  const v = validateFlashSale({ itemPrice: 1000, discountType: "percent", discountValue: 10, endsAt: new Date(nowMs() + 60000).toISOString(), afterEnd: "keep", headline, quantityNote }, nowMs());
  if (!v.ok) throw new ApiError(v.error);
  Object.assign(sale, { headline: v.value.headline, quantityNote: v.value.quantityNote });
  emit("flash_sales", "UPDATE", sale);
  return flashView(sale);
};
export const extendFlashSale = async (id, endsAt) => {
  writer();
  await wait();
  settleFlash();
  const sale = bill.flash.find((s) => s.id === id);
  if (!sale) throw new ApiError("not_found");
  if (!["scheduled", "live"].includes(sale.status) || Date.parse(sale.endsAt) <= nowMs()) throw new ApiError("flash_closed");
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end) || end <= Date.parse(sale.endsAt)) throw new ApiError("invalid_window");
  if (end - Date.parse(sale.startsAt) > FLASH_MAX_MS) throw new ApiError("duration_too_long");
  sale.endsAt = new Date(end).toISOString();
  emit("flash_sales", "UPDATE", sale);
  return true;
};
export const endFlashSale = async (id) => {
  writer();
  await wait();
  settleFlash();
  const sale = bill.flash.find((s) => s.id === id);
  if (!sale) throw new ApiError("not_found");
  if (!["scheduled", "live"].includes(sale.status)) throw new ApiError("flash_closed");
  closeFlash(sale, "seller");
  return true;
};

const OFFER_LIMITS = { standard: { activeOffers: 8 }, premium: { activeOffers: null } };
export const listOffers = async () => { signedIn(); await wait(); return copy(bill.offers).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); };
export const getOfferQuota = async () => { signedIn(); await wait(); return offerQuota(bill.offers, OFFER_LIMITS[bill.business.planKey], nowMs()); };
export const saveOffer = async (id, f) => {
  writer();
  await wait();
  const old = id ? bill.offers.find((o) => o.id === id) : null;
  if (id && !old) throw new ApiError("offer_not_found");
  const v = validateOffer(f, { items: bill.items.filter((i) => !i.hiddenByAdmin && !i.removedByAdmin), nowMs: nowMs(), existing: old });
  if (!v.ok) throw new ApiError(v.error, v.field);
  const others = bill.offers.filter((o) => o.id !== id);
  const wouldRun = offerPhase({ ...v.value, active: true }, nowMs()) !== "ended";
  if (wouldRun && !offerQuota(others, OFFER_LIMITS[bill.business.planKey], nowMs()).canCreate) throw new ApiError("limit_reached", "limit_reached:offers");
  const at = clockNow().toISOString();
  const row = { ...(old ?? { id: `of-${++bill.seq}`, active: true, status: "active", createdAt: at }), ...v.value, updatedAt: at };
  if (!old) bill.offers.push(row);
  else Object.assign(old, row);
  return copy(row);
};
export const setOfferActive = async (id, active) => {
  writer();
  await wait();
  const o = bill.offers.find((x) => x.id === id);
  if (!o) throw new ApiError("offer_not_found");
  o.active = !!active;
  o.status = active ? "active" : "paused";
  return true;
};
export const endOffer = async (id) => {
  writer();
  await wait();
  const o = bill.offers.find((x) => x.id === id);
  if (!o) throw new ApiError("offer_not_found");
  if (o.startsAt && Date.parse(o.startsAt) > nowMs()) { bill.offers = bill.offers.filter((x) => x.id !== id); return "removed"; }
  o.endsAt = clockNow().toISOString();
  o.status = "ended";
  return "ended";
};

const todayNairobi = () => nairobiDay(clockNow());
const pruneExceptions = () => { bill.exceptions = bill.exceptions.filter((e) => e.date >= todayNairobi()).sort((a, b) => (a.date < b.date ? -1 : 1)); };
export const listExceptions = async () => { signedIn(); await wait(); pruneExceptions(); return copy(bill.exceptions); };
export const saveException = async ({ id = null, date, kind, intervals = [], note = null }) => {
  writer();
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
  writer();
  await wait();
  const found = bill.exceptions.some((e) => e.id === id);
  bill.exceptions = bill.exceptions.filter((e) => e.id !== id);
  emit("businesses", "UPDATE", bill.business);
  return found;
};

export const subscribe = (tables, onEvent) => {
  const entry = { tables: tables?.length ? tables : ["payments", "businesses", "messages", "message_attachments", "flags", "flag_attachments", "flash_sales"], fn: onEvent };
  bill.listeners.add(entry);
  return () => bill.listeners.delete(entry);
};

// Test and demo hooks: what the admin or the automatic matcher does on the server.
export const __mock = {
  state: bill,
  emit,
  setClock: (iso) => { bill.now = iso; },
  setSignals: (rows) => { bill.signals = rows; },
  setItems: (rows) => { bill.items = rows; },
  setPaybill: (v) => { bill.paybill = v; emit("businesses"); },
  setBusiness: (patch) => { Object.assign(bill.business, patch); emit("businesses", "UPDATE", bill.business); },
  setPaidInDays: (days) => { bill.business.paidUntil = ISO(clockNow().getTime() + days * DAY); emit("businesses", "UPDATE", bill.business); },
  post,
  /** What staff do: send a message (optionally asking for a reply), or open a seller's reply. */
  adminSend({ parentId = null, subject = "Message from EpicMKT", body, needsReply = false, files = [] }) {
    const id = `msg${++bill.seq}`;
    const parent = parentId ? bill.messages.find((m) => m.id === parentId) : null;
    const m = {
      id, kind: "general", subject: parent ? `Re: ${String(parent.subject).replace(/^(Re: )+/, "")}` : subject, body, data: {}, readAt: null, createdAt: clockNow().toISOString(),
      sender: "admin", threadId: parent ? parent.threadId ?? parent.id : id, parentId, needsReply, deliveredAt: null, adminDeliveredAt: null, adminReadAt: null, attachments: files,
    };
    bill.messages.unshift(m);
    emit("messages", "INSERT", m);
    return m;
  },
  adminRead(id) {
    const m = bill.messages.find((x) => x.id === id);
    if (m) { m.adminDeliveredAt ??= clockNow().toISOString(); m.adminReadAt = clockNow().toISOString(); emit("messages", "UPDATE", m); }
    return m;
  },
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
    p.months = p.months ?? 1;
    p.confirmedVia = via;
    p.confirmedAt = clockNow().toISOString();
    p.receiptNo = `EPM-R-2026-${String(900 + ++bill.seq).padStart(6, "0")}`;
    emit("payments", "UPDATE", p);
    emit("businesses", "UPDATE", bill.business);
    post("payment", "Payment received", `We received KES ${p.amount}. Receipt ${p.receiptNo}.`, { payment_id: p.id }, `payment:${p.id}`);
    return p;
  },
  // What the server does when Safaricom reports a payment for this seller: the money is credited, whole months are
  // taken from the credit and the listing is extended; anything left stays as credit. 0 just re-checks the credit.
  autoPay(amount) {
    const price = priceOf(bill.business.categoryId, bill.business.planKey);
    bill.business.creditKes = (bill.business.creditKes ?? 0) + amount;
    if (bill.intent) {
      // Money for an upgrade or category change is held for it, never taken as a renewal month.
      let q = null;
      try { q = instructionsFor(bill.intent); } catch { bill.intent = null; }
      if (q && q.amount > 0) {
        if (bill.business.creditKes >= q.amount) {
          const changeId = bill.intent.changeId;
          bill.intent = null;
          const out = spendCredit(q, changeId);
          emit("businesses", "UPDATE", bill.business);
          if (bill.business.creditKes < price) return out;
        } else {
          post("payment", "Payment received, balance due", `We received KES ${amount}. KES ${q.amount - bill.business.creditKes} more is needed.`, {}, null);
          emit("businesses", "UPDATE", bill.business);
          return { outcome: "held", credit: bill.business.creditKes };
        }
      }
    }
    const months = Math.min(Math.floor(bill.business.creditKes / price), 12);
    const day = (d) => new Date(`${d}T00:00:00+03:00`).toISOString();
    if (months >= 1) {
      const today = nairobiDay(clockNow());
      const paid = bill.business.paidUntil ? nairobiDay(bill.business.paidUntil) : null;
      const late = paid && today <= new Date(new Date(`${paid}T00:00:00Z`).getTime() + DAY).toISOString().slice(0, 10);
      const start = late ? paid : today;
      const end = addMonthsTo(start, months);
      bill.business.paidUntil = day(end);
      if (["pending", "expired"].includes(bill.business.status)) bill.business.status = "live";
      bill.business.creditKes -= months * price;
      const row = {
        id: `pay-${++bill.seq + 1}`, businessId: bill.business.id, amount: months * price, kind: "renewal", status: "confirmed", mpesaCode: `AUTO${String(bill.seq).padStart(6, "0")}`,
        planKey: bill.business.planKey, categoryId: bill.business.categoryId, accountRef: bill.business.sellerId, confirmedVia: "auto", declineReason: null,
        receiptNo: `EPM-R-2026-${String(900 + ++bill.seq).padStart(6, "0")}`, periodStart: start, periodEnd: end, months, submittedAt: clockNow().toISOString(),
        confirmedAt: clockNow().toISOString(), createdAt: clockNow().toISOString(), changeId: null,
      };
      bill.payments.unshift(row);
      emit("payments", "INSERT", row);
      post("payment", "Payment received", `We received your payment. ${months} month${months === 1 ? "" : "s"} added. Receipt ${row.receiptNo}.`, { payment_id: row.id }, `payment:${row.id}`);
    } else {
      post("payment", "Payment received, balance due", `We received KES ${amount}. One month costs KES ${price}.`, {}, null);
    }
    emit("businesses", "UPDATE", bill.business);
    return { outcome: months >= 1 ? "applied" : "part_paid", months, credit: bill.business.creditKes };
  },
  rejectPayment(id, reason = null) {
    const p = bill.payments.find((x) => x.id === id);
    p.status = "rejected";
    p.declineReason = reason;
    bill.usedCodes.delete(p.mpesaCode);
    emit("payments", "UPDATE", p);
  },
};
