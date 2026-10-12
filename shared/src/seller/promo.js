import { limitsFor } from "./limits.js";

const EAT_MS = 3 * 3600 * 1000;
const SCHEDULE_GRACE_MS = 5 * 60 * 1000;
const BACKDATE_GRACE_MS = 15 * 60 * 1000;

export const toMs = (v) => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : v ? Date.parse(v) : null);

export const eatMonthKey = (v) => new Date(toMs(v) + EAT_MS).toISOString().slice(0, 7);

export const offerStatus = (offer, now = Date.now()) => {
  const start = toMs(offer.starts_at);
  const end = toMs(offer.ends_at);
  if (end !== null && end <= now) return "expired";
  if (start !== null && start > now) return "scheduled";
  return "active";
};

export const flashStatus = (sale, now = Date.now()) => {
  const start = toMs(sale.starts_at);
  const end = toMs(sale.ends_at);
  if (end <= now) return "ended";
  if (start > now) return "scheduled";
  return "running";
};

export const moderation = (row) => {
  const removed = row.removed_by_admin === true || row.admin_status === "removed";
  const hidden = row.hidden_by_admin === true || row.admin_status === "hidden";
  const reason = row.admin_reason || row.admin_hide_reason || null;
  return { state: removed ? "removed" : hidden ? "hidden" : "ok", reason };
};

export const isCountedOffer = (o, now = Date.now()) => {
  const end = toMs(o.ends_at);
  return o.active !== false && (end === null || end > now) && moderation(o).state === "ok" && (o.admin_status ?? "ok") === "ok";
};

export const isCountedFlash = (f) => moderation(f).state === "ok" && (f.admin_status ?? "ok") === "ok";

export const isCountedRow = isCountedFlash;

export const formatCountdown = (ms) => {
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
};

export const discountLabel = (type, value) => {
  const n = Number(value);
  return type === "percent" ? `${n}% off` : `KES ${n.toLocaleString("en-KE")} off`;
};

export const salePrice = (price, type, value) => {
  if (price === null || price === undefined) return null;
  const p = Number(price);
  const v = Number(value);
  return type === "percent" ? Math.round(p * (1 - v / 100) * 100) / 100 : p - v;
};

const discountProblem = (type, value, prices) => {
  const v = Number(value);
  if (type !== "percent" && type !== "kes") return "Choose percent or KES off";
  if (value === "" || value === null || value === undefined || !Number.isFinite(v)) return "Enter a discount";
  if (type === "percent") {
    if (!Number.isInteger(v) || v < 1 || v > 90) return "Percent must be a whole number from 1 to 90";
    return null;
  }
  if (!Number.isInteger(v) || v <= 0) return "Enter a whole number of KES above 0";
  if (prices.some((p) => p === null || p === undefined)) return "KES off needs every linked item to have a price";
  if (prices.length && v >= Math.min(...prices.map(Number))) return "KES off must be less than the item price";
  return null;
};

export const validateOfferDraft = (draft, { plan = "standard", items = [], now = Date.now() } = {}) => {
  const errors = {};
  const title = String(draft.title ?? "").trim();
  if (title.length < 3 || title.length > 120) errors.title = "Title needs 3 to 120 characters";
  const start = toMs(draft.starts_at);
  const end = toMs(draft.ends_at);
  if (start === null || Number.isNaN(start)) errors.starts_at = "Choose a start date";
  if (end === null || Number.isNaN(end)) errors.ends_at = "Choose an end date";
  if (!errors.starts_at && !errors.ends_at && end <= start) errors.ends_at = "End must be after the start";
  if (!errors.starts_at && plan !== "premium" && start > now + SCHEDULE_GRACE_MS) errors.starts_at = "Scheduling ahead is a Premium feature";
  const owned = new Map(items.map((i) => [i.id, i]));
  const linked = (draft.item_ids ?? []).map((id) => owned.get(id));
  if (linked.some((i) => !i)) errors.item_ids = "Linked items must be your own";
  else {
    const problem = discountProblem(draft.discount_type, draft.discount_value, linked.map((i) => i.price));
    if (problem) errors.discount_value = problem;
  }
  return errors;
};

