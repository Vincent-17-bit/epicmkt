import { grid } from "./build.js";

const PRICES = { refill: { "5-l": 30, "10-l": 55, "20-l": 100 }, "new-bottle": { "5-l": 200, "10-l": 320, "20-l": 450 } };

// A size by fill grid: a refill of your own bottle, or a new bottle with the water in it.
export const water = () => {
  const axes = [
    { key: "size", label: "Size", display: "button", values: [{ id: "5-l", label: "5 L" }, { id: "10-l", label: "10 L" }, { id: "20-l", label: "20 L" }] },
    { key: "fill", label: "Fill", display: "button", values: [{ id: "refill", label: "Refill (bring your bottle)" }, { id: "new-bottle", label: "New bottle with water" }] }
  ];
  return {
    id: "fx-water", productType: "drinking-water", name: "Purified drinking water", brand: null, hue: 195, section: "Water",
    description: "Purified drinking water in 5, 10 and 20 litre sizes. Refill your own bottle or buy a new one.",
    highlights: ["Purified and tested", "Free delivery nearby"],
    specs: [{ label: "Treatment", value: "Filtered and UV treated" }],
    axes,
    variants: grid(axes, (c) => ({ price: PRICES[c.fill][c.size] }))
  };
};
