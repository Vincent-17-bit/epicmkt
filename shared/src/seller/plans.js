// Plan numbers come from the database (plans table: price_kes, items_limit, top_benefits per category and plan).
// Nothing here knows a price or a limit; these helpers only read what the seller context supplies.
//
// plan shape: { current: "standard", plans: [{ key, priceKes, itemsLimit, topBenefits }] }

import { formatKes } from "../utils.js";

export const planLabel = (key) => (key ? key.charAt(0).toUpperCase() + key.slice(1) : "");

export const rowToPlan = (row) => ({ key: row.plan_key, priceKes: row.price_kes, itemsLimit: row.items_limit, topBenefits: row.top_benefits ?? [] });

// Cheapest first, so "the next plan up" is the one after the current plan.
export const sortPlans = (plans = []) => [...plans].sort((a, b) => a.priceKes - b.priceKes || a.itemsLimit - b.itemsLimit);

export const currentPlan = (plan) => plan?.plans?.find((p) => p.key === plan.current) ?? null;

export function nextPlan(plan) {
  const sorted = sortPlans(plan?.plans);
  const i = sorted.findIndex((p) => p.key === plan?.current);
  return i >= 0 ? sorted[i + 1] ?? null : null;
}

export const pricePerMonth = (kes) => `${formatKes(kes)} a month`;

// What moving up would change. null when there is nothing to move up to (or the plan is unknown).
export function upgradeSummary(plan) {
  const from = currentPlan(plan);
  const to = nextPlan(plan);
  if (!from || !to) return null;
  return { from, to, extraItems: to.itemsLimit - from.itemsLimit };
}

// "Premium lists up to 70 items, KSh 1,300 a month."
export const upgradeLine = (plan) => {
  const s = upgradeSummary(plan);
  return s ? `${planLabel(s.to.key)} lists up to ${s.to.itemsLimit} items, ${pricePerMonth(s.to.priceKes)}.` : "";
};
