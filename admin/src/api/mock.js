import { normalizeCounts } from "./counts.js";
import { buildDashboard } from "./dashboard.js";
import { QUEUE_TABS, runQuery } from "../lib/queueQuery.js";
import { MOCK_CATEGORIES, MOCK_REVIEWERS, makeApplication, seedApplications } from "./mockApplications.js";

// Built-in demo data, used while VITE_SUPABASE_URL is empty. Same shapes as the live API, so every screen works the same.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const wait = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

// A small deterministic generator so the demo charts do not jump around on every reload.
const pseudo = (seed) => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };
const spread = (count, fromMs, toMs, seed, shape = (r) => r) => Array.from({ length: count }, (_, i) => new Date(fromMs + shape(pseudo(seed + i)) * (toMs - fromMs)).toISOString());

const state = {
  counts: {
    submitted: 4, under_review: 3, changes_requested: 2, awaiting_payment: 5, payment_confirming: 2,
    live: 142, expiring_7d: 6, in_grace: 2, expired: 9, suspended: 1,
    open_flags: 5, open_reports: 2, unconfirmed_payments: 8, failed_messages: 19, pending_changes: 12,
  },
  notifications: [],
  seq: 0,
  tick: 0,
  apps: null, // built on first use, see applications()
  me: MOCK_REVIEWERS[0].id, // the signed-in admin, as last reported by the queue page
};

// The demo's applications, shared by the queue, the counts and the dashboard so they always agree.
const applications = () => (state.apps ??= seedApplications());
const applicationListeners = new Set();
const announceRow = (row, event) => { for (const listener of applicationListeners) listener(row, event); };
const countStatus = (status) => applications().filter((a) => a.status === status).length;
const APP_COUNT_KEYS = { submitted: "submitted", under_review: "under_review", changes_requested: "changes_requested", awaiting_payment: "approved", payment_confirming: "payment_confirming" };

function seedNotifications(now) {
  const make = (minutesAgo, kind, data, name, read = false) => ({
    id: `mock-${++state.seq}`, kind, business_id: name ? `b-${state.seq}` : null, data, business: name ? { name } : null,
    read_at: read ? new Date(now - (minutesAgo - 1) * 60_000).toISOString() : null, created_at: new Date(now - minutesAgo * 60_000).toISOString(),
  });
  state.notifications = [
    make(3, "application_submitted", { business_name: "Mara Fresh Mart", reference_no: "EPM-2026-0412" }),
    make(11, "payment_submitted", { kind: "renewal" }, "Umoja Hardware"),
    make(46, "flag_reply", {}, "Green Valley Foods"),
    make(95, "change_request", { field: "phone" }, "Pwani Plaza"),
    make(190, "application_submitted", { business_name: "Zuri Studio", reference_no: "EPM-2026-0411" }, null, true),
    make(380, "payment_submitted", { kind: "first" }, "Karibu Corner", true),
    make(900, "deletion_requested", {}, "Imani House", true),
  ];
}

function oldestWaiting() {
  const waiting = applications().filter((a) => a.status === "submitted" && a.submitted_at).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  return waiting[0] ? { id: waiting[0].id, at: waiting[0].submitted_at } : null;
}

function rawFor(now) {
  const t = now.getTime();
  return {
    waitingOver24h: 2,
    oldest: {
      applications: oldestWaiting() ?? { id: "mock-app-1", at: new Date(t - 27 * HOUR).toISOString() },
      payments: new Date(t - 9 * HOUR).toISOString(), flags: new Date(t - 70 * HOUR).toISOString(),
      failedMessages: new Date(t - 5 * HOUR).toISOString(), changes: new Date(t - 30 * HOUR).toISOString(),
      expiry: new Date(t + 2 * DAY).toISOString(),
    },
    applications: spread(46, t - 14 * DAY, t, 1).map((submitted_at) => ({ submitted_at })),
    payments: spread(52, t - 14 * DAY, t, 77).map((created_at) => ({ created_at })),
    confirmed: spread(120, t - 170 * DAY, t, 5, (r) => r ** 0.6).map((confirmed_at, i) => ({ confirmed_at, amount_kes: [1500, 2500, 4500][i % 3] })),
    activations: spread(88, t - 170 * DAY, t, 9, (r) => r ** 0.7).map((first_paid_at) => ({ first_paid_at })),
    lapses: spread(41, t - 170 * DAY, t, 31).map((paid_until) => ({ paid_until })),
    upcoming: spread(11, t, t + 14 * DAY, 63).map((paid_until) => ({ paid_until })),
  };
}

export async function getAdminCounts() {
  await wait(60);
  const derived = Object.fromEntries(Object.entries(APP_COUNT_KEYS).map(([key, status]) => [key, countStatus(status)]));
  return normalizeCounts({ ...state.counts, ...derived });
}

export async function getDashboard() {
  await wait();
  const now = new Date();
  const data = buildDashboard(rawFor(now), now);
  data.waitingOver24h = applications().filter((a) => a.status === "submitted" && now - Date.parse(a.submitted_at) > DAY).length;
  return data;
}

export async function getNotifications({ limit = 30 } = {}) {
  await wait(60);
  if (state.notifications.length === 0) seedNotifications(Date.now());
  return { items: state.notifications.slice(0, limit).map((n) => ({ ...n })), unread: state.notifications.filter((n) => !n.read_at).length };
}

