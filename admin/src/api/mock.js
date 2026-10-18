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

const mockPayments = [
  { receipt: "RCP-1024", businessName: "Mara Fresh Mart", amount: 3200, status: "Confirmed", mpesaCode: "MPESA-4411" },
  { receipt: "RCP-1025", businessName: "Umoja Hardware", amount: 2500, status: "Pending", mpesaCode: "MPESA-4412" },
  { receipt: "RCP-1026", businessName: "Green Valley Foods", amount: 4500, status: "Rejected", mpesaCode: "MPESA-4413" },
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
