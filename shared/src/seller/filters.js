export const DAY_MS = 86400000;
export const DEFAULT_STALE_DAYS = 90;

export const AVAILABILITY_OPTIONS = [
  { key: "available", label: "Available" },
  { key: "limited_stock", label: "Limited stock" },
  { key: "out_of_stock", label: "Out of stock" },
  { key: "unavailable", label: "Unavailable" },
  { key: "by_appointment", label: "By appointment" },
  { key: "seasonal", label: "Seasonal" },
  { key: "coming_soon", label: "Coming soon" },
];

export const DB_AVAILABILITY = ["available", "limited_stock", "out_of_stock", "unavailable", "by_appointment"];

export const VISIBILITY_OPTIONS = [
  { key: "showing", label: "Showing" },
  { key: "hidden_me", label: "Hidden by me" },
  { key: "hidden_admin", label: "Hidden by admin" },
  { key: "draft", label: "Draft" },
];

export const ISSUE_OPTIONS = [
  { key: "no_photo", label: "No photo" },
  { key: "stale_price", label: "Stale price" },
  { key: "low_stock", label: "Low stock" },
  { key: "reported", label: "Reported" },
  { key: "flagged", label: "Flagged" },
];

export const PRICE_TYPE_OPTIONS = [
  { key: "fixed", label: "Fixed" },
  { key: "from", label: "From" },
  { key: "range", label: "Range" },
  { key: "free", label: "Free" },
  { key: "contact", label: "Contact for price" },
];

export const BADGE_OPTIONS = [
  { key: "new", label: "New" },
  { key: "popular", label: "Popular" },
  { key: "bestseller", label: "Best seller" },
  { key: "limited", label: "Limited" },
];

export const SORT_OPTIONS = [
  { key: "manual", label: "Manual order" },
  { key: "name_asc", label: "Name A to Z" },
  { key: "name_desc", label: "Name Z to A" },
  { key: "price_asc", label: "Price low to high" },
  { key: "price_desc", label: "Price high to low" },
  { key: "newest", label: "Newest" },
  { key: "updated", label: "Recently updated" },
  { key: "avail_first", label: "Available first" },
  { key: "avail_out_first", label: "Out of stock first" },
  { key: "stock_asc", label: "Stock count, lowest first" },
  { key: "health_asc", label: "Item health, lowest first" },
  { key: "reported_desc", label: "Most reported" },
  { key: "stale_first", label: "Stale prices first" },
];

export const TRACKER = [
  { key: "total", label: "Total" },
  { key: "available", label: "Available" },
  { key: "limited_stock", label: "Limited stock" },
  { key: "out_of_stock", label: "Out of stock" },
  { key: "seasonal", label: "Seasonal" },
  { key: "by_appointment", label: "By appointment" },
  { key: "coming_soon", label: "Coming soon" },
  { key: "hidden_me", label: "Hidden by me" },
  { key: "hidden_admin", label: "Hidden by admin" },
  { key: "draft", label: "Drafts" },
  { key: "no_photo", label: "No photo" },
  { key: "stale_price", label: "Stale prices" },
  { key: "low_stock", label: "Low stock" },
  { key: "reported", label: "Reported" },
  { key: "flagged", label: "Flagged" },
];

const TRACKER_FILTER = {
  total: {},
  available: { avail: ["available"] },
  limited_stock: { avail: ["limited_stock"] },
  out_of_stock: { avail: ["out_of_stock"] },
  seasonal: { avail: ["seasonal"] },
  by_appointment: { avail: ["by_appointment"] },
  coming_soon: { avail: ["coming_soon"] },
  hidden_me: { vis: ["hidden_me"] },
  hidden_admin: { vis: ["hidden_admin"] },
  draft: { vis: ["draft"] },
  no_photo: { issues: ["no_photo"] },
  stale_price: { issues: ["stale_price"] },
  low_stock: { issues: ["low_stock"] },
  reported: { issues: ["reported"] },
  flagged: { issues: ["flagged"] },
};

