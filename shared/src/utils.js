import { TIMEZONE_OFFSET_HOURS } from "./constants.js";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const normalizeText = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const slugify = (value) => normalizeText(value).replace(/\s/g, "-");

export const toE164KE = (phone) => {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
};

export const isValidPhoneKE = (phone) => /^254[71]\d{8}$/.test(toE164KE(phone));

export const formatPhoneKE = (phone) => {
  const d = toE164KE(phone);
  return `0${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
};

export const telLink = (phone) => `tel:+${toE164KE(phone)}`;

export const whatsappLink = (phone, text) =>
  `https://wa.me/${toE164KE(phone)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

export const directionsLink = (lat, lng) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export const formatKes = (amount) => `KSh ${Number(amount).toLocaleString("en-KE")}`;

export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const formatDistance = (km) =>
  km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km.toFixed(1)} km`;

export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const toMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export function nairobiNow(date = new Date()) {
  const shifted = new Date(date.getTime() + TIMEZONE_OFFSET_HOURS * 3600000);
  return {
    day: DAYS[shifted.getUTCDay()],
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  };
}

export function todayHours(hours, date) {
  return hours[nairobiNow(date).day] ?? null;
}

export function isOpenNow(hours, date) {
  const { day, minutes } = nairobiNow(date);
  const slot = hours[day];
  if (!slot) return false;
  const start = toMinutes(slot[0]);
  const end = toMinutes(slot[1]);
  return end > start ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function closingInfo(hours, date) {
  const now = nairobiNow(date);
  const slot = hours[now.day];
  const open = isOpenNow(hours, date);
  if (open) return { closesAt: slot[1], opensAt: null };
  if (slot && now.minutes < toMinutes(slot[0])) return { closesAt: null, opensAt: { day: now.day, time: slot[0] } };
  const start = DAYS.indexOf(now.day);
  for (let step = 1; step <= 7; step += 1) {
    const day = DAYS[(start + step) % 7];
    if (hours[day]) return { closesAt: null, opensAt: { day, time: hours[day][0] } };
  }
  return { closesAt: null, opensAt: null };
}
