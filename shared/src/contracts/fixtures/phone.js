import { grid } from "./build.js";

// Price follows the colour (Black 25,000, Grey 24,000); storage is a free choice. Black 256 GB is sold out and Grey 256 GB is nearly gone.
export const phone = () => {
  const axes = [
    { key: "colour", label: "Colour", display: "swatch", values: [{ id: "black", label: "Black", color: "#111111" }, { id: "grey", label: "Grey", color: "#8e8e93" }] },
    { key: "storage", label: "Storage", display: "button", values: [{ id: "64-gb", label: "64 GB" }, { id: "128-gb", label: "128 GB" }, { id: "256-gb", label: "256 GB" }] }
  ];
  return {
    id: "fx-phone", productType: "phone", name: "Pulse X1 smartphone", brand: "Pulse", hue: 215, section: "Phones",
    description: "6.5 inch display, dual SIM and a 5,000 mAh battery. The price depends on the colour you pick; storage is your choice.",
    highlights: ["Dual SIM", "5,000 mAh battery", "One-year warranty"],
    specs: [{ label: "Display", value: "6.5 inch" }, { label: "SIM", value: "Dual SIM" }, { label: "Battery", value: "5,000 mAh" }],
    axes,
    variants: grid(axes, (c) => ({
      price: c.colour === "black" ? 25000 : 24000,
      ...(c.colour === "black" && c.storage === "256-gb" && { status: "out_of_stock", stock: 0 }),
      ...(c.colour === "grey" && c.storage === "256-gb" && { status: "limited_stock", stock: 3 })
    }))
  };
};
