import { grid } from "./build.js";

// Price tiers: the more pages, the less each costs. A4 uses the item's tiers; A3 has its own.
export const printing = () => {
  const axes = [{ key: "paper", label: "Paper size", display: "button", values: [{ id: "a4", label: "A4" }, { id: "a3", label: "A3" }] }];
  const a3 = [{ minQty: 1, maxQty: 49, unitPrice: 40 }, { minQty: 50, maxQty: 199, unitPrice: 30 }, { minQty: 200, maxQty: null, unitPrice: 22 }];
  return {
    id: "fx-printing", productType: "printing", name: "Black and white printing", brand: null, hue: 160, section: "Print shop", unit: "page",
    description: "Black and white laser printing, priced per page. The more you print, the less each page costs.",
    highlights: ["Same-day pickup", "Bring a flash drive or email the file"],
    specs: [{ label: "Paper", value: "80 gsm" }],
    priceTiers: [{ minQty: 1, maxQty: 49, unitPrice: 20 }, { minQty: 50, maxQty: 199, unitPrice: 15 }, { minQty: 200, maxQty: null, unitPrice: 10 }],
    axes,
    variants: grid(axes, (c) => (c.paper === "a4" ? { price: 20 } : { price: 40, priceTiers: a3 }))
  };
};
