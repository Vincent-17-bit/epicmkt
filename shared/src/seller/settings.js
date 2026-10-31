// Seller settings: defaults, sanitising, messaging rules and delivery policy.
// Pure and dependency free so the portal, the mock API and the edge functions share one copy.

export const THEMES = ["light", "dark", "system"];
export const TEXT_SIZES = ["normal", "large", "xlarge"];
export const DENSITIES = ["comfortable", "compact"];
export const CARD_VIEWS = ["comfortable", "compact", "list"];
export const PRICE_REMINDER_DAYS = [14, 30, 60];
export const AVAILABILITY_DEFAULTS = ["available", "limited_stock", "out_of_stock", "unavailable"];
export const CHANNELS = ["in_app", "sms", "email"];

export const GREETING_MAX = 160;
export const GREETING_VARIABLES = ["item", "price"];
export const CLOSURE_REASON_LIMIT = 8;
export const CLOSURE_LABEL_MAX = 40;
export const CLOSURE_MESSAGE_MAX = 140;
export const PARTIAL_MESSAGE_MAX = 140;
export const UNITS_PER_CATEGORY = 12;
export const UNIT_MAX = 20;
export const THRESHOLD_MAX = 1000;

export const NOTIFICATION_EVENTS = [
  { key: "expiry", label: "Expiry reminders", hint: "Before your listing expires.", critical: true },
  { key: "payment", label: "Payment confirmations", hint: "When we receive a payment.", critical: true },
  { key: "admin_question", label: "Questions from EpicMKT", hint: "When the team needs an answer from you.", critical: true },
  { key: "suspension", label: "Suspension notices", hint: "If your listing is suspended.", critical: true },
  { key: "change_decision", label: "Change request decisions", hint: "When a change you asked for is decided.", critical: false },
  { key: "customer_report", label: "Customer reports", hint: "When a customer reports an item or your listing.", critical: false },
  { key: "removal", label: "Removals", hint: "When something is hidden or removed by an admin.", critical: false },
  { key: "closure_reminder", label: "Closure reminders", hint: "A nudge to reopen after a temporary closure.", critical: false }
];

export const EVENT_KEYS = NOTIFICATION_EVENTS.map((e) => e.key);
export const CRITICAL_EVENTS = NOTIFICATION_EVENTS.filter((e) => e.critical).map((e) => e.key);
export const isCriticalEvent = (key) => CRITICAL_EVENTS.includes(key);

export const DEFAULT_GREETING = "Hi! I saw {item} ({price}) on EpicMKT. Is it still available?";

export const DEFAULT_CLOSURE_REASONS = [
  { id: "lunch", label: "Lunch break", message: "Back shortly. Thanks for your patience." },
  { id: "stock", label: "Restocking", message: "Restocking today. Please check again later." },
  { id: "family", label: "Family emergency", message: "Closed for now. We will reopen soon." },
  { id: "holiday", label: "Holiday", message: "Closed for the holiday. See you soon." },
  { id: "maintenance", label: "Maintenance", message: "Closed for maintenance. Back soon." }
];

const channelDefaults = {
  expiry: { in_app: true, sms: true, email: false },
  payment: { in_app: true, sms: true, email: false },
  admin_question: { in_app: true, sms: true, email: false },
  suspension: { in_app: true, sms: true, email: false },
  change_decision: { in_app: true, sms: true, email: false },
  customer_report: { in_app: true, sms: false, email: false },
  removal: { in_app: true, sms: true, email: false },
  closure_reminder: { in_app: true, sms: false, email: false }
};

export const DEFAULT_SETTINGS = Object.freeze({
  saved_views: [],
  appearance: { theme: "system", text_size: "normal", density: "comfortable", reduce_motion: false, remember_card_view: true, card_view: null },
  notifications: { events: channelDefaults },
  catalog: { default_availability: "available", low_stock_threshold: 3, price_reminder_days: 30, start_visible: false, default_units: {}, show_only_n_left: false },
  messaging: { whatsapp_greeting: DEFAULT_GREETING, closure_reasons: DEFAULT_CLOSURE_REASONS },
  business: { show_closes_chip: true, partial_closure_message: "Some services are unavailable right now.", announcement: { enabled: false, text: "", days: 7 } },
  onboarding: { status: "active", dismissed_tips: [], completed_at: null, qr_seen: false }
});

export const clone = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const bool = (value, fallback) => (typeof value === "boolean" ? value : fallback);
const int = (value, min, max, fallback) => (Number.isInteger(value) && value >= min && value <= max ? value : fallback);
const text = (value, max, fallback) => (typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : fallback);



// ---- greeting ---------------------------------------------------------------------------------
// A phone-like run is 7+ digits once separators (space, dash, dot, brackets, plus) are ignored.
const phoneLike = (s) => /(?:\+?\d[\s().-]*){7,}/.test(s);
const linkLike = (s) => /(https?:|www\.|wa\.me|bit\.ly|t\.me|\b[a-z0-9-]+\.(?:com|co|ke|org|net|io|me|app|link|ly|info|biz|dev)\b|[a-z0-9]\/[a-z0-9])/i.test(s);