export const DEFAULT_QUERY = Object.freeze({
  q: "",
  section: "",
  ptype: [],
  avail: [],
  vis: [],
  issues: [],
  min: null,
  max: null,
  sale: false,
  badge: "",
  video: false,
  variants: false,
  stock: false,
  updated: "",
  sort: "manual",
});

const keys = (list) => list.map((o) => o.key);
const labelOf = (list, key) => list.find((o) => o.key === key)?.label ?? key;

export const trackerFilter = (key) => ({ ...DEFAULT_QUERY, ...(TRACKER_FILTER[key] ?? {}), sort: "manual" });

export const isNumber = (v) => typeof v === "number" && Number.isFinite(v);

export const visibilityOf = (item) => {
  if (item.removedByAdmin || item.hiddenByAdmin) return "hidden_admin";
  if (item.draft) return "draft";
  if (!item.visible) return "hidden_me";
  return "showing";
};

export const pricedType = (item) => ["fixed", "from", "range"].includes(item.priceType) && isNumber(item.price);

export const isStalePrice = (item, now, staleDays = DEFAULT_STALE_DAYS) => {
  if (!pricedType(item) || !item.priceConfirmedAt) return false;
  return now - Date.parse(item.priceConfirmedAt) > staleDays * DAY_MS;
};

export const isLowStock = (item) =>
  Boolean(item.trackStock) && isNumber(item.stockCount) && item.stockCount > 0 && item.stockCount <= (item.lowStockThreshold ?? 0);

export const hasSeason = (item) => item.season !== null && item.season !== undefined;

export const isComingSoon = (item, now) => Boolean(item.availableFrom) && Date.parse(item.availableFrom) > now;

export const onSale = (item) => isNumber(item.salePrice) && isNumber(item.price) && item.salePrice < item.price;

export const availabilityKeys = (item, now) => {
  const set = new Set([item.availability]);
  if (hasSeason(item)) set.add("seasonal");
  if (isComingSoon(item, now)) set.add("coming_soon");
  return set;
};

export const healthScore = (item, now, staleDays = DEFAULT_STALE_DAYS) => {
  let score = 0;
  if ((item.imageCount ?? 0) > 0) score += 25;
  if ((item.description ?? "").trim().length >= 30) score += 20;
  if (isNumber(item.price) || item.priceType === "free" || item.priceType === "contact") score += 15;
  if ((item.section ?? "").trim()) score += 10;
  if ((item.tags ?? []).length > 0) score += 10;
  if (!isStalePrice(item, now, staleDays)) score += 10;
  if ((item.imageCount ?? 0) > 1 || item.hasVideo) score += 10;
  return score;
};

export const enrichItems = (items, signals = [], { now = Date.now(), staleDays = DEFAULT_STALE_DAYS } = {}) => {
  const bySignal = new Map(signals.map((s) => [s.itemId, s]));
  return items.map((item) => {
    const sig = bySignal.get(item.id);
    const openFlags = sig?.openFlags ?? 0;
    const reports = sig?.reports30d ?? 0;
    const flags = {
      noPhoto: (item.imageCount ?? 0) === 0,
      stalePrice: isStalePrice(item, now, staleDays),
      lowStock: isLowStock(item),
      reported: reports > 0,
      flagged: openFlags > 0,
    };
    const text = [item.name, (item.tags ?? []).join(" "), item.section ?? "", item.description ?? ""].join("\n").toLowerCase();
    return {
      ...item,
      visibility: visibilityOf(item),
      removed: Boolean(item.removedByAdmin),
      openFlags,
      reports,
      flags,
      availKeys: availabilityKeys(item, now),
      health: healthScore(item, now, staleDays),
      searchText: text,
    };
  });
};

const ISSUE_TEST = {
  no_photo: (i) => i.flags.noPhoto,
  stale_price: (i) => i.flags.stalePrice,
  low_stock: (i) => i.flags.lowStock,
  reported: (i) => i.flags.reported,
  flagged: (i) => i.flags.flagged,
};

