// Pure rules for the Businesses list and detail pages. No React, no network: everything here is unit-tested.
// The database is the authority (supabase/migrations/0011 and 0012); this file mirrors its rules so the UI can
// hide, disable and pre-validate, and so a mismatch shows up in a test instead of in front of an admin.

export const ROLES = ["owner", "reviewer", "finance", "support"];

export const TABS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "expiring", label: "Expiring" },
  { key: "grace", label: "In grace" },
  { key: "expired", label: "Expired" },
  { key: "paused", label: "Unlisted" },
  { key: "suspended", label: "Suspended" },
  { key: "pending", label: "Pending" },
  { key: "featured", label: "Featured" },
  { key: "recycle", label: "Recycle bin" },
];
export const TAB_KEYS = TABS.map((t) => t.key);

export const SORTS = ["name", "paid_until", "health", "town", "created_at", "last_login_at", "open_flags"];

export const DETAIL_TABS = [
  { key: "overview", label: "Overview" },
  { key: "documents", label: "Documents" },
  { key: "payments", label: "Payments" },
  { key: "messages", label: "Messages" },
  { key: "activity", label: "Activity" },
  { key: "notes", label: "Notes" },
  { key: "hours", label: "Hours and closures" },
  { key: "team", label: "Team and timetable" },
  // Owned by B3c: they render an empty state for now.
  { key: "items", label: "Items", later: true },
  { key: "faqs", label: "FAQs", later: true },
  { key: "offers", label: "Offers", later: true },
  { key: "gallery", label: "Gallery", later: true },
  { key: "flags", label: "Flags", later: true },
];

const MODERATORS = ["reviewer", "support"];

// `roles` is who may run it (owner always may). `reason` means a 3..300 character reason. `typed` means the admin must
// type the business name. `when` says which businesses the action applies to.
export const ACTIONS = {
  suspend: { label: "Suspend", fn: "admin_suspend_business", roles: MODERATORS, reason: true, typed: true, danger: true, bulk: true,
    when: (b) => !b.deleted_at && ["live", "paused", "expired"].includes(b.status),
    help: "Customers stop seeing this business immediately. The seller is not deleted." },
  unsuspend: { label: "Unsuspend", fn: "admin_unsuspend_business", roles: MODERATORS, reason: true, bulk: true,
    when: (b) => !b.deleted_at && b.status === "suspended", help: "Puts the business back live. Customers see it again if it is paid." },
  unlist: { label: "Unlist", fn: "admin_unlist_business", roles: MODERATORS, reason: true, bulk: true,
    when: (b) => !b.deleted_at && b.status === "live", help: "Hides it from customers without a suspension." },
  relist: { label: "Relist", fn: "admin_relist_business", roles: MODERATORS, reason: false, bulk: true,
    when: (b) => !b.deleted_at && b.status === "paused", help: "Makes an unlisted business live again." },
  feature: { label: "Feature", fn: "admin_feature_business", roles: MODERATORS, reason: false, bulk: true,
    when: (b) => !b.deleted_at && !b.featured && ["live", "paused"].includes(b.status), help: "Pins it to the featured places for a number of days." },
  unfeature: { label: "Remove feature", fn: "admin_feature_business", roles: MODERATORS, reason: false, bulk: false,
    when: (b) => !b.deleted_at && b.featured, help: "Takes it off the featured places." },
  extend: { label: "Extend days", fn: "admin_extend_business", roles: ["finance"], reason: true, bulk: true,
    when: (b) => !b.deleted_at && ["live", "paused", "suspended", "expired"].includes(b.status),
    help: "Adds free days from the later of today and the paid-until date. Use it for goodwill, not for payments." },
  verify: { label: "Set verification", fn: "admin_set_business_verification", roles: MODERATORS, reason: true, bulk: false,
    when: (b) => !b.deleted_at, help: "Verified shows a badge to customers." },
  strikes: { label: "Adjust strikes", fn: "admin_adjust_business_strikes", roles: MODERATORS, reason: true, bulk: false,
    when: (b) => !b.deleted_at, help: "Add or remove a strike (1 to 3 at a time)." },
  delete: { label: "Move to recycle bin", fn: "admin_delete_business", roles: [], reason: true, typed: true, danger: true, bulk: false,
    when: (b) => !b.deleted_at, help: "Customers stop seeing it and the seller can no longer use it. Only an owner can restore it." },
  restore: { label: "Restore", fn: "admin_restore_business", roles: [], reason: true, bulk: false,
    when: (b) => Boolean(b.deleted_at), help: "Comes back unlisted so you decide when customers see it again." },
};

