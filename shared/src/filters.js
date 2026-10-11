import { normalizeText } from "./utils.js";

export const LISTING_AVAILABILITY = ["available", "limited_stock", "out_of_stock", "seasonal", "by_appointment", "coming_soon", "unavailable"];

export const AVAILABILITY_LABELS = {
  available: "Available",
  limited_stock: "Limited stock",
  out_of_stock: "Out of stock",
  seasonal: "Seasonal",
  by_appointment: "By appointment",
  coming_soon: "Coming soon",
  unavailable: "Unavailable"
};

export const VISIBILITY = ["showing", "hidden_by_me", "hidden_by_admin", "draft"];

export const VISIBILITY_LABELS = {
  showing: "Showing",
  hidden_by_me: "Hidden by me",
  hidden_by_admin: "Hidden by admin",
  draft: "Draft"
};

export const ISSUES = ["no_photo", "stale_price", "low_stock", "reported", "flagged"];

export const ISSUE_LABELS = {
  no_photo: "No photo",
  stale_price: "Stale price",
  low_stock: "Low stock",
  reported: "Reported",
  flagged: "Flagged"
};

export const CATALOG_SORTS = [
  { value: "manual", label: "Manual order" },
  { value: "name_asc", label: "Name A to Z" },
  { value: "name_desc", label: "Name Z to A" },
  { value: "price_asc", label: "Price low to high" },
  { value: "price_desc", label: "Price high to low" },
  { value: "newest", label: "Newest" },
  { value: "updated", label: "Recently updated" },
  { value: "available_first", label: "Available first" },
  { value: "out_of_stock_first", label: "Out of stock first" },
  { value: "stock_low", label: "Stock count lowest first" },
  { value: "health_low", label: "Item health lowest first" },
  { value: "most_reported", label: "Most reported" },
  { value: "stale_first", label: "Stale prices first" }
];

export const UPDATED_WINDOWS = ["7", "30"];

export const DEFAULT_STALE_DAYS = 90;
export const MAX_SAVED_VIEWS = 10;
export const VIEW_NAME_MAX = 40;

const DAY_MS = 86_400_000;
const NO_PRICE = new Set(["free", "contact"]);

