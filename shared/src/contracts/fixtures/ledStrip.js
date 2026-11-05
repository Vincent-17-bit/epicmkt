import { grid } from "./build.js";

const LENGTH = { "2-m": 650, "5-m": 1200, "10-m": 2100 };

export const ledStrip = () => {
  const axes = [
    { key: "length", label: "Length", display: "button", values: [{ id: "2-m", label: "2 m" }, { id: "5-m", label: "5 m" }, { id: "10-m", label: "10 m" }] },
    { key: "colour", label: "Light colour", display: "swatch", values: [{ id: "warm-white", label: "Warm white", color: "#ffd9a0" }, { id: "cool-white", label: "Cool white", color: "#e8f0ff" }, { id: "rgb", label: "RGB colour change", color: "#d633a8" }] }
  ];
  return {
    id: "fx-led-strip", productType: "led-strip", name: "LED strip light with adhesive back", brand: "Glow", hue: 280, section: "Lighting",
    description: "Cuttable 12 V LED strip with an adhesive back. RGB comes with a remote.",
    highlights: ["Cut every 5 cm", "Adhesive back"],
    specs: [{ label: "Voltage", value: "12 V" }, { label: "Power", value: "4.8 W per metre" }],
    axes,
    variants: grid(axes, (c) => ({ price: LENGTH[c.length] + (c.colour === "rgb" ? 400 : 0) }))
  };
};
