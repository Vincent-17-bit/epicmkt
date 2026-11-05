import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemView, itemT } from "@epicmkt/ui";

import Details, { Specs } from "./Details.jsx";
import Gallery from "./Gallery.jsx";
import Header from "./Header.jsx";
import Options from "./Options.jsx";

// The four slots ItemView draws for the client (gallery, header, options, details; specs is the other half of details). Each takes
// `slot`, the props ItemView hands the part, and renders null when it has nothing to show.
const variant = (id, label, price) => ({ id, label, regularPrice: price, salePrice: price, savings: 0, discountPercent: 0 });
const pricing = (variants = []) => ({ regularPrice: 500, salePrice: 500, savings: 0, discountPercent: 0, unit: null, variants });
const item = (extra = {}) => ({
  id: "i1", name: "Fade cut", brand: "Acme", shortDescription: "Clean and quick", description: "A longer story about the cut.", section: null, packSize: null,
  availability: "available", highlights: [{ title: "", text: "Done in 30 minutes" }], specs: [{ label: "Duration", value: "45 minutes" }],
  images: [], videos: [], offers: [], flash: null, pricing: pricing(), ...extra
});
const slotOf = (it, extra = {}) => ({ item: it, shown: it.pricing, t: itemT, Heading: "h1", headingRef: undefined, headingId: "item-title", activeId: null, onVariant: vi.fn(), money: (n) => `KES ${n}`, ...extra });
const ctx = {};

describe("view slots", () => {
  describe("Gallery", () => {
    it("renders nothing without an item", () => {
      expect(render(<Gallery ctx={ctx} slot={{}} />).container).toBeEmptyDOMElement();
      expect(render(<Gallery ctx={ctx} />).container).toBeEmptyDOMElement();
    });
    it("draws the item's media", () => {
      const it = item({ images: [{ id: "a", url: "https://example.test/a.png", caption: "Front" }] });
      const { container } = render(<Gallery ctx={ctx} slot={slotOf(it)} />);
      expect(container.querySelector("img")).not.toBeNull();
    });
  });

  describe("Header", () => {
    it("renders nothing without an item", () => {
      expect(render(<Header ctx={ctx} slot={{}} />).container).toBeEmptyDOMElement();
    });
    it("shows brand, title, short description and price, and the title is the page heading", () => {
      render(<Header ctx={ctx} slot={slotOf(item())} />);
      expect(screen.getByText("Acme")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "Fade cut" })).toHaveAttribute("id", "item-title");
      expect(screen.getByText("Clean and quick")).toBeInTheDocument();
      expect(screen.getByText(/500/)).toBeInTheDocument();
    });
    it("shows the sale price with the old one struck through", () => {
      const it = item({ pricing: { ...pricing(), salePrice: 400, savings: 100, discountPercent: 20 } });
      render(<Header ctx={ctx} slot={slotOf(it, { shown: it.pricing })} />);
      expect(screen.getByText(/-20%/)).toBeInTheDocument();
      expect(document.querySelector("s")).toHaveTextContent("500");
    });
    it("leaves the price to the flash banner during a flash sale", () => {
      const it = item({ flash: { sale: { id: "s" } } });
      const { container } = render(<Header ctx={ctx} slot={slotOf(it)} />);
      expect(container.querySelector("p")?.textContent).not.toMatch(/KES|500/);
    });
  });

  describe("Options", () => {
    it("renders nothing without an item, or for an item with no variants", () => {
      expect(render(<Options ctx={ctx} slot={{}} />).container).toBeEmptyDOMElement();
      expect(render(<Options ctx={ctx} slot={slotOf(item())} />).container).toBeEmptyDOMElement();
    });
    it("lists the variants and reports the one picked", async () => {
      const it = item({ pricing: pricing([variant("a", "Small", 500), variant("b", "Large", 800)]) });
      const slot = slotOf(it, { activeId: "a" });
      render(<Options ctx={ctx} slot={slot} />);
      const group = screen.getByRole("radiogroup", { name: "Options" });
      expect(group.querySelectorAll("[role=radio]")).toHaveLength(2);
      expect(screen.getByRole("radio", { name: "Small" })).toHaveAttribute("aria-checked", "true");
      await userEvent.click(screen.getByRole("radio", { name: "Large" }));
      expect(slot.onVariant).toHaveBeenCalledWith("b");
    });
  });

  describe("Details and Specs", () => {
    it("render nothing without an item", () => {
      expect(render(<Details ctx={ctx} slot={{}} />).container).toBeEmptyDOMElement();
      expect(render(<Specs ctx={ctx} slot={{}} />).container).toBeEmptyDOMElement();
    });
    it("Details renders nothing when there are no highlights and no description", () => {
      const it = item({ highlights: [], description: "", shortDescription: "" });
      expect(render(<Details ctx={ctx} slot={slotOf(it)} />).container).toBeEmptyDOMElement();
    });
    it("Details shows the highlights and the description, and the link to the specs only when asked", async () => {
      const onMoreSpecs = vi.fn();
      const { rerender } = render(<Details ctx={ctx} slot={slotOf(item())} />);
      expect(screen.getByText("Done in 30 minutes")).toBeInTheDocument();
      expect(screen.getByText(/longer story/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /more product details/i })).toBeNull();
      rerender(<Details ctx={ctx} slot={slotOf(item(), { onMoreSpecs })} />);
      await userEvent.click(screen.getByRole("button", { name: /more product details/i }));
      expect(onMoreSpecs).toHaveBeenCalledTimes(1);
    });
    it("Specs shows the item's specs table", () => {
      render(<Specs ctx={ctx} slot={{ ...slotOf(item()), reveal: 0, onExpand: vi.fn() }} />);
      expect(screen.getByText("Duration")).toBeInTheDocument();
    });
  });

  describe("through ItemView", () => {
    it("a slot function gets the props the default would, so the specs link still opens the table", async () => {
      const seen = {};
      render(
        <ItemView
          item={item()}
          shown={item().pricing}
          options={(p) => { seen.options = p; return <div data-testid="mine" />; }}
          details={(p) => { seen.details = p; return <Details ctx={ctx} slot={p} />; }}
          specs={(p) => { seen.specs = p; return <Specs ctx={ctx} slot={p} />; }}
        />
      );
      expect(screen.getByTestId("mine")).toBeInTheDocument();
      expect(seen.options.item.id).toBe("i1");
      expect(seen.specs.reveal).toBe(0);
      await userEvent.click(screen.getByRole("button", { name: /more product details/i }));
      expect(seen.specs.reveal).toBe(1);
    });
  });
});
