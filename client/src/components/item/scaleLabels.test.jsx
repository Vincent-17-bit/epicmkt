import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { publicOptions } from "@epicmkt/shared";
import { sandisk, sofa } from "@epicmkt/shared/options/fixtures";
import { useOptionSelection } from "../../hooks/useOptionSelection.js";
import { seriousViolations } from "../../test/axe.js";
import Options from "./Options.jsx";

function Harness({ item }) {
  const option = useOptionSelection(item, "it");
  return <Options ctx={{ option }} slot={{ item }} />;
}
const mount = (item) => render(<MemoryRouter initialEntries={["/?item=it"]}><Harness item={item} /></MemoryRouter>);

// A shoe item whose size axis names the shoe scale, as a seller's axis will once the editors (1.5) save it.
const shoeItem = (display = "button", extra = {}) => {
  const sizes = [40, 41, 42];
  const axes = [{ key: "size", label: "Size (EU)", display, scale: "shoe", values: sizes.map((n) => ({ id: `eu-${n}`, label: `EU ${n}` })) }];
  const variants = sizes.map((n, i) => ({ id: `v${i}`, choice: { size: `eu-${n}` }, price: 3000, status: "available", stock: 5, sku: null, mediaIds: [], specs: [] }));
  const item = { id: "shoes", name: "Loafer", price: 3000, salePrice: null, showStockCount: false };
  return { item, ...publicOptions({ axes, variants, item, defaultVariantId: "v2" }), ...extra };
};
const labelsOf = (name) => within(screen.getByRole("radiogroup", { name: new RegExp(`^${name}`) })).getAllByRole("radio").map((r) => r.textContent);

beforeEach(() => window.localStorage.clear());

describe("shoe system switch", () => {
  it("shows the stored system, then the same sizes in the system the buyer picks", async () => {
    mount(shoeItem());
    expect(labelsOf("Size")[0]).toContain("EU 40");
    await userEvent.click(screen.getByRole("button", { name: "UK" }));
    expect(screen.getByRole("button", { name: "UK" })).toHaveAttribute("aria-pressed", "true");
    const uk = labelsOf("Size");
    expect(uk[0]).toContain("UK 6.5");
    expect(uk[2]).toContain("UK 8");
    // the choice did not move: still the default (EU 42), now read as UK 8, and the axis name no longer says EU
    expect(within(screen.getByRole("radiogroup", { name: /^Size/ })).getByRole("radio", { checked: true })).toHaveTextContent("UK 8");
    expect(screen.queryByText(/Size \(EU\)/)).toBeNull();
  });
  it("explains the selected size in every system", () => {
    mount(shoeItem());
    expect(screen.getByText("EU 42 · UK 8 · US 9 (about 27 cm)")).toBeInTheDocument();
  });
  it("remembers the buyer's system for the next visit", async () => {
    const first = mount(shoeItem());
    await userEvent.click(screen.getByRole("button", { name: "US men" }));
    first.unmount();
    mount(shoeItem());
    expect(screen.getByRole("button", { name: "US men" })).toHaveAttribute("aria-pressed", "true");
    expect(labelsOf("Size")[2]).toContain("US 9");
  });
  it("is not shown for an axis that is not a shoe size", () => {
    mount(sandisk());
    expect(screen.queryByRole("group", { name: "Shoe size system" })).toBeNull();
  });
  it("has no serious accessibility violations", async () => {
    const { container } = mount(shoeItem());
    expect(await seriousViolations(container)).toEqual([]);
  });
});

describe("shoe axis in the other layouts (merged with the size chart link)", () => {
  const chart = { id: "c1", name: "Men's shoes", unit: "cm", columns: ["EU", "Foot length (cm)"], rows: [["40", "25"], ["42", "26.7"]], overridden: false };

  it("a dropdown gets the system switch, a system-neutral name and converted options", async () => {
    mount(shoeItem("dropdown"));
    expect(screen.getByRole("group", { name: "Shoe size system" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "UK" }));
    const select = screen.getByRole("combobox", { name: "Size" });
    expect(within(select).getAllByRole("option").map((o) => o.textContent.trim())).toEqual(expect.arrayContaining(["UK 6.5", "UK 8"]));
    expect(screen.queryByText(/Size \(EU\)/)).toBeNull();
  });

  it("the size chart link and the shoe system switch live together, in both layouts", async () => {
    for (const display of ["button", "dropdown"]) {
      const view = mount(shoeItem(display, { sizeChart: chart }));
      expect(screen.getByRole("button", { name: "Size chart" })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Shoe size system" })).toBeInTheDocument();
      view.unmount();
    }
  });

  it("switching the system does not close or break the chart link", async () => {
    mount(shoeItem("button", { sizeChart: chart }));
    await userEvent.click(screen.getByRole("button", { name: "UK" }));
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    expect(screen.getByRole("dialog", { name: "Size chart" })).toBeInTheDocument();
  });
});

describe("storage labels", () => {
  it("1024 GB shows as 1 TB (2048 GB as 2 TB is covered by the label tests)", () => {
    mount(sandisk());
    const all = screen.getAllByRole("radio").map((r) => r.textContent).join(" ");
    expect(all).toMatch(/1 TB/);
    expect(all).not.toMatch(/1024 GB|2048 GB/);
  });
});

describe("dimensions per option", () => {
  it("sofa dimensions change with the seats option", async () => {
    const item = sofa();
    const dims = { "2-seater": "160 x 85 x 80 cm", "3-seater": "210 x 90 x 82 cm" };
    item.optionVariants = item.optionVariants.map((v) => ({ ...v, specs: [{ label: "Dimensions", value: dims[v.choice.size] }] }));
    mount(item);
    const shown = () => screen.getByText(/Dimensions:/).parentElement.textContent;
    const first = shown();
    await userEvent.click(within(screen.getByRole("radiogroup", { name: /^Size/ })).getAllByRole("radio").find((r) => r.getAttribute("aria-checked") !== "true"));
    expect(shown()).not.toBe(first);
    expect(Object.values(dims).some((d) => shown().includes(d))).toBe(true);
  });
  it("shows nothing when the option has no dimensions", () => {
    mount(sofa());
    expect(screen.queryByText(/Dimensions:/)).toBeNull();
  });
});
