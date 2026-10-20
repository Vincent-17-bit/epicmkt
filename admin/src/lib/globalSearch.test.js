import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_QUERY, flatResults, matchesText, moveActive, toResultGroups } from "./globalSearch.js";

const RAW = {
  businesses: [{ id: "b1", name: "Lakeside Provisions", seller_id: "ES100210", town: "Kisumu", status: "live" }],
  items: [{ id: "i1", name: "Dairy meal 70kg", price: 3200, business_id: "b1", business_name: "Lakeside Provisions" }],
  applications: [{ id: "a1", reference_no: "EPM-2026-ABC234", business_name: "Upendo Shop", owner_full_name: "Mary W", status: "under_review" }],
  payments: [{ id: "p1", mpesa_code: "SGH4K9L2QW", amount_kes: 1500, status: "submitted", business_name: "Lakeside Provisions" }],
  faqs: [],
};

test("groups come out in a fixed order and empty groups are dropped", () => {
  const groups = toResultGroups(RAW);
  assert.deepEqual(groups.map((g) => g.key), ["applications", "businesses", "payments", "items"]);
});

test("each result says where it opens", () => {
  const byKey = Object.fromEntries(toResultGroups(RAW).map((g) => [g.key, g.items[0]]));
  assert.equal(byKey.applications.to, "/admin/applications/a1");
  assert.equal(byKey.businesses.to, "/admin/businesses/b1");
  assert.equal(byKey.payments.to, "/admin/payments?q=SGH4K9L2QW");
  assert.equal(byKey.items.to, "/admin/businesses/b1?tab=items");
  assert.equal(byKey.applications.subtitle, "EPM-2026-ABC234 · Mary W · under review");
  assert.equal(byKey.payments.title, "SGH4K9L2QW · KES 1,500");
});

test("positions run across groups for keyboard use", () => {
  assert.deepEqual(flatResults(toResultGroups(RAW)).map((r) => r.position), [0, 1, 2, 3]);
});

test("garbage input gives no groups", () => {
  assert.deepEqual(toResultGroups(null), []);
  assert.deepEqual(toResultGroups({ businesses: "x" }), []);
  assert.equal(MIN_QUERY, 2);
});

test("arrow keys wrap around", () => {
  assert.equal(moveActive(-1, 4, 1), 0);
  assert.equal(moveActive(-1, 4, -1), 3);
  assert.equal(moveActive(3, 4, 1), 0);
  assert.equal(moveActive(0, 4, -1), 3);
  assert.equal(moveActive(0, 0, 1), -1);
});

test("matchesText is case-insensitive and empty means everything", () => {
  assert.equal(matchesText(["SGH4K9L2QW", null], "sgh4k"), true);
  assert.equal(matchesText(["Mara"], "zzz"), false);
  assert.equal(matchesText(["Mara"], "  "), true);
});
