import { grid } from "./build.js";

// Price = weight x the day's rate for the purity, rounded to the nearest 100 shillings. Weight is per length.
const GRAMS = { "16-in": 5, "18-in": 5.6, "20-in": 6.2 };
const RATE_PER_GRAM = { "18k": 9800, "22k": 12000, "24k": 13100 };

export const necklace = () => {
  const axes = [
    { key: "purity", label: "Purity", display: "button", values: [{ id: "18k", label: "18K" }, { id: "22k", label: "22K" }, { id: "24k", label: "24K" }] },
    { key: "length", label: "Length", display: "button", values: [{ id: "16-in", label: "16 in" }, { id: "18-in", label: "18 in" }, { id: "20-in", label: "20 in" }] }
  ];
  return {
    id: "fx-necklace", productType: "gold-necklace", name: "Gold rope necklace", brand: null, hue: 45, section: "Jewellery",
    description: "A hand-finished gold rope necklace. Choose the purity and the length; the price follows the weight of gold.",
    highlights: ["Hallmarked", "Gift box included"],
    specs: [{ label: "Material", value: "Gold" }, { label: "Style", value: "Rope chain" }],
    axes,
    variants: grid(axes, (c) => ({
      price: Math.round((GRAMS[c.length] * RATE_PER_GRAM[c.purity]) / 100) * 100,
      weightGrams: GRAMS[c.length]
    }))
  };
};
