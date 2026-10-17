// In-memory plans API for mock mode. Seeded from the same data the public site's mock uses, so names and prices match.
// Mock mode lives in the browser tab only: it cannot change the client site (different origin). Live mode does.
import { categories as seedCategories } from "../../../client/src/data/categories.js";
import { GLOBAL_LIMITS, planRows } from "../../../client/src/config/plans.seed.js";

const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const clone = (v) => JSON.parse(JSON.stringify(v));

const toEditable = (row) => ({
  price: row.price_kes,
  items: row.items_limit,
  topBenefits: [...row.top_benefits],
  badge: row.badge ?? null,
  trialDays: row.trial_days ?? 0,
  features: row.features,
});

let state;
const init = () => {
  state = {
    categories: seedCategories.map((c) => ({
      id: c.id,
      name: c.name,
      group: c.group,
      tier: c.tier,
      plans: Object.fromEntries(planRows(c.id, c.tier).map((r) => [r.plan_key, toEditable(r)])),
    })),
    globalLimits: clone(GLOBAL_LIMITS),
    versions: [],
    coupons: [],
    nextVersion: 1,
  };
};
init();

export const __resetMockPlans = init;

const snap = (p) => ({ price: p.price, items: p.items, topBenefits: [...p.topBenefits], badge: p.badge, trialDays: p.trialDays });

function addVersion(entry) {
  state.versions.unshift({ id: state.nextVersion++, changedBy: "You", createdAt: new Date().toISOString(), ...entry });
}

export async function listPlanCatalog() {
  await wait();
  return clone({ categories: state.categories, globalLimits: state.globalLimits });
}

// Deterministic stand-in numbers so the note is stable while testing.
export async function getPlanImpact(categoryId, planKey) {
  await wait(60);
  const seed = [...categoryId].reduce((n, ch) => n + ch.charCodeAt(0), 0) + (planKey === "premium" ? 7 : 0);
  return { liveBusinesses: seed % 41, inProgressApplications: seed % 6 };
}

export async function savePlans({ categoryId, values, reason }) {
  await wait();
  const cat = state.categories.find((c) => c.id === categoryId);
  if (!cat) throw new Error("category_not_found");
  for (const planKey of ["standard", "premium"]) {
    const next = values[planKey];
    const cur = cat.plans[planKey];
    if (JSON.stringify(snap(cur)) === JSON.stringify(snap(next))) continue;
    if (next.price !== cur.price && !String(reason ?? "").trim()) throw new Error("reason_required");
    cat.plans[planKey] = { ...cur, ...snap(next) };
    addVersion({ kind: "plan", categoryId, planKey, snapshot: snap(next), reason: reason ?? "" });
  }
  return clone(cat);
}

export async function saveGlobalLimits({ limits, reason }) {
  await wait();
  state.globalLimits = clone(limits);
  addVersion({ kind: "global_limits", categoryId: null, planKey: null, snapshot: clone(limits), reason: reason ?? "" });
  return clone(state.globalLimits);
}

export async function listPlanVersions({ categoryId = null, kind = "plan" } = {}) {
  await wait(80);
  return clone(state.versions.filter((v) => v.kind === kind && (kind === "global_limits" || v.categoryId === categoryId)));
}

export async function listCoupons() {
  await wait(80);
  return clone(state.coupons);
}

export async function saveCoupon(coupon) {
  await wait();
  const i = state.coupons.findIndex((c) => c.code === coupon.code);
  if (i === -1) state.coupons.push({ redeemed: 0, ...clone(coupon) });
  else state.coupons[i] = { ...state.coupons[i], ...clone(coupon) };
  return clone(coupon);
}

export async function deleteCoupon(code) {
  await wait(80);
  state.coupons = state.coupons.filter((c) => c.code !== code);
}
