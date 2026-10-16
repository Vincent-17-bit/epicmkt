// In-memory stand-in for the Businesses RPCs, used when VITE_SUPABASE_URL is not set. It enforces the same rules as the
// database (state checks, reasons, roles) so the UI behaves the same offline. State lives only for the page session.
import { ACTIONS, PAGE_SIZE, countdown, roleAllows } from "../lib/businesses.js";

const wait = () => new Promise((resolve) => setTimeout(resolve, 80));
const DAY = 864e5;
const inDays = (n) => new Date(Date.now() + n * DAY).toISOString();
const err = (code) => Object.assign(new Error(code), { code });

let ROLE = "owner";
export const setMockRole = (role) => { ROLE = role; };

const AGENTS = [
  { user_id: "u-owner", email: "owner@epicmkt.test", display_name: "Amina (owner)", role: "owner" },
  { user_id: "u-rev", email: "reviewer@epicmkt.test", display_name: "Brian (reviewer)", role: "reviewer" },
  { user_id: "u-sup", email: "support@epicmkt.test", display_name: "Cynthia (support)", role: "support" },
];

const base = {
  whatsapp: null, socials: {}, amenities: [], payment_methods: ["mpesa"], delivery_area: null, county: "Nairobi", address: null, lat: null, lng: null,
  announcement: null, logo_path: "x", cover_path: "x", exceptions: [{ id: "e-1", date: new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10), kind: "closed", intervals: [], note: "Stock take" }], partial_closures: [], override: null, must_change_password: false,
  strikes: 0, featured_until: null, featured_rank: null, assigned_agent: null, application_id: null, deleted_at: null, status_reason: null,
  hours: { sun: null, mon: ["08:00", "18:00"], tue: ["08:00", "18:00"], wed: ["08:00", "18:00"], thu: ["08:00", "18:00"], fri: ["08:00", "18:00"], sat: ["09:00", "14:00"] },
  health: 80, open_flags: 0, tags: [],
};
const mk = (o) => ({ ...base, created_at: inDays(-200), updated_at: inDays(-2), last_login_at: inDays(-1), last_edit_at: inDays(-6), first_paid_at: inDays(-150), ...o });

const DB = [
  mk({ id: "b-1001", seller_id: "ES482913", slug: "mara-fresh-mart", name: "Mara Fresh Mart", category_id: "grocery", category_name: "Grocery", plan_key: "premium", status: "live", verification_level: "verified", featured: true, featured_until: inDays(9), paid_until: inDays(21), monthly_price: 3200, tagline: "Fresh every morning", description: "Greengrocer and daily essentials.", phone: "0712345678", email: "alice@marafresh.example", owner_name: "Alice Njeri", town: "Nairobi", tags: ["vip"], health: 92, assigned_agent: "u-rev" }),
  mk({ id: "b-1002", seller_id: "ES571204", slug: "umoja-hardware", name: "Umoja Hardware", category_id: "hardware", category_name: "Hardware", plan_key: "standard", status: "live", verification_level: "unverified", paid_until: inDays(4), monthly_price: 2500, tagline: null, description: "Cement, paint and tools.", phone: "0723456789", email: "john@umoja.example", owner_name: "John Ouma", town: "Kisumu", health: 61, open_flags: 1 }),
  mk({ id: "b-1003", seller_id: "ES690331", slug: "green-valley-foods", name: "Green Valley Foods", category_id: "food", category_name: "Food", plan_key: "premium", status: "live", verification_level: "unverified", paid_until: inDays(-1), monthly_price: 4500, description: null, phone: "0734567890", email: null, owner_name: "Mary Wambui", town: "Mombasa", health: 38, open_flags: 2, logo_path: null }),
  mk({ id: "b-1004", seller_id: "ES702118", slug: "lakeside-cyber", name: "Lakeside Cyber", category_id: "services", category_name: "Services", plan_key: "standard", status: "live", paid_until: inDays(-6), monthly_price: 1800, phone: "0745678901", email: "peter@lakeside.example", owner_name: "Peter Otieno", town: "Kisumu", health: 22 }),
  mk({ id: "b-1005", seller_id: "ES815520", slug: "pwani-salon", name: "Pwani Salon", category_id: "beauty", category_name: "Beauty", plan_key: "standard", status: "suspended", status_reason: "Reported for fake prices", strikes: 2, paid_until: inDays(12), monthly_price: 1500, phone: "0756789012", email: "zawadi@pwani.example", owner_name: "Zawadi Hamisi", town: "Mombasa", health: 30, application_id: "a-3001" }),
  mk({ id: "b-1006", seller_id: "ES903377", slug: "rift-motors", name: "Rift Motors", category_id: "auto", category_name: "Auto", plan_key: "premium", status: "paused", status_reason: "Seller asked", paid_until: inDays(15), monthly_price: 5200, phone: "0767890123", email: "kip@rift.example", owner_name: "Kipchirchir Koech", town: "Nakuru", health: 55, tags: ["call-back"] }),
  mk({ id: "b-1007", seller_id: "ES120045", slug: "old-bakery", name: "Old Bakery", category_id: "food", category_name: "Food", plan_key: "standard", status: "deleted", status_reason: "Duplicate listing", deleted_at: inDays(-3), paid_until: inDays(-40), monthly_price: 1500, phone: "0778901234", email: null, owner_name: "Wanjiru Kamau", town: "Nairobi", health: 0 }),
  mk({ id: "b-1008", seller_id: "ES000000", slug: "new-boutique", name: "New Boutique", category_id: "fashion", category_name: "Fashion", plan_key: "standard", status: "pending", paid_until: null, first_paid_at: null, monthly_price: 1500, phone: "0789012345", email: "new@boutique.example", owner_name: "Njeri Mwangi", town: "Thika", health: 10, last_login_at: null }),
];

