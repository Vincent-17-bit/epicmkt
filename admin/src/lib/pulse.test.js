import test from "node:test";
import assert from "node:assert/strict";
import { BANDS, RADAR, bandCounts, bandFor, buildPulse, daysLeft, describeDays, displayLayer, expiringItems, layersFor, layoutRadar, radiusFor } from "./pulse.js";

const NOW = new Date("2026-10-15T09:00:00+03:00");
const at = (days, hour = 12) => new Date(Date.parse("2026-10-15T00:00:00+03:00") + days * 86_400_000 + hour * 3_600_000).toISOString();

test("days left count Nairobi calendar days, not 24-hour blocks", () => {
  assert.equal(daysLeft(at(0, 23), NOW), 0);
  assert.equal(daysLeft(at(1, 0), NOW), 1);
  assert.equal(daysLeft(at(-1, 6), NOW), -1);
  assert.equal(daysLeft(null, NOW), null);
  assert.equal(daysLeft("nonsense", NOW), null);
});

test("bands follow the 1, 3, 7, 14 and 30 day rings, with grace first", () => {
  const keys = [-1, 0, 1, 2, 3, 4, 7, 8, 14, 15, 30].map((d) => bandFor(d).key);
  assert.deepEqual(keys, ["grace", "d1", "d1", "d3", "d3", "d7", "d7", "d14", "d14", "d30", "d30"]);
  assert.equal(bandFor(31), null);
  assert.equal(bandFor(-2), null);
  assert.equal(bandFor(null), null);
});

test("every band has its own shape, so colour never carries the meaning alone", () => {
  assert.equal(new Set(BANDS.map((b) => b.shape)).size, BANDS.length);
});

test("radius grows with days left and lands on the ring knots", () => {
  const radii = [-1, 0, 1, 3, 7, 14, 30].map(radiusFor);
  assert.deepEqual([...radii].sort((a, b) => a - b), radii);
  assert.equal(radiusFor(100), radiusFor(30));
  assert.ok(radiusFor(2) > radiusFor(1) && radiusFor(2) < radiusFor(3));
});

test("layers: flags overlay, grace, expiring and live are told apart", () => {
  assert.deepEqual(layersFor({ kind: "business", paid_until: at(-1, 6) }, NOW), ["grace"]);
  assert.deepEqual(layersFor({ kind: "business", paid_until: at(3) }, NOW), ["expiring", "live"]);
  assert.deepEqual(layersFor({ kind: "business", paid_until: at(40), flagged: true }, NOW), ["flagged", "live"]);
  assert.deepEqual(layersFor({ kind: "business", paid_until: at(-5) }, NOW), []);
  assert.deepEqual(layersFor({ kind: "application" }, NOW), ["applications"]);
});

test("a marker shows its most urgent enabled layer", () => {
  const item = { layers: ["flagged", "expiring", "live"] };
  assert.equal(displayLayer(item, new Set(["flagged", "live"])).key, "flagged");
  assert.equal(displayLayer(item, new Set(["live"])).key, "live");
  assert.equal(displayLayer(item, new Set(["applications"])), null);
});

test("buildPulse drops rows without coordinates and long-expired businesses", () => {
  const items = buildPulse({
    businesses: [
      { id: "a", name: "A", lat: -1, lng: 36, paid_until: at(2) },
      { id: "b", name: "B", lat: null, lng: 36, paid_until: at(2) },
      { id: "c", name: "C", lat: -1, lng: 36, paid_until: at(-9) },
    ],
    applications: [{ id: "x", business_name: "X", lat: 0, lng: 37, status: "submitted" }],
    flaggedIds: ["a"],
  }, NOW);
  assert.deepEqual(items.map((i) => i.id), ["a", "x"]);
  assert.deepEqual(items[0].layers, ["flagged", "expiring", "live"]);
});

test("radar layout keeps every point inside the circle and clear of its neighbours", () => {
  const items = Array.from({ length: 45 }, (_, i) => ({ id: `biz-${i}`, kind: "business", name: `B${i}`, days: [-1, 0, 1, 2, 3, 5, 7, 10, 14, 21, 30][i % 11], paid_until: at(1) }));
  const points = layoutRadar(expiringItems(items));
  const min = RADAR.pointRadius * 2;
  for (const p of points) assert.ok(Math.hypot(p.x - RADAR.centre, p.y - RADAR.centre) <= 176.5);
  for (let i = 0; i < points.length; i += 1) for (let j = i + 1; j < points.length; j += 1) assert.ok(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) >= min, `${points[i].id} overlaps ${points[j].id}`);
});

test("radar layout is the same on every run", () => {
  const items = expiringItems([{ id: "p", kind: "business", name: "P", days: 3 }, { id: "q", kind: "business", name: "Q", days: 3 }]);
  assert.deepEqual(layoutRadar(items), layoutRadar(items));
});

test("counts and sentences", () => {
  const items = expiringItems([{ id: "1", kind: "business", name: "A", days: -1 }, { id: "2", kind: "business", name: "B", days: 0 }, { id: "3", kind: "business", name: "C", days: 40 }]);
  assert.equal(bandCounts(items).grace, 1);
  assert.equal(bandCounts(items).d1, 1);
  assert.equal(items.length, 2);
  assert.equal(describeDays(0), "Expires today");
  assert.equal(describeDays(1), "Expires tomorrow");
  assert.equal(describeDays(5), "Expires in 5 days");
  assert.match(describeDays(-1), /grace/i);
});
