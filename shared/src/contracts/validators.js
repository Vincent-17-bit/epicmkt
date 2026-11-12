// Contract v1 validators. Each check*(value) returns a list of readable problems ("options.1.values.0.id: must be a slug"), empty when
// the value is fine; each is*(value) is the boolean form. Plain functions, no throwing, no dependencies beyond the existing option rules.
//
//   isProductType / isOptionAxis / isOptionVariant / isDimensions / isPriceTiers / isQuantity
//   isSellerCard / isItemDetail / isItemListCard
//   checkItemAgainstProductType(item, type)   does an item use exactly the axes and extra fields its type allows?

import { OPTION_DISPLAY_TYPES, OPTION_LIMITS, VARIANT_STATUSES } from "../seller/options.js";
import { ITEM_PRICE_TYPES } from "../seller/itemForm.js";
import { checkSpecRows } from "../specRules/rows.js";
import { DIMENSION_UNITS, ITEM_FIELDS, PRODUCT_GROUPS, VARIANT_FIELDS } from "./types.js";

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => typeof v === "string" && v.trim() !== "";
const strOrNull = (v) => v === null || typeof v === "string";
const num = (v) => typeof v === "number" && Number.isFinite(v);
const money = (v) => num(v) && v >= 0;
const whole = (v) => Number.isInteger(v);
const slug = (v) => typeof v === "string" && SLUG.test(v);
const iso = (v) => typeof v === "string" && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v);
const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);

const done = (check) => (value) => check(value).length === 0;

export function checkDimensions(d, path = "dimensions") {
  if (!isRecord(d)) return [`${path}: must be an object { length, width, height, unit }`];
  const out = [];
  for (const k of ["length", "width", "height"]) if (!num(d[k]) || d[k] <= 0) out.push(`${path}.${k}: must be a number above 0`);
  if (!DIMENSION_UNITS.includes(d.unit)) out.push(`${path}.unit: must be one of ${DIMENSION_UNITS.join(", ")}`);
  return out;
}

export function checkPriceTiers(tiers, path = "priceTiers") {
  if (!Array.isArray(tiers) || tiers.length === 0) return [`${path}: must be a non-empty list`];
  const out = [];
  tiers.forEach((t, i) => {
    const at = `${path}.${i}`;
    if (!isRecord(t)) { out.push(`${at}: must be an object`); return; }
    if (!whole(t.minQty) || t.minQty < 1) out.push(`${at}.minQty: must be a whole number from 1`);
    if (!(t.maxQty === null || (whole(t.maxQty) && t.maxQty >= t.minQty))) out.push(`${at}.maxQty: must be null or a whole number >= minQty`);
    if (!money(t.unitPrice)) out.push(`${at}.unitPrice: must be a number, 0 or more`);
    if (i === 0 && t.minQty !== 1) out.push(`${at}.minQty: the first tier starts at 1`);
    if (i > 0 && tiers[i - 1]?.maxQty !== null && whole(tiers[i - 1]?.maxQty) && t.minQty !== tiers[i - 1].maxQty + 1) out.push(`${at}.minQty: must be the previous maxQty + 1 (no gap, no overlap)`);
    if (i < tiers.length - 1 && t.maxQty === null) out.push(`${at}.maxQty: only the last tier may be open-ended (null)`);
    if (i === tiers.length - 1 && t.maxQty !== null) out.push(`${at}.maxQty: the last tier must be open-ended (null)`);
    if (i > 0 && money(t.unitPrice) && money(tiers[i - 1]?.unitPrice) && t.unitPrice > tiers[i - 1].unitPrice) out.push(`${at}.unitPrice: a bigger quantity must not cost more per unit`);
  });
  return out;
}

export function checkQuantity(q, path = "quantity") {
  if (!isRecord(q)) return [`${path}: must be an object { min, step, unit }`];
  const out = [];
  if (!num(q.min) || q.min <= 0) out.push(`${path}.min: must be a number above 0`);
  if (!num(q.step) || q.step <= 0) out.push(`${path}.step: must be a number above 0`);
  if (!str(q.unit)) out.push(`${path}.unit: required`);
  return out;
}

