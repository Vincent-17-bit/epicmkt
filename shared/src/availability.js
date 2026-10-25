// What an item's availability means for customers. One definition, used by the customer app, the seller app and the
// shared card components. See docs/availability.md.
//
//   available, by_appointment -> listed, no marker
//   limited_stock             -> listed, with a "Low stock" tag
//   out_of_stock, unavailable -> not listed to customers

// 'unavailable' is the older word for out of stock. Both mean "not listed".
export const SOLD_OUT = Object.freeze(["out_of_stock", "unavailable"]);

export const isSoldOut = (availability) => SOLD_OUT.includes(availability);

// Customers can be shown this item. A missing value counts as available.
export const isListed = (item) => !isSoldOut(item?.availability ?? "available");

// Drops sold-out items from any list on its way to a customer.
export const listedOnly = (items) => (items ?? []).filter(isListed);

export const isLowStock = (availability) => availability === "limited_stock";

// The words on the low-stock tag: "Only 3 left" when the seller allows the number to show, otherwise "Low stock".
// Returns null when there is nothing to say, so an available item stays silent.
export const stockTag = (item, { low = "Low stock", only = (n) => `Only ${n} left` } = {}) => {
  if (!isLowStock(item?.availability)) return null;
  const left = Number(item.stockLeft);
  return Number.isInteger(left) && left > 0 ? only(left) : low;
};

// What the seller can choose on an item, in plain words. "Unavailable" is not offered: it means the same as out of stock.
export const STATUS_CHOICES = Object.freeze([
  { key: "available", label: "Available" },
  { key: "limited_stock", label: "Low stock" },
  { key: "out_of_stock", label: "Out of stock" },
  { key: "by_appointment", label: "By appointment" }
]);

// Old items may still say 'unavailable'. The form shows them as out of stock, which is what they are.
export const statusForForm = (availability) => (availability === "unavailable" ? "out_of_stock" : availability);

// A counted item gets its status from the count (the database does this too).
export const statusFromCount = (count, lowAt = 3) => (count <= 0 ? "out_of_stock" : count <= lowAt ? "limited_stock" : "available");
