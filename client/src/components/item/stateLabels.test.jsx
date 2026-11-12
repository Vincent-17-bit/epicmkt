import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { t as clientT } from "../../i18n/index.js";
import Header from "./Header.jsx";
import Details from "./Details.jsx";
import { stateLabels } from "../../lib/itemView.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const noViolations = async (node) => {
  const r = await axe(node);
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
};

const spec = (label, value) => ({ group: "Features & Specs", label, value });
const item = (specs, extra = {}) => ({
  id: "i1", name: "Pulse X1", productType: "phone", brand: "Pulse", shortDescription: "", description: "", highlights: [], includes: [], terms: "", specs,
  pricing: { regularPrice: 500, salePrice: 500, savings: 0, discountPercent: 0, unit: null, variants: [] }, flash: null, ...extra
});
const slotOf = (it) => ({ item: it, shown: it.pricing, t: clientT, Heading: "h1", headingId: "item-title" });
const head = (it, ctx = {}) => render(<Header ctx={ctx} slot={slotOf(it)} />);
const badges = () => within(screen.getByTestId("state-labels")).getAllByRole("listitem").map((n) => n.textContent);

describe("state labels in the header", () => {
  it("Condition shows as a text badge for each of new, refurbished and used", () => {
    for (const [value, shown] of [["new", "New"], ["Refurbished", "Refurbished"], ["USED", "Used"]]) {
      const { unmount } = head(item([spec("Condition", value)]));
      expect(badges()).toEqual([`Condition: ${shown}`]);
      unmount();
    }
  });

  it("Authenticity shows original and inspired, never anything else", () => {
    for (const [value, shown] of [["Original", "Original"], ["inspired", "Inspired"]]) {
      const { unmount } = head(item([spec("Authenticity", value)]));
      expect(badges()).toEqual([`Authenticity: ${shown}`]);
      unmount();
    }
    for (const value of ["Copy", "Fake", "Replica", ""]) {
      const { unmount, container } = head(item([spec("Authenticity", value)]));
      expect(screen.queryByTestId("state-labels")).toBeNull();
      expect(container.textContent).not.toMatch(/copy|fake|replica/i);
      unmount();
    }
  });

  it("Fragrance state shows sealed, tester and decant", () => {
    for (const [value, shown] of [["sealed", "Sealed"], ["Tester", "Tester"], ["DECANT", "Decant"]]) {
      const { unmount } = head(item([spec("Fragrance state", value)]));
      expect(badges()).toEqual([`Fragrance state: ${shown}`]);
      unmount();
    }
  });

  it("Charger kind shows original, compatible and refill", () => {
    for (const [value, shown] of [["original", "Original"], ["Compatible", "Compatible"], ["refill", "Refill"]]) {
      const { unmount } = head(item([spec("Charger kind", value)]));
      expect(badges()).toEqual([`Charger kind: ${shown}`]);
      unmount();
    }
  });

  it("several labels show together in a fixed order, matched by label ignoring case", () => {
    head(item([spec("authenticity", "Original"), spec("CONDITION", "Used"), spec("Display", "6 inch")]));
    expect(badges()).toEqual(["Condition: Used", "Authenticity: Original"]);
  });

  it("is words, not colour alone, and sits before the brand and title", () => {
    head(item([spec("Condition", "New")]));
    const list = screen.getByTestId("state-labels");
    expect(list).toHaveTextContent("Condition: New");
    expect(list.compareDocumentPosition(screen.getByRole("heading", { name: "Pulse X1" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("follows the selected combination", () => {
    const ctx = { option: { variant: { specOverrides: { Condition: "Refurbished" } } } };
    head(item([spec("Condition", "New")]), ctx);
    expect(badges()).toEqual(["Condition: Refurbished"]);
  });

  it("an item with none of these labels is drawn exactly as before", () => {
    const { container } = head(item([spec("Display", "6 inch")]));
    expect(screen.queryByTestId("state-labels")).toBeNull();
    expect(container.querySelector("ul")).toBeNull();
    expect(screen.getByRole("heading", { name: "Pulse X1" })).toBeInTheDocument();
    expect(render(<Header ctx={{}} slot={{}} />).container).toBeEmptyDOMElement();
  });

  it("has no axe violations", async () => {
    const { container } = head(item([spec("Condition", "Used"), spec("Authenticity", "Original")]));
    await noViolations(container);
  });
});

describe("state labels in the specification table", () => {
  it("the same labels are rows of the table", async () => {
    render(<Details ctx={{ business: {}, track: vi.fn() }} slot={{ item: item([spec("Condition", "Used"), spec("Authenticity", "Original")], { description: "A longer story about the phone." }), t: clientT }} />);
    await userEvent.click(screen.getByRole("tab", { name: "Specifications" }));
    const panel = screen.getByRole("tabpanel", { name: "Specifications" });
    expect(within(panel).getAllByRole("term").map((n) => n.textContent)).toEqual(["Condition", "Authenticity"]);
    expect(within(panel).getByText("Used")).toBeInTheDocument();
  });
});

describe("stateLabels", () => {
  it("returns canonical values and ignores unknown ones", () => {
    expect(stateLabels({ specs: [spec("Condition", "used"), spec("Authenticity", "Copy"), spec("Charger kind", "refill")] })).toEqual([
      { key: "condition", label: "Condition", value: "Used" },
      { key: "chargerKind", label: "Charger kind", value: "Refill" }
    ]);
    expect(stateLabels({})).toEqual([]);
    expect(stateLabels(null)).toEqual([]);
  });
});
