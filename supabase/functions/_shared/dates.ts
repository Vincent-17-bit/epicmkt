// Calendar helpers in Africa/Nairobi (EAT, UTC+3, no daylight saving).
// Pure and dependency free so the edge functions, scripts/seed.ts and the tests share one implementation.
// They mirror public.nairobi_day / add_calendar_month / listing_state (migration 0006) and
// shared/src/billing.js; supabase/tests/parity.test.mjs proves the three agree.

export type Day = string; // "YYYY-MM-DD", a calendar day in EAT

export const EAT_OFFSET_MS = 3 * 3_600_000;
/** One day of grace after the paid-until day. Fixed: the SQL, the seller banners and this file all use 1. */
export const GRACE_DAYS = 1;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const format = (y: number, m: number, d: number): Day => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

function parts(day: Day): [number, number, number] {
  const m = DAY_RE.exec(day);
  if (!m) throw new RangeError(`invalid day: ${day}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** True only for real calendar days between 1900 and 9999, so "2026-02-30" is rejected. */
export function isDay(value: unknown): value is Day {
  if (typeof value !== "string") return false;
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** The EAT calendar day of an instant. A "YYYY-MM-DD" string is already a day and is returned as is. */
export function nairobiDay(input: Date | string | number): Day {
  if (typeof input === "string" && DAY_RE.test(input)) {
    if (!isDay(input)) throw new RangeError(`invalid day: ${input}`);
    return input;
  }
  const t = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (!Number.isFinite(t)) throw new RangeError("invalid date");
  return new Date(t + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a day starts in EAT, as a UTC ISO string. The value stored in businesses.paid_until. */
export function nairobiMidnight(day: Day): string {
  parts(nairobiDay(day));
  return new Date(`${day}T00:00:00+03:00`).toISOString();
}

export function addDays(input: Date | string | number, n: number): Day {
  if (!Number.isInteger(n)) throw new RangeError("n must be an integer");
  const [y, m, d] = parts(nairobiDay(input));
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diffDays(a: Date | string | number, b: Date | string | number): number {
  const [ay, am, ad] = parts(nairobiDay(a));
  const [by, bm, bd] = parts(nairobiDay(b));
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

/**
 * Add whole calendar months and clamp to the end of a shorter month:
 * 31 Jan -> 28 Feb (29 Feb in a leap year), 30 Jan -> 28 Feb, 31 Mar -> 30 Apr, 31 Dec -> 31 Jan.
 * Clamping is not remembered: 28 Feb + 1 month is 28 Mar, exactly like public.add_calendar_month.
 */
export function addCalendarMonth(input: Date | string | number, n = 1): Day {
  if (!Number.isInteger(n)) throw new RangeError("n must be an integer");
  const [y, m, d] = parts(nairobiDay(input));
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const ty = first.getUTCFullYear();
  const tm = first.getUTCMonth();
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return format(ty, tm + 1, Math.min(d, last));
}

export type ListingState = "none" | "active" | "grace" | "expired";

/** Active through the whole paid-until day, then GRACE_DAYS of grace, then expired. */
export function listingState(paidUntil: Date | string | number | null | undefined, now: Date | string | number = new Date()): ListingState {
  if (paidUntil === null || paidUntil === undefined) return "none";
  const today = nairobiDay(now);
  const paid = nairobiDay(paidUntil);
  if (today <= paid) return "active";
  if (today <= addDays(paid, GRACE_DAYS)) return "grace";
  return "expired";
}

export function daysLeft(paidUntil: Date | string | number | null | undefined, now: Date | string | number = new Date()): number | null {
  if (paidUntil === null || paidUntil === undefined) return null;
  return diffDays(paidUntil, now);
}

export type RenewalPeriod = {
  start: Day;
  end: Day;
  /** True when the new month continues the current paid period (early renewal, or inside the grace day). */
  continuesPaidPeriod: boolean;
};

/**
 * The period one confirmed first/renewal payment buys. Mirrors public.payment_apply_confirmation:
 * paying early (or within the grace day) starts the new month on the paid-until day so no day is lost;
 * paying after that starts today. The new paid_until is `end`, stored as nairobiMidnight(end).
 */
export function renewalPeriod(paidUntil: Date | string | number | null | undefined, now: Date | string | number = new Date()): RenewalPeriod {
  const today = nairobiDay(now);
  const paid = paidUntil === null || paidUntil === undefined ? null : nairobiDay(paidUntil);
  const continues = paid !== null && today <= addDays(paid, GRACE_DAYS);
  const start = continues ? (paid as Day) : today;
  return { start, end: addCalendarMonth(start), continuesPaidPeriod: continues };
}
