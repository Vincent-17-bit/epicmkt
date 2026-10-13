export const MS_MIN = 60000;
export const MS_HOUR = 3600000;
export const MS_DAY = 86400000;
export const DAY_MIN = 1440;
export const NAIROBI_OFFSET_MS = 3 * MS_HOUR;
export const STEP = 5;

export const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SUN_FIRST = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const DAY_NAMES = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};

const pad = (n) => String(n).padStart(2, "0");
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isTime = (value) => typeof value === "string" && TIME_RE.test(value);

export const toMinutes = (value) => {
  const m = typeof value === "string" ? TIME_RE.exec(value) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

export const fromMinutes = (n) => {
  const x = ((Math.round(n) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
};

export const snapTime = (value) => {
  const m = toMinutes(value);
  return Number.isNaN(m) ? value : fromMinutes(Math.round(m / STEP) * STEP);
};

export const formatClock = (value) => {
  const m = toMinutes(value);
  if (Number.isNaN(m)) return "";
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${pad(m % 60)} ${h >= 12 ? "PM" : "AM"}`;
};

const localDate = (ms) => new Date(ms + NAIROBI_OFFSET_MS);

export const midnightOf = (ms) => Math.floor((ms + NAIROBI_OFFSET_MS) / MS_DAY) * MS_DAY - NAIROBI_OFFSET_MS;

export const dateKeyOf = (ms) => {
  const d = localDate(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export const minutesOfDay = (ms) => {
  const d = localDate(ms);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

export const dowOf = (ms) => SUN_FIRST[localDate(ms).getUTCDay()];

export const parseDateKey = (key) => {
  const m = typeof key === "string" ? DATE_RE.exec(key) : null;
  if (!m) return NaN;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - NAIROBI_OFFSET_MS;
  return dateKeyOf(ms) === key ? ms : NaN;
};

export const addDays = (key, n) => dateKeyOf(parseDateKey(key) + n * MS_DAY);

export const formatClockMs = (ms) => formatClock(fromMinutes(minutesOfDay(ms)));

export const formatWhen = (ms, nowMs) => {
  const clock = formatClockMs(ms);
  const diff = Math.round((midnightOf(ms) - midnightOf(nowMs)) / MS_DAY);
  if (diff <= 0) return clock;
  if (diff === 1) return `tomorrow ${clock}`;
  const name = DAY_NAMES[dowOf(ms)].slice(0, 3);
  if (diff < 7) return `${name} ${clock}`;
  const d = localDate(ms);
  return `${name} ${d.getUTCDate()} ${d.toLocaleString("en-KE", { month: "short", timeZone: "UTC" })} ${clock}`;
};

export const formatMinutesLong = (minutes) => {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
};

export const ceilToStep = (ms) => Math.ceil(ms / (STEP * MS_MIN)) * STEP * MS_MIN;
