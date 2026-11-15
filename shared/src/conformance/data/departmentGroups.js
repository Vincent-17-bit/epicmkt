// Which Contract v1 group (shared/src/contracts/types.js PRODUCT_GROUPS) each department's types belong to. Data: used by the
// conformance run to read the seeded types in the contract shape (seeded.js). A department not listed falls back by kind.
export const GROUP_BY_DEPARTMENT = {
  clothing: "fashion", shoes: "fashion", bags: "fashion", eyewear: "fashion", fitness: "fashion",
  jewellery: "jewellery",
  fragrance: "beauty", "beauty-personal-care": "beauty", "medicine-health": "beauty", "cleaning-laundry": "beauty",
  phones: "electronics", computers: "electronics", "cables-power": "electronics", electronics: "electronics", batteries: "electronics",
  "printers-ink": "electronics", stationery: "electronics", "auto-parts": "electronics", "hardware-building": "electronics", "plumbing-electrical": "electronics",
  "water-energy": "food-drink", "food-drink": "food-drink", "farm-inputs": "food-drink",
  lighting: "lighting",
  furniture: "furniture",
  "printing-services": "services", "photography-events": "services",
};
