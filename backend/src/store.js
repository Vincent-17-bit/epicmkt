import { categories } from "./data/categories.js";
import { businesses } from "./data/businesses.js";

const seedSearches = [
  ["barbershop", 412], ["water refill", 366], ["chemist", 341], ["agrovet", 287],
  ["gym", 254], ["braids", 231], ["haircut", 198], ["pharmacy", 176], ["garage", 143], ["biryani", 121]
];

const DAY = 86400000;
const seededAt = Date.now();

const seedSearchEvents = seedSearches.flatMap(([term, total]) => {
  const base = Math.floor(total / 7);
  return Array.from({ length: 7 }, (_, d) => ({
    term,
    count: base + (d === 0 ? total - base * 7 : 0),
    at: seededAt - Math.round(d * DAY * 0.9)
  }));
});

export const store = {
  categories,
  businesses: structuredClone(businesses),
  searches: seedSearchEvents,
  events: [],
  latency: { min: 150, max: 450 }
};
