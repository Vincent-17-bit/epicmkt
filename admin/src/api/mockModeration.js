// Demo data for Moderation, the catalogue, Approvals and the Expiry Radar. Local development only: production
// builds always use live.js. It follows the same rules as the database so the screens behave the same way.
import { ApiError } from "./errors.js";

const latency = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const DAY = 86400000;
const at = (offset) => new Date(Date.now() + offset).toISOString();
const page = (rows, { page: p = 0, pageSize = 50 } = {}) => ({ rows: rows.slice(p * pageSize, (p + 1) * pageSize).map((r) => ({ ...r })), total: rows.length });
const matches = (text, search) => !search?.trim() || String(text).toLowerCase().includes(search.trim().toLowerCase());
const needReason = (reason) => {
  if (String(reason ?? "").trim().length < 5) throw new ApiError("reason_required", "A reason of at least 5 characters is required.");
};

let flags = [
  { id: "f1", business_id: "b1", business_name: "Lakeside Provisions", item_id: "i1", item_name: "Dairy meal 70kg", reason: "Photo does not match", status: "open", seller_message: "The photo shows a different brand. Please upload the right one.", seller_reply: null, due_at: at(-DAY), created_at: at(-4 * DAY) },
  { id: "f2", business_id: "b2", business_name: "Fade Kings", item_id: null, item_name: null, reason: "Opening hours look wrong", status: "replied", seller_message: "Are you open on Sundays?", seller_reply: "Yes, 10am to 4pm.", due_at: at(2 * DAY), created_at: at(-DAY) },
  { id: "f3", business_id: "b3", business_name: "Bustani Foods", item_id: "i3", item_name: "1 kg vanilla cake", reason: "Price missing", status: "resolved", seller_message: "Please add a price.", seller_reply: "Added.", due_at: at(-6 * DAY), created_at: at(-9 * DAY) },
];
let reports = [
  { id: "r1", business_id: "b1", business_name: "Lakeside Provisions", item_id: "i1", item_name: "Dairy meal 70kg", reason: "wrong_price", details: "Cheaper at the shop next door", status: "open", created_at: at(-2 * DAY) },
  { id: "r2", business_id: "b1", business_name: "Lakeside Provisions", item_id: null, item_name: null, reason: "closed", details: null, status: "open", created_at: at(-DAY) },
  { id: "r3", business_id: "b4", business_name: "Pwani Pastries", item_id: null, item_name: null, reason: "other", details: "Phone is switched off", status: "dismissed", created_at: at(-8 * DAY) },
];
let items = [
  { id: "i1", name: "Dairy meal 70kg", section: "Feeds", price: 2600, price_type: "fixed", sale_price: null, availability: "available", visible: true, draft: false, hidden_by_admin: false, admin_hide_reason: null, created_at: at(-30 * DAY), business_id: "b1", business_name: "Lakeside Provisions", category_id: "agrovet" },
  { id: "i2", name: "Fade and beard", section: "Services", price: 500, price_type: "fixed", sale_price: 400, availability: "available", visible: true, draft: false, hidden_by_admin: false, admin_hide_reason: null, created_at: at(-20 * DAY), business_id: "b2", business_name: "Fade Kings", category_id: "barber" },
  { id: "i3", name: "1 kg vanilla cake", section: "Cakes", price: 1800, price_type: "fixed", sale_price: null, availability: "limited_stock", visible: true, draft: false, hidden_by_admin: true, admin_hide_reason: "Misleading photo", created_at: at(-12 * DAY), business_id: "b3", business_name: "Bustani Foods", category_id: "bakery" },
  { id: "i4", name: "Wedding cake (draft)", section: "Cakes", price: null, price_type: "contact", sale_price: null, availability: "available", visible: false, draft: true, hidden_by_admin: false, admin_hide_reason: null, created_at: at(-DAY), business_id: "b3", business_name: "Bustani Foods", category_id: "bakery" },
];
let changes = [
  { id: "c1", business_id: "b2", business_name: "Fade Kings", field: "phone", old_value: "+254712000111", new_value: "+254733000222", status: "pending", admin_note: null, created_at: at(-DAY), extra_due_kes: 0, new_monthly_price: null, applies_from_next_renewal: true },
  { id: "c2", business_id: "b3", business_name: "Bustani Foods", field: "category_id", old_value: "bakery", new_value: "restaurant", old_label: "Bakery", new_label: "Restaurant", status: "pending", admin_note: null, created_at: at(-2 * DAY), extra_due_kes: 650, new_monthly_price: 1500, applies_from_next_renewal: true },
  { id: "c3", business_id: "b1", business_name: "Lakeside Provisions", field: "name", old_value: "Lakeside Stores", new_value: "Lakeside Provisions", status: "approved", admin_note: null, created_at: at(-20 * DAY), decided_at: at(-19 * DAY), extra_due_kes: 0, new_monthly_price: null, applies_from_next_renewal: true },
];
let radar = [
  { id: "b1", name: "Lakeside Provisions", category_id: "agrovet", plan_key: "premium", phone: "0712345678", monthly_price: 1500, paid_until: at(5 * DAY), status: "live", days_left: 5, state: "active", last_payment_at: at(-25 * DAY), last_reminder_at: null, payment_waiting: false },
  { id: "b2", name: "Fade Kings", category_id: "barber", plan_key: "standard", phone: "0733000222", monthly_price: 500, paid_until: at(0), status: "live", days_left: 0, state: "active", last_payment_at: at(-30 * DAY), last_reminder_at: at(-DAY), payment_waiting: true },
  { id: "b3", name: "Bustani Foods", category_id: "bakery", plan_key: "standard", phone: "0722111333", monthly_price: 500, paid_until: at(-DAY), status: "live", days_left: -1, state: "grace", last_payment_at: at(-31 * DAY), last_reminder_at: at(-DAY), payment_waiting: false },
  { id: "b4", name: "Pwani Pastries", category_id: "bakery", plan_key: "standard", phone: "0700123456", monthly_price: 500, paid_until: at(-4 * DAY), status: "expired", days_left: -4, state: "expired", last_payment_at: at(-34 * DAY), last_reminder_at: at(-3 * DAY), payment_waiting: false },
  { id: "b5", name: "Kisumu Fresh Grocers", category_id: "grocery", plan_key: "premium", phone: "0701999888", monthly_price: 1200, paid_until: at(18 * DAY), status: "live", days_left: 18, state: "active", last_payment_at: at(-12 * DAY), last_reminder_at: null, payment_waiting: false },
];

