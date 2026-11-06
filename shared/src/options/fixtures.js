// Fixtures for tests: four products as the public read returns them ({ options, optionVariants, optionAvailability, defaultVariantId,
// sizeChart }), built with publicOptions so they always have the real shape. Not used by the apps.
//
//   sandisk  dependent options: Style, then Capacity (the list follows the style). Example data rounded from a real shop page.
//   phone    colour cards + storage, price differs by colour and by storage; one sold-out combination.
//   shoes    colour swatches + 10 sizes (a dropdown); one price; some sizes missing in one colour.
//   sofa     fabric as photo cards + size; different prices per fabric; a seller default.

import { publicOptions } from "../seller/options.js";

const make = ({ item, axes, rows, defaultKey = null }) => {
  const variants = rows.map((r, i) => ({ id: `v${i + 1}`, status: "available", stock: null, sku: null, mediaIds: [], specs: [], ...r }));
  const key = (v) => axes.map((a) => `${a.key}=${v.choice[a.key]}`).join("|");
  const def = defaultKey ? variants.find((v) => key(v) === defaultKey) : null;
  if (defaultKey && !def) throw new Error(`fixture default ${defaultKey} is not a variant`);
  return { item: { ...item }, ...publicOptions({ axes, variants, item, defaultVariantId: def?.id ?? null }) };
};

// ---- SanDisk: Style -> Capacity (dependent) ----

const gb = (n) => ({ id: `${n}gb`, label: `${n} GB` });
const SANDISK_AXES = [
  { key: "style", label: "Style", display: "text-card", values: [{ id: "old", label: "Old Version" }, { id: "new", label: "New Version" }] },
  {
    key: "capacity",
    label: "Capacity",
    display: "text-card",
    dependsOn: "style",
    values: [gb(32), gb(64), gb(128), gb(256), gb(512), { id: "1024gb", label: "1024 GB" }, { id: "2048gb", label: "2048 GB" }],
  },
];
const DEVICES_OLD = [{ group: "Features & Specs", label: "Compatible devices", value: "Car navigation, computers, digital cameras, home theatre" }];
const DEVICES_NEW = [{ group: "Features & Specs", label: "Compatible devices", value: "Camera" }];
const sd = (style, capacity, price, salePrice = null, specs = []) => ({ choice: { style, capacity }, price, salePrice, specs });

export const sandisk = () =>
  make({
    item: { id: "item-sandisk", name: "SanDisk microSD card", price: 3765, salePrice: null, showStockCount: false },
    axes: SANDISK_AXES,
    rows: [
      sd("old", "32gb", 3765, 3582, DEVICES_OLD),
      sd("old", "128gb", 5843, null, DEVICES_OLD),
      sd("old", "256gb", 13631, null, DEVICES_OLD),
      sd("old", "512gb", 24664, null, DEVICES_OLD),
      sd("old", "1024gb", 36365, null, DEVICES_OLD),
      sd("new", "64gb", 4650, null, DEVICES_NEW),
      sd("new", "128gb", 6751, null, DEVICES_NEW),
      sd("new", "256gb", 16883, 12078, DEVICES_NEW),
      sd("new", "512gb", 22078, null, DEVICES_NEW),
      sd("new", "1024gb", 39628, null, DEVICES_NEW),
      sd("new", "2048gb", 71433, null, DEVICES_NEW),
    ],
    defaultKey: "style=old|capacity=128gb",
  });

// ---- Phone: colour cards and storage ----

const PHONE_AXES = [
  {
    key: "color",
    label: "Color",
    display: "swatch",
    values: [{ id: "black", label: "Black", color: "#111111" }, { id: "grey", label: "Grey", color: "#8a8d91" }, { id: "blue", label: "Blue", color: "#2b4c8c" }],
  },
  { key: "storage", label: "Storage", display: "button", values: [{ id: "128", label: "128 GB" }, { id: "256", label: "256 GB" }, { id: "512", label: "512 GB" }] },
];
const ph = (color, storage, price, extra = {}) => ({ choice: { color, storage }, price, ...extra });

export const phone = () =>
  make({
    item: { id: "item-phone", name: "Samsung Galaxy S26", price: 22000, salePrice: null, showStockCount: true },
    axes: PHONE_AXES,
    rows: [
      ph("black", "128", 22000, { stock: 5 }), ph("grey", "128", 21000, { stock: 4 }), ph("blue", "128", 22000, { stock: 3 }),
      ph("black", "256", 25000, { stock: 6 }), ph("grey", "256", 24000, { stock: 8 }), ph("blue", "256", 25000, { stock: 2, status: "limited_stock" }),
      ph("black", "512", 30000, { stock: 1 }), ph("grey", "512", 29000, { stock: 0, status: "out_of_stock" }), ph("blue", "512", 30000, { stock: 2 }),
    ],
  });

// ---- Shoes: colour swatches and ten sizes (a dropdown) ----

const SIZES = [38, 39, 40, 41, 42, 43, 44, 45, 46, 47];
const SHOE_AXES = [
  { key: "color", label: "Color", display: "swatch", values: [{ id: "white", label: "White", color: "#ffffff" }, { id: "red", label: "Red", color: "#c0392b" }] },
  { key: "size", label: "Size (EU)", display: "dropdown", values: SIZES.map((n) => ({ id: String(n), label: `EU ${n}` })) },
];

export const shoes = () =>
  make({
    item: { id: "item-shoes", name: "Court sneaker", price: 3500, salePrice: null, showStockCount: false },
    axes: SHOE_AXES,
    rows: [
      ...SIZES.map((n) => ({ choice: { color: "white", size: String(n) }, price: 3500, stock: 4 })),
      // Red is only made in 40 to 44, and 42 is sold out.
      ...[40, 41, 42, 43, 44].map((n) => ({ choice: { color: "red", size: String(n) }, price: 3500, stock: n === 42 ? 0 : 3, status: n === 42 ? "out_of_stock" : "available" })),
    ],
  });

// ---- Sofa: fabric as photo cards and size, with a default ----

const SOFA_AXES = [
  {
    key: "fabric",
    label: "Fabric",
    display: "image-card",
    values: [
      { id: "linen", label: "Linen", mediaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1" },
      { id: "velvet", label: "Velvet", mediaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2" },
    ],
  },
  { key: "size", label: "Size", display: "text-card", values: [{ id: "2-seater", label: "2 seater" }, { id: "3-seater", label: "3 seater" }] },
];
const sf = (fabric, size, price, extra = {}) => ({ choice: { fabric, size }, price, stock: 2, ...extra });

export const sofa = () =>
  make({
    item: { id: "item-sofa", name: "Corner sofa", price: 48000, salePrice: null, showStockCount: false },
    axes: SOFA_AXES,
    rows: [sf("linen", "2-seater", 48000), sf("linen", "3-seater", 62000), sf("velvet", "2-seater", 55000), sf("velvet", "3-seater", 70000, { stock: 0, status: "out_of_stock" })],
    defaultKey: "fabric=velvet|size=2-seater",
  });

export const fixtures = { sandisk, phone, shoes, sofa };
