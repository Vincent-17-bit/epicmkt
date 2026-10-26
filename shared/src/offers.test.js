import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OFFER_KIND_KEYS, OFFER_KINDS, OFFER_MAX_ITEMS, OFFER_RECIPES, STORE_OFFER_KIND_KEYS, STORE_OFFER_RECIPES, chipOf, conditionsText, liveOffers, offerAvailableNow, offerClaimMessage,
  offerHeadline, offerLabel, offerPhase, offerProductCount, offerQuota, offerRecipe, offerRemainingMs, offerSavings, offerSteps, offersByItem, validateOffer
} from "./offers.js";
import * as everything from "./index.js";

// Saturday 2026-10-24 10:00 in Nairobi (UTC+3) is 07:00 UTC.
const NOW = Date.parse("2026-10-24T07:00:00Z");
const HOUR = 3_600_000;
const DAY = 86_400_000;

const items = [
  { id: "bottle", name: "20L bottle", price: 400, priceType: "fixed" },
  { id: "refill", name: "20L refill", price: 100, priceType: "fixed" },
  { id: "juice", name: "Juice", price: 120, priceType: "fixed" },
  { id: "quote", name: "Custom job", price: null, priceType: "contact" }
];
const base = (patch = {}) => ({ kind: "percent_off", config: { percent: 10 }, itemIds: ["juice"], ...patch });
const run = (patch, opts) => validateOffer(base(patch), { items, nowMs: NOW, ...opts });
const bad = (patch, opts) => {
  const r = run(patch, opts);
  assert.equal(r.ok, false, JSON.stringify(r));
  return r.error;
};

test("every kind has wording that reads well on a chip", () => {
  const sample = {
    percent_off: [{ percent: 15 }, "15% off"],
    amount_off: [{ amount: 50 }, "KES 50 off"],
    buy_x_get_y: [{ buy: 2, get: 1, discountPercent: 100 }, "Buy 2 Get 1 Free"],
    multi_buy: [{ qty: 3, price: 1000 }, "3 for KES 1,000"],
    bundle: [{ rewardType: "bundle_price", rewardValue: 450 }, "Bundle KES 450"],
    volume: [{ tiers: [{ qty: 3, percent: 5 }, { qty: 6, percent: 12 }] }, "Save up to 12%"],
    free_gift: [{ gift: "delivery" }, "Free delivery"]
  };
  assert.deepEqual(Object.keys(sample).sort(), [...OFFER_KIND_KEYS].sort());
  for (const [kind, [config, text]] of Object.entries(sample)) {
    assert.equal(offerLabel({ kind, config }), text);
    assert.ok(offerLabel({ kind, config }).length <= 28, kind);
    assert.ok(offerHeadline({ kind, config }).length > 2, kind);
  }
  assert.equal(offerLabel({ kind: "buy_x_get_y", config: { buy: 1, get: 1, discountPercent: 50 } }), "Buy 1 Get 1 50% off");
  assert.equal(offerLabel({ kind: "bundle", config: { rewardType: "free_gift", gift: "cap" } }), "Bundle + free gift");
  assert.equal(offerLabel({ kind: "free_gift", config: { gift: "Free delivery" } }), "Free delivery", "no double Free");
});

test("a seller's own chip text wins, and the plain label stays available", () => {
  const offer = { kind: "percent_off", config: { percent: 20 }, chipText: "Happy hour" };
  assert.equal(offerLabel(offer), "Happy hour");
  assert.equal(offerLabel(offer, { plain: true }), "20% off");
  assert.equal(offerLabel({ kind: "nope" }), "Offer");
  assert.equal(offerLabel(null), "Offer");
});

test("a valid offer is normalised and given a title", () => {
  const r = run({ chipText: "  Promo ", code: " save10 ", terms: "  ", description: "", itemIds: ["juice", "juice"] });
  assert.equal(r.ok, true);
  assert.equal(r.value.title, "10% off");
  assert.equal(r.value.chipText, "Promo");
  assert.equal(r.value.code, "SAVE10");
  assert.equal(r.value.terms, null);
  assert.equal(r.value.description, null);
  assert.deepEqual(r.value.items, [{ itemId: "juice", role: "main" }]);
  assert.equal(r.value.startsAt, new Date(NOW).toISOString());
  assert.equal(r.value.endsAt, null);
});

