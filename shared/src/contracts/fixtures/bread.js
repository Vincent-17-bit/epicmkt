import { grid } from "./build.js";

const PRICES = { "400-g": { white: 60, brown: 65, wholemeal: 75 }, "800-g": { white: 110, brown: 120, wholemeal: 140 } };

export const bread = () => {
  const axes = [
    { key: "weight", label: "Weight", display: "button", values: [{ id: "400-g", label: "400 g" }, { id: "800-g", label: "800 g" }] },
    { key: "kind", label: "Kind", display: "button", values: [{ id: "white", label: "White" }, { id: "brown", label: "Brown" }, { id: "wholemeal", label: "Wholemeal" }] }
  ];
  return {
    id: "fx-bread", productType: "bread", name: "Fresh baked bread", brand: null, hue: 38, section: "Bakery",
    description: "Baked every morning. Choose the loaf weight and the kind of flour.",
    highlights: ["Baked daily", "No preservatives"],
    specs: [{ label: "Baked", value: "Every morning" }],
    axes,
    variants: grid(axes, (c) => ({ price: PRICES[c.weight][c.kind], ...(c.weight === "800-g" && c.kind === "wholemeal" && { status: "limited_stock", stock: 4 }) }))
  };
};
