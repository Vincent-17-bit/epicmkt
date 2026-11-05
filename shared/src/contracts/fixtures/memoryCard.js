import { grid } from "./build.js";

// Capacity depends on Style: a flash drive does not come in 2 TB and an SSD does not come in 32 GB.
const CAPACITIES = {
  usb: { "32-gb": 700, "64-gb": 1100, "128-gb": 1900 },
  microsd: { "64-gb": 1200, "128-gb": 2000, "256-gb": 3600, "512-gb": 7200 },
  ssd: { "500-gb": 9500, "1-tb": 15500, "2-tb": 27500 }
};
const LABELS = { "32-gb": "32 GB", "64-gb": "64 GB", "128-gb": "128 GB", "256-gb": "256 GB", "512-gb": "512 GB", "500-gb": "500 GB", "1-tb": "1 TB", "2-tb": "2 TB" };

export const memoryCard = () => {
  const axes = [
    { key: "style", label: "Style", display: "button", values: [{ id: "usb", label: "Cruzer Blade USB drive" }, { id: "microsd", label: "Ultra microSD card" }, { id: "ssd", label: "Extreme Portable SSD" }] },
    {
      key: "capacity", label: "Capacity", display: "button",
      values: Object.keys(LABELS).map((id) => ({ id, label: LABELS[id] })),
      dependsOn: { axis: "style", allowed: Object.fromEntries(Object.entries(CAPACITIES).map(([style, caps]) => [style, Object.keys(caps)])) }
    }
  ];
  return {
    id: "fx-sandisk", productType: "memory-card", name: "SanDisk storage", brand: "SanDisk", hue: 8, section: "Storage",
    description: "SanDisk flash drives, memory cards and portable SSDs. The capacities on offer depend on the style you choose.",
    highlights: ["Genuine SanDisk", "Lifetime limited warranty on drives and cards"],
    specs: [{ label: "Brand", value: "SanDisk" }],
    axes,
    variants: grid(axes, (c) => (c.capacity in CAPACITIES[c.style] ? { price: CAPACITIES[c.style][c.capacity] } : null))
  };
};
