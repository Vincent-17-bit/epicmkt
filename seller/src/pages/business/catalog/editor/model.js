import { ITEM_DETAIL_LIMITS, SPEC_LIMITS, statusFromCount } from "@epicmkt/shared";

// The pure rules of the item editor: which step a field lives in, what is still missing, and how a form reads to a customer.
// Nothing here touches React or the network, so it is tested on its own.

export const STEPS = [
  { id: "media", label: "Media", short: "Media" },
  { id: "basics", label: "Basics", short: "Basics" },
  { id: "price", label: "Price and stock", short: "Price" },
  { id: "details", label: "Details", short: "Details" },
  { id: "review", label: "Review", short: "Review" },
];

export const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);

export const STEP_OF = {
  name: "basics", brand: "basics", section: "basics", shortDescription: "basics", description: "basics",
  priceType: "price", price: "price", priceMax: "price", salePrice: "price", unit: "price", availability: "price", stockCount: "price", lowStockThreshold: "price",
  highlights: "details", highlightsCount: "details", specs: "details", specsCount: "details", includes: "details", includesCount: "details", packSize: "details", terms: "details",
};

// The order errors are looked for in, the same order the fields appear on screen.
const ERROR_ORDER = [
  "name", "brand", "section", "shortDescription", "description",
  "priceType", "price", "priceMax", "salePrice", "unit", "availability", "stockCount", "lowStockThreshold",
  "highlightsCount", "highlights", "specsCount", "specs", "includesCount", "includes", "packSize", "terms",
];

const firstIndex = (obj) => Object.keys(obj).map(Number).sort((a, b) => a - b)[0];

// Where the first problem is: which step to open and which control (data-focus key) to put the cursor in.
export const firstErrorTarget = (errors) => {
  const key = ERROR_ORDER.find((k) => errors[k]);
  if (!key) return null;
  const step = STEP_OF[key] ?? "basics";
  if (key === "highlights") {
    const i = firstIndex(errors.highlights);
    return { key, step, focus: `hl-${i}-${errors.highlights[i].title ? "title" : "text"}` };
  }
  if (key === "specs") {
    const i = firstIndex(errors.specs);
    const row = errors.specs[i];
    return { key, step, focus: `spec-${i}-${row.label ? "label" : row.value ? "value" : "group"}` };
  }
  if (key === "includes") return { key, step, focus: `inc-${firstIndex(errors.includes)}` };
  if (key.endsWith("Count")) return { key, step, focus: `${key}` };
  return { key, step, focus: key };
};


const FIELD_NAMES = {
  name: "Name", brand: "Brand", section: "Section", shortDescription: "Short description", description: "Description",
  priceType: "Price type", price: "Price", priceMax: "Highest price", salePrice: "Sale price", unit: "Unit", availability: "Availability",
  stockCount: "Stock count", lowStockThreshold: "Low stock level", highlightsCount: "Highlights", specsCount: "Specifications", includesCount: "What is included",
  packSize: "Pack size", terms: "Terms",
};

// Every problem validateItemForm found as one flat list, in screen order, each with where to go to fix it.
export const errorList = (errors) => {
  const out = [];
  for (const key of ERROR_ORDER) {
    const value = errors[key];
    if (!value) continue;
    if (key === "highlights") {
      Object.keys(value).map(Number).sort((a, b) => a - b).forEach((i) => Object.entries(value[i]).forEach(([f, message]) => out.push({ key: `hl-${i}-${f}`, step: "details", focus: `hl-${i}-${f}`, label: `Highlight ${i + 1}`, message })));
    } else if (key === "specs") {
      Object.keys(value).map(Number).sort((a, b) => a - b).forEach((i) => Object.entries(value[i]).forEach(([f, message]) => out.push({ key: `spec-${i}-${f}`, step: "details", focus: `spec-${i}-${f}`, label: `Specification ${i + 1}`, message })));
    } else if (key === "includes") {
      Object.keys(value).map(Number).sort((a, b) => a - b).forEach((i) => out.push({ key: `inc-${i}`, step: "details", focus: `inc-${i}`, label: `Included item ${i + 1}`, message: value[i] }));
    } else {
      out.push({ key, step: STEP_OF[key] ?? "basics", focus: key, label: FIELD_NAMES[key] ?? key, message: value });
    }
  }
  return out;
};