export function checkOptionAxis(axis, path = "axis") {
  if (!isRecord(axis)) return [`${path}: must be an object`];
  const out = [];
  if (!slug(axis.key) || axis.key.length > OPTION_LIMITS.axisKey) out.push(`${path}.key: must be a slug of at most ${OPTION_LIMITS.axisKey} characters`);
  if (!str(axis.label) || axis.label.length > OPTION_LIMITS.axisLabel) out.push(`${path}.label: required, at most ${OPTION_LIMITS.axisLabel} characters`);
  if (!OPTION_DISPLAY_TYPES.includes(axis.display)) out.push(`${path}.display: must be one of ${OPTION_DISPLAY_TYPES.join(", ")}`);
  if (!Array.isArray(axis.values) || axis.values.length === 0 || axis.values.length > OPTION_LIMITS.values) {
    out.push(`${path}.values: 1 to ${OPTION_LIMITS.values} values`);
    return out;
  }
  axis.values.forEach((v, i) => {
    const at = `${path}.values.${i}`;
    if (!isRecord(v)) { out.push(`${at}: must be an object`); return; }
    if (!slug(v.id) || v.id.length > OPTION_LIMITS.valueId) out.push(`${at}.id: must be a slug`);
    if (!str(v.label) || v.label.length > OPTION_LIMITS.valueLabel) out.push(`${at}.label: required`);
    if (v.color !== undefined && !HEX.test(v.color ?? "")) out.push(`${at}.color: must be #rrggbb`);
  });
  if (dupes(axis.values.map((v) => v?.id)).length) out.push(`${path}.values: ids must be unique`);
  if (axis.dependsOn !== undefined) {
    const d = axis.dependsOn;
    if (!isRecord(d) || !str(d.axis) || !isRecord(d.allowed)) out.push(`${path}.dependsOn: must be { axis, allowed }`);
    else {
      const own = new Set(axis.values.map((v) => v?.id));
      for (const [parent, ids] of Object.entries(d.allowed)) {
        if (!Array.isArray(ids) || ids.length === 0) out.push(`${path}.dependsOn.allowed.${parent}: must be a non-empty list`);
        else for (const id of ids) if (!own.has(id)) out.push(`${path}.dependsOn.allowed.${parent}: "${id}" is not a value of this axis`);
      }
    }
  }
  return out;
}

export function checkOptionVariant(v, path = "variant", axes = null) {
  if (!isRecord(v)) return [`${path}: must be an object`];
  const out = [];
  if (!str(v.label)) out.push(`${path}.label: required`);
  if (!isRecord(v.choice)) out.push(`${path}.choice: must be an object`);
  else if (Array.isArray(axes)) {
    if (Object.keys(v.choice).length !== axes.length) out.push(`${path}.choice: needs exactly one value per axis`);
    for (const axis of axes) if (!axis.values?.some((x) => x.id === v.choice[axis.key])) out.push(`${path}.choice.${axis.key}: not a value of that axis`);
  }
  if (!(v.price === null || money(v.price))) out.push(`${path}.price: must be a number or null`);
  if (!(v.salePrice === null || money(v.salePrice))) out.push(`${path}.salePrice: must be a number or null`);
  if (!VARIANT_STATUSES.includes(v.status)) out.push(`${path}.status: must be one of ${VARIANT_STATUSES.join(", ")}`);
  if (!(v.sku === null || typeof v.sku === "string")) out.push(`${path}.sku: must be a string or null`);
  if (!Array.isArray(v.mediaIds)) out.push(`${path}.mediaIds: must be a list`);
  if (v.dimensions !== undefined) out.push(...checkDimensions(v.dimensions, `${path}.dimensions`));
  if (v.weightGrams !== undefined && (!num(v.weightGrams) || v.weightGrams <= 0)) out.push(`${path}.weightGrams: must be a number above 0`);
  if (v.priceTiers !== undefined) out.push(...checkPriceTiers(v.priceTiers, `${path}.priceTiers`));
  return out;
}