// Bulk actions that are not a single-business action.
export const BULK_EXTRAS = [
  { key: "tag", label: "Tag", roles: MODERATORS },
  { key: "assign", label: "Assign agent", roles: MODERATORS },
  { key: "message", label: "Message", roles: MODERATORS },
  { key: "export", label: "Export CSV", roles: ROLES },
];

export const REASON_MIN = 3;
export const REASON_MAX = 300;

export function roleAllows(roles, role) {
  if (role === "owner") return true;
  return Array.isArray(roles) && roles.includes(role);
}

// The actions to show for one business, in a stable order. Unavailable ones are dropped, not greyed, except a role
// problem which is reported so the button can explain itself.
export function actionsFor(business, role) {
  if (!business) return [];
  return Object.entries(ACTIONS)
    .filter(([, a]) => a.when(business))
    .map(([key, a]) => ({ key, label: a.label, danger: Boolean(a.danger), allowed: roleAllows(a.roles, role), needsReason: Boolean(a.reason), typed: Boolean(a.typed), help: a.help }));
}

// Actions every selected row supports. An empty selection or a mixed one narrows to what all rows allow.
export function bulkActionsFor(rows, role) {
  if (!rows?.length) return [];
  const out = [];
  for (const [key, a] of Object.entries(ACTIONS)) {
    if (!a.bulk) continue;
    if (!rows.every((r) => a.when(r))) continue;
    out.push({ key, label: a.label, allowed: roleAllows(a.roles, role), needsReason: Boolean(a.reason), typed: Boolean(a.typed), danger: Boolean(a.danger) });
  }
  for (const e of BULK_EXTRAS) out.push({ key: e.key, label: e.label, allowed: roleAllows(e.roles, role), needsReason: false, typed: false, danger: false, extra: true });
  return out;
}

const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// Returns an error message, or null when the form can be submitted.
export function validateAction(key, form, business) {
  const a = ACTIONS[key];
  if (!a) return "Unknown action";
  const reason = String(form?.reason ?? "").trim();
  if (a.reason && reason.length < REASON_MIN) return `Give a reason of at least ${REASON_MIN} characters`;
  if (reason.length > REASON_MAX) return `Keep the reason under ${REASON_MAX} characters`;
  if (a.typed && norm(form?.typed) !== norm(business?.name)) return "Type the business name exactly to confirm";
  if (key === "extend") {
    const days = Number(form?.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) return "Days must be a whole number from 1 to 365";
  }
  if (key === "verify" && !["verified", "unverified"].includes(form?.level)) return "Choose a verification level";
  if (key === "strikes") {
    const d = Number(form?.delta);
    if (!Number.isInteger(d) || d === 0 || Math.abs(d) > 3) return "Change strikes by 1 to 3, up or down";
  }
  if (key === "feature") {
    if (form?.until && Number.isNaN(Date.parse(form.until))) return "Choose a valid end date";
    if (form?.until && Date.parse(form.until) <= Date.now()) return "The end date must be in the future";
  }
  return null;
}

// The RPC name and named arguments the live adapter sends for a single action.
export function buildActionCall(key, id, form = {}) {
  const a = ACTIONS[key];
  if (!a) throw new Error(`Unknown action ${key}`);
  const reason = String(form.reason ?? "").trim() || null;
  const base = { p_id: id };
  switch (key) {
    case "suspend": case "unsuspend": case "unlist": case "delete": case "restore":
      return { fn: a.fn, args: { ...base, p_reason: reason } };
    case "relist":
      return { fn: a.fn, args: { ...base, p_reason: reason } };
    case "feature":
      return { fn: a.fn, args: { ...base, p_featured: true, p_until: form.until ? new Date(form.until).toISOString() : null, p_rank: form.rank ? Number(form.rank) : null, p_reason: reason } };
    case "unfeature":
      return { fn: a.fn, args: { ...base, p_featured: false, p_until: null, p_rank: null, p_reason: reason } };
    case "extend":
      return { fn: a.fn, args: { ...base, p_days: Number(form.days), p_reason: reason } };
    case "verify":
      return { fn: a.fn, args: { ...base, p_level: form.level, p_reason: reason } };
    case "strikes":
      return { fn: a.fn, args: { ...base, p_delta: Number(form.delta), p_reason: reason } };
    default:
      throw new Error(`Unknown action ${key}`);
  }
}

// ---- time: Africa/Nairobi (UTC+3, no DST). Stored values are UTC. -------------------------------------------------

