// Delivery (Prompt A18). The shop's own setting decides: it delivers or it does not. Nothing here guesses.
//
//   deliveryInfo(business)         -> { offers, fee, radiusKm, area, minOrder, notes }
//   deliveryReach(business, from, { roadKm })  -> { status: inside | outside | unknown | none, distanceKm (by road), straightKm, basis: road | estimate, radiusKm }
//
// `business` may carry the public `delivery` object ({ offers, fee, radiusKm, area, minOrder, notes }, what public_businesses returns), the
// database columns (`delivers`, `delivery_fee`, `delivery_radius_km`, `delivery_area`, `delivery_min_order`, `delivery_notes`), or the
// older flat names (`deliveryFee`, `deliveryRadiusKm`, `deliveryArea`). `offers` is true only when the shop explicitly says so: a missing,
// empty or unknown value is false. Fee, radius and minimum order are finite numbers of zero or more, or null: never NaN, never negative.

import { distanceKm } from "./utils.js";

export const DELIVERY_LIMITS = Object.freeze({ feeMax: 100000, radiusMax: 500, minOrderMax: 10000000, areaMax: 120, notesMax: 300 });
/** How far past the radius still counts as inside, in km: GPS and a chosen town are never exact. */
export const REACH_TOLERANCE_KM = 0.2;
// Roads are longer than the straight line between two points; 1.3 is the usual figure for towns and their roads. Used until a real road distance is known.
export const ROAD_FACTOR = 1.3;

const pick = (o, ...keys) => {
  for (const k of keys) if (o && o[k] !== undefined) return o[k];
  return undefined;
};

/** A non-negative finite number from a number or a plain numeric string; anything else is null. */
export const cleanAmount = (v, max = Infinity) => {
  if (typeof v !== "number" && typeof v !== "string") return null;
  if (typeof v === "string" && !/^\s*\d+(\.\d+)?\s*$/.test(v)) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

const cleanText = (v, max) => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Only an explicit yes: `true`, "true", "yes" or 1. Missing, empty, "maybe" and garbage are all no. */
const isYes = (v) => v === true || v === 1 || (typeof v === "string" && ["true", "yes", "1"].includes(v.trim().toLowerCase()));

export function deliveryInfo(business) {
  const src = business && typeof business === "object" ? business : {};
  const d = src.delivery && typeof src.delivery === "object" ? src.delivery : null;
  const offers = isYes(d ? d.offers : pick(src, "delivers", "offersDelivery", "delivery"));
  const area = cleanText(pick(d ?? {}, "area") ?? pick(src, "delivery_area", "deliveryArea"), DELIVERY_LIMITS.areaMax);
  if (!offers) return { offers: false, fee: null, radiusKm: null, area, minOrder: null, notes: null };
  const radius = cleanAmount(pick(d ?? {}, "radiusKm") ?? pick(src, "delivery_radius_km", "deliveryRadiusKm"), DELIVERY_LIMITS.radiusMax);
  return {
    offers: true,
    fee: cleanAmount(pick(d ?? {}, "fee") ?? pick(src, "delivery_fee", "deliveryFee"), DELIVERY_LIMITS.feeMax),
    radiusKm: radius === 0 ? null : radius,
    area,
    minOrder: cleanAmount(pick(d ?? {}, "minOrder") ?? pick(src, "delivery_min_order", "deliveryMinOrder"), DELIVERY_LIMITS.minOrderMax),
    notes: cleanText(pick(d ?? {}, "notes") ?? pick(src, "delivery_notes", "deliveryNotes"), DELIVERY_LIMITS.notesMax)
  };
}

const point = (p) => {
  if (!p || typeof p !== "object") return null;
  const lat = Number(p.lat), lng = Number(p.lng);
  return p.lat != null && p.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

/**
 * Is the buyer inside the shop's delivery radius? `none`: the shop does not deliver. `unknown`: no radius set, or no position for the shop
 * or the buyer. The distance is BY ROAD: the real one when the caller has it (`opts.roadKm`, from a routing service), otherwise the straight
 * line times ROAD_FACTOR, which is said to be an estimate (`basis`). Rounded to 0.1 km; a buyer within REACH_TOLERANCE_KM past the radius
 * still counts as inside. `straightKm` is always the straight line.
 */
export function deliveryReach(business, origin, opts = {}) {
  const info = deliveryInfo(business);
  if (!info.offers) return { status: "none", distanceKm: null, radiusKm: null };
  const shop = point(business);
  const from = point(origin);
  const straight = shop && from ? Math.round(distanceKm(shop, from) * 10) / 10 : null;
  const real = Number.isFinite(opts?.roadKm) && opts.roadKm >= 0 ? Math.round(opts.roadKm * 10) / 10 : null;
  const km = real ?? (straight === null ? null : Math.round(straight * ROAD_FACTOR * 10) / 10);
  const basis = km === null ? null : real !== null ? "road" : "estimate";
  if (info.radiusKm == null || km == null) return { status: "unknown", distanceKm: km, straightKm: straight, basis, radiusKm: info.radiusKm };
  return { status: km <= info.radiusKm + REACH_TOLERANCE_KM ? "inside" : "outside", distanceKm: km, straightKm: straight, basis, radiusKm: info.radiusKm };
}

/** What `seller_set_delivery` accepts, checked the way the database checks it. Returns { ok, value } or { ok: false, errors: { field: code } }. */
export function checkDeliverySetting(input) {
  const f = input && typeof input === "object" ? input : {};
  const errors = {};
  const offers = f.offers === true || f.offers === false ? f.offers : (errors.offers = "invalid_offers", null);
  const num = (key, max, code) => {
    const raw = f[key];
    if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return null;
    const n = cleanAmount(raw, max);
    if (n === null) errors[key] = code;
    return n;
  };
  const fee = num("fee", DELIVERY_LIMITS.feeMax, "invalid_fee");
  const radiusKm = num("radiusKm", DELIVERY_LIMITS.radiusMax, "invalid_radius");
  if (radiusKm === 0) errors.radiusKm = "invalid_radius";
  const minOrder = num("minOrder", DELIVERY_LIMITS.minOrderMax, "invalid_min_order");
  const text = (key, max, code) => {
    const raw = f[key];
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "string" || raw.trim().length > max) { errors[key] = code; return null; }
    return raw.replace(/\s+/g, " ").trim() || null;
  };
  const area = text("area", DELIVERY_LIMITS.areaMax, "invalid_area");
  const notes = text("notes", DELIVERY_LIMITS.notesMax, "invalid_notes");
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { offers, fee, radiusKm, area, minOrder, notes } };
}
