// In-memory applications for demo mode (no VITE_SUPABASE_URL). It follows the same rules as the real
// admin-decide-application function, so approving or rejecting here moves the counts and sidebar badges too.
import { PAGE_SIZE, searchFilter, searchTerm, phoneNeedle, tabById, tabSortAscending } from "../lib/applications.js";
import { ApiError } from "./errors.js";

const HOUR = 3600_000;
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString();
const latency = (ms = 140) => new Promise((resolve) => setTimeout(resolve, ms));

const ME = "demo";

const base = {
  verification_level: "unverified", plan_key: "standard", price_at_submission: 1500, owner_id_type: "national_id",
  registered: false, county: "Nairobi", town: "Nairobi", year_established: 2019, category: "Grocery and supermarkets",
  reviewerId: null, adminNote: null, rejectionReason: null, paymentCode: null, sellerId: null,
};

const seed = [
  { n: 2041, name: "Mara Fresh Mart", owner: "Alice Njeri", phone: "+254712345001", status: "submitted", hours: 31 },
  { n: 2042, name: "Umoja Hardware", owner: "John Ouma", phone: "+254712345002", status: "submitted", hours: 27, town: "Kisumu", county: "Kisumu" },
  { n: 2043, name: "Zawadi Pharmacy", owner: "Grace Wanjiku", phone: "+254712345003", status: "submitted", hours: 6, plan: "premium", price: 3200, registered: true },
  { n: 2044, name: "Pwani Fish Traders", owner: "Hassan Mwinyi", phone: "+254712345004", status: "submitted", hours: 1, town: "Mombasa", county: "Mombasa" },
  { n: 2045, name: "Green Valley Foods", owner: "Mary Wambui", phone: "+254712345005", status: "under_review", hours: 20, reviewerId: ME },
  { n: 2046, name: "Tumaini Salon", owner: "Esther Akinyi", phone: "+254712345006", status: "under_review", hours: 10, reviewerId: "someone-else", town: "Kisumu", county: "Kisumu" },
  { n: 2047, name: "Baraka Electronics", owner: "Peter Kamau", phone: "+254712345007", status: "changes_requested", hours: 52, adminNote: "The permit photo is blurry. Please upload a clearer one." },
  { n: 2048, name: "Soko Bora Grocers", owner: "Lucy Chebet", phone: "+254712345008", status: "changes_requested", hours: 70, town: "Eldoret", county: "Uasin Gishu" },
  { n: 2049, name: "Kilimo Agrovet", owner: "Samuel Kiprop", phone: "+254712345009", status: "approved", hours: 90, town: "Nakuru", county: "Nakuru" },
  { n: 2050, name: "Jua Kali Welders", owner: "Moses Otieno", phone: "+254712345010", status: "approved", hours: 120, town: "Kisumu", county: "Kisumu" },
  { n: 2051, name: "Amani Bakery", owner: "Faith Mutheu", phone: "+254712345011", status: "payment_confirming", hours: 100, paymentCode: "SJK4H2M9QX", plan: "premium", price: 3200 },
  { n: 2052, name: "Neema Boutique", owner: "Joyce Atieno", phone: "+254712345012", status: "payment_confirming", hours: 96, paymentCode: "SJL7T3B1ZA" },
  { n: 2038, name: "Furaha Stationers", owner: "David Mwangi", phone: "+254712345013", status: "activated", hours: 300, sellerId: "ES483920" },
  { n: 2039, name: "Quick Fix Mobile", owner: "Ian Ndungu", phone: "+254712345014", status: "rejected", hours: 280, rejectionReason: "The permit expired in 2024." },
];

const SLOTS = ["owner_id_front", "owner_id_back", "sbp", "signboard"];

