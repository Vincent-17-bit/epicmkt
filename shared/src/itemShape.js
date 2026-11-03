const SHORT_MAX = 140;
const MAX_LIST = 20;
const MAX_SPECS = 20;

const textOf = (value) => (typeof value === "string" ? value.trim() : "");

const listOf = (value) => (Array.isArray(value) ? value.map(textOf).filter(Boolean).slice(0, MAX_LIST) : []);

const highlightsOf = (value) => {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const text = textOf(entry);
      if (text) out.push(text);
    } else if (entry && typeof entry === "object") {
      const text = textOf(entry.text);
      const title = textOf(entry.title);
      if (text) out.push({ ...(title ? { title } : {}), text });
    }
    if (out.length >= MAX_LIST) break;
  }
  return out;
};

const specsOf = (value) => {
  if (!Array.isArray(value)) return [];
  const rows = [];
  for (const spec of value) {
    if (!spec || typeof spec !== "object") continue;
    const label = textOf(spec.label);
    const val = typeof spec.value === "number" && Number.isFinite(spec.value) ? String(spec.value) : textOf(spec.value);
    const group = textOf(spec.group);
    if (label && val) rows.push({ label, value: val, ...(group ? { group } : {}) });
    if (rows.length >= MAX_SPECS) break;
  }
  return rows;
};

const shorten = (text) => {
  if (text.length <= SHORT_MAX) return text;
  const cut = text.slice(0, SHORT_MAX);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "")}…`;
};

const VARIANT_MAX = 10;

export const variantsOf = (value) => {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const id = textOf(entry.id);
    const label = textOf(entry.label);
    const price = Number(entry.price);
    if (!id || !label || !Number.isFinite(price) || price < 0 || entry.stock === 0) continue;
    out.push({ id, label, price });
    if (out.length >= VARIANT_MAX) break;
  }
  return out;
};

const amounts = (regularPrice, salePrice) => ({
  regularPrice,
  salePrice,
  savings: regularPrice - salePrice,
  discountPercent: regularPrice > 0 ? Math.round(((regularPrice - salePrice) / regularPrice) * 100) : 0
});

export const variantPricing = (variants, priceFor = (price) => price) =>
  (variants ?? []).map((v) => ({ id: v.id, label: v.label, ...amounts(v.price, priceFor(v.price)) }));

export const pricingOf = (regularPrice, salePrice, priceType, unit, variants = [], priceFor) => ({
  ...amounts(regularPrice, salePrice),
  unit: unit ?? null,
  priceType: priceType ?? "fixed",
  variants: variantPricing(variants, priceFor)
});

export const makeItemOf = (mediaUrl) => ({ id, businessId, businessSlug, name, description, shortDescription, brand, highlights, specs, includes, terms, packSize, price, priceType, unit, section, availability, stockLeft, variants, imagePaths, videoPaths, mediaPaths, createdAt }) => {
  const images = (imagePaths ?? []).map((path, index) => ({ id: `i${index + 1}`, url: mediaUrl(path), caption: name }));
  const videos = (videoPaths ?? []).map((path, index) => ({ id: `v${index + 1}`, url: mediaUrl(path), caption: name }));
  const sequence = Array.isArray(mediaPaths) ? mediaPaths : [...(imagePaths ?? []).map((path) => ({ path, kind: "image" })), ...(videoPaths ?? []).map((path) => ({ path, kind: "video" }))];
  let photoN = 0;
  let videoN = 0;
  const media = sequence
    .filter((m) => m?.path && (m.kind === "image" || m.kind === "video"))
    .map((m) => ({ id: m.kind === "video" ? `v${++videoN}` : `i${++photoN}`, kind: m.kind, url: mediaUrl(m.path), caption: name }));
  return {
    id,
    businessId,
    businessSlug,
    name,
    description: description ?? "",
    shortDescription: textOf(shortDescription) || shorten(typeof description === "string" ? description : ""),
    brand: textOf(brand) || null,
    highlights: highlightsOf(highlights),
    includes: listOf(includes),
    terms: textOf(terms),
    duration: null,
    term: null,
    packSize: textOf(packSize) || null,
    imageUrl: images[0]?.url ?? null,
    images,
    videos,
    media,
    regularPrice: Number.isFinite(price) ? price : null,
    priceType: priceType ?? "fixed",
    unit: unit ?? null,
    status: "listed",
    unlistReason: null,
    kind: "product",
    section: section ?? null,
    availability: availability ?? "available",
    stockLeft: Number.isInteger(stockLeft) && stockLeft > 0 ? stockLeft : null,
    variants: variantsOf(variants),
    specs: specsOf(specs),
    createdAt
  };
};
