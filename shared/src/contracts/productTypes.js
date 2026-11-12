// The product types a seller can pick (seller_product_types). Plain data: nothing here runs at import time.
// Each fixture in fixtures/ uses exactly one of these, and the test checks that its options match the type's axes.

const row = (key, label, level, input = "text", extra = {}) => ({ key, label, level, input, ...extra });

const sizes = (...labels) => labels.map((label) => ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), label }));

/** @type {import("./types.js").ProductType[]} */
export const PRODUCT_TYPES = [
  {
    id: "phone", name: "Phone", group: "electronics", priceType: "from", unit: null,
    axes: [
      { key: "colour", label: "Colour", display: "swatch" },
      { key: "storage", label: "Storage", display: "button", suggested: sizes("64 GB", "128 GB", "256 GB") }
    ],
    variantFields: [], itemFields: [],
    specRows: [
      row("warranty", "Warranty", "required"),
      row("display", "Display", "recommended"),
      row("sim", "SIM", "recommended"),
      row("battery", "Battery", "recommended")
    ]
  },
  {
    id: "memory-card", name: "Memory card and flash drive", group: "electronics", priceType: "from", unit: null,
    axes: [
      { key: "style", label: "Style", display: "button" },
      { key: "capacity", label: "Capacity", display: "button", dependsOn: "style" }
    ],
    variantFields: [], itemFields: []
  },
  {
    id: "shoes-eu", name: "Shoes (EU sizes)", group: "fashion", priceType: "fixed", unit: null,
    axes: [
      { key: "size", label: "Size (EU)", display: "button", suggested: sizes("EU 38", "EU 39", "EU 40", "EU 41", "EU 42", "EU 43") },
      { key: "width", label: "Width", display: "button", suggested: sizes("Narrow", "Regular", "Wide") }
    ],
    variantFields: [], itemFields: []
  },
  {
    id: "table", name: "Table", group: "furniture", priceType: "from", unit: null,
    axes: [
      { key: "size", label: "Size", display: "text-card" },
      { key: "finish", label: "Finish", display: "swatch" }
    ],
    variantFields: ["dimensions"], itemFields: []
  },
  {
    id: "sofa", name: "Sofa", group: "furniture", priceType: "from", unit: null,
    axes: [
      { key: "seats", label: "Seats", display: "text-card", suggested: sizes("2-seater", "3-seater", "4-seater") },
      { key: "upholstery", label: "Upholstery", display: "swatch", suggested: sizes("Leather", "Fabric") }
    ],
    variantFields: ["dimensions"], itemFields: []
  },
  {
    id: "bread", name: "Bread", group: "food-drink", priceType: "from", unit: null,
    axes: [
      { key: "weight", label: "Weight", display: "button", suggested: sizes("400 g", "800 g") },
      { key: "kind", label: "Kind", display: "button", suggested: sizes("White", "Brown", "Wholemeal") }
    ],
    variantFields: [], itemFields: [],
    specRows: [
      row("ingredients", "Ingredients", "required"),
      row("allergens", "Allergens", "required"),
      row("shelf-life", "Shelf life", "recommended"),
      row("storage", "Storage", "recommended"),
      row("sliced", "Sliced or unsliced", "recommended", "choice", { choices: ["Sliced", "Unsliced"] }),
      row("ready-from", "Ready from", "recommended"),
      row("dietary-notes", "Dietary notes", "recommended")
    ]
  },
  {
    id: "drinking-water", name: "Drinking water", group: "food-drink", priceType: "from", unit: null,
    axes: [
      { key: "size", label: "Size", display: "button", suggested: sizes("5 L", "10 L", "20 L") },
      { key: "fill", label: "Fill", display: "button", suggested: sizes("Refill", "New bottle") }
    ],
    variantFields: [], itemFields: [],
    specRows: [
      row("water-type", "Water type", "required", "choice", { choices: ["Purified", "Borehole", "Spring"] }),
      row("treatment-method", "Treatment method", "recommended"),
      row("container-material", "Container material", "recommended", "openValue"),
      row("bottle-deposit", "Bottle deposit", "recommended"),
      row("quality-test", "Quality test", "recommended")
    ]
  },
  {
    id: "led-strip", name: "LED strip light", group: "lighting", priceType: "from", unit: null,
    axes: [
      { key: "length", label: "Length", display: "button", suggested: sizes("2 m", "5 m", "10 m") },
      { key: "colour", label: "Light colour", display: "swatch" }
    ],
    variantFields: [], itemFields: []
  },
  {
    id: "led-bulb", name: "LED bulb", group: "lighting", priceType: "from", unit: null,
    axes: [
      { key: "wattage", label: "Wattage", display: "button", suggested: sizes("5 W", "9 W", "12 W") },
      { key: "base", label: "Cap", display: "button", suggested: sizes("B22", "E27") }
    ],
    variantFields: [], itemFields: []
  },
  {
    id: "printing", name: "Printing", group: "services", priceType: "from", unit: "page",
    axes: [{ key: "paper", label: "Paper size", display: "button", suggested: sizes("A4", "A3") }],
    variantFields: ["priceTiers"], itemFields: ["priceTiers"]
  },
  {
    id: "meat-by-weight", name: "Meat sold by weight", group: "food-drink", priceType: "from", unit: "kg",
    axes: [{ key: "cut", label: "Cut", display: "text-card" }],
    variantFields: [], itemFields: ["quantity"]
  },
  {
    id: "gold-necklace", name: "Gold necklace", group: "jewellery", priceType: "from", unit: null,
    axes: [
      { key: "purity", label: "Purity", display: "button", suggested: sizes("18K", "22K", "24K") },
      { key: "length", label: "Length", display: "button" }
    ],
    variantFields: ["weightGrams"], itemFields: [],
    specRows: [
      row("material", "Material", "required", "openValue"),
      row("purity", "Purity", "optional", "text", { requiredIf: { row: "material", tag: "precious-metal" } }),
      row("hallmark", "Hallmark", "recommended")
    ]
  },
  {
    id: "fragrance", name: "Fragrance", group: "beauty", priceType: "from", unit: null,
    axes: [{ key: "volume", label: "Volume", display: "button", suggested: sizes("30 ml", "50 ml", "100 ml") }],
    variantFields: [], itemFields: [],
    specRows: [
      row("authenticity", "Authenticity", "required", "choice", { labelSet: "authenticity" }),
      row("fragrance-state", "Fragrance state", "recommended", "choice", { labelSet: "fragranceState" }),
      row("notes", "Notes", "recommended")
    ]
  }
];

export const productTypeById = (id) => PRODUCT_TYPES.find((t) => t.id === id) ?? null;
