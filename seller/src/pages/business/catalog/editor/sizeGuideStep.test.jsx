// The seller's own size guide step: starting points, editing the table, the buyer preview, warnings and errors.
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureAxe } from "vitest-axe";
import { guidePayload } from "@epicmkt/shared";
import SizeGuideStep from "./steps/SizeGuideStep.jsx";

vi.mock("./steps/useProductTypes.js", () => ({ useProductTypes: () => ({ types: [{ id: "shoes", name: "Shoes" }, { id: "dress", name: "Dress" }, { id: "liquor", name: "Liquor" }, { id: "bakery", name: "Bakery" }, { id: "wood", name: "Wood and furniture" }, { id: "bags", name: "Bags" }], departments: [], loading: false, error: false, retry() {} }) }));
vi.mock("../../../../api/index.js", () => ({
  listSizeCharts: async () => [{ id: "c1", name: "Dresses and tops (cm)", category: "clothing", unit: "cm", columns: ["Size", "Bust", "Waist"], rows: [["S", "84", "66"], ["M", "90", "72"]] }]
}));
const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const sizeAxis = (labels) => ({ axes: [{ key: "size", label: "Size", display: "buttons", values: labels.map((l, i) => ({ id: `v${i}`, label: l })) }], rows: [], defaultKey: null });

function Harness({ start, spy, errors = {}, goTo }) {
  const [form, setForm] = useState(start);
  spy.current = form;
  return <SizeGuideStep form={form} patch={(k, v) => setForm((f) => ({ ...f, [k]: v }))} errors={errors} goTo={goTo} />;
}
const open = (start, extra = {}) => {
  const spy = { current: null };
  const user = userEvent.setup();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={qc}><Harness start={start} spy={spy} {...extra} /></QueryClientProvider>);
  return { user, spy, ...view };
};
const shoes = () => ({ productTypeId: "shoes", name: "Runner", options: sizeAxis(["EU 40", "EU 41", "EU 42"]) });
const dress = () => ({ productTypeId: "dress", name: "Wrap dress", options: sizeAxis(["S", "M"]) });

