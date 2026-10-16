import { buildPeek } from "../lib/peek.js";
import { SCOPES } from "../lib/search.js";
import * as businesses from "./mockBusinesses.js";

const mockCounts = {
  brief: "4 applications are waiting, 2 payments need confirming and 6 sellers expire this week",
  liveBusinesses: 142,
  applicationsWaiting: 14,
  unconfirmedPayments: 3,
  expiringSoon: 6,
};

const mockApplications = [
  { reference: "APP-2049", businessName: "Mara Fresh Mart", ownerName: "Alice Njeri", status: "Submitted", submittedAt: "Today, 09:12" },
  { reference: "APP-2050", businessName: "Umoja Hardware", ownerName: "John Ouma", status: "Under review", submittedAt: "Today, 11:40" },
  { reference: "APP-2051", businessName: "Green Valley Foods", ownerName: "Mary Wambui", status: "Needs changes", submittedAt: "Yesterday" },
];

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

// Fixtures shaped like the rows public.admin_search returns, so palette and peek work offline from Supabase.
const searchBusinesses = [
  { id: "b-1001", name: "Mara Fresh Mart", slug: "mara-fresh-mart", seller_id: "ES482913", status: "live", plan_key: "premium", town: "Nairobi", phone: "0712345678", email: "alice@marafresh.example", owner_name: "Alice Njeri", paid_until: "2026-11-18T21:00:00Z", verification_level: "verified", featured: true, open_flags: 1 },
  { id: "b-1002", name: "Umoja Hardware", slug: "umoja-hardware", seller_id: "ES571204", status: "live", plan_key: "standard", town: "Kisumu", phone: "0723456789", email: "john@umoja.example", owner_name: "John Ouma", paid_until: "2026-11-02T21:00:00Z", verification_level: "basic", featured: false, open_flags: 0 },
  { id: "b-1003", name: "Green Valley Foods", slug: "green-valley-foods", seller_id: "ES690331", status: "live", plan_key: "premium", town: "Mombasa", phone: "0734567890", email: "mary@greenvalley.example", owner_name: "Mary Wambui", paid_until: "2026-10-15T21:00:00Z", verification_level: "none", featured: false, open_flags: 2 },
];
const searchItems = [
  { id: "i-2001", name: "Unga wa Dola 2kg", price: 215, price_type: "fixed", unit: "bag", availability: "in_stock", visible: true, hidden_by_admin: false, business_id: "b-1001", business_name: "Mara Fresh Mart", business_slug: "mara-fresh-mart", description: "Maize flour, 2kg bag.", section: "Groceries", open_reports: 0, open_flags: 0 },
  { id: "i-2002", name: "Cement 50kg", price: 780, price_type: "fixed", unit: "bag", availability: "in_stock", visible: true, hidden_by_admin: false, business_id: "b-1002", business_name: "Umoja Hardware", business_slug: "umoja-hardware", description: "Portland cement.", section: "Building", open_reports: 1, open_flags: 0 },
  { id: "i-2003", name: "Sukuma wiki bunch", price: 20, price_type: "fixed", unit: "bunch", availability: "out_of_stock", visible: false, hidden_by_admin: true, business_id: "b-1003", business_name: "Green Valley Foods", business_slug: "green-valley-foods", description: "Fresh kale.", section: "Vegetables", open_reports: 0, open_flags: 1 },
];
const searchApplications = [
  { id: "a-3001", reference_no: "EM-2049", business_name: "Mara Fresh Mart", owner_full_name: "Alice Njeri", phone: "0712345678", email: "alice@marafresh.example", status: "submitted", submitted_at: "2026-10-15T06:12:00Z", payment_code: null },
  { id: "a-3002", reference_no: "EM-2050", business_name: "Lakeside Cyber", owner_full_name: "Peter Otieno", phone: "0745678901", email: "peter@lakeside.example", status: "under_review", submitted_at: "2026-10-15T08:40:00Z", payment_code: null },
  { id: "a-3003", reference_no: "EM-2051", business_name: "Green Valley Foods", owner_full_name: "Mary Wambui", phone: "0734567890", email: "mary@greenvalley.example", status: "approved", submitted_at: "2026-10-14T10:05:00Z", payment_code: "SJK4H2L9QX" },
];
const searchPayments = [
  { id: "p-4001", mpesa_code: "SJK4H2L9QX", receipt_no: "RCT-000001", amount_kes: 3200, status: "confirmed", kind: "first", business_id: "b-1001", business_name: "Mara Fresh Mart", phone: "0712345678", submitted_at: "2026-10-12T09:30:00Z" },
  { id: "p-4002", mpesa_code: "SJL8M3N1RT", receipt_no: null, amount_kes: 2500, status: "submitted", kind: "renewal", business_id: "b-1002", business_name: "Umoja Hardware", phone: "0723456789", submitted_at: "2026-10-15T07:55:00Z" },
  { id: "p-4003", mpesa_code: "SJM2P5Q7WE", receipt_no: null, amount_kes: 4500, status: "rejected", kind: "renewal", business_id: "b-1003", business_name: "Green Valley Foods", phone: "0734567890", submitted_at: "2026-10-10T13:20:00Z" },
];
const searchFaqs = [
  { id: "f-5001", question: "Do you deliver within Nairobi?", answer: "Yes, free delivery above KES 2,000.", business_id: "b-1001", business_name: "Mara Fresh Mart", created_at: "2026-10-09T12:00:00Z" },
  { id: "f-5002", question: "Can I pay by M-Pesa on delivery?", answer: "Yes, Till 123456.", business_id: "b-1002", business_name: "Umoja Hardware", created_at: "2026-10-11T15:30:00Z" },
];

