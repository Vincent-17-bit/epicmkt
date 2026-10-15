import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEatStamp, formatEatTime } from "./eat.js";

test("formats in Nairobi time whatever the machine zone is", () => {
  assert.equal(formatEatTime(new Date("2026-10-15T09:05:00Z")), "12:05");
  assert.equal(formatEatTime(new Date("2026-10-15T21:30:00Z")), "00:30");
  assert.equal(formatEatStamp(new Date("2026-10-15T09:05:00Z")), "15 Oct 12:05 EAT");
});

import { relativeAgo } from "./eat.js";

test("relativeAgo", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const ago = (ms) => relativeAgo(new Date(now - ms), now);
  assert.equal(ago(30_000), "Active now");
  assert.equal(ago(5 * 60_000), "5 min ago");
  assert.equal(ago(3 * 3600_000), "3 h ago");
  assert.equal(ago(24 * 3600_000), "1 day ago");
  assert.equal(ago(50 * 3600_000), "2 days ago");
  assert.equal(relativeAgo(new Date(now.getTime() + 60_000), now), "Active now");
});
