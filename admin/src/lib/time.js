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

// "just now", "5m ago", "3h ago", "2d ago", then the calendar date for anything older than two weeks.
export function timeAgo(value, now = new Date()) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.floor((now.getTime() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return dateFmt.format(new Date(then));
}

export function formatDate(value) {
  return value ? dateFmt.format(new Date(value)) : "";
}

export function formatDateTime(value) {
  return value ? dateTimeFmt.format(new Date(value)) : "";
}
