import { PLAN_KEYS } from '../billing.js';
import { formatKes } from '../utils.js';

const yes = { yes: true };
const no = { yes: false };
const upTo = (n) => (n === null || n === undefined ? { text: 'Unlimited' } : { text: `Up to ${n}` });

const featureMentions = (plan, pattern) =>
  Object.values(plan?.features ?? {}).some((lines) => Array.isArray(lines) && lines.some((t) => pattern.test(t)));

// Every number and line comes from the plan and limit data, so an admin edit changes this table with no code change.
export function buildPlanRows({ plans, globalLimits }) {
  const g = (k, key) => globalLimits?.[k]?.[key];
  const both = (fn) => ({ standard: fn('standard'), premium: fn('premium') });
  return [
    { label: 'Your own business page', ...both(() => yes) },
    { label: 'Call, WhatsApp and Directions buttons', ...both(() => yes) },
    { label: 'Opening hours, services and prices', ...both(() => yes) },
    { label: 'Short link and QR code', ...both(() => yes) },
    { label: 'Views and contact statistics', ...both(() => yes) },
    { label: 'Items you can list', ...both((k) => upTo(plans?.[k]?.limits?.items)) },
    { label: 'Photos per item', ...both((k) => upTo(g(k, 'photosPerItem'))) },
    { label: 'Videos per item', ...both((k) => upTo(g(k, 'videosPerItem'))) },
    { label: 'Photos in your gallery', ...both((k) => upTo(g(k, 'galleryPhotos'))) },
    { label: 'FAQs', ...both((k) => upTo(g(k, 'faqs'))) },
    { label: 'Active offers', ...both((k) => upTo(g(k, 'activeOffers'))) },
    { label: 'Flash sales a month', ...both((k) => upTo(g(k, 'flashSalesPerMonth'))) },
    { label: 'Featured badge', ...both((k) => (featureMentions(plans?.[k], /featured badge/i) ? yes : no)) },
    { label: 'Shown first in search results', ...both((k) => (featureMentions(plans?.[k], /priority placement/i) ? yes : no)) },
    { label: 'Top benefits', ...both((k) => ({ list: plans?.[k]?.topBenefits ?? [] })) },
  ];
}

export function planHeader(plan) {
  return {
    price: plan?.price === 0 ? 'Free' : formatKes(plan?.price),
    free: plan?.price === 0,
    badge: plan?.badge ?? null,
    trial: plan?.trialDays > 0 ? `${plan.trialDays}-day free trial` : null,
  };
}

// Lowest Standard price across active categories, for "Plans start at".
export function startingPrice(categories) {
  const prices = (categories ?? []).map((c) => c?.plans?.standard?.price).filter(Number.isFinite);
  return prices.length ? Math.min(...prices) : null;
}

export { PLAN_KEYS };
