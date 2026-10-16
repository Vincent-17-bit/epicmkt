// Everything about the applications queue's query that is not React and not the network:
//   URL <-> state, defaults, search-text cleaning, and the filter rules.
// The live API (api/live.js) turns `filterOps` into PostgREST calls. The demo API (api/mock.js) runs `runQuery`.
// Both come from the rules in this file, and queueQuery.test.js pins them.
import { slaCutoffs } from "./sla.js";

/** Tabs, in the order they are shown. `status` is the raw database value; "all" means every real status (never drafts). */
export const QUEUE_TABS = [
  { id: "submitted", label: "Submitted", status: "submitted" },
  { id: "under_review", label: "Under review", status: "under_review" },
  { id: "changes_requested", label: "Changes requested", status: "changes_requested" },
  { id: "approved", label: "Awaiting payment", status: "approved" },
  { id: "payment_confirming", label: "Payment confirming", status: "payment_confirming" },
  { id: "activated", label: "Activated", status: "activated" },
  { id: "rejected", label: "Rejected", status: "rejected" },
  { id: "all", label: "All", status: null },
];
export const TAB_IDS = QUEUE_TABS.map((t) => t.id);
export const REAL_STATUSES = QUEUE_TABS.filter((t) => t.status).map((t) => t.status);

/** Tabs where work is waiting: oldest first by default, so the longest wait is at the top. */
const WORK_TABS = new Set(["submitted", "under_review", "changes_requested", "payment_confirming"]);

export const SORT_KEYS = ["submitted_at", "business_name", "owner_full_name", "category_id", "plan_key", "price_at_submission", "status"];
export const PAGE_SIZES = [25, 50, 100];
export const DEFAULT_SIZE = 50;
export const PLANS = ["standard", "premium"];
export const MAX_SEARCH = 80;

export const defaultSort = (status) => ({ sort: "submitted_at", dir: WORK_TABS.has(status) ? "asc" : "desc" });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);

/** Clean, trimmed, length-limited search text with single spaces. */
export const cleanSearch = (q) => String(q ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH);

/** Anything may arrive in a URL. This returns a complete, valid query and never throws. */
export function normalizeQuery(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const status = oneOf(input.status, TAB_IDS, "submitted");
  const fallback = defaultSort(status);
  const sort = oneOf(input.sort, SORT_KEYS, fallback.sort);
  const dir = input.sort && SORT_KEYS.includes(input.sort) ? oneOf(input.dir, ["asc", "desc"], fallback.dir) : fallback.dir;
  const page = Math.max(1, Math.floor(Number(input.page)) || 1);
  const size = PAGE_SIZES.includes(Number(input.size)) ? Number(input.size) : DEFAULT_SIZE;
  const assignee = input.assignee === "me" || input.assignee === "none" || UUID.test(String(input.assignee ?? "")) ? input.assignee : "any";
  const sla = status === "submitted" || status === "all" ? oneOf(input.sla, ["breached", "soon", "ok"], "") : "";
  return {
    status, q: cleanSearch(input.q), category: String(input.category ?? "").replace(/[^a-z0-9-]/gi, "").slice(0, 50),
    plan: oneOf(input.plan, PLANS, ""), assignee, sla, sort, dir, page, size,
  };
}

/** URL parameters from a query, leaving out anything that is the default so shared links stay short. */
export function toParams(query) {
  const q = normalizeQuery(query);
  const params = new URLSearchParams();
  if (q.status !== "submitted") params.set("status", q.status);
  if (q.q) params.set("q", q.q);
  if (q.category) params.set("category", q.category);
  if (q.plan) params.set("plan", q.plan);
  if (q.assignee !== "any") params.set("assignee", q.assignee);
  if (q.sla) params.set("sla", q.sla);
  const fallback = defaultSort(q.status);
  if (q.sort !== fallback.sort || q.dir !== fallback.dir) { params.set("sort", q.sort); params.set("dir", q.dir); }
  if (q.page > 1) params.set("page", String(q.page));
  if (q.size !== DEFAULT_SIZE) params.set("size", String(q.size));
  return params;
}

export const fromParams = (params) => normalizeQuery(Object.fromEntries(params instanceof URLSearchParams ? params.entries() : Object.entries(params ?? {})));

/** The part of a query a saved view remembers: what you are looking at, not where you are scrolled or what you typed. */
export const VIEW_KEYS = ["status", "category", "plan", "assignee", "sla", "sort", "dir", "size"];
export const viewState = (query) => Object.fromEntries(VIEW_KEYS.map((k) => [k, query[k]]));

/** True when anything beyond the tab is narrowing the list. */
export const hasFilters = (q) => Boolean(q.q || q.category || q.plan || q.assignee !== "any" || q.sla);

// ---- search ----------------------------------------------------------------------------------------------------

export const SEARCH_FIELDS = ["business_name", "reference_no", "owner_full_name", "phone", "email"];

/** Escapes the LIKE wildcards so a typed % or _ matches itself. */
export const likeEscape = (text) => text.replace(/[\\%_]/g, "\\$&");
/** PostgREST filter values containing commas, dots or brackets must be double-quoted; inside quotes \ and " are escaped. */
export const quoteValue = (text) => `"${text.replace(/[\\"]/g, "\\$&")}"`;

/** "0700 000 001", "+254 700 000 001" and "254700000001" all reduce to the same last nine digits. */
export function phoneTail(term) {
  const digits = term.replace(/\D/g, "");
  if (digits.length < 6 || term.replace(/[\d\s+()-]/g, "") !== "") return ""; // only numbers and phone punctuation
  return digits.replace(/^(254|0)/, "").slice(-9);
}