export const matchesSearch = (item, q) => {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => item.searchText.includes(t));
};

export const applyFilters = (items, query, now = Date.now()) => {
  const f = { ...DEFAULT_QUERY, ...query };
  return items.filter((i) => {
    if (f.q && !matchesSearch(i, f.q)) return false;
    if (f.section && (i.section ?? "") !== f.section) return false;
    if (f.ptype.length && !f.ptype.includes(i.priceType)) return false;
    if (f.avail.length && !f.avail.some((a) => i.availKeys.has(a))) return false;
    if (f.vis.length && !f.vis.includes(i.visibility)) return false;
    if (f.issues.length && !f.issues.some((k) => ISSUE_TEST[k]?.(i))) return false;
    if (f.min !== null && !(isNumber(i.price) && i.price >= f.min)) return false;
    if (f.max !== null && !(isNumber(i.price) && i.price <= f.max)) return false;
    if (f.sale && !onSale(i)) return false;
    if (f.badge && i.badge !== f.badge) return false;
    if (f.video && !i.hasVideo) return false;
    if (f.variants && !((i.variants ?? []).length > 0)) return false;
    if (f.stock && !isNumber(i.stockCount)) return false;
    if (f.updated && !(now - Date.parse(i.updatedAt) <= Number(f.updated) * DAY_MS)) return false;
    return true;
  });
};

const text = (a, b) => a.localeCompare(b, "en", { sensitivity: "base" });
const AVAIL_RANK = { available: 0, limited_stock: 1, by_appointment: 2, out_of_stock: 3, unavailable: 4 };
const nullsLast = (a, b, dir) => {
  const an = !isNumber(a);
  const bn = !isNumber(b);
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  return dir * (a - b);
};
const manual = (a, b) => a.sort - b.sort || Date.parse(a.createdAt) - Date.parse(b.createdAt) || text(a.id, b.id);

