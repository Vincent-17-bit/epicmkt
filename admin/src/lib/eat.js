// East Africa Time (Africa/Nairobi, UTC+3, no daylight saving). Always EAT, whatever the browser's own zone is.
const TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit", hour12: false });
const STAMP = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
});

export const formatEatTime = (date) => TIME.format(date);
export const formatEatStamp = (date) => `${STAMP.format(date).replace(",", "")} EAT`;

/** "Active now", "5 min ago", "3 h ago", "2 days ago". */
export function relativeAgo(date, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now - date) / 60_000));
  if (minutes < 2) return "Active now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
