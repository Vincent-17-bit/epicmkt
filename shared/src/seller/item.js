import { TIMEZONE_OFFSET_HOURS } from "../constants.js";
import { applyStockRules } from "./availability.js";

export const ITEM_KINDS = [
  { value: "product", label: "Product" },
  { value: "service", label: "Service" },
  { value: "membership", label: "Package or membership" },
  { value: "class", label: "Class or session" },
];

export const PRICE_TYPES = [
  { value: "fixed", label: "Fixed price" },
  { value: "from", label: "From (starting price)" },
  { value: "range", label: "Range" },
  { value: "free", label: "Free" },
  { value: "contact", label: "Contact for price" },
];

export const BADGES = ["Popular", "New", "Best value"];

export const TERMS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export const DEFAULT_UNITS = ["per item", "per 20L", "per kg", "per session", "per month"];

export const LIMITS = {
  name: 80,
  shortDescription: 160,
  description: 2000,
  terms: 1000,
  tags: 15,
  tagLength: 30,
  variants: 12,
  specs: 20,
  includes: 20,
  addOns: 10,
  staff: 10,
  price: 10_000_000,
  unit: 30,
  section: 40,
  sections: 30,
};

export const priceNeeds = (priceType) => ({
  price: ["fixed", "from", "range"].includes(priceType),
  max: priceType === "range",
  unit: priceType !== "contact",
});

const SERVICE_CATEGORIES = ["barbershops", "salons", "car-wash", "mechanics", "phone-repair", "tailors"];

export function defaultKindFor(categoryId) {
  if (categoryId === "gyms") return "membership";
  if (SERVICE_CATEGORIES.includes(categoryId)) return "service";
  return "product";
}

export const showsServiceFields = (kind) => kind === "service" || kind === "class";
export const showsMembershipFields = (kind) => kind === "membership" || kind === "class";

const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `x${Date.now()}${Math.random().toString(16).slice(2)}`);
export { newId };

export function blankItem(overrides = {}) {
  return {
    id: newId(),
    name: "",
    kind: "product",
    section: "",
    shortDescription: "",
    description: "",
    priceType: "fixed",
    price: null,
    priceMax: null,
    unit: "",
    salePrice: null,
    saleStarts: "",
    saleEnds: "",
    searchTags: [],
    visible: true,
    badge: "",
    variants: [],
    specs: [],
    includes: [],
    terms: "",
    availability: "available",
    seasonFrom: "",
    seasonTo: "",
    expectedDate: "",
    trackStock: false,
    stockCount: null,
    lowStockThreshold: 3,
    showStockCount: false,
    restockDate: "",
    service: { duration: null, homeService: false, appointmentNeeded: false, staff: [], addOns: [] },
    membership: { term: "month", daysTimes: "", trainer: "", joiningFee: null, peakPrice: null, offPeakPrice: null, peakHours: "", offPeakHours: "" },
    attributes: {},
    sort: 0,
    ...overrides,
  };
}

// Dates are plain "YYYY-MM-DD" in the form and Nairobi-local in the database.
export const dateToTs = (date, endOfDay = false) => (date ? `${date}T${endOfDay ? "23:59:59" : "00:00:00"}+03:00` : null);
export const tsToDate = (ts) => (ts ? new Date(Date.parse(ts) + TIMEZONE_OFFSET_HOURS * 3600000).toISOString().slice(0, 10) : "");

const blank = (v) => (v === "" || v === undefined ? null : v);
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

// Columns a seller may write. Admin columns and sort-independent server columns are never sent.
export function itemToRow(item) {
  const season = item.seasonFrom || item.seasonTo ? { from: item.seasonFrom || null, to: item.seasonTo || null } : null;
  return {
    name: item.name.trim(),
    kind: item.kind,
    section: blank(item.section?.trim()),
    short_description: blank(item.shortDescription?.trim()),
    description: blank(item.description?.trim()),
    price_type: item.priceType,
    price: priceNeeds(item.priceType).price ? num(item.price) : item.priceType === "free" ? 0 : null,
    price_max: item.priceType === "range" ? num(item.priceMax) : null,
    unit: priceNeeds(item.priceType).unit ? blank(item.unit?.trim()) : null,
    sale_price: priceNeeds(item.priceType).price && item.priceType !== "range" ? num(item.salePrice) : null,
    sale_starts_at: dateToTs(item.saleStarts),
    sale_ends_at: dateToTs(item.saleEnds, true),
    search_tags: item.searchTags,
    visible: item.visible,
    badge: blank(item.badge),
    variants: item.variants.map(({ id, label, price }) => ({ id, label: label.trim(), price: num(price) })),
    specs: item.specs.map(({ label, value }) => ({ label: label.trim(), value: value.trim() })),
    includes: item.includes,
    terms: blank(item.terms?.trim()),
    availability: item.availability,
    season: item.availability === "seasonal" ? season : null,
    available_from: item.availability === "coming_soon" ? dateToTs(item.expectedDate) : null,
    track_stock: item.trackStock,
    stock_count: item.trackStock ? num(item.stockCount) : null,
    low_stock_threshold: Number.isInteger(item.lowStockThreshold) ? item.lowStockThreshold : 3,
    show_stock_count: item.trackStock && item.showStockCount,
    restock_at: item.trackStock ? dateToTs(item.restockDate) : null,
    service: showsServiceFields(item.kind) ? item.service : {},
    membership: showsMembershipFields(item.kind) ? item.membership : {},
    attributes: item.attributes ?? {},
    sort: item.sort ?? 0,
  };
}

