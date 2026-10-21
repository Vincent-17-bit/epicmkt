import { ApiError } from "./errors.js";
import { businessFilterOptions, businessStore, countBusinessTabs, queryBusinesses } from "./mockBusinesses.js";
import { mockApplicationCounts } from "./mockApplications.js";
import { normalizeCounts } from "../lib/counts.js";

export { bulkBusinessAction, listAuditEntries, undoBulkBusinessAction } from "./mockBusinessActions.js";
export { getSettings, saveSettings, setBusinessGrace } from "./mockSettings.js";
export { endFlashSale, listFlashSales } from "./mockFlash.js";
export { getAnalytics, getAuditGroups, listAudit } from "./mockAudit.js";
export { getPlanHistory, listCategories, listPlans, saveCategory, savePlan } from "./mockCatalogue.js";
export {
  getAutomationStatus, getMessageSummary, listMessageLog, listTemplates, retryFailedMessages, retryMessage, runJob, saveTemplate, sendBroadcast, setJobActive,
} from "./mockMessaging.js";
export {
  bulkSetItemsHidden, decideChangeRequest, getExpiryRadar, getModerationCounts, listCatalog, listChangeRequests, listFlags, listReports,
  raiseFlag, setModerationFlag, setReportStatus,
} from "./mockModeration.js";
export {
  ackMessagesDelivered, getUnreadMessages, listMessages, markMessagesRead, openMessageFile, sendMessage, uploadMessageFiles,
} from "./mockMessages.js";

import { searchMockApplications } from "./mockApplications.js";

export {
  decideApplication, getApplication, getApplicationDocumentUrl, listApplications, openApplication,
} from "./mockApplications.js";

const mockBusinesses = [
  { name: "Lakeside Provisions", town: "Nairobi", plan: "Premium", status: "Live", paidUntil: "2026-11-18" },
  { name: "Rafiki Tools and Hardware", town: "Kisumu", plan: "Standard", status: "Live", paidUntil: "2026-11-02" },
  { name: "Bustani Foods", town: "Mombasa", plan: "Premium", status: "Expiring soon", paidUntil: "2026-10-15" },
];

