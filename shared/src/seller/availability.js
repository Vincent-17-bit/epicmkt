// Availability states a seller can choose, and a preview of the database stock trigger.
// The trigger public.apply_stock_rules (supabase/migrations/0005_seller_portal.sql) is the authority:
// the UI uses applyStockRules only to show what will happen, then adopts the status the database returns.

export const AVAILABILITY = [
  { value: "available", label: "Available", hint: "Ready to order or book" },
  { value: "limited_stock", label: "Limited stock", hint: "Only a few left" },
  { value: "out_of_stock", label: "Out of stock", hint: "Cannot be ordered right now" },
  { value: "seasonal", label: "Seasonal", hint: "Only sold in certain months", needs: "season" },
  { value: "by_appointment", label: "By appointment", hint: "Customers must book first" },
  { value: "coming_soon", label: "Coming soon", hint: "Not on sale yet", needs: "expected" },
];

// Older rows may hold "unavailable". It is shown, but not offered for new choices.
export const LEGACY_AVAILABILITY = [{ value: "unavailable", label: "Unavailable", hint: "" }];

export const availabilityLabel = (value) =>
  [...AVAILABILITY, ...LEGACY_AVAILABILITY].find((a) => a.value === value)?.label ?? value;

// Statuses the stock trigger may overwrite. Seasonal, by appointment and coming soon are never touched.
export const STOCK_DRIVEN = ["available", "limited_stock", "out_of_stock"];

const hasCount = (item) => Number.isInteger(item.stockCount) && item.stockCount >= 0;

export const isStockDriven = (item) =>
  Boolean(item.trackStock) && hasCount(item) && STOCK_DRIVEN.includes(item.availability);

// Same decision table as the SQL trigger. Returns the availability the database will store.
export function applyStockRules(item) {
  if (!isStockDriven(item)) return item.availability;
  const low = Number.isInteger(item.lowStockThreshold) ? item.lowStockThreshold : 3;
  if (item.stockCount <= 0) return "out_of_stock";
  if (item.stockCount <= low) return "limited_stock";
  return "available";
}

// One plain sentence for the form, for example "4 left is at or below 5, so this shows as Limited stock."
export function stockExplanation(item) {
  if (!item.trackStock) return "";
  if (!hasCount(item)) return "Enter how many you have and the status will follow it.";
  if (!STOCK_DRIVEN.includes(item.availability)) {
    return `Status is set by you (${availabilityLabel(item.availability)}), so stock changes will not alter it.`;
  }
  const low = Number.isInteger(item.lowStockThreshold) ? item.lowStockThreshold : 3;
  const next = applyStockRules(item);
  if (next === "out_of_stock") return "0 in stock, so this shows as Out of stock.";
  if (next === "limited_stock") return `${item.stockCount} in stock is at or below ${low}, so this shows as Limited stock.`;
  return `${item.stockCount} in stock is above ${low}, so this shows as Available.`;
}

// What the shopper sees when "Show only N left" is on.
export function stockBadge(item) {
  if (!item.trackStock || !item.showStockCount || !hasCount(item) || item.stockCount <= 0) return "";
  const next = applyStockRules(item);
  return next === "limited_stock" ? `Only ${item.stockCount} left` : "";
}
