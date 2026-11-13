import { grid } from "./build.js";

const PRICES = { "250-ml": 300, "500-ml": 700, "750-ml": 1000 };

export const liquor = () => {
  const axes = [{ key: "volume", label: "Volume", display: "button", values: [{ id: "250-ml", label: "250 ml" }, { id: "500-ml", label: "500 ml" }, { id: "750-ml", label: "750 ml" }] }];
  return {
    id: "fx-liquor", productType: "liquor", name: "Blended whiskey", brand: "Highland Reserve", hue: 30, section: "Spirits",
    description: "A smooth blended whiskey in three bottle sizes.",
    highlights: ["Sealed and authentic"],
    specs: [{ label: "Authenticity", value: "Original" }, { label: "Alcohol strength", value: "40% ABV" }],
    axes,
    variants: grid(axes, (c) => ({ price: PRICES[c.volume] }))
  };
};