export const DEFAULT_VIEW = Object.freeze({
  q: "",
  section: "",
  type: "",
  availability: [],
  visibility: [],
  issues: [],
  priceMin: null,
  priceMax: null,
  onSale: false,
  badge: "",
  hasVideo: false,
  hasVariants: false,
  withStock: false,
  updated: "",
  sort: "manual"
});

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const time = (v) => {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

export function toListingItem(row, signal = {}) {
  const media = row.item_media ?? row.media ?? [];
  const images = media.filter((m) => m.kind === "image");
  const variants = Array.isArray(row.variants) ? row.variants : [];
  return {
    id: row.id,
    name: row.name ?? "",
    description: row.description ?? "",
    section: row.section ?? "",
    kind: row.kind ?? "product",
    availability: row.availability ?? "available",
    visible: row.visible !== false,
    draft: Boolean(row.draft),
    hiddenByAdmin: Boolean(row.hidden_by_admin ?? row.hiddenByAdmin),
    removedByAdmin: Boolean(row.removed_by_admin ?? row.removedByAdmin),
    adminReason: row.admin_hide_reason ?? row.adminReason ?? row.admin_reason ?? "",
    price: num(row.price),
    priceMax: num(row.price_max ?? row.priceMax),
    priceType: row.price_type ?? row.priceType ?? "fixed",
    salePrice: num(row.sale_price ?? row.salePrice),
    unit: row.unit ?? "",
    badge: row.badge ?? "",
    tags: Array.isArray(row.search_tags) ? row.search_tags : Array.isArray(row.tags) ? row.tags : [],
    variantCount: variants.length || num(row.variantCount) || 0,
    photoCount: images.length || num(row.photoCount) || 0,
    hasVideo: media.some((m) => m.kind === "video") || Boolean(row.hasVideo),
    imageUrl: row.imageUrl ?? images[0]?.url ?? null,
    stockCount: num(row.stock_count ?? row.stockCount),
    trackStock: Boolean(row.track_stock ?? row.trackStock),
    lowStockThreshold: num(row.low_stock_threshold ?? row.lowStockThreshold) ?? 3,
    showStockCount: Boolean(row.show_stock_count ?? row.showStockCount),
    priceConfirmedAt: row.price_confirmed_at ?? row.priceConfirmedAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    sort: num(row.sort) ?? 0,
    openFlags: num(signal.open_flags ?? signal.openFlags ?? row.openFlags) ?? 0,
    reports30d: num(signal.reports_30d ?? signal.reports30d ?? row.reports30d) ?? 0
  };
}

export const joinSignals = (rows, signals = []) => {
  const byId = new Map(signals.map((s) => [s.item_id ?? s.itemId, s]));
  return rows.map((row) => toListingItem(row, byId.get(row.id)));
};

export function visibilityOf(item) {
  if (item.hiddenByAdmin || item.removedByAdmin) return "hidden_by_admin";
  if (item.draft) return "draft";
  if (!item.visible) return "hidden_by_me";
  return "showing";
}

export function isStalePrice(item, { now = Date.now(), staleDays = DEFAULT_STALE_DAYS } = {}) {
  const t = time(item.priceConfirmedAt);
  if (t === null) return false;
  return t < new Date(now).getTime() - staleDays * DAY_MS;
}

export function isLowStock(item) {
  return item.trackStock && item.stockCount !== null && item.stockCount > 0 && item.stockCount <= item.lowStockThreshold;
}

export function issuesOf(item, ctx) {
  const out = [];
  if (item.photoCount === 0) out.push("no_photo");
  if (isStalePrice(item, ctx)) out.push("stale_price");
  if (isLowStock(item)) out.push("low_stock");
  if (item.reports30d > 0) out.push("reported");
  if (item.openFlags > 0) out.push("flagged");
  return out;
}

export function healthScore(item, ctx) {
  let score = 0;
  if (item.photoCount > 0) score += 25;
  if (item.description.trim().length >= 30) score += 15;
  if (NO_PRICE.has(item.priceType) || item.price !== null) score += 20;
  if (item.tags.length > 0) score += 10;
  if (!isStalePrice(item, ctx)) score += 15;
  if (item.section) score += 5;
  if (item.openFlags === 0 && item.reports30d === 0) score += 10;
  return score;
}

export function matchesQuery(item, query) {
  const tokens = normalizeText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = normalizeText([item.name, item.tags.join(" "), item.section, item.description].join(" "));
  return tokens.every((t) => hay.includes(t));
}

const inGroup = (selected, value) => selected.length === 0 || selected.includes(value);

export function matchesView(item, view, ctx = {}) {
  const v = { ...DEFAULT_VIEW, ...view };
  if (!matchesQuery(item, v.q)) return false;
  if (v.section && item.section !== v.section) return false;
  if (v.type && item.kind !== v.type) return false;
  if (!inGroup(v.availability, item.availability)) return false;
  if (!inGroup(v.visibility, visibilityOf(item))) return false;
  if (v.issues.length > 0) {
    const own = issuesOf(item, ctx);
    if (!v.issues.some((i) => own.includes(i))) return false;
  }
  if (v.priceMin !== null || v.priceMax !== null) {
    if (item.price === null) return false;
    if (v.priceMin !== null && item.price < v.priceMin) return false;
    if (v.priceMax !== null && item.price > v.priceMax) return false;
  }
  if (v.onSale && !(item.salePrice !== null && item.price !== null && item.salePrice < item.price)) return false;
  if (v.badge && item.badge !== v.badge) return false;
  if (v.hasVideo && !item.hasVideo) return false;
  if (v.hasVariants && item.variantCount === 0) return false;
  if (v.withStock && item.stockCount === null) return false;
  if (v.updated) {
    const t = time(item.updatedAt);
    const days = Number(v.updated);
    if (t === null || t < new Date(ctx.now ?? Date.now()).getTime() - days * DAY_MS) return false;
  }
  return true;
}

export const filterItems = (items, view, ctx) => items.filter((item) => matchesView(item, view, ctx));

const manual = (a, b) => a.sort - b.sort || (time(a.createdAt) ?? 0) - (time(b.createdAt) ?? 0) || (a.id < b.id ? -1 : 1);

const AVAILABILITY_RANK = Object.fromEntries(["available", "limited_stock", "seasonal", "by_appointment", "coming_soon", "out_of_stock", "unavailable"].map((k, i) => [k, i]));

const nullsLast = (get, dir) => (a, b) => {
  const x = get(a);
  const y = get(b);
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return dir * (x - y);
};

const byName = (a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" });

export function sortItems(items, sort = "manual", ctx = {}) {
  const compare = {
    manual,
    name_asc: byName,
    name_desc: (a, b) => byName(b, a),
    price_asc: nullsLast((i) => i.price, 1),
    price_desc: nullsLast((i) => i.price, -1),
    newest: (a, b) => (time(b.createdAt) ?? 0) - (time(a.createdAt) ?? 0),
    updated: (a, b) => (time(b.updatedAt) ?? 0) - (time(a.updatedAt) ?? 0),
    available_first: (a, b) => AVAILABILITY_RANK[a.availability] - AVAILABILITY_RANK[b.availability],
    out_of_stock_first: (a, b) => AVAILABILITY_RANK[b.availability] - AVAILABILITY_RANK[a.availability],
    stock_low: nullsLast((i) => i.stockCount, 1),
    health_low: (a, b) => healthScore(a, ctx) - healthScore(b, ctx),
    most_reported: (a, b) => b.reports30d - a.reports30d || b.openFlags - a.openFlags,
    stale_first: nullsLast((i) => time(i.priceConfirmedAt), 1)
  }[sort] ?? manual;
  return [...items].sort((a, b) => compare(a, b) || manual(a, b));
}

export const selectItems = (items, view, ctx) => sortItems(filterItems(items, view, ctx), view?.sort ?? "manual", ctx);

export const TRACKER = [
  { key: "total", label: "Total", view: {} },
  { key: "available", label: "Available", view: { availability: ["available"] } },
  { key: "limited_stock", label: "Limited stock", view: { availability: ["limited_stock"] } },
  { key: "out_of_stock", label: "Out of stock", view: { availability: ["out_of_stock"] } },
  { key: "seasonal", label: "Seasonal", view: { availability: ["seasonal"] } },
  { key: "by_appointment", label: "By appointment", view: { availability: ["by_appointment"] } },
  { key: "coming_soon", label: "Coming soon", view: { availability: ["coming_soon"] } },
  { key: "hidden_by_me", label: "Hidden by me", view: { visibility: ["hidden_by_me"] } },
  { key: "hidden_by_admin", label: "Hidden by admin", view: { visibility: ["hidden_by_admin"] } },
  { key: "drafts", label: "Drafts", view: { visibility: ["draft"] } },
  { key: "no_photo", label: "No photo", view: { issues: ["no_photo"] } },
  { key: "stale_prices", label: "Stale prices", view: { issues: ["stale_price"] } },
  { key: "low_stock", label: "Low stock", view: { issues: ["low_stock"] } },
  { key: "reported", label: "Reported", view: { issues: ["reported"] } },
  { key: "flagged", label: "Flagged", view: { issues: ["flagged"] } }
];

export const trackerView = (key) => ({ ...DEFAULT_VIEW, ...(TRACKER.find((t) => t.key === key)?.view ?? {}) });

export const trackerKeyOf = (view) => {
  const v = { ...DEFAULT_VIEW, ...view };
  const rest = { ...v, availability: [], visibility: [], issues: [], sort: "manual" };
  const plain = JSON.stringify(rest) === JSON.stringify({ ...DEFAULT_VIEW });
  if (!plain) return null;
  const total = v.availability.length + v.visibility.length + v.issues.length;
  if (total === 0) return "total";
  if (total !== 1) return null;
  return TRACKER.find((t) => {
    const w = { ...DEFAULT_VIEW, ...t.view };
    return JSON.stringify([w.availability, w.visibility, w.issues]) === JSON.stringify([v.availability, v.visibility, v.issues]);
  })?.key ?? null;
};

export function trackerCounts(items, ctx) {
  return Object.fromEntries(TRACKER.map((t) => [t.key, filterItems(items, { ...DEFAULT_VIEW, ...t.view }, ctx).length]));
}

export function statsToTracker(stats) {
  const s = stats ?? {};
  return {
    total: s.total ?? 0,
    available: s.available ?? 0,
    limited_stock: s.limited_stock ?? 0,
    out_of_stock: s.out_of_stock ?? 0,
    seasonal: s.seasonal ?? 0,
    by_appointment: s.by_appointment ?? 0,
    coming_soon: s.coming_soon ?? 0,
    hidden_by_me: s.hidden_by_me ?? 0,
    hidden_by_admin: s.hidden_by_admin ?? 0,
    drafts: s.drafts ?? 0,
    no_photo: s.without_photo ?? 0,
    stale_prices: s.stale_prices ?? 0,
    low_stock: s.low_stock ?? 0,
    reported: s.reported ?? 0,
    flagged: s.flagged ?? 0
  };
}

export function showingSummary(items, { shopLive = true } = {}) {
  const reasons = { hiddenByMe: 0, hiddenByAdmin: 0, draft: 0, shopNotLive: 0 };
  let showing = 0;
  for (const item of items) {
    const v = visibilityOf(item);
    if (v === "hidden_by_me") reasons.hiddenByMe += 1;
    else if (v === "hidden_by_admin") reasons.hiddenByAdmin += 1;
    else if (v === "draft") reasons.draft += 1;
    else if (!shopLive) reasons.shopNotLive += 1;
    else showing += 1;
  }
  return { total: items.length, showing, reasons };
}

export function summaryText(summary) {
  const { total, showing, reasons } = summary;
  const head = `${showing} of ${total} ${total === 1 ? "item is" : "items are"} showing to customers`;
  const why = [
    reasons.hiddenByMe && `${reasons.hiddenByMe} hidden by you`,
    reasons.hiddenByAdmin && `${reasons.hiddenByAdmin} hidden by admin`,
    reasons.draft && `${reasons.draft} ${reasons.draft === 1 ? "draft" : "drafts"}`,
    reasons.shopNotLive && `${reasons.shopNotLive} not showing because your shop is not live`
  ].filter(Boolean);
  return why.length ? `${head}. ${why.join(", ")}.` : `${head}.`;
}

const list = (value, allowed) =>
  String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s, i, all) => allowed.includes(s) && all.indexOf(s) === i);