export const validateFlashDraft = (draft, { items = [], now = Date.now() } = {}) => {
  const errors = {};
  const item = items.find((i) => i.id === draft.item_id);
  if (!item) errors.item_id = "Choose one of your items";
  const start = toMs(draft.starts_at ?? now);
  const end = toMs(draft.ends_at);
  if (end === null || Number.isNaN(end)) errors.ends_at = "Choose when the sale ends";
  else if (end <= start) errors.ends_at = "End must be after the start";
  else if (end <= now) errors.ends_at = "End must be in the future";
  if (!errors.ends_at && start < now - BACKDATE_GRACE_MS) errors.starts_at = "Start cannot be in the past";
  if (item) {
    const problem = discountProblem(draft.discount_type, draft.discount_value, [item.price]);
    if (problem) errors.discount_value = problem;
  }
  return errors;
};

export const checkFlashLimits = (existing, draft, { plan, global } = {}) => {
  const limits = limitsFor(plan, global);
  const others = existing.filter((f) => f.id !== draft.id && isCountedFlash(f));
  const start = toMs(draft.starts_at);
  const end = toMs(draft.ends_at);
  if (limits.flashSalesPerMonth !== null) {
    const key = eatMonthKey(start);
    if (others.filter((f) => eatMonthKey(f.starts_at) === key).length >= limits.flashSalesPerMonth) return "limit_reached:flash_sales_month";
  }
  if (limits.flashSalesConcurrent !== null) {
    const points = [start, ...others.map((f) => toMs(f.starts_at)).filter((t) => t > start && t < end)];
    const peak = Math.max(0, ...points.map((t) => others.filter((f) => toMs(f.starts_at) <= t && toMs(f.ends_at) > t).length));
    if (peak >= limits.flashSalesConcurrent) return "limit_reached:flash_sales_concurrent";
  }
  return null;
};

const MESSAGES = {
  "limit_reached:offers": (l) => `Your plan allows ${l.activeOffers} active offers. End or remove one, or upgrade.`,
  "limit_reached:flash_sales_month": (l) => `You have used all ${l.flashSalesPerMonth} flash sales for that month.`,
  "limit_reached:flash_sales_concurrent": (l) => `Your plan allows ${l.flashSalesConcurrent} flash ${l.flashSalesConcurrent === 1 ? "sale" : "sales"} at a time.`,
  "limit_reached:gallery_photos": (l) => `Your plan allows ${l.galleryPhotos} gallery photos.`,
  "premium_only:schedule": () => "Scheduling offers ahead is a Premium feature.",
  "premium_only:services": () => "Linking services to staff is a Premium feature.",
  "premium_only:timetable": () => "The class timetable is a Premium feature.",
  invalid_dates: () => "End must be after the start.",
  "invalid_dates:past": () => "Dates cannot be in the past.",
  invalid_discount: () => "Check the discount amount.",
  "invalid_discount:kes_not_below_price": () => "KES off must be less than the item price.",
  item_not_owned: () => "Linked items must belong to your business.",
  trainer_not_owned: () => "Choose a trainer from your own team.",
  timetable_trainer_no_overlap: () => "That trainer already has a class at this time.",
  timetable_category: () => "The timetable is for salons and gyms.",
  pair_category: () => "Before and after pairs are for barbershops and salons.",
  invalid_banner_path: () => "That banner image could not be used.",
  invalid_photo_path: () => "That photo could not be used.",
  admin_columns_protected: () => "Only an admin can change that.",
};

export const promoErrorMessage = (error, plan = "standard", global = null) => {
  const raw = String(error?.code ?? error?.message ?? error ?? "");
  const limits = limitsFor(plan, global);
  const key = Object.keys(MESSAGES).sort((a, b) => b.length - a.length).find((k) => raw.includes(k));
  if (key) return MESSAGES[key](limits);
  if (/row-level security|permission denied/.test(raw)) return "Your listing is read-only right now.";
  return "Something went wrong. Please try again.";
};
