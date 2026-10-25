import { demoItemId } from "./itemIds.js";

const DAY = 86400000;
const HOUR = 3600000;

// Demo offers. Each one is on named products of one store (`items`), never on the whole store.
// `main` products carry the offer; for a bundle, `with` products are the companions.
const offer = (id, businessId, kind, config, items, extra = {}) => {
  const at = Date.now();
  const { startsInDays = -1, endsInDays = 14, endsInHours = null, withIds = [], ...rest } = extra;
  const made = {
    id,
    businessId,
    title: null,
    description: null,
    kind,
    config,
    conditions: {},
    items: [...items.map((itemId) => ({ itemId, role: "main" })), ...withIds.map((itemId) => ({ itemId, role: "with" }))],
    chipText: null,
    code: null,
    terms: null,
    active: true,
    startsAt: startsInDays === null ? null : new Date(at + startsInDays * DAY).toISOString(),
    endsAt: endsInHours !== null ? new Date(at + endsInHours * HOUR).toISOString() : endsInDays === null ? null : new Date(at + endsInDays * DAY).toISOString(),
    status: "active",
    createdAt: new Date(at - 7 * DAY).toISOString(),
    updatedAt: new Date(at - 7 * DAY).toISOString(),
    ...rest
  };
  made.items = made.items.map((e) => ({ ...e, itemId: demoItemId(businessId, e.itemId) }));
  return made;
};

export const seedOffers = () => [
  offer("p_001", "b_001", "percent_off", { percent: 10 }, ["haircut", "fade-and-beard"], { title: "Student week", description: "10% off any cut with a student ID.", code: "STUDENT10", chipText: "Student deal", endsInDays: 5, terms: "Show a valid student ID at the chair." }),
  offer("p_002", "b_001", "multi_buy", { qty: 2, price: 200 }, ["haircut"], { title: "Bring a friend", description: "Two adult cuts for a set price.", endsInDays: 21, withIds: [] }),
  offer("p_003", "b_017", "amount_off", { amount: 300 }, ["box-braids", "cornrows"], { title: "Braids refresh", description: "Off any braiding service.", endsInDays: 10 }),
  offer("p_004", "b_013", "free_gift", { gift: "7 days free" }, ["monthly-membership"], { title: "First week free", description: "Try the gym free as a new member.", conditions: { newCustomersOnly: true }, chipText: "First week free", endsInDays: null }),
  offer("p_005", "b_007", "free_gift", { gift: "BP check" }, ["multivitamin-30-tablets", "digital-thermometer"], { title: "Free BP check", description: "With either of these items.", endsInDays: 18 }),
  offer("p_006", "b_010", "volume", { tiers: [{ qty: 2, percent: 5 }, { qty: 5, percent: 10 }] }, ["certified-maize-seed-2kg", "tomato-seed-hybrid-10g"], { title: "Seed season", description: "The more bags, the bigger the saving.", endsInDays: 25 }),
  offer("p_007", "b_020", "free_gift", { gift: "spare gasket" }, ["pressure-cooker-5l"], { title: "Free gasket", description: "Spare gasket with every pressure cooker.", endsInDays: 12 }),
  offer("p_008", "b_003", "percent_off", { percent: 15 }, ["haircut", "line-up"], { title: "Weekday special", description: "Quieter chairs before noon.", conditions: { daysOfWeek: ["mon", "tue", "wed", "thu", "fri"], hours: { from: "08:00", to: "12:00" } }, chipText: "Early bird", endsInDays: 30 }),
  offer("p_009", "b_002", "percent_off", { percent: 5 }, ["haircut"], { title: "Paused deal", active: false, status: "paused", endsInDays: 30 }),
  offer("p_010", "b_001", "percent_off", { percent: 15 }, ["hair-dye"], { title: "Coming soon", startsInDays: 6, endsInDays: 20, status: "scheduled" }),
  offer("p_011", "b_004", "buy_x_get_y", { buy: 10, get: 1, discountPercent: 100 }, ["20l-refill"], { title: "Refill loyalty", description: "Buy 10 refills of 20L, the 11th is free.", endsInDays: 30 }),
  offer("p_012", "b_005", "bundle", { rewardType: "bundle_price", rewardValue: 280 }, ["20l-refill"], { title: "Bottle + refill", description: "Our reusable bottle with the first refill, for less.", withIds: ["5l-refill"], endsInDays: 30 }),
  offer("p_013", "b_035", "buy_x_get_y", { buy: 2, get: 1, discountPercent: 100 }, ["bread-400g"], { title: "Buy 2 bread, get 1 free", endsInDays: 9, conditions: { daysOfWeek: ["fri", "sat", "sun"] }, chipText: "Buy 2 Get 1 Free" }),
  offer("p_014", "b_035", "free_gift", { gift: "box of 6 cupcakes" }, ["1-kg-vanilla-cake"], { title: "Cake plus cupcakes", description: "Free cupcakes when you order a cake 3 days ahead.", endsInDays: 22 }),
  offer("p_015", "b_025", "bundle", { rewardType: "bundle_price", rewardValue: 600 }, ["full-wash"], { title: "Full wash combo", withIds: ["engine-wash"], endsInDays: 16 }),
  offer("p_016", "b_022", "multi_buy", { qty: 2, price: 1000 }, ["chicken-biryani"], { title: "Biryani Friday", description: "Two chicken biryani plates for one price.", conditions: { daysOfWeek: ["fri"] }, endsInDays: 28 }),
  offer("p_017", "b_018", "free_gift", { gift: "diagnostics" }, ["basic-service"], { title: "Free diagnostics", endsInDays: 10 })
];