test("each kind refuses a config it cannot run", () => {
  assert.equal(bad({ kind: "mystery" }), "invalid_kind");
  assert.equal(bad({ config: { percent: 0 } }), "invalid_config");
  assert.equal(bad({ config: { percent: 100 } }), "invalid_config");
  assert.equal(bad({ config: { percent: 12.5 } }), "invalid_config");
  assert.equal(bad({ kind: "amount_off", config: { amount: -5 } }), "invalid_config");
  assert.equal(bad({ kind: "buy_x_get_y", config: { buy: 0, get: 1 } }), "invalid_config");
  assert.equal(bad({ kind: "buy_x_get_y", config: { buy: 2, get: 1, discountPercent: 101 } }), "invalid_config");
  assert.equal(bad({ kind: "multi_buy", config: { qty: 1, price: 100 } }), "invalid_config");
  assert.equal(bad({ kind: "multi_buy", config: { qty: 3 } }), "invalid_config");
  assert.equal(bad({ kind: "free_gift", config: { gift: " " } }), "invalid_config");
  assert.equal(bad({ kind: "free_gift", config: { gift: "x" } }), "invalid_config");
  assert.equal(bad({ kind: "volume", config: { tiers: [] } }), "invalid_config");
  assert.equal(bad({ kind: "volume", config: { tiers: [{ qty: 6, percent: 10 }, { qty: 3, percent: 20 }] } }), "invalid_config");
  assert.equal(bad({ kind: "volume", config: { tiers: [{ qty: 3, percent: 10 }, { qty: 6, percent: 5 }] } }), "invalid_config");
  assert.equal(bad({ kind: "bundle", itemIds: undefined, items: [{ itemId: "bottle" }, { itemId: "refill", role: "with" }], config: { rewardType: "free_gift" } }), "invalid_config");
  assert.equal(bad({ kind: "bundle", itemIds: undefined, items: [{ itemId: "bottle" }, { itemId: "refill", role: "with" }], config: { rewardType: "bundle_price" } }), "invalid_config");
});

test("buy X get Y defaults to free and accepts a partial discount", () => {
  assert.equal(run({ kind: "buy_x_get_y", config: { buy: 2, get: 1 } }).value.config.discountPercent, 100);
  assert.equal(run({ kind: "buy_x_get_y", config: { buy: "10", get: "1", discountPercent: "50" } }).value.config.discountPercent, 50);
});

test("products must be the seller's own, at least one, and not too many", () => {
  assert.equal(bad({ itemIds: ["ghost"] }), "item_not_found");
  assert.equal(bad({ itemIds: [] }), "no_items");
  const many = Array.from({ length: OFFER_MAX_ITEMS + 1 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, price: 100 }));
  assert.equal(validateOffer(base({ itemIds: many.map((m) => m.id) }), { items: many, nowMs: NOW }).error, "too_many_items");
});

test("a bundle needs a main product and at least one companion, other kinds ignore roles", () => {
  const bundle = (entries, config = { rewardType: "bundle_price", rewardValue: 450 }) => ({ kind: "bundle", itemIds: undefined, items: entries, config });
  assert.equal(bad(bundle([{ itemId: "bottle" }])), "bundle_needs_two");
  assert.equal(bad(bundle([{ itemId: "bottle" }, { itemId: "refill" }])), "bundle_needs_two");
  const ok = validateOffer(base(bundle([{ itemId: "bottle" }, { itemId: "refill", role: "with" }])), { items, nowMs: NOW });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.items, [{ itemId: "bottle", role: "main" }, { itemId: "refill", role: "with" }]);
  const plain = validateOffer(base({ itemIds: undefined, items: [{ itemId: "juice", role: "with" }] }), { items, nowMs: NOW });
  assert.equal(plain.value.items[0].role, "main");
});

