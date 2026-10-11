import { LISTING_AVAILABILITY, previewPriceChange } from "@epicmkt/shared";
import { ApiError } from "./errors.js";

const DAY = 86_400_000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

const NAMES = [
  ["Fade Cut", "Cuts", 600], ["Kids Cut", "Cuts", 350], ["Beard Trim", "Beards", 300], ["Hot Towel Shave", "Beards", 400],
  ["Hair Dye", "Colour", 1000], ["Wash and Style", "Cuts", 250], ["Scalp Treatment", "Care", 800], ["Edge Up", "Cuts", 200],
  ["Wedding Package", "Packages", 4500], ["Pomade Jar", "Products", 700], ["Beard Oil", "Products", 900], ["Shampoo 500ml", "Products", 550],
  ["Hair Cream", "Products", 450], ["Clipper Guard Set", "Products", 1200], ["Razor Pack", "Products", 150], ["Gift Voucher", "Packages", 2000],
  ["Express Trim", "Cuts", 180], ["Dreadlock Retwist", "Care", 1500], ["Braid Wash", "Care", 650], ["Face Mask", "Care", 500]
];

const art = (i) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="hsl(${(i * 47) % 360} 45% 62%)"/></svg>`)}`;

const AVAIL = ["available", "available", "available", "limited_stock", "available", "out_of_stock", "seasonal", "by_appointment", "coming_soon", "available"];

const base = (sellerId, i) => {
  const [name, section, price] = NAMES[i % NAMES.length];
  const round = Math.floor(i / NAMES.length);
  return {
    id: `${sellerId}-i${String(i + 1).padStart(3, "0")}`,
    name: round ? `${name} ${round + 1}` : name,
    description: `${name} done properly by our team, with care and attention to detail.`,
    section,
    kind: section === "Products" ? "product" : "service",
    availability: "available",
    visible: true,
    draft: false,
    hidden_by_admin: false,
    removed_by_admin: false,
    admin_hide_reason: null,
    price_type: "fixed",
    price: price + round * 50,
    price_max: null,
    sale_price: null,
    unit: null,
    badge: null,
    search_tags: [name.split(" ")[0].toLowerCase()],
    variants: [],
    track_stock: false,
    stock_count: null,
    low_stock_threshold: 3,
    show_stock_count: false,
    price_confirmed_at: ago(10),
    updated_at: ago(i % 40),
    created_at: ago(300 - i),
    sort: i + 1,
    item_media: [{ kind: "image", path: `p${i}` }],
    imageUrl: art(i)
  };
};

const withoutPhoto = (item) => ({ ...item, item_media: [], imageUrl: null });

const PROFILES = {
  ES100001: (item, i) => {
    let out = item;
    if (i === 1) out = { ...out, visible: false };
    if (i === 2 || i === 3) out = { ...out, availability: "out_of_stock" };
    if (i === 4) out = { ...out, availability: "limited_stock" };
    if (i >= 5 && i <= 7) out = withoutPhoto(out);
    if (i >= 8 && i <= 11) out = { ...out, price_confirmed_at: ago(120) };
    return out;
  },
  ES100002: (item, i) => {
    let out = item;
    if (i >= 3 && i <= 5) out = { ...out, availability: "limited_stock" };
    if (i === 8) out = { ...out, sale_price: Math.floor(out.price * 0.8) };
    return out;
  },
  ES100005: (item, i) => {
    let out = { ...item, availability: AVAIL[i % AVAIL.length] };
    if (i % 11 === 5) out = { ...out, visible: false };
    if (i % 17 === 9) out = { ...out, visible: false, draft: true };
    if (i % 23 === 7) out = { ...out, hidden_by_admin: true, admin_hide_reason: "Price looked misleading. Contact support to appeal." };
    if (i % 19 === 4) out = { ...out, price_type: "from" };
    if (i % 29 === 6) out = { ...out, price_type: "free", price: null };
    if (i % 9 === 2 && out.price !== null) out = { ...out, sale_price: Math.floor(out.price * 0.8) };
    if (i % 13 === 1) out = { ...out, badge: "Popular" };
    if (i % 10 === 4) out = { ...out, variants: [{ label: "Small" }, { label: "Large" }] };
    if (i % 6 === 1) out = { ...out, track_stock: true, stock_count: i % 12 === 1 ? 2 : 20 };
    if (i % 8 === 2) out = withoutPhoto(out);
    if (i % 15 === 3) out = { ...out, item_media: [...out.item_media, { kind: "video", path: `v${i}` }] };
    if (i % 7 === 3) out = { ...out, price_confirmed_at: ago(120) };
    return out;
  }
};

