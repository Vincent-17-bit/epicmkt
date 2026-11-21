import { BUSINESS_TIME_ZONE, formatInstant, LABEL_SETS, amountText, formatKes, greetingProblems, labelFor, lineTotal, perUnitText, priceTiered, quantityRules, renderGreeting, slugify } from "@epicmkt/shared";
import { HIGHLIGHT_LIMIT, SPEC_GROUPS, buildSpecGroups, countRows, normalizeHighlights } from "@epicmkt/ui";

export { HIGHLIGHT_LIMIT, SPEC_GROUPS, buildSpecGroups, countRows, normalizeHighlights };

const keyOf = (label) => String(label ?? "").trim().toLowerCase();

export const variantOverrides = (variant) => (variant?.specs?.length ? variant.specs : variant?.specOverrides);

export function mergeSpecs(specs, overrides) {
  const list = Array.isArray(specs) ? specs : [];
  const extra = Array.isArray(overrides)
    ? overrides
    : overrides && typeof overrides === "object"
      ? Object.entries(overrides).map(([label, value]) => ({ label, value }))
      : [];
  let out = list.map((s) => ({ ...s }));
  for (const o of extra) {
    const key = keyOf(o?.label);
    if (!key) continue;
    const at = out.findIndex((s) => keyOf(s.label) === key);
    const blank = o.value === undefined || o.value === null || String(o.value).trim() === "";
    if (blank) out = out.filter((_, i) => i !== at);
    else if (at !== -1) out[at] = { ...out[at], value: o.value };
    else out.push({ group: o.group ?? SPEC_GROUPS[0], label: o.label, value: o.value });
  }
  return out;
}

export const specGroupsFor = ({ item, category, attributes, overrides }) =>
  buildSpecGroups({ item: overrides ? { ...item, specs: mergeSpecs(item?.specs, overrides) } : item, category, attributes });

export function stateLabels(item, overrides) {
  const specs = mergeSpecs(item?.specs, overrides);
  return Object.entries(LABEL_SETS).flatMap(([setKey, set]) => {
    const row = specs.find((s) => keyOf(s.label) === keyOf(set.label));
    const value = row ? labelFor(setKey, row.value) : null;
    return value ? [{ key: setKey, label: set.label, value }] : [];
  });
}

export const topHighlights = (groups, limit = 4) => groups.flatMap((g) => g.rows).slice(0, limit);

const isBlank = (value) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);


/**
 * The quantity control an item gets: { mode, rules } for a typed item whose type counts units or measures (the type says so), else null
 * and the page has no stepper (an item without a type, or a type with no quantity, is exactly as before).
 */
export function quantityInfo(item, variant = null) {
  const mode = item?.quantityMode;
  if (mode !== "units" && mode !== "measure") return null;
  const left = [variant?.stockLeft, item?.stockLeft].find((n) => Number.isFinite(n) && n >= 0);
  const quantity = mode === "measure" ? (item.quantity ?? { unit: item.unit ?? "kg" }) : null;
  return { mode, rules: quantityRules(mode, { quantity, stock: left ?? null }), unit: mode === "measure" ? (quantity?.unit ?? "kg") : null };
}

/**
 * What the buyer is ordering: { qty, unit (price of one), total, measure, unitLabel }. The unit price is the one the page shows (flash and
 * sale applied); quantity tiers price the whole order by their own rule. Null when there is nothing to order (no price).
 */
export function orderLine({ shown, tiers = null, info = null, qty }) {
  const one = Number.isFinite(shown?.salePrice) ? shown.salePrice : Number.isFinite(shown?.regularPrice) ? shown.regularPrice : null;
  if (one === null && !tiers) return null;
  const total = tiers ? priceTiered({ tiers: tiers.tiers, mode: tiers.mode, qty }).total : lineTotal(one, qty);
  return { qty, unit: one, total, measure: info?.mode === "measure", unitLabel: info?.unit ?? null };
}

export function choiceLines(option, variant) {
  if (option?.axes?.length) {
    return option.axes
      .map((axis) => {
        const value = axis.values?.find((v) => v.id === option.choice?.[axis.key]);
        return value ? { label: axis.label, value: value.label } : null;
      })
      .filter(Boolean);
  }
  return variant?.label ? [{ label: "Option", value: String(variant.label) }] : [];
}

const plain = (text) => String(text ?? "").replace(/\*/g, "").replace(/\s+/g, " ").trim();

export function orderMessage({ item, shop = "", choices = [], order }) {
  const verb = item.kind === "service" ? "book" : "order";
  const lines = [`Hi${shop ? ` ${plain(shop)}` : ""}, I'd like to ${verb}:`, "", `*${plain(item.name)}*`];
  for (const c of choices) lines.push(`${plain(c.label)}: ${plain(c.value)}`);
  lines.push(order.measure ? `Amount: ${amountText(order.qty, order.unitLabel)}` : `Quantity: ${order.qty}`);
  if (Number.isFinite(order.unit)) lines.push(`Price: ${order.measure ? perUnitText(order.unit, order.unitLabel) : `${formatKes(order.unit)} each`}`);
  lines.push(`Total: ${formatKes(order.total)}`, "", "Please confirm it is available and how I can pay and receive it.", "Sent from EpicMKT");
  return lines.join("\n");
}