const NOTES = new Map([["b-1001", [{ id: "n-1", body: "Asked about a second branch in Westlands.", pinned: true, author_email: "owner@epicmkt.test", created_at: inDays(-9) }]]]);
const LOG = new Map();
const MESSAGES = new Map([["b-1002", [{ id: "m-1", channel: "sms", status: "delivered", subject: null, body: "Payment received, paid until the date shown.", template_key: "payment_received", to_address: "0723456789", error: null, attempts: 1, sent_at: inDays(-12), created_at: inDays(-12) }]]]);
const PAYMENTS = new Map([
  ["b-1001", [{ id: "p-1", mpesa_code: "SJK4H2L9QX", receipt_no: "RCT-000001", amount_kes: 3200, months: 1, status: "confirmed", kind: "renewal", plan_key: "premium", method: "mpesa", phone: "0712345678", decline_reason: null, submitted_at: inDays(-9), confirmed_at: inDays(-9), created_at: inDays(-9) }]],
  ["b-1002", [{ id: "p-2", mpesa_code: "SJL8M3N1RT", receipt_no: null, amount_kes: 2500, months: 1, status: "submitted", kind: "renewal", plan_key: "standard", method: "mpesa", phone: "0723456789", decline_reason: null, submitted_at: inDays(-1), confirmed_at: null, created_at: inDays(-1) }]],
]);

const find = (id) => DB.find((b) => b.id === id) ?? null;
const logAction = (id, action, before, after, reason) => {
  const rows = LOG.get(id) ?? [];
  rows.unshift({ id: `l-${Date.now()}-${rows.length}`, action, actor_role: "admin", actor_email: "owner@epicmkt.test", reason: reason ?? null, before, after, data: {}, created_at: new Date().toISOString() });
  LOG.set(id, rows);
};

function visibility(b) {
  const c = countdown(b.paid_until);
  const why = (code, visible, reason) => ({ code, visible, reason });
  if (b.deleted_at) return why("deleted", false, "In the recycle bin. Customers cannot see it.");
  if (b.status === "pending") return why("pending", false, "Not activated yet. Customers cannot see it.");
  if (b.status === "suspended") return why("suspended", false, `Suspended by an admin${b.status_reason ? `: ${b.status_reason}` : ""}. Customers cannot see it.`);
  if (b.status === "paused") return why("paused", false, `Unlisted${b.status_reason ? `: ${b.status_reason}` : ""}. Customers cannot see it.`);
  if (b.status === "expired" || c.state === "expired") return why("expired", false, "The paid month and the day of grace have ended. Customers cannot see it.");
  if (c.state === "none") return why("unpaid", false, "No payment has been confirmed yet. Customers cannot see it.");
  if (c.state === "grace") return why("grace", true, "In the day of grace after the paid month. Customers can still see it until it ends.");
  return why("visible", true, "Live and paid. Customers can see it.");
}

