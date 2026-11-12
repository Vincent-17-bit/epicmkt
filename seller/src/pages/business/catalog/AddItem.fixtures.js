// Stand-in data in the Contract v1 shapes, used until A06 (seller_product_types) and A08 (departments, restrictedTo) are merged.
// It is only ever read in local dev and tests: AddItem.data.js refuses it in a production build.
// TODO(contract:A06) replace with shared/src/contracts/fixtures when that folder lands, then delete this file.
// TODO(contract:A08) `restrictedTo` is assumed to hold shop category ids (for example "chemist", "agrovet").

export const DEPARTMENTS = [
  { id: "dep-clothing", name: "Clothing" },
  { id: "dep-shoes", name: "Shoes" },
  { id: "dep-bags", name: "Bags" },
  { id: "dep-jewellery", name: "Jewellery" },
  { id: "dep-fragrance", name: "Fragrance" },
  { id: "dep-phones", name: "Phones" },
  { id: "dep-computers", name: "Computers" },
  { id: "dep-cables", name: "Cables and power" },
  { id: "dep-lighting", name: "Lighting" },
  { id: "dep-batteries", name: "Batteries" },
  { id: "dep-printers", name: "Printers and ink" },
  { id: "dep-printing", name: "Printing services" },
  { id: "dep-stationery", name: "Stationery" },
  { id: "dep-health", name: "Health" },
  { id: "dep-farm", name: "Farm and vet supplies" },
];

// The usual options for a type: { key, label, display, scale? }. `scale` (a shared scale id) makes the seller's typed values read the same way
// everywhere ("128gb" -> "128 GB", "1024 GB" -> "1 TB"). TODO(contract:A06) the real seller_product_types carries these.
const COLOUR = { key: "colour", label: "Colour", display: "swatch" };
const type = (slug, name, departmentId, categoryIds, extra = {}) => ({
  id: `pt-${slug}`, slug, name, kind: "good", departmentId, categoryIds, quantityMode: "units", axes: [], specRows: [], ...extra,
});

const FASHION = ["tailor-boutique", "fashion-boutiques"];
const ELECTRONICS = ["electronics-appliances", "electronics-computers"];
const STATIONERS = ["printing-stationery"];

export const PRODUCT_TYPES = [
  type("dress", "Dress", "dep-clothing", FASHION, { axes: [COLOUR, { key: "size", label: "Size", display: "button", scale: "apparel-alpha" }] }),
  type("shoes", "Shoes", "dep-shoes", FASHION, { axes: [{ key: "size", label: "Size", display: "button" }, { key: "width", label: "Width", display: "button" }] }),
  type("perfume", "Perfume", "dep-fragrance", FASHION, { axes: [{ key: "size", label: "Size", display: "button" }] }),
  type("phone", "Phone", "dep-phones", ELECTRONICS, { axes: [COLOUR, { key: "storage", label: "Storage", display: "button", scale: "storage" }] }),
  type("phone-charger", "Phone charger", "dep-cables", ELECTRONICS),
  type("led-bulb", "LED bulb", "dep-lighting", ELECTRONICS),
  type("a4-paper", "A4 paper", "dep-stationery", STATIONERS),
  type("pens", "Pens", "dep-stationery", STATIONERS),
  type("a4-printing", "A4 printing", "dep-printing", STATIONERS, { kind: "service", quantityMode: "none" }),
  type("pain-relief", "Pain relief tablets (over the counter)", "dep-health", ["chemist"]),
  type("prescription-medicine", "Prescription medicine", "dep-health", ["chemist"], { restrictedTo: ["chemist"] }),
  type("vet-medicine", "Veterinary medicine", "dep-farm", ["agrovet"], { restrictedTo: ["agrovet"] }),
];

// What the server returns: restricted types are left out for shops that may not sell them.
export const fixtureProductTypes = ({ categoryId } = {}) => ({
  types: PRODUCT_TYPES.filter((t) => !t.restrictedTo?.length || t.restrictedTo.includes(categoryId)),
  departments: DEPARTMENTS,
});