export function rowToItem(row) {
  const base = blankItem();
  return {
    ...base,
    id: row.id,
    name: row.name ?? "",
    kind: row.kind ?? "product",
    section: row.section ?? "",
    shortDescription: row.short_description ?? "",
    description: row.description ?? "",
    priceType: row.price_type ?? "fixed",
    price: num(row.price),
    priceMax: num(row.price_max),
    unit: row.unit ?? "",
    salePrice: num(row.sale_price),
    saleStarts: tsToDate(row.sale_starts_at),
    saleEnds: tsToDate(row.sale_ends_at),
    searchTags: row.search_tags ?? [],
    visible: row.visible ?? true,
    badge: row.badge ?? "",
    variants: (row.variants ?? []).map((v) => ({ id: v.id ?? newId(), label: v.label ?? "", price: num(v.price) })),
    specs: row.specs ?? [],
    includes: row.includes ?? [],
    terms: row.terms ?? "",
    availability: row.availability ?? "available",
    seasonFrom: row.season?.from ?? "",
    seasonTo: row.season?.to ?? "",
    expectedDate: tsToDate(row.available_from),
    trackStock: row.track_stock ?? false,
    stockCount: num(row.stock_count),
    lowStockThreshold: row.low_stock_threshold ?? 3,
    showStockCount: row.show_stock_count ?? false,
    restockDate: tsToDate(row.restock_at),
    service: { ...base.service, ...(row.service ?? {}) },
    membership: { ...base.membership, ...(row.membership ?? {}) },
    attributes: row.attributes ?? {},
    sort: row.sort ?? 0,
    hiddenByAdmin: Boolean(row.hidden_by_admin),
    adminHideReason: row.admin_hide_reason ?? null,
    removedByAdmin: Boolean(row.removed_by_admin),
    priceConfirmedAt: row.price_confirmed_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// What the database trigger does on write, for the mock and for previews.
export const withStockRules = (item) => ({ ...item, availability: applyStockRules(item) });

// Copy for "Duplicate": every authored field, but a fresh id, no admin flags and (from S5) no media references.
export function duplicateOf(item, sort) {
  const { hiddenByAdmin, adminHideReason, removedByAdmin, priceConfirmedAt, createdAt, updatedAt, ...own } = item;
  const copy = structuredClone(own);
  return {
    ...copy,
    id: newId(),
    name: `${item.name} (copy)`.slice(0, LIMITS.name),
    variants: copy.variants.map((v) => ({ ...v, id: newId() })),
    sort,
  };
}

export const pricePreview = (item) => {
  const k = (n) => `KSh ${Number(n).toLocaleString("en-KE")}`;
  const unit = item.unit ? ` ${item.unit}` : "";
  switch (item.priceType) {
    case "free": return "Free";
    case "contact": return "Contact for price";
    case "range": return item.price != null && item.priceMax != null ? `${k(item.price)} to ${k(item.priceMax)}${unit}` : "";
    case "from": return item.price != null ? `From ${k(item.price)}${unit}` : "";
    default: return item.price != null ? `${k(item.price)}${unit}` : "";
  }
};

// Reasons an item needs the seller's attention. Pure, so the tab and the tests share it.
export function attentionReasons(item, { now = new Date(), staleDays = 90, signals } = {}) {
  const out = [];
  const add = (code, label) => out.push({ code, label });
  if (item.hiddenByAdmin) add("hidden_by_admin", item.adminHideReason ? `Hidden by admin: ${item.adminHideReason}` : "Hidden by admin");
  if (priceNeeds(item.priceType).price && item.price == null) add("no_price", "No price yet");
  if (item.priceType === "range" && item.priceMax == null && item.price != null) add("no_price_max", "Range has no top price");
  if (item.priceConfirmedAt && Date.parse(item.priceConfirmedAt) < now.getTime() - staleDays * 86400000) add("stale_price", `Price not confirmed in ${staleDays} days`);
  if (item.availability === "out_of_stock") add("out_of_stock", item.restockDate ? `Out of stock, back ${item.restockDate}` : "Out of stock");
  if (item.availability === "coming_soon" && item.expectedDate && Date.parse(dateToTs(item.expectedDate, true)) < now.getTime()) add("past_expected", "Expected date has passed");
  if (item.availability === "seasonal" && item.seasonTo && Date.parse(dateToTs(item.seasonTo, true)) < now.getTime()) add("season_over", "Season dates have passed");
  if (item.saleEnds && item.salePrice != null && Date.parse(dateToTs(item.saleEnds, true)) < now.getTime()) add("sale_over", "Sale has ended, clear the sale price");
  if (!item.visible && !item.hiddenByAdmin) add("hidden", "Hidden from shoppers");
  if (!item.shortDescription) add("no_short_description", "No short description");
  const s = signals?.get?.(item.id);
  if (s?.open_flags) add("open_flag", `${s.open_flags} open ${s.open_flags === 1 ? "flag" : "flags"} from admin`);
  return out;
}

export function planUsage(count, limit) {
  const unlimited = limit == null;
  return {
    count,
    limit: unlimited ? null : limit,
    remaining: unlimited ? null : Math.max(0, limit - count),
    atLimit: !unlimited && count >= limit,
    nearLimit: !unlimited && limit > 0 && count / limit >= 0.8,
    label: unlimited ? `${count} items` : `${count} of ${limit} items`,
  };
}

// Database raises limit_reached:items; the app speaks item_limit_reached.
export const isItemLimitMessage = (message) => /limit_reached:items\b/.test(String(message ?? ""));
