import { addDays, todayEat } from "../lib/time.js";
import { healthScore } from "../lib/health.js";

const categories = ["Groceries", "Hardware", "Fashion", "Electronics", "Beauty", "Furniture", "Pharmacy", "Auto parts", "Stationery", "Bakery"];
const places = {
  Nairobi: ["Nairobi", "Westlands", "Embakasi"],
  Kisumu: ["Kisumu", "Maseno", "Ahero"],
  Mombasa: ["Mombasa", "Nyali", "Likoni"],
  Nakuru: ["Nakuru", "Naivasha", "Gilgil"],
  Uasin_Gishu: ["Eldoret", "Burnt Forest", "Turbo"],
};
const plans = ["Basic", "Standard", "Premium"];
const agents = ["Faith Achieng", "Kevin Mutua", "Grace Wanjiru", "Brian Otieno"];
const first = ["Alice", "John", "Mary", "Peter", "Grace", "Samuel", "Lucy", "David", "Esther", "James", "Naomi", "Joseph"];
const last = ["Njeri", "Ouma", "Wambui", "Kamau", "Atieno", "Mwangi", "Kiptoo", "Otieno", "Wanjiku", "Mutua", "Chebet", "Odhiambo"];
const left = ["Mara", "Umoja", "Green Valley", "Lakeside", "Savanna", "Rift", "Coast", "Highland", "Sunrise", "Baraka", "Jambo", "Tumaini"];
const right = ["Fresh Mart", "Hardware", "Foods", "Traders", "Boutique", "Electronics", "Pharmacy", "Auto Spares", "Supplies", "Bakers", "Furniture", "Beauty Hub"];

function rng(seed) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function build() {
  const random = rng(20261016);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const between = (min, max) => min + Math.floor(random() * (max - min + 1));
  const today = todayEat();
  const used = new Set();
  const list = [];

  for (let index = 0; index < 640; index += 1) {
    let name = `${pick(left)} ${pick(right)}`;
    while (used.has(name)) name = `${pick(left)} ${pick(right)}${between(2, 99)}`;
    used.add(name);

    const county = pick(Object.keys(places));
    const statusRoll = random();
    const status = statusRoll < 0.04 ? "suspended" : statusRoll < 0.1 ? "paused" : statusRoll < 0.15 ? "unlisted" : "live";
    const completeness = between(35, 100);
    const priceAgeDays = between(0, 60);
    const loginAgeDays = between(0, 30);
    const openFlags = random() < 0.12 ? between(1, 3) : 0;
    const openReports = Math.min(openFlags, between(0, 2));
    const created = addDays(today, -between(20, 700));
    const owner = `${pick(first)} ${pick(last)}`;

    list.push({
      id: `b-${String(index + 1).padStart(4, "0")}`,
      sellerId: `ES${between(100000, 999999)}`,
      slug: slugify(name),
      name,
      category: pick(categories),
      county: county.replace("_", " "),
      town: pick(places[county]),
      ownerName: owner,
      phone: `07${between(10, 29)}${String(between(0, 999999)).padStart(6, "0")}`,
      plan: pick(plans),
      verified: random() < 0.6,
      featured: random() < 0.1,
      status,
      paidUntil: addDays(today, between(-20, 75)),
      items: between(0, 180),
      openFlags,
      strikes: random() < 0.15 ? between(1, 3) : 0,
      completeness,
      priceAgeDays,
      loginAgeDays,
      openReports,
      healthScore: healthScore({ completeness, priceAgeDays, loginAgeDays, openReports }),
      lastLogin: new Date(Date.parse(`${addDays(today, -loginAgeDays)}T08:00:00+03:00`) + between(0, 36000000)).toISOString(),
      lastEdit: new Date(Date.parse(`${addDays(today, -between(0, 45))}T09:00:00+03:00`) + between(0, 36000000)).toISOString(),
      createdAt: `${created}T10:00:00+03:00`,
      agent: random() < 0.7 ? pick(agents) : null,
      tags: [],
      deleted: random() < 0.03,
    });
  }

  return list;
}

export const businessStore = build();

const searchFields = (row) => [row.name, row.phone, row.sellerId, row.slug, row.ownerName].join("\n").toLowerCase();

export function queryBusinesses({ search = "", sort = { key: "name", dir: "asc" } } = {}) {
  const needle = search.trim().toLowerCase();
  const rows = businessStore.filter((row) => !needle || searchFields(row).includes(needle));
  const factor = sort.dir === "desc" ? -1 : 1;
  return rows.sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    const order = typeof left === "string" ? left.localeCompare(right) : (left ?? 0) - (right ?? 0);
    return order * factor || a.id.localeCompare(b.id);
  });
}