export async function getModerationCounts() {
  await latency();
  return {
    flags_open: flags.filter((f) => f.status === "open").length,
    flags_replied: flags.filter((f) => f.status === "replied").length,
    flags_overdue: flags.filter((f) => f.status !== "resolved" && f.due_at && Date.parse(f.due_at) < Date.now()).length,
    reports_open: reports.filter((r) => r.status === "open").length,
    items_hidden: items.filter((i) => i.hidden_by_admin).length,
  };
}

export async function listFlags({ status = "open", search = "", ...paging } = {}) {
  await latency();
  const rows = flags
    .filter((f) => (status === "all" || f.status === status) && (matches(f.business_name, search) || matches(f.reason, search)))
    .map((f) => ({ ...f, overdue: f.status !== "resolved" && Boolean(f.due_at) && Date.parse(f.due_at) < Date.now() }));
  return page(rows, paging);
}

export async function listReports({ status = "open", search = "", ...paging } = {}) {
  await latency();
  const rows = reports
    .filter((r) => (status === "all" || r.status === status) && (matches(r.business_name, search) || matches(r.reason, search)))
    .map((r) => ({ ...r, open_for_business: reports.filter((o) => o.business_id === r.business_id && o.status === "open").length }));
  return page(rows, paging);
}

export async function setReportStatus({ id, status }) {
  await latency();
  if (!["open", "reviewed", "dismissed"].includes(status)) throw new ApiError("invalid_status");
  if (!reports.some((r) => r.id === id)) throw new ApiError("not_found");
  reports = reports.map((r) => (r.id === id ? { ...r, status } : r));
  return true;
}

export async function raiseFlag({ businessId, itemId = null, reason, message, dueDays = 3 }) {
  await latency();
  if (String(reason ?? "").trim().length < 3 || String(message ?? "").trim().length < 3) throw new ApiError("invalid_input");
  const item = items.find((i) => i.id === itemId);
  const id = `f${flags.length + 1}`;
  flags = [{ id, business_id: businessId, business_name: item?.business_name ?? "Business", item_id: itemId, item_name: item?.name ?? null, reason: reason.trim(), status: "open", seller_message: message.trim(), seller_reply: null, due_at: at(dueDays * DAY), created_at: at(0) }, ...flags];
  return id;
}

export async function setModerationFlag({ id, status }) {
  await latency();
  if (!["open", "resolved"].includes(status)) throw new ApiError("invalid_status");
  if (!flags.some((f) => f.id === id)) throw new ApiError("not_found");
  flags = flags.map((f) => (f.id === id ? { ...f, status } : f));
  return true;
}

export async function listCatalog({ search = "", state = "all", category = "", ...paging } = {}) {
  await latency();
  const flagged = (i) => flags.some((f) => f.item_id === i.id && f.status !== "resolved") || reports.some((r) => r.item_id === i.id && r.status === "open");
  const rows = items
    .filter((i) => (matches(i.name, search) || matches(i.business_name, search)) && (!category || i.category_id === category))
    .filter((i) => ({ all: true, hidden: i.hidden_by_admin, draft: i.draft, visible: i.visible && !i.draft && !i.hidden_by_admin, flagged: flagged(i) })[state] ?? true)
    .map((i) => ({
      ...i,
      open_flags: flags.filter((f) => f.item_id === i.id && f.status !== "resolved").length,
      open_reports: reports.filter((r) => r.item_id === i.id && r.status === "open").length,
    }));
  return page(rows, paging);
}

export async function bulkSetItemsHidden({ ids, hidden, reason = null }) {
  await latency();
  if (!ids?.length || ids.length > 100) throw new ApiError("invalid_input");
  if (hidden) needReason(reason);
  items = items.map((i) => (ids.includes(i.id) ? { ...i, hidden_by_admin: hidden, admin_hide_reason: hidden ? reason.trim() : null } : i));
  return ids.length;
}

export async function listChangeRequests({ status = "pending", ...paging } = {}) {
  await latency();
  const rows = changes.filter((c) => status === "all" || c.status === status).sort((a, b) => (b.status === "pending") - (a.status === "pending"));
  return page(rows, paging);
}

export async function decideChangeRequest({ id, approve, note = null }) {
  await latency();
  const row = changes.find((c) => c.id === id);
  if (!row) throw new ApiError("not_found");
  if (row.status !== "pending") throw new ApiError("already_decided");
  if (!approve) needReason(note);
  changes = changes.map((c) => (c.id === id ? { ...c, status: approve ? "approved" : "rejected", admin_note: note, decided_at: at(0) } : c));
  return true;
}

export async function getExpiryRadar({ days = 30 } = {}) {
  await latency();
  return radar.filter((r) => r.days_left <= days).map((r) => ({ ...r })).sort((a, b) => Date.parse(a.paid_until) - Date.parse(b.paid_until));
}
