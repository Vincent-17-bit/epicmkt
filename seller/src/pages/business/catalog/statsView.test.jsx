import { describe, expect, it } from "vitest";
import { barHeights, deltaText } from "./statsView.js";

describe("stats view", () => {
  it("says how a count changed", () => {
    expect(deltaText(12, 10)).toBe("+20%");
    expect(deltaText(5, 10)).toBe("-50%");
    expect(deltaText(4, 4)).toBe("same as before");
    expect(deltaText(3, 0)).toBe("new");
  });

  it("scales bars to the busiest day and keeps a visible stub for quiet days", () => {
    expect(barHeights([{ views: 10 }, { views: 5 }, { views: 0 }], "views")).toEqual([100, 50, 4]);
    expect(barHeights([{ views: 0 }, { views: 0 }], "views")).toEqual([0, 0]);
  });
});
