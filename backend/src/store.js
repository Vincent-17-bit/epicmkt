import { categories } from "./data/categories.js";
import { businesses } from "./data/businesses.js";

const seedSearches = [
  ["barbershop", 412], ["water refill", 366], ["chemist", 341], ["agrovet", 287],
  ["gym", 254], ["braids", 231], ["haircut", 198], ["pharmacy", 176], ["garage", 143], ["biryani", 121]
];

export const store = {
  categories,
  businesses: structuredClone(businesses),
  searches: new Map(seedSearches),
  events: [],
  latency: { min: 150, max: 450 }
};
