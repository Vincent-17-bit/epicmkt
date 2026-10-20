import { faFacebook, faInstagram, faTiktok, faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { nairobiNow } from "@epicmkt/shared";

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
  const day = next.day === nairobiNow().day ? "" : `${DAY_NAMES[next.day].slice(0, 3)} `;
  return `Closed · Opens ${day}${formatTime(next.time)}`;
};

export const hoursRows = (hours) => {
  const today = nairobiNow().day;
  return WEEK.map((day) => ({
    day,
    name: DAY_NAMES[day],
    today: day === today,
    text: hours?.[day] ? `${formatTime(hours[day][0])} to ${formatTime(hours[day][1])}` : "Closed",
  }));
};

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