const decorate = (b) => {
  const c = countdown(b.paid_until);
  return { ...b, days_left: c.daysLeft, listing_state: c.state, visibility: visibility(b) };
};

const inTab = (b, tab) => {
  const c = countdown(b.paid_until);
  const live = b.status === "live" && !b.deleted_at;
  switch (tab) {
    case "all": return !b.deleted_at;
    case "live": return live && ["active", "grace"].includes(c.state);
    case "expiring": return live && c.state === "active" && c.daysLeft <= 7;
    case "grace": return live && c.state === "grace";
    case "expired": return !b.deleted_at && ["live", "expired"].includes(b.status) && c.state === "expired";
    case "paused": return !b.deleted_at && b.status === "paused";
    case "suspended": return !b.deleted_at && b.status === "suspended";
    case "pending": return !b.deleted_at && b.status === "pending";
    case "featured": return !b.deleted_at && b.featured;
    case "recycle": return Boolean(b.deleted_at);
    default: throw err("invalid_tab");
  }
};

const matchFilters = (b, f = {}) => {
  if (f.plan && b.plan_key !== f.plan) return false;
  if (f.category && b.category_id !== f.category) return false;
  if (f.town && !String(b.town ?? "").toLowerCase().includes(String(f.town).toLowerCase())) return false;
  if (f.verification && b.verification_level !== f.verification) return false;
  if (typeof f.featured === "boolean" && b.featured !== f.featured) return false;
  if (f.tag && !b.tags.includes(f.tag)) return false;
  if (f.agent && b.assigned_agent !== f.agent) return false;
  if (f.unassigned && b.assigned_agent) return false;
  if (f.minHealth !== undefined && f.minHealth !== "" && b.health < Number(f.minHealth)) return false;
  if (f.maxHealth !== undefined && f.maxHealth !== "" && b.health > Number(f.maxHealth)) return false;
  if (f.paidFrom && (!b.paid_until || b.paid_until.slice(0, 10) < f.paidFrom)) return false;
  if (f.paidTo && (!b.paid_until || b.paid_until.slice(0, 10) > f.paidTo)) return false;
  if (f.hasFlags && !(b.open_flags > 0)) return false;
  return true;
};

export async function getAdminRole() {
  await wait();
  return ROLE;
}
export async function listAgents() {
  await wait();
  return AGENTS;
}

export async function listBusinesses({ tab = "all", q = "", sort = "name", dir = "asc", page = 1, filters = {} } = {}) {
  await wait();
  const needle = String(q).trim().toLowerCase();
  const rows = DB.filter((b) => inTab(b, tab) && matchFilters(b, filters)
    && (!needle || ["name", "slug", "seller_id", "phone", "email", "owner_name", "town"].some((k) => String(b[k] ?? "").toLowerCase().includes(needle))));
  const sign = dir === "desc" ? -1 : 1;
  const key = { name: (b) => b.name.toLowerCase(), paid_until: (b) => b.paid_until ?? "9999", health: (b) => b.health, town: (b) => String(b.town ?? "").toLowerCase(),
    created_at: (b) => b.created_at, last_login_at: (b) => b.last_login_at ?? "", open_flags: (b) => b.open_flags }[sort];
  if (!key) throw err("invalid_sort");
  rows.sort((a, b) => (key(a) < key(b) ? -sign : key(a) > key(b) ? sign : 0));
  const start = (Math.max(1, page) - 1) * PAGE_SIZE;
  const counts = Object.fromEntries(["all", "live", "expiring", "grace", "expired", "paused", "suspended", "pending", "featured", "recycle"].map((t) => [t, DB.filter((b) => inTab(b, t)).length]));
  return { total: rows.length, rows: rows.slice(start, start + PAGE_SIZE).map(decorate), counts };
}

