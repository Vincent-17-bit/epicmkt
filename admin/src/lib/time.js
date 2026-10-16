const zone = "Africa/Nairobi";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-KE", { timeZone: zone, day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-KE", { timeZone: zone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

const dayNumber = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);

export function todayEat(now = new Date()) {
  return dayFmt.format(now);
}

export function addDays(iso, count) {
  return new Date((dayNumber(iso) + count) * 86400000).toISOString().slice(0, 10);
}

export function daysLeft(paidUntil, now = new Date()) {
  return dayNumber(paidUntil) - dayNumber(todayEat(now));
}

export function compactCountdown(days) {
  if (days > 0) return `${days}d`;
  if (days === 0) return "Today";
  return `${-days}d over`;
}

export function formatDate(value) {
  return value ? dateFmt.format(new Date(value)) : "";
}

export function formatDateTime(value) {
  return value ? dateTimeFmt.format(new Date(value)) : "";
}
