import { dayOf } from "../billing.js";

// A flash sale may run for 14 days from its start. The same number is in the database (migration 0154: the flash_sales_duration
// constraint, flash_check_rules and extend_flash_sale), so change them together.
export const FLASH_MAX_DAYS = 14;
export const FLASH_MAX_MS = FLASH_MAX_DAYS * 86_400_000;
export const FLASH_QUICK = [
  { key: "1h", label: "1 hour", ms: 3_600_000 },
  { key: "6h", label: "6 hours", ms: 6 * 3_600_000 },
  { key: "24h", label: "24 hours", ms: 24 * 3_600_000 },
  { key: "48h", label: "48 hours", ms: 48 * 3_600_000 },
  { key: "7d", label: "7 days", ms: 7 * 86_400_000 },
  { key: "14d", label: "14 days", ms: FLASH_MAX_MS }
];
export const FLASH_DISCOUNTS = ["percent", "amount_off", "sale_price"];
export const FLASH_HEADLINE = [3, 80];
export const FLASH_NOTE = [2, 80];

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function flashPrice(type, value, regular) {
  const raw = type === "percent" ? regular * (1 - value / 100) : type === "amount_off" ? regular - value : value;
  return Math.max(0, Math.round(raw));
}

const text = (value, [min, max]) => {
  const clean = String(value ?? "").trim();
  if (!clean) return { ok: true, value: null };
  if (clean.length < min || clean.length > max || CONTROL.test(clean)) return { ok: false };
  return { ok: true, value: clean };
};

export const flashTextProblem = (field, value) => {
  const result = text(value, field === "headline" ? FLASH_HEADLINE : FLASH_NOTE);
  return result.ok ? null : field === "headline" ? "invalid_headline" : "invalid_note";
};

export function validateFlashSale({ itemPrice, discountType, discountValue, startsAt, endsAt, headline, quantityNote, afterEnd }, nowMs) {
  if (!FLASH_DISCOUNTS.includes(discountType)) return { ok: false, error: "invalid_discount" };
  const value = Number(discountValue);
  if (!Number.isFinite(value)) return { ok: false, error: "invalid_discount" };
  if (discountType === "percent" && (value < 1 || value > 99)) return { ok: false, error: "invalid_discount" };
  if (discountType !== "percent" && value <= 0) return { ok: false, error: "invalid_discount" };
  if (!(itemPrice > 0)) return { ok: false, error: "item_not_discountable" };
  const price = flashPrice(discountType, value, itemPrice);
  if (price <= 0) return { ok: false, error: "discount_too_large" };
  if (price >= itemPrice) return { ok: false, error: "sale_price_not_lower" };
  const start = startsAt ? Date.parse(startsAt) : nowMs;
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: false, error: "invalid_window" };
  const from = Math.max(start, nowMs);
  if (end <= nowMs) return { ok: false, error: "ends_in_past" };
  if (end <= from) return { ok: false, error: "invalid_window" };
  if (end - from > FLASH_MAX_MS) return { ok: false, error: "duration_too_long" };
  const head = text(headline, FLASH_HEADLINE);
  if (!head.ok) return { ok: false, error: "invalid_headline" };
  const note = text(quantityNote, FLASH_NOTE);
  if (!note.ok) return { ok: false, error: "invalid_note" };
  if (afterEnd !== "keep" && afterEnd !== "unlist") return { ok: false, error: "invalid_after_end" };
  return {
    ok: true,
    value: {
      discountType,
      discountValue: value,
      startsAt: new Date(from).toISOString(),
      endsAt: new Date(end).toISOString(),
      headline: head.value,
      quantityNote: note.value,
      afterEnd,
      salePrice: price
    }
  };
}

const monthOf = (ms) => dayOf(new Date(ms)).slice(0, 7);

export function flashQuota(sales, limits, nowMs) {
  const open = (sales ?? []).filter((sale) => (sale.status === "scheduled" || sale.status === "live") && Date.parse(sale.endsAt) > nowMs);
  const month = (sales ?? []).filter((sale) => sale.status !== "cancelled" && monthOf(Date.parse(sale.startsAt)) === monthOf(nowMs));
  const concurrentLimit = limits?.flashSalesConcurrent ?? null;
  const monthlyLimit = limits?.flashSalesPerMonth ?? null;
  return {
    concurrentLimit,
    concurrentUsed: open.length,
    monthlyLimit,
    monthlyUsed: month.length,
    canCreate:
      (concurrentLimit === null || open.length < concurrentLimit) && (monthlyLimit === null || month.length < monthlyLimit)
  };
}

export const flashPhase = (sale, nowMs) => {
  if (sale.status === "cancelled") return "cancelled";
  if (sale.status === "ended" || Date.parse(sale.endsAt) <= nowMs) return "ended";
  return Date.parse(sale.startsAt) > nowMs ? "scheduled" : "live";
};

// ---- Renewing and extending ----------------------------------------------------------------------------------------------------
// A sale that ended by itself or by the seller can be run again with the same item, discount, per-option prices, headline and note,
// for as long as the seller wants (up to FLASH_MAX_MS). A sale that EpicMKT stopped, or whose item was removed or whose listing was not
// active, is not offered again: the reason is still true, and the database would refuse it anyway.
const RENEWABLE_REASONS = new Set(["time", "seller"]);

export const flashRenewable = (sale, nowMs) => flashPhase(sale, nowMs) === "ended" && RENEWABLE_REASONS.has(sale.endedReason ?? "time");

// What createFlashSale needs to run `sale` again: starting now (or at startsAt when given) and ending at endsAt.
export const renewInput = (sale, { endsAt, startsAt = null }) => ({
  itemId: sale.itemId,
  discountType: sale.discountType,
  discountValue: Number(sale.discountValue),
  startsAt,
  endsAt,
  headline: sale.headline ?? null,
  quantityNote: sale.quantityNote ?? null,
  afterEnd: sale.afterEnd === "unlist" ? "unlist" : "keep",
  ...(sale.variantTarget === "chosen" && sale.variantOverrides?.length ? { variantTarget: "chosen", variantOverrides: sale.variantOverrides } : {})
});

// The longest a sale that started at startMs may run (its start plus FLASH_MAX_MS).
export const flashLatestEnd = (startMs) => startMs + FLASH_MAX_MS;

// Ways to push a running sale's end later: each is "add this much", kept only while the new end is inside the 14 day limit, plus one
// that goes all the way to the limit when there is any room left.
export function extendChoices(sale, nowMs) {
  const end = Date.parse(sale.endsAt);
  const cap = flashLatestEnd(Date.parse(sale.startsAt));
  const choices = FLASH_QUICK.filter((q) => end + q.ms <= cap).map((q) => ({ key: q.key, label: q.label, endsAt: new Date(end + q.ms).toISOString() }));
  const last = choices.at(-1);
  if (cap > end && (!last || Date.parse(last.endsAt) < cap)) choices.push({ key: "max", label: "Run to the 14 day limit", endsAt: new Date(cap).toISOString(), max: true });
  return { choices, cap, room: Math.max(0, cap - Math.max(end, nowMs ?? end)) };
}

// "13 days 4 hours", "6 hours 30 minutes", "45 minutes": how long a sale will run, in words a seller reads at a glance.
export function spanText(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const part = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  if (d > 0) return h > 0 ? `${part(d, "day", "days")} ${part(h, "hour", "hours")}` : part(d, "day", "days");
  if (h > 0) return m > 0 ? `${part(h, "hour", "hours")} ${part(m, "minute", "minutes")}` : part(h, "hour", "hours");
  return part(m, "minute", "minutes");
}
