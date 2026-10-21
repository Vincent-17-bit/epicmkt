import test from "node:test";
import assert from "node:assert/strict";
import { actionLabel, barGeometry, diffRows, funnelRows, kes, nairobiDay, percent } from "./audit.js";

test("known actions read as sentences; unknown ones are made readable", () => {
  assert.equal(actionLabel("item.hide"), "Hid an item");
  assert.equal(actionLabel("payment.confirm"), "Confirmed a payment");
  assert.equal(actionLabel("seller.password_reset"), "Seller: password reset");
  assert.equal(actionLabel("export"), "Export");
  assert.equal(actionLabel(""), "Unknown action");
  assert.equal(actionLabel(null), "Unknown action");
});

test("diffs list only what changed, including creates and deletes", () => {
  assert.deepEqual(diffRows({ price: 500, badge: null, same: 1 }, { price: 600, badge: "Popular", same: 1 }), [
    { field: "badge", from: "–", to: "Popular" }, { field: "price", from: "500", to: "600" },
  ]);
  assert.deepEqual(diffRows(null, { active: false }), [{ field: "active", from: "–", to: "false" }]);
  assert.deepEqual(diffRows({ active: true }, null), [{ field: "active", from: "true", to: "–" }]);
  assert.deepEqual(diffRows({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(diffRows({ list: [1, 2] }, { list: [1, 3] }), [{ field: "list", from: "[1,2]", to: "[1,3]" }]);
  assert.deepEqual(diffRows("junk", undefined), []);
});

test("bars scale to the tallest day, keep small values visible, and handle empty or all-zero data", () => {
  const { bars, max } = barGeometry([0, 50, 100], { width: 300, height: 100, gap: 0 });
  assert.equal(max, 100);
  assert.deepEqual(bars.map((b) => b.height), [0, 50, 100]);
  assert.equal(bars[2].y, 0);
  assert.equal(barGeometry([1, 1000], { height: 100 }).bars[0].height, 2, "a tiny day still shows");
  assert.deepEqual(barGeometry([]).bars, []);
  assert.ok(barGeometry([0, 0]).bars.every((b) => b.height === 0));
  const widths = barGeometry([1, 2, 3, 4], { width: 100, gap: 4 }).bars;
  assert.ok(Math.abs(widths[3].x + widths[3].width - 100) < 1e-9, "the bars fill the width exactly");
});

test("percentages and the funnel", () => {
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(1, 0), null);
  const rows = funnelRows({ submitted: 40, approved: 30, activated: 24, rejected: 6 });
  assert.deepEqual(rows.map((r) => [r.label, r.value, r.ofFirst, r.ofPrevious]), [
    ["Submitted", 40, 100, null], ["Approved", 30, 75, 75], ["Activated", 24, 60, 80], ["Rejected", 6, 15, null],
  ]);
  assert.equal(funnelRows({})[0].ofFirst, null, "no applications: no percentages");
});

test("money and dates", () => {
  assert.equal(kes(12500), "KES 12,500");
  assert.equal(kes(null), "KES 0");
  assert.match(nairobiDay(new Date("2026-10-21T22:30:00Z")), /^2026-10-22$/, "22:30 UTC is already tomorrow in Nairobi");
});
