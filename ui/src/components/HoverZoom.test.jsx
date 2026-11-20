import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import ProductMedia from "./ProductMedia.jsx";
import { HOVER_ZOOM_DEFAULTS, zoomPlan } from "./HoverZoom.jsx";

const images = [{ id: "a", kind: "image", url: "https://x.test/a.jpg" }];

describe("hover zoom", () => {
  it("adds a lens to the photo box and nothing to the page until hovered", () => {
    const { container } = render(<ProductMedia images={images} name="Speaker" />);
    expect(container.querySelectorAll('span[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(document.body.querySelectorAll('div[aria-hidden="true"][style*="background-image"]')).toHaveLength(0);
  });

  it("can be switched off", () => {
    const { container } = render(<ProductMedia images={images} name="Speaker" zoom={false} />);
    expect(container.querySelector('span[hidden]')).toBeNull();
  });

  it("has sizes and colours that can be changed", () => {
    expect(Object.keys(HOVER_ZOOM_DEFAULTS)).toEqual(expect.arrayContaining(["scale", "width", "height", "lensColor", "borderColor"]));
  });
});

describe("zoom plan for small photos", () => {
  const area = { width: 600, height: 600 };
  const room = { roomWidth: 540, roomHeight: 600, scale: 2 };

  it("keeps the set scale for a big photo", () => {
    expect(zoomPlan({ ...room, area, real: 3000, dpr: 1 })).toMatchObject({ scale: 2, width: 540, height: 600 });
  });

  it("lowers the scale and shrinks the pane for a small photo", () => {
    const plan = zoomPlan({ ...room, area: { width: 400, height: 400 }, real: 500, dpr: 1 });
    expect(plan.scale).toBeCloseTo(1.25);
    expect(plan.width).toBeCloseTo(500);
    expect(plan.height).toBeCloseTo(500);
  });

  it("turns zoom off for a photo that is already shown at full size", () => {
    expect(zoomPlan({ ...room, area, real: 620, dpr: 1 })).toBeNull();
  });

  it("counts high-density screens", () => {
    expect(zoomPlan({ ...room, area, real: 1300, dpr: 2 })).toBeNull();
  });

  it("zooms freely while the size is not known yet", () => {
    expect(zoomPlan({ ...room, area, real: null }).scale).toBe(2);
  });
});
