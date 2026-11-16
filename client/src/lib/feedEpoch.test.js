import { beforeEach, describe, expect, it } from "vitest";
import { FEED_VARIANTS, EPOCH_MS } from "./feed.js";
import { feedEpoch, feedVisit, resetFeedEpoch } from "./feedEpoch.js";

const NOW = 493_000 * EPOCH_MS + 5_000;
beforeEach(() => resetFeedEpoch());

describe("the visit's rotation hour and variant", () => {
  it("pins both for the whole visit, even after the clock moves into the next hour", () => {
    const first = feedVisit(NOW);
    expect(first.epoch).toBe(493_000);
    expect(first.variant).toBeGreaterThanOrEqual(0);
    expect(first.variant).toBeLessThan(FEED_VARIANTS);
    expect(feedVisit(NOW + 1.5 * EPOCH_MS)).toEqual(first);
    expect(feedEpoch(NOW + 2 * EPOCH_MS)).toBe(493_000);
  });

  it("starts a fresh visit after a few hours", () => {
    feedVisit(NOW);
    expect(feedVisit(NOW + 4 * EPOCH_MS).epoch).toBe(493_004);
  });
});