test("a deal that is not cheaper than the normal price is refused when prices are known", () => {
  assert.equal(bad({ kind: "amount_off", config: { amount: 120 } }), "discount_too_large");
  assert.equal(bad({ kind: "multi_buy", config: { qty: 3, price: 360 } }), "deal_not_cheaper");
  assert.equal(run({ kind: "multi_buy", config: { qty: 3, price: 300 } }).ok, true);
  assert.equal(bad({ kind: "bundle", itemIds: undefined, items: [{ itemId: "bottle" }, { itemId: "refill", role: "with" }], config: { rewardType: "bundle_price", rewardValue: 500 } }), "deal_not_cheaper");
  assert.equal(bad({ kind: "bundle", itemIds: undefined, items: [{ itemId: "bottle" }, { itemId: "refill", role: "with" }], config: { rewardType: "amount_off", rewardValue: 500 } }), "discount_too_large");
  // No price to compare with: the seller is trusted.
  assert.equal(run({ kind: "multi_buy", config: { qty: 3, price: 9999 }, itemIds: ["quote"] }).ok, true);
});

test("the window follows the same rules as flash sales, with a longer limit", () => {
  assert.equal(bad({ endsAt: new Date(NOW - HOUR).toISOString() }), "ends_in_past");
  assert.equal(bad({ startsAt: new Date(NOW + 2 * HOUR).toISOString(), endsAt: new Date(NOW + HOUR).toISOString() }), "invalid_window");
  assert.equal(bad({ endsAt: "nonsense" }), "invalid_window");
  assert.equal(bad({ endsAt: new Date(NOW + 366 * DAY).toISOString() }), "duration_too_long");
  assert.equal(run({ endsAt: new Date(NOW + 365 * DAY).toISOString() }).ok, true);
  const later = run({ startsAt: new Date(NOW + DAY).toISOString(), endsAt: new Date(NOW + 3 * DAY).toISOString() });
  assert.equal(later.value.startsAt, new Date(NOW + DAY).toISOString());
  assert.equal(run({ startsAt: new Date(NOW - DAY).toISOString() }).value.startsAt, new Date(NOW).toISOString(), "a new offer cannot start in the past");
  assert.equal(run({ startsAt: new Date(NOW - DAY).toISOString() }, { existing: { id: "x" } }).value.startsAt, new Date(NOW - DAY).toISOString(), "an edit keeps its start");
});

test("text fields and the code are checked", () => {
  assert.equal(bad({ title: "ab" }), "invalid_title");
  assert.equal(bad({ title: "x".repeat(81) }), "invalid_title");
  assert.equal(bad({ chipText: "x" }), "invalid_chip_text");
  assert.equal(bad({ chipText: "x".repeat(23) }), "invalid_chip_text");
  assert.equal(bad({ title: "bad\u0007text" }), "invalid_title");
  assert.equal(bad({ terms: "x".repeat(281) }), "invalid_terms");
  assert.equal(bad({ description: "x".repeat(201) }), "invalid_description");
  assert.equal(bad({ code: "no spaces" }), "invalid_code");
  assert.equal(bad({ code: "AB" }), "invalid_code");
  assert.equal(run({ code: "welcome-1" }).ok, false);
  assert.equal(run({ code: "WELCOME1" }).ok, true);
});

test("conditions keep only what limits the offer", () => {
  const okc = (conditions) => run({ conditions }).value.conditions;
  assert.deepEqual(okc({}), {});
  assert.deepEqual(okc({ daysOfWeek: ["sat", "mon"] }), { daysOfWeek: ["mon", "sat"] });
  assert.deepEqual(okc({ daysOfWeek: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }), {}, "every day is no limit");
  assert.deepEqual(okc({ hours: { from: "16:00", to: "18:00" }, newCustomersOnly: true, minSpend: "500" }), { hours: { from: "16:00", to: "18:00" }, newCustomersOnly: true, minSpend: 500 });
  assert.equal(bad({ conditions: { daysOfWeek: ["funday"] } }), "invalid_conditions");
  assert.equal(bad({ conditions: { daysOfWeek: "mon" } }), "invalid_conditions");
  assert.equal(bad({ conditions: { hours: { from: "25:00", to: "18:00" } } }), "invalid_conditions");
  assert.equal(bad({ conditions: { hours: { from: "16:00", to: "16:00" } } }), "invalid_conditions");
  assert.equal(bad({ conditions: { minSpend: -1 } }), "invalid_conditions");
});

