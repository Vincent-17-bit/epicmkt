import test from "node:test";
import assert from "node:assert/strict";
import { earliestInput, fromNairobiInput, quickPicks, scheduleProblem, toNairobiInput } from "./schedule.js";

// 2026-11-17 00:02 in Nairobi is 2026-11-16 21:02 UTC.
const now = new Date("2026-11-16T21:02:00Z");

test("Nairobi input values round-trip and reject nonsense", () => {
  assert.equal(toNairobiInput(now), "2026-11-17T00:02");
  assert.equal(fromNairobiInput("2026-11-17T08:00").toISOString(), "2026-11-17T05:00:00.000Z");
  assert.equal(fromNairobiInput("2026-02-31T08:00"), null);
  assert.equal(fromNairobiInput("tomorrow"), null);
});

test("empty means send now; past, near and far times are explained", () => {
  assert.equal(scheduleProblem("", now), "");
  assert.match(scheduleProblem("2026-11-16T10:00", now), /future/);
  assert.equal(scheduleProblem("2026-11-17T09:00", now), "");
  assert.match(scheduleProblem("2027-12-01T09:00", now), /six months/);
  assert.match(scheduleProblem("garbage", now), /not valid/);
  assert.equal(scheduleProblem(earliestInput(now), now), "");
});

test("quick picks are all in the future and sit at 08:00 after the hour", () => {
  const picks = quickPicks(now); // a Tuesday morning in Nairobi
  assert.deepEqual(picks.map((p) => p.id), ["hour", "tomorrow", "monday"]);
  assert.equal(picks[0].value, "2026-11-17T01:05");
  assert.equal(picks[1].value, "2026-11-18T08:00");
  assert.equal(picks[2].value, "2026-11-23T08:00");
  for (const p of picks) assert.equal(scheduleProblem(p.value, now), "");
});

test("on a Sunday, Monday is tomorrow so it is not offered twice", () => {
  const sunday = new Date("2026-11-22T09:00:00Z");
  assert.deepEqual(quickPicks(sunday).map((p) => p.id), ["hour", "tomorrow"]);
});
