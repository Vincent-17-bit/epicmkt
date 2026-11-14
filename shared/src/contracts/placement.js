import { PRODUCT_TYPES } from "./productTypes.js";

export const TYPE_DEPARTMENTS = [
  { id: "phones", name: "Phones" },
  { id: "computers", name: "Computers" },
  { id: "shoes", name: "Shoes" },
  { id: "jewellery", name: "Jewellery" },
  { id: "fragrance", name: "Fragrance" },
  { id: "lighting", name: "Lighting" },
  { id: "printing-services", name: "Printing services" },
  { id: "water-energy", name: "Water and energy" },
  { id: "food-drink", name: "Food and drink" },
  { id: "furniture", name: "Furniture" }
];

export const TYPE_PLACEMENT = {
  phone: { departmentId: "phones", categoryIds: ["phones-accessories", "electronics-computers", "electronics-appliances", "phone-repair"] },
  "memory-card": { departmentId: "computers", categoryIds: ["electronics-computers", "phones-accessories"] },
  "shoes-eu": { departmentId: "shoes", categoryIds: ["shoes-cobbler", "fashion-boutiques"] },
  table: { departmentId: "furniture", categoryIds: ["furniture-carpentry", "home-kitchen"] },
  sofa: { departmentId: "furniture", categoryIds: ["furniture-carpentry"] },
  bread: { departmentId: "food-drink", categoryIds: ["bakery", "supermarket-minimart", "restaurant-cafe"] },
  "drinking-water": { departmentId: "water-energy", categoryIds: ["water-refill", "supermarket-minimart"] },
  "led-strip": { departmentId: "lighting", categoryIds: ["electronics-appliances", "plumbing-electrical", "hardware-building"] },
  "led-bulb": { departmentId: "lighting", categoryIds: ["electronics-appliances", "plumbing-electrical", "hardware-building"] },
  printing: { departmentId: "printing-services", categoryIds: ["printing-stationery", "cyber-cafe"] },
  "meat-by-weight": { departmentId: "food-drink", categoryIds: ["butchery", "supermarket-minimart"] },
  "gold-necklace": { departmentId: "jewellery", categoryIds: ["fashion-boutiques", "tailor-boutique", "salon-beauty"] },
  fragrance: { departmentId: "fragrance", categoryIds: ["salon-beauty", "fashion-boutiques", "tailor-boutique", "supermarket-minimart"] },
  liquor: { departmentId: "food-drink", categoryIds: ["supermarket-minimart"] }
};

const kindOf = (t) => (t.group === "services" ? "service" : "good");
const quantityModeOf = (t) => (t.itemFields.includes("quantity") ? "measure" : "units");

export const sellerTypeRows = () =>
  PRODUCT_TYPES.map((t) => ({
    id: t.id, slug: t.id, name: t.name, kind: kindOf(t),
    departmentId: TYPE_PLACEMENT[t.id].departmentId, categoryIds: [...TYPE_PLACEMENT[t.id].categoryIds],
    quantityMode: quantityModeOf(t), axes: t.axes ?? [], specRows: t.specRows ?? []
  }));

export const sellerProductTypesPayload = () => {
  const used = new Set(sellerTypeRows().map((t) => t.departmentId));
  return { departments: TYPE_DEPARTMENTS.filter((d) => used.has(d.id)), types: sellerTypeRows() };
};
