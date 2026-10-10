// Shared decision table. shared tests check applyStockRules against it, and the database tests run the
// same rows through the SQL trigger, so the preview and the authority cannot drift apart unnoticed.
export const STOCK_CASES = [
  { in: { trackStock: true, stockCount: 0, lowStockThreshold: 3, availability: "available" }, out: "out_of_stock" },
  { in: { trackStock: true, stockCount: 1, lowStockThreshold: 3, availability: "available" }, out: "limited_stock" },
  { in: { trackStock: true, stockCount: 3, lowStockThreshold: 3, availability: "available" }, out: "limited_stock" },
  { in: { trackStock: true, stockCount: 4, lowStockThreshold: 3, availability: "limited_stock" }, out: "available" },
  { in: { trackStock: true, stockCount: 9, lowStockThreshold: 0, availability: "out_of_stock" }, out: "available" },
  { in: { trackStock: true, stockCount: 0, lowStockThreshold: 0, availability: "available" }, out: "out_of_stock" },
  { in: { trackStock: true, stockCount: 2, lowStockThreshold: 3, availability: "seasonal" }, out: "seasonal" },
  { in: { trackStock: true, stockCount: 0, lowStockThreshold: 3, availability: "coming_soon" }, out: "coming_soon" },
  { in: { trackStock: true, stockCount: 0, lowStockThreshold: 3, availability: "by_appointment" }, out: "by_appointment" },
  { in: { trackStock: true, stockCount: null, lowStockThreshold: 3, availability: "limited_stock" }, out: "limited_stock" },
  { in: { trackStock: false, stockCount: 0, lowStockThreshold: 3, availability: "available" }, out: "available" },
];
