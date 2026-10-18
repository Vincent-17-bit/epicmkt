// Builds the admin demo dataset. Pure: no database, no network, same input => same output.
// Every demo row is recognisable (seller IDs ES99xxxx, slugs demo-*, references EPM-YYYY-DEMOxx,
// storage paths demo/...), so `--reset` removes exactly what the seed created and nothing else.
import { addCalendarMonth, addDays, nairobiDay, nairobiMidnight } from "../../supabase/functions/_shared/dates.ts";
import { countSms } from "../../supabase/functions/_shared/sms.ts";
import { SAFE_ALPHABET } from "../../supabase/functions/_shared/ids.ts";

export type Row = Record<string, unknown>;
/** Wrap a value that goes into a jsonb column. Plain arrays are sent as Postgres arrays (text[]). */
export class Json {
  readonly value: unknown;
  constructor(value: unknown) { this.value = value; }
}
export const json = (value: unknown) => new Json(value);

export type SeedCategory = { id: string; name: string; grp?: string; tier?: string };
export type SeedPlan = { category_id: string; plan_key: "standard" | "premium"; price_kes: number; items_limit: number };
export type SeedInput = { seed?: number; now?: Date; categories: SeedCategory[]; plans: SeedPlan[] };

/** Insert order (parents first) and the order `--reset` deletes in is the reverse. */
export const TABLE_ORDER = [
  "message_templates", "applications", "application_documents", "application_flags", "application_events",
  "businesses", "items", "item_media", "faqs", "offers", "flags", "reports", "payments", "change_requests", "messages",
] as const;
export type SeedTable = (typeof TABLE_ORDER)[number];
export type SeedData = { tables: Record<SeedTable, Row[]>; stats: Record<string, number | Record<string, number>>; };

export const DEMO = { sellerPrefix: "ES99", slugPrefix: "demo-", refMarker: "DEMO", storagePrefix: "demo/", duplicateCodeNote: "Duplicate of an earlier payment" } as const;
export const COUNTS = { businesses: 66, items: 280, payments: 40, changeRequests: 12, reports: 10, applications: 26 } as const;