export function greetingProblems(template) {
  const t = String(template ?? "");
  const problems = [];
  if (t.trim().length === 0) problems.push("empty");
  if (t.length > GREETING_MAX) problems.push("too_long");
  if (linkLike(t)) problems.push("has_link");
  if (phoneLike(t.replace(/\{[a-z]+\}/g, ""))) problems.push("has_phone");
  const names = [...t.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
  if (names.some((n) => !GREETING_VARIABLES.includes(n))) problems.push("unknown_variable");
  if (/[{}]/.test(t.replace(/\{(item|price)\}/g, ""))) problems.push("stray_brace");
  return problems;
}

export const GREETING_MESSAGES = {
  empty: "Write a greeting.",
  too_long: `Keep it under ${GREETING_MAX} characters.`,
  has_link: "Links are not allowed in the greeting.",
  has_phone: "Phone numbers are not allowed in the greeting.",
  unknown_variable: "Only {item} and {price} can be used.",
  stray_brace: "Curly brackets must wrap {item} or {price}."
};

export const renderGreeting = (template, { item = "this item", price = "" } = {}) =>
  String(template ?? "")
    .replace(/\{item\}/g, item)
    .replace(/\{price\}/g, price)
    .replace(/\s*\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

export const greetingFor = (settings, vars) => {
  const raw = settings?.messaging?.whatsapp_greeting;
  const t = typeof raw === "string" && greetingProblems(raw).length === 0 ? raw : DEFAULT_GREETING;
  return renderGreeting(t, vars);
};

export const plainTextProblem = (value, max) => {
  const t = String(value ?? "");
  if (t.trim().length === 0) return "empty";
  if (t.length > max) return "too_long";
  if (linkLike(t)) return "has_link";
  if (phoneLike(t)) return "has_phone";
  return null;
};

// ---- sanitising -------------------------------------------------------------------------------
const sanitizeEvents = (raw) => {
  const out = {};
  for (const key of EVENT_KEYS) {
    const base = channelDefaults[key];
    const src = isObj(raw) && isObj(raw[key]) ? raw[key] : {};
    out[key] = {
      in_app: isCriticalEvent(key) ? true : bool(src.in_app, base.in_app),
      sms: bool(src.sms, base.sms),
      email: bool(src.email, base.email)
    };
  }
  return out;
};

const sanitizeUnits = (raw) => {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [cat, list] of Object.entries(raw).slice(0, 60)) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(cat) || !Array.isArray(list)) continue;
    const seen = new Set();
    const units = [];
    for (const u of list) {
      const v = typeof u === "string" ? u.trim() : "";
      if (v && v.length <= UNIT_MAX && !seen.has(v.toLowerCase())) {
        seen.add(v.toLowerCase());
        units.push(v);
      }
      if (units.length >= UNITS_PER_CATEGORY) break;
    }
    out[cat] = units;
  }
  return out;
};

const sanitizeReasons = (raw) => {
  if (!Array.isArray(raw)) return clone(DEFAULT_CLOSURE_REASONS);
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    if (!isObj(r)) continue;
    const label = typeof r.label === "string" ? r.label.trim() : "";
    const message = typeof r.message === "string" ? r.message.trim() : "";
    const id = typeof r.id === "string" && /^[a-z0-9_-]{1,40}$/i.test(r.id) ? r.id : null;
    if (!id || !label || label.length > CLOSURE_LABEL_MAX || message.length > CLOSURE_MESSAGE_MAX || seen.has(id)) continue;
    if (plainTextProblem(label, CLOSURE_LABEL_MAX) || (message && plainTextProblem(message, CLOSURE_MESSAGE_MAX))) continue;
    seen.add(id);
    out.push({ id, label, message });
    if (out.length >= CLOSURE_REASON_LIMIT) break;
  }
  return out.length ? out : clone(DEFAULT_CLOSURE_REASONS);
};

