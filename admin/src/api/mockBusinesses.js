import { addDays, daysLeft, todayEat } from "../lib/time.js";
import { fixtureHealth } from "./mockHealth.js";
import { deriveState } from "../lib/status.js";

const categories = ["Groceries", "Hardware", "Fashion", "Electronics", "Beauty", "Furniture", "Pharmacy", "Auto parts", "Stationery", "Bakery"];
const places = {
  Nairobi: ["Nairobi", "Westlands", "Embakasi"],
  Kisumu: ["Kisumu", "Maseno", "Ahero"],
  Mombasa: ["Mombasa", "Nyali", "Likoni"],
  Nakuru: ["Nakuru", "Naivasha", "Gilgil"],
  Uasin_Gishu: ["Eldoret", "Burnt Forest", "Turbo"],
};
const plans = ["Basic", "Standard", "Premium"];
export const agents = ["Faith Achieng", "Kevin Mutua", "Grace Wanjiru", "Brian Otieno"];
const first = ["Alice", "John", "Mary", "Peter", "Grace", "Samuel", "Lucy", "David", "Esther", "James", "Naomi", "Joseph"];
const last = ["Njeri", "Ouma", "Wambui", "Kamau", "Atieno", "Mwangi", "Kiptoo", "Otieno", "Wanjiku", "Mutua", "Chebet", "Odhiambo"];
const left = ["Kilele", "Tegemeo", "Bonde", "Lakeside", "Savanna", "Rift", "Coast", "Highland", "Sunrise", "Baraka", "Jambo", "Tumaini"];
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
      lastLogin: new Date(Date.parse(`${addDays(today, -loginAgeDays)}T08:00:00+03:00`) + between(0, 36000000)).toISOString(),
      lastEdit: new Date(Date.parse(`${addDays(today, -between(0, 45))}T09:00:00+03:00`) + between(0, 36000000)).toISOString(),
      createdAt: `${created}T10:00:00+03:00`,
      agent: random() < 0.7 ? pick(agents) : null,
      tags: [],
      deleted: random() < 0.03,
      unconfirmedPayment: random() < 0.08,
    });

    // Last, so the seeded random sequence above is unchanged. Fixture shape only: the real score is computed in SQL.
    const row = list[list.length - 1];
    row.health = fixtureHealth({
      completeness, items: row.items, priceAgeDays, loginAgeDays, openFlags, openReports, strikes: row.strikes,
      state: deriveState(row), ageDays: Math.round((Date.parse(`${today}T12:00:00+03:00`) - Date.parse(row.createdAt)) / 86400000),
      serious: openFlags > 1,
    });
    row.healthScore = row.health.score;
    row.healthBand = row.health.band;
    row.healthTrend = random() < 0.75 ? between(-9, 9) : null;
  }

  return list;
}

export const businessStore = build();

const searchFields = (row) => [row.name, row.phone, row.sellerId, row.slug, row.ownerName].join("\n").toLowerCase();

export const TAB_IDS = ["all", "live", "expiring", "grace", "expired", "paused", "suspended", "unlisted", "flagged", "deleted"];

const TAB_STATES = {
  live: ["live", "expiring", "grace"],
  expiring: ["expiring"],
  grace: ["grace"],
  expired: ["expired"],
  paused: ["paused"],
  suspended: ["suspended"],
  unlisted: ["unlisted"],
  deleted: ["deleted"],
};

function matchesTab(row, state, tab) {
  if (!tab || tab === "all") return state !== "deleted";
  if (tab === "flagged") return row.openFlags > 0 && state !== "deleted";
  return TAB_STATES[tab]?.includes(state) ?? false;
}

const isSet = (value) => value !== "" && value !== null && value !== undefined;

function matchesFilters(row, state, filters) {
  const days = daysLeft(row.paidUntil);
  if (filters.category && row.category !== filters.category) return false;
  if (filters.county && row.county !== filters.county) return false;
  if (filters.town && row.town !== filters.town) return false;
  if (filters.plan && row.plan !== filters.plan) return false;
  if (filters.verified && row.verified !== (filters.verified === "yes")) return false;
  if (filters.featured && row.featured !== (filters.featured === "yes")) return false;
  if (filters.status && state !== filters.status) return false;
  if (isSet(filters.daysMin) && days < Number(filters.daysMin)) return false;
  if (isSet(filters.daysMax) && days > Number(filters.daysMax)) return false;
  if (filters.health && row.healthBand !== filters.health) return false;
  if (filters.hasFlags && row.openFlags === 0) return false;
  if (filters.hasUnconfirmed && !row.unconfirmedPayment) return false;
  if (filters.agent === "__none__" && row.agent) return false;
  if (filters.agent && filters.agent !== "__none__" && row.agent !== filters.agent) return false;
  if (filters.createdFrom && row.createdAt.slice(0, 10) < filters.createdFrom) return false;
  if (filters.createdTo && row.createdAt.slice(0, 10) > filters.createdTo) return false;
  return true;
}

export function queryBusinesses({ search = "", sort = { key: "paidUntil", dir: "asc" }, extra = {} } = {}) {
  const needle = search.trim().toLowerCase();
  const filters = extra?.filters ?? {};
  const factor = sort.dir === "desc" ? -1 : 1;
  return businessStore
    .filter((row) => {
      const state = deriveState(row);
      return (!needle || searchFields(row).includes(needle)) && matchesTab(row, state, extra?.tab) && matchesFilters(row, state, filters);
    })
    .sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      const order = typeof left === "string" ? left.localeCompare(right) : (left ?? 0) - (right ?? 0);
      return order * factor || a.id.localeCompare(b.id);
    });
}

export function countBusinessTabs({ extra = {} } = {}) {
  const filters = extra?.filters ?? {};
  const counts = Object.fromEntries(TAB_IDS.map((id) => [id, 0]));
  for (const row of businessStore) {
    const state = deriveState(row);
    if (!matchesFilters(row, state, filters)) continue;
    for (const id of TAB_IDS) if (matchesTab(row, state, id)) counts[id] += 1;
  }
  return counts;
}

export function businessFilterOptions() {
  return {
    categories: [...categories].sort(),
    counties: Object.entries(places).map(([key, towns]) => ({ name: key.replace("_", " "), towns: [...towns].sort() })).sort((a, b) => a.name.localeCompare(b.name)),
    plans,
    agents,
  };
}