export function checkProductType(t, path = "productType") {
  if (!isRecord(t)) return [`${path}: must be an object`];
  const out = [];
  if (!slug(t.id)) out.push(`${path}.id: must be a slug`);
  if (!str(t.name)) out.push(`${path}.name: required`);
  if (!PRODUCT_GROUPS.includes(t.group)) out.push(`${path}.group: must be one of ${PRODUCT_GROUPS.join(", ")}`);
  if (!ITEM_PRICE_TYPES.includes(t.priceType)) out.push(`${path}.priceType: must be one of ${ITEM_PRICE_TYPES.join(", ")}`);
  if (!strOrNull(t.unit)) out.push(`${path}.unit: must be a string or null`);
  if (!Array.isArray(t.axes) || t.axes.length > OPTION_LIMITS.axes) out.push(`${path}.axes: a list of at most ${OPTION_LIMITS.axes}`);
  else {
    const keys = t.axes.map((a) => a?.key);
    t.axes.forEach((a, i) => {
      const at = `${path}.axes.${i}`;
      if (!isRecord(a)) { out.push(`${at}: must be an object`); return; }
      if (!slug(a.key)) out.push(`${at}.key: must be a slug`);
      if (!str(a.label)) out.push(`${at}.label: required`);
      if (!OPTION_DISPLAY_TYPES.includes(a.display)) out.push(`${at}.display: must be one of ${OPTION_DISPLAY_TYPES.join(", ")}`);
      if (a.dependsOn !== undefined && !(keys.indexOf(a.dependsOn) >= 0 && keys.indexOf(a.dependsOn) < i)) out.push(`${at}.dependsOn: must be the key of an earlier axis`);
      if (a.suggested !== undefined && !(Array.isArray(a.suggested) && a.suggested.every((s) => isRecord(s) && slug(s.id) && str(s.label)))) out.push(`${at}.suggested: must be a list of { id, label }`);
    });
    if (dupes(keys).length) out.push(`${path}.axes: keys must be unique`);
  }
  if (!Array.isArray(t.variantFields) || t.variantFields.some((f) => !VARIANT_FIELDS.includes(f))) out.push(`${path}.variantFields: a subset of ${VARIANT_FIELDS.join(", ")}`);
  if (!Array.isArray(t.itemFields) || t.itemFields.some((f) => !ITEM_FIELDS.includes(f))) out.push(`${path}.itemFields: a subset of ${ITEM_FIELDS.join(", ")}`);
  if (t.specRows !== undefined) out.push(...checkSpecRows(t.specRows, `${path}.specRows`));
  return out;
}

export function checkSellerCard(c, path = "business") {
  if (!isRecord(c)) return [`${path}: must be an object`];
  const out = [];
  for (const k of ["id", "slug", "name", "categoryId", "townSlug", "townName", "phone", "whatsapp", "statusLine"]) if (!str(c[k])) out.push(`${path}.${k}: required`);
  if (!num(c.lat) || !num(c.lng)) out.push(`${path}.lat/lng: must be numbers`);
  if (typeof c.verified !== "boolean" || typeof c.isOpen !== "boolean") out.push(`${path}.verified/isOpen: must be booleans`);
  if (!(c.logo === null || typeof c.logo === "string")) out.push(`${path}.logo: string or null`);
  if (!(c.distanceKm === null || num(c.distanceKm))) out.push(`${path}.distanceKm: number or null`);
  return out;
}