test("conditions read as short phrases", () => {
  assert.deepEqual(conditionsText({ conditions: { daysOfWeek: ["mon", "tue", "wed", "thu", "fri"], hours: { from: "16:00", to: "18:30" }, newCustomersOnly: true, minSpend: 500 } }), ["Weekdays", "4pm to 6:30pm", "New customers only", "Spend KES 500 or more"]);
  assert.deepEqual(conditionsText({ conditions: { daysOfWeek: ["sun", "sat"] } }), ["Weekends"]);
  assert.deepEqual(conditionsText({ conditions: { daysOfWeek: ["wed", "mon"], hours: { from: "00:00", to: "12:00" } } }), ["Mon, Wed", "12am to 12pm"]);
  assert.deepEqual(conditionsText({}), []);
});

test("savings are worked out on real prices and never negative", () => {
  const s = (offer, args) => offerSavings(offer, args);
  assert.deepEqual(s({ kind: "percent_off", config: { percent: 25 } }, { price: 400 }), { units: 1, regular: 400, pay: 300, save: 100, text: "Pay KES 300 instead of KES 400" });
  assert.equal(s({ kind: "amount_off", config: { amount: 50 } }, { price: 400 }).pay, 350);
  assert.equal(s({ kind: "amount_off", config: { amount: 500 } }, { price: 400 }), null, "free is not a saving shown as negative");
  const bogo = s({ kind: "buy_x_get_y", config: { buy: 2, get: 1, discountPercent: 100 } }, { price: 120 });
  assert.deepEqual([bogo.units, bogo.regular, bogo.pay, bogo.save], [3, 360, 240, 120]);
  assert.equal(s({ kind: "buy_x_get_y", config: { buy: 1, get: 1, discountPercent: 50 } }, { price: 200 }).save, 100);
  assert.equal(s({ kind: "multi_buy", config: { qty: 3, price: 300 } }, { price: 120 }).save, 60);
  const bundle = s({ kind: "bundle", config: { rewardType: "bundle_price", rewardValue: 450 } }, { price: 400, companions: [{ price: 100 }] });
  assert.deepEqual([bundle.units, bundle.regular, bundle.pay, bundle.save], [2, 500, 450, 50]);
  assert.equal(s({ kind: "bundle", config: { rewardType: "percent_off", rewardValue: 10 } }, { price: 400, companions: [{ price: 100 }] }).pay, 450);
  assert.equal(s({ kind: "bundle", config: { rewardType: "free_gift", gift: "cap" } }, { price: 400, companions: [{ price: 100 }] }), null);
  assert.equal(s({ kind: "bundle", config: { rewardType: "bundle_price", rewardValue: 450 } }, { price: 400, companions: [{ price: null }] }), null, "a missing companion price means no maths");
  const volume = s({ kind: "volume", config: { tiers: [{ qty: 3, percent: 5 }, { qty: 6, percent: 10 }] } }, { price: 100 });
  assert.deepEqual([volume.units, volume.pay, volume.save], [6, 540, 60]);
  assert.equal(s({ kind: "free_gift", config: { gift: "cap" } }, { price: 100 }), null);
  assert.equal(s({ kind: "percent_off", config: { percent: 10 } }, { price: NaN }), null);
  assert.equal(s({ kind: "percent_off", config: { percent: 10 } }, {}), null);
});

