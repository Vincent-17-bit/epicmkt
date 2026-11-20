import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import ProductMedia from "./ProductMedia.jsx";
import { HOVER_ZOOM_DEFAULTS } from "./HoverZoom.jsx";

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