export function seedItems(sellerId, count) {
  const shape = PROFILES[sellerId] ?? ((item) => item);
  return Array.from({ length: count }, (_, i) => shape(base(sellerId, i), i));
}

export function seedSignals(sellerId, items) {
  if (sellerId === "ES100002") return [{ item_id: items[7]?.id, open_flags: 1, reports_30d: 0 }, { item_id: items[9]?.id, open_flags: 0, reports_30d: 2 }].filter((s) => s.item_id);
  if (sellerId === "ES100005") return items.map((item, i) => ({ item_id: item.id, open_flags: i % 14 === 6 ? 1 : 0, reports_30d: i % 10 === 3 ? 2 : 0 })).filter((s) => s.open_flags || s.reports_30d);
  return [];
}

const lockedByAdmin = (i) => i.hidden_by_admin || i.removed_by_admin;

export function statsFor(items, limit, signals, { staleDays = 90, unread = 0 } = {}) {
  const cut = Date.now() - staleDays * DAY;
  const reported = new Set(signals.filter((s) => s.reports_30d > 0).map((s) => s.item_id));
  const flagged = new Set(signals.filter((s) => s.open_flags > 0).map((s) => s.item_id));
  const n = (fn) => items.filter(fn).length;
  const mine = (i) => !i.visible && !i.draft && !lockedByAdmin(i);
  return {
    total: items.length,
    visible: n((i) => i.visible && !i.draft && !lockedByAdmin(i)),
    hidden: n((i) => !i.visible),
    hidden_by_me: n(mine),
    hidden_by_admin: n(lockedByAdmin),
    drafts: n((i) => i.draft && !lockedByAdmin(i)),
    available: n((i) => i.availability === "available"),
    limited_stock: n((i) => i.availability === "limited_stock"),
    out_of_stock: n((i) => i.availability === "out_of_stock"),
    seasonal: n((i) => i.availability === "seasonal"),
    by_appointment: n((i) => i.availability === "by_appointment"),
    coming_soon: n((i) => i.availability === "coming_soon"),
    unavailable: n((i) => i.availability === "unavailable"),
    without_photo: n((i) => !i.item_media.some((m) => m.kind === "image")),
    stale_prices: n((i) => new Date(i.price_confirmed_at).getTime() < cut),
    low_stock: n((i) => i.track_stock && i.stock_count !== null && i.stock_count > 0 && i.stock_count <= i.low_stock_threshold),
    reported: n((i) => reported.has(i.id)),
    flagged: n((i) => flagged.has(i.id)),
    items_limit: limit,
    open_flags: signals.reduce((a, s) => a + s.open_flags, 0),
    unread_messages: unread
  };
}

const toView = (i) => ({
  id: i.id, name: i.name, price: i.price, priceMax: i.price_max, salePrice: i.sale_price, priceType: i.price_type,
  hiddenByAdmin: i.hidden_by_admin, removedByAdmin: i.removed_by_admin
});

