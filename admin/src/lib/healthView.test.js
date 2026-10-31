import { test } from "node:test";
import assert from "node:assert/strict";
import { BANDS, describeHealth, historyStrip, readHealth, toneOfScore, trendInfo, weakestPart } from "./healthView.js";

const health = {
  score: 41, band: "watch", label: "Watch", capped: false, weakest: "activity", grace: false,
  bands: { healthy: 70, watch: 40 }, subs: { profile: 88, freshness: 50, activity: 0, trust: 100 },
};

test("readHealth uses the breakdown the server sent", () => assert.equal(readHealth({ health }), health));

test("readHealth still draws a row that has only a number", () => {
  assert.partialDeepStrictEqual(readHealth({ healthScore: 82 }), { score: 82, band: "healthy", subs: null });
  assert.equal(readHealth({ healthScore: 55 }).band, "watch");
  assert.equal(readHealth({ healthScore: 12 }).band, "at_risk");
});

test("a deleted business has no score", () => assert.partialDeepStrictEqual(readHealth({ healthScore: null }), { score: null, band: "none" }));

test("toneOfScore follows the thresholds it is given", () => {
  assert.equal(toneOfScore(70), "success");
  assert.equal(toneOfScore(69), "warning");
  assert.equal(toneOfScore(39), "danger");
  assert.equal(toneOfScore(80, { healthy: 90, watch: 60 }), "warning");
  assert.equal(toneOfScore(null), "neutral");
});

test("trendInfo has nothing to say until there is a week of history", () => assert.equal(trendInfo(null).dir, "none"));

test("a change of less than 2 points is steady", () => {
  assert.equal(trendInfo(1).dir, "flat");
  assert.equal(trendInfo(-1).dir, "flat");
  assert.equal(trendInfo(0).text, "Steady");
});

test("trendInfo names the direction and the size", () => {
  assert.partialDeepStrictEqual(trendInfo(6), { dir: "up", text: "+6", label: "Up 6 points on a week ago" });
  assert.partialDeepStrictEqual(trendInfo(-4), { dir: "down", text: "−4", label: "Down 4 points on a week ago" });
  assert.equal(trendInfo(2).label, "Up 2 points on a week ago");
});

test("weakestPart finds the part that costs the most, or null", () => {
  assert.partialDeepStrictEqual(weakestPart(health), { id: "activity", label: "Activity", value: 0 });
  assert.equal(weakestPart({ ...health, weakest: null }), null);
  assert.equal(weakestPart({ ...health, subs: null }), null);
});

test("describeHealth reads as one sentence", () => {
  assert.equal(describeHealth(health, -7), "Health 41 out of 100, Watch, weakest part activity at 0, down 7 points on a week ago");
  assert.ok(describeHealth({ ...health, capped: true }, null).includes("capped"));
  assert.equal(describeHealth({ score: null }, null), "No health score");
});

test("historyStrip is 30 days ending today, with gaps where there is no snapshot", () => {
  const strip = historyStrip([{ day: "2026-10-31", score: 90, band: "healthy" }, { day: "2026-10-29", score: 35, band: "at_risk" }], 30, new Date("2026-10-31T10:00:00Z"));
  assert.equal(strip.length, 30);
  assert.partialDeepStrictEqual(strip[29], { day: "2026-10-31", score: 90 });
  assert.partialDeepStrictEqual(strip[28], { day: "2026-10-30", score: null, band: null });
  assert.partialDeepStrictEqual(strip[27], { day: "2026-10-29", band: "at_risk" });
  assert.equal(strip[0].day, "2026-10-02");
});

test("every band has a label", () => {
  for (const key of ["healthy", "watch", "at_risk", "none"]) assert.ok(BANDS[key].label);
});
