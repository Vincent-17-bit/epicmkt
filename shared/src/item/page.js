// The item page sections a seller sets beside the basics (migration 0138). Pure functions, no imports from the app.
//
//   delivery   null = same as the shop (Settings → Delivery). Or { mode: "custom", fee, area, time, notes, pickup } for this item only,
//              or { mode: "none", notes, pickup: true } for pickup only.
//   notices    up to 3 notes buyers must see, shown under "About this item": { tone: info | caution | warning, title, text }.
//   gallery    up to 5 pictures shown above the videos, each { mediaId, label, caption }: a tab label and a line under the picture.
//   brand      "From the brand": { banner: mediaId | null, cards: [{ mediaId, caption }] } (achievements, awards, figures).
//   includes   "What's included" lines are "Name: details" (details optional). The name is always shown bold; a line with a photo must
//              have a name (the editor refuses a photo without one).
//
// The pictures of the gallery, the brand cards and new "What's included" photos are their own kind of upload ("extra"): they never take a
// photo slot of the plan and never show in the photo gallery at the top of the page.

export const PAGE_LIMITS = Object.freeze({
  notices: Object.freeze({ rows: 3, title: 60, text: 300 }),
  gallery: Object.freeze({ rows: 5, label: 30, caption: 140 }),
  brand: Object.freeze({ cards: 8, caption: 80 }),
  delivery: Object.freeze({ feeMax: 100000, area: 120, time: 60, notes: 300 }),
  include: Object.freeze({ name: 80 }),
  extras: 80
});

export const NOTICE_TONES = Object.freeze(["info", "caution", "warning"]);
export const DELIVERY_MODES = Object.freeze(["shop", "custom", "none"]);

const text = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isMediaId = (v) => typeof v === "string" && MEDIA_ID.test(v);

// ---------------------------------------------------------------------------------------------------------------------------------
// Delivery for one item
// ---------------------------------------------------------------------------------------------------------------------------------

const amount = (v, max) => {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return { ok: true, value: null };
  const s = typeof v === "number" ? String(v) : String(v).replace(/[,\s]/g, "").replace(/^kes/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false };
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= max ? { ok: true, value: n } : { ok: false };
};

/**
 * What seller_set_item_page accepts as `delivery`, checked the way the database checks it.
 * input: { mode: "shop" | "custom" | "none", fee, area, time, notes, pickup }. "shop" (or nothing) is stored as null.
 * Returns { ok: true, value } or { ok: false, errors: { field: code } }.
 */
export function checkItemDelivery(input) {
  const f = input && typeof input === "object" ? input : {};
  const mode = f.mode ?? "shop";
  if (!DELIVERY_MODES.includes(mode)) return { ok: false, errors: { mode: "invalid_mode" } };
  if (mode === "shop") return { ok: true, value: null };
  const L = PAGE_LIMITS.delivery;
  const errors = {};
  const words = (key, max) => {
    const raw = f[key];
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "string") { errors[key] = `invalid_${key}`; return null; }
    const t = text(raw);
    if (t.length > max) { errors[key] = `${key}_too_long`; return null; }
    return t || null;
  };
  const notes = words("notes", L.notes);
  if (mode === "none") {
    if (Object.keys(errors).length) return { ok: false, errors };
    return { ok: true, value: { mode: "none", notes, pickup: true } };
  }
  const fee = amount(f.fee, L.feeMax);
  if (!fee.ok) errors.fee = "invalid_fee";
  const area = words("area", L.area);
  const time = words("time", L.time);
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { mode: "custom", fee: fee.value, area, time, notes, pickup: f.pickup === true } };
}

/** The form fields for an item's stored delivery (null = the shop's). */
export const deliveryForm = (stored) => {
  const d = stored && typeof stored === "object" ? stored : null;
  if (!d || !["custom", "none"].includes(d.mode)) return { mode: "shop", fee: "", area: "", time: "", notes: "", pickup: false };
  return {
    mode: d.mode,
    fee: d.fee === null || d.fee === undefined ? "" : String(d.fee),
    area: d.area ?? "",
    time: d.time ?? "",
    notes: d.notes ?? "",
    pickup: d.mode === "none" ? true : d.pickup === true
  };
};

/**
 * What the buyer sees for one item. The item's own setting wins; without one, the shop's (`shopInfo` is deliveryInfo(shop)).
 * A custom setting keeps the shop's radius and minimum order (they describe where and when the shop drives at all).
 * -> { source: "item" | "shop", offers, fee, area, time, notes, pickup, radiusKm, minOrder }
 */