export function bulk(items, action, ids, args = {}) {
  const set = [...new Set(ids ?? [])];
  if (set.length === 0 || set.length > 500) throw new ApiError("invalid_selection");
  if (set.some((id) => !items.some((i) => i.id === id))) throw new ApiError("item_not_found");
  const now = new Date().toISOString();
  const next = items.map((i) => ({ ...i }));
  const pick = next.filter((i) => set.includes(i.id) && !lockedByAdmin(i));
  let changed = 0;
  let rows = [];
  if (action === "hide") pick.forEach((i) => { if (i.visible) { i.visible = false; changed += 1; } });
  else if (action === "show") pick.forEach((i) => { if (!i.visible || i.draft) { i.visible = true; i.draft = false; changed += 1; } });
  else if (action === "confirm_prices") pick.forEach((i) => { i.price_confirmed_at = now; changed += 1; });
  else if (action === "move_section") {
    const section = String(args.section ?? "").replace(/\s+/g, " ").trim() || null;
    if (section && (section.length > 40 || /^[=+@-]/.test(section))) throw new ApiError("invalid_section");
    pick.forEach((i) => { if (i.section !== section) { i.section = section; changed += 1; } });
  } else if (action === "set_availability") {
    if (!LISTING_AVAILABILITY.includes(args.availability)) throw new ApiError("invalid_availability");
    pick.forEach((i) => { if (i.availability !== args.availability) { i.availability = args.availability; changed += 1; } });
  } else if (action === "price_percent") {
    const pct = Number(args.percent);
    if (!(pct > 0 && pct <= 500) || Math.abs(pct * 100 - Math.round(pct * 100)) > 1e-9 || !["raise", "lower"].includes(args.direction)) throw new ApiError("invalid_percent");
    const { rows: plan } = previewPriceChange(pick.map(toView), pct, args.direction);
    for (const r of plan) {
      const i = next.find((x) => x.id === r.id);
      i.price = r.after.price;
      i.price_max = r.after.priceMax;
      i.sale_price = r.after.salePrice;
      i.price_confirmed_at = now;
    }
    rows = plan.map((r) => ({ id: r.id, before: r.before, after: r.after }));
    changed = rows.length;
  } else if (action === "delete") {
    const keep = next.filter((i) => !(set.includes(i.id) && !lockedByAdmin(i)));
    changed = next.length - keep.length;
    return { items: keep, result: { changed, skipped: set.length - changed, rows } };
  } else throw new ApiError("invalid_action");
  if (changed) next.forEach((i) => { if (set.includes(i.id)) i.updated_at = now; });
  return { items: next, result: { changed, skipped: set.length - changed, rows } };
}

export function importRows(items, rows, { plan, limit }) {
  if (plan !== "premium") throw new ApiError("premium_only");
  if (!Array.isArray(rows) || rows.length === 0) throw new ApiError("invalid_rows");
  if (rows.length > 500) throw new ApiError("too_many_rows");
  if (limit !== null && items.length + rows.length > limit) throw new ApiError("limit_reached:items");
  const top = items.reduce((m, i) => Math.max(m, i.sort), 0);
  const now = new Date().toISOString();
  const created = rows.map((r, idx) => {
    const name = String(r.name ?? "").replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 80) throw new ApiError(`invalid_row:${idx + 1}:name`);
    if ([name, r.unit, r.section].some((v) => /^[=+@-]/.test(String(v ?? "")))) throw new ApiError(`invalid_row:${idx + 1}:formula`);
    if (!LISTING_AVAILABILITY.includes(r.availability ?? "available")) throw new ApiError(`invalid_row:${idx + 1}:availability`);
    return {
      id: `imp-${Date.now().toString(36)}-${idx}`, name, description: "", section: r.section ?? null, kind: "product",
      availability: r.availability ?? "available", visible: false, draft: true, hidden_by_admin: false, removed_by_admin: false, admin_hide_reason: null,
      price_type: r.price_type ?? "fixed", price: r.price ?? null, price_max: r.price_max ?? null, sale_price: null, unit: r.unit ?? null,
      badge: null, search_tags: r.search_tags ?? [], variants: [], track_stock: false, stock_count: null, low_stock_threshold: 3, show_stock_count: false,
      price_confirmed_at: now, updated_at: now, created_at: now, sort: top + idx + 1, item_media: [], imageUrl: null
    };
  });
  return { items: [...items, ...created], result: { imported: created.length } };
}

export function duplicate(items, id, limit) {
  const src = items.find((i) => i.id === id);
  if (!src) throw new ApiError("item_not_found");
  if (limit !== null && items.length >= limit) throw new ApiError("limit_reached:items");
  const now = new Date().toISOString();
  const copy = {
    ...src, id: `${id}-copy-${Date.now().toString(36)}`, name: `${src.name} (copy)`.slice(0, 80), visible: false, draft: true,
    hidden_by_admin: false, removed_by_admin: false, admin_hide_reason: null, item_media: [], imageUrl: null,
    created_at: now, updated_at: now, price_confirmed_at: now, sort: items.reduce((m, i) => Math.max(m, i.sort), 0) + 1
  };
  return { items: [...items, copy], result: copy };
}
