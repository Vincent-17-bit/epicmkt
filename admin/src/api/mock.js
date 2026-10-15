import { normalizeCounts } from "./counts.js";
import { buildDashboard } from "./dashboard.js";

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
};

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

function rawFor(now) {
  const t = now.getTime();
  return {
    waitingOver24h: 2,
    oldest: {
      applications: { id: "mock-app-1", at: new Date(t - 27 * HOUR).toISOString() },
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
  return normalizeCounts(state.counts);
}

export async function getDashboard() {
  await wait();
  const now = new Date();
  const data = buildDashboard(rawFor(now), now);
  data.waitingOver24h = state.counts.submitted > 0 ? 2 : 0;
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

export async function startReview() {
  await wait(250);
  state.counts.submitted = Math.max(0, state.counts.submitted - 1);
  state.counts.under_review += 1;
  return "under_review";
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
    for (const [key, by] of Object.entries(event.counts)) state.counts[key] += by;
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
