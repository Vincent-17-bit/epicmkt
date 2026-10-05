export const PLAN_KEYS = ['standard', 'premium'];

export const PLAN_LABELS = { standard: 'Standard', premium: 'Premium' };

export const planLabel = (planKey) => PLAN_LABELS[planKey] ?? planKey;

export function formatKes(amount) {
  if (!Number.isFinite(amount)) return '';
  if (amount === 0) return 'Free';
  return `KES ${amount.toLocaleString('en-KE')}`;
}

export const formatKesPerMonth = (amount) => (amount === 0 ? 'Free' : `${formatKes(amount)} / month`);

export const getPlan = (category, planKey) => category?.plans?.[planKey] ?? null;

export const planPrice = (category, planKey) => getPlan(category, planKey)?.price ?? null;

export function upgradeCost(category) {
  const s = planPrice(category, 'standard');
  const p = planPrice(category, 'premium');
  if (s === null || p === null) return null;
  return p - s;
}

export function priceRange(categories) {
  const prices = categories.flatMap((c) => PLAN_KEYS.map((k) => planPrice(c, k))).filter((n) => n !== null);
  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function summarizePlan(category, planKey) {
  const plan = getPlan(category, planKey);
  if (!plan) return null;
  return {
    categoryId: category.id,
    categoryName: category.name,
    planKey,
    label: planLabel(planKey),
    price: plan.price,
    priceText: formatKes(plan.price),
    perMonthText: formatKesPerMonth(plan.price),
    itemsLimit: plan.limits.items,
    topBenefits: plan.topBenefits,
    badge: plan.badge,
  };
}

const DAY_MS = 86_400_000;
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const nairobiDay = (d) => new Date(new Date(d).getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
const toDay = (v) => (isDay(v) ? v : nairobiDay(v));
const fromDay = (day) => new Date(`${day}T00:00:00Z`);
const diffDays = (a, b) => Math.round((fromDay(a) - fromDay(b)) / DAY_MS);

function shiftMonths(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
}

export const addCalendarMonth = (date) => shiftMonths(toDay(date), 1);

export const graceEndsAt = (paidUntil) => new Date(fromDay(toDay(paidUntil)).getTime() + DAY_MS);

export function listingState(paidUntil, now = new Date()) {
  const today = toDay(now);
  const paid = toDay(paidUntil);
  if (today <= paid) return 'active';
  if (today <= graceEndsAt(paid).toISOString().slice(0, 10)) return 'grace';
  return 'expired';
}

export function categoryChangeQuote({ oldPrice, newPrice, paidUntil, now = new Date() }) {
  const base = { appliesFromNextRenewal: true, newMonthlyPrice: newPrice };
  if (newPrice <= oldPrice) return { extraDueNow: 0, ...base };
  const end = toDay(paidUntil);
  const monthDays = diffDays(end, shiftMonths(end, -1).toISOString().slice(0, 10));
  const left = Math.min(monthDays, Math.max(0, diffDays(end, toDay(now))));
  return { extraDueNow: Math.ceil(((newPrice - oldPrice) * left) / monthDays), ...base };
}
