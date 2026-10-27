import { STATUS_CHOICES, statusForForm } from "../availability.js";

export const ITEM_PRICE_TYPES = ["fixed", "from", "range", "free", "contact"];

const money = (raw) => {
  const text = String(raw ?? "").replace(/,/g, "").trim();
  if (text === "") return { empty: true };
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return { error: true };
  const value = Number(text);
  return value > 9999999999.99 ? { error: true } : { value };
};

export const SPEC_LIMITS = { rows: 20, label: 40, value: 120 };
export const SPEC_GROUPS = ["Features & Specs", "Measurements", "Additional details", "User guide", "Item details"];
export const SPEC_DEFAULT_GROUP = SPEC_GROUPS[0];
export const DETAIL_LIMITS = { brand: 60, shortDescription: 140, description: 2000, highlightRows: 8, highlightTitle: 40, highlightText: 200, includeRows: 10, includeLine: 80, terms: 500, packSize: 40 };
export const SPEC_PRESETS = [
  { label: "Material", group: "Features & Specs" },
  { label: "Color", group: "Features & Specs" },
  { label: "Dimensions (D x W x H)", group: "Measurements" },
  { label: "Weight", group: "Measurements" },
  { label: "Brand", group: "Item details" },
  { label: "Special feature", group: "Features & Specs" },
  { label: "Mounting type", group: "Additional details" },
  { label: "Recommended uses", group: "Additional details" },
  { label: "Size", group: "Measurements" },
  { label: "Capacity", group: "Measurements" },
];

const tooLong = (n) => `Use ${n} characters or fewer.`;

const cleanHighlights = (raw) => {
  const highlights = [];
  const errors = {};
  (Array.isArray(raw) ? raw : []).forEach((row, index) => {
    const title = String(row?.title ?? "").trim();
    const text = String(row?.text ?? "").trim();
    if (!title && !text) return;
    const rowErrors = {};
    if (title.length > DETAIL_LIMITS.highlightTitle) rowErrors.title = tooLong(DETAIL_LIMITS.highlightTitle);
    if (!text) rowErrors.text = "Add the text.";
    else if (text.length > DETAIL_LIMITS.highlightText) rowErrors.text = tooLong(DETAIL_LIMITS.highlightText);
    if (Object.keys(rowErrors).length) {
      errors[index] = rowErrors;
      return;
    }
    highlights.push({ ...(title && { title }), text });
  });
  return { highlights, errors };
};

const cleanIncludes = (raw) => {
  const includes = [];
  const errors = {};
  (Array.isArray(raw) ? raw : []).forEach((row, index) => {
    const line = String(row ?? "").trim();
    if (!line) return;
    if (line.length > DETAIL_LIMITS.includeLine) {
      errors[index] = tooLong(DETAIL_LIMITS.includeLine);
      return;
    }
    includes.push(line);
  });
  return { includes, errors };
};

