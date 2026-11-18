// Picking a send time for a broadcast. The admin types Nairobi wall-clock time whatever zone their browser is in; Nairobi has no
// daylight saving (always UTC+3), so a fixed offset is exact. Values are "YYYY-MM-DDTHH:mm" like <input type="datetime-local">.
// Pure: no browser imports.

const OFFSET_MS = 3 * 3_600_000;
const MIN = 60_000;
export const MIN_LEAD_MINUTES = 2;
export const MAX_DAYS_AHEAD = 180;

const pad = (n) => String(n).padStart(2, "0");

/** A Date as a Nairobi "YYYY-MM-DDTHH:mm" string. */
export function toNairobiInput(date) {
  const d = new Date(date.getTime() + OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** A Nairobi "YYYY-MM-DDTHH:mm" string as a Date, or null when it is not a real time. */
export function fromNairobiInput(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value ?? ""));
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi) - OFFSET_MS;
  const date = new Date(ms);
  return Number.isNaN(ms) || toNairobiInput(date) !== value ? null : date;
}

/** The earliest time the picker allows, as an input value (a couple of minutes from now). */
export const earliestInput = (now = new Date()) => toNairobiInput(new Date(now.getTime() + MIN_LEAD_MINUTES * MIN));

/** "" when the time can be used, otherwise a sentence saying what is wrong. An empty value means "send now" and is fine. */
export function scheduleProblem(value, now = new Date()) {
  if (!value) return "";
  const when = fromNairobiInput(value);
  if (!when) return "That send time is not valid.";
  if (when.getTime() < now.getTime() + MIN_LEAD_MINUTES * MIN - MIN) return "Pick a time in the future, or choose Send now.";
  if (when.getTime() > now.getTime() + MAX_DAYS_AHEAD * 24 * 60 * MIN) return "Pick a time within the next six months.";
  return "";
}

/** Ready-made times: in an hour, tomorrow morning, next Monday morning (08:00, after quiet hours). */
export function quickPicks(now = new Date()) {
  const inHour = new Date(Math.ceil((now.getTime() + 60 * MIN) / (5 * MIN)) * 5 * MIN);
  const local = new Date(now.getTime() + OFFSET_MS); // read with the UTC getters: they are Nairobi's clock
  const at8 = (daysAhead) => new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + daysAhead, 8, 0) - OFFSET_MS);
  const untilMonday = ((8 - local.getUTCDay()) % 7) || 7;
  const picks = [
    { id: "hour", label: "In 1 hour", value: toNairobiInput(inHour) },
    { id: "tomorrow", label: "Tomorrow 8:00", value: toNairobiInput(at8(1)) },
  ];
  if (untilMonday > 1) picks.push({ id: "monday", label: "Monday 8:00", value: toNairobiInput(at8(untilMonday)) });
  return picks;
}
