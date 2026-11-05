import { grid } from "./build.js";

const SEATS = {
  "2-seater": { label: "2-seater", dimensions: { length: 160, width: 88, height: 85, unit: "cm" }, fabric: 38000, leather: 62000 },
  "3-seater": { label: "3-seater", dimensions: { length: 210, width: 90, height: 88, unit: "cm" }, fabric: 52000, leather: 85000 },
  "4-seater": { label: "4-seater", dimensions: { length: 260, width: 95, height: 88, unit: "cm" }, fabric: 68000, leather: 110000 }
};

export const sofa = () => {
  const axes = [
    { key: "seats", label: "Seats", display: "text-card", values: Object.entries(SEATS).map(([id, s]) => ({ id, label: s.label })) },
    { key: "upholstery", label: "Upholstery", display: "swatch", values: [{ id: "leather", label: "Leather", color: "#6b3f2a" }, { id: "fabric", label: "Fabric", color: "#9aa0a6" }] }
  ];
  return {
    id: "fx-sofa", productType: "sofa", name: "Comfort lounge sofa", brand: null, hue: 18, section: "Living room",
    description: "A deep-seat lounge sofa in leather or fabric. Each size has its own dimensions.",
    highlights: ["Hardwood frame", "High-density foam seats"],
    specs: [{ label: "Frame", value: "Hardwood" }],
    axes,
    variants: grid(axes, (c) => ({ price: SEATS[c.seats][c.upholstery], dimensions: SEATS[c.seats].dimensions }))
  };
};
