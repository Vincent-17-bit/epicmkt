import { grid } from "./build.js";

const WATTS = { "5-w": 150, "9-w": 220, "12-w": 300 };

export const ledBulb = () => {
  const axes = [
    { key: "wattage", label: "Wattage", display: "button", values: [{ id: "5-w", label: "5 W" }, { id: "9-w", label: "9 W" }, { id: "12-w", label: "12 W" }] },
    { key: "base", label: "Cap", display: "button", values: [{ id: "b22", label: "B22 bayonet" }, { id: "e27", label: "E27 screw" }] }
  ];
  return {
    id: "fx-led-bulb", productType: "led-bulb", name: "Energy saving LED bulb", brand: "Glow", hue: 52, section: "Lighting",
    description: "Warm white LED bulb in three wattages and two caps.",
    highlights: ["Uses 80% less power", "25,000 hour life"],
    specs: [{ label: "Colour temperature", value: "3000 K warm white" }],
    axes,
    variants: grid(axes, (c) => ({ price: WATTS[c.wattage], ...(c.wattage === "12-w" && c.base === "e27" && { status: "out_of_stock", stock: 0 }) }))
  };
};