// The part of an item that lists and the detail page share.
function checkItemCore(item, path) {
  if (!isRecord(item)) return [`${path}: must be an object`];
  const out = [];
  for (const k of ["id", "businessId", "businessSlug", "name", "imageUrl", "kind", "availability"]) if (!str(item[k])) out.push(`${path}.${k}: required`);
  for (const k of ["description", "shortDescription", "terms"]) if (typeof item[k] !== "string") out.push(`${path}.${k}: must be a string`);
  for (const k of ["brand", "duration", "term", "packSize", "unit", "section", "unlistReason"]) if (!strOrNull(item[k])) out.push(`${path}.${k}: must be a string or null`);
  for (const k of ["highlights", "includes", "images", "videos", "media", "variants", "specs"]) if (!Array.isArray(item[k])) out.push(`${path}.${k}: must be a list`);
  if (item.status !== "listed" && item.status !== "unlisted") out.push(`${path}.status: must be "listed" or "unlisted"`);
  if (!(item.regularPrice === null || money(item.regularPrice))) out.push(`${path}.regularPrice: number or null`);
  if (!ITEM_PRICE_TYPES.includes(item.priceType)) out.push(`${path}.priceType: must be one of ${ITEM_PRICE_TYPES.join(", ")}`);
  if (!(item.stockLeft === null || (whole(item.stockLeft) && item.stockLeft > 0))) out.push(`${path}.stockLeft: null or a positive whole number`);
  if (!iso(item.createdAt)) out.push(`${path}.createdAt: must be an ISO 8601 time`);
  if (Array.isArray(item.specs)) item.specs.forEach((s, i) => { if (!(isRecord(s) && str(s.label) && str(s.value))) out.push(`${path}.specs.${i}: needs label and value`); });
  if (Array.isArray(item.images)) item.images.forEach((m, i) => { if (!(isRecord(m) && str(m.id) && str(m.url))) out.push(`${path}.images.${i}: needs id and url`); });
  if (Array.isArray(item.media)) item.media.forEach((m, i) => { if (!(isRecord(m) && str(m.id) && (m.kind === "image" || m.kind === "video"))) out.push(`${path}.media.${i}: needs id and kind image|video`); });
  // v1 fields
  if (!(item.productType === null || slug(item.productType))) out.push(`${path}.productType: must be a product type id or null`);
  if (item.priceTiers !== null) out.push(...checkPriceTiers(item.priceTiers, `${path}.priceTiers`));
  if (item.priceTiers !== null && item.priceType !== "from") out.push(`${path}.priceType: an item with price tiers is priced "from"`);
  out.push(...checkSellerCard(item.business, `${path}.business`));
  if (!(item.pricing === null || (isRecord(item.pricing) && money(item.pricing.regularPrice) && money(item.pricing.salePrice) && Array.isArray(item.pricing.variants)))) out.push(`${path}.pricing: null or { regularPrice, salePrice, variants, ... }`);
  if (!(item.flash === null || isRecord(item.flash))) out.push(`${path}.flash: null or an object`);
  return out;
}

export function checkItemListCard(card, path = "item") {
  const out = checkItemCore(card, path);
  if (!isRecord(card)) return out;
  if (!(card.offer === null || isRecord(card.offer))) out.push(`${path}.offer: null or an object`);
  for (const k of ["options", "optionVariants", "optionAvailability", "sizeChart", "offers"]) if (k in card) out.push(`${path}.${k}: lists stay lean, this belongs on the detail only`);
  return out;
}

