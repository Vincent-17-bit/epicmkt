// Time bucketing and chart maths for the Command Center. Pure: no DOM, no network, no import.meta.env.
// East Africa Time is UTC+3 all year (no daylight saving), so a day or month in EAT is the UTC clock plus three hours.
const EAT_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");

/** "2026-10-15": the calendar day in Nairobi. */
export const eatDayKey = (date) => new Date(new Date(date).getTime() + EAT_MS).toISOString().slice(0, 10);
export const eatMonthKey = (date) => eatDayKey(date).slice(0, 7);

/** "Thu 15 Oct", for the brief's eyebrow. */
const DAY_LABEL = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", weekday: "short", day: "numeric", month: "short" });
export const eatDayLabel = (date) => DAY_LABEL.format(new Date(date)).replace(",", "");

/** `count` day keys. "back" ends today (oldest first); "forward" starts today. */
export function dayKeys(count, now = new Date(), direction = "back") {
  const base = new Date(now).getTime();
  return Array.from({ length: count }, (_, i) => eatDayKey(base + (direction === "forward" ? i : i - (count - 1)) * DAY_MS));
}

/** Rows per day, in the order of `keys`. Rows with a missing or invalid date are ignored. */
export function bucketDaily(rows, field, keys, valueField = null) {
  const totals = new Map(keys.map((k) => [k, 0]));
  for (const row of rows ?? []) {
    const t = Date.parse(row?.[field]);
    if (Number.isNaN(t)) continue;
    const key = eatDayKey(t);
    if (!totals.has(key)) continue;
    const add = valueField ? Number(row[valueField]) || 0 : 1;
    totals.set(key, totals.get(key) + add);
  }
  return keys.map((k) => totals.get(k));
}

/** The last `count` months, oldest first, ending with the current EAT month. */
export function monthKeys(count, now = new Date()) {
  const [year, month] = eatMonthKey(now).split("-").map(Number);
  const current = year * 12 + (month - 1);
  return Array.from({ length: count }, (_, i) => {
    const index = current - (count - 1 - i);
    const y = Math.floor(index / 12);
    const m = index % 12;
    return { key: `${y}-${pad(m + 1)}`, label: MONTHS[m], year: y };
  });
}

/** The UTC instant at which an EAT month starts. */
export const monthStartIso = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1) - EAT_MS).toISOString();
};

export function bucketMonthly(rows, field, months, valueField = null) {
  const totals = new Map(months.map((m) => [m.key, 0]));
  for (const row of rows ?? []) {
    const t = Date.parse(row?.[field]);
    if (Number.isNaN(t)) continue;
    const key = eatMonthKey(t);
    if (!totals.has(key)) continue;
    totals.set(key, totals.get(key) + (valueField ? Number(row[valueField]) || 0 : 1));
  }
  return months.map((m) => totals.get(m.key));
}

/** Last 7 values against the 7 before them. */
export function weekTrend(values) {
  const list = (values ?? []).map((v) => Number(v) || 0);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const current = sum(list.slice(-7));
  const previous = sum(list.slice(-14, -7));
  return { current, previous, change: current - previous };
}

/**
 * The status donut. public.admin_counts() reports `live` as everything customers can see (paid or in grace),
 * and `expiring_7d` and `in_grace` are subsets of it, so the healthy part is what is left over.
 */
export function statusSlices(counts) {
  const c = counts ?? {};
  const expiring = c.expiring_7d ?? 0;
  const grace = c.in_grace ?? 0;
  const healthy = Math.max((c.live ?? 0) - expiring - grace, 0);
  return [
    { key: "healthy", label: "Paid and live", value: healthy, color: "var(--chart-3)" },
    { key: "expiring", label: "Expiring within 7 days", value: expiring, color: "var(--chart-5)" },
    { key: "grace", label: "In grace", value: grace, color: "var(--chart-2)" },
    { key: "expired", label: "Expired", value: c.expired ?? 0, color: "var(--chart-4)" },
    { key: "suspended", label: "Suspended", value: c.suspended ?? 0, color: "var(--chart-6)" },
  ];
}

/** Whole KES, grouped: 12,400. Compact for axes: 12.4k, 1.2M. */
export const formatKes = (n) => `KES ${Math.round(Number(n) || 0).toLocaleString("en-KE")}`;
export function compactNumber(n) {
  const v = Number(n) || 0;
  const trim = (x) => String(Math.round(x * 10) / 10);
  if (Math.abs(v) >= 1_000_000) return `${trim(v / 1_000_000)}M`;
  if (Math.abs(v) >= 1_000) return `${trim(v / 1_000)}k`;
  return String(Math.round(v));
}

/** A tidy axis maximum above `max`: 1, 2, 2.5, 5 or 10 times a power of ten. */
export function niceMax(max) {
  const v = Number(max) || 0;
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 2, 2.5, 5, 10]) if (v <= step * pow) return step * pow;
  return 10 * pow;
}

/** "12 min", "5 h", "3 days": how long, for ages in the attention queue. */
export function durationText(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${Math.max(minutes, 1)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
}