const EAT_MS = 3 * 60 * 60 * 1000;
export function nairobiDay(value) {
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return new Date(t + EAT_MS).toISOString().slice(0, 10);
}
const dayNumber = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86400000);

// Same rule as public.listing_state / public.days_left: active to the end of paid_until's day, one day of grace, then expired.
export function countdown(paidUntil, now = new Date()) {
  const paid = paidUntil ? nairobiDay(paidUntil) : null;
  if (!paid) return { state: "none", daysLeft: null, fraction: 0, label: "Not paid yet", tone: "muted" };
  const left = dayNumber(paid) - dayNumber(nairobiDay(now));
  if (left >= 0) {
    const tone = left <= 3 ? "danger" : left <= 7 ? "warn" : "good";
    return { state: "active", daysLeft: left, fraction: Math.min(left / 30, 1), tone, label: left === 0 ? "Last day" : `${left} day${left === 1 ? "" : "s"} left` };
  }
  if (left === -1) return { state: "grace", daysLeft: -1, fraction: 0.02, tone: "warn", label: "Grace day" };
  return { state: "expired", daysLeft: left, fraction: 0, tone: "danger", label: `Expired ${-left} days ago` };
}

export function healthTone(score) {
  if (!Number.isFinite(score)) return "muted";
  return score >= 75 ? "good" : score >= 45 ? "warn" : "danger";
}

export const STATUS_LABELS = {
  live: "Live", paused: "Unlisted", suspended: "Suspended", expired: "Expired", pending: "Pending", deleted: "Deleted",
};
export const statusLabel = (s) => STATUS_LABELS[s] ?? (s ? String(s) : "—");
export const statusTone = (s) => ({ live: "good", paused: "muted", suspended: "danger", expired: "danger", pending: "warn", deleted: "muted" }[s] ?? "muted");

// ---- list state <-> URL --------------------------------------------------------------------------------------------

export const DEFAULT_LIST = { tab: "all", q: "", sort: "name", dir: "asc", page: 1, filters: {} };
export const PAGE_SIZE = 25;
const FILTER_KEYS = ["plan", "category", "town", "verification", "featured", "tag", "agent", "unassigned", "minHealth", "maxHealth", "paidFrom", "paidTo", "hasFlags"];

export function parseList(params) {
  const get = (k) => params.get(k) ?? "";
  const tab = TAB_KEYS.includes(get("tab")) ? get("tab") : "all";
  const sort = SORTS.includes(get("sort")) ? get("sort") : "name";
  const dir = get("dir") === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number.parseInt(get("page"), 10) || 1);
  const filters = {};
  for (const k of FILTER_KEYS) {
    const v = get(`f_${k}`);
    if (v !== "") filters[k] = k === "featured" || k === "unassigned" || k === "hasFlags" ? v === "true" : v;
  }
  return { tab, q: get("q"), sort, dir, page, filters };
}

export function listToParams(list) {
  const p = new URLSearchParams();
  if (list.tab && list.tab !== "all") p.set("tab", list.tab);
  if (list.q) p.set("q", list.q);
  if (list.sort && list.sort !== "name") p.set("sort", list.sort);
  if (list.dir === "desc") p.set("dir", "desc");
  if (list.page > 1) p.set("page", String(list.page));
  for (const [k, v] of Object.entries(list.filters ?? {})) {
    if (FILTER_KEYS.includes(k) && v !== "" && v !== null && v !== undefined && v !== false) p.set(`f_${k}`, String(v));
  }
  return p;
}

export function activeFilterCount(filters) {
  return Object.entries(filters ?? {}).filter(([k, v]) => FILTER_KEYS.includes(k) && v !== "" && v !== null && v !== undefined && v !== false).length;
}

// ---- CSV export (the list's own rows; formulas are neutralised so a hostile name cannot run in Excel) ---------------

const CSV_COLUMNS = [
  ["Seller ID", "seller_id"], ["Name", "name"], ["Status", "status"], ["Plan", "plan_key"], ["Town", "town"], ["Phone", "phone"],
  ["Email", "email"], ["Owner", "owner_name"], ["Paid until", "paid_until"], ["Days left", "days_left"], ["Health", "health"],
  ["Verification", "verification_level"], ["Featured", "featured"], ["Tags", "tags"], ["Open flags", "open_flags"],
];

export function csvCell(value) {
  let s = Array.isArray(value) ? value.join("; ") : value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  const head = CSV_COLUMNS.map(([label]) => csvCell(label)).join(",");
  const body = (rows ?? []).map((r) => CSV_COLUMNS.map(([, key]) => csvCell(r[key])).join(","));
  return [head, ...body].join("\r\n");
}
