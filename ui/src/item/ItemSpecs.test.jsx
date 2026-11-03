import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ItemSpecs from "./ItemSpecs.jsx";

const grouped = [
  { group: "Measurements", label: "Width", value: "10 cm" },
  { group: "Features & Specs", label: "Power", value: "2200 W" },
  { group: "User guide", label: "Care", value: "Wipe clean" },
  { group: "Features & Specs", label: "Colour", value: "Steel" }
];

describe("ItemSpecs", () => {
  it("renders one panel per group in the fixed order, the first open, empty groups hidden", () => {
    render(<ItemSpecs item={{ specs: grouped, description: "Full text", includes: [], terms: "No refunds" }} />);
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Features & Specs", "Measurements", "User guide", "Terms and notes"]);
    expect(screen.getByRole("button", { name: "Features & Specs" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Measurements" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Terms and notes" })).toHaveAttribute("aria-expanded", "false");
    // The full description is its own section on the page now, not a panel here.
    expect(screen.queryByRole("button", { name: "Description" })).not.toBeInTheDocument();
    expect(screen.queryByText("Full text")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Item details" })).not.toBeInTheDocument();
  });

  it("puts ungrouped specs under Features & Specs and meta rows under Item details", () => {
    render(<ItemSpecs item={{ specs: [{ label: "Colour", value: "Red" }], packSize: "2 kg", description: "", includes: [], terms: "" }} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Features & Specs", "Item details"]);
    expect(screen.getAllByRole("term", { hidden: true }).map((t) => t.textContent)).toEqual(["Colour", "Pack size"]);
  });

  it("never truncates long values and keeps dl, dt and dd", () => {
    const value = "x".repeat(300);
    const { container } = render(<ItemSpecs item={{ specs: [{ group: "Features & Specs", label: "Long", value }], description: "", includes: [], terms: "" }} />);
    expect(container.querySelector("dl dt")).toHaveTextContent("Long");
    expect(container.querySelector("dl dd")).toHaveTextContent(value);
  });

  it("toggles panels independently and shows optional ones only when present", async () => {
    render(<ItemSpecs item={{ specs: [{ label: "A", value: "1" }], description: "Full text", includes: ["Towel"], terms: "No refunds" }} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "What's included" }));
    expect(screen.getByText("Towel")).toBeVisible();
    expect(screen.getByRole("button", { name: "Features & Specs" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "What's included" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terms and notes" })).toBeInTheDocument();
  });

  it("hides empty panels and the whole section when nothing exists", () => {
    const { container, rerender } = render(<ItemSpecs item={{ specs: [], description: "Only text", includes: [], terms: "Only notes" }} />);
    expect(screen.queryByRole("button", { name: "Features & Specs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What's included" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terms and notes" })).toBeInTheDocument();
    rerender(<ItemSpecs item={{ specs: [], description: "", includes: [], terms: "" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  describe("bringing an opened panel into view", () => {
    const original = Element.prototype.scrollIntoView;
    afterEach(() => {
      Element.prototype.scrollIntoView = original;
      delete window.matchMedia;
    });
    const item = { specs: [{ label: "A", value: "1" }], description: "Full text", includes: ["Towel"], terms: "No refunds" };

    it("scrolls a panel into view when it is opened, and not on first render or when closing", async () => {
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      render(<ItemSpecs item={item} />);
      expect(scroll).not.toHaveBeenCalled();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "What's included" }));
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll.mock.instances[0]).toContainElement(screen.getByRole("button", { name: "What's included" }));
      expect(scroll.mock.instances[0]).not.toContainElement(screen.getByRole("button", { name: "Features & Specs" }));
      expect(scroll.mock.calls[0][0]).toMatchObject({ inline: "nearest", behavior: "smooth" });
      await user.click(screen.getByRole("button", { name: "What's included" }));
      expect(scroll).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole("button", { name: "Terms and notes" }));
      expect(scroll).toHaveBeenCalledTimes(2);
    });

    it("opens and scrolls to the first spec panel when reveal changes, not on mount", () => {
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      const onExpand = vi.fn();
      const { rerender } = render(<ItemSpecs item={{ ...item, specs: grouped }} reveal={3} onExpand={onExpand} />);
      expect(scroll).not.toHaveBeenCalled();
      rerender(<ItemSpecs item={{ ...item, specs: grouped }} reveal={4} onExpand={onExpand} />);
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll.mock.calls[0][0]).toMatchObject({ block: "start" });
      expect(screen.getByRole("button", { name: "Features & Specs" })).toHaveAttribute("aria-expanded", "true");
    });

    it("does not animate for people who asked for reduced motion", async () => {
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      window.matchMedia = () => ({ matches: true });
      render(<ItemSpecs item={item} />);
      await userEvent.setup().click(screen.getByRole("button", { name: "What's included" }));
      expect(scroll.mock.calls[0][0].behavior).toBe("auto");
    });

    it("still opens the panel where scrolling into view is not supported", async () => {
      Element.prototype.scrollIntoView = undefined;
      render(<ItemSpecs item={item} />);
      await userEvent.setup().click(screen.getByRole("button", { name: "What's included" }));
      expect(screen.getByText("Towel")).toBeVisible();
    });
  });
});
