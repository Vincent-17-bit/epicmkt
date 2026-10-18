import { formatKes as formatKsh } from './utils.js';

export const PLAN_KEYS = ['standard', 'premium'];

export const PLAN_LABELS = { standard: 'Standard', premium: 'Premium' };

export const planLabel = (planKey) => PLAN_LABELS[planKey] ?? planKey;

export function formatKes(amount) {
  if (!Number.isFinite(amount)) return '';
  if (amount === 0) return 'Free';
  return formatKsh(amount);
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

export const DAY_MS = 86_400_000;
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

export const daysLeft = (paidUntil, now = new Date()) => (paidUntil ? diffDays(toDay(paidUntil), toDay(now)) : null);

export const dayOf = toDay;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDay(value) {
  if (!value) return '';
  const [y, m, d] = toDay(value).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatDateTime(value) {
  if (!value) return '';
  const t = new Date(new Date(value).getTime() + 3 * 3_600_000).toISOString();
  return `${formatDay(value)}, ${t.slice(11, 16)} EAT`;
}

export const MPESA_CODE_RE = /^[A-Z0-9]{10}$/;
export const normalizeMpesaCode = (value) => String(value ?? '').trim().toUpperCase();
export const isMpesaCode = (value) => MPESA_CODE_RE.test(normalizeMpesaCode(value));

export const PAYMENT_STATUS_LABELS = { submitted: 'Under confirmation', confirmed: 'Payment received', rejected: 'Not matched' };
export const PAYMENT_KIND_LABELS = { first: 'First payment', renewal: 'Renewal', upgrade: 'Upgrade to Premium', category_change: 'Category change' };

/**
 * The listing as the seller sees it. Suspended, paused and expired sellers still get this view:
 * Subscription, Notifications and question replies keep working in every status.
 */
export function subscriptionView(business, now = new Date()) {
  const paidUntil = business?.paidUntil ?? null;
  const state = paidUntil ? listingState(paidUntil, now) : 'none';
  return {
    state,
    status: business?.status ?? null,
    paidUntilDay: paidUntil ? toDay(paidUntil) : null,
    graceEndsDay: paidUntil ? graceEndsAt(paidUntil).toISOString().slice(0, 10) : null,
    daysLeft: daysLeft(paidUntil, now),
  };
}

/** One source for the banners; the route guards and the Subscription page both use it. */
export function billingBanners(business, now = new Date()) {
  const v = subscriptionView(business, now);
  const out = [];
  if (v.status === 'suspended') {
    out.push({ id: 'suspended', tone: 'danger', title: 'Your listing is suspended', text: 'Customers cannot see it. You can still renew, read your notifications and answer questions from EpicMKT.' });
  } else if (v.status === 'paused') {
    out.push({ id: 'paused', tone: 'info', title: 'Your listing is unlisted', text: 'It is paused and hidden from customers. You can resume it from your dashboard.' });
  }
  if (v.state === 'grace') {
    out.push({ id: 'grace', tone: 'warning', title: 'Your subscription has ended', text: `You are in your 1 day of grace, until ${formatDay(v.graceEndsDay)}. Renew now to stay visible.`, action: 'renew' });
  } else if (v.state === 'expired') {
    out.push({ id: 'expired', tone: 'danger', title: 'Your subscription has expired', text: `It ended on ${formatDay(v.paidUntilDay)}. Your listing is hidden until you renew.`, action: 'renew' });
  } else if (v.state === 'active' && v.daysLeft <= 7) {
    const when = v.daysLeft === 0 ? 'today' : v.daysLeft === 1 ? 'tomorrow' : `in ${v.daysLeft} days`;
    out.push({ id: 'expiring', tone: 'warning', title: `Your subscription ends ${when}`, text: `It is paid until ${formatDay(v.paidUntilDay)}. Renew early so your listing stays visible.`, action: 'renew' });
  } else if (v.state === 'none' && v.status === 'pending') {
    out.push({ id: 'first-payment', tone: 'info', title: 'Complete your first payment', text: 'Pay with M-Pesa to put your listing live.', action: 'pay' });
  }
  return out;
}

const fail = (code) => Object.assign(new Error(code), { code });

/**
 * What to pay, in each case. The database function seller_payment_instructions computes the same
 * answer on the server (a test keeps the two equal); the mock API and the unit tests use this one.
 *   first            account = the application's pay reference, amount = price at submission
 *   renewal          account = Seller ID, amount = the current plan price
 *   upgrade          account = Seller ID, amount = prorated difference (categoryChangeQuote)
 *   category_change  account = Seller ID, amount = prorated difference; a cheaper category costs nothing now
 */
export function buildPaymentInstructions({ business, application = null, priceOf, setting = null, purpose = null, targetPlan = null, category = null, now = new Date() }) {
  const state = business.paidUntil ? listingState(business.paidUntil, now) : 'none';
  const current = priceOf(business.categoryId, business.planKey);
  const kind = purpose ?? (!business.paidUntil && !business.hasConfirmedPayment ? 'first' : 'renewal');
  let amount;
  let account = business.sellerId;
  let planKey = business.planKey;
  let categoryId = business.categoryId;
  let quote = null;

  if (kind === 'first') {
    amount = application?.priceAtSubmission ?? current;
    account = application?.referenceNo ?? business.sellerId;
  } else if (kind === 'renewal') {
    amount = current;
  } else if (kind === 'upgrade') {
    if (business.planKey !== 'standard' || targetPlan !== 'premium') throw fail('invalid_upgrade');
    if (state !== 'active') throw fail('renew_first');
    const premium = priceOf(business.categoryId, 'premium');
    if (premium == null) throw fail('invalid_upgrade');
    quote = categoryChangeQuote({ oldPrice: current, newPrice: premium, paidUntil: business.paidUntil, now });
    amount = quote.extraDueNow;
    planKey = 'premium';
  } else if (kind === 'category_change') {
    const next = priceOf(category, business.planKey);
    if (next == null) throw fail('invalid_category');
    if (next > (current ?? 0) && state !== 'active') throw fail('renew_first');
    quote = categoryChangeQuote({ oldPrice: current ?? 0, newPrice: next, paidUntil: business.paidUntil, now });
    amount = quote.extraDueNow;
    categoryId = category;
  } else {
    throw fail('invalid_purpose');
  }

  const configured = !!(setting && String(setting.number ?? '').trim());
  return {
    purpose: kind,
    amount,
    account,
    planKey,
    categoryId,
    listingState: state,
    quote,
    configured,
    method: configured ? setting.type ?? 'paybill' : null,
    number: configured ? String(setting.number).trim() : null,
    name: configured ? setting.name ?? null : null,
  };
}

/** What a receipt shows; the printable view renders exactly these fields. */
export function receiptModel({ payment, business, categoryName, issuer }) {
  return {
    receiptNo: payment.receiptNo,
    businessName: business.name,
    sellerId: business.sellerId,
    category: categoryName,
    plan: planLabel(payment.planKey ?? business.planKey),
    purpose: PAYMENT_KIND_LABELS[payment.kind] ?? payment.kind,
    amount: payment.amount,
    amountText: formatKes(payment.amount),
    mpesaCode: payment.mpesaCode,
    paidAt: formatDateTime(payment.confirmedAt ?? payment.submittedAt ?? payment.createdAt),
    period: payment.periodStart && payment.periodEnd ? `${formatDay(payment.periodStart)} to ${formatDay(payment.periodEnd)}` : '',
    issuer,
  };
}
