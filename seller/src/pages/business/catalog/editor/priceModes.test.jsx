// Prompt 4.6: "What changes the price?" in the Options step. Phone: Black 25,000, Grey 24,000.
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { addAxis, addValue, emptyOptionsForm, optionsPayload, rowKeyOf, setBasePlusDifference, setRow } from "@epicmkt/shared";
import OptionsStep from "./steps/OptionsStep.jsx";

vi.mock("./steps/useProductTypes.js", () => ({ useProductTypes: () => ({ types: [], planLimits: undefined, departments: [], loading: false, error: false, retry() {} }) }));
const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });

const build = (spec) => {
  let o = emptyOptionsForm();
  for (const [label, display, values] of spec) {
    o = addAxis(o, { label, display });
    for (const v of values) o = addValue(o, o.axes.at(-1).key, v).options;
  }
  return o;
};
const phone = () => build([["Color", "swatch", ["Black", "Grey", "Blue"]], ["Storage", "button", ["128 GB", "256 GB", "512 GB"]]]);
const colorOnly = () => build([["Color", "swatch", ["Black", "Grey"]]]);
const priceOf = (o, k) => o.rows.find((r) => rowKeyOf(o, r.choice) === k).price;

function Harness({ options, spy, price = "" }) {
  const [form, setForm] = useState({ productTypeId: null, price, options });
  spy.current = form;
  return <OptionsStep form={form} patch={(k, v) => setForm((f) => ({ ...f, [k]: v }))} errors={{}} />;
}
const setup = (options, price = "") => { const spy = { current: null }; const user = userEvent.setup(); const view = render(<Harness options={options} spy={spy} price={price} />); return { user, spy, ...view }; };
const tick = (user, name) => user.click(screen.getByRole("checkbox", { name }));

