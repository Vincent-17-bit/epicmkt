import { z } from "zod";
import { LIMITS, TERMS, ITEM_KINDS, PRICE_TYPES, BADGES, AVAILABILITY, LEGACY_AVAILABILITY, priceNeeds, validateAttributes } from "@epicmkt/shared";

const money = z
  .number({ invalid_type_error: "Enter a whole number" })
  .int("Whole shillings only, no cents")
  .min(0, "Cannot be negative")
  .max(LIMITS.price, "That is too large")
  .nullable();
const date = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Choose a date");
const text = (max, what = "Text") => z.string().max(max, `${what} can be up to ${max} characters`);
const oneOf = (list) => z.enum(list.map((x) => x.value ?? x));

const shape = z.object({
  name: z.string().trim().min(2, "Enter a name of at least 2 characters").max(LIMITS.name, `Name can be up to ${LIMITS.name} characters`),
  kind: oneOf(ITEM_KINDS),
  section: text(LIMITS.section, "Section"),
  shortDescription: text(LIMITS.shortDescription, "Short description"),
  description: text(LIMITS.description, "Description"),
  priceType: oneOf(PRICE_TYPES),
  price: money,
  priceMax: money,
  unit: text(LIMITS.unit, "Unit"),
  salePrice: money,
  saleStarts: date,
  saleEnds: date,
  searchTags: z.array(z.string().trim().min(1).max(LIMITS.tagLength, `Each tag can be up to ${LIMITS.tagLength} characters`)).max(LIMITS.tags, `Up to ${LIMITS.tags} tags`),
  visible: z.boolean(),
  badge: z.enum(["", ...BADGES]),
  variants: z
    .array(z.object({ id: z.string(), label: z.string().trim().min(1, "Name this option").max(40, "Up to 40 characters"), price: money.refine((v) => v !== null, "Enter a price") }))
    .max(LIMITS.variants, `Up to ${LIMITS.variants} options`),
  specs: z
    .array(z.object({ label: z.string().trim().min(1, "Enter a label").max(40, "Up to 40 characters"), value: z.string().trim().min(1, "Enter a value").max(100, "Up to 100 characters") }))
    .max(LIMITS.specs, `Up to ${LIMITS.specs} specifications`),
  includes: z.array(z.string().trim().min(1, "Cannot be empty").max(80, "Up to 80 characters")).max(LIMITS.includes, `Up to ${LIMITS.includes} lines`),
  terms: text(LIMITS.terms, "Terms"),
  availability: oneOf([...AVAILABILITY, ...LEGACY_AVAILABILITY]),
  seasonFrom: date,
  seasonTo: date,
  expectedDate: date,
  trackStock: z.boolean(),
  stockCount: z.number({ invalid_type_error: "Enter a whole number" }).int("Whole numbers only").min(0, "Cannot be negative").max(1_000_000, "That is too large").nullable(),
  lowStockThreshold: z.number({ invalid_type_error: "Enter a whole number" }).int("Whole numbers only").min(0, "Cannot be negative").max(1000, "Up to 1000"),
  showStockCount: z.boolean(),
  restockDate: date,
  service: z.object({
    duration: z.number({ invalid_type_error: "Enter minutes" }).int("Whole minutes only").min(1, "At least 1 minute").max(1440, "Up to 1440 minutes (24 hours)").nullable(),
    homeService: z.boolean(),
    appointmentNeeded: z.boolean(),
    staff: z.array(z.string().trim().min(1).max(40, "Up to 40 characters")).max(LIMITS.staff, `Up to ${LIMITS.staff} people`),
    addOns: z.array(z.object({ label: z.string().trim().min(1, "Name this add-on").max(40, "Up to 40 characters"), price: money })).max(LIMITS.addOns, `Up to ${LIMITS.addOns} add-ons`),
  }),
  membership: z.object({
    term: z.enum(TERMS.map((t) => t.value)),
    daysTimes: text(200),
    trainer: text(60),
    joiningFee: money,
    peakPrice: money,
    offPeakPrice: money,
    peakHours: text(100),
    offPeakHours: text(100),
  }),
  attributes: z.record(z.unknown()),
});

const flat = (path) => path.join(".");

// Returns { ok, errors } where errors maps "price", "service.duration", "variants.0.label", "attributes.booking" to a message.
// Row autosave uses strict:false (incomplete rows may be saved); the first-item form uses strict:true.
export function validateItem(item, { fields = [], strict = false } = {}) {
  const errors = {};
  const put = (path, message) => { if (!(path in errors)) errors[path] = message; };
  const parsed = shape.safeParse(item);
  if (!parsed.success) for (const issue of parsed.error.issues) put(flat(issue.path), issue.message);

  const needs = priceNeeds(item.priceType);
  const sold = item.priceType === "fixed" || item.priceType === "from";
  if (strict && needs.price && item.price == null) put("price", item.priceType === "range" ? "Enter the lowest price" : "Enter a price");
  if (strict && needs.max && item.priceMax == null) put("priceMax", "Enter the highest price");
  if (needs.max && item.price != null && item.priceMax != null && item.priceMax <= item.price) put("priceMax", "Must be higher than the lowest price");
  if (item.salePrice != null) {
    if (!sold) put("salePrice", "Sale prices work with fixed or starting prices");
    else if (item.price == null) put("salePrice", "Enter the normal price first");
    else if (item.salePrice >= item.price) put("salePrice", "Must be lower than the normal price");
  }
  if ((item.saleStarts || item.saleEnds) && item.salePrice == null) put("salePrice", "Enter the sale price, or clear the dates");
  if (item.saleStarts && item.saleEnds && item.saleEnds < item.saleStarts) put("saleEnds", "Cannot be before the start date");

  if (item.availability === "seasonal") {
    if (strict && !item.seasonFrom) put("seasonFrom", "Choose when the season starts");
    if (strict && !item.seasonTo) put("seasonTo", "Choose when the season ends");
    if (item.seasonFrom && item.seasonTo && item.seasonTo < item.seasonFrom) put("seasonTo", "Cannot be before the start");
  }
  if (strict && item.availability === "coming_soon" && !item.expectedDate) put("expectedDate", "Choose the expected date");
  if (strict && item.trackStock && item.stockCount == null) put("stockCount", "Enter how many you have");

  const fieldsNoRequired = fields.map((f) => ({ ...f, required: false }));
  for (const [key, message] of Object.entries(validateAttributes(fieldsNoRequired, item.attributes ?? {}))) put(`attributes.${key}`, message);

  return { ok: Object.keys(errors).length === 0, errors };
}

// Which top-level field a path belongs to, so a row can mark the right cell.
export const errorFor = (errors, key) =>
  errors[key] ?? Object.entries(errors).find(([p]) => p.startsWith(`${key}.`))?.[1] ?? "";
