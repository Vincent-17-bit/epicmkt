import { faFacebook, faInstagram, faTiktok, faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { DAYS, formatInstant, getUserTimeZone, hoursRowsFor, nairobiNow, nextShopDateOf, safeShopZone, shopTimeNote, shopTimeText } from "@epicmkt/shared";

export const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const DAY_NAMES = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};

export const formatTime = (time) => {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
};

/**
 * "Open now · Closes 6:00 PM EAT · 7:00 PM your time". The shop's own time always comes first with its zone name; the
 * viewer's reading follows when it is a different clock. business.timezone is the shop's IANA zone (default Nairobi).
 */
export function statusText(business, viewerZone = getUserTimeZone()) {
  const shopZone = safeShopZone(business.timezone);
  const opts = { shopZone, viewerZone };
  if (business.isOpen) {
    if (!business.closesAt) return "Open now";
    const date = nextShopDateOf(business.closesAt, new Date(), shopZone);
    return `Open now · Closes ${shopTimeText(date, business.closesAt, opts)}`;
  }
  const next = business.opensAt;
  if (!next) return "Closed";
  const today = nairobiNow(new Date(), shopZone);
  // Compare dates, not weekdays: "opens next Tuesday" must not read as "opens today" when today is a Tuesday.
  const day = next.date ? (next.date === today.date ? "" : `${DAY_NAMES[next.day].slice(0, 3)} `) : next.day === today.day ? "" : `${DAY_NAMES[next.day].slice(0, 3)} `;
  const at = next.date ? shopTimeText(next.date, next.time, opts) : formatTime(next.time);
  return `Closed · Opens ${day}${at}`;
}

/** Rows for the Opening hours table; exceptions replace the weekly hours for their date. Shop time, plus the viewer's. */
export const hoursRows = (hours, exceptions, timeZone, viewerZone = getUserTimeZone()) => hoursRowsFor(hours, exceptions, new Date(), timeZone, viewerZone);

/** The line above the hours table that says which zone the hours are in. */
export const hoursCaption = (timeZone, viewerZone = getUserTimeZone()) => shopTimeNote(new Date(), { shopZone: timeZone, viewerZone });

export const todayKey = (timeZone) => nairobiNow(new Date(), safeShopZone(timeZone)).day;

export const SOCIALS = {
  instagram: { label: "Instagram", icon: faInstagram, url: (h) => `https://instagram.com/${h}` },
  facebook: { label: "Facebook", icon: faFacebook, url: (h) => `https://facebook.com/${h}` },
  tiktok: { label: "TikTok", icon: faTiktok, url: (h) => `https://tiktok.com/@${h}` },
  x: { label: "X", icon: faXTwitter, url: (h) => `https://x.com/${h}` }
};

export const socialLinks = (socials = {}) =>
  Object.entries(socials)
    .filter(([key, handle]) => SOCIALS[key] && handle)
    .map(([key, handle]) => ({ key, handle, ...SOCIALS[key], href: SOCIALS[key].url(handle) }));

export function expiryText(iso) {
  const days = Math.ceil((Date.parse(iso) - Date.now()) / 86400000);
  if (days <= 1) return "Ends today";
  if (days <= 7) return `Ends in ${days} days`;
  return `Valid until ${formatInstant(iso, { locale: "en-KE", day: "numeric", month: "short" })}`;
}

export { DAYS };
