import { greetingProblems, renderGreeting, slugify } from "@epicmkt/shared";
import { HIGHLIGHT_LIMIT, SPEC_GROUPS, buildSpecGroups, countRows, normalizeHighlights } from "@epicmkt/ui";

export { HIGHLIGHT_LIMIT, SPEC_GROUPS, buildSpecGroups, countRows, normalizeHighlights };

const isBlank = (value) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

const kes = (amount) => `KES ${Number(amount).toLocaleString("en-KE")}`;

export function chatMessage({ item, variant, pricing, greeting }) {
  const name = variant ? `${item.name} (${variant.label})` : item.name;
  const shown = variant ?? pricing;
  // The seller's own greeting wins when they saved a valid one. {item} and {price} are filled in; it never carries links or numbers.
  if (typeof greeting === "string" && greeting.trim() && greetingProblems(greeting).length === 0) {
    const live = shown && Number.isFinite(shown.regularPrice) ? (shown.savings > 0 ? shown.salePrice : shown.regularPrice) : null;
    return renderGreeting(greeting, { item: name, price: live === null ? "" : kes(live) });
  }
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
    data.offers = {
      "@type": "Offer",
      url,
      priceCurrency: "KES",
      price: item.pricing.salePrice,
      availability: AVAILABILITY[item.availability] ?? AVAILABILITY.available,
      seller,
      ...(item.flash ? { priceValidUntil: item.flash.sale.endsAt } : {})
    };
  }
  return data;
}
