// Demo twin of admin_unmet_demand (migration 0115). Local development only.
import { ApiError } from "./errors.js";

const ROWS = [
  { categoryId: "electronics", productTypeId: "phone", filters: { brand: "samsung", storage: "512 gb" }, count: 12, shops: [{ id: "s1", slug: "mobile-hub", name: "Mobile Hub", count: 8 }, { id: "s2", slug: "gadget-bay", name: "Gadget Bay", count: 4 }] },
  { categoryId: "fashion", productTypeId: "shoes-eu", filters: { size: "43" }, count: 7, shops: [{ id: "s3", slug: "kicks", name: "Kicks", count: 7 }] },
  { categoryId: "electronics", productTypeId: "phone", filters: { colour: "pink" }, count: 3, shops: [{ id: "s1", slug: "mobile-hub", name: "Mobile Hub", count: 3 }] }
];

export async function getUnmetDemand(period = 7, category = null) {
  await new Promise((r) => setTimeout(r, 60));
  if (![7, 30].includes(period)) throw new ApiError("invalid_period");
  const k = period === 30 ? 3 : 1;
  const rows = ROWS.filter((r) => !category || r.categoryId === category)
    .map((r) => ({ ...r, count: r.count * k, shops: r.shops.map((s) => ({ ...s, count: s.count * k })) }));
  return { period, total: rows.reduce((n, r) => n + r.count, 0), rows };
}
