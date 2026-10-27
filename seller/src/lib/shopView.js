import { faFacebook, faInstagram, faTiktok, faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { getUserTimeZone, hoursRowsFor, nairobiNow, nextShopDateOf, safeShopZone, shopTimeNote, shopTimeText } from "@epicmkt/shared";

export const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const DAY_NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export const formatTime = (time) => {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

export const statusText = (business, viewerZone = getUserTimeZone()) => {
  const shopZone = safeShopZone(business.timezone);
  const opts = { shopZone, viewerZone };
  if (business.isOpen) {
    if (!business.closesAt) return "Open now";
    return `Open now · Closes ${shopTimeText(nextShopDateOf(business.closesAt, new Date(), shopZone), business.closesAt, opts)}`;
  }
  const next = business.opensAt;
  if (!next) return "Closed";
  const today = nairobiNow(new Date(), shopZone);
  const sameDay = next.date ? next.date === today.date : next.day === today.day;
  const day = sameDay ? "" : `${DAY_NAMES[next.day].slice(0, 3)} `;
  return `Closed · Opens ${day}${next.date ? shopTimeText(next.date, next.time, opts) : formatTime(next.time)}`;
};

// Same rows the customer page shows. Exceptions replace the weekly hours for their date.
export const hoursRows = (hours, exceptions, timeZone, viewerZone = getUserTimeZone()) => hoursRowsFor(hours, exceptions, new Date(), timeZone, viewerZone);
export const hoursCaption = (timeZone, viewerZone = getUserTimeZone()) => shopTimeNote(new Date(), { shopZone: timeZone, viewerZone });

const SOCIALS = {
  instagram: { label: "Instagram", icon: faInstagram, url: (h) => `https://instagram.com/${h}` },
  facebook: { label: "Facebook", icon: faFacebook, url: (h) => `https://facebook.com/${h}` },
  tiktok: { label: "TikTok", icon: faTiktok, url: (h) => `https://tiktok.com/@${h}` },
  x: { label: "X", icon: faXTwitter, url: (h) => `https://x.com/${h}` },
};

export const socialLinks = (socials = {}) =>
  Object.entries(socials)
    .filter(([key, handle]) => SOCIALS[key] && handle)
    .map(([key, handle]) => ({ key, handle, ...SOCIALS[key], href: SOCIALS[key].url(handle) }));
