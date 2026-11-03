import { describe, expect, it } from "vitest";
import { bucketLabel, fullLabel, indexAt, labelIndexes, niceMax, peakIndex } from "./trendAxes.js";

describe("trend chart axes", () => {
  it("rounds the top of the scale to a tidy number with evenly spaced ticks", () => {
    expect(niceMax(4)).toEqual({ top: 4, ticks: [0, 1, 2, 3, 4] });
    expect(niceMax(29)).toEqual({ top: 30, ticks: [0, 10, 20, 30] });
    expect(niceMax(132)).toEqual({ top: 150, ticks: [0, 50, 100, 150] });
    expect(niceMax(0)).toEqual({ top: 1, ticks: [0, 1] });
  });

  it("labels days, weeks and months", () => {
    expect(bucketLabel("2026-10-28", "day")).toBe("28 Oct");
    expect(bucketLabel("2026-10-28", "week", true)).toBe("28 Oct 26");
    expect(bucketLabel("2026-10-01", "month")).toBe("Oct 2026");
  });

  it("picks a handful of evenly spread labels and always includes both ends", () => {
    expect(labelIndexes(3)).toEqual([0, 1, 2]);
    expect(labelIndexes(31)).toEqual([0, 8, 15, 23, 30]);
    expect(labelIndexes(1)).toEqual([0]);
  });

  it("writes a full date for the tooltip", () => {
    expect(fullLabel("2026-10-28", "day")).toBe("28 Oct 2026");
    expect(fullLabel("2026-10-26", "week")).toBe("Week of 26 Oct 2026");
    expect(fullLabel("2026-10-01", "month")).toBe("Oct 2026");
  });

  it("maps a pointer position to the nearest point and finds the peak", () => {
    expect(indexAt(0, 31)).toBe(0);
    expect(indexAt(0.5, 31)).toBe(15);
    expect(indexAt(2, 31)).toBe(30);
    expect(indexAt(0.4, 1)).toBe(0);
    expect(peakIndex([1, 9, 3, 9])).toBe(1);
  });
});
