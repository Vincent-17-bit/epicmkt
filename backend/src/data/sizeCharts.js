// Mock size chart library (the admin-owned size_charts table). Items point at one by id: svc.sizeChartId, with an optional
// svc.sizeChartOverride = { rows }. Same shape as the public_size_charts view.
export const sizeCharts = [
  {
    id: "chart-shoes-eu", name: "Women's shoes (EU)", category: "fashion-boutiques", unit: "cm", active: true,
    columns: ["EU", "UK", "Foot length"],
    rows: [["37", "4", "23.5"], ["38", "5", "24.1"], ["39", "6", "24.8"], ["40", "7", "25.4"], ["41", "8", "26"]]
  },
  {
    id: "chart-tops", name: "Tops and dresses", category: "fashion-boutiques", unit: "cm", active: true,
    columns: ["Size", "Bust", "Waist", "Hip"],
    rows: [["S", "84", "66", "92"], ["M", "90", "72", "98"], ["L", "96", "78", "104"], ["XL", "102", "84", "110"]]
  }
];