function build(s, index) {
  const id = `00000000-0000-4000-8000-${String(s.n).padStart(12, "0")}`;
  const submittedAt = ago(s.hours);
  const app = {
    ...base,
    id,
    reference: `EPM-2026-AB${s.n}`,
    status: s.status,
    verificationLevel: "unverified",
    businessName: s.name,
    ownerName: s.owner,
    ownerIdType: "national_id",
    ownerIdNumber: `${30000000 + s.n * 7}`,
    phone: s.phone,
    altPhone: null,
    email: `${s.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
    categoryId: "grocery",
    categoryName: base.category,
    plan: s.plan ?? "standard",
    price: s.price ?? 1500,
    registered: Boolean(s.registered),
    regType: s.registered ? "limited_company" : null,
    regNumber: s.registered ? "PVT-ABC123" : null,
    yearEstablished: 2015 + (index % 9),
    kraPin: s.registered ? "P051234567Z" : null,
    sbpNumber: `SBP-${40000 + s.n}`,
    sbpExpiry: "2026-12-31",
    shortDescription: `${s.name} sells everyday goods to the neighbourhood.`,
    county: s.county ?? base.county,
    town: s.town ?? base.town,
    address: "Market Road, next to the bus stop",
    lat: -1.2921,
    lng: 36.8219,
    businessPhones: [s.phone],
    whatsapp: s.phone,
    website: null,
    adminNote: s.adminNote ?? null,
    rejectionReason: s.rejectionReason ?? null,
    paymentCode: s.paymentCode ?? null,
    sellerId: s.sellerId ?? null,
    reviewerId: s.reviewerId ?? null,
    reviewStartedAt: s.reviewerId ? ago(s.hours - 1) : null,
    submittedAt,
    createdAt: ago(s.hours + 2),
  };
  const documents = SLOTS.map((slot, i) => ({
    id: `${id}-d${i}`, slotKey: slot, name: `${slot}.jpg`, mime: "image/jpeg", size: 240_000 + i * 31_000,
    verified: s.status === "activated", path: `${id}/${slot}.jpg`, replacementPath: null, replacementName: null,
  }));
  const flags = s.status === "changes_requested"
    ? [{ id: `${id}-f0`, path: "documents.sbp", message: "Permit photo is blurry", severity: "must_fix", status: "open", createdAt: ago(s.hours - 2) }]
    : [];
  const events = [{ id: 1, actor: "system", type: "submitted", data: {}, createdAt: submittedAt }];
  if (s.reviewerId) events.push({ id: 2, actor: "admin", type: "under_review", data: {}, createdAt: ago(s.hours - 1) });
  if (s.status === "changes_requested") events.push({ id: 3, actor: "admin", type: "request_changes", data: { note: s.adminNote }, createdAt: ago(s.hours - 2) });
  if (s.paymentCode) events.push({ id: 4, actor: "seller", type: "payment_submitted", data: {}, createdAt: ago(s.hours - 30) });
  return { app, documents, flags, events: events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}

const store = new Map(seed.map((s, i) => build(s, i)).map((entry) => [entry.app.id, entry]));
let eventId = 100;

const clone = (value) => JSON.parse(JSON.stringify(value));
const all = () => [...store.values()].map((entry) => entry.app);

export function mockApplicationCounts() {
  const by = (status) => all().filter((a) => a.status === status).length;
  return {
    submitted: by("submitted"),
    under_review: by("under_review"),
    changes_requested: by("changes_requested"),
    awaiting_payment: by("approved"),
    payment_confirming: by("payment_confirming"),
    over24h: all().filter((a) => a.status === "submitted" && Date.now() - new Date(a.submittedAt).getTime() > 24 * HOUR).length,
  };
}

const matches = (app, input) => {
  if (!searchFilter(input)) return true;
  const term = searchTerm(input).toLowerCase();
  const needle = phoneNeedle(term);
  return [app.reference, app.businessName, app.ownerName, app.phone, app.email].some((v) => String(v).toLowerCase().includes(term))
    || (needle !== "" && app.phone.includes(needle));
};

export async function listApplications({ tab, search = "", page = 0, pageSize = PAGE_SIZE } = {}) {
  await latency();
  const def = tabById(tab);
  const dir = tabSortAscending(def.id) ? 1 : -1;
  const rows = all()
    .filter((a) => def.statuses.includes(a.status) && matches(a, search))
    .sort((a, b) => dir * a.submittedAt.localeCompare(b.submittedAt))
    .map((a) => ({
      id: a.id, reference: a.reference, businessName: a.businessName, ownerName: a.ownerName, phone: a.phone, town: a.town,
      county: a.county, plan: a.plan, price: a.price, status: a.status, verification: a.verificationLevel,
      submittedAt: a.submittedAt, reviewerId: a.reviewerId,
    }));
  return { rows: clone(rows.slice(page * pageSize, (page + 1) * pageSize)), total: rows.length };
}

export async function getApplication(id) {
  await latency();
  const entry = store.get(id);
  if (!entry) throw new ApiError("not_found");
  return clone({ application: entry.app, documents: entry.documents, flags: entry.flags, events: entry.events });
}

const addEvent = (entry, actor, type, data = {}) => {
  eventId += 1;
  entry.events.unshift({ id: eventId, actor, type, data, createdAt: new Date().toISOString() });
};

export async function openApplication(id) {
  await latency(60);
  const entry = store.get(id);
  if (!entry) throw new ApiError("not_found");
  if (entry.app.status === "submitted") {
    entry.app.status = "under_review";
    entry.app.reviewerId = entry.app.reviewerId ?? ME;
    entry.app.reviewStartedAt = new Date().toISOString();
    addEvent(entry, "admin", "under_review");
  }
  return entry.app.status;
}

const FROM = {
  request_changes: ["submitted", "under_review"],
  approve: ["submitted", "under_review"],
  reject: ["submitted", "under_review", "changes_requested"],
  set_verification: ["submitted", "under_review", "changes_requested", "approved"],
  return_to_queue: ["under_review"],
};

export async function decideApplication({ applicationId, action, reason, note, channels = {}, verificationLevel, priceOverride, preview = false }) {
  await latency(220);
  const entry = store.get(applicationId);
  if (!entry) throw new ApiError("not_found");
  const app = entry.app;
  if (!FROM[action]?.includes(app.status)) throw new ApiError("invalid_status", undefined, { status: app.status });

  const ref = app.reference;
  let next = app.status;
  let text = "";
  let subject = "";

  if (action === "request_changes") {
    const openFlags = entry.flags.filter((f) => f.status === "open").length;
    if (!note && openFlags === 0) throw new ApiError("flag_or_note_required");
    next = "changes_requested";
    subject = `Changes needed on your EpicMKT application ${ref}`;
    text = `EpicMKT: changes are needed on your application ${ref}. ${note ? `${note} ` : ""}Open your status page to fix them.`;
  }
  if (action === "reject") {
    if (!reason) throw new ApiError("reason_required");
    next = "rejected";
    subject = `Your EpicMKT application ${ref}`;
    text = `EpicMKT: your application ${ref} was not approved. Reason: ${reason}`;
  }
  if (action === "approve") {
    if (priceOverride !== undefined && !reason) throw new ApiError("override_reason_required");
    next = "approved";
    subject = `Your EpicMKT application ${ref} is approved`;
    text = `EpicMKT: ${app.businessName} is approved. Pay KES ${priceOverride ?? app.price} to M-Pesa Till 123456 (EpicMKT), then enter the M-Pesa code on your status page.`;
  }
  if (action === "set_verification") {
    if (!verificationLevel) throw new ApiError("verification_level_required");
    subject = `Verification update for ${ref}`;
    text = `EpicMKT: the verification level of your application ${ref} is now ${verificationLevel}.`;
  }
  if (action === "return_to_queue") {
    next = "submitted";
    subject = `Your EpicMKT application ${ref}`;
    text = `EpicMKT: your application ${ref} is back in the review queue.`;
  }

  const messages = {};
  if (channels.sms) messages.sms = { to: app.phone, subject: null, body: text };
  if (channels.email) messages.email = { to: app.email, subject, body: text };

  if (preview) return { ok: true, preview: true, action, nextStatus: next, messages };

  app.status = next;
  if (verificationLevel) app.verificationLevel = verificationLevel;
  if (action === "request_changes") app.adminNote = note ?? null;
  if (action === "reject") app.rejectionReason = reason;
  if (action === "return_to_queue") {
    app.reviewerId = null;
    app.reviewStartedAt = null;
  } else if (action !== "set_verification") {
    app.reviewerId = ME;
  }
  addEvent(entry, "admin", action, { reason: reason ?? null, note: note ?? null, verificationLevel: verificationLevel ?? null, to: next });
  return { ok: true, action, status: next, queued: Object.keys(messages) };
}

export async function getApplicationDocumentUrl({ applicationId, slotKey }) {
  await latency(80);
  const entry = store.get(applicationId);
  if (!entry) throw new ApiError("not_found");
  addEvent(entry, "admin", "document_viewed", { slot: slotKey });
  const html = `<!doctype html><title>Demo document</title><body style="font:16px system-ui;padding:2rem"><h1>Demo document</h1><p>${slotKey} for ${entry.app.businessName}.</p><p>Demo mode has no real files.</p></body>`;
  return { url: URL.createObjectURL(new Blob([html], { type: "text/html" })), expiresIn: 60 };
}
