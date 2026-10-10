// Item-level category templates: the extra fields that describe ONE product or service in a category.
// Category templates elsewhere (client/src/data/categories.js keyFields, backend categories fields) describe the
// BUSINESS (delivery fee, payment methods, chairs) and are not shown on items.
//
// One source of truth, keyed by the database category id (the ids in client/src/data/categories.js, which is what
// scripts/seed.mjs writes to categories.item_template). The mock backend's own category ids map onto them through
// ITEM_TEMPLATE_ALIASES. Fields use the shared template format, so validateTemplate / validateAttributes /
// the seller form's generic renderer all apply. An empty list means "nothing beyond the built-in item fields".
//
// Rule for this file: at most MAX_ITEM_TEMPLATE_FIELDS per category, and only where the field describes one item.

export const MAX_ITEM_TEMPLATE_FIELDS = 5;

const opts = (list) => list.map((v) => (Array.isArray(v) ? { value: v[0], label: v[1] } : { value: v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), label: v }));
const field = (type, key, label, extra = {}) => ({ key, label, type, ...extra });
const flag = (key, label, extra) => field("boolean", key, label, { filterable: true, ...extra });
const choice = (key, label, list, extra) => field("select", key, label, { options: opts(list), filterable: true, ...extra });
const multi = (key, label, list, extra) => field("multiselect", key, label, { options: opts(list), filterable: true, ...extra });
const amount = (key, label, extra) => field("number", key, label, extra);
const money = (key, label, extra) => field("price", key, label, extra);
const text = (key, label, extra) => field("text", key, label, extra);

const TURNAROUND = ["While you wait", "Same day", "1 to 2 days", "3 to 7 days", "More than a week"];
const WARRANTY = ["None", "7 days", "30 days", "3 months", "6 months", "1 year or more"];
const CONDITION = ["New", "Refurbished", "Second-hand"];

