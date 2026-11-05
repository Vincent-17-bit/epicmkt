import { grid } from "./build.js";

// EU sizes with widths. Narrow only comes in the smaller sizes (those combinations simply do not exist), one Regular is sold out.
export const shoes = () => {
  const axes = [
    { key: "size", label: "Size (EU)", display: "button", values: ["39", "40", "41", "42", "43"].map((n) => ({ id: `eu-${n}`, label: `EU ${n}` })) },
    { key: "width", label: "Width", display: "button", values: [{ id: "narrow", label: "Narrow" }, { id: "regular", label: "Regular" }, { id: "wide", label: "Wide" }] }
  ];
  return {
    id: "fx-shoes", productType: "shoes-eu", name: "Everyday leather loafers", brand: "Stride", hue: 28, section: "Shoes",
    description: "Soft leather loafers with a cushioned insole, in EU sizes and three widths.",
    highlights: ["Genuine leather", "Cushioned insole"],
    specs: [{ label: "Upper", value: "Leather" }, { label: "Sole", value: "Rubber" }],
    price: 3200,
    chart: {
      id: "chart-shoes-eu", name: "Women's shoes (EU)", category: "fashion-boutiques", unit: "cm", active: true,
      columns: ["EU", "UK", "Foot length"],
      rows: [["39", "6", "24.8"], ["40", "7", "25.4"], ["41", "8", "26"], ["42", "9", "26.7"], ["43", "10", "27.3"]]
    },
    axes,
    variants: grid(axes, (c) => {
      if (c.width === "narrow" && (c.size === "eu-42" || c.size === "eu-43")) return null;
      if (c.size === "eu-40" && c.width === "regular") return { price: 3200, status: "out_of_stock", stock: 0 };
      if (c.size === "eu-41" && c.width === "wide") return { price: 3200, status: "limited_stock", stock: 2 };
      return { price: 3200 };
    })
  };
};
