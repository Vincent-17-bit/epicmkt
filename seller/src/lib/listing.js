const DAY_MS = 86_400_000;
const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const nairobiDay = (d) => new Date(new Date(d).getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
const toDay = (v) => (isDay(v) ? v : nairobiDay(v));
const fromDay = (day) => new Date(`${day}T00:00:00Z`);

export const daysLeft = (paidUntil, now = new Date()) => (paidUntil ? Math.round((fromDay(toDay(paidUntil)) - fromDay(toDay(now))) / DAY_MS) : null);

export function listingState(business, now = new Date()) {
  if (!business) return "unlisted";
  if (business.status === "deleted") return "deleted";
  if (business.status === "suspended") return "suspended";
  if (business.status === "pending" || business.unlisted) return "unlisted";
  if (business.status === "paused") return "paused";
  const left = daysLeft(business.paid_until, now);
  if (left === null) return "unlisted";
  if (left >= 0) return "live";
  if (left === -1) return "grace";
  return "expired";
}

export const STATE_LABELS = {
  live: "Live",
  grace: "Grace period",
  expired: "Hidden",
  paused: "Paused",
  suspended: "Suspended",
  unlisted: "Not listed",
  deleted: "Deleted"
};

export const STATE_TONES = {
  live: "ok",
  grace: "danger",
  expired: "danger",
  paused: "neutral",
  suspended: "danger",
  unlisted: "neutral",
  deleted: "neutral"
};

const READ_ONLY = new Set(["suspended", "unlisted"]);
const OPEN_WHEN_LOCKED = ["/subscription", "/notifications", "/help"];

export const isLocked = (state) => READ_ONLY.has(state);

export function canOpen(state, path) {
  if (!isLocked(state)) return true;
  return OPEN_WHEN_LOCKED.some((p) => path === p || path.startsWith(`${p}/`));
}

export const highlightSubscription = (state) => state === "grace" || state === "expired";

export function banner(state, left) {
  if (state === "grace") return { kind: "grace", tone: "urgent", title: "Your listing expires today", text: "Renew now to stay visible to customers.", action: { label: "Renew", to: "/subscription" } };
  if (state === "expired") return { kind: "expired", tone: "urgent", title: "Your listing is hidden", text: "Customers cannot see it. You can still edit everything.", action: { label: "Renew", to: "/subscription" } };
  if (state === "paused") return { kind: "paused", tone: "notice", title: "Your listing is paused", text: "Customers cannot see it until you resume.", action: { label: "Resume", resume: true } };
  if (state === "live" && left !== null && left <= 3) return { kind: "expiring", tone: "urgent", title: left === 0 ? "Your listing expires today" : `Your listing expires in ${left} ${left === 1 ? "day" : "days"}`, text: "Renew to stay visible.", action: { label: "Renew", to: "/subscription" } };
  if (state === "live" && left !== null && left <= 7) return { kind: "expiring", tone: "notice", title: `Your listing expires in ${left} days`, text: "Renew any time before then.", action: { label: "Renew", to: "/subscription" } };
  return null;
}

export const LOCK_COPY = {
  suspended: { title: "Your listing is suspended", text: "Customers cannot see it and editing is turned off." },
  unlisted: { title: "Your listing is not live yet", text: "Editing is turned off until it goes live." }
};
