import { describe, expect, it } from "vitest";
import { clampOffset, cropRect } from "./media.js";

const frame = { frameW: 300, frameH: 300 };

describe("crop maths", () => {
  it("covers the frame at zoom 1 and centres a wide photo", () => {
    const r = cropRect({ imgW: 900, imgH: 600, ...frame, zoom: 1, offset: { x: 0, y: 0 } });
    expect(r.sh).toBeCloseTo(600);
    expect(r.sw).toBeCloseTo(600);
    expect(r.sx).toBeCloseTo(150);
    expect(r.sy).toBeCloseTo(0);
  });

  it("zooming in shrinks the area that is kept", () => {
    const r = cropRect({ imgW: 900, imgH: 600, ...frame, zoom: 2, offset: { x: 0, y: 0 } });
    expect(r.sw).toBeCloseTo(300);
    expect(r.sh).toBeCloseTo(300);
  });

  it("never lets the photo slide off the frame", () => {
    const o = clampOffset({ imgW: 900, imgH: 600, ...frame, zoom: 1, offset: { x: 9999, y: -9999 } });
    expect(o.y).toBeCloseTo(0);
    expect(o.x).toBeCloseTo(75);
    const r = cropRect({ imgW: 900, imgH: 600, ...frame, zoom: 1, offset: o });
    expect(r.sx).toBeGreaterThanOrEqual(-0.001);
    expect(r.sx + r.sw).toBeLessThanOrEqual(900.001);
  });
});
