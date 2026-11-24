import { categories } from "./data/categories.js";
import { businesses } from "./data/businesses.js";
import { seedFlashSales } from "./data/flashSales.js";
import { seedOffers } from "./data/promoOffers.js";
import { shoeConversion, sizeCharts } from "./data/sizeCharts.js";

export const store = {
  categories,
  businesses: structuredClone(businesses),
  searches: [],
  events: [],
  analytics: [],
  reports: [],
  flashSales: import.meta.env?.VITE_SUPABASE_URL ? [] : seedFlashSales(),
  offers: seedOffers(),
  sizeCharts: structuredClone(sizeCharts),
  shoeConversion: structuredClone(shoeConversion),
  notifications: [],
  latency: { min: 150, max: 450 }
};