test("how it works is plain steps and names the code when there is one", () => {
  const steps = offerSteps({ kind: "buy_x_get_y", config: { buy: 2, get: 1, discountPercent: 100 }, code: "B2G1" });
  assert.deepEqual(steps, ["Add 2 to your order.", "Get one more free.", "Tell the seller the code B2G1."]);
  const bundle = offerSteps({ kind: "bundle", config: { rewardType: "bundle_price", rewardValue: 450 } }, { products: [{ name: "Bottle", role: "main" }, { name: "Refill", role: "with" }] });
  assert.equal(bundle[0], "Buy Bottle together with Refill.");
  assert.equal(bundle[1], "Pay KES 450 for the set.");
  assert.equal(bundle[2], "Mention this offer when you chat with the seller.");
  assert.equal(offerSteps({ kind: "volume", config: { tiers: [{ qty: 3, percent: 5 }, { qty: 6, percent: 10 }] } }).length, 3);
});

test("the claim message names the plain deal, the product and the code", () => {
  const offer = { kind: "percent_off", config: { percent: 20 }, chipText: "Happy hour", code: "HAPPY" };
  assert.equal(offerClaimMessage(offer, "Latte"), 'Hi, I saw the offer "20% off" on Latte (code HAPPY) on EpicMKT. I would like to claim it.');
});

test("phases: paused, scheduled, live and ended, by flag or by window", () => {
  const w = (patch) => ({ startsAt: new Date(NOW - HOUR).toISOString(), endsAt: new Date(NOW + HOUR).toISOString(), active: true, ...patch });
  assert.equal(offerPhase(w({}), NOW), "live");
  assert.equal(offerPhase(w({ endsAt: null }), NOW), "live");
  assert.equal(offerPhase(w({ startsAt: null }), NOW), "live");
  assert.equal(offerPhase(w({ active: false }), NOW), "paused");
  assert.equal(offerPhase(w({ status: "paused" }), NOW), "paused");
  assert.equal(offerPhase(w({ startsAt: new Date(NOW + HOUR).toISOString(), endsAt: new Date(NOW + 2 * HOUR).toISOString() }), NOW), "scheduled");
  assert.equal(offerPhase(w({ endsAt: new Date(NOW - 1).toISOString() }), NOW), "ended");
  assert.equal(offerPhase(w({ endsAt: new Date(NOW).toISOString() }), NOW), "ended", "it ends at the stroke");
  assert.equal(offerPhase(w({ status: "expired" }), NOW), "ended");
  assert.equal(offerPhase(w({ active: false, endsAt: new Date(NOW - HOUR).toISOString() }), NOW), "ended", "ended beats paused");
});

test("day and hour limits use Nairobi time", () => {
  const happy = { conditions: { daysOfWeek: ["mon", "tue", "wed", "thu", "fri"], hours: { from: "16:00", to: "18:00" } } };
  assert.equal(offerAvailableNow(happy, NOW), false, "Saturday 10:00");
  const fri5pm = Date.parse("2026-10-23T14:00:00Z");
  assert.equal(offerAvailableNow(happy, fri5pm), true, "Friday 17:00 Nairobi");
  assert.equal(offerAvailableNow(happy, Date.parse("2026-10-23T15:00:00Z")), false, "Friday 18:00 is the end");
  assert.equal(offerAvailableNow({ conditions: { daysOfWeek: ["sat", "sun"] } }, NOW), true);
  assert.equal(offerAvailableNow({ conditions: { hours: { from: "22:00", to: "02:00" } } }, Date.parse("2026-10-24T22:30:00Z")), true, "01:30 Nairobi, past midnight");
  assert.equal(offerAvailableNow({}, NOW), true);
});

test("remaining time", () => {
  assert.equal(offerRemainingMs({ endsAt: new Date(NOW + HOUR).toISOString() }, NOW), HOUR);
  assert.equal(offerRemainingMs({ endsAt: new Date(NOW - HOUR).toISOString() }, NOW), 0);
  assert.equal(offerRemainingMs({ endsAt: null }, NOW), null);
});

const offer = (id, itemIds, patch = {}) => ({ id, kind: "percent_off", config: { percent: 10 }, items: itemIds.map((itemId) => ({ itemId })), active: true, startsAt: new Date(NOW - HOUR).toISOString(), endsAt: null, createdAt: new Date(NOW - DAY).toISOString(), ...patch });

