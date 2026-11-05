// Turns a short fixture spec into a full Contract v1 ItemDetail (and its list card). Nothing here runs at import time, so apps that
// import @epicmkt/shared never pay for the fixtures unless they call getFixtures().
//
// Spec fields: id, productType, name, brand, description, hue, specs, highlights, section, unit, packSize, priceTiers, quantity,
// dimensions, axes (authoring shape, optional dependsOn), variants ({ choice, price, status, stock, dimensions, weightGrams,
// priceTiers }), chart, price (for an item without options), priceType (override).

import { allCombinations, comboKey, publicOptions } from "../../seller/options.js";

export const FIXTURE_BUSINESS_ID = "fx-store";

export const fixtureBusinessCard = () => ({
  id: FIXTURE_BUSINESS_ID,
  slug: "fixture-store",
  name: "Fixture Store",
  categoryId: "general",
  townSlug: "nairobi",
  logo: null,
  verified: true,
  townName: "Nairobi",
  lat: -1.2864,
  lng: 36.8172,
  phone: "+254700000000",
  whatsapp: "+254700000000",
  isOpen: true,
  statusLine: "Open now",
  distanceKm: null
});

const art = (hue, label) => {
  const text = String(label).replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="hsl(${hue} 45% 82%)"/><text x="200" y="158" font-family="sans-serif" font-size="22" text-anchor="middle" fill="hsl(${hue} 40% 25%)">${text}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

/** Every combination of the axes that `pick(choice)` accepts. `pick` returns the variant's fields, or null to leave that combination out. */
export const grid = (axes, pick) =>
  allCombinations(axes).flatMap((choice) => {
    const fields = pick(choice);
    return fields ? [{ choice, ...fields }] : [];
  });

const lowest = (numbers) => (numbers.length ? Math.min(...numbers) : null);

export function buildDetail(spec, index) {
  const axes = (spec.axes ?? []).map(({ dependsOn, ...axis }) => axis);
  const stored = (spec.variants ?? []).map((v) => {
    const key = comboKey(axes, v.choice);
    if (!key) throw new Error(`${spec.id}: ${JSON.stringify(v.choice)} is not a combination of the axes`);
    return { price: null, salePrice: null, stock: null, status: "available", sku: null, mediaIds: [], ...v, key, id: `${spec.id}:${key}` };
  });
  const tierPrices = [...(spec.priceTiers ?? []), ...stored.flatMap((v) => v.priceTiers ?? [])].map((t) => t.unitPrice);
  const prices = stored.map((v) => v.price).filter(Number.isFinite);
  const regularPrice = spec.price ?? lowest([...prices, ...tierPrices]);
  const varies = new Set(prices).size > 1;
  const priceType = spec.priceType ?? (spec.priceTiers || varies ? "from" : "fixed");

  const built = publicOptions({
    axes,
    variants: stored,
    item: { price: spec.price ?? null, salePrice: null, showStockCount: true },
    chart: spec.chart ?? null
  });
  const dependsOn = Object.fromEntries((spec.axes ?? []).filter((a) => a.dependsOn).map((a) => [a.key, a.dependsOn]));
  const options = built.options.map((axis) => (dependsOn[axis.key] ? { ...axis, dependsOn: dependsOn[axis.key] } : axis));
  const optionVariants = built.optionVariants.map((shown, i) => {
    const { dimensions, weightGrams, priceTiers } = stored[i];
    return { ...shown, ...(dimensions && { dimensions }), ...(weightGrams && { weightGrams }), ...(priceTiers && { priceTiers }) };
  });

  const imageUrl = art(spec.hue ?? 210, spec.name);
  const images = [{ id: "i1", url: imageUrl, caption: spec.name }];
  const pricing = Number.isFinite(regularPrice)
    ? { regularPrice, salePrice: regularPrice, savings: 0, discountPercent: 0, unit: spec.unit ?? null, priceType, variants: [] }
    : null;

  return {
    id: spec.id,
    businessId: FIXTURE_BUSINESS_ID,
    businessSlug: "fixture-store",
    name: spec.name,
    description: spec.description ?? "",
    shortDescription: spec.description ?? "",
    brand: spec.brand ?? null,
    highlights: spec.highlights ?? [],
    includes: [],
    terms: "",
    duration: null,
    term: null,
    packSize: spec.packSize ?? null,
    imageUrl,
    images,
    videos: [],
    media: images.map((m) => ({ ...m, kind: "image" })),
    regularPrice: Number.isFinite(regularPrice) ? regularPrice : null,
    priceType,
    unit: spec.unit ?? null,
    status: "listed",
    unlistReason: null,
    kind: "product",
    section: spec.section ?? null,
    availability: "available",
    stockLeft: null,
    variants: [],
    specs: spec.specs ?? [],
    createdAt: new Date(Date.UTC(2026, 10, 1, 8, index, 0)).toISOString(),
    productType: spec.productType ?? null,
    priceTiers: spec.priceTiers ?? null,
    quantity: spec.quantity ?? null,
    dimensions: spec.dimensions ?? null,
    options,
    optionVariants,
    optionAvailability: built.optionAvailability,
    sizeChart: built.sizeChart,
    business: fixtureBusinessCard(),
    pricing,
    flash: null,
    offers: []
  };
}

/** The lean list row of a detail: no option payload, and the card's `offer` slot. */
export const toListCard = (detail) => {
  const { options, optionVariants, optionAvailability, sizeChart, offers, ...lean } = detail;
  return { ...lean, offer: null };
};