export function chatMessage({ item, variant, pricing, greeting }) {
  const name = variant ? `${item.name} (${variant.label})` : item.name;
  const shown = variant ?? pricing;
  // The seller's own greeting wins when they saved a valid one. {item} and {price} are filled in; it never carries links or numbers.
  if (typeof greeting === "string" && greeting.trim() && greetingProblems(greeting).length === 0) {
    const live = shown && Number.isFinite(shown.regularPrice) ? (shown.savings > 0 ? shown.salePrice : shown.regularPrice) : null;
    const text = renderGreeting(greeting, { item: name, price: live === null ? "" : formatKes(live) });
    return text;
  }
  if (!shown || !Number.isFinite(shown.regularPrice)) return `Hi, I saw ${name} on EpicMKT`;
  // An option's own sale price (not a flash sale) says what the buyer would pay, without the flash wording.
  if (shown.plainSale) return `Hi, I saw ${name} (${formatKes(shown.savings > 0 ? shown.salePrice : shown.regularPrice)}) on EpicMKT`;
  if (shown.savings > 0) {
    return `Hi, I saw the flash sale on ${name}: ${formatKes(shown.salePrice)} (was ${formatKes(shown.regularPrice)}) on EpicMKT`;
  }
  return `Hi, I saw ${name} (${formatKes(shown.regularPrice)}) on EpicMKT`;
}

export function offerTarget(offer, business) {
  const base = `/b/${business.slug}`;
  let sectionId = null;
  if (offer.appliesTo === "section") sectionId = offer.sectionId;
  if (offer.appliesTo === "items") {
    const first = business.services?.find((svc) => offer.itemIds?.includes(svc.id) && svc.section);
    sectionId = first ? slugify(first.section) : null;
  }
  return sectionId ? `${base}?section=${encodeURIComponent(sectionId)}` : base;
}

const pad2 = (n) => String(n).padStart(2, "0");

export function countdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

export function offerValueLabel(offer) {
  if (offer.valueText) return offer.valueText;
  if (offer.kind === "percent_off" && offer.value != null) return `${offer.value}% off`;
  if (offer.kind === "amount_off" && offer.value != null) return `${formatKes(offer.value)} off`;
  if (offer.kind === "freebie") return "Free gift";
  if (offer.kind === "free_service") return "Free";
  return "Offer";
}

export function offerValidity(offer, zone = BUSINESS_TIME_ZONE) {
  // formatInstant draws an instant in a zone and returns "" for a bad value; an unknown zone throws, and then the shop's zone is used.
  const draw = (iso, opts, timeZone) => formatInstant(iso, { locale: "en-GB", day: "numeric", month: "short", ...opts, timeZone });
  const day = (iso, withYear) => {
    const opts = withYear ? { year: "numeric" } : {};
    try { return draw(iso, opts, zone) || null; } catch { return draw(iso, opts, BUSINESS_TIME_ZONE) || null; }
  };
  const year = (iso) => day(iso, true)?.split(" ").pop();
  const from = offer?.startsAt ? day(offer.startsAt, false) : null;
  const to = offer?.endsAt ? day(offer.endsAt, true) : null;
  if (from && to) return year(offer.startsAt) === year(offer.endsAt) ? `${from} - ${to}` : `${day(offer.startsAt, true)} - ${to}`;
  if (to) return `Until ${to}`;
  if (from) return `From ${day(offer.startsAt, true)}`;
  return null;
}

export function offerExpiry(remainingMs) {
  if (remainingMs == null) return null;
  const hours = Math.floor(remainingMs / 3600000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d`;
  if (hours >= 1) return `${hours}h`;
  return `${Math.max(1, Math.ceil(remainingMs / 60000))}m`;
}

const AVAILABILITY = {
  available: "https://schema.org/InStock",
  by_appointment: "https://schema.org/InStock",
  limited_stock: "https://schema.org/LimitedAvailability",
  out_of_stock: "https://schema.org/OutOfStock",
  unavailable: "https://schema.org/OutOfStock"
};

export function buildItemJsonLd({ item, siteUrl, receivedAt = Date.now() }) {
  const seller = {
    "@type": "LocalBusiness",
    name: item.business.name,
    url: `${siteUrl}/b/${item.business.slug}`
  };
  const url = `${siteUrl}/b/${item.business.slug}?item=${encodeURIComponent(item.id)}`;
  const data = {
    "@context": "https://schema.org",
    "@type": item.kind === "service" ? "Service" : "Product",
    name: item.name,
    url,
    ...(item.description ? { description: item.description } : {}),
    ...(item.images?.length ? { image: item.images.map((image) => image.url) } : {})
  };
  const brand = typeof item.brand === "string" ? item.brand.trim() : "";
  if (item.kind === "service") data.provider = seller;
  if (brand) data.brand = { "@type": "Brand", name: brand };
  else if (item.kind !== "service") data.brand = { "@type": "Brand", name: item.business.name };
  const properties = (item.specs ?? [])
    .filter((spec) => spec && typeof spec.label === "string" && spec.label.trim() && !isBlank(spec.value))
    .map((spec) => ({ "@type": "PropertyValue", name: spec.label.trim(), value: String(spec.value) }));
  if (properties.length) data.additionalProperty = properties;
  if (item.pricing) {
    const common = {
      url,
      priceCurrency: "KES",
      availability: AVAILABILITY[item.availability] ?? AVAILABILITY.available,
      seller,
      ...(item.flash ? { priceValidUntil: item.flash.sale.endsAt } : {})
    };
    const { hasRange, priceMin, priceMax } = item.pricing;
    // Options priced differently: one price would be wrong, so give the range (AggregateOffer).
    data.offers = hasRange && Number.isFinite(priceMin) && Number.isFinite(priceMax) && priceMax > priceMin
      ? { "@type": "AggregateOffer", ...common, lowPrice: priceMin, highPrice: priceMax }
      : { "@type": "Offer", ...common, price: item.pricing.salePrice };
  }
  return data;
}

export { defaultVariantId } from "@epicmkt/shared";
