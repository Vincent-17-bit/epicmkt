import { BUSINESS_STATUS, PLANS, PLAN_PRICE_KES, normalizeText } from "@epicmkt/shared";
import { store } from "@epicmkt/backend/store";
import { NotFoundError, ValidationError, getTopSearches } from "@epicmkt/backend";

const wait = () => new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 250));

const find = (id) => {
  const business = store.businesses.find((b) => b.id === id);
  if (!business) throw new NotFoundError("Business not found");
  return business;
};

const row = (b) => ({
  id: b.id,
  slug: b.slug,
  name: b.name,
  categoryId: b.categoryId,
  county: b.county,
  area: b.area,
  plan: b.plan,
  status: b.status,
  phone: b.phone,
  sellerId: b.sellerId,
  planExpiresAt: b.planExpiresAt,
  createdAt: b.createdAt,
  stats: { ...b.stats }
});

export async function getOverview() {
  await wait();
  const all = store.businesses;
  const active = all.filter((b) => b.status === BUSINESS_STATUS.ACTIVE);
  const byStatus = Object.fromEntries(
    Object.values(BUSINESS_STATUS).map((s) => [s, all.filter((b) => b.status === s).length])
  );
  const byPlan = Object.fromEntries(
    Object.values(PLANS).map((p) => [p, active.filter((b) => b.plan === p).length])
  );
  const contacts = all.reduce(
    (sum, b) => ({
      view: sum.view + b.stats.view,
      call: sum.call + b.stats.call,
      whatsapp: sum.whatsapp + b.stats.whatsapp,
      directions: sum.directions + b.stats.directions
    }),
    { view: 0, call: 0, whatsapp: 0, directions: 0 }
  );
  return {
    totalBusinesses: all.length,
    byStatus,
    byPlan,
    monthlyRevenueKes: active.reduce((sum, b) => sum + PLAN_PRICE_KES[b.plan], 0),
    contacts,
    pending: all.filter((b) => b.status === BUSINESS_STATUS.PENDING).map(row),
    topSearches: await getTopSearches(8)
  };
}

export async function listBusinesses({ status = null, plan = null, query = "", page = 1, pageSize = 20 } = {}) {
  await wait();
  const q = normalizeText(query);
  const filtered = store.businesses
    .filter((b) => !status || b.status === status)
    .filter((b) => !plan || b.plan === plan)
    .filter((b) => !q || normalizeText(`${b.name} ${b.area} ${b.county} ${b.phone}`).includes(q))
    .sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));
  const size = Math.max(1, pageSize);
  const current = Math.max(1, page);
  return {
    items: filtered.slice((current - 1) * size, current * size).map(row),
    total: filtered.length,
    page: current,
    pageSize: size,
    totalPages: Math.max(1, Math.ceil(filtered.length / size))
  };
}

export async function setBusinessStatus(id, status) {
  await wait();
  if (!Object.values(BUSINESS_STATUS).includes(status)) {
    throw new ValidationError("Unknown status", { status: "Unknown status" });
  }
  const business = find(id);
  business.status = status;
  return row(business);
}

export async function setBusinessPlan(id, plan) {
  await wait();
  if (!Object.values(PLANS).includes(plan)) {
    throw new ValidationError("Unknown plan", { plan: "Unknown plan" });
  }
  const business = find(id);
  business.plan = plan;
  return row(business);
}

export async function extendPlan(id, months = 1) {
  await wait();
  const business = find(id);
  const next = new Date(business.planExpiresAt);
  next.setUTCMonth(next.getUTCMonth() + Math.max(1, months));
  business.planExpiresAt = next.toISOString();
  return row(business);
}