// ---- Money ----------------------------------------------------------------------------------------------------------

const parseKes = (raw) => {
  const text = String(raw ?? "").replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return n > 9999999999.99 ? null : n;
};

export const kes = (n) => `KES ${Number(n).toLocaleString("en-KE")}`;

export const PRICED = ["fixed", "from", "range"];

// What the customer is told about stock, from the form as it stands now. null means there is nothing to say.
export const stockStatusOf = (form) => {
  if (form.trackStock) {
    const count = String(form.stockCount ?? "").trim();
    const low = String(form.lowStockThreshold ?? "3").trim();
    if (/^\d{1,6}$/.test(count) && /^\d{1,4}$/.test(low)) return statusFromCount(Number(count), Number(low));
  }
  return form.availability;
};

export const stockLeftOf = (form) => {
  if (!form.trackStock || !form.showStockCount) return null;
  const n = Number(String(form.stockCount ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
};

// "Customers will see KES 1,200 (was KES 1,500), 20% off, Low stock"
export const priceSummary = (form) => {
  const parts = [];
  const price = parseKes(form.price);
  const max = parseKes(form.priceMax);
  const sale = parseKes(form.salePrice);
  if (form.priceType === "free") parts.push("Free");
  else if (form.priceType === "contact") parts.push("Contact for price");
  else if (price === null) parts.push("no price yet");
  else {
    const onSale = sale !== null && sale < price;
    const shown = onSale ? sale : price;
    if (form.priceType === "from") parts.push(`From ${kes(shown)}`);
    else if (form.priceType === "range") parts.push(max !== null && max >= price ? `${kes(price)} to ${kes(max)}` : `${kes(price)} to ...`);
    else parts.push(kes(shown));
    if (onSale) {
      parts[0] += ` (was ${kes(price)})`;
      parts.push(`${Math.round(((price - sale) / price) * 100)}% off`);
    }
  }
  const status = stockStatusOf(form);
  const left = stockLeftOf(form);
  if (status === "limited_stock") parts.push(left ? `Only ${left} left` : "Low stock");
  else if (status === "out_of_stock" || status === "unavailable") parts.push("Out of stock, so customers cannot see it");
  else if (status === "by_appointment") parts.push("By appointment");
  return `Customers will see ${parts.join(", ")}`;
};

// ---- Descriptions ---------------------------------------------------------------------------------------------------

const SHORT_MAX = ITEM_DETAIL_LIMITS.shortDescription;

// The first sentence of a longer description, trimmed to fit the short description. Used for a suggestion the seller accepts.
export const firstSentence = (text, max = SHORT_MAX) => {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const end = flat.search(/[.!?](?:\s|$)/);
  const sentence = end === -1 ? flat : flat.slice(0, end + 1);
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
};

const EXAMPLES = [
  [/barber|salon|beauty|spa|hair|nail|massage/i, "A classic fade finished with a hot towel and a sharp line-up, about 30 minutes."],
  [/food|restaurant|bakery|cafe|coffee|cater|kitchen|cake/i, "Soft vanilla sponge with buttercream frosting, serves 10 people."],
  [/electronic|phone|computer|laptop|tech|gadget|appliance/i, "Dual SIM phone with a 6.5 inch screen, 128 GB storage and a 2 year warranty."],
  [/fashion|cloth|shoe|boutique|tailor|wear|apparel/i, "Breathable cotton shirt in three colours, sizes S to XL."],
  [/hardware|build|furniture|home|garden|paint|tool/i, "Solid pine table that seats six, delivered and assembled."],
  [/pharma|health|clinic|chemist|medic/i, "Vitamin C tablets, 60 per bottle, with free delivery in town."],
  [/auto|car|garage|motor|tyre|tire/i, "Full service with oil and filter change, done in about 2 hours."],
];
export const GENERIC_EXAMPLE = "One line on what it is and why someone would pick it.";

export const exampleShortFor = (category) => {
  const name = String(category ?? "");
  const hit = EXAMPLES.find(([re]) => re.test(name));
  return hit ? hit[1] : GENERIC_EXAMPLE;
};

// ---- Quality --------------------------------------------------------------------------------------------------------

const filled = (s) => String(s ?? "").trim().length > 0;

// What would make the listing better. Advisory only: nothing here ever stops a save (validateItemForm does that).
// `focus` is the data-focus key to put the cursor in when the seller taps the suggestion.
export const qualityChecks = (form, mediaCount = 0) => {
  const pricedType = PRICED.includes(form.priceType);
  return [
    { id: "photo", weight: 25, done: mediaCount > 0, step: "media", focus: "media-add", todo: "Add a photo", done_text: "Has a photo" },
    { id: "name", weight: 5, done: String(form.name ?? "").trim().length >= 2, step: "basics", focus: "name", todo: "Give it a name", done_text: "Has a name" },
    { id: "short", weight: 15, done: filled(form.shortDescription), step: "basics", focus: "shortDescription", todo: "Add a short description", done_text: "Has a short description" },
    { id: "description", weight: 15, done: String(form.description ?? "").trim().length >= 60, step: "basics", focus: "description", todo: "Write the full description", done_text: "Has a full description" },
    { id: "section", weight: 5, done: filled(form.section), step: "basics", focus: "section", todo: "Choose a section", done_text: "Has a section" },
    { id: "price", weight: 15, done: !pricedType || parseKes(form.price) !== null, step: "price", focus: "price", todo: "Set a price", done_text: "Has a price" },
    { id: "highlights", weight: 10, done: (form.highlights ?? []).some((h) => filled(h.text)), step: "details", focus: "add-highlight", todo: "Add 1 highlight", done_text: "Has highlights" },
    { id: "specs", weight: 10, done: (form.specs ?? []).some((s) => filled(s.label) && filled(s.value)), step: "details", focus: "add-spec", todo: "Add 1 specification", done_text: "Has specifications" },
  ];
};

export const qualityScore = (checks) => checks.reduce((sum, c) => sum + (c.done ? c.weight : 0), 0);

export const qualityLabel = (score) => (score >= 100 ? "Complete" : score >= 70 ? "Looking good" : score >= 40 ? "Getting there" : "Just started");

// Which steps look finished, for the ticks in the section navigation.
export const stepDone = (id, form, mediaCount) => {
  if (id === "media") return mediaCount > 0;
  if (id === "basics") return String(form.name ?? "").trim().length >= 2;
  if (id === "price") return !PRICED.includes(form.priceType) || parseKes(form.price) !== null;
  if (id === "details") return (form.highlights?.length ?? 0) + (form.specs?.length ?? 0) + (form.includes?.length ?? 0) > 0 || filled(form.packSize) || filled(form.terms) || filled(form.brand);
  return false;
};

// ---- Preview --------------------------------------------------------------------------------------------------------

// The form, reshaped the way the customer components expect an item.
export const previewItemOf = (form, images = []) => {
  const price = PRICED.includes(form.priceType) ? parseKes(form.price) : null;
  const sale = price !== null ? parseKes(form.salePrice) : null;
  const shown = price !== null && sale !== null && sale < price ? sale : price;
  const pricing = price === null ? null : {
    regularPrice: price, salePrice: shown, savings: price - shown,
    discountPercent: price > 0 ? Math.round(((price - shown) / price) * 100) : 0, variants: [],
  };
  const max = form.priceType === "range" ? parseKes(form.priceMax) : null;
  return {
    id: "preview",
    name: String(form.name ?? "").trim() || "Item name",
    imageUrl: images[0] ?? null,
    pricing,
    priceType: form.priceType,
    priceMax: max,
    availability: stockStatusOf(form) ?? "available",
    stockLeft: stockLeftOf(form),
    offer: null,
  };
};

export const LIMITS = { ...ITEM_DETAIL_LIMITS, spec: SPEC_LIMITS, name: 120, section: 60, unit: 30, description: 2000 };

export const SPEC_PRESETS = [
  { label: "Material", group: "Features & Specs" },
  { label: "Color", group: "Features & Specs" },
  { label: "Dimensions (D x W x H)", group: "Measurements" },
  { label: "Weight", group: "Measurements" },
  { label: "Brand", group: "Item details" },
  { label: "Special feature", group: "Features & Specs" },
  { label: "Mounting type", group: "Features & Specs" },
  { label: "Recommended uses", group: "Features & Specs" },
  { label: "Size", group: "Measurements" },
  { label: "Capacity", group: "Measurements" },
];

export const moved = (list, from, to) => {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [one] = next.splice(from, 1);
  next.splice(to, 0, one);
  return next;
};