test("a card names the offer that ends first and counts the rest", () => {
  const later = offer("a", ["x"], { endsAt: new Date(NOW + 5 * HOUR).toISOString() });
  const sooner = offer("b", ["x"], { endsAt: new Date(NOW + HOUR).toISOString(), config: { percent: 30 } });
  const open = offer("c", ["x"]);
  const done = offer("d", ["x"], { endsAt: new Date(NOW - 1).toISOString() });
  const off = offer("e", ["x"], { active: false });
  const chip = chipOf([later, open, done, off, sooner], NOW);
  assert.equal(chip.top.id, "b");
  assert.equal(chip.label, "30% off");
  assert.equal(chip.extra, 2);
  assert.deepEqual(chip.offers.map((o) => o.id), ["b", "a", "c"]);
  assert.equal(chipOf([done, off], NOW), null);
  assert.equal(chipOf([], NOW), null);
  assert.equal(chipOf(undefined, NOW), null);
  assert.deepEqual(liveOffers([done, off], NOW), []);
});

test("offers sit on their own products and the store counts products, not offers", () => {
  const a = offer("a", ["juice", "bread"]);
  const b = offer("b", ["juice"]);
  const c = offer("c", ["milk"], { endsAt: new Date(NOW - 1).toISOString() });
  const map = offersByItem([a, b, c]);
  assert.deepEqual(map.get("juice").map((o) => o.id), ["a", "b"]);
  assert.deepEqual(map.get("bread").map((o) => o.id), ["a"]);
  assert.equal(map.get("tea"), undefined, "a product with no offer has none");
  assert.equal(offerProductCount([a, b, c], NOW), 2, "juice and bread; milk's offer is over");
  assert.equal(offerProductCount([], NOW), 0);
  assert.equal(offerProductCount([offer("z", [])], NOW), 0, "an offer on no product shows nothing");
  assert.deepEqual(offersByItem([{ id: "legacy", itemIds: ["q"] }]).get("q").map((o) => o.id), ["legacy"], "plain id lists work too");
});

test("the plan limit counts offers that are on or about to start", () => {
  const list = [offer("a", ["x"]), offer("b", ["x"], { startsAt: new Date(NOW + HOUR).toISOString() }), offer("c", ["x"], { active: false }), offer("d", ["x"], { endsAt: new Date(NOW - 1).toISOString() })];
  assert.deepEqual(offerQuota(list, { activeOffers: 2 }, NOW), { limit: 2, used: 2, canCreate: false });
  assert.deepEqual(offerQuota(list, { activeOffers: 3 }, NOW), { limit: 3, used: 2, canCreate: true });
  assert.deepEqual(offerQuota(list, { activeOffers: null }, NOW), { limit: null, used: 2, canCreate: true });
  assert.deepEqual(offerQuota(list, undefined, NOW), { limit: null, used: 2, canCreate: true });
});

test("every recipe is a real offer once the seller fills the blanks", () => {
  assert.ok(OFFER_RECIPES.length >= 12);
  const keys = new Set();
  const fill = {
    price: { multi_buy: { price: 250 } },
    rewardValue: { bundle: { rewardValue: 450 } },
    gift: { free_gift: { gift: "cupcake" }, bundle: { gift: "screen guard" } }
  };
  for (const recipe of OFFER_RECIPES) {
    assert.ok(!keys.has(recipe.key), `duplicate ${recipe.key}`);
    keys.add(recipe.key);
    assert.ok(OFFER_KINDS[recipe.kind], recipe.key);
    assert.ok(recipe.title && recipe.blurb && recipe.example && recipe.icon, recipe.key);
    let config = { ...recipe.config };
    for (const need of recipe.needs ?? []) Object.assign(config, fill[need]?.[recipe.kind] ?? {});
    const entries = recipe.kind === "bundle" ? [{ itemId: "bottle" }, { itemId: "refill", role: "with" }] : [{ itemId: "juice" }];
    const r = validateOffer({ kind: recipe.kind, config, conditions: recipe.conditions, chipText: recipe.chipText, code: recipe.code, terms: recipe.terms, items: entries }, { items, nowMs: NOW });
    assert.equal(r.ok, true, `${recipe.key}: ${r.error}`);
    assert.ok(offerLabel(r.value).length <= 28, recipe.key);
  }
  assert.equal(offerRecipe("buy2get1").kind, "buy_x_get_y");
  assert.equal(offerRecipe("nothing"), null);
});