const COMPARE = {
  manual,
  name_asc: (a, b) => text(a.name, b.name),
  name_desc: (a, b) => text(b.name, a.name),
  price_asc: (a, b) => nullsLast(a.price, b.price, 1),
  price_desc: (a, b) => nullsLast(a.price, b.price, -1),
  newest: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  updated: (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  avail_first: (a, b) => (AVAIL_RANK[a.availability] ?? 9) - (AVAIL_RANK[b.availability] ?? 9),
  avail_out_first: (a, b) => (AVAIL_RANK[b.availability] ?? 9) - (AVAIL_RANK[a.availability] ?? 9),
  stock_asc: (a, b) => nullsLast(a.stockCount, b.stockCount, 1),
  health_asc: (a, b) => a.health - b.health,
  reported_desc: (a, b) => b.reports + b.openFlags - (a.reports + a.openFlags),
  stale_first: (a, b) => Number(b.flags.stalePrice) - Number(a.flags.stalePrice) || Date.parse(a.priceConfirmedAt ?? 0) - Date.parse(b.priceConfirmedAt ?? 0),
};

export const applySort = (items, sort = "manual") => {
  const cmp = COMPARE[sort] ?? manual;
  return [...items].sort((a, b) => cmp(a, b) || manual(a, b));
};

export const runCatalogQuery = (items, query, now = Date.now()) => applySort(applyFilters(items, query, now), query.sort ?? "manual");

export const computeStats = (items) => {
  const count = (fn) => items.filter(fn).length;
  return {
    total: items.length,
    available: count((i) => i.availability === "available"),
    limited_stock: count((i) => i.availability === "limited_stock"),
    out_of_stock: count((i) => i.availability === "out_of_stock"),
    seasonal: count((i) => i.availKeys.has("seasonal")),
    by_appointment: count((i) => i.availability === "by_appointment"),
    coming_soon: count((i) => i.availKeys.has("coming_soon")),
    hidden_me: count((i) => i.visibility === "hidden_me"),
    hidden_admin: count((i) => i.visibility === "hidden_admin"),
    draft: count((i) => i.visibility === "draft"),
    no_photo: count((i) => i.flags.noPhoto),
    stale_price: count((i) => i.flags.stalePrice),
    low_stock: count((i) => i.flags.lowStock),
    reported: count((i) => i.flags.reported),
    flagged: count((i) => i.flags.flagged),
  };
};

export const statsFromRpc = (s = {}) => ({
  total: s.total ?? 0,
  available: s.available ?? 0,
  limited_stock: s.limited_stock ?? 0,
  out_of_stock: s.out_of_stock ?? 0,
  seasonal: s.seasonal ?? 0,
  by_appointment: s.by_appointment ?? 0,
  coming_soon: s.coming_soon ?? 0,
  hidden_me: s.hidden_by_me ?? 0,
  hidden_admin: s.hidden_by_admin ?? 0,
  draft: s.drafts ?? 0,
  no_photo: s.without_photo ?? 0,
  stale_price: s.stale_prices ?? 0,
  low_stock: s.low_stock ?? 0,
  reported: s.reported ?? 0,
  flagged: s.flagged ?? 0,
});

export const showingSummary = (items, { shopLive = true } = {}) => {
  const total = items.length;
  const hiddenByMe = items.filter((i) => i.visibility === "hidden_me").length;
  const hiddenByAdmin = items.filter((i) => i.visibility === "hidden_admin").length;
  const drafts = items.filter((i) => i.visibility === "draft").length;
  const eligible = items.filter((i) => i.visibility === "showing").length;
  const showing = shopLive ? eligible : 0;
  const reasons = [];
  if (!shopLive && eligible > 0) reasons.push({ key: "shop_not_live", count: eligible, label: `${eligible} not showing because your shop is not live` });
  if (hiddenByMe) reasons.push({ key: "hidden_me", count: hiddenByMe, label: `${hiddenByMe} hidden by you` });
  if (hiddenByAdmin) reasons.push({ key: "hidden_admin", count: hiddenByAdmin, label: `${hiddenByAdmin} hidden by admin` });
  if (drafts) reasons.push({ key: "draft", count: drafts, label: `${drafts} ${drafts === 1 ? "draft" : "drafts"}` });
  return { showing, total, reasons, text: `${showing} of ${total} ${total === 1 ? "item is" : "items are"} showing to customers` };
};

const list = (value, allowed) => {
  if (!value) return [];
  const out = [];
  for (const part of value.split(",")) {
    if (allowed.includes(part) && !out.includes(part)) out.push(part);
  }
  return out;
};

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export const parseCatalogQuery = (search) => {
  const p = search instanceof URLSearchParams ? search : new URLSearchParams(search ?? "");
  const sort = p.get("sort");
  const updated = p.get("updated");
  const badge = p.get("badge");
  return {
    q: (p.get("q") ?? "").slice(0, 100),
    section: (p.get("section") ?? "").slice(0, 60),
    ptype: list(p.get("ptype"), keys(PRICE_TYPE_OPTIONS)),
    avail: list(p.get("avail"), keys(AVAILABILITY_OPTIONS)),
    vis: list(p.get("vis"), keys(VISIBILITY_OPTIONS)),
    issues: list(p.get("issues"), keys(ISSUE_OPTIONS)),
    min: num(p.get("min")),
    max: num(p.get("max")),
    sale: p.get("sale") === "1",
    badge: keys(BADGE_OPTIONS).includes(badge) ? badge : "",
    video: p.get("video") === "1",
    variants: p.get("variants") === "1",
    stock: p.get("stock") === "1",
    updated: updated === "7" || updated === "30" ? updated : "",
    sort: keys(SORT_OPTIONS).includes(sort) ? sort : "manual",
  };
};

export const buildCatalogQuery = (query) => {
  const f = { ...DEFAULT_QUERY, ...query };
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.section) p.set("section", f.section);
  if (f.ptype.length) p.set("ptype", f.ptype.join(","));
  if (f.avail.length) p.set("avail", f.avail.join(","));
  if (f.vis.length) p.set("vis", f.vis.join(","));
  if (f.issues.length) p.set("issues", f.issues.join(","));
  if (f.min !== null) p.set("min", String(f.min));
  if (f.max !== null) p.set("max", String(f.max));
  if (f.sale) p.set("sale", "1");
  if (f.badge) p.set("badge", f.badge);
  if (f.video) p.set("video", "1");
  if (f.variants) p.set("variants", "1");
  if (f.stock) p.set("stock", "1");
  if (f.updated) p.set("updated", f.updated);
  if (f.sort !== "manual") p.set("sort", f.sort);
  return p.toString();
};

