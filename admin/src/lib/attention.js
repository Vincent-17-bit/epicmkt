// "Needs your attention": one row per kind of work, most urgent first, filtered by what this role can open.
import { durationText } from "./series.js";

const HOUR = 3_600_000;
const TONE_RANK = { danger: 0, warning: 1, info: 2, neutral: 3 };
const n = (v) => Math.max(0, Number(v) || 0);
const age = (iso, now) => (iso ? Math.max(0, now.getTime() - Date.parse(iso)) : null);

/**
 * @param counts  normalised admin_counts()
 * @param oldest  { applications: {id, at}|null, payments, flags, failedMessages, changes, expiry }  (ISO strings, or null)
 * @param opts    { can, now, snoozed: { [rowId]: untilMs } }
 * Each row: { id, title, count, detail, tone, to, permission, action: {kind: "link"|"startReview", label, to?, applicationId?}, snoozed }
 */
export function attentionItems(counts, oldest = {}, { can = () => true, now = new Date(), snoozed = {} } = {}) {
  const c = counts ?? {};
  const rows = [];
  const add = (row) => { if (row.count > 0 && can(row.permission)) rows.push({ ...row, snoozed: (snoozed[row.id] ?? 0) > now.getTime() }); };

  const appAge = age(oldest.applications?.at, now);
  add({
    id: "applications", title: "Applications waiting for review", count: n(c.submitted), permission: "applications.view",
    detail: [appAge != null ? `Oldest has waited ${durationText(appAge)}` : null, n(c.under_review) ? `${n(c.under_review)} already under review` : null].filter(Boolean).join(" · "),
    tone: appAge == null ? "info" : appAge > 24 * HOUR ? "danger" : appAge > 4 * HOUR ? "warning" : "info",
    to: "/admin/applications?status=submitted",
    action: oldest.applications?.id && can("applications.decide")
      ? { kind: "startReview", label: "Start review", applicationId: oldest.applications.id, to: "/admin/applications?status=under_review" }
      : { kind: "link", label: "Open queue", to: "/admin/applications?status=submitted" },
  });

  const payAge = age(oldest.payments, now);
  add({
    id: "payments", title: "Payments awaiting confirmation", count: n(c.unconfirmed_payments), permission: "payments.view",
    detail: payAge != null ? `Oldest has waited ${durationText(payAge)}` : "",
    tone: payAge == null ? "info" : payAge > 24 * HOUR ? "danger" : "warning",
    to: "/admin/payments?status=submitted",
    action: { kind: "link", label: can("payments.confirm") ? "Confirm" : "View", to: "/admin/payments?status=submitted" },
  });

  add({
    id: "failed", title: "Messages that failed to send", count: n(c.failed_messages), permission: "messages.view",
    detail: age(oldest.failedMessages, now) != null ? `Oldest failed ${durationText(age(oldest.failedMessages, now))} ago` : "",
    tone: "danger", to: "/admin/messages?status=failed", action: { kind: "link", label: "Review", to: "/admin/messages?status=failed" },
  });

  const flagAge = age(oldest.flags, now);
  add({
    id: "moderation", title: "Open flags and reports", count: n(c.open_flags) + n(c.open_reports), permission: "moderation.view",
    detail: [n(c.open_flags) ? `${n(c.open_flags)} flags` : null, n(c.open_reports) ? `${n(c.open_reports)} reports` : null].filter(Boolean).join(" · "),
    tone: flagAge != null && flagAge > 48 * HOUR ? "warning" : "info", to: "/admin/moderation", action: { kind: "link", label: "Open", to: "/admin/moderation" },
  });

  add({
    id: "changes", title: "Change requests to decide", count: n(c.pending_changes), permission: "changes.view",
    detail: age(oldest.changes, now) != null ? `Oldest has waited ${durationText(age(oldest.changes, now))}` : "",
    tone: "info", to: "/admin/changes", action: { kind: "link", label: "Decide", to: "/admin/changes" },
  });

  const expiryIn = oldest.expiry ? Date.parse(oldest.expiry) - now.getTime() : null;
  add({
    id: "expiring", title: "Sellers expiring within 7 days", count: n(c.expiring_7d) + n(c.in_grace), permission: "businesses.view",
    detail: [n(c.in_grace) ? `${n(c.in_grace)} in grace now` : null, expiryIn != null && expiryIn > 0 ? `Next one expires in ${durationText(expiryIn)}` : null].filter(Boolean).join(" · "),
    tone: n(c.in_grace) > 0 ? "warning" : "info", to: "/admin/businesses?filter=expiring", action: { kind: "link", label: "See sellers", to: "/admin/businesses?filter=expiring" },
  });

  add({
    id: "awaiting_payment", title: "Approved, waiting for the seller to pay", count: n(c.awaiting_payment), permission: "applications.view",
    detail: "Nothing to do unless they ask for help", tone: "neutral", to: "/admin/applications?status=approved", action: { kind: "link", label: "View", to: "/admin/applications?status=approved" },
  });

  return rows.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || b.count - a.count);
}
