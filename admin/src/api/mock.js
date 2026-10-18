import { businessFilterOptions, countBusinessTabs, queryBusinesses } from "./mockBusinesses.js";
import { mockApplicationCounts } from "./mockApplications.js";
import { normalizeCounts } from "../lib/counts.js";

export { bulkBusinessAction, listAuditEntries, undoBulkBusinessAction } from "./mockBusinessActions.js";
export { endFlashSale, listFlashSales } from "./mockFlash.js";

export {
  decideApplication, getApplication, getApplicationDocumentUrl, listApplications, openApplication,
} from "./mockApplications.js";

const mockBusinesses = [
  { name: "Mara Fresh Mart", town: "Nairobi", plan: "Premium", status: "Live", paidUntil: "2026-11-18" },
  { name: "Umoja Hardware", town: "Kisumu", plan: "Standard", status: "Live", paidUntil: "2026-11-02" },
  { name: "Green Valley Foods", town: "Mombasa", plan: "Premium", status: "Expiring soon", paidUntil: "2026-10-15" },
];

const tx = (n, o) => ({
  key: `t${n}`, txId: `t${n}`, receipt: null, reference: null, town: null, account: null, expected: null, credit: null, suggestedMonths: null,
  phone: null, payerName: null, paybill: "247247", applicationId: null, businessId: null, appStatus: null, appPaymentCode: null,
  candidates: [], note: null, matchMethod: "reference", ...o,
});
let mockPayments = [
  tx(1, { businessName: "Mara Fresh Mart", town: "Kisumu", reference: "EPM-2026-ABC234", account: "EPM-2026-ABC234", amount: 1500, expected: 500, credit: 1500, suggestedMonths: 3, status: "awaiting_confirmation", mpesaCode: "SGH4K9L2QW", payerName: "JOHN DOE", at: "2026-10-18T08:40:00Z", applicationId: "a1", appStatus: "payment_confirming", appPaymentCode: "SGH4K9L2QW" }),
  tx(2, { businessName: "No matching business", account: "Upendo Shop", amount: 500, status: "needs_assignment", mpesaCode: "SGF9Z8Y7X6", payerName: "MARY W", at: "2026-10-18T07:15:00Z", note: "ambiguous_name", matchMethod: null,
    candidates: [{ type: "application", id: "a2", name: "Upendo Shop", ref: "EPM-2026-DDD444", town: "Maseno", status: "approved", reason: "name" }, { type: "application", id: "a3", name: "Upendo Shop", ref: "EPM-2026-EEE555", town: "Kiambu", status: "approved", reason: "name" }] }),
  tx(3, { businessName: "Green Valley Foods", town: "Nakuru", reference: "EPM-2026-QRS552", account: "EPM-2026-QRS552", amount: 300, expected: 500, credit: 300, status: "part_paid", mpesaCode: "SGG1A2B3C4", payerName: "PETER K", at: "2026-10-17T14:05:00Z", applicationId: "a4", appStatus: "approved" }),
  tx(4, { businessName: "Pwani Pastries", town: "Mombasa", reference: "ES100210", account: "ES100210", amount: 1500, expected: 500, status: "renewed", receipt: "EPM-R-2026-000041", mpesaCode: "SGE5D6C7B8", payerName: "AMINA S", at: "2026-10-16T10:20:00Z", businessId: "b1" }),
];

const latency = (ms = 160) => new Promise((resolve) => setTimeout(resolve, ms));

const copy = (rows) => rows.map((row) => ({ ...row }));

export async function listBusinesses({ page = 0, pageSize = 50, ...query } = {}) {
  await latency();
  const rows = queryBusinesses(query);
  return { rows: copy(rows.slice(page * pageSize, (page + 1) * pageSize)), total: rows.length };
}

export async function listAllBusinesses(query = {}) {
  await latency();
  return copy(queryBusinesses(query));
}

export async function getBusinessTabCounts(query = {}) {
  await latency(80);
  return countBusinessTabs(query);
}

export async function getBusinessFilterOptions() {
  await latency(80);
  return businessFilterOptions();
}

// Same shape the live API returns: the admin_counts() fields, run through normalizeCounts. The application
// numbers come from the mock store, so they change when a demo application is approved or rejected.
export async function getAdminCounts() {
  await latency(80);
  const { over24h, ...apps } = mockApplicationCounts();
  return normalizeCounts(
    {
      ...apps,
      live: 142, expiring_7d: 6, in_grace: 2, expired: 9, suspended: 1,
      open_flags: 9, open_reports: 4, unconfirmed_payments: 3, failed_messages: 3, pending_changes: 6,
    },
    { applicationsOver24h: over24h },
  );
}

// Demo mode only. The live API reads these from admin_activity(); the sample lines used to sit in the page itself.
export async function getAdminActivity() {
  await latency(80);
  return [
    { id: "demo-1", text: "New application from Umoja Market submitted 2 minutes ago", to: "/admin/applications" },
    { id: "demo-2", text: "Payment code MPESA-1047 matched and awaiting confirmation", to: "/admin/payments" },
    { id: "demo-3", text: "2 seller reports were flagged for review", to: null },
    { id: "demo-4", text: "Reminder batch completed for 6 expiring sellers", to: null },
  ];
}

export async function getBusinesses() {
  await latency(80);
  return copy(mockBusinesses);
}

export async function getPayments() {
  await latency(80);
  return copy(mockPayments);
}

// Demo only: marks the row confirmed, the way the real function would after creating the seller login.
export async function confirmPayment({ mpesaCode }) {
  await latency();
  mockPayments = mockPayments.map((row) => (row.mpesaCode === mpesaCode ? { ...row, status: "confirmed", receipt: "EPM-R-2026-000099" } : row));
  return { ok: true, kind: "activation", sellerId: "ES100999", temporaryPassword: "demo-password", smsSent: true };
}

export async function getUnprocessedCallbacks() {
  await latency(80);
  return [{ id: "cb1", at: "2026-10-18T06:00:00Z", error: "database was busy", code: "SGZ1Y2X3W4", amount: "250.00", account: "EPM-2026-ZZZ999" }];
}

export async function searchPayTargets(query) {
  await latency(80);
  const all = [
    { type: "application", id: "a2", name: "Upendo Shop", ref: "EPM-2026-DDD444", town: "Maseno", status: "approved", reason: "search" },
    { type: "application", id: "a3", name: "Upendo Shop", ref: "EPM-2026-EEE555", town: "Kiambu", status: "approved", reason: "search" },
    { type: "business", id: "b1", name: "Pwani Pastries", ref: "ES100210", town: "Mombasa", status: "live", reason: "search" },
  ];
  const q = String(query ?? "").toLowerCase();
  return q.length < 2 ? [] : all.filter((x) => `${x.name} ${x.town} ${x.ref}`.toLowerCase().includes(q));
}

export async function assignPayment({ txId, type, id }) {
  await latency();
  mockPayments = mockPayments.map((row) => (row.txId === txId ? { ...row, status: type === "business" ? "renewed" : "awaiting_confirmation", businessName: id, candidates: [], note: null } : row));
  return { outcome: "ready" };
}

export async function ignorePayment({ txId }) {
  await latency();
  mockPayments = mockPayments.map((row) => (row.txId === txId ? { ...row, status: "ignored" } : row));
  return { outcome: "ignored" };
}

export async function reprocessCallback() { await latency(); return { outcome: "needs_assignment" }; }
export async function dismissCallback() { await latency(); }