const price = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

export function readCatalogView(params) {
  const get = (k) => params.get(k) ?? "";
  const sort = get("sort");
  let priceMin = price(get("pmin"));
  let priceMax = price(get("pmax"));
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) [priceMin, priceMax] = [priceMax, priceMin];
  return {
    q: get("q").slice(0, 80),
    section: get("section").slice(0, 80),
    type: get("type").slice(0, 30),
    availability: list(get("av"), LISTING_AVAILABILITY),
    visibility: list(get("vis"), VISIBILITY),
    issues: list(get("iss"), ISSUES),
    priceMin,
    priceMax,
    onSale: get("sale") === "1",
    badge: get("badge").slice(0, 30),
    hasVideo: get("video") === "1",
    hasVariants: get("var") === "1",
    withStock: get("stock") === "1",
    updated: UPDATED_WINDOWS.includes(get("upd")) ? get("upd") : "",
    sort: CATALOG_SORTS.some((s) => s.value === sort) ? sort : "manual"
  };
}

export function writeCatalogView(view, base = new URLSearchParams()) {
  const v = { ...DEFAULT_VIEW, ...view };
  const next = new URLSearchParams(base);
  for (const k of ["q", "section", "type", "av", "vis", "iss", "pmin", "pmax", "sale", "badge", "video", "var", "stock", "upd", "sort"]) next.delete(k);
  const put = (k, val) => val && next.set(k, String(val));
  put("q", v.q.trim());
  put("section", v.section);
  put("type", v.type);
  put("av", v.availability.join(","));
  put("vis", v.visibility.join(","));
  put("iss", v.issues.join(","));
  put("pmin", v.priceMin !== null ? v.priceMin : "");
  put("pmax", v.priceMax !== null ? v.priceMax : "");
  put("sale", v.onSale ? "1" : "");
  put("badge", v.badge);
  put("video", v.hasVideo ? "1" : "");
  put("var", v.hasVariants ? "1" : "");
  put("stock", v.withStock ? "1" : "");
  put("upd", v.updated);
  put("sort", v.sort === "manual" ? "" : v.sort);
  return next;
}