export function checkItemDetail(item, path = "item") {
  const out = checkItemCore(item, path);
  if (!isRecord(item)) return out;
  if (item.quantity !== null) out.push(...checkQuantity(item.quantity, `${path}.quantity`));
  if (item.dimensions !== null) out.push(...checkDimensions(item.dimensions, `${path}.dimensions`));
  if (!Array.isArray(item.offers)) out.push(`${path}.offers: must be a list`);
  if (!Array.isArray(item.options) || !Array.isArray(item.optionVariants) || !isRecord(item.optionAvailability)) {
    out.push(`${path}: options, optionVariants and optionAvailability are required (empty for an item with no options)`);
    return out;
  }
  const axes = item.options;
  if (axes.length > OPTION_LIMITS.axes) out.push(`${path}.options: at most ${OPTION_LIMITS.axes} axes`);
  axes.forEach((a, i) => {
    out.push(...checkOptionAxis(a, `${path}.options.${i}`));
    const dep = a?.dependsOn;
    if (dep && !(axes.findIndex((x) => x.key === dep.axis) >= 0 && axes.findIndex((x) => x.key === dep.axis) < i)) out.push(`${path}.options.${i}.dependsOn.axis: must be an earlier axis`);
    else if (dep) {
      const parent = axes.find((x) => x.key === dep.axis);
      for (const id of Object.keys(dep.allowed ?? {})) if (!parent.values.some((v) => v.id === id)) out.push(`${path}.options.${i}.dependsOn.allowed: "${id}" is not a value of ${dep.axis}`);
    }
  });
  if (dupes(axes.map((a) => a?.key)).length) out.push(`${path}.options: axis keys must be unique`);
  const variants = item.optionVariants;
  if (variants.length > OPTION_LIMITS.variants) out.push(`${path}.optionVariants: at most ${OPTION_LIMITS.variants}`);
  if (axes.length === 0 && variants.length > 0) out.push(`${path}.optionVariants: must be empty when there are no options`);
  if (axes.length > 0 && variants.length === 0) out.push(`${path}.optionVariants: options without any variant`);
  variants.forEach((v, i) => out.push(...checkOptionVariant(v, `${path}.optionVariants.${i}`, axes)));
  const keys = variants.map((v) => axes.map((a) => `${a.key}=${v?.choice?.[a.key]}`).join("|"));
  if (dupes(keys).length) out.push(`${path}.optionVariants: two variants have the same combination`);
  // A dependent axis may only be combined with the values its parent allows.
  axes.forEach((a) => {
    if (!a.dependsOn) return;
    variants.forEach((v, i) => {
      const allowed = a.dependsOn.allowed?.[v.choice?.[a.dependsOn.axis]];
      if (!allowed?.includes(v.choice?.[a.key])) out.push(`${path}.optionVariants.${i}: ${a.key} "${v.choice?.[a.key]}" does not go with ${a.dependsOn.axis} "${v.choice?.[a.dependsOn.axis]}"`);
    });
  });
  const av = item.optionAvailability;
  if (JSON.stringify(av.axes) !== JSON.stringify(axes.map((a) => a.key))) out.push(`${path}.optionAvailability.axes: must list the axis keys in order`);
  if (!Array.isArray(av.cells) || av.cells.length !== variants.length) out.push(`${path}.optionAvailability.cells: one cell per variant`);
  if (av.missing !== "unavailable") out.push(`${path}.optionAvailability.missing: must be "unavailable"`);
  // The "from" price is the lowest price a buyer can pay.
  const prices = variants.map((v) => v.price).filter(num);
  if (item.productType !== null && prices.length && item.regularPrice !== Math.min(...prices) && item.priceTiers === null) out.push(`${path}.regularPrice: must equal the lowest option price`);
  return out;
}

// Does an item use exactly what its product type allows? (A fixture is only a fixture if it also fits its type.)
export function checkItemAgainstProductType(item, type, path = "item") {
  if (!isRecord(type)) return [`${path}: unknown product type`];
  const out = [];
  if (item.productType !== type.id) out.push(`${path}.productType: "${item.productType}" is not "${type.id}"`);
  const want = type.axes.map((a) => a.key);
  const got = (item.options ?? []).map((a) => a.key);
  if (JSON.stringify(want) !== JSON.stringify(got)) out.push(`${path}.options: axes ${JSON.stringify(got)} do not match the type's ${JSON.stringify(want)}`);
  type.axes.forEach((t) => {
    const axis = (item.options ?? []).find((a) => a.key === t.key);
    if (t.dependsOn && axis?.dependsOn?.axis !== t.dependsOn) out.push(`${path}.options.${t.key}: must depend on ${t.dependsOn}`);
  });
  for (const f of VARIANT_FIELDS) if (!type.variantFields.includes(f) && (item.optionVariants ?? []).some((v) => v[f] !== undefined)) out.push(`${path}.optionVariants: ${f} is not allowed for ${type.id}`);
  for (const f of ITEM_FIELDS) {
    const present = f === "quantity" ? item.quantity !== null : f === "dimensions" ? item.dimensions !== null : item.priceTiers !== null;
    if (present && !type.itemFields.includes(f)) out.push(`${path}.${f}: not allowed for ${type.id}`);
    if (!present && type.itemFields.includes(f) && f === "priceTiers" && !(item.optionVariants ?? []).every((v) => v.priceTiers)) out.push(`${path}.${f}: ${type.id} needs tiers on the item or on every option`);
  }
  if (type.unit !== null && item.unit !== type.unit) out.push(`${path}.unit: must be "${type.unit}"`);
  return out;
}

export const isDimensions = done(checkDimensions);
export const isPriceTiers = done(checkPriceTiers);
export const isQuantity = done(checkQuantity);
export const isOptionAxis = done(checkOptionAxis);
export const isOptionVariant = done((v) => checkOptionVariant(v));
export const isProductType = done(checkProductType);
export const isSellerCard = done(checkSellerCard);
export const isItemDetail = done(checkItemDetail);
export const isItemListCard = done(checkItemListCard);
