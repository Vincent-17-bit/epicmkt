// Billing maths shared by the customer site and the seller portal. The database mirrors
// categoryChangeQuote in public.category_change_quote; keep them in step.
const DAY_MS = 86_400_000;
const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const nairobiDay = (d) => new Date(new Date(d).getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
const toDay = (v) => (isDay(v) ? v : nairobiDay(v));
const fromDay = (day) => new Date(`${day}T00:00:00Z`);
const diffDays = (a, b) => Math.round((fromDay(a) - fromDay(b)) / DAY_MS);

function shiftMonths(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
}

export function categoryChangeQuote({ oldPrice, newPrice, paidUntil, now = new Date() }) {
  const base = { appliesFromNextRenewal: true, newMonthlyPrice: newPrice };
  if (newPrice <= oldPrice) return { extraDueNow: 0, ...base };
  const end = toDay(paidUntil);
  const monthDays = diffDays(end, shiftMonths(end, -1).toISOString().slice(0, 10));
  const left = Math.min(monthDays, Math.max(0, diffDays(end, toDay(now))));
  return { extraDueNow: Math.ceil(((newPrice - oldPrice) * left) / monthDays), ...base };
}