const cleanSpecs = (raw) => {
  const specs = [];
  const errors = {};
  const seen = new Set();
  (Array.isArray(raw) ? raw : []).forEach((row, index) => {
    const label = String(row?.label ?? "").trim();
    const value = String(row?.value ?? "").trim();
    const group = String(row?.group ?? "").trim();
    if (!label && !value) return;
    const rowErrors = {};
    if (group && !SPEC_GROUPS.includes(group)) rowErrors.group = "Choose a group from the list.";
    if (!label) rowErrors.label = "Add a label.";
    else if (label.length > SPEC_LIMITS.label) rowErrors.label = `Use ${SPEC_LIMITS.label} characters or fewer.`;
    if (!value) rowErrors.value = "Add a value.";
    else if (value.length > SPEC_LIMITS.value) rowErrors.value = `Use ${SPEC_LIMITS.value} characters or fewer.`;
    if (Object.keys(rowErrors).length) {
      errors[index] = rowErrors;
      return;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    specs.push({ ...(group && { group }), label, value });
  });
  return { specs, errors };
};

const textKeys = { brand: DETAIL_LIMITS.brand, shortDescription: DETAIL_LIMITS.shortDescription, terms: DETAIL_LIMITS.terms, packSize: DETAIL_LIMITS.packSize };
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const filled = (v, max) => typeof v === "string" && v.trim() !== "" && v.length <= max;

// What seller_save_item keeps for the detail fields a save sends, or { ok: false } where it refuses them (invalid_details).
// Only keys that are present come back, because a save that leaves a key out leaves the stored value alone.
// Like the database, it trims the four text fields and the included lines, and keeps spec and highlight text as sent.
export const storedItemDetails = (f) => {
  const value = {};
  const bad = { ok: false };
  for (const [key, max] of Object.entries(textKeys)) {
    if (!(key in f)) continue;
    if (f[key] !== null && typeof f[key] !== "string") return bad;
    const text = String(f[key] ?? "").trim();
    if (text.length > max) return bad;
    value[key] = text || null;
  }
  if ("highlights" in f) {
    const list = f.highlights ?? [];
    if (!Array.isArray(list) || list.length > DETAIL_LIMITS.highlightRows) return bad;
    value.highlights = [];
    for (const row of list) {
      if (!isRecord(row) || Object.keys(row).some((k) => k !== "title" && k !== "text") || !filled(row.text, DETAIL_LIMITS.highlightText)) return bad;
      if (row.title != null && typeof row.title !== "string") return bad;
      const lead = row.title != null && row.title.trim() !== "";
      if (lead && row.title.length > DETAIL_LIMITS.highlightTitle) return bad;
      value.highlights.push({ ...(lead && { title: row.title }), text: row.text });
    }
  }
  if ("includes" in f) {
    const list = f.includes ?? [];
    if (!Array.isArray(list) || list.length > DETAIL_LIMITS.includeRows || !list.every((t) => typeof t === "string" && filled(t.trim(), DETAIL_LIMITS.includeLine))) return bad;
    value.includes = list.map((t) => t.trim());
  }
  if ("specs" in f) {
    const list = f.specs ?? [];
    if (!Array.isArray(list) || list.length > SPEC_LIMITS.rows) return bad;
    value.specs = [];
    for (const row of list) {
      if (!isRecord(row) || Object.keys(row).some((k) => !["group", "label", "value"].includes(k))) return bad;
      const group = row.group ?? SPEC_DEFAULT_GROUP;
      if (!SPEC_GROUPS.includes(group) || !filled(row.label, SPEC_LIMITS.label) || !filled(row.value, SPEC_LIMITS.value)) return bad;
      value.specs.push({ group, label: row.label, value: row.value });
    }
  }
  return { ok: true, value };
};

export const validateItemForm = (f) => {
  const errors = {};
  const name = String(f.name ?? "").trim();
  if (name.length < 2 || name.length > 120) errors.name = "Use 2 to 120 characters.";
  const description = String(f.description ?? "").trim();
  if (description.length > DETAIL_LIMITS.description) errors.description = tooLong(DETAIL_LIMITS.description);
  const section = String(f.section ?? "").trim();
  if (section.length > 60) errors.section = "Use 60 characters or fewer.";
  const unit = String(f.unit ?? "").trim();
  if (unit.length > 30) errors.unit = "Use 30 characters or fewer.";
  if (!ITEM_PRICE_TYPES.includes(f.priceType)) errors.priceType = "Choose a price type.";
  if (!STATUS_CHOICES.some((c) => c.key === f.availability)) errors.availability = "Choose availability.";

  // Counting stock is optional. When it is on, the count decides the status.
  const trackStock = Boolean(f.trackStock);
  let stockCount = null;
  let lowStockThreshold = 3;
  if (trackStock) {
    const count = String(f.stockCount ?? "").trim();
    if (!/^\d{1,6}$/.test(count)) errors.stockCount = "Enter how many you have, such as 12. Use 0 if none.";
    else stockCount = Number(count);
    const low = String(f.lowStockThreshold ?? "3").trim();
    if (!/^\d{1,4}$/.test(low)) errors.lowStockThreshold = "Enter a whole number, such as 3.";
    else lowStockThreshold = Number(low);
  }

  const price = money(f.price);
  const priceMax = money(f.priceMax);
  const sale = money(f.salePrice);
  let priceValue = null;
  let maxValue = null;
  let saleValue = null;
  if (["fixed", "from", "range"].includes(f.priceType)) {
    if (price.empty) errors.price = "Enter a price.";
    else if (price.error) errors.price = "Enter a number such as 1500.";
    else priceValue = price.value;
    if (f.priceType === "range") {
      if (priceMax.empty) errors.priceMax = "Enter the highest price.";
      else if (priceMax.error) errors.priceMax = "Enter a number such as 2500.";
      else if (priceValue !== null && priceMax.value < priceValue) errors.priceMax = "The highest price must not be below the lowest.";
      else maxValue = priceMax.value;
    }
    if (!sale.empty) {
      if (sale.error) errors.salePrice = "Enter a number such as 1200.";
      else if (priceValue !== null && sale.value >= priceValue) errors.salePrice = "The sale price must be below the regular price.";
      else saleValue = sale.value;
    }
  }
  const cleaned = cleanSpecs(f.specs);
  if (Object.keys(cleaned.errors).length) errors.specs = cleaned.errors;
  if (cleaned.specs.length > SPEC_LIMITS.rows) errors.specsCount = `Use ${SPEC_LIMITS.rows} rows or fewer.`;

  const text = (key, max) => {
    const value = String(f[key] ?? "").trim();
    if (value.length > max) errors[key] = tooLong(max);
    return value;
  };
  const brand = text("brand", DETAIL_LIMITS.brand);
  const shortDescription = text("shortDescription", DETAIL_LIMITS.shortDescription);
  const terms = text("terms", DETAIL_LIMITS.terms);
  const packSize = text("packSize", DETAIL_LIMITS.packSize);
  const hl = cleanHighlights(f.highlights);
  if (Object.keys(hl.errors).length) errors.highlights = hl.errors;
  if (hl.highlights.length > DETAIL_LIMITS.highlightRows) errors.highlightsCount = `Use ${DETAIL_LIMITS.highlightRows} rows or fewer.`;
  const inc = cleanIncludes(f.includes);
  if (Object.keys(inc.errors).length) errors.includes = inc.errors;
  if (inc.includes.length > DETAIL_LIMITS.includeRows) errors.includesCount = `Use ${DETAIL_LIMITS.includeRows} lines or fewer.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name, description, section, unit, priceType: f.priceType, price: priceValue, priceMax: maxValue, salePrice: saleValue, availability: f.availability, trackStock, stockCount, lowStockThreshold, showStockCount: trackStock && Boolean(f.showStockCount),
      ...(Array.isArray(f.specs) && { specs: cleaned.specs }),
      ...(typeof f.brand === "string" && { brand }),
      ...(typeof f.shortDescription === "string" && { shortDescription }),
      ...(Array.isArray(f.highlights) && { highlights: hl.highlights }),
      ...(Array.isArray(f.includes) && { includes: inc.includes }),
      ...(typeof f.terms === "string" && { terms }),
      ...(typeof f.packSize === "string" && { packSize }),
    },
  };
};

export const emptyItemForm = () => ({ name: "", description: "", section: "", unit: "", priceType: "fixed", price: "", priceMax: "", salePrice: "", availability: "available", trackStock: false, stockCount: "", lowStockThreshold: "3", showStockCount: false, specs: [], brand: "", shortDescription: "", highlights: [], includes: [], terms: "", packSize: "" });

export const formFromItem = (i) => ({
  name: i.name, description: i.description ?? "", section: i.section ?? "", unit: i.unit ?? "", priceType: i.priceType,
  price: i.price === null || i.price === undefined ? "" : String(i.price), priceMax: i.priceMax === null || i.priceMax === undefined ? "" : String(i.priceMax),
  salePrice: i.salePrice === null || i.salePrice === undefined ? "" : String(i.salePrice),
  availability: STATUS_CHOICES.some((c) => c.key === statusForForm(i.availability)) ? statusForForm(i.availability) : "available",
  trackStock: Boolean(i.trackStock), stockCount: i.stockCount === null || i.stockCount === undefined ? "" : String(i.stockCount),
  lowStockThreshold: String(i.lowStockThreshold ?? 3), showStockCount: Boolean(i.showStockCount),
  specs: (Array.isArray(i.specs) ? i.specs : []).map((s) => ({ ...(s?.group && { group: s.group }), label: s?.label ?? "", value: s?.value ?? "" })),
  brand: i.brand ?? "", shortDescription: i.shortDescription ?? "", terms: i.terms ?? "", packSize: i.packSize ?? "",
  highlights: (Array.isArray(i.highlights) ? i.highlights : []).map((h) => ({ title: h?.title ?? "", text: h?.text ?? "" })),
  includes: (Array.isArray(i.includes) ? i.includes : []).map((t) => String(t ?? "")),
});