export function itemDeliveryInfo(itemDelivery, shopInfo) {
  const shop = shopInfo && typeof shopInfo === "object" ? shopInfo : { offers: false };
  const d = itemDelivery && typeof itemDelivery === "object" && ["custom", "none"].includes(itemDelivery.mode) ? itemDelivery : null;
  if (!d) return { source: "shop", time: null, pickup: false, ...shop };
  const L = PAGE_LIMITS.delivery;
  const clip = (v, max) => (text(v).slice(0, max) || null);
  if (d.mode === "none") {
    return { source: "item", offers: false, fee: null, area: null, time: null, notes: clip(d.notes, L.notes), pickup: true, radiusKm: null, minOrder: null };
  }
  const fee = amount(d.fee, L.feeMax);
  return {
    source: "item",
    offers: true,
    fee: fee.ok ? fee.value : null,
    area: clip(d.area, L.area),
    time: clip(d.time, L.time),
    notes: clip(d.notes, L.notes),
    pickup: d.pickup === true,
    radiusKm: shop.offers ? shop.radiusKm ?? null : null,
    minOrder: shop.offers ? shop.minOrder ?? null : null
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Notes buyers must see
// ---------------------------------------------------------------------------------------------------------------------------------

/** Clean notices for display: known tone, trimmed, a title or a text, at most 3. */
export function cleanNotices(list) {
  const L = PAGE_LIMITS.notices;
  return (Array.isArray(list) ? list : [])
    .map((n) => ({
      tone: NOTICE_TONES.includes(n?.tone) ? n.tone : "info",
      title: text(n?.title).slice(0, L.title),
      text: (typeof n?.text === "string" ? n.text.trim() : "").slice(0, L.text)
    }))
    .filter((n) => n.title || n.text)
    .slice(0, L.rows);
}

/** The editor's check: each note needs a title and a text, within the limits. -> { ok, value, errors: [{ title?, text? } | null] } */
export function checkNotices(list) {
  const L = PAGE_LIMITS.notices;
  const rows = Array.isArray(list) ? list : [];
  const errors = rows.map(() => null);
  const value = [];
  rows.forEach((n, i) => {
    const title = text(n?.title);
    const body = typeof n?.text === "string" ? n.text.trim() : "";
    if (!title && !body) return;
    const e = {};
    if (!title) e.title = "required";
    else if (title.length > L.title) e.title = "too_long";
    if (!body) e.text = "required";
    else if (body.length > L.text) e.text = "too_long";
    if (Object.keys(e).length) errors[i] = e;
    else value.push({ tone: NOTICE_TONES.includes(n?.tone) ? n.tone : "info", title, text: body });
  });
  if (value.length > L.rows) return { ok: false, value, errors, tooMany: true };
  return { ok: errors.every((e) => !e), value, errors };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// What's included: "Name: details"
// ---------------------------------------------------------------------------------------------------------------------------------

// Whatever a seller typed to make a word bold or a line a bullet is dropped: the page sets the weight itself.
const unmark = (s) => String(s ?? "")
  .replace(/\*\*|__|\*|`/g, "")
  .replace(/^[\s•●▪◦·\-–—>✓✔☑]+/u, "")
  .replace(/^\d+[.)]\s+/, "")
  .replace(/\s+/g, " ")
  .trim();

/** "Remote control: batteries not included" -> { name: "Remote control", details: "batteries not included" }. No colon: all name. */
export function splitInclude(line) {
  const clean = unmark(line);
  const at = clean.indexOf(":");
  if (at <= 0) return { name: clean.replace(/:$/, "").trim(), details: "" };
  return { name: clean.slice(0, at).trim(), details: clean.slice(at + 1).trim() };
}

/** The stored line for a name and optional details. A colon in the name would split it wrongly, so it becomes a dash. */
export function joinInclude({ name, details } = {}) {
  const n = unmark(name).replace(/:/g, " -").replace(/\s+/g, " ").trim();
  const d = String(details ?? "").replace(/\s+/g, " ").trim();
  if (!n) return d ? unmark(d) : "";
  return d ? `${n}: ${d}` : n;
}

/** Display rows for "What's included": [{ name, details, photo }] (photo: a url or null). */
export function includeRows(lines, photos) {
  const pics = Array.isArray(photos) ? photos : [];
  return (Array.isArray(lines) ? lines : [])
    .map((line, i) => ({ ...splitInclude(line), photo: typeof pics[i] === "string" && pics[i] ? pics[i] : null }))
    .filter((r) => r.name || r.details);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pictures: the gallery and "From the brand"
// ---------------------------------------------------------------------------------------------------------------------------------

/** Gallery entries for the database: [{ id, label, caption }] with a media id each, at most 5. */
export function galleryPayload(list) {
  const L = PAGE_LIMITS.gallery;
  return (Array.isArray(list) ? list : [])
    .filter((g) => isMediaId(g?.mediaId))
    .slice(0, L.rows)
    .map((g) => ({ id: g.mediaId, label: text(g.label).slice(0, L.label) || null, caption: text(g.caption).slice(0, L.caption) || null }));
}

/** "From the brand" for the database: { banner, cards: [{ id, caption }] }, or null when it has no picture at all. */
export function brandPayload(brand) {
  const L = PAGE_LIMITS.brand;
  const b = brand && typeof brand === "object" ? brand : {};
  const cards = (Array.isArray(b.cards) ? b.cards : [])
    .filter((c) => isMediaId(c?.mediaId))
    .slice(0, L.cards)
    .map((c) => ({ id: c.mediaId, caption: text(c.caption).slice(0, L.caption) || null }));
  const banner = isMediaId(b.banner?.mediaId) ? b.banner.mediaId : null;
  return banner || cards.length ? { banner, cards } : null;
}

/** The smallest width that still looks sharp in the gallery frame on a big screen, in pixels. */
export const SHARP_WIDTH = 1200;
/** Gallery frames are 16:9 everywhere, so every picture takes the same space; a picture of another shape is shown whole, never stretched. */
export const GALLERY_RATIO = "16 / 9";
export const BRAND_CARD_RATIO = "4 / 5";