export const ITEM_TEMPLATES = {
  "water-refill": [
    choice("container-size", "Container size", ["5 L", "10 L", "20 L", "Bulk tank"], { showOnCard: true }),
    choice("sale-type", "What is sold", ["Refill", "New container with water", "Empty container only"]),
  ],
  "lpg-gas": [
    choice("cylinder-size", "Cylinder size", ["3 kg", "6 kg", "13 kg", "22.5 kg", "50 kg"], { showOnCard: true }),
    text("brand", "Brand", { searchable: true }),
    choice("sale-type", "What is sold", ["Refill", "New cylinder with gas", "Empty cylinder only"]),
  ],
  bakery: [
    multi("dietary", "Dietary", ["Eggless", "Vegan", "Sugar-free", "Gluten-free"], { showOnCard: true }),
    amount("serves", "Serves", { unit: "people" }),
    flag("made-to-order", "Made to order"),
    amount("notice-days", "Notice needed", { unit: "days", showIf: { key: "made-to-order", equals: true } }),
  ],
  "juice-shop": [
    choice("size", "Size", ["Small (300 ml)", "Medium (500 ml)", "Large (1 L)"], { showOnCard: true }),
    flag("no-added-sugar", "No added sugar"),
    flag("fresh-pressed", "Fresh pressed"),
  ],
  "restaurant-cafe": [
    choice("spice-level", "Spice level", ["Mild", "Medium", "Hot"], { showOnCard: true }),
    flag("vegetarian", "Vegetarian"),
    flag("halal", "Halal"),
    amount("prep-time", "Preparation time", { unit: "minutes" }),
    amount("serves", "Serves", { unit: "people" }),
  ],
  butchery: [
    choice("meat", "Meat", ["Beef", "Goat", "Mutton", "Pork", "Chicken", "Fish", "Offals", "Sausages"], { showOnCard: true }),
    choice("cut", "Cut", ["On the bone", "Boneless", "Minced", "Cubed", "Whole"]),
    flag("halal", "Halal", { showOnCard: true }),
  ],
  greengrocer: [
    flag("organic", "Organic", { showOnCard: true }),
    flag("locally-grown", "Locally grown"),
    text("pack-size", "Pack size"),
  ],
  "supermarket-minimart": [
    text("brand", "Brand", { searchable: true }),
    text("pack-size", "Pack size"),
    text("barcode", "Barcode", { searchable: true }),
  ],
  chemist: [
    flag("prescription-required", "Prescription required", { showOnCard: true }),
    choice("dosage-form", "Form", ["Tablet", "Capsule", "Syrup", "Cream or ointment", "Drops", "Injection", "Inhaler", "Other"]),
    text("strength", "Strength"),
    text("active-ingredient", "Active ingredient", { searchable: true }),
  ],
  clinic: [
    flag("fasting-required", "Fasting required"),
    choice("results-time", "Results", TURNAROUND),
    choice("age-group", "Who it is for", ["Adults", "Children", "Everyone"]),
  ],
  optician: [
    choice("lens-type", "Lens type", ["Single vision", "Bifocal", "Progressive", "Contact lenses"]),
    flag("frame-included", "Frame included"),
    choice("ready-in", "Ready in", TURNAROUND),
  ],
  barbershop: [],
  "salon-beauty": [],
  "spa-massage": [
    choice("pressure", "Pressure", ["Light", "Medium", "Firm"]),
    flag("couples-session", "Couples session"),
  ],
  "gym-fitness": [],
  agrovet: [
    text("brand", "Brand", { searchable: true }),
    text("pack-size", "Pack size"),
    multi("suitable-for", "Suitable for", ["Cattle", "Poultry", "Goats and sheep", "Pigs", "Crops"], { showOnCard: true }),
  ],
  "cyber-cafe": [choice("turnaround", "Turnaround", TURNAROUND)],
  "phone-repair": [
    choice("turnaround", "Turnaround", TURNAROUND, { showOnCard: true }),
    choice("warranty", "Repair warranty", WARRANTY, { showOnCard: true }),
    flag("parts-included", "Parts included"),
    choice("part-quality", "Part quality", ["Original", "OEM or grade A", "Generic"]),
  ],
  "electronics-appliances": [
    text("brand", "Brand", { searchable: true }),
    text("model", "Model", { searchable: true }),
    choice("condition", "Condition", CONDITION, { showOnCard: true }),
    choice("warranty", "Warranty", WARRANTY),
  ],
  "printing-stationery": [
    choice("paper-size", "Paper size", ["A5", "A4", "A3", "Other"]),
    choice("colour", "Colour", ["Black and white", "Colour"]),
    choice("turnaround", "Turnaround", TURNAROUND),
  ],
  "mpesa-airtime-agent": [],
  "hardware-building": [
    text("brand", "Brand", { searchable: true }),
    text("size-grade", "Size or grade"),
  ],
  "plumbing-electrical": [
    money("callout-fee", "Call-out fee"),
    flag("materials-included", "Materials included"),
    choice("warranty", "Work guarantee", WARRANTY),
  ],
  "furniture-carpentry": [
    choice("material", "Material", ["Hardwood", "Softwood", "Board or MDF", "Metal", "Other"]),
    text("dimensions", "Dimensions"),
    flag("made-to-order", "Made to order"),
    amount("lead-time-days", "Lead time", { unit: "days", showIf: { key: "made-to-order", equals: true } }),
  ],
  "cleaning-laundry": [
    choice("turnaround", "Turnaround", TURNAROUND),
    flag("pickup-included", "Pickup included"),
  ],
  "tailor-boutique": [
    multi("sizes", "Sizes", ["XS", "S", "M", "L", "XL", "XXL", "Kids"]),
    choice("condition", "Condition", CONDITION),
    flag("made-to-measure", "Made to measure"),
    amount("lead-time-days", "Lead time", { unit: "days", showIf: { key: "made-to-measure", equals: true } }),
    choice("fabric-supplied", "Fabric", ["Customer brings it", "Shop supplies it", "Either"], { showIf: { key: "made-to-measure", equals: true } }),
  ],
  "shoes-cobbler": [
    text("sizes", "Sizes available (EU)"),
    choice("condition", "Condition", CONDITION),
    choice("material", "Material", ["Leather", "Synthetic", "Canvas", "Other"]),
  ],
  "garage-mechanic": [
    choice("vehicle-type", "Vehicle", ["Cars and pickups", "Motorbikes", "Trucks and buses", "All vehicles"]),
    flag("parts-included", "Parts included"),
    choice("warranty", "Work guarantee", WARRANTY),
  ],
  "car-wash": [
    choice("vehicle-size", "Vehicle size", ["Motorbike", "Saloon", "SUV", "Pickup or van", "Truck or bus"], { showOnCard: true }),
    flag("interior-included", "Interior included"),
  ],
  "auto-spare-parts": [
    choice("part-condition", "Part condition", ["New genuine", "New aftermarket", "Used"], { showOnCard: true }),
    text("fits", "Fits (make, model, year)", { searchable: true }),
    text("brand", "Brand", { searchable: true }),
    choice("warranty", "Warranty", WARRANTY),
  ],
  "photography-events": [
    amount("hours-covered", "Hours covered", { unit: "hours" }),
    amount("edited-photos", "Edited photos", { unit: "photos" }),
    amount("turnaround-days", "Photos ready in", { unit: "days" }),
    flag("travel-included", "Travel included"),
    flag("printed-album", "Printed album included"),
  ],
  "tuition-daycare": [
    choice("age-group", "Age group", ["Babies", "Toddlers", "Nursery", "Primary", "Secondary", "Adults"], { showOnCard: true }),
    amount("class-size", "Class size", { unit: "children" }),
    flag("meals-included", "Meals included"),
    text("subjects", "Subjects", { searchable: true }),
  ],
};

// The mock backend (backend/src/data/categories.js) uses its own ids. They resolve to the database ids here.
export const ITEM_TEMPLATE_ALIASES = {
  barbershops: "barbershop",
  chemists: "chemist",
  agrovets: "agrovet",
  gyms: "gym-fitness",
  salons: "salon-beauty",
  tailors: "tailor-boutique",
  hardware: "hardware-building",
  mpesa: "mpesa-airtime-agent",
  groceries: "greengrocer",
  eateries: "restaurant-cafe",
  mechanics: "garage-mechanic",
};

export const canonicalCategoryId = (id) => ITEM_TEMPLATE_ALIASES[id] ?? id;

// A fresh copy each call, so callers can never mutate the shared definitions.
export const itemTemplateFor = (categoryId) => structuredClone(ITEM_TEMPLATES[canonicalCategoryId(categoryId)] ?? []);

// Keeps only attributes the item template knows about. Items saved before item templates existed may carry
// business-level keys; they are dropped the next time the item is saved, never rejected.
export function knownAttributes(fields = [], attributes = {}) {
  const keys = new Set(fields.map((f) => f.key));
  return Object.fromEntries(Object.entries(attributes ?? {}).filter(([k]) => keys.has(k)));
}
