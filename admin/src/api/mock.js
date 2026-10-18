import { businessFilterOptions, countBusinessTabs, queryBusinesses } from "./mockBusinesses.js";
import { mockApplicationCounts } from "./mockApplications.js";
import { normalizeCounts } from "../lib/counts.js";

export { bulkBusinessAction, listAuditEntries, undoBulkBusinessAction } from "./mockBusinessActions.js";
export {
  decideApplication, getApplication, getApplicationDocumentUrl, listApplications, openApplication,
} from "./mockApplications.js";

const mockBusinesses = [
  { name: "Mara Fresh Mart", town: "Nairobi", plan: "Premium", status: "Live", paidUntil: "2026-11-18" },
  { name: "Umoja Hardware", town: "Kisumu", plan: "Standard", status: "Live", paidUntil: "2026-11-02" },
  { name: "Green Valley Foods", town: "Mombasa", plan: "Premium", status: "Expiring soon", paidUntil: "2026-10-15" },
];

let mockPayments = [
  { key: "t1", receipt: null, reference: "EPM-2026-ABC234", businessName: "Mara Fresh Mart", account: "Mara Fresh Mart", amount: 3200, expected: 3200, status: "awaiting_confirmation", mpesaCode: "SGH4K9L2QW", phone: "2547****678", payerName: "JOHN DOE", paybill: "247247", at: "2026-10-18T08:40:00Z", applicationId: "a1" },
  { key: "t2", receipt: null, reference: "EPM-2026-QRS552", businessName: "Green Valley Foods", account: "Green Valley Foods", amount: 2000, expected: 4500, status: "amount_short", mpesaCode: "SGF9Z8Y7X6", phone: "2547****912", payerName: "MARY W", paybill: "247247", at: "2026-10-18T07:15:00Z", applicationId: "a2" },
  { key: "t3", receipt: null, reference: null, businessName: "No matching business", account: "Umoja Hardwar", amount: 2500, expected: null, status: "unmatched", mpesaCode: "SGG1A2B3C4", phone: "2547****111", payerName: "PETER K", paybill: "247247", at: "2026-10-17T14:05:00Z", applicationId: null },
  { key: "t4", receipt: "EPM-R-2026-000041", reference: "EPM-2026-XYZ981", businessName: "Pwani Pastries", account: "Pwani Pastries", amount: 2500, expected: 2500, status: "confirmed", mpesaCode: "SGE5D6C7B8", phone: "2547****345", payerName: "AMINA S", paybill: "247247", at: "2026-10-16T10:20:00Z", applicationId: "a4" },
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