export const sameView = (a, b) => JSON.stringify({ ...DEFAULT_VIEW, ...a }) === JSON.stringify({ ...DEFAULT_VIEW, ...b });

export function activeChips(view) {
  const v = { ...DEFAULT_VIEW, ...view };
  const chips = [];
  if (v.q.trim()) chips.push({ key: "q", label: `Search: ${v.q.trim()}` });
  if (v.section) chips.push({ key: "section", label: `Section: ${v.section}` });
  if (v.type) chips.push({ key: "type", label: `Type: ${v.type}` });
  for (const a of v.availability) chips.push({ key: "availability", value: a, label: AVAILABILITY_LABELS[a] });
  for (const x of v.visibility) chips.push({ key: "visibility", value: x, label: VISIBILITY_LABELS[x] });
  for (const i of v.issues) chips.push({ key: "issues", value: i, label: ISSUE_LABELS[i] });
  if (v.priceMin !== null || v.priceMax !== null) {
    const label = v.priceMin !== null && v.priceMax !== null ? `KSh ${v.priceMin} to ${v.priceMax}` : v.priceMin !== null ? `From KSh ${v.priceMin}` : `Up to KSh ${v.priceMax}`;
    chips.push({ key: "price", label });
  }
  if (v.onSale) chips.push({ key: "onSale", label: "On sale" });
  if (v.badge) chips.push({ key: "badge", label: `Badge: ${v.badge}` });
  if (v.hasVideo) chips.push({ key: "hasVideo", label: "Has video" });
  if (v.hasVariants) chips.push({ key: "hasVariants", label: "Has variants" });
  if (v.withStock) chips.push({ key: "withStock", label: "With stock count" });
  if (v.updated) chips.push({ key: "updated", label: `Updated in ${v.updated} days` });
  return chips;
}