export const filterCount = (query) => {
  const f = { ...DEFAULT_QUERY, ...query };
  return (
    (f.section ? 1 : 0) + f.ptype.length + f.avail.length + f.vis.length + f.issues.length +
    (f.min !== null || f.max !== null ? 1 : 0) + (f.sale ? 1 : 0) + (f.badge ? 1 : 0) + (f.video ? 1 : 0) +
    (f.variants ? 1 : 0) + (f.stock ? 1 : 0) + (f.updated ? 1 : 0)
  );
};

export const hasActiveFilters = (query) => filterCount(query) > 0 || Boolean((query.q ?? "").trim());

export const clearFilters = (query) => ({ ...DEFAULT_QUERY, sort: query?.sort ?? "manual" });

export const activeChips = (query) => {
  const f = { ...DEFAULT_QUERY, ...query };
  const chips = [];
  if (f.q) chips.push({ id: "q", label: `Search: ${f.q}`, patch: { q: "" } });
  if (f.section) chips.push({ id: "section", label: `Section: ${f.section}`, patch: { section: "" } });
  for (const k of f.ptype) chips.push({ id: `ptype:${k}`, label: `Price: ${labelOf(PRICE_TYPE_OPTIONS, k)}`, patch: { ptype: f.ptype.filter((x) => x !== k) } });
  for (const k of f.avail) chips.push({ id: `avail:${k}`, label: labelOf(AVAILABILITY_OPTIONS, k), patch: { avail: f.avail.filter((x) => x !== k) } });
  for (const k of f.vis) chips.push({ id: `vis:${k}`, label: labelOf(VISIBILITY_OPTIONS, k), patch: { vis: f.vis.filter((x) => x !== k) } });
  for (const k of f.issues) chips.push({ id: `issues:${k}`, label: labelOf(ISSUE_OPTIONS, k), patch: { issues: f.issues.filter((x) => x !== k) } });
  if (f.min !== null || f.max !== null) {
    const label = f.min !== null && f.max !== null ? `KES ${f.min} to ${f.max}` : f.min !== null ? `KES ${f.min} and up` : `KES ${f.max} and under`;
    chips.push({ id: "price", label, patch: { min: null, max: null } });
  }
  if (f.sale) chips.push({ id: "sale", label: "On sale", patch: { sale: false } });
  if (f.badge) chips.push({ id: "badge", label: `Badge: ${labelOf(BADGE_OPTIONS, f.badge)}`, patch: { badge: "" } });
  if (f.video) chips.push({ id: "video", label: "Has video", patch: { video: false } });
  if (f.variants) chips.push({ id: "variants", label: "Has variants", patch: { variants: false } });
  if (f.stock) chips.push({ id: "stock", label: "With stock count", patch: { stock: false } });
  if (f.updated) chips.push({ id: "updated", label: `Updated in ${f.updated} days`, patch: { updated: "" } });
  return chips;
};

export const sectionsOf = (items) => [...new Set(items.map((i) => i.section).filter(Boolean))].sort(text);
export const priceBounds = (items) => {
  const prices = items.map((i) => i.price).filter(isNumber);
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : { min: 0, max: 0 };
};

export const optionLabel = (list, key) => labelOf(list, key);
