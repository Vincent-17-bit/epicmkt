import { grid } from "./build.js";

const PRICES = { "30-ml": 2800, "50-ml": 4200, "100-ml": 6900 };

export const fragrance = () => {
  const axes = [{ key: "volume", label: "Volume", display: "button", values: [{ id: "30-ml", label: "30 ml" }, { id: "50-ml", label: "50 ml" }, { id: "100-ml", label: "100 ml" }] }];
  return {
    id: "fx-fragrance", productType: "fragrance", name: "Eau de parfum", brand: "Aurelle", hue: 320, section: "Fragrance",
    description: "A warm floral and amber eau de parfum in three bottle sizes.",
    highlights: ["Long lasting", "Sealed and authentic"],
    specs: [{ label: "Notes", value: "Jasmine, amber, vanilla" }],
    axes,
    variants: grid(axes, (c) => ({ price: PRICES[c.volume] }))
  };
};
