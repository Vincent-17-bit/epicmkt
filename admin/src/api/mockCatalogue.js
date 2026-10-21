// Demo data for Plans and Categories. Local development only; it enforces the same rules as the database.
import { ApiError } from "./errors.js";
import { docProblems, templateProblems } from "../lib/catalogue.js";

const latency = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const at = (offset) => new Date(Date.now() + offset).toISOString();
const DAY = 86400000;

let categories = [
  { id: "bakery", name: "Bakery", grp: "Food and drink", icon: "bread-slice", tier: "B", sort: 3, active: true, live_businesses: 14, businesses: 17, updated_at: at(-9 * DAY),
    template: [{ key: "productTypes", label: "Product types", type: "multiselect", options: ["Bread", "Cakes", "Pastries"], required: true, filterable: true, showOnCard: true }, { key: "delivery", label: "Delivery available", type: "boolean" }, { key: "deliveryArea", label: "Delivery area", type: "text", showIf: { field: "delivery", equals: true } }],
    extra_docs: [{ key: "public_health_cert", label: "Public health certificate", rule: "required", why: "Confirms food is prepared safely." }] },
  { id: "barber", name: "Barber", grp: "Beauty", icon: "scissors", tier: "A", sort: 1, active: true, live_businesses: 9, businesses: 9, updated_at: at(-30 * DAY), template: [{ key: "walkIns", label: "Walk-ins welcome", type: "boolean" }], extra_docs: [] },
  { id: "salon", name: "Salon", grp: "Beauty", icon: "store", tier: "A", sort: 2, active: false, live_businesses: 0, businesses: 0, updated_at: at(-DAY), template: [], extra_docs: [] },
];
let plans = [
  { category_id: "bakery", plan_key: "standard", price_kes: 500, top_benefits: ["Listed on EpicMKT", "Contact buttons", "Opening hours"], badge: null, updated_at: at(-9 * DAY), live_businesses: 10, live_monthly_kes: 5000, versions: 2 },
  { category_id: "bakery", plan_key: "premium", price_kes: 1300, top_benefits: ["Appear first in search", "Photo gallery", "Flash sales"], badge: "Best value", updated_at: at(-9 * DAY), live_businesses: 4, live_monthly_kes: 5200, versions: 1 },
  { category_id: "barber", plan_key: "standard", price_kes: 400, top_benefits: ["Listed on EpicMKT", "Contact buttons", "Opening hours"], badge: null, updated_at: at(-30 * DAY), live_businesses: 6, live_monthly_kes: 2400, versions: 1 },
  { category_id: "barber", plan_key: "premium", price_kes: 1000, top_benefits: ["Appear first in search", "Photo gallery", "Flash sales"], badge: "Popular", updated_at: at(-30 * DAY), live_businesses: 3, live_monthly_kes: 3000, versions: 1 },
  { category_id: "salon", plan_key: "standard", price_kes: 0, top_benefits: ["Listed on EpicMKT", "Contact buttons", "Opening hours"], badge: null, updated_at: at(-DAY), live_businesses: 0, live_monthly_kes: 0, versions: 1 },
  { category_id: "salon", plan_key: "premium", price_kes: 0, top_benefits: ["Listed on EpicMKT", "Contact buttons", "Opening hours"], badge: null, updated_at: at(-DAY), live_businesses: 0, live_monthly_kes: 0, versions: 1 },
];
let history = { "bakery:standard": [{ id: 2, created_at: at(-9 * DAY), reason: "Inflation adjustment", price_kes: 500, top_benefits: ["Listed on EpicMKT", "Contact buttons", "Opening hours"], badge: null, changed_by_email: "owner@epicmkt.test" }, { id: 1, created_at: at(-120 * DAY), reason: null, price_kes: 400, top_benefits: ["Listed on EpicMKT", "Contact buttons", "Opening hours"], badge: null, changed_by_email: null }] };

export async function listPlans() {
  await latency();
  return plans.map((p) => { const c = categories.find((x) => x.id === p.category_id); return { ...p, category_name: c.name, grp: c.grp, sort: c.sort, category_active: c.active }; });
}

export async function getPlanHistory({ category, plan }) { await latency(); return history[`${category}:${plan}`] ?? []; }

export async function savePlan({ category, plan, price, benefits, badge = null, reason = null }) {
  await latency();
  const old = plans.find((p) => p.category_id === category && p.plan_key === plan);
  if (!old) throw new ApiError("plan_not_found");
  if (!Number.isInteger(price) || price < 0 || price > 100000) throw new ApiError("invalid_price");
  if (badge && !["Popular", "Best value"].includes(badge)) throw new ApiError("invalid_badge");
  if (benefits.length !== 3) throw new ApiError("three_benefits_required");
  if (benefits.some((b) => b.trim().length < 2 || b.trim().length > 80)) throw new ApiError("invalid_benefit");
  if (price !== old.price_kes && String(reason ?? "").trim().length < 5) throw new ApiError("reason_required");
  const next = { ...old, price_kes: price, top_benefits: benefits.map((b) => b.trim()), badge: badge || null, updated_at: at(0), versions: old.versions + 1 };
  history[`${category}:${plan}`] = [{ id: Date.now(), created_at: at(0), reason, price_kes: price, top_benefits: next.top_benefits, badge: next.badge, changed_by_email: "you@epicmkt.test" }, ...(history[`${category}:${plan}`] ?? [])];
  plans = plans.map((p) => (p === old ? next : p));
  return next.versions;
}

export async function listCategories() {
  await latency();
  return categories.map((c) => {
    const mine = plans.filter((p) => p.category_id === c.id);
    return { ...c, min_price: Math.min(...mine.map((p) => p.price_kes)), priced_plans: mine.filter((p) => p.price_kes > 0).length };
  });
}

export async function saveCategory({ id, name, group, icon = "store", tier, sort = 0, active, template, extraDocs, reason = null }) {
  await latency();
  if (!/^[a-z0-9-]{2,50}$/.test(id ?? "")) throw new ApiError("invalid_id");
  if (String(name ?? "").trim().length < 2 || String(group ?? "").trim().length < 2) throw new ApiError("invalid_input");
  if (!["A", "B", "C", "D"].includes(tier)) throw new ApiError("invalid_tier");
  if (Object.keys(templateProblems(template)).length) throw new ApiError("invalid_template");
  if (Object.keys(docProblems(extraDocs)).length) throw new ApiError("invalid_docs");
  const old = categories.find((c) => c.id === id);
  if (!old) {
    if (active) throw new ApiError("plans_not_priced");
    categories = [...categories, { id, name, grp: group, icon, tier, sort, active: false, live_businesses: 0, businesses: 0, updated_at: at(0), template, extra_docs: extraDocs }];
    for (const k of ["standard", "premium"]) plans = [...plans, { category_id: id, plan_key: k, price_kes: 0, top_benefits: ["Listed on EpicMKT", "Contact buttons", "Opening hours"], badge: null, updated_at: at(0), live_businesses: 0, live_monthly_kes: 0, versions: 1 }];
    return true;
  }
  if (active && !old.active && plans.filter((p) => p.category_id === id && p.price_kes > 0).length < 2) throw new ApiError("plans_not_priced");
  if (!active && old.active && String(reason ?? "").trim().length < 5) throw new ApiError("reason_required");
  categories = categories.map((c) => (c.id === id ? { ...c, name, grp: group, icon, tier, sort, active, template, extra_docs: extraDocs, updated_at: at(0) } : c));
  return false;
}
