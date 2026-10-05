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