export async function markNotificationsRead(ids) {
  await wait(40);
  const at = new Date().toISOString();
  for (const n of state.notifications) if (!n.read_at && (ids === "all" || ids.includes(n.id))) n.read_at = at;
}

export async function startReview(applicationId) {
  await wait(250);
  const app = applications().find((a) => a.id === applicationId);
  if (app && app.status === "submitted") {
    Object.assign(app, { status: "under_review", reviewer_id: app.reviewer_id ?? state.me, review_started_at: new Date().toISOString() });
    announceRow({ ...app }, "UPDATE");
  }
  return app?.status ?? "under_review";
}

// The demo has no database to push changes, so it makes one up every 40 seconds, like a quiet day at the office.
const EVENTS = [
  { counts: { submitted: 1 }, kind: "application_submitted", data: { business_name: "Tumaini Express", reference_no: "EPM-2026-0420" } },
  { counts: { unconfirmed_payments: 1 }, kind: "payment_submitted", data: { kind: "renewal" }, name: "Safari Centre" },
  { counts: { open_flags: 1 }, kind: "flag_reply", data: {}, name: "Neema Works" },
];
export function subscribeLive({ onChange, onNotification, onStatus } = {}) {
  onStatus?.("live");
  const id = setInterval(() => {
    if (state.notifications.length === 0) seedNotifications(Date.now());
    const event = EVENTS[state.tick++ % EVENTS.length];
    for (const [key, by] of Object.entries(event.counts)) if (key !== "submitted") state.counts[key] += by;
    if (event.counts.submitted) {
      const app = makeApplication({ status: "submitted", hoursAgo: 0.01, seed: 900 + state.tick, now: Date.now() });
      app.business_name = event.data.business_name;
      app.reference_no = event.data.reference_no;
      applications().push(app);
      announceRow({ ...app }, "INSERT");
    }
    const row = {
      id: `mock-${++state.seq}`, kind: event.kind, business_id: event.name ? `b-${state.seq}` : null, data: event.data,
      business: event.name ? { name: event.name } : null, read_at: null, created_at: new Date().toISOString(),
    };
    state.notifications.unshift(row);
    onChange?.("admin_notifications");
    onNotification?.(row);
  }, 40_000);
  return () => clearInterval(id);
}

// ---------------------------------------------------------------------------------------------------------------
// Applications queue (B2a): the demo runs the same rules as the server (lib/queueQuery.js) over in-memory rows.
// ---------------------------------------------------------------------------------------------------------------

const withCategory = (row) => ({ ...row, category_name: MOCK_CATEGORIES.find((c) => c.id === row.category_id)?.name ?? row.category_name ?? null });

export async function listApplications(query, { me = null } = {}) {
  await wait(140);
  if (me) state.me = me;
  const { rows, total } = runQuery(applications(), query, { me });
  return { rows: rows.map(withCategory), total };
}

export async function getApplicationTabCounts(query, { me = null } = {}) {
  await wait(80);
  const real = QUEUE_TABS.filter((tab) => tab.status);
  const counts = Object.fromEntries(real.map((tab) => [tab.id, runQuery(applications(), { ...query, status: tab.id }, { me, skip: ["status", "sla"], paginate: false }).rows.filter((a) => a.status === tab.status).length]));
  counts.all = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return counts;
}

export async function exportApplications(query, { me = null, max = 5000 } = {}) {
  await wait(250);
  const { rows, total } = runQuery(applications(), query, { me, paginate: false });
  return { rows: rows.slice(0, max).map(withCategory), total, truncated: total > max };
}

export async function getQueueCategories() {
  await wait(40);
  return MOCK_CATEGORIES.map((c) => ({ ...c }));
}

export async function getReviewers() {
  await wait(60);
  return MOCK_REVIEWERS.map((r) => ({ ...r }));
}

// The demo enforces the same rules as admin_assign_applications in 0012: owners assign anything, reviewers only take
// work for themselves, and finished applications are left alone.
export async function assignApplications(ids, reviewerId, actor = { userId: state.me, role: "owner" }) {
  await wait(300);
  const unique = [...new Set(ids ?? [])];
  if (unique.length === 0) return { updated: 0, skipped: 0 };
  if (unique.length > 100) throw new Error("Select up to 100 applications at a time.");
  const isOwner = actor.role === "owner";
  if (!isOwner && actor.role !== "reviewer") throw new Error("Your role cannot assign these applications.");
  if (reviewerId && !MOCK_REVIEWERS.some((r) => r.id === reviewerId)) throw new Error("That person cannot review applications.");
  if (reviewerId && !isOwner && reviewerId !== actor.userId) throw new Error("Your role cannot assign these applications.");
  let updated = 0;
  for (const id of unique) {
    const app = applications().find((a) => a.id === id);
    if (!app || !["submitted", "under_review", "changes_requested"].includes(app.status)) continue;
    if (app.reviewer_id === (reviewerId ?? null)) continue;
    if (!isOwner && app.reviewer_id && app.reviewer_id !== actor.userId) continue;
    app.reviewer_id = reviewerId ?? null;
    announceRow({ ...app }, "UPDATE");
    updated += 1;
  }
  return { updated, skipped: unique.length - updated };
}

export function subscribeApplications({ onRow, onStatus } = {}) {
  onStatus?.("live");
  const listener = (row, event) => onRow?.(row, event);
  applicationListeners.add(listener);
  return () => { applicationListeners.delete(listener); };
}