export async function getBusinessDetail(id) {
  await wait();
  const b = find(id);
  if (!b) throw err("not_found");
  const d = decorate(b);
  return {
    business: d, listing_state: d.listing_state, days_left: d.days_left, visibility: d.visibility, health: b.health,
    counts: { items: 12, faqs: 3, offers: 1, open_flags: b.open_flags, open_reports: 0, unconfirmed_payments: (PAYMENTS.get(id) ?? []).filter((p) => p.status === "submitted").length, pending_changes: 0 },
  };
}

export async function getBusinessTab(id, tab) {
  await wait();
  const b = find(id);
  if (!b) throw err("not_found");
  switch (tab) {
    case "payments": return PAYMENTS.get(id) ?? [];
    case "messages": return MESSAGES.get(id) ?? [];
    case "activity": return LOG.get(id) ?? [];
    case "notes": return [...(NOTES.get(id) ?? [])].sort((a, c) => Number(c.pinned) - Number(a.pinned) || c.created_at.localeCompare(a.created_at));
    case "documents": return { application_id: b.application_id, reference_no: b.application_id ? "EM-2049" : null, documents: b.application_id ? [{ id: "d-1", slot_key: "id_front", original_name: "id-front.jpg", mime: "image/jpeg", size_bytes: 482113, verified: true, created_at: inDays(-150) }, { id: "d-2", slot_key: "business_permit", original_name: "permit.pdf", mime: "application/pdf", size_bytes: 1203311, verified: false, created_at: inDays(-150) }] : [] };
    case "team": return { staff: [], timetable: [] };
    default: throw err("invalid_tab");
  }
}

function apply(b, key, form, role) {
  const a = ACTIONS[key];
  if (!a) throw err("invalid_action");
  if (!roleAllows(a.roles, role)) throw err("forbidden");
  const reason = String(form?.reason ?? "").trim();
  if (a.reason && (reason.length < 3 || reason.length > 300)) throw err("reason_required");
  if (!a.when(b)) throw err("invalid_status");
  const before = { status: b.status, status_reason: b.status_reason, paid_until: b.paid_until, featured: b.featured, verification_level: b.verification_level, strikes: b.strikes, deleted_at: b.deleted_at };
  switch (key) {
    case "suspend": b.status = "suspended"; b.status_reason = reason; break;
    case "unsuspend": b.status = "live"; b.status_reason = null; break;
    case "unlist": b.status = "paused"; b.status_reason = reason; break;
    case "relist": b.status = "live"; b.status_reason = null; break;
    case "feature": b.featured = true; b.featured_until = form?.until ? new Date(form.until).toISOString() : null; b.featured_rank = form?.rank ? Number(form.rank) : null; break;
    case "unfeature": b.featured = false; b.featured_until = null; b.featured_rank = null; break;
    case "extend": {
      const days = Number(form?.days);
      if (!Number.isInteger(days) || days < 1 || days > 365) throw err("invalid_args");
      const from = Math.max(Date.now(), b.paid_until ? Date.parse(b.paid_until) : 0);
      b.paid_until = new Date(from + days * DAY).toISOString();
      if (b.status === "expired" && countdown(b.paid_until).state === "active") { b.status = "live"; b.status_reason = null; }
      break;
    }
    case "verify": if (!["verified", "unverified"].includes(form?.level)) throw err("invalid_args"); b.verification_level = form.level; break;
    case "strikes": { const d = Number(form?.delta); if (!Number.isInteger(d) || d === 0 || Math.abs(d) > 3) throw err("invalid_args"); b.strikes = Math.max(0, b.strikes + d); break; }
    case "delete": b.status = "deleted"; b.deleted_at = new Date().toISOString(); b.status_reason = reason; b.featured = false; break;
    case "restore": b.status = "paused"; b.deleted_at = null; b.status_reason = reason; break;
    default: throw err("invalid_action");
  }
  b.updated_at = new Date().toISOString();
  logAction(b.id, `business.${key}`, before, { status: b.status, status_reason: b.status_reason, paid_until: b.paid_until, featured: b.featured, verification_level: b.verification_level, strikes: b.strikes, deleted_at: b.deleted_at }, reason);
  return decorate(b);
}

export async function runBusinessAction(key, id, form) {
  await wait();
  const b = find(id);
  if (!b) throw err("not_found");
  return apply(b, key, form, ROLE);
}