describe("Size guide step (seller)", () => {
  it("shoes: one tap builds the table from the sizes, with UK, US and foot length filled in, and nothing is saved yet", async () => {
    const { user, spy } = open(shoes());
    expect(screen.getByText("Make your size guide for shoes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Build the table from my 3 sizes" }));
    const p = guidePayload(spy.current.sizeGuide);
    expect(p.columns).toEqual(["Size", "UK", "US men", "US women", "Foot length (cm)"]);
    expect(p.rows[0]).toEqual(["EU 40", "6.5", "7.5", "8.5", "25.4"]);
    expect(p.rows).toHaveLength(3);
    expect(screen.getByLabelText("UK for EU 41")).toHaveValue("7.5");
  });

  it("shoes: choose the system the sizes are written in, the columns and a width", async () => {
    const start = { productTypeId: "shoes", name: "Boot", options: sizeAxis(["UK 7", "UK 8"]) };
    const { user, spy } = open(start);
    await user.selectOptions(screen.getByLabelText("Your sizes are written in"), "uk");
    expect(screen.queryByRole("checkbox", { name: "UK" })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "US women" }));
    await user.click(screen.getByRole("checkbox", { name: "Width" }));
    await user.clear(screen.getByLabelText(/Width, for every size/));
    await user.type(screen.getByLabelText(/Width, for every size/), "Wide");
    await user.click(screen.getByRole("button", { name: /Build the table from my 2 sizes/ }));
    const p = guidePayload(spy.current.sizeGuide);
    expect(p.columns).toEqual(["Size", "EU", "US men", "Foot length (cm)", "Width"]);
    expect(p.rows.every((r) => r[4] === "Wide")).toBe(true);
  });

  it("shoes with no sizes yet: build a range, or go and add sizes", async () => {
    const goTo = vi.fn();
    const { user, spy } = open({ productTypeId: "shoes", name: "Sandals" }, { goTo });
    await user.click(screen.getByRole("button", { name: "Add them in Options" }));
    expect(goTo).toHaveBeenCalledWith("options");
    await user.clear(screen.getByLabelText("From EU"));
    await user.type(screen.getByLabelText("From EU"), "38");
    await user.clear(screen.getByLabelText("To EU"));
    await user.type(screen.getByLabelText("To EU"), "40");
    await user.click(screen.getByRole("button", { name: "Build EU 38 to 40" }));
    expect(guidePayload(spy.current.sizeGuide).rows.map((r) => r[0])).toEqual(["EU 38", "EU 39", "EU 40"]);
  });

  it("clothing: pick the measurements; a row per size appears and typing fills the form", async () => {
    const { user, spy } = open(dress());
    await user.click(screen.getByRole("button", { name: /Tops and dresses/ }));
    expect(spy.current.sizeGuide.rows.map((r) => r.cells[0])).toEqual(["S", "M"]);
    await user.type(screen.getByLabelText("Chest for S"), "86");
    await user.type(screen.getByLabelText("Chest for M"), "92-96");
    expect(guidePayload(spy.current.sizeGuide).rows[1].slice(0, 2)).toEqual(["M", "92-96"]);
    expect(within(screen.getByTestId("guide-preview")).getByText("92-96")).toBeInTheDocument();
  });

  it("a size added in Options but missing from the table is flagged and added in one tap", async () => {
    const { user, spy } = open(dress());
    await user.click(screen.getByRole("button", { name: /Tops and dresses/ }));
    expect(screen.queryByText(/No row for/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Add a size" }));
    await user.type(screen.getByLabelText("Size name, row 3"), "XL");
    expect(screen.getByText(/XL is in the guide but not in your sizes/)).toBeInTheDocument();
    expect(spy.current.sizeGuide.rows).toHaveLength(3);
  });

  it("the unit toggle converts the numbers and the header", async () => {
    const { user, spy } = open(dress());
    await user.click(screen.getByRole("button", { name: /Tops and dresses/ }));
    await user.type(screen.getByLabelText("Chest for S"), "100");
    await user.click(screen.getByRole("radio", { name: "Inches" }));
    expect(spy.current.sizeGuide.unit).toBe("in");
    expect(spy.current.sizeGuide.rows[0].cells[1]).toBe("39.4");
  });

  it("rows can be moved, copied and removed, and a column can be added and removed", async () => {
    const { user, spy } = open(dress());
    await user.click(screen.getByRole("button", { name: /Trousers and skirts/ }));
    await user.click(screen.getByRole("button", { name: "Move S down" }));
    expect(spy.current.sizeGuide.rows.map((r) => r.cells[0])).toEqual(["M", "S"]);
    await user.click(screen.getByRole("button", { name: "Copy S as a new row" }));
    expect(spy.current.sizeGuide.rows).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Remove M" }));
    expect(spy.current.sizeGuide.rows.map((r) => r.cells[0])).toEqual(["S", ""]);
    await user.click(screen.getByRole("button", { name: "Chest" }));
    expect(spy.current.sizeGuide.columns).toContain("Chest");
    await user.click(screen.getByRole("button", { name: "Remove column Chest" }));
    expect(spy.current.sizeGuide.columns).not.toContain("Chest");
  });

  it("a ready-made table is copied in as the seller's own", async () => {
    const { user, spy } = open(dress());
    await user.click(await screen.findByRole("button", { name: /Dresses and tops \(cm\)/ }));
    expect(spy.current.sizeGuide.columns).toEqual(["Size", "Bust", "Waist"]);
    expect(spy.current.sizeGuide.rows).toHaveLength(2);
    expect(screen.getByText(/It is your own copy now/)).toBeInTheDocument();
  });

  it("start over asks first, then returns to the starting choices", async () => {
    const { user, spy } = open(dress());
    await user.click(screen.getByRole("button", { name: /Tops and dresses/ }));
    await user.click(screen.getByRole("button", { name: "Start over" }));
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(spy.current.sizeGuide).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Start over" }));
    await user.click(screen.getByRole("button", { name: "Yes, remove" }));
    expect(spy.current.sizeGuide).toBeNull();
    expect(screen.getByTestId("guide-start")).toBeInTheDocument();
  });

  it("Enter moves down a row and adds one after the last", async () => {
    const { user, spy } = open(dress());
    await user.click(screen.getByRole("button", { name: /Tops and dresses/ }));
    await user.type(screen.getByLabelText("Chest for S"), "80{Enter}");
    await waitFor(() => expect(screen.getByLabelText("Chest for M")).toHaveFocus());
    await user.type(screen.getByLabelText("Chest for M"), "90{Enter}");
    expect(spy.current.sizeGuide.rows).toHaveLength(3);
  });

  it("shows the errors it is given next to the field", () => {
    const g = { unit: "cm", columns: ["Size", ""], rows: [{ id: "r1", cells: ["S", "1"] }] };
    open({ ...dress(), sizeGuide: g }, { errors: { sizeGuide: { "columns.1": "Give this column a name." } } });
    expect(screen.getByText("Give this column a name.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name of column 2")).toHaveAttribute("aria-invalid", "true");
  });

  it("has no accessibility violations at the start or with a table", async () => {
    const { user, container } = open(shoes());
    expect((await axe(container)).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: /Build the table/ }));
    expect((await axe(container)).violations).toEqual([]);
  });

  const axes = (...a) => ({ axes: a.map(([label, vals]) => ({ key: label.toLowerCase(), label, display: "buttons", values: vals.map((l, i) => ({ id: `${label}${i}`, label: l })) })), rows: [], defaultKey: null });

  it("liquor: bottle sizes read the volume from the names, there is no cm/inches switch, and shoe conversion is tucked away", async () => {
    const { user, spy } = open({ productTypeId: "liquor", name: "Vodka", options: axes(["Volume", ["250ml", "750 ml", "1L"]]) });
    expect(screen.getByText("Make your size guide for drinks and bottles")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "UK" })).not.toBeNull();
    expect(screen.getByText("Shoe sizes in every system").closest("details")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Bottle sizes/ }));
    expect(guidePayload(spy.current.sizeGuide).rows.map((r) => r.slice(0, 2))).toEqual([["250ml", "250"], ["750 ml", "750"], ["1L", "1000"]]);
    expect(guidePayload(spy.current.sizeGuide).unit).toBeNull();
    expect(screen.queryByRole("radio", { name: "Inches" })).toBeNull();
    expect(screen.getByText(/Amounts such as ml, g or litres stay as you type them/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Show measurements in" })).toBeNull();
  });

  it("bakery: loaves read grams from the names; the shoe converter is not offered up front", async () => {
    const { user, spy } = open({ productTypeId: "bakery", name: "White bread", options: axes(["Size", ["400g", "800g", "Family"]]) });
    expect(screen.getByText("Make your size guide for bread, cakes and food")).toBeInTheDocument();
    expect(screen.getByText("Shoe sizes in every system").closest("details")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cakes/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Bread and loaves/ }));
    expect(guidePayload(spy.current.sizeGuide).rows.map((r) => r[1])).toEqual(["400", "800", "–"]);
    await user.type(screen.getByLabelText("Weight (g) for Family"), "1200");
    await user.type(screen.getByLabelText("Slices for Family"), "24");
    expect(spy.current.sizeGuide.rows[2].cells).toEqual(["Family", "1200", "24"]);
  });

  it("wood furniture in black, red and white: colours share the guide, only sizes get rows", async () => {
    const { user, spy } = open({ productTypeId: "wood", name: "Dining table", options: axes(["Colour", ["Black", "Red", "White"]], ["Size", ["4 seater", "6 seater"]]) });
    await user.click(screen.getByRole("button", { name: /Furniture and fittings/ }));
    expect(spy.current.sizeGuide.rows.map((r) => r.cells[0])).toEqual(["4 seater", "6 seater"]);
    expect(screen.getByText(/Colours share this guide/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thickness" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Length for 6 seater"), "180");
    await user.click(screen.getByRole("radio", { name: "Inches" }));
    expect(spy.current.sizeGuide.rows[1].cells[1]).toBe("70.9");
  });

  it("handbags and travel bags: one size is fine, capacity and weight never convert, text columns take letters", async () => {
    const { user, spy } = open({ productTypeId: "bags", name: "Leather handbag" });
    expect(screen.getByText("Make your size guide for bags and luggage")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Travel bags and suitcases/ }));
    expect(spy.current.sizeGuide.rows.map((r) => r.cells[0])).toEqual(["Standard"]);
    await user.type(screen.getByLabelText("Height for Standard"), "55");
    await user.type(screen.getByLabelText("Capacity (L) for Standard"), "38");
    await user.type(screen.getByLabelText("Cabin size for Standard"), "Yes, cabin");
    expect(screen.getByLabelText("Cabin size for Standard")).toHaveAttribute("inputmode", "text");
    await user.click(screen.getByRole("radio", { name: "Inches" }));
    expect(spy.current.sizeGuide.rows[0].cells.slice(1, 5)).toEqual(["21.7", "", "", "38"]);
    expect(guidePayload(spy.current.sizeGuide).rows[0][4]).toBe("38");
    expect(guidePayload(spy.current.sizeGuide).rows[0][6]).toBe("Yes, cabin");
  });

  it("an item with a Size option and no known kind starts from its own columns", async () => {
    const { user, spy } = open({ name: "Notebook", options: axes(["Size", ["A5", "A4"]]) });
    expect(screen.getByText("Pick the columns to show")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Only my own columns/ }));
    expect(spy.current.sizeGuide.rows.map((r) => r.cells[0])).toEqual(["A5", "A4"]);
  });

  it("an item of no known kind sees every kind of table up front, not tucked away", async () => {
    const { user, spy } = open({ name: "Fade cut" });
    expect(screen.getByText("What kind of item is it?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bottle sizes/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Furniture and fittings/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Handbags and purses/ }));
    expect(spy.current.sizeGuide.rows.map((r) => r.cells[0])).toEqual(["Standard"]);
  });
});