const SEARCH_DATA = {
  businesses: { rows: searchBusinesses, fields: ["name", "slug", "seller_id", "phone", "email", "owner_name", "town"] },
  items: { rows: searchItems, fields: ["name", "description", "section", "business_name"] },
  applications: { rows: searchApplications, fields: ["reference_no", "business_name", "owner_full_name", "phone", "email", "payment_code"] },
  payments: { rows: searchPayments, fields: ["mpesa_code", "receipt_no", "business_name", "phone"] },
  faqs: { rows: searchFaqs, fields: ["question", "answer", "business_name"] },
};

const latency = () => new Promise((resolve) => setTimeout(resolve, 80));

// Same contract as the live RPC: under 2 characters gives {}, scopes null means all, limit is clamped to 1..25.
export async function adminSearch(term, { scopes = null, limit = 8 } = {}) {
  await latency();
  const needle = String(term ?? "").trim().toLowerCase();
  if (needle.length < 2) return {};
  const max = Math.min(Math.max(Number(limit) || 8, 1), 25);
  const wanted = scopes?.length ? scopes : SCOPES.filter((s) => s.key !== "all").map((s) => s.key);
  const result = {};
  for (const key of wanted) {
    const source = SEARCH_DATA[key];
    if (!source) continue;
    result[key] = source.rows
      .filter((row) => source.fields.some((f) => String(row[f] ?? "").toLowerCase().includes(needle)))
      .slice(0, max);
  }
  return result;
}

const PEEK_TABLES = { business: searchBusinesses, item: searchItems, application: searchApplications, payment: searchPayments, faq: searchFaqs };

export async function adminPeek(type, id) {
  await latency();
  const record = PEEK_TABLES[type]?.find((row) => row.id === id);
  if (!record) return null;
  const business = record.business_id ? searchBusinesses.find((b) => b.id === record.business_id) ?? null : null;
  return buildPeek(type, record, { business });
}

export const mockAdminApi = {
  async getAdminCounts() {
    return mockCounts;
  },
  async getApplications() {
    return mockApplications;
  },
  async getBusinesses() {
    return mockBusinesses;
  },
  async getPayments() {
    return mockPayments;
  },
  adminSearch,
  adminPeek,
  ...businesses,
};

export default mockAdminApi;
