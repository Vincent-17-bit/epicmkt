// Pure helpers for the Audit viewer and Analytics: readable actions, before/after diffs and chart geometry.
import { businessDay } from "@epicmkt/shared";

const ACTIONS = {
  "payment.confirm": "Confirmed a payment", "payment.reject": "Rejected a payment", "payment.assign": "Assigned a payment",
  "application.approve": "Approved an application", "application.reject": "Rejected an application", "application.return": "Returned an application",
  "business.visibility": "Hid or showed a business", "business.extend": "Extended a subscription", "business.suspend": "Suspended a business",
  "item.hide": "Hid an item", "item.unhide": "Showed an item again", "flag.raise": "Asked a seller about something", "flag.status": "Changed a flag",
  "report.status": "Changed a report", "change.approve": "Approved a seller's change", "change.reject": "Rejected a seller's change",
  "conversation.resolve": "Resolved a conversation", "conversation.reopen": "Reopened a conversation", "message.queue": "Sent a broadcast", "message.retry": "Retried a message", "message.retry_failed": "Retried failed messages",
  "template.create": "Created a message template", "template.update": "Edited a message template",
  "job.pause": "Paused an automation job", "job.resume": "Resumed an automation job", "job.run": "Ran an automation job",
  "plan.update": "Changed a plan", "business.grace": "Changed the grace period", "settings.update": "Changed system settings", "category.create": "Created a category", "category.update": "Edited a category",
};

/** "item.hide" -> "Hid an item". Unknown actions are made readable: "foo.bar_baz" -> "Foo: bar baz". */
export function actionLabel(action) {
  if (!action) return "Unknown action";
  if (ACTIONS[action]) return ACTIONS[action];
  const [head, ...rest] = String(action).split(".");
  const tail = rest.join(" ").replace(/_/g, " ");
  const h = head.charAt(0).toUpperCase() + head.slice(1).replace(/_/g, " ");
  return tail ? `${h}: ${tail}` : h;
}

const show = (v) => (v === null || v === undefined ? "–" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** The fields that changed between two snapshots: [{ field, from, to }]. Handles a missing side (create or delete). */
export function diffRows(before, after) {
  const b = before && typeof before === "object" ? before : {};
  const a = after && typeof after === "object" ? after : {};
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].sort()
    .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((field) => ({ field, from: show(b[field]), to: show(a[field]) }));
}

/** yyyy-mm-dd for an input type=date, in Nairobi time. */
export const nairobiDay = (date = new Date()) => businessDay(date);

// ---- Charts ------------------------------------------------------------------------------------------------------

/** Bars for an SVG chart: geometry only. Always leaves a visible sliver for non-zero values so small days are not invisible. */
export function barGeometry(values, { width = 600, height = 140, gap = 2 } = {}) {
  const n = values.length;
  if (n === 0) return { bars: [], max: 0 };
  const max = Math.max(...values, 0);
  const w = Math.max(1, (width - gap * (n - 1)) / n);
  const bars = values.map((v, i) => {
    const h = max === 0 ? 0 : v === 0 ? 0 : Math.max(2, (v / max) * height);
    return { x: i * (w + gap), y: height - h, width: w, height: h, value: v };
  });
  return { bars, max };
}

export const kes = (n) => `KES ${Number(n ?? 0).toLocaleString("en-KE")}`;

export function percent(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

/** Funnel rows with the share of the first step and the drop from the step before. */
export function funnelRows(f = {}) {
  const steps = [["Submitted", f.submitted], ["Approved", f.approved], ["Activated", f.activated]];
  return steps.map(([label, value], i) => ({
    label, value: value ?? 0,
    ofFirst: percent(value ?? 0, f.submitted),
    ofPrevious: i === 0 ? null : percent(value ?? 0, steps[i - 1][1]),
  })).concat([{ label: "Rejected", value: f.rejected ?? 0, ofFirst: percent(f.rejected ?? 0, f.submitted), ofPrevious: null }]);
}