export async function bulkBusinesses(ids, action, { reason = null, args = {} } = {}) {
  await wait();
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 200) throw err("invalid_selection");
  let done = 0;
  const skipped = [];
  for (const id of new Set(ids)) {
    const b = find(id);
    try {
      if (!b) throw err("not_found");
      if (action === "tag") {
        if (!roleAllows(["reviewer", "support"], ROLE)) throw err("forbidden");
        const next = new Set(b.tags);
        for (const t of args.add ?? []) next.add(String(t).trim().toLowerCase());
        for (const t of args.remove ?? []) next.delete(String(t).trim().toLowerCase());
        if (next.size > 10) throw err("too_many_tags");
        b.tags = [...next];
      } else if (action === "assign") {
        if (!roleAllows(["reviewer", "support"], ROLE)) throw err("forbidden");
        b.assigned_agent = args.agent || null;
      } else if (action === "message") {
        if (!roleAllows(["reviewer", "support"], ROLE)) throw err("forbidden");
        await messageBusiness(id, { subject: args.subject, body: args.body, channels: args.channels ?? ["in_app"] });
      } else {
        apply(b, action === "feature" && args.featured === false ? "unfeature" : action, { reason, ...args }, ROLE);
      }
      done += 1;
    } catch (e) {
      if (["forbidden", "reason_required", "invalid_args", "invalid_action", "too_many_tags"].includes(e.code)) throw e;
      skipped.push({ id, error: e.code ?? e.message });
    }
  }
  return { done, skipped };
}

export async function messageBusiness(id, { subject, body, channels = ["in_app"] }) {
  await wait();
  const b = find(id);
  if (!b || b.deleted_at) throw err("not_found");
  if (!roleAllows(["reviewer", "support"], ROLE)) throw err("forbidden");
  const text = String(body ?? "").trim();
  if (!text || text.length > 1000) throw err("invalid_args");
  if (!channels.length || channels.some((c) => !["in_app", "sms", "email"].includes(c))) throw err("invalid_args");
  const rows = MESSAGES.get(id) ?? [];
  for (const channel of channels) {
    if (channel !== "sms" && !String(subject ?? "").trim()) throw err("subject_required");
    if (channel === "email" && !b.email) throw err("no_email");
    if (channel === "sms" && text.length > 480) throw err("sms_too_long");
  }
  for (const channel of channels) {
    rows.unshift({ id: `m-${Date.now()}-${channel}`, channel, status: channel === "in_app" ? "sent" : "queued", subject: subject || null, body: text, template_key: "admin_message", to_address: channel === "sms" ? b.phone : channel === "email" ? b.email : null, error: null, attempts: 0, sent_at: null, created_at: new Date().toISOString() });
  }
  MESSAGES.set(id, rows);
  logAction(id, "business.message", null, { channels, subject: subject || null }, null);
  return { id, channels };
}

export async function addBusinessNote(id, body, pinned = false) {
  await wait();
  if (!find(id)) throw err("not_found");
  const text = String(body ?? "").trim();
  if (!text || text.length > 2000) throw err("invalid_args");
  const note = { id: `n-${Date.now()}`, body: text, pinned: Boolean(pinned), author_email: "owner@epicmkt.test", created_at: new Date().toISOString() };
  NOTES.set(id, [note, ...(NOTES.get(id) ?? [])]);
  logAction(id, "business.note_added", null, { note_id: note.id, pinned: note.pinned }, null);
  return note;
}
export async function setBusinessNotePinned(noteId, pinned) {
  await wait();
  for (const [id, rows] of NOTES) {
    const n = rows.find((x) => x.id === noteId);
    if (n) { n.pinned = Boolean(pinned); logAction(id, "business.note_pinned", null, { note_id: noteId, pinned: n.pinned }, null); return true; }
  }
  throw err("not_found");
}
export async function deleteBusinessNote(noteId) {
  await wait();
  for (const [id, rows] of NOTES) {
    const i = rows.findIndex((x) => x.id === noteId);
    if (i >= 0) { const [n] = rows.splice(i, 1); logAction(id, "business.note_deleted", { note_id: noteId, body: n.body }, null, null); return true; }
  }
  throw err("not_found");
}
