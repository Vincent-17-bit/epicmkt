import { SEED_SIZE_CHARTS, shoeChartRows } from "@epicmkt/shared";

// Mock size chart library (the admin-owned size_charts table). Items point at one by id: svc.sizeChartId, with an optional
// svc.sizeChartOverride = { rows }. Same shape as the public_size_charts view.
export const sizeCharts = [
  {
    id: "chart-shoes-eu", name: "Women's shoes (EU)", category: "fashion-boutiques", unit: "cm", active: true, productTypeIds: ["shoes-eu"],
    columns: ["EU", "UK", "Foot length"],
    rows: [["37", "4", "23.5"], ["38", "5", "24.1"], ["39", "6", "24.8"], ["40", "7", "25.4"], ["41", "8", "26"]]
  },
  {
    id: "chart-tops", name: "Tops and dresses", category: "fashion-boutiques", unit: "cm", active: true, productTypeIds: ["dress"],
    columns: ["Size", "Bust", "Waist", "Hip"],
    rows: [["S", "84", "66", "92"], ["M", "90", "72", "98"], ["L", "96", "78", "104"], ["XL", "102", "84", "110"]]
  }
,
  // A05: the charts migration 0091 seeds, so the mock and the database give the same buyer-facing charts. Ids are made from the name.
  ...SEED_SIZE_CHARTS.map((c) => ({ id: `chart-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, name: c.name, category: c.category, unit: c.unit, active: true, productTypeIds: [...c.productTypeIds], columns: c.columns, rows: c.rows }))
];

// The shoe conversion chart (the one-row shoe_conversion table): rows only, and the version that rises with every admin save.
export const shoeConversion = { chart: shoeChartRows(), version: 1 };