describe("What changes the price?", () => {
  it("shows the question for an item with options and leaves the plain list alone until the seller answers", () => {
    setup(colorOnly());
    expect(screen.getByRole("heading", { name: "What changes the price?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Black price")).toBeInTheDocument(); // the existing per-combination price cell
    expect(screen.queryByRole("list", { name: "Price by Color" })).toBeNull();
  });

  it("one option: a list by color, Black 25,000 and Grey 24,000, stored per combination", async () => {
    const { user, spy } = setup(phone());
    await tick(user, "Color");
    const list = screen.getByRole("list", { name: "Price by Color" });
    await user.type(within(list).getByLabelText("Black price"), "25000");
    await user.type(within(list).getByLabelText("Grey price"), "24000");
    expect(priceOf(spy.current.options, "color=grey|storage=256-gb")).toBe("24000");
    expect(priceOf(spy.current.options, "color=black|storage=512-gb")).toBe("25000");
    // the combination list no longer asks for a second price
    expect(screen.queryByLabelText("Grey 256 GB price")).toBeNull();
    expect(screen.getAllByText("9 combinations, 9 in stock, from KES 24,000").length).toBeGreaterThan(0);
  });

  it("grid and base + difference store identical absolute prices", async () => {
    const { user, spy } = setup(phone());
    await tick(user, "Color");
    await tick(user, "Storage");
    await user.click(screen.getByRole("button", { name: "Base + difference" }));
    for (const [n, v] of [["128 GB", "22000"], ["256 GB", "25000"], ["512 GB", "30000"]]) await user.type(screen.getByLabelText(`${n} base price`), v);
    await user.type(screen.getByLabelText("Grey difference"), "-1000");
    await user.click(screen.getByRole("button", { name: "Fill the prices" }));
    const viaDiff = spy.current.options;
    expect(priceOf(viaDiff, "color=grey|storage=256-gb")).toBe("24000");
    const expected = setBasePlusDifference(phone(), { baseAxis: "storage", diffAxis: "color", base: { "128-gb": "22000", "256-gb": "25000", "512-gb": "30000" }, diff: { grey: "-1000" } });
    expect(optionsPayload(viaDiff).variants).toEqual(optionsPayload(expected).variants);
    // the grid shows them and is editable
    const cell = screen.getByLabelText("256 GB Grey price");
    expect(cell).toHaveValue("24000");
    await user.clear(cell);
    await user.type(cell, "23500");
    expect(priceOf(spy.current.options, "color=grey|storage=256-gb")).toBe("23500");
    expect(priceOf(spy.current.options, "color=black|storage=256-gb")).toBe("25000");
  });

  it("three options change the price: the full table keeps its own price cells", async () => {
    const { user } = setup(build([["Color", "swatch", ["Black", "Grey"]], ["Storage", "button", ["128 GB", "256 GB"]], ["Size", "button", ["S", "M"]]]));
    await tick(user, "Color"); await tick(user, "Storage"); await tick(user, "Size");
    expect(screen.getByText(/Three or more options change the price/)).toBeInTheDocument();
    expect(screen.getByLabelText("Black / 128 GB / S price")).toBeInTheDocument();
  });

  it("a missing price and a far price give plain warnings with a Fix button that focuses the field", async () => {
    let o = setBasePlusDifference(phone(), { baseAxis: "storage", diffAxis: "color", base: { "128-gb": "22000", "256-gb": "25000", "512-gb": "30000" }, diff: {} });
    o = setRow(o, "color=blue|storage=128-gb", { price: "" });
    o = setRow(o, "color=black|storage=256-gb", { price: "2400" });
    const { user } = setup(o);
    await tick(user, "Color"); // switching the layout keeps the warnings in view
    const warnings = screen.getByRole("list", { name: "Things to check" });
    expect(within(warnings).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(within(warnings).getAllByText(/has no price|far below/).length).toBeGreaterThan(0);
    await user.click(within(warnings).getAllByRole("button", { name: /^Fix/ })[0]);
    expect(document.activeElement.tagName).toBe("INPUT");
  });

  it("unticking an option makes it stop changing the price", async () => {
    const { user, spy } = setup(setBasePlusDifference(phone(), { baseAxis: "storage", diffAxis: "color", base: { "128-gb": "22000", "256-gb": "25000", "512-gb": "30000" }, diff: { grey: "-1000" } }));
    expect(screen.getByRole("checkbox", { name: "Color" })).toBeChecked(); // inferred from the saved prices
    await user.click(screen.getByRole("checkbox", { name: "Color" }));
    expect(priceOf(spy.current.options, "color=grey|storage=256-gb")).toBe("25000");
  });

  it("has no accessibility violations in list and grid views", async () => {
    const { user, container } = setup(phone());
    await tick(user, "Color");
    expect((await axe(container)).violations).toEqual([]);
    await tick(user, "Storage");
    expect((await axe(container)).violations).toEqual([]);
  });
  it("a combination that is not sold shows Not sold in the grid and goes back on sale in one tap", async () => {
    const { user, spy } = setup(phone());
    await tick(user, "Color");
    await tick(user, "Storage");
    await user.click(screen.getByLabelText("Not sold: Grey / 256 GB"));
    expect(screen.queryByLabelText("256 GB Grey price")).toBeNull();
    await user.click(screen.getByRole("button", { name: "256 GB Grey is not sold. Put back on sale." }));
    expect(spy.current.options.rows.find((r) => rowKeyOf(spy.current.options, r.choice) === "color=grey|storage=256-gb").sold).toBe(true);
    await user.type(screen.getByLabelText("256 GB Grey price"), "7000");
    expect(priceOf(spy.current.options, "color=grey|storage=256-gb")).toBe("7000");
  });
});

describe("Pack sizes: units and the suggestion", () => {
  const royco = () => build([["Flavour", "button", ["Beef", "Chicken", "Chilli"]], ["Size", "button", ["3 Cubes", "Whole Pack", "Whole Jar"]]]);
  const key = (f, n) => `flavour=${f}|size=${["3-cubes", "whole-pack", "whole-jar"][n]}`;
  const typed = () => {
    let o = royco();
    for (const [f, n, p] of [["beef", 0, "10"], ["beef", 1, "130"], ["chicken", 0, "10"], ["chicken", 1, "140"], ["chilli", 2, "160"]]) o = setRow(o, key(f, n), { price: p });
    return o;
  };

  it("each combination has a Unit field that is saved with the row", async () => {
    const { user, spy } = setup(royco());
    await user.type(screen.getByLabelText("Chilli / Whole Jar unit (optional)"), "per jar of 48");
    expect(spy.current.options.rows.find((r) => rowKeyOf(spy.current.options, r.choice) === key("chilli", 2)).unit).toBe("per jar of 48");
    expect(optionsPayload(spy.current.options).variants.find((v) => v.choice.size === "whole-jar" && v.choice.flavour === "chilli").unit).toBe("per jar of 48");
  });

  it("when the seller has not answered but typed prices already differ, it offers the grid, and one tap shows it", async () => {
    setup(typed());
    // starts from what is saved, so the grid is already inferred for an item whose saved prices differ
    expect(screen.queryByText(/Show them as a/)).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Flavour" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Size" })).toBeChecked();
    expect(screen.getByLabelText("3 Cubes Beef price")).toBeInTheDocument();
  });

  it("an item opened with no prices, then priced row by row, gets the suggestion", async () => {
    const { user } = setup(royco());
    await user.type(screen.getByLabelText("Beef / 3 Cubes price"), "10");
    await user.type(screen.getByLabelText("Beef / Whole Pack price"), "130");
    await user.type(screen.getByLabelText("Chicken / 3 Cubes price"), "10");
    await user.type(screen.getByLabelText("Chicken / Whole Pack price"), "140");
    expect(screen.getByText(/Your prices already change with Flavour and Size/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, show it" }));
    expect(screen.getByRole("region", { name: "Prices by Size and Flavour" })).toBeInTheDocument();
    expect(screen.queryByText(/Your prices already change/)).toBeNull();
  });

  it("the unit follows Size: one field per size sets it for every flavour", async () => {
    const { user, spy } = setup(typed());
    await user.click(screen.getByText("Different pack sizes? Set the unit for each"));
    await user.type(screen.getByLabelText("Unit for Whole Jar"), "per jar");
    const rows = spy.current.options.rows;
    expect(rows.filter((r) => r.unit === "per jar").map((r) => rowKeyOf(spy.current.options, r.choice)).sort()).toEqual([key("beef", 2), key("chicken", 2), key("chilli", 2)]);
    expect(rows.filter((r) => r.choice.size !== "whole-jar").every((r) => !r.unit)).toBe(true);
  });

  it("points out the forgotten jar prices that would quietly cost the item price", () => {
    setup(typed(), "10");
    expect(screen.getAllByText(/has no price of its own, so buyers pay the item price/).length).toBeGreaterThan(0);
  });
});