// ---- seeded random ------------------------------------------------------------------------------
function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seed: number) {
  const next = mulberry32(seed);
  const int = (a: number, b: number) => a + Math.floor(next() * (b - a + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)];
  const chance = (p: number) => next() < p;
  const shuffle = <T>(xs: readonly T[]): T[] => {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  };
  const hex = (n: number) => Array.from({ length: n }, () => int(0, 15).toString(16)).join("");
  const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[int(0, 3)]}${hex(3)}-${hex(12)}`;
  const code = (n: number, alphabet = SAFE_ALPHABET) => Array.from({ length: n }, () => alphabet[int(0, alphabet.length - 1)]).join("");
  return { next, int, pick, chance, shuffle, uuid, code };
}

// ---- pools --------------------------------------------------------------------------------------
const PREFIX = ["Baraka", "Jambo", "Karibu", "Umoja", "Safari", "Tumaini", "Pwani", "Zuri", "Imani", "Upendo", "Amani", "Neema", "Harambee", "Mwangaza", "Sasa", "Fahari"];
const SUFFIX = ["Hub", "Point", "Corner", "Express", "Centre", "Plaza", "Studio", "Mart", "Works", "House", "Stop", "Place"];
const OWNERS = ["Alice Njeri", "John Ouma", "Mary Wambui", "Peter Kamau", "Grace Atieno", "David Mutua", "Faith Chebet", "Samuel Otieno", "Lucy Wanjiru", "Brian Kiprop", "Esther Akinyi", "James Mwangi", "Rose Nyambura", "Joseph Odhiambo", "Anne Muthoni", "Kevin Barasa"];
const TOWNS = [
  { county: "Nairobi", town: "Westlands", lat: -1.2676, lng: 36.8108 }, { county: "Nairobi", town: "Embakasi", lat: -1.3192, lng: 36.9006 },
  { county: "Kisumu", town: "Kisumu", lat: -0.0917, lng: 34.768 }, { county: "Kisumu", town: "Maseno", lat: -0.0058, lng: 34.6011 },
  { county: "Mombasa", town: "Nyali", lat: -4.0235, lng: 39.7081 }, { county: "Nakuru", town: "Nakuru", lat: -0.3031, lng: 36.08 },
  { county: "Uasin Gishu", town: "Eldoret", lat: 0.5143, lng: 35.2698 }, { county: "Kiambu", town: "Thika", lat: -1.0332, lng: 37.0693 },
  { county: "Kisii", town: "Kisii", lat: -0.6817, lng: 34.7667 }, { county: "Kakamega", town: "Kakamega", lat: 0.2827, lng: 34.7519 },
  { county: "Machakos", town: "Machakos", lat: -1.5177, lng: 37.2634 }, { county: "Nyeri", town: "Nyeri", lat: -0.4201, lng: 36.9476 },
];
const ITEM_NAMES = ["Standard service", "Premium service", "Starter pack", "Family pack", "Express delivery", "Weekend special", "Deluxe option", "Basic option", "Monthly plan", "Bulk order", "Home visit", "Consultation", "Gift set", "Seasonal offer", "Trial session"];
const ITEM_MODS = ["Small", "Medium", "Large", "Classic", "Plus", "Mini", "Pro", "Lite"];
const TAGS = ["open-late", "delivery", "halal", "walk-ins", "appointments", "student-offer", "24h", "wholesale", "mpesa"];
const SUSPEND_REASONS = ["Repeated wrong prices after two warnings", "Listing used for a different business", "Reports of a fake phone number", "Documents did not match the listing"];
const REPORT_REASONS = ["wrong-price", "wrong-info", "closed", "wrong-contact", "scam", "inappropriate"] as const;
const FLAG_REASONS = ["Price looks wrong compared with the shop", "Photo does not match the item", "Description is copied from another seller", "Please confirm this item is still sold", "Phone number in the item text"];
const FLAG_QUESTIONS = ["Is this price still correct? Please confirm or update it.", "Please upload a photo of the product on your shelf.", "Can you confirm the shop is open on Sundays?"];
const SMS_ERRORS = ["at_InvalidPhoneNumber", "at_InsufficientBalance", "at_InvalidSenderId", "at_UserInBlacklist", "provider_http_500", "provider_unreachable"];
const EMAIL_ERRORS = ["provider_http_422", "provider_unreachable", "email_not_configured"];

export const TEMPLATES: Row[] = [
  { key: "application_approved", channel: "sms", subject: null, body_en: "EpicMKT: your application {reference} is approved. Pay KSh {amount} to activate your listing.", body_sw: "EpicMKT: ombi lako {reference} limeidhinishwa. Lipa KSh {amount} ili kuwezesha biashara yako." },
  { key: "application_changes", channel: "sms", subject: null, body_en: "EpicMKT: we need a few changes to {reference}. Open Check my application to see what to fix.", body_sw: "EpicMKT: tunahitaji marekebisho kwa {reference}. Fungua Check my application kuona." },
  { key: "payment_received", channel: "sms", subject: null, body_en: "EpicMKT: we received KSh {amount}. Your listing is paid until {date}. Receipt {receipt}.", body_sw: "EpicMKT: tumepokea KSh {amount}. Biashara yako imelipiwa hadi {date}. Risiti {receipt}." },
  { key: "renewal_reminder", channel: "sms", subject: null, body_en: "EpicMKT: your listing expires in {days} days. Renew to stay visible.", body_sw: "EpicMKT: biashara yako inaisha baada ya siku {days}. Lipia ili uendelee kuonekana." },
  { key: "welcome_email", channel: "email", subject: "Welcome to EpicMKT", body_en: "<p>Hello {name}, your listing is live.</p>", body_sw: null },
  { key: "payment_receipt_email", channel: "email", subject: "Your EpicMKT receipt {receipt}", body_en: "<p>We received KSh {amount}. Receipt {receipt}.</p>", body_sw: null },
];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const iso = (d: Date) => d.toISOString();
const daysAgo = (now: Date, n: number) => new Date(now.getTime() - n * 86_400_000);

export type ItemIssue = "stale_price" | "missing_price" | "bad_sale_price" | "out_of_stock" | "no_photos" | "hidden_by_admin" | "open_flag" | "open_report";
export const ITEM_ISSUES: readonly ItemIssue[] = ["stale_price", "missing_price", "bad_sale_price", "out_of_stock", "no_photos", "hidden_by_admin", "open_flag", "open_report"];

type Scenario = "pending" | "live_active" | "live_expiring" | "live_grace" | "live_lapsed" | "paused" | "suspended" | "expired" | "deleted";
const SCENARIOS: Array<[Scenario, number]> = [
  ["pending", 5], ["live_active", 26], ["live_expiring", 6], ["live_grace", 3], ["live_lapsed", 4], ["paused", 6], ["suspended", 5], ["expired", 7], ["deleted", 4],
];

export function buildSeed(input: SeedInput): SeedData {
  const rng = makeRng(input.seed ?? 20261014);
  const { int, pick, chance, shuffle, uuid } = rng;
  const now = input.now ?? new Date();
  const today = nairobiDay(now);
  const year = today.slice(0, 4);
  if (!input.categories.length) throw new Error("no categories: run `npm run seed` first");
  const planOf = (cat: string, key: "standard" | "premium"): SeedPlan => {
    const p = input.plans.find((x) => x.category_id === cat && x.plan_key === key);
    if (!p) throw new Error(`no ${key} plan for category ${cat}: run \`npm run seed\` first`);
    return p;
  };
  const eligible = input.categories.filter((c) => input.plans.some((p) => p.category_id === c.id && p.plan_key === "standard") && input.plans.some((p) => p.category_id === c.id && p.plan_key === "premium"));
  if (!eligible.length) throw new Error("no category has both plans: run `npm run seed` first");

  const t: Record<SeedTable, Row[]> = Object.fromEntries(TABLE_ORDER.map((k) => [k, [] as Row[]])) as Record<SeedTable, Row[]>;
  t.message_templates = TEMPLATES.map((r) => ({ ...r }));

  // ---- M-Pesa codes: 10 unique letters and digits ------------------------------------------------
  const usedCodes = new Set<string>();
  const mpesa = () => { for (;;) { const c = `S${rng.code(9, "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789")}`; if (!usedCodes.has(c)) { usedCodes.add(c); return c; } } };
  const phone = () => `+2547${int(10_000_000, 99_999_999)}`;

  // ---- businesses --------------------------------------------------------------------------------
  const scenarios = shuffle(SCENARIOS.flatMap(([s, n]) => Array.from({ length: n }, () => s)));
  if (scenarios.length !== COUNTS.businesses) throw new Error("scenario table does not add up");
  type Biz = { id: string; row: Row; scenario: Scenario; limit: number; price: number; paidDay: string | null; catId: string; plan: "standard" | "premium" };
  const bizs: Biz[] = scenarios.map((scenario, i) => {
    const n = i + 1;
    const cat = pick(eligible);
    const plan: "standard" | "premium" = chance(0.3) ? "premium" : "standard";
    const p = planOf(cat.id, plan);
    const place = pick(TOWNS);
    const name = `${pick(PREFIX)} ${pick(SUFFIX)} ${n}`;
    const owner = pick(OWNERS);
    const sellerId = `${DEMO.sellerPrefix}${String(n).padStart(4, "0")}`;
    let paidDay: string | null = null;
    let status: string = "live";
    switch (scenario) {
      case "pending": status = "pending"; break;
      case "live_active": paidDay = addDays(today, int(8, 30)); break;
      case "live_expiring": paidDay = addDays(today, int(0, 7)); break;
      case "live_grace": paidDay = addDays(today, -1); break;
      case "live_lapsed": paidDay = addDays(today, -int(3, 20)); break;
      case "paused": status = "paused"; paidDay = addDays(today, int(5, 25)); break;
      case "suspended": status = "suspended"; paidDay = addDays(today, int(-10, 20)); break;
      case "expired": status = "expired"; paidDay = addDays(today, -int(3, 60)); break;
      case "deleted": status = "deleted"; paidDay = addDays(today, -int(20, 120)); break;
    }
    const created = daysAgo(now, int(30, 400));
    const id = uuid();
    const row: Row = {
      id, seller_id: sellerId, user_id: null, application_id: null,
      slug: `${DEMO.slugPrefix}${slugify(name)}`,
      name, category_id: cat.id, plan_key: plan, status,
      verification_level: status !== "pending" && chance(0.35) ? "verified" : "unverified",
      featured: status === "live" && plan === "premium" && chance(0.3),
      paid_until: paidDay ? nairobiMidnight(paidDay) : null,
      tagline: `${name}: friendly service in ${place.town}`, description: `Demo listing for ${name}.`,
      phone: phone(), whatsapp: phone(), email: `${slugify(name)}@example.com`,
      county: place.county, town: place.town, address: `${int(1, 200)} Main Street, ${place.town}`,
      lat: place.lat + (rng.next() - 0.5) * 0.02, lng: place.lng + (rng.next() - 0.5) * 0.02,
      tags: shuffle(TAGS).slice(0, int(1, 3)),
      owner_name: owner, monthly_price: p.price_kes,
      status_reason: scenario === "suspended" ? pick(SUSPEND_REASONS) : scenario === "paused" && chance(0.5) ? "Hidden at the owner's request" : null,
      strikes: scenario === "suspended" ? 3 : chance(0.1) ? 1 : 0,
      first_paid_at: paidDay ? iso(daysAgo(now, int(20, 300))) : null,
      last_login_at: status === "pending" ? null : iso(daysAgo(now, int(0, 40))),
      deleted_at: scenario === "deleted" ? iso(daysAgo(now, int(1, 15))) : null,
      created_at: iso(created),
    };
    return { id, row, scenario, limit: p.items_limit, price: p.price_kes, paidDay, catId: cat.id, plan };
  });
  t.businesses = bizs.map((b) => b.row);
  const alive = bizs.filter((b) => b.scenario !== "deleted");

  // ---- items (280, about three quarters with at least one issue) -----------------------------------
  const wanted = COUNTS.items;
  const itemBiz: Biz[] = [];
  const room = new Map(alive.map((b) => [b.id, Math.min(b.limit, 14)]));
  for (let guard = 0; itemBiz.length < wanted && guard < 50; guard++) {
    for (const b of shuffle(alive.filter((x) => x.scenario !== "pending" || guard === 0))) {
      if (itemBiz.length >= wanted) break;
      const left = room.get(b.id) ?? 0;
      if (left > 0) { itemBiz.push(b); room.set(b.id, left - 1); }
    }
  }
  if (itemBiz.length < wanted) throw new Error(`plan limits only allow ${itemBiz.length} demo items, need ${wanted}`);

  const issueTargets = new Set(shuffle(Array.from({ length: wanted }, (_, i) => i)).slice(0, Math.round(wanted * 0.76)));
  const sortCounter = new Map<string, number>();
  const issueCounts: Record<string, number> = Object.fromEntries(ITEM_ISSUES.map((k) => [k, 0]));
  let itemsWithIssues = 0;
  const flagTargets: Array<{ item: Row; biz: Biz }> = [];
  const reportTargets: Array<{ item: Row; biz: Biz }> = [];
  itemBiz.forEach((b, idx) => {
    const id = uuid();
    const sort = (sortCounter.get(b.id) ?? 0) + 1; sortCounter.set(b.id, sort);
    const base = int(2, 90) * 50;
    const hasIssue = issueTargets.has(idx);
    const issues: ItemIssue[] = hasIssue ? shuffle(ITEM_ISSUES).slice(0, chance(0.3) ? 2 : 1) : [];
    const has = (k: ItemIssue) => issues.includes(k);
    const row: Row = {
      id, business_id: b.id, name: `${pick(ITEM_NAMES)} ${pick(ITEM_MODS)} ${idx + 1}`,
      description: `Demo item ${idx + 1}`, section: pick(["Popular", "Services", "Packages", "Other"]),
      price: has("missing_price") ? null : base, price_max: null, price_type: "fixed", unit: null,
      sale_price: has("bad_sale_price") ? base + 100 : chance(0.12) ? Math.max(50, base - 100) : null,
      availability: has("out_of_stock") ? "out_of_stock" : "available",
      stock_count: has("out_of_stock") ? 0 : null,
      visible: true, sort,
      hidden_by_admin: has("hidden_by_admin"), admin_hide_reason: has("hidden_by_admin") ? "Photo shows a different product" : null,
      removed_by_admin: false,
      price_confirmed_at: iso(has("stale_price") ? daysAgo(now, int(100, 400)) : daysAgo(now, int(0, 60))),
      created_at: iso(daysAgo(now, int(5, 350))),
    };
    t.items.push(row);
    if (!has("no_photos")) {
      t.item_media.push({ id: uuid(), item_id: id, business_id: b.id, kind: "image", path: `${DEMO.storagePrefix}items/${id}/1.jpg`, mime: "image/jpeg", sort: 0 });
    }
    if (has("open_flag")) flagTargets.push({ item: row, biz: b });
    if (has("open_report")) reportTargets.push({ item: row, biz: b });
    for (const k of issues) issueCounts[k] += 1;
    if (issues.length) itemsWithIssues += 1;
  });

  // ---- flags, reports ----------------------------------------------------------------------------
  const FLAG_STATUS = ["open", "open", "open", "replied", "resolved"] as const;
  flagTargets.forEach(({ item, biz }, i) => {
    const status = FLAG_STATUS[i % FLAG_STATUS.length];
    const question = i % 3 === 0 ? pick(FLAG_QUESTIONS) : null;
    t.flags.push({
      id: uuid(), business_id: biz.id, item_id: item.id, reason: pick(FLAG_REASONS), status,
      seller_reply: status === "replied" ? "I have checked and the price is correct." : null,
      replied_at: status === "replied" ? iso(daysAgo(now, int(0, 5))) : null,
      resolved_at: status === "resolved" ? iso(daysAgo(now, int(0, 5))) : null,
      seller_message: question, due_at: question ? iso(new Date(now.getTime() + int(1, 6) * 86_400_000)) : null,
      created_at: iso(daysAgo(now, int(1, 20))),
    });
  });
  // Three flags that do not belong to an item (they are about the whole listing).
  for (const b of shuffle(alive.filter((x) => x.scenario.startsWith("live"))).slice(0, 3)) {
    t.flags.push({ id: uuid(), business_id: b.id, item_id: null, reason: "Opening hours do not match the shop sign", status: "open", seller_reply: null, replied_at: null, resolved_at: null, seller_message: null, due_at: null, created_at: iso(daysAgo(now, int(1, 10))) });
  }

  // Exactly COUNTS.reports reports: the open ones point at items flagged "open_report" first.
  const REPORT_STATUS = ["open", "open", "open", "open", "open", "open", "reviewed", "reviewed", "dismissed", "dismissed"] as const;
  const reportSources = [...reportTargets.map((x) => ({ biz: x.biz, item: x.item as Row | null })), ...shuffle(alive).map((biz) => ({ biz, item: null as Row | null }))];
  for (let i = 0; i < COUNTS.reports; i++) {
    const src = reportSources[i];
    const reason = REPORT_REASONS[i % REPORT_REASONS.length];
    t.reports.push({
      id: uuid(), business_id: src.biz.id, item_id: src.item ? src.item.id : null, reason,
      details: i % 2 === 0 ? "Seen in the shop today, this is not right." : null, reporter_hash: rng.code(16, "0123456789abcdef"),
      status: REPORT_STATUS[i], created_at: iso(daysAgo(now, int(0, 25))),
    });
  }

  // ---- faqs, offers ------------------------------------------------------------------------------
  for (const b of shuffle(alive.filter((x) => x.scenario !== "pending")).slice(0, 30)) {
    t.faqs.push({ id: uuid(), business_id: b.id, question: "Do you deliver?", answer: "Yes, within the town. Call us to arrange.", sort: 1, hidden_by_admin: false, admin_hide_reason: null, removed_by_admin: false, created_at: iso(daysAgo(now, int(3, 200))) });
  }
  const hiddenFaq = t.faqs[0];
  if (hiddenFaq) { hiddenFaq.hidden_by_admin = true; hiddenFaq.admin_hide_reason = "Contains a phone number"; }
  for (const b of shuffle(alive.filter((x) => x.scenario.startsWith("live"))).slice(0, 12)) {
    t.offers.push({ id: uuid(), business_id: b.id, title: `${int(5, 30)}% off this month`, description: "Demo offer", active: true, starts_at: iso(daysAgo(now, 3)), ends_at: iso(new Date(now.getTime() + 20 * 86_400_000)), hidden_by_admin: false, admin_hide_reason: null, removed_by_admin: false, created_at: iso(daysAgo(now, 3)) });
  }

  // ---- payments (40: 24 confirmed, 8 submitted, 8 rejected, one code used twice) -------------------
  const confirmedFor = shuffle(bizs.filter((b) => b.paidDay && b.scenario !== "deleted" && b.scenario !== "pending")).slice(0, 24);
  const paymentOf = (b: Biz, status: string, over: Row = {}): Row => {
    const end = b.paidDay ?? addCalendarMonth(today);
    const start = addCalendarMonth(end, -1);
    return {
      id: uuid(), business_id: b.id, amount_kes: b.price, method: "mpesa", reference: null, kind: "renewal", status,
      mpesa_code: mpesa(), plan_key: b.plan, source: "seller",
      period_start: status === "confirmed" ? start : null, period_end: status === "confirmed" ? end : null,
      submitted_at: iso(daysAgo(now, int(0, 40))), confirmed_at: null, confirmed_via: status === "confirmed" ? pick(["admin", "admin", "auto"]) : null,
      decline_reason: null, ...over,
    };
  };
  for (const b of confirmedFor) t.payments.push(paymentOf(b, "confirmed", { confirmed_at: iso(daysAgo(now, int(0, 30))) }));
  const pendingBiz = bizs.filter((b) => b.scenario === "pending");
  const needRenew = bizs.filter((b) => ["live_expiring", "live_grace", "live_lapsed", "expired"].includes(b.scenario));
  const submittedFor = [...pendingBiz.slice(0, 3).map((b) => ({ b, kind: "first" })), ...shuffle(needRenew).slice(0, 5).map((b) => ({ b, kind: "renewal" }))];
  for (const { b, kind } of submittedFor) t.payments.push(paymentOf(b, "submitted", { kind, period_start: null, period_end: null }));
  const rejectedFor = shuffle(alive).slice(0, 8);
  const REJECT = ["We could not find this code in our M-Pesa statement.", "The amount does not match the plan price.", "That code was already used for another payment."];
  rejectedFor.forEach((b, i) => t.payments.push(paymentOf(b, "rejected", { decline_reason: REJECT[i % REJECT.length] })));
  // One duplicate code: the last rejected payment re-uses the code of a confirmed one.
  const original = t.payments.find((p) => p.status === "confirmed" && p.business_id !== rejectedFor[7].id)!;
  const twin = t.payments[t.payments.length - 1];
  twin.mpesa_code = original.mpesa_code;
  twin.decline_reason = DEMO.duplicateCodeNote;
  if (t.payments.length !== COUNTS.payments) throw new Error(`payments: expected ${COUNTS.payments}, built ${t.payments.length}`);

  // ---- change requests (12) ------------------------------------------------------------------------
  const CR_STATUS = ["pending", "pending", "pending", "pending", "pending", "pending", "approved", "approved", "rejected", "rejected", "cancelled", "cancelled"] as const;
  const FIELDS = ["name", "category_id", "phone", "town", "pin", "licence"] as const;
  const crBiz = shuffle(alive.filter((b) => b.scenario !== "pending"));
  const used = new Set<string>();
  for (let i = 0; i < COUNTS.changeRequests; i++) {
    const b = crBiz[i];
    const field = FIELDS[i % FIELDS.length];
    const status = CR_STATUS[i];
    if (status === "pending") { const key = `${b.id}:${field}`; if (used.has(key)) throw new Error("duplicate pending change request"); used.add(key); }
    const old = String(b.row[field === "pin" || field === "licence" ? "tagline" : field] ?? "");
    const newer: Record<string, string> = {
      name: `${String(b.row.name)} Ltd`, category_id: pick(eligible.filter((c) => c.id !== b.catId)).id, phone: phone(), town: pick(TOWNS).town,
      pin: `A${int(100_000_000, 999_999_999)}Z`, licence: `SBP-${year}-${int(1000, 9999)}`,
    };
    t.change_requests.push({
      id: uuid(), business_id: b.id, field, old_value: field === "pin" || field === "licence" ? null : old, new_value: newer[field], status,
      admin_note: status === "rejected" ? "The document does not match the new value." : null,
      decided_at: status === "approved" || status === "rejected" ? iso(daysAgo(now, int(0, 10))) : null,
      created_at: iso(daysAgo(now, int(1, 20))),
    });
  }

  // ---- applications (26, every status) ------------------------------------------------------------
  const APP_STATUS: Array<[string, number]> = [["uploading", 2], ["submitted", 6], ["under_review", 3], ["changes_requested", 3], ["approved", 3], ["payment_confirming", 3], ["activated", 4], ["rejected", 2]];
  const appStatuses = APP_STATUS.flatMap(([s, n]) => Array.from({ length: n }, () => s));
  if (appStatuses.length !== COUNTS.applications) throw new Error("application table does not add up");
  const activatedBiz = shuffle(bizs.filter((b) => b.scenario === "live_active")).slice(0, 4);
  let activatedIdx = 0;
  const refs = new Set<string>();
  const ref = () => { for (;;) { const r = `EPM-${year}-${DEMO.refMarker}${rng.code(2)}`; if (!refs.has(r)) { refs.add(r); return r; } } };
  appStatuses.forEach((status, i) => {
    const id = uuid();
    const cat = pick(eligible);
    const plan: "standard" | "premium" = chance(0.3) ? "premium" : "standard";
    const p = planOf(cat.id, plan);
    const place = pick(TOWNS);
    const linked = status === "activated" ? activatedBiz[activatedIdx++] : null;
    const bname = linked ? String(linked.row.name) : `${pick(PREFIX)} ${pick(SUFFIX)} A${i + 1}`;
    const submitted = status === "uploading" ? null : iso(daysAgo(now, int(0, 30)));
    const ph = linked ? String(linked.row.phone) : phone();
    t.applications.push({
      id, reference_no: ref(), status, verification_level: chance(0.3) ? "verified" : "unverified", completeness_hint: chance(0.7) ? "complete" : "basic",
      category_id: linked ? linked.catId : cat.id, plan_key: linked ? linked.plan : plan, price_at_submission: linked ? linked.price : p.price_kes,
      plan_snapshot: json({ planKey: linked ? linked.plan : plan, price: linked ? linked.price : p.price_kes, itemsLimit: p.items_limit }),
      owner_full_name: linked ? String(linked.row.owner_name) : pick(OWNERS), owner_id_type: "national_id", owner_id_number: String(int(10_000_000, 39_999_999)),
      phone: ph, alt_phone: null, email: `${slugify(bname)}@example.com`,
      business_name: bname, registered: chance(0.5), reg_type: null, reg_number: null, year_established: int(2005, 2025), kra_pin: null,
      sbp_number: `SBP-${int(10_000, 99_999)}`, sbp_expiry: addDays(today, int(60, 400)),
      short_description: "Demo application", template_values: json({}), conditional_docs: json({}),
      county: place.county, town: place.town, address: `${int(1, 200)} Main Street, ${place.town}`, lat: place.lat, lng: place.lng,
      business_phones: json([ph]), whatsapp: ph, website: null, socials: json({}),
      terms_version: "1", privacy_version: "1", accepted_at: iso(daysAgo(now, int(0, 30))), authorised: true,
      admin_note: status === "changes_requested" ? "Please upload a clearer permit photo." : null,
      rejection_reason: status === "rejected" ? "The permit has expired and could not be verified." : null,
      payment_code: status === "payment_confirming" ? mpesa() : null,
      seller_id: linked ? String(linked.row.seller_id) : null,
      submitted_at: submitted, created_at: iso(daysAgo(now, int(0, 35))),
    });
    if (linked) linked.row.application_id = id;
    if (status !== "uploading") {
      for (const slot of ["owner_id_front", "owner_id_back", "sbp", "signboard"]) {
        t.application_documents.push({ id: uuid(), application_id: id, slot_key: slot, storage_path: `${DEMO.storagePrefix}applications/${id}/${slot}.jpg`, original_name: `${slot}.jpg`, mime: "image/jpeg", size_bytes: int(80_000, 900_000), verified: ["approved", "payment_confirming", "activated"].includes(status) });
      }
      t.application_events.push({ application_id: id, actor: "seller", type: "submitted", data: json({}), created_at: submitted });
    }
    if (status === "under_review") t.application_events.push({ application_id: id, actor: "admin", type: "under_review", data: json({}), created_at: iso(daysAgo(now, int(0, 3))) });
    if (status === "changes_requested") {
      t.application_flags.push({ id: uuid(), application_id: id, path: "documents.sbp", message: "The permit photo is blurred. Please upload a clearer one.", severity: "must_fix", status: "open", created_at: iso(daysAgo(now, 1)) });
      t.application_events.push({ application_id: id, actor: "admin", type: "changes_requested", data: json({}), created_at: iso(daysAgo(now, 1)) });
    }
  });

  // ---- message log (60 outbound SMS / email, with failures) ----------------------------------------
  const MSG_STATUS = [...Array(6).fill("queued"), ...Array(15).fill("sent"), ...Array(20).fill("delivered"), ...Array(14).fill("failed"), ...Array(5).fill("failed")];
  const MESSAGES = MSG_STATUS.length; // 60
  const smsBodies = (name: string) => [
    ["application_approved", `EpicMKT: your application for ${name} is approved. Pay to activate your listing.`],
    ["renewal_reminder", `EpicMKT: ${name}, your listing expires in 3 days. Renew to stay visible.`],
    ["payment_received", `EpicMKT: we received your payment for ${name}. Thank you.`],
    ["application_changes", `EpicMKT: we need a few changes to the application for ${name}.`],
  ] as const;
  shuffle(MSG_STATUS).forEach((status, i) => {
    const toBusiness = i % 3 !== 2;
    const b = pick(alive);
    const app = t.applications[int(1, t.applications.length - 1)];
    const isEmail = i % 5 === 4;
    const [template, body] = pick(smsBodies(toBusiness ? String(b.row.name) : String(app.business_name)));
    const created = daysAgo(now, int(0, 14));
    const failed = status === "failed";
    t.messages.push({
      id: uuid(), business_id: toBusiness ? b.id : null, application_id: toBusiness ? null : app.id,
      kind: "general", channel: isEmail ? "email" : "sms", template_key: isEmail ? "welcome_email" : template,
      to_address: isEmail ? String(toBusiness ? b.row.email : app.email) : String(toBusiness ? b.row.phone : app.phone),
      subject: isEmail ? "Welcome to EpicMKT" : null, body: isEmail ? "<p>Welcome to EpicMKT.</p>" : body,
      status, provider_id: status === "sent" || status === "delivered" ? `mock-${uuid()}` : null,
      cost_kes: isEmail || status === "queued" ? null : Math.round(countSms(body).segments * 0.8 * 100) / 100,
      error: failed ? pick(isEmail ? EMAIL_ERRORS : SMS_ERRORS) : null,
      attempts: status === "queued" ? 0 : failed ? int(1, 3) : 1,
      transactional: i % 7 !== 0, scheduled_at: iso(created),
      sent_at: status === "sent" || status === "delivered" ? iso(new Date(created.getTime() + 20_000)) : null,
      created_at: iso(created),
    });
  });
  if (t.messages.length !== MESSAGES) throw new Error("message count drifted");

  // ---- stats (printed by the seed script and asserted by the tests) -------------------------------
  const countBy = (rows: Row[], key: string) => rows.reduce<Record<string, number>>((m, r) => ((m[String(r[key])] = (m[String(r[key])] ?? 0) + 1), m), {});
  const codes = t.payments.map((p) => String(p.mpesa_code));
  return {
    tables: t,
    stats: {
      businesses: t.businesses.length, businessesByStatus: countBy(t.businesses, "status"),
      items: t.items.length, itemsWithIssues, itemIssues: issueCounts,
      payments: t.payments.length, paymentsByStatus: countBy(t.payments, "status"), duplicatePaymentCodes: codes.length - new Set(codes).size,
      changeRequests: t.change_requests.length, changeRequestsByStatus: countBy(t.change_requests, "status"),
      reports: t.reports.length, flags: t.flags.length,
      applications: t.applications.length, applicationsByStatus: countBy(t.applications, "status"),
      messages: t.messages.length, messagesByStatus: countBy(t.messages, "status"),
    },
  };
}