const tx = (n, o) => ({
  key: `t${n}`, txId: `t${n}`, receipt: null, reference: null, town: null, account: null, expected: null, credit: null, suggestedMonths: null,
  phone: null, payerName: null, paybill: "247247", applicationId: null, businessId: null, appStatus: null, appPaymentCode: null,
  candidates: [], note: null, matchMethod: "reference", ...o,
});
let mockPayments = [
  tx(1, { businessName: "Lakeside Provisions", town: "Kisumu", reference: "EPM-2026-ABC234", account: "EPM-2026-ABC234", amount: 1500, expected: 500, credit: 1500, suggestedMonths: 3, status: "awaiting_confirmation", mpesaCode: "SGH4K9L2QW", payerName: "JOHN DOE", at: "2026-10-18T08:40:00Z", applicationId: "a1", appStatus: "payment_confirming", appPaymentCode: "SGH4K9L2QW" }),
  tx(2, { businessName: "No matching business", account: "Upendo Shop", amount: 500, status: "needs_assignment", mpesaCode: "SGF9Z8Y7X6", payerName: "MARY W", at: "2026-10-18T07:15:00Z", note: "ambiguous_name", matchMethod: null,
    candidates: [{ type: "application", id: "a2", name: "Upendo Shop", ref: "EPM-2026-DDD444", town: "Maseno", status: "approved", reason: "name" }, { type: "application", id: "a3", name: "Upendo Shop", ref: "EPM-2026-EEE555", town: "Kiambu", status: "approved", reason: "name" }] }),
  tx(3, { businessName: "Bustani Foods", town: "Nakuru", reference: "EPM-2026-QRS552", account: "EPM-2026-QRS552", amount: 300, expected: 500, credit: 300, status: "part_paid", mpesaCode: "SGG1A2B3C4", payerName: "PETER K", at: "2026-10-17T14:05:00Z", applicationId: "a4", appStatus: "approved" }),
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

// ---- Demo header search and notifications ----------------------------------------------------------------------

export async function globalSearch(query) {
  await latency(80);
  const term = String(query ?? "").trim().toLowerCase();
  if (term.length < 2) return {};
  return {
    applications: searchMockApplications(term),
    businesses: businessStore
      .filter((b) => !b.deleted && [b.name, b.town, b.sellerId, b.slug].some((v) => String(v ?? "").toLowerCase().includes(term)))
      .slice(0, 6)
      .map((b) => ({ id: b.id, name: b.name, town: b.town, status: b.status, seller_id: b.sellerId, slug: b.slug })),
    payments: mockPayments
      .filter((p) => [p.mpesaCode, p.businessName, p.payerName].some((v) => String(v ?? "").toLowerCase().includes(term)))
      .map((p) => ({ id: p.txId, mpesa_code: p.mpesaCode, amount_kes: p.amount, status: p.status, business_name: p.businessName })),
  };
}

let mockNotifications = [
  { id: "mn-1", at: new Date(Date.now() - 2 * 60_000).toISOString(), kind: "application_submitted", business_name: "Umoja Market", data: {}, read: false },
  { id: "mn-2", at: new Date(Date.now() - 25 * 60_000).toISOString(), kind: "payment_submitted", business_name: "Lakeside Provisions", data: { kind: "renewal" }, read: false },
  { id: "mn-3", at: new Date(Date.now() - 3 * 3600_000).toISOString(), kind: "change_request", business_name: "Fade Kings", data: { field: "phone" }, read: true },
];
export async function getNotifications() {
  await latency(60);
  return mockNotifications.map((n) => ({ ...n }));
}
export async function getUnreadNotificationCount() {
  return mockNotifications.filter((n) => !n.read).length;
}
export async function markNotificationsRead(ids) {
  mockNotifications = mockNotifications.map((n) => (!Array.isArray(ids) || ids.includes(n.id) ? { ...n, read: true } : n));
  return { ok: true };
}

// ---- Demo business detail page ---------------------------------------------------------------------------------

const demoRow = (id) => {
  const row = businessStore.find((b) => b.id === id);
  if (!row) throw new ApiError("not_found", "not_found");
  return row;
};
const demoState = new Map(); // id -> { items, flags, reports, notes }
const demoOf = (row) => {
  if (!demoState.has(row.id)) {
    const names = ["Chocolate cake 1kg", "Birthday cake 2kg", "White bread loaf", "Blueberry muffin", "Croissant", "Mandazi (6 pack)", "Cupcakes (6)", "Meat pie"];
    const items = names.slice(0, Math.min(8, Math.max(2, row.items))).map((name, i) => ({
      id: `${row.id}-i${i}`, name, section: i < 4 ? "Cakes" : "Snacks", price: 60 + i * 140, price_type: "fixed", sale_price: null,
      availability: "in_stock", visible: true, draft: false, hidden_by_admin: false, admin_hide_reason: null, created_at: row.createdAt,
    }));
    const flags = Array.from({ length: row.openFlags }, (_, i) => ({
      id: `${row.id}-f${i}`, reason: i % 2 ? "Price does not match the shop" : "Photo does not match the item", status: "open", seller_message: null,
      seller_reply: null, replied_at: null, due_at: null, created_at: row.lastEdit, resolved_at: null, item_id: items[0]?.id ?? null, item_name: items[0]?.name ?? null,
    }));
    const reports = Array.from({ length: row.openReports }, (_, i) => ({
      id: `${row.id}-r${i}`, reason: "wrong-price", details: "Cheaper at the shop", status: "open", created_at: row.lastLogin, item_id: items[0]?.id ?? null, item_name: items[0]?.name ?? null,
    }));
    demoState.set(row.id, { items, flags, reports, notes: [], activity: [] });
  }
  return demoState.get(row.id);
};
const demoLog = (row, action, reason = null) => demoOf(row).activity.unshift({ id: Date.now() + Math.random(), created_at: new Date().toISOString(), action, actor_email: "demo@epicmkt.test", actor_role: "admin", target_type: "business", reason });

export async function getBusinessDetail(id) {
  await latency(90);
  const row = demoRow(id);
  const d = demoOf(row);
  return {
    business: {
      id: row.id, seller_id: row.sellerId, slug: row.slug, name: row.name, category_id: row.category, category_name: row.category,
      plan_key: String(row.plan ?? "standard").toLowerCase(), status: row.status, status_reason: null, verification_level: row.verified ? "verified" : "none",
      featured: Boolean(row.featured), featured_until: null, paid_until: row.paidUntil, first_paid_at: row.createdAt, monthly_price: 1300, credit_kes: 0,
      strikes: row.strikes, tags: row.tags ?? [], tagline: null, description: null, owner_name: row.ownerName, phone: row.phone, whatsapp: row.phone,
      email: null, county: row.county, town: row.town, address: null, last_login_at: row.lastLogin, last_edit_at: row.lastEdit,
      application_id: null, deleted_at: row.deleted ? row.createdAt : null, created_at: row.createdAt,
    },
    stats: {
      items: d.items.length, items_hidden: d.items.filter((i) => i.hidden_by_admin).length,
      open_flags: d.flags.filter((f) => f.status === "open").length, open_reports: d.reports.filter((r) => r.status === "open").length,
      paid_total_kes: 2600, payments_waiting: row.unconfirmedPayment ? 1 : 0, last_payment_at: row.createdAt,
    },
  };
}
export async function getBusinessPayments(id) {
  await latency(60);
  const row = demoRow(id);
  return [
    { id: `${id}-p2`, created_at: row.lastEdit, amount_kes: 1300, status: row.unconfirmedPayment ? "submitted" : "confirmed", kind: "renewal", mpesa_code: "SGH4K9L2QW", receipt_no: "R-1002", period_end: row.paidUntil, months: 1, source: "c2b", decline_reason: null, plan_key: "premium" },
    { id: `${id}-p1`, created_at: row.createdAt, amount_kes: 1300, status: "confirmed", kind: "initial", mpesa_code: "RTB7P1M0ZX", receipt_no: "R-0420", period_end: row.createdAt.slice(0, 10), months: 1, source: "app", decline_reason: null, plan_key: "premium" },
  ];
}
export async function getBusinessActivity(id) {
  await latency(60);
  return demoOf(demoRow(id)).activity.map((a) => ({ ...a }));
}
export async function getBusinessItems(id) {
  await latency(60);
  return demoOf(demoRow(id)).items.map((i) => ({ ...i }));
}
export async function getBusinessFlags(id) {
  await latency(60);
  const d = demoOf(demoRow(id));
  return { flags: d.flags.map((f) => ({ ...f })), reports: d.reports.map((r) => ({ ...r })) };
}
export async function getBusinessNotes(id) {
  await latency(60);
  const notes = demoOf(demoRow(id)).notes;
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at)).map((n) => ({ ...n }));
}
export async function setItemHidden({ id, hidden, reason = null }) {
  await latency(60);
  const businessId = id.split("-i")[0];
  const d = demoOf(demoRow(businessId));
  const item = d.items.find((i) => i.id === id);
  if (!item) throw new ApiError("not_found", "not_found");
  if (hidden && String(reason ?? "").trim().length < 5) throw new ApiError("reason_required", "A reason of at least 5 characters is required.");
  item.hidden_by_admin = hidden;
  item.admin_hide_reason = hidden ? reason.trim() : null;
  demoLog(demoRow(businessId), hidden ? "item.hide" : "item.unhide", reason);
  return true;
}
export async function setFlagStatus({ id, status }) {
  await latency(60);
  const businessId = id.split("-f")[0];
  const flag = demoOf(demoRow(businessId)).flags.find((f) => f.id === id);
  if (!flag) throw new ApiError("not_found", "not_found");
  flag.status = status;
  flag.resolved_at = status === "resolved" ? new Date().toISOString() : null;
  demoLog(demoRow(businessId), "flag.status");
  return true;
}
export async function setBusinessVisibility({ id, visible, reason = null }) {
  await latency(60);
  const row = demoRow(id);
  if (!["live", "paused"].includes(row.status)) throw new ApiError("invalid_status", "invalid_status");
  row.status = visible ? "live" : "paused";
  demoLog(row, "business.visibility", reason);
  return true;
}
export async function addBusinessNote({ id, body, pinned = false }) {
  await latency(40);
  const text = String(body ?? "").trim();
  if (!text || text.length > 2000) throw new ApiError("invalid_input", "Check the form and try again.");
  const note = { id: `n${Date.now()}`, body: text, pinned, author_email: "demo@epicmkt.test", created_at: new Date().toISOString() };
  demoOf(demoRow(id)).notes.push(note);
  return note.id;
}
export async function setBusinessNotePinned({ noteId, pinned }) {
  for (const d of demoState.values()) {
    const n = d.notes.find((x) => x.id === noteId);
    if (n) { n.pinned = pinned; return true; }
  }
  throw new ApiError("not_found", "not_found");
}
export async function deleteBusinessNote(noteId) {
  for (const d of demoState.values()) {
    const at = d.notes.findIndex((x) => x.id === noteId);
    if (at >= 0) { d.notes.splice(at, 1); return true; }
  }
  throw new ApiError("not_found", "not_found");
}
