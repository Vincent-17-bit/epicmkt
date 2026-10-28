import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProductGallery from "./ProductGallery.jsx";

const images = [1, 2, 3, 4].map((n) => ({ id: `i${n}`, url: `https://x.test/${n}.jpg`, caption: `Photo ${n}` }));

describe("ProductGallery", () => {
  it("jumps straight to the tapped thumbnail instead of scrolling past every picture in between", () => {
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo;
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
    render(<ProductGallery images={images} name="Shoe" />);
    fireEvent.click(screen.getByRole("button", { name: "Photo 4" }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ left: 1200, behavior: "instant" });
    expect(screen.getByRole("button", { name: "Photo 4" })).toHaveAttribute("aria-current", "true");
  });
});
