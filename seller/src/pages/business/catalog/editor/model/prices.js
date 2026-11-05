// Slice "prices": owns these form keys. See ../README.md for how to add a slice.
export const pricesSlice = {
  id: "prices",
  keys: ["priceType", "price", "priceMax", "salePrice", "unit", "availability", "trackStock", "stockCount", "lowStockThreshold", "showStockCount", "variants" /* TODO(contract:B07): variants move to the options slice */],
  // Optional: handle slice-specific actions. Return the next form, or undefined to fall through to the default patch.
  reduce: () => undefined,
};
