import { formatValue, slugify, visibleFields } from "@epicmkt/shared";
import { itemPath } from "../config/breadcrumbs.js";

const kes = (amount) => `KSh ${Number(amount).toLocaleString("en-KE")}`;

export function chatMessage({ item, variant, pricing }) {
  const name = variant ? `${item.name} (${variant.label})` : item.name;
  const shown = variant ?? pricing;
  if (!shown || !Number.isFinite(shown.regularPrice)) return `Hi, I saw ${name} on EpicMKT`;
  if (shown.savings > 0) {
    return `Hi, I saw the flash sale on ${name}: ${kes(shown.salePrice)} (was ${kes(shown.regularPrice)}) on EpicMKT`;
  }
  return `Hi, I saw ${name} (${kes(shown.regularPrice)}) on EpicMKT`;
}

export function defaultVariantId(pricing) {
  const variants = pricing?.variants ?? [];
  if (!variants.length) return null;
  return (variants.find((v) => v.regularPrice === pricing.regularPrice) ?? variants[0]).id;
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

const SCALARS = ["text", "number", "price", "boolean", "select", "multiselect"];
const LIMIT_ROWS = 8;

const isBlank = (value) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

export function buildSpecGroups({ item, category, attributes }) {
  const groups = [];
  const seen = new Set();
  const add = (name, label, value) => {
    const key = label.trim().toLowerCase();
    if (!label || isBlank(value) || seen.has(key)) return;
    seen.add(key);
    let group = groups.find((g) => g.name === name);
    if (!group) {
      group = { name, rows: [] };
      groups.push(group);
    }
    group.rows.push({ label, value: String(value) });
  };
  for (const spec of item?.specs ?? []) add(spec.group ?? null, spec.label, spec.value);
  add(null, "Duration", item?.duration);
  add(null, "Term", item?.term);
  add(null, "Pack size", item?.packSize);
  add(null, "Unit", item?.pricing?.unit);
  const fallback = category?.singular ? `${category.singular} details` : null;
  for (const field of visibleFields(category?.fields, attributes)) {
    if (!SCALARS.includes(field.type)) continue;
    const value = attributes?.[field.key];
    if (isBlank(value) || (field.type === "boolean" && value === false)) continue;
    add(field.group ?? fallback, field.label, formatValue(field, value));
  }
  return groups.filter((g) => g.rows.length > 0);
}

export function limitGroups(groups, max = LIMIT_ROWS) {
  let left = max;
  const out = [];
  for (const group of groups) {
    if (left <= 0) break;
    const rows = group.rows.slice(0, left);
    left -= rows.length;
    out.push({ ...group, rows });
  }
  return out;
}

export const countRows = (groups) => groups.reduce((sum, g) => sum + g.rows.length, 0);
export const SPEC_LIMIT = LIMIT_ROWS;

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
  if (offer.kind === "amount_off" && offer.value != null) return `${kes(offer.value)} off`;
  if (offer.kind === "freebie") return "Free gift";
  if (offer.kind === "free_service") return "Free";
  return "Offer";
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
  limited: "https://schema.org/LimitedAvailability",
  unavailable: "https://schema.org/OutOfStock"
};

export function buildItemJsonLd({ item, siteUrl, receivedAt = Date.now() }) {
  const seller = {
    "@type": "LocalBusiness",
    name: item.business.name,
    url: `${siteUrl}/b/${item.business.slug}`
  };
  const url = `${siteUrl}${itemPath(item.business.slug, item.id)}`;
  const data = {
    "@context": "https://schema.org",
    "@type": item.kind === "service" ? "Service" : "Product",
    name: item.name,
    url,
    ...(item.description ? { description: item.description } : {}),
    ...(item.images?.length ? { image: item.images.map((image) => image.url) } : {})
  };
  if (item.kind === "service") data.provider = seller;
  else data.brand = { "@type": "Brand", name: item.business.name };
  if (item.pricing) {
    data.offers = {
      "@type": "Offer",
      url,
      priceCurrency: "KES",
      price: item.pricing.salePrice,
      availability: AVAILABILITY[item.availability] ?? AVAILABILITY.available,
      seller,
      ...(item.flash
        ? { priceValidUntil: item.flash.sale.endsAt, validFrom: item.flash.sale.startsAt, validThrough: item.flash.sale.endsAt }
        : {})
    };
  }
  return data;
}

export const PREVIEW_CHARS = 600;

export function paragraphs(text) {
  return String(text ?? "")
    .split(/\n{2,}|\r\n\r\n/)
    .map((part) => part.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

export function previewText(text, max = PREVIEW_CHARS) {
  const clean = String(text ?? "").trim();
  if (clean.length <= max) return { text: clean, truncated: false };
  const cut = clean.slice(0, max);
  const at = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  const end = at > max * 0.6 ? at : max;
  return { text: `${cut.slice(0, end).replace(/[,;:\s]+$/, "")}…`, truncated: true };
}

export function endedPricing(pricing) {
  if (!pricing) return pricing;
  const plain = (row) => ({ ...row, salePrice: row.regularPrice, savings: 0, discountPercent: 0 });
  return { ...plain(pricing), variants: (pricing.variants ?? []).map(plain) };
}

export function priceParts(pricing, priceType = "fixed") {
  if (!pricing || !Number.isFinite(pricing.regularPrice)) return { kind: "contact", amount: null, prefix: null };
  if (pricing.salePrice === 0 || (pricing.regularPrice === 0 && pricing.savings <= 0) || priceType === "free") {
    return { kind: "free", amount: 0, prefix: null };
  }
  return { kind: pricing.savings > 0 ? "sale" : "regular", amount: pricing.salePrice, prefix: priceType === "from" || priceType === "range" ? priceType : null };
}
