import { grid } from "./build.js";

// The size is the option that matters: each size has its own dimensions, the same in both finishes.
const SIZES = {
  "4-seater": { label: "4-seater", dimensions: { length: 120, width: 75, height: 75, unit: "cm" }, price: 28000 },
  "6-seater": { label: "6-seater", dimensions: { length: 180, width: 90, height: 75, unit: "cm" }, price: 42000 },
  "8-seater": { label: "8-seater", dimensions: { length: 220, width: 100, height: 75, unit: "cm" }, price: 58000 }
};

export const table = () => {
  const axes = [
    { key: "size", label: "Size", display: "text-card", values: Object.entries(SIZES).map(([id, s]) => ({ id, label: s.label })) },
    { key: "finish", label: "Finish", display: "swatch", values: [{ id: "oak", label: "Oak", color: "#c8a165" }, { id: "walnut", label: "Walnut", color: "#5c4033" }] }
  ];
  return {
    id: "fx-table", productType: "table", name: "Solid wood dining table", brand: null, hue: 35, section: "Dining",
    description: "A solid wood dining table in three sizes and two finishes. Dimensions are listed for each size.",
    highlights: ["Solid wood top", "Seats four to eight"],
    specs: [{ label: "Material", value: "Solid wood" }],
    axes,
    variants: grid(axes, (c) => ({ price: SIZES[c.size].price + (c.finish === "walnut" ? 3000 : 0), dimensions: SIZES[c.size].dimensions }))
  };
};