/** The value of a PostgREST or=(...) filter for the search box, or "" when there is nothing to search for. */
export function searchFilter(q) {
  const term = cleanSearch(q);
  if (!term) return "";
  const like = quoteValue(`%${likeEscape(term)}%`);
  const clauses = SEARCH_FIELDS.map((field) => `${field}.ilike.${like}`);
  const tail = phoneTail(term);
  if (tail) clauses.push(`phone.ilike.${quoteValue(`%${likeEscape(tail)}%`)}`);
  return clauses.join(",");
}

// ---- filters ---------------------------------------------------------------------------------------------------

/**
 * The filters of a query as a list of [method, ...args] in PostgREST builder terms, in a fixed order.
 * `skip` lists filter names to leave out (tab counts skip "status", "sla").
 */
export function filterOps(query, { me = null, now = new Date(), skip = [] } = {}) {
  const q = normalizeQuery(query);
  const off = new Set(skip);
  const ops = [];
  const tab = QUEUE_TABS.find((t) => t.id === q.status);
  if (!off.has("status")) ops.push(tab.status ? ["eq", "status", tab.status] : ["in", "status", REAL_STATUSES]);
  if (q.category) ops.push(["eq", "category_id", q.category]);
  if (q.plan) ops.push(["eq", "plan_key", q.plan]);
  if (q.assignee === "me") ops.push(me ? ["eq", "reviewer_id", me] : ["is", "reviewer_id", null]);
  else if (q.assignee === "none") ops.push(["is", "reviewer_id", null]);
  else if (q.assignee !== "any") ops.push(["eq", "reviewer_id", q.assignee]);
  if (q.sla && !off.has("sla")) {
    const { breach, warn } = slaCutoffs(now);
    ops.push(["eq", "status", "submitted"]);
    if (q.sla === "breached") ops.push(["lt", "submitted_at", breach]);
    if (q.sla === "soon") ops.push(["gte", "submitted_at", breach], ["lt", "submitted_at", warn]);
    if (q.sla === "ok") ops.push(["gte", "submitted_at", warn]);
  }
  const search = searchFilter(q.q);
  if (search) ops.push(["or", search]);
  return ops;
}

/** The sort as PostgREST wants it: the chosen column, then id so pages never shuffle when values tie. */
export const orderOps = (query) => {
  const q = normalizeQuery(query);
  return [[q.sort, { ascending: q.dir === "asc", nullsFirst: false }], ["id", { ascending: true }]];
};

/** The row range for a page, inclusive on both ends, as PostgREST's .range(from, to) expects. */
export const pageRange = (query) => {
  const q = normalizeQuery(query);
  const from = (q.page - 1) * q.size;
  return [from, from + q.size - 1];
};

// ---- the in-memory engine (demo mode, and the reference for the rules above) ------------------------------------

const folded = (v) => String(v ?? "").toLowerCase();
const digitsOnly = (v) => String(v ?? "").replace(/\D/g, "");

function matchesSearch(row, term) {
  const t = folded(cleanSearch(term));
  if (!t) return true;
  if (SEARCH_FIELDS.some((f) => folded(row[f]).includes(t))) return true;
  const tail = phoneTail(cleanSearch(term));
  return Boolean(tail) && digitsOnly(row.phone).includes(tail);
}

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Filters, sorts and pages `rows` exactly as the server does. Returns { rows, total }. */
export function runQuery(rows, query, { me = null, now = new Date(), skip = [], paginate = true } = {}) {
  const q = normalizeQuery(query);
  const off = new Set(skip);
  const tab = QUEUE_TABS.find((t) => t.id === q.status);
  const { breach, warn } = slaCutoffs(now);
  const matches = rows.filter((row) => {
    if (!REAL_STATUSES.includes(row.status)) return false; // drafts never show
    if (!off.has("status") && tab.status && row.status !== tab.status) return false;
    if (q.category && row.category_id !== q.category) return false;
    if (q.plan && row.plan_key !== q.plan) return false;
    if (q.assignee === "me" && (me ? row.reviewer_id !== me : row.reviewer_id != null)) return false;
    if (q.assignee === "none" && row.reviewer_id != null) return false;
    if (q.assignee !== "any" && q.assignee !== "me" && q.assignee !== "none" && row.reviewer_id !== q.assignee) return false;
    if (q.sla && !off.has("sla")) {
      if (row.status !== "submitted" || !row.submitted_at) return false;
      if (q.sla === "breached" && !(row.submitted_at < breach)) return false;
      if (q.sla === "soon" && !(row.submitted_at >= breach && row.submitted_at < warn)) return false;
      if (q.sla === "ok" && !(row.submitted_at >= warn)) return false;
    }
    return matchesSearch(row, q.q);
  });
  const sign = q.dir === "asc" ? 1 : -1;
  matches.sort((a, b) => {
    const x = a[q.sort], y = b[q.sort];
    if (x == null && y == null) return compare(a.id, b.id);
    if (x == null) return 1; // missing values always last, like nullsFirst: false
    if (y == null) return -1;
    const text = typeof x === "string" && q.sort !== "submitted_at";
    return (text ? compare(folded(x), folded(y)) : compare(x, y)) * sign || compare(a.id, b.id);
  });
  const [from, to] = pageRange(q);
  return { rows: paginate ? matches.slice(from, to + 1) : matches, total: matches.length };
}