export function removeChip(view, chip) {
  const v = { ...DEFAULT_VIEW, ...view };
  switch (chip.key) {
    case "price":
      return { ...v, priceMin: null, priceMax: null };
    case "availability":
    case "visibility":
    case "issues":
      return { ...v, [chip.key]: v[chip.key].filter((x) => x !== chip.value) };
    case "q":
    case "section":
    case "type":
    case "badge":
    case "updated":
      return { ...v, [chip.key]: "" };
    default:
      return { ...v, [chip.key]: false };
  }
}

export const clearFilters = (view) => ({ ...DEFAULT_VIEW, sort: { ...DEFAULT_VIEW, ...view }.sort });

const VIEW_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} \-_&'.,()/]*$/u;

export function validateViewName(name, existing = [], ignoreId = null) {
  const value = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!value) return { ok: false, error: "Enter a name for this view." };
  if (value.length > VIEW_NAME_MAX) return { ok: false, error: `Use ${VIEW_NAME_MAX} characters or fewer.` };
  if (!VIEW_NAME_RE.test(value)) return { ok: false, error: "Use letters, numbers, spaces and - _ & ' . , ( ) / only." };
  if (existing.some((v) => v.id !== ignoreId && v.name.toLowerCase() === value.toLowerCase())) return { ok: false, error: "You already have a view with that name." };
  return { ok: true, name: value };
}

export function sanitizeSavedViews(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const v of input) {
    if (out.length >= MAX_SAVED_VIEWS) break;
    if (!v || typeof v.id !== "string" || typeof v.params !== "string" || v.params.length > 600) continue;
    const check = validateViewName(v.name, out);
    if (!check.ok) continue;
    out.push({ id: v.id.slice(0, 40), name: check.name, params: v.params });
  }
  return out;
}

export function addSavedView(views, name, params, id = `v${Date.now().toString(36)}`) {
  if (views.length >= MAX_SAVED_VIEWS) return { ok: false, error: `You can save up to ${MAX_SAVED_VIEWS} views.` };
  const check = validateViewName(name, views);
  if (!check.ok) return check;
  return { ok: true, views: [...views, { id, name: check.name, params: String(params) }] };
}

export const removeSavedView = (views, id) => views.filter((v) => v.id !== id);

export const viewFromParams = (params) => readCatalogView(new URLSearchParams(params));
