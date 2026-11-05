import { grid } from "./build.js";

// Sold by the kilo: the price is per kg and the order is in steps of a quarter kilo, from half a kilo.
export const butcher = () => {
  const axes = [{ key: "cut", label: "Cut", display: "text-card", values: [{ id: "steak", label: "Beef steak" }, { id: "mince", label: "Beef mince" }, { id: "stew", label: "Stewing beef" }, { id: "ribs", label: "Ribs" }] }];
  const PER_KG = { steak: 750, mince: 620, stew: 580, ribs: 540 };
  return {
    id: "fx-butcher", productType: "meat-by-weight", name: "Fresh beef, sold per kg", brand: null, hue: 0, section: "Butchery", unit: "kg",
    description: "Fresh beef cut to order and weighed in front of you. Priced per kilogram.",
    highlights: ["Cut to order", "Weighed in front of you"],
    specs: [{ label: "Sold by", value: "The kilogram" }],
    quantity: { min: 0.5, step: 0.25, unit: "kg" },
    axes,
    variants: grid(axes, (c) => ({ price: PER_KG[c.cut] }))
  };
};
