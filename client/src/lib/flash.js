import { t } from "../i18n/index.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const URGENCY = Object.freeze({ CALM: "calm", SOON: "soon", URGENT: "urgent", CRITICAL: "critical", ENDED: "ended" });

export function urgencyOf(ms) {
  if (!(ms > 0)) return URGENCY.ENDED;
  if (ms < 5 * MINUTE) return URGENCY.CRITICAL;
  if (ms < HOUR) return URGENCY.URGENT;
  if (ms < DAY) return URGENCY.SOON;
  return URGENCY.CALM;
}

export function describeMs(ms) {
  const total = Math.max(0, Math.ceil(ms / SECOND));
  return {
    ms: Math.max(0, ms),
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
    urgency: urgencyOf(ms)
  };
}

export const showsDays = (parts) => parts.d > 0 || parts.ms >= DAY;

export const pad2 = (n) => String(n).padStart(2, "0");

export function clockText(parts) {
  if (showsDays(parts)) return `${parts.d}d ${pad2(parts.h)}h ${pad2(parts.m)}m`;
  return `${pad2(parts.h)}:${pad2(parts.m)}:${pad2(parts.s)}`;
}

const unit = (n, key) => `${n} ${t(n === 1 ? `flash.unit.${key}` : `flash.unit.${key}s`)}`;

export function spokenDuration(ms) {
  if (!(ms > 0)) return t("flash.ended");
  const minutes = Math.ceil(ms / MINUTE);
  if (minutes < 1) return t("flash.lessThanMinute");
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const parts = d > 0 ? [unit(d, "day"), h > 0 && unit(h, "hour")] : h > 0 ? [unit(h, "hour"), m > 0 && unit(m, "minute")] : [unit(m, "minute")];
  return parts.filter(Boolean).join(" ");
}

export const endsInLabel = (ms) => (ms > 0 ? `${t("flash.endsIn")} ${spokenDuration(ms)}` : t("flash.ended"));

export function urgencyLabel(urgency) {
  if (urgency === URGENCY.CRITICAL) return t("flash.lastChance");
  if (urgency === URGENCY.URGENT) return t("flash.endingSoon");
  return t("flash.label");
}

export const kes = (n) => Number(n).toLocaleString("en-KE");

export const kesText = (n) => `${t("flash.currency")} ${kes(n)}`;

export function discountBadge(discount) {
  if (discount?.type === "percent") return { kind: "percent", text: `-${discount.value}%` };
  if (discount?.type === "amount_off") return { kind: "amount", text: `KES ${kes(discount.value)} ${t("flash.off")}` };
  return { kind: "deal", text: t("flash.deal") };
}

export const saleHref = (entry) => `/b/${entry.business.slug}?item=${encodeURIComponent(entry.item.id)}`;

export function fuseShare(startsAt, endsAt, now) {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  const span = end - start;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, (end - now) / span));
}

export function formatEndsAt(endsAt) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).formatToParts(new Date(endsAt));
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()} EAT`;
}
