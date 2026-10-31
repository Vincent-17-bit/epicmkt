// Weekly opening hours as the app stores them: { mon: ["08:00", "18:00"], ... } with keys mon..sun.
// A day that is missing is closed. An interval whose end is not after its start runs past midnight (see intervalsOn in
// utils.js), so end < start is valid; start === end is not (it would mean zero hours or a full 24 hours, and the app
// reads neither).
//
// Both functions are pure, never mutate their input, and return { ok: true, value } or { ok: false, errors }.
// errors is a list of { day?, error } with these codes:
//   invalid_hours    the whole value is not a plain object
//   unknown_day      the key is not one of mon..sun
//   invalid_interval the day is not a [start, end] pair
//   invalid_time     start or end is not a real HH:MM time
//   zero_length      start and end are the same time

export const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const STRICT_TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const LOOSE_TIME = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// strict: only the canonical HH:MM. lenient (normalize): also trims, and pads a one digit hour ("8:30" -> "08:30").
function readTime(raw, lenient) {
  if (typeof raw !== "string") return null;
  if (!lenient) return STRICT_TIME.test(raw) ? raw : null;
  const t = raw.trim();
  return LOOSE_TIME.test(t) ? t.padStart(5, "0") : null;
}

function check(hours, lenient) {
  if (!isPlainObject(hours)) return { ok: false, errors: [{ error: "invalid_hours" }] };
  const errors = [];
  for (const key of Object.keys(hours)) {
    if (!WEEK_DAYS.includes(key)) errors.push({ day: key, error: "unknown_day" });
  }
  const value = {};
  for (const day of WEEK_DAYS) {
    const slot = hours[day];
    if (slot === undefined || slot === null) continue; // closed
    if (!Array.isArray(slot) || slot.length !== 2) {
      errors.push({ day, error: "invalid_interval" });
      continue;
    }
    const start = readTime(slot[0], lenient);
    const end = readTime(slot[1], lenient);
    if (start === null || end === null) {
      errors.push({ day, error: "invalid_time" });
      continue;
    }
    if (start === end) {
      errors.push({ day, error: "zero_length" });
      continue;
    }
    value[day] = [start, end];
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/** Checks hours exactly as stored: canonical HH:MM only. On success value is a fresh copy ordered mon..sun. */
export const validateWeeklyHours = (hours) => check(hours, false);

/**
 * Cleans up hours typed or imported by a person: trims times, pads "8:30" to "08:30", drops closed days (missing or
 * null) and orders keys mon..sun. Anything that still is not a valid interval is reported, never guessed.
 */
export const normalizeWeeklyHours = (hours) => check(hours, true);
