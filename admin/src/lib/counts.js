// Turns the raw jsonb from the `admin_counts()` RPC into the shape the admin screens use, and derives
// the sidebar badges and the "today's brief" sentence from it. Pure functions, no browser or Supabase.
//
// Two decisions worth knowing about:
//
// 1. "Payments to confirm" is payments.status = 'submitted' (renewals) PLUS applications in status
//    'payment_confirming'. A seller's FIRST payment is an M-Pesa code stored on the application, it does not
//    create a payments row until an admin confirms it (see status-payment-code and admin-confirm-payment).
//    Counting only the payments table would hide exactly the payments that gate a new business going live.
//
// 2. "Applications waiting" is submitted + under_review: the ones that need a reviewer's decision. Applications
//    in changes_requested or approved are waiting on the seller, not on us.

const n = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
};

export const EMPTY_COUNTS = Object.freeze({
  liveBusinesses: 0,
  applicationsSubmitted: 0,
  applicationsUnderReview: 0,
  applicationsChangesRequested: 0,
  applicationsAwaitingPayment: 0,
  applicationsWaiting: 0,
  applicationsOver24h: null,
  firstPaymentsToConfirm: 0,
  renewalPaymentsToConfirm: 0,
  unconfirmedPayments: 0,
  expiringSoon: 0,
  inGrace: 0,
  expired: 0,
  suspended: 0,
  openFlags: 0,
  openReports: 0,
  failedMessages: 0,
  pendingChanges: 0,
});

// `raw` is the admin_counts() object (snake_case). `extra.applicationsOver24h` is optional: it is not part of
// the RPC, and stays null (unknown) when the caller could not compute it.
export function normalizeCounts(raw, extra = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const submitted = n(r.submitted);
  const underReview = n(r.under_review);
  const firstPayments = n(r.payment_confirming);
  const renewals = n(r.unconfirmed_payments);
  const over24h = extra.applicationsOver24h;

  return {
    liveBusinesses: n(r.live),
    applicationsSubmitted: submitted,
    applicationsUnderReview: underReview,
    applicationsChangesRequested: n(r.changes_requested),
    applicationsAwaitingPayment: n(r.awaiting_payment),
    applicationsWaiting: submitted + underReview,
    applicationsOver24h: over24h === null || over24h === undefined ? null : n(over24h),
    firstPaymentsToConfirm: firstPayments,
    renewalPaymentsToConfirm: renewals,
    unconfirmedPayments: firstPayments + renewals,
    expiringSoon: n(r.expiring_7d),
    inGrace: n(r.in_grace),
    expired: n(r.expired),
    suspended: n(r.suspended),
    openFlags: n(r.open_flags),
    openReports: n(r.open_reports),
    failedMessages: n(r.failed_messages),
    pendingChanges: n(r.pending_changes),
  };
}

// The Command Center badge: everything the "Needs your attention" panel lists, without double counting
// ("applications over 24h" is a subset of "applications waiting", so it is not added).
export function attentionTotal(counts) {
  const c = counts ?? EMPTY_COUNTS;
  return n(c.applicationsWaiting) + n(c.unconfirmedPayments) + n(c.openFlags) + n(c.failedMessages);
}

// Sidebar badges keyed by route. A missing key, or 0, means "show no badge".
export function navBadges(counts) {
  if (!counts) return {};
  return {
    "/admin": attentionTotal(counts),
    "/admin/applications": n(counts.applicationsWaiting),
    // Sellers to chase: about to lapse (7 days) or already in the one-day grace period.
    "/admin/businesses": n(counts.expiringSoon) + n(counts.inGrace),
    "/admin/payments": n(counts.unconfirmedPayments),
  };
}

export function badgeText(value) {
  const count = n(value);
  if (count === 0) return "";
  return count > 99 ? "99+" : String(count);
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// "7 applications are waiting, 3 payments need confirming and 6 sellers expire within 7 days".
// Zero parts are dropped; when nothing is left the brief says so instead of showing "0 ...".
export function briefFor(counts) {
  const c = counts ?? EMPTY_COUNTS;
  const parts = [];
  const apps = n(c.applicationsWaiting);
  const pays = n(c.unconfirmedPayments);
  const expiring = n(c.expiringSoon);

  if (apps) parts.push(`${plural(apps, "application is", "applications are")} waiting`);
  if (pays) parts.push(`${plural(pays, "payment needs", "payments need")} confirming`);
  if (expiring) parts.push(`${plural(expiring, "seller expires", "sellers expire")} within 7 days`);

  if (parts.length === 0) return "Nothing needs your attention right now";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const head = parts.slice(0, -1).join(", ");
  const sentence = `${head} and ${parts[parts.length - 1]}`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
