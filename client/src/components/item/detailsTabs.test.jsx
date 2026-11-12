import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { t as clientT } from "../../i18n/index.js";
import Details, { Specs } from "./Details.jsx";
import { mergeSpecs, specGroupsFor, topHighlights } from "../../lib/itemView.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const noViolations = async (node) => {
  const r = await axe(node);
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
};

const item = (extra = {}) => ({
  id: "i1", name: "Pulse X1", productType: "phone", brand: "Pulse", shortDescription: "A fast phone", description: "A longer story about the phone and what it does well.",
  highlights: [{ title: "Fast", text: "Charges in 30 minutes" }], includes: ["Charger"], terms: "",
  specs: [
    { group: "Features & Specs", label: "Display", value: "6.5 inch" },
    { group: "Features & Specs", label: "Storage", value: "128 GB" },
    { group: "Measurements", label: "Weight", value: "190 g" },
    { group: "Features & Specs", label: "SIM", value: "Dual" },
    { group: "Features & Specs", label: "Battery", value: "5000 mAh" },
    { group: "Features & Specs", label: "Warranty", value: "1 year" }
  ],
  ...extra
});
const slotOf = (it, extra = {}) => ({ item: it, t: clientT, ...extra });
const ctxOf = (extra = {}) => ({ business: { category: null, attributes: {} }, track: vi.fn(), ...extra });
const view = (it = item(), ctx = ctxOf(), slot = slotOf(it)) => render(<Details ctx={ctx} slot={slot} />);