// Returns a complete, valid settings object. Anything missing or invalid falls back to its default,
// so one corrupt value never breaks the portal.
export function resolveSettings(raw) {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  const a = isObj(r.appearance) ? r.appearance : {};
  const n = isObj(r.notifications) ? r.notifications : {};
  const c = isObj(r.catalog) ? r.catalog : {};
  const m = isObj(r.messaging) ? r.messaging : {};
  const b = isObj(r.business) ? r.business : {};
  const ann = isObj(b.announcement) ? b.announcement : {};
  const o = isObj(r.onboarding) ? r.onboarding : {};
  const partial = typeof b.partial_closure_message === "string" && b.partial_closure_message.trim() && !plainTextProblem(b.partial_closure_message, PARTIAL_MESSAGE_MAX) ? b.partial_closure_message.trim() : d.business.partial_closure_message;
  return {
    saved_views: Array.isArray(r.saved_views) ? r.saved_views : [],
    appearance: {
      theme: pick(a.theme, THEMES, d.appearance.theme),
      text_size: pick(a.text_size, TEXT_SIZES, d.appearance.text_size),
      density: pick(a.density, DENSITIES, d.appearance.density),
      reduce_motion: bool(a.reduce_motion, d.appearance.reduce_motion),
      remember_card_view: bool(a.remember_card_view, d.appearance.remember_card_view),
      card_view: pick(a.card_view, CARD_VIEWS, null)
    },
    notifications: { events: sanitizeEvents(n.events) },
    catalog: {
      default_availability: pick(c.default_availability, AVAILABILITY_DEFAULTS, d.catalog.default_availability),
      low_stock_threshold: int(c.low_stock_threshold, 0, THRESHOLD_MAX, d.catalog.low_stock_threshold),
      price_reminder_days: pick(c.price_reminder_days, PRICE_REMINDER_DAYS, d.catalog.price_reminder_days),
      start_visible: bool(c.start_visible, d.catalog.start_visible),
      default_units: sanitizeUnits(c.default_units),
      show_only_n_left: bool(c.show_only_n_left, d.catalog.show_only_n_left)
    },
    messaging: {
      whatsapp_greeting: typeof m.whatsapp_greeting === "string" && greetingProblems(m.whatsapp_greeting).length === 0 ? m.whatsapp_greeting.trim() : DEFAULT_GREETING,
      closure_reasons: sanitizeReasons(m.closure_reasons)
    },
    business: {
      show_closes_chip: bool(b.show_closes_chip, d.business.show_closes_chip),
      partial_closure_message: partial,
      announcement: {
        enabled: bool(ann.enabled, false),
        text: typeof ann.text === "string" && ann.text.length <= 280 ? ann.text : "",
        days: int(ann.days, 1, 90, d.business.announcement.days)
      }
    },
    onboarding: {
      status: pick(o.status, ["active", "skipped", "done"], "active"),
      dismissed_tips: Array.isArray(o.dismissed_tips) ? o.dismissed_tips.filter((t) => typeof t === "string" && /^[a-z0-9_-]{1,40}$/i.test(t)).slice(0, 40) : [],
      completed_at: typeof o.completed_at === "string" ? o.completed_at : null,
      qr_seen: bool(o.qr_seen, false)
    }
  };
}

const merge = (base, patch) => {
  if (!isObj(patch)) return patch;
  const out = isObj(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : v;
  return out;
};

// Applies a partial change to the stored (raw) settings and returns the resolved result.
export const applySettingsPatch = (raw, patch) => resolveSettings(merge(isObj(raw) ? raw : {}, patch));
export const mergeSettings = merge;

export const SETTINGS_KEYS = ["saved_views", "appearance", "notifications", "catalog", "messaging", "business", "onboarding"];

// ---- delivery ---------------------------------------------------------------------------------
export const MESSAGE_KINDS = ["critical", "transactional", "normal"];

// Decides what to do with one message on one channel.
//  - in-app is always delivered for critical events, otherwise it follows the preference
//  - sms and email follow the preference
export function deliveryDecision({ event, channel, kind = "normal", settings, now = new Date() }) {
  if (!EVENT_KEYS.includes(event) || !CHANNELS.includes(channel)) return { action: "skip", reason: "unknown" };
  const s = resolveSettings(settings);
  const critical = isCriticalEvent(event);
  const pref = s.notifications.events[event][channel];
  if (channel === "in_app") return critical || pref ? { action: "send" } : { action: "skip", reason: "disabled" };
  if (!pref) return { action: "skip", reason: "disabled" };
  return { action: "send" };
}

// ---- login history ----------------------------------------------------------------------------
export function describeDevice(userAgent) {
  const ua = String(userAgent ?? "");
  if (!ua) return "Unknown device";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : null;
  const browser = /Edg\//i.test(ua) ? "Edge" : /OPR\/|Opera/i.test(ua) ? "Opera" : /SamsungBrowser/i.test(ua) ? "Samsung Internet" : /Firefox\//i.test(ua) ? "Firefox" : /Chrome\//i.test(ua) ? "Chrome" : /Safari\//i.test(ua) ? "Safari" : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

// events: newest first. Each row gets `failedBefore`, the failed attempts since the previous success.
export function summarizeLogins(events, limit = 20) {
  const asc = [...(events ?? [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  let failed = 0;
  const rows = asc.map((e) => {
    const row = { id: e.id, at: e.created_at, success: Boolean(e.success), device: describeDevice(e.user_agent), failedBefore: e.success ? failed : 0 };
    failed = e.success ? 0 : failed + 1;
    return row;
  });
  return { rows: rows.reverse().slice(0, limit), failedSinceLastSuccess: failed };
}

export const maskPhone = (phone) => String(phone ?? "").replace(/^(\+254\d)\d{5}(\d{3})$/, "$1*****$2");
