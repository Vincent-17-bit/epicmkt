// Exceptions to the opening hours. The database functions seller_save_exception / exception_normalize apply the
// same rules (a test keeps them equal); the seller screen and the mock API use this copy for instant feedback.
export const EXCEPTION_LIMIT = 60;
export const EXCEPTION_MAX_INTERVALS = 3;
export const EXCEPTION_NOTE_MAX = 120;
export const EXCEPTION_MAX_DAYS_AHEAD = 730;

const DAY_MS = 86_400_000;
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const utc = (day) => new Date(`${day}T00:00:00Z`);
export const isRealDate = (day) => DATE.test(day ?? "") && utc(day).toISOString().slice(0, 10) === day;
export const addDays = (day, n) => new Date(utc(day).getTime() + n * DAY_MS).toISOString().slice(0, 10);

/** Only dates from today on, soonest first. Past ones are hidden. */
export const upcomingExceptions = (list, today) =>
  [...(list ?? [])].filter((e) => e.date >= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

export function dayLabel(day) {
  const d = utc(day);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const describeIntervals = (intervals) => (intervals ?? []).map(([a, b]) => `${a} to ${b}`).join(", ");
export const describeException = (e) => (e.kind === "closed" ? "Closed all day" : `Special hours: ${describeIntervals(e.intervals)}`);

/** Returns { ok: true, value } or { ok: false, error, index? } with the same codes as the database. */
export function validateException({ date, kind, intervals, note }, today) {
  if (!isRealDate(date)) return { ok: false, error: "invalid_date" };
  if (date < today) return { ok: false, error: "date_in_past" };
  if (date > addDays(today, EXCEPTION_MAX_DAYS_AHEAD)) return { ok: false, error: "date_too_far" };
  if (kind !== "closed" && kind !== "special") return { ok: false, error: "invalid_kind" };
  const text = String(note ?? "").trim();
  // eslint-disable-next-line no-control-regex
  if (text.length > EXCEPTION_NOTE_MAX || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return { ok: false, error: "invalid_note" };

  let clean = [];
  if (kind === "special") {
    if (!Array.isArray(intervals) || intervals.length === 0) return { ok: false, error: "intervals_required" };
    if (intervals.length > EXCEPTION_MAX_INTERVALS) return { ok: false, error: "too_many_intervals" };
    for (let i = 0; i < intervals.length; i++) {
      const iv = intervals[i];
      if (!Array.isArray(iv) || iv.length !== 2 || !TIME.test(iv[0] ?? "") || !TIME.test(iv[1] ?? "")) return { ok: false, error: "invalid_time", index: i };
      if (iv[0] >= iv[1]) return { ok: false, error: "interval_order", index: i };
    }
    clean = [...intervals].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([a, b]) => [a, b]);
    for (let i = 1; i < clean.length; i++) if (clean[i][0] <= clean[i - 1][1]) return { ok: false, error: "intervals_overlap", index: i };
  }
  return { ok: true, value: { date, kind, intervals: clean, note: text || null } };
}
