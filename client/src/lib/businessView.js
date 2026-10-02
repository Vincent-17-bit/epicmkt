import { faFacebook, faInstagram, faTiktok, faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { DAYS, nairobiNow } from "@epicmkt/shared";

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

export function statusText(business) {
  if (business.isOpen) return business.closesAt ? `Open now · Closes ${formatTime(business.closesAt)}` : "Open now";
  const next = business.opensAt;
  if (!next) return "Closed";
  const today = nairobiNow().day;
  const day = next.day === today ? "" : `${DAY_NAMES[next.day].slice(0, 3)} `;
  return `Closed · Opens ${day}${formatTime(next.time)}`;
}

export const todayKey = () => nairobiNow().day;

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
  return `Valid until ${new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" })}`;
}

export { DAYS };
