import { faFacebook, faInstagram, faTiktok, faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { hoursRowsFor, nairobiNow } from "@epicmkt/shared";

export const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const DAY_NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export const formatTime = (time) => {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

export const statusText = (business) => {
  if (business.isOpen) return business.closesAt ? `Open now · Closes ${formatTime(business.closesAt)}` : "Open now";
  const next = business.opensAt;
  if (!next) return "Closed";
  const sameDay = next.date ? next.date === nairobiNow().date : next.day === nairobiNow().day;
  const day = sameDay ? "" : `${DAY_NAMES[next.day].slice(0, 3)} `;
  return `Closed · Opens ${day}${formatTime(next.time)}`;
};

// Same rows the customer page shows. Exceptions replace the weekly hours for their date.
export const hoursRows = (hours, exceptions) => hoursRowsFor(hours, exceptions);

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
