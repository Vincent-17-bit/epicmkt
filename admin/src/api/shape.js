// Rules and mappers that must be identical in live.js and mock.js.

export const EXPIRING_DAYS = 7;
export const WAITING_APPLICATION_STATUSES = ["submitted", "under_review"];
export const CONFIRMING_STATUS = "payment_confirming";

const plural = (n, one, many) => (n === 1 ? one : many);

// "4 applications are waiting, 2 payments need confirming and 6 sellers expire this week"
export function buildBrief({ applicationsWaiting = 0, unconfirmedPayments = 0, expiringSoon = 0 }) {
  const parts = [];
  if (applicationsWaiting > 0) {
    parts.push(`${applicationsWaiting} ${plural(applicationsWaiting, "application is", "applications are")} waiting`);
  }
  if (unconfirmedPayments > 0) {
    parts.push(`${unconfirmedPayments} ${plural(unconfirmedPayments, "payment needs", "payments need")} confirming`);
  }
  if (expiringSoon > 0) {
    parts.push(`${expiringSoon} ${plural(expiringSoon, "seller expires", "sellers expire")} this week`);
  }
  if (parts.length === 0) return "Nothing needs your attention right now";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function withBrief(counts, now = Date.now()) {
  return { ...counts, brief: buildBrief(counts), asOf: new Date(now).toISOString() };
}

export function toSearchResult(def, row) {
  const { title, subtitle, status } = def.searchItem(row);
  return { kind: def.name, id: row[def.id], title, subtitle, status, href: def.href(row[def.id]) };
}

export function groupSearch(query, groups) {
  const nonEmpty = groups.filter((g) => g.items.length > 0);
  return { query, total: nonEmpty.reduce((n, g) => n + g.items.length, 0), groups: nonEmpty };
}

// Deprecated: the placeholder pages from before B1 read these shapes. They are removed together
// with the placeholders when the real pages land.
const titleCase = (s) => String(s ?? "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const shortDate = (iso) => (iso ? String(iso).slice(0, 10) : "");

export const legacyShapes = {
  application: (r) => ({
    reference: r.reference_no,
    businessName: r.business_name,
    ownerName: r.owner_full_name,
    status: titleCase(r.status),
    submittedAt: shortDate(r.submitted_at ?? r.created_at),
  }),
  business: (r) => ({
    name: r.name,
    town: r.town ?? "",
    plan: titleCase(r.plan_key),
    status: titleCase(r.status),
    paidUntil: shortDate(r.paid_until),
  }),
  payment: (r) => ({
    receipt: r.reference ?? r.id,
    businessName: r.business_id,
    amount: r.amount_kes,
    status: "Confirmed",
    mpesaCode: r.reference ?? "",
  }),
};

export function makeLegacy(list) {
  const rows = async (resource, map) => (await list(resource, { pageSize: 100 })).rows.map(map);
  return {
    getApplications: () => rows("applications", legacyShapes.application),
    getBusinesses: () => rows("businesses", legacyShapes.business),
    getPayments: () => rows("payments", legacyShapes.payment),
  };
}
