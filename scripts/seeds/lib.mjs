// Tiny helpers so each seed file reads like the table it comes from. Pure data, no I/O.

export const slug = (s) => String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** An option axis. values: labels to suggest (the seller may add more). open: the typed-value kind (colour, material, brand ...). */
export const ax = (key, label, { display = "button", scale, values, dependsOn, open, sizeChart } = {}) => ({
  key, label, display,
  ...(scale ? { scale } : {}),
  ...(values ? { suggested: values.map((v) => (typeof v === "string" ? { id: slug(v), label: v } : v)) } : {}),
  ...(dependsOn ? { dependsOn } : {}),
  ...(open ? { open } : {}),
  ...(sizeChart ? { sizeChart } : {})
});
export const colour = (label = "Colour") => ax("colour", label, { display: "swatch", open: "colour" });

// Spec rows. t text, c choice, o open (typed) value, n number, b yes/no, d dimension.
const row = (input, key, label, extra = {}) => ({ key, label, input, ...extra });
export const t = (key, label, extra) => row("text", key, label, extra);
export const n = (key, label, extra) => row("number", key, label, extra);
export const b = (key, label, extra) => row("boolean", key, label, extra);
export const d = (key, label, extra) => row("dimension", key, label, extra);
export const o = (key, label, extra) => row("openValue", key, label, extra);
export const c = (key, label, choices, extra) => row("choice", key, label, { choices, ...extra });
/** A choice row whose answers come from a shared label set (authenticity, fragranceState ...). */
export const ls = (key, label, labelSet, extra) => row("choice", key, label, { labelSet, ...extra });
export const req = (r) => ({ ...r, level: "required" });
export const rec = (r) => ({ ...r, level: "recommended" });
/** Required only when another row's value carries a tag (purity when the material is gold or silver). */
export const reqIf = (r, cond) => ({ ...r, level: "optional", requiredIf: cond });
export const precious = { row: "material", tag: "precious-metal" };

/** A product type, in the camelCase shape validateProductType checks. */
export const type = (id, name, { kind = "good", dept, cats, restrict = [], qty, axes = [], rows = [], x = {} }) => ({
  id, slug: id, name, kind,
  departmentId: dept, categoryIds: cats, restrictedTo: restrict,
  quantityMode: qty ?? (kind === "service" ? "none" : "units"),
  axes, specRows: rows, extras: x
});

/** Price-step starts for a service priced by quantity (the seller fills in the prices). */
export const tiers = (...starts) => ({
  mode: "whole",
  tiers: starts.map((minQty, i) => ({ minQty, maxQty: i + 1 < starts.length ? starts[i + 1] - 1 : null, unitPrice: null }))
});

export const FASHION_SHOPS = ["fashion-boutiques", "tailor-boutique"];
export const SHOE_SHOPS = ["shoes-cobbler", "fashion-boutiques", "tailor-boutique"];
export const BEAUTY_SHOPS = ["salon-beauty", "fashion-boutiques", "supermarket-minimart"];
export const PHONE_SHOPS = ["phones-accessories", "electronics-computers", "electronics-appliances"];
export const COMPUTER_SHOPS = ["electronics-computers", "electronics-appliances", "phones-accessories"];
export const ELECTRICAL_SHOPS = ["electronics-appliances", "electronics-computers", "plumbing-electrical", "hardware-building"];
export const PRINT_SHOPS = ["cyber-cafe", "printing-stationery"];
