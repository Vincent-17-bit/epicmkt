import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ShopMap from "./ShopMap.jsx";

describe("ShopMap (C17)", () => {
  it("draws the map for the shop's position, labelled for screen readers", () => {
    render(<ShopMap name="Nakuru Electronics Centre" lat={-0.2833} lng={36.0667} />);
    const frame = screen.getByTitle("Map showing Nakuru Electronics Centre");
    expect(frame.getAttribute("src")).toMatch(/openstreetmap\.org/);
    expect(frame.getAttribute("src")).toContain("-0.28");
  });

  it("a still map in the Sold from card cannot take focus or clicks, and is hidden from screen readers", () => {
    const { container } = render(<ShopMap name="Shop" lat={-1.28} lng={36.82} interactive={false} />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    const frame = container.querySelector("iframe");
    expect(frame).toHaveAttribute("tabindex", "-1");
    expect(frame.hasAttribute("inert")).toBe(true);
  });
});
