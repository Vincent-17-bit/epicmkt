import test from "node:test";
import assert from "node:assert/strict";
import { checkDeliverySetting, deliveryInfo, deliveryReach } from "./delivery.js";

const shop = { lat: -1.2864, lng: 36.8172 };
const north = (km) => ({ lat: shop.lat + km / 111.19, lng: shop.lng });

test("a shop that delivers, with fee and radius", () => {
  assert.deepEqual(deliveryInfo({ delivery: { offers: true, fee: 150, radiusKm: 5, area: "Westlands", minOrder: 500, notes: "Mornings" } }),
    { offers: true, fee: 150, radiusKm: 5, area: "Westlands", minOrder: 500, notes: "Mornings" });
});
test("it delivers but sets no radius: radius is null", () => {
  const i = deliveryInfo({ delivery: { offers: true, fee: 0, area: "CBD" } });
  assert.equal(i.offers, true); assert.equal(i.radiusKm, null); assert.equal(i.fee, 0);
});
test("the database column names and the flat names read the same", () => {
  assert.deepEqual(deliveryInfo({ delivers: true, delivery_fee: "120", delivery_radius_km: 3, delivery_area: " Kilimani " }),
    { offers: true, fee: 120, radiusKm: 3, area: "Kilimani", minOrder: null, notes: null });
  assert.equal(deliveryInfo({ deliveryFee: 90, delivery: true }).fee, 90);
});
test("not delivering, a missing field, empty and garbage all mean no delivery", () => {
  for (const b of [{ delivery: { offers: false, fee: 100 } }, {}, null, undefined, "x", 5, { delivery: {} }, { delivery: { offers: "maybe" } }, { delivers: null }, { delivers: "" }, { delivers: 0 }, { delivers: [] }]) {
    assert.equal(deliveryInfo(b).offers, false, JSON.stringify(b));
    assert.equal(deliveryInfo(b).fee, null);
  }
});
test("a shop that does not deliver keeps its area text but shows no fee, radius or notes", () => {
  assert.deepEqual(deliveryInfo({ delivers: false, delivery_area: "Karen", delivery_fee: 100 }), { offers: false, fee: null, radiusKm: null, area: "Karen", minOrder: null, notes: null });
});
test("negative, NaN, infinite, boolean and text numbers become null, never a bad number", () => {
  for (const v of [-1, NaN, Infinity, -Infinity, true, "abc", "1e3", "-5", {}, [], "12abc"]) {
    const i = deliveryInfo({ delivery: { offers: true, fee: v, radiusKm: v, minOrder: v } });
    assert.equal(i.fee, null, String(v)); assert.equal(i.radiusKm, null); assert.equal(i.minOrder, null);
  }
  assert.equal(deliveryInfo({ delivery: { offers: true, radiusKm: 0 } }).radiusKm, null, "zero radius is no radius");
  assert.equal(deliveryInfo({ delivery: { offers: true, radiusKm: 100000 } }).radiusKm, null, "beyond the cap is refused");
});
test("reach: inside, outside, and the edge tolerance (the distance is by road: the straight line times 1.3 until a real one is known)", () => {
  const b = { ...shop, delivery: { offers: true, radiusKm: 5 } };
  assert.equal(deliveryReach(b, north(3)).status, "inside");   // about 3.9 km by road
  assert.equal(deliveryReach(b, north(4.2)).status, "outside"); // about 5.5 km by road, past the radius and its tolerance
  assert.equal(deliveryReach(b, north(9)).status, "outside");
  const r = deliveryReach(b, north(3));
  assert.equal(r.radiusKm, 5); assert.equal(r.basis, "estimate");
  assert.ok(Math.abs(r.straightKm - 3) < 0.15); assert.ok(Math.abs(r.distanceKm - 3.9) < 0.2);
});
test("reach: a real road distance wins over the estimate, and the edge tolerance applies to it", () => {
  const b = { ...shop, delivery: { offers: true, radiusKm: 5 } };
  const near = deliveryReach(b, north(3), { roadKm: 4.4 });
  assert.deepEqual([near.status, near.distanceKm, near.basis], ["inside", 4.4, "road"]);
  assert.equal(deliveryReach(b, north(1), { roadKm: 5.1 }).status, "inside", "within the tolerance past the radius");
  assert.equal(deliveryReach(b, north(1), { roadKm: 5.6 }).status, "outside", "a long road beats a short straight line");
  assert.equal(deliveryReach(b, north(3), { roadKm: Number.NaN }).basis, "estimate", "a bad road figure is ignored");
  assert.equal(deliveryReach(b, null, { roadKm: 3 }).distanceKm, 3, "a road figure alone is enough to answer");
});
test("reach: none without delivery; unknown without a radius, a buyer position or a shop position", () => {
  assert.deepEqual(deliveryReach({ ...shop, delivery: { offers: false } }, north(1)), { status: "none", distanceKm: null, radiusKm: null });
  assert.equal(deliveryReach({ ...shop, delivery: { offers: true } }, north(1)).status, "unknown");
  assert.equal(deliveryReach({ ...shop, delivery: { offers: true, radiusKm: 5 } }, null).status, "unknown");
  assert.equal(deliveryReach({ ...shop, delivery: { offers: true, radiusKm: 5 } }, { lat: "x", lng: 1 }).status, "unknown");
  assert.equal(deliveryReach({ delivery: { offers: true, radiusKm: 5 } }, north(1)).status, "unknown");
  assert.equal(deliveryReach({ ...shop, delivery: { offers: true, radiusKm: 5 } }, { lat: null, lng: null }).status, "unknown");
});
test("checkDeliverySetting accepts a good setting and names each bad field", () => {
  assert.deepEqual(checkDeliverySetting({ offers: true, fee: "150", radiusKm: 5, area: "  Westlands ", minOrder: "", notes: null }).value,
    { offers: true, fee: 150, radiusKm: 5, area: "Westlands", minOrder: null, notes: null });
  assert.deepEqual(checkDeliverySetting({ offers: false }).value, { offers: false, fee: null, radiusKm: null, area: null, minOrder: null, notes: null });
  const bad = checkDeliverySetting({ offers: "yes", fee: -5, radiusKm: 0, minOrder: "x", area: "a".repeat(121), notes: "n".repeat(301) });
  assert.deepEqual(bad.errors, { offers: "invalid_offers", fee: "invalid_fee", radiusKm: "invalid_radius", minOrder: "invalid_min_order", area: "invalid_area", notes: "invalid_notes" });
});