describe("typed item details", () => {
  it("shows Top highlights, About this item bullets, and Description and Specifications tabs", () => {
    view();
    const top = screen.getByRole("region", { name: "Top highlights" });
    expect(within(top).getAllByRole("term").map((n) => n.textContent)).toEqual(["Display", "Storage", "SIM", "Battery"]);
    expect(screen.getByRole("heading", { name: "About this item" })).toBeInTheDocument();
    expect(screen.getByText("Charges in 30 minutes")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Description", "Specifications"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Description" })).toHaveTextContent("A longer story");
  });

  it("the Specifications tab holds the grouped table with the row labels", async () => {
    view();
    await userEvent.click(screen.getByRole("tab", { name: "Specifications" }));
    const panel = screen.getByRole("tabpanel", { name: "Specifications" });
    expect(panel).toBeVisible();
    expect(within(panel).getByRole("button", { name: "Features & Specs" })).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getAllByRole("term").map((n) => n.textContent)).toEqual(expect.arrayContaining(["Display", "Storage", "Warranty"]));
    await userEvent.click(within(panel).getByRole("button", { name: "Measurements" }));
    expect(within(panel).getByText("190 g")).toBeVisible();
    expect(within(panel).getByRole("button", { name: "What's included" })).toBeInTheDocument();
  });

  it("tabs work with the keyboard: arrows wrap, Home and End jump, only the selected tab is in the tab order", async () => {
    view();
    const [desc, specs] = screen.getAllByRole("tab");
    expect(desc).toHaveAttribute("tabindex", "0");
    expect(specs).toHaveAttribute("tabindex", "-1");
    desc.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(specs).toHaveFocus();
    expect(specs).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(desc).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(specs).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(desc).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(specs).toHaveFocus();
    expect(desc).toHaveAttribute("aria-controls");
  });

  it("the See more product details link opens the Specifications tab", async () => {
    view(item(), ctxOf(), slotOf(item()));
    await userEvent.click(screen.getByRole("button", { name: "See more product details" }));
    expect(screen.getByRole("tab", { name: "Specifications" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Specifications" })).toBeVisible();
  });

  it("has no reviews, ratings, badges, coupon or return policy blocks", () => {
    const { container } = view();
    expect(container.textContent).not.toMatch(/review|rating|best seller|amazon|choice|coupon|return policy|stars?/i);
    expect(container.querySelector('[aria-label*="star" i]')).toBeNull();
  });

  it("draws the table once: the separate Specs slot is empty for a typed item", () => {
    expect(render(<Specs slot={slotOf(item())} />).container).toBeEmptyDOMElement();
  });

  it("shows a single content block without tabs when there is only one", () => {
    view(item({ specs: [], includes: [], highlights: [] }));
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText(/A longer story/)).toBeInTheDocument();
    view(item({ description: "", shortDescription: "" }), ctxOf(), slotOf(item({ description: "", shortDescription: "" })));
    expect(screen.queryAllByRole("tablist")).toHaveLength(0);
  });

  it("renders nothing for a typed item with nothing to show", () => {
    expect(view(item({ specs: [], includes: [], highlights: [], description: "", shortDescription: "" })).container).toBeEmptyDOMElement();
  });

  it("the table and the top highlights follow the selected combination", async () => {
    const withVariant = (specOverrides) => ctxOf({ option: { variant: { id: "v", specOverrides } } });
    const panel = () => screen.getByRole("tabpanel", { name: "Specifications", hidden: true });
    const { rerender } = render(<Details ctx={withVariant(undefined)} slot={slotOf(item())} />);
    await userEvent.click(screen.getByRole("tab", { name: "Specifications" }));
    expect(within(panel()).getByText("128 GB")).toBeInTheDocument();
    rerender(<Details ctx={withVariant({ Storage: "256 GB", Colour: "Wine red" })} slot={slotOf(item())} />);
    expect(within(panel()).getByText("256 GB")).toBeInTheDocument();
    expect(within(panel()).queryByText("128 GB")).toBeNull();
    expect(within(panel()).getByText("Wine red")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Top highlights" })).getByText("256 GB")).toBeInTheDocument();
    rerender(<Details ctx={withVariant([{ label: "storage", value: "512 GB" }])} slot={slotOf(item())} />);
    expect(within(panel()).getByText("512 GB")).toBeInTheDocument();
    rerender(<Details ctx={withVariant(undefined)} slot={slotOf(item())} />);
    expect(within(panel()).getByText("128 GB")).toBeInTheDocument();
  });

  it("tracks the first opening of a group", async () => {
    const ctx = ctxOf();
    view(item(), ctx);
    await userEvent.click(screen.getByRole("tab", { name: "Specifications" }));
    await userEvent.click(screen.getByRole("button", { name: "Measurements" }));
    expect(ctx.track).toHaveBeenCalledWith("spec_expand", { panel: "specs_measurements" });
  });

  it("has no axe violations (tabs, specifications open)", async () => {
    const { container } = view();
    await noViolations(container);
    await userEvent.click(screen.getByRole("tab", { name: "Specifications" }));
    await noViolations(container);
  });
});

describe("items with no product type are unchanged", () => {
  const plain = () => item({ productType: undefined });

  it("Details draws highlights and description with no tabs and no top highlights", () => {
    view(plain());
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Top highlights")).toBeNull();
    expect(screen.getByRole("heading", { name: "About this item" })).toBeInTheDocument();
    expect(screen.getByText(/A longer story/)).toBeInTheDocument();
  });

  it("the Specs slot still draws the table", () => {
    render(<Specs slot={slotOf(plain())} />);
    expect(screen.getByRole("button", { name: "Features & Specs" })).toBeInTheDocument();
  });

  it("renders with an empty ctx, as before", () => {
    expect(() => render(<Details ctx={{}} slot={slotOf(plain())} />)).not.toThrow();
  });
});

describe("spec helpers", () => {
  const specs = [{ group: "Measurements", label: "Weight", value: "190 g" }, { group: "Features & Specs", label: "Storage", value: "128 GB" }];

  it("mergeSpecs replaces by label, adds new rows, removes on blank and accepts a map or a list", () => {
    expect(mergeSpecs(specs, { storage: "256 GB" })[1]).toEqual({ group: "Features & Specs", label: "Storage", value: "256 GB" });
    expect(mergeSpecs(specs, { Colour: "Red" }).at(-1)).toEqual({ group: "Features & Specs", label: "Colour", value: "Red" });
    expect(mergeSpecs(specs, { Weight: "" }).map((s) => s.label)).toEqual(["Storage"]);
    expect(mergeSpecs(specs, [{ label: "Material", value: "Steel", group: "Measurements" }]).at(-1).group).toBe("Measurements");
    expect(mergeSpecs(specs, null)).toEqual(specs);
    expect(mergeSpecs(undefined, { A: "1" })).toEqual([{ group: "Features & Specs", label: "A", value: "1" }]);
    expect(specs[1].value).toBe("128 GB");
  });

  it("specGroupsFor applies overrides and topHighlights takes the first rows in group order", () => {
    const groups = specGroupsFor({ item: { specs }, overrides: { Storage: "512 GB" } });
    expect(groups.map((g) => g.name)).toEqual(["Features & Specs", "Measurements"]);
    expect(topHighlights(groups, 1)).toEqual([{ label: "Storage", value: "512 GB" }]);
    expect(topHighlights([], 4)).toEqual([]);
  });
});