test("recipes that need a decision are incomplete until it is made", () => {
  for (const key of ["multi3", "bottle_refill", "free_gift", "bundle_gift"]) {
    const recipe = offerRecipe(key);
    const entries = recipe.kind === "bundle" ? [{ itemId: "bottle" }, { itemId: "refill", role: "with" }] : [{ itemId: "juice" }];
    assert.equal(validateOffer({ kind: recipe.kind, config: recipe.config, items: entries }, { items, nowMs: NOW }).ok, false, key);
  }
});

test("the index exports the offer engine without clashing with other names", () => {
  for (const name of ["validateOffer", "offerLabel", "chipOf", "offerProductCount", "OFFER_RECIPES", "offerPhase"]) assert.equal(typeof everything[name], name.startsWith("OFFER") ? "object" : "function", name);
});

const store = (patch = {}) => ({ scope: "store", kind: "percent_off", config: { percent: 10 }, ...patch });
const runStore = (patch) => validateOffer(store(patch), { items, nowMs: NOW });

test("a store offer needs no products and has its own kinds", () => {
  const r = runStore({});
  assert.equal(r.ok, true);
  assert.equal(r.value.scope, "store");
  assert.deepEqual(r.value.items, []);
  assert.equal(offerHeadline(r.value), "10% off your whole order");
  assert.deepEqual(STORE_OFFER_KIND_KEYS, ["percent_off", "amount_off", "free_gift"]);
  for (const kind of ["buy_x_get_y", "multi_buy", "bundle", "volume"]) assert.equal(runStore({ kind, config: OFFER_KINDS[kind].defaults }).error, "invalid_kind", kind);
});

test("a store offer ignores products and product-only settings", () => {
  const r = runStore({ items: [{ itemId: "nope" }], kind: "free_gift", config: { gift: "delivery", minQty: 5 } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.items, []);
  assert.deepEqual(r.value.config, { gift: "delivery" });
  assert.equal(offerLabel(r.value), "Free delivery");
});

test("a store offer keeps its conditions and rejects bad ones", () => {
  const r = runStore({ kind: "amount_off", config: { amount: 200 }, conditions: { minSpend: 2000, daysOfWeek: ["sat", "sun"] } });
  assert.equal(r.ok, true);
  assert.deepEqual(conditionsText(r.value), ["Weekends", "Spend KES 2,000 or more"]);
  assert.equal(runStore({ conditions: { hours: { from: "10:00", to: "10:00" } } }).error, "invalid_conditions");
  assert.equal(runStore({ config: { percent: 100 } }).error, "invalid_config");
});

test("a product offer is still the default scope", () => {
  assert.equal(run({}).value.scope, "product");
  assert.equal(run({ items: [] , itemIds: [] }).error, "no_items");
});

test("store offers never count as products and read as order steps", () => {
  const live = { ...runStore({}).value, id: "s1", active: true };
  assert.equal(offerProductCount([live], NOW), 0);
  assert.equal(offersByItem([live]).size, 0);
  assert.equal(offerSteps(live)[0], "Order from this shop.");
  assert.equal(chipOf([live], NOW).label, "10% off");
});

test("every store recipe is a valid store offer", () => {
  const keys = new Set();
  for (const r of STORE_OFFER_RECIPES) {
    assert.ok(!keys.has(r.key));
    keys.add(r.key);
    assert.ok(r.title && r.blurb && r.example, r.key);
    const out = runStore({ kind: r.kind, config: r.config, conditions: r.conditions, chipText: r.chipText });
    assert.equal(out.ok, true, `${r.key}: ${out.error}`);
  }
  assert.equal(offerRecipe("store_welcome").kind, "percent_off");
});
