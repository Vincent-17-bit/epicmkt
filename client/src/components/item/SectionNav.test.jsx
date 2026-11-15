import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import SectionNav from "./SectionNav.jsx";

// jsdom lays nothing out: give the item's sections a height so the bar sees them.
const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return this.id?.startsWith("item-") && !this.dataset.empty ? 200 : 0; } });
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => { if (real) Object.defineProperty(HTMLElement.prototype, "offsetHeight", real); });

const Page = () => (
  <>
    <SectionNav itemId="x" />
    <div id="item-overview">photos</div>
    <div id="item-details">details</div>
    <div id="item-specs" data-empty="1" />
    <div id="item-store">shop</div>
    <div id="item-similar">similar</div>
  </>
);
const flush = () => act(() => new Promise((r) => setTimeout(r, 30)));
const scrollTo = async (y) => {
  window.scrollY = y;
  fireEvent.scroll(window);
  await flush();
};

describe("section bar (C10)", () => {
  it("offers the sections that are on the page and not empty, in page order", async () => {
    render(<Page />);
    await flush();
    const links = screen.getAllByRole("link", { hidden: true }).map((a) => a.textContent);
    expect(links).toEqual(["Overview", "Details", "From the store", "Similar products"]);
  });

  it("slides in when scrolling down past the top, and hides at once when scrolling up", async () => {
    render(<Page />);
    await flush();
    const bar = document.querySelector('nav[aria-label="Sections of this item"]');
    expect(bar).toHaveAttribute("aria-hidden", "true");
    await scrollTo(100);
    await scrollTo(900);
    expect(bar).not.toHaveAttribute("aria-hidden");
    expect(bar).toHaveAttribute("data-visible");
    await scrollTo(700);
    expect(bar).toHaveAttribute("aria-hidden", "true");
  });

  it("a link takes the buyer into that section and marks it current", async () => {
    render(<Page />);
    await flush();
    await scrollTo(100);
    await scrollTo(900);
    fireEvent.click(screen.getByRole("link", { name: "From the store" }));
    const store = document.getElementById("item-store");
    expect(store.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(store);
    expect(screen.getByRole("link", { name: "From the store" })).toHaveAttribute("aria-current", "true");
  });
});
