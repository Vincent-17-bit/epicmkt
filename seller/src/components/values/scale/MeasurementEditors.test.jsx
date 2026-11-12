import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { scales } from "@epicmkt/shared";
import { EDITORS } from "./wrappers.jsx";
import { OptionDimensionsEditor } from "./DimensionsEditor.jsx";
import { convertedHelp } from "./ShoeValuesEditor.jsx";
import { identity } from "./model.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const noViolations = async (node) => expect((await axe(node)).violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);

function Harness({ scaleId, initial = [], label = "Size", ...props }) {
  const [list, setList] = useState(initial);
  const Editor = EDITORS[scaleId];
  return <Editor label={label} values={list} onChange={setList} {...props} />;
}
const chipText = () => screen.queryAllByTestId("scale-chip").map((c) => c.querySelector("span").textContent);
const type = async (user, text) => user.type(screen.getByLabelText(/^(Size|Shoe size|Screen|Sizes)/, { selector: "input" }), `${text}{Enter}`);

describe("shoe", () => {
  it("system switch: bare numbers are read in the chosen system, and converted sizes show as help", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="shoe" label="Shoe size" />);
    await type(user, "42");
    expect(chipText()).toEqual(["EU 42"]);
    expect(screen.getAllByTestId("scale-chip")[0]).toHaveTextContent(/UK 8/);
    await user.click(screen.getByRole("button", { name: "UK" }));
    expect(screen.getByRole("button", { name: "UK" })).toHaveAttribute("aria-pressed", "true");
    await type(user, "9");
    expect(chipText()).toEqual(["EU 42", "UK 9"]);
  });
  it("adds a width", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="shoe" label="Shoe size" />);
    await user.selectOptions(screen.getByLabelText("Width"), "wide");
    await type(user, "42");
    expect(chipText()).toEqual(["EU 42 · Wide"]);
  });
  it("EU 38 to 47 in half steps fills 19 sizes at once", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="shoe" label="Shoe size" />);
    await user.click(screen.getByRole("button", { name: "Add range" }));
    expect(screen.getAllByTestId("scale-chip")).toHaveLength(19);
    expect(chipText()[0]).toBe("EU 38");
    expect(chipText().at(-1)).toBe("EU 47");
    expect(screen.getByRole("status")).toHaveTextContent("19 values added.");
  });
  it("shoe 42 is a different size from dress 42", () => {
    const shoe = scales.parse("shoe", "EU 42").value;
    expect(scales.parse("apparel-numeric", "42").ok).toBe(false); // a dress size stops at 22
    const dress = scales.parse("apparel-numeric", "10").value;
    expect(identity(shoe)).not.toBe(identity(dress));
    expect(scales.sizeKey(shoe)).toBe("shoe:eu:42");
    expect(convertedHelp(shoe)).toMatch(/UK 8/);
  });
  it("is free of axe violations", async () => {
    const { container } = render(<Harness scaleId="shoe" label="Shoe size" />);
    await noViolations(container);
  });
});

describe("clothing, kids, collar, screen, storage, length, bed, tyre, paper", () => {
  it.each([
    ["apparel-alpha", ["m", "xl"], ["M", "XL"]],
    ["apparel-numeric", ["6", "US 10"], ["US 6", "US 10"]],
    ["kids-age", ["newborn", "3-4 years"], ["Newborn", "3-4 years"]],
    ["collar-inch", ["15", "15.5"], ['15"', '15.5"']],
    ["screen-inch", ["6.7 in", "55"], ['6.7"', '55"']],
    ["storage", ["128 GB", "1024 GB"], ["128 GB", "1 TB"]],
    ["length", ["2 m", "150 cm"], ["2 m", "150 cm"]],
    ["bed-size", ["4 x 6", "6 x 6"], ["4 x 6 ft", "6 x 6 ft"]],
    ["tyre-size", ["205/55R16"], ["205/55 R16"]],
    ["paper-size", ["a4", "A3"], ["A4", "A3"]]
  ])("%s", async (scaleId, typed, shown) => {
    const user = userEvent.setup();
    render(<Harness scaleId={scaleId} label="Size" />);
    for (const t of typed) await type(user, t);
    expect(chipText()).toEqual(shown);
  });
  it("a preset fills clothing sizes XS to XL in order", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="apparel-alpha" />);
    await user.click(screen.getByRole("button", { name: "Add XS to XL" }));
    expect(chipText()).toEqual(["XS", "S", "M", "L", "XL"]);
  });
  it("collar range 14 to 18 in half steps", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="collar-inch" />);
    await user.click(screen.getByRole("button", { name: "Add range" }));
    expect(screen.getAllByTestId("scale-chip")).toHaveLength(9);
  });
  it("a range that makes too many values is explained, not added", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="length" />);
    const to = screen.getByLabelText("To");
    await user.clear(to);
    await user.type(to, "500");
    expect(screen.getByRole("alert")).toHaveTextContent(/up to 40/);
    expect(screen.getByRole("button", { name: "Add range" })).toBeDisabled();
  });
  it("a length range uses the chosen unit", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="length" />);
    await user.selectOptions(screen.getByLabelText("Unit"), "ft");
    await user.click(screen.getByRole("button", { name: "Add range" }));
    expect(chipText()).toEqual(["1 ft", "2 ft", "3 ft", "4 ft", "5 ft"]);
  });
});

describe("dimensions", () => {
  const fieldsOf = (form) => ({ L: within(form).getByLabelText("Length"), W: within(form).getByLabelText("Width"), H: within(form).getByLabelText("Height") });
  it("table: Length x Width x Height with a unit", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="dimensions" typeId="table" label="Sizes" />);
    const form = screen.getByRole("form", { name: "Add size" });
    const f = fieldsOf(form);
    await user.type(f.L, "180");
    await user.type(f.W, "90");
    await user.type(f.H, "75");
    expect(within(form).getByText("180 × 90 × 75 cm")).toBeInTheDocument();
    await user.click(within(form).getByRole("button", { name: "Add size" }));
    expect(chipText()).toEqual(["180 × 90 × 75 cm"]);
  });
  it("round table: Diameter x Height", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="dimensions" typeId="table" label="Sizes" />);
    const form = screen.getByRole("form", { name: "Add size" });
    await user.click(within(form).getByRole("button", { name: "Round" }));
    await user.type(within(form).getByLabelText("Diameter"), "90");
    await user.type(within(form).getByLabelText("Height"), "75");
    await user.click(within(form).getByRole("button", { name: "Add size" }));
    expect(chipText()).toEqual(["Ø 90 × 75 cm"]);
  });
  it("door: Width x Height, in metres", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="dimensions" typeId="door" label="Sizes" />);
    const form = screen.getByRole("form", { name: "Add size" });
    expect(within(form).queryByLabelText("Length")).toBeNull();
    await user.selectOptions(within(form).getByLabelText("Unit"), "m");
    await user.type(within(form).getByLabelText("Width"), "0.9");
    await user.type(within(form).getByLabelText("Height"), "2.1");
    await user.click(within(form).getByRole("button", { name: "Add size" }));
    expect(chipText()).toEqual(["0.9 × 2.1 m"]);
  });
  it("a 750 cm high table warns and is still added", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="dimensions" typeId="table" label="Sizes" />);
    const form = screen.getByRole("form", { name: "Add size" });
    const f = fieldsOf(form);
    await user.type(f.L, "120");
    await user.type(f.W, "75");
    await user.type(f.H, "750");
    expect(within(form).getByRole("status")).toHaveTextContent(/Height 750 cm is more than usual/);
    await user.click(within(form).getByRole("button", { name: "Add size" }));
    expect(chipText()).toEqual(["120 × 75 × 750 cm"]);
    expect(screen.getAllByText(/more than usual/).length).toBeGreaterThan(0);
  });
  it("asks for every field before adding", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="dimensions" typeId="table" label="Sizes" />);
    const form = screen.getByRole("form", { name: "Add size" });
    await user.type(within(form).getByLabelText("Length"), "180");
    await user.click(within(form).getByRole("button", { name: "Add size" }));
    expect(within(form).getByRole("alert")).toHaveTextContent(/length, width, height/);
    expect(chipText()).toEqual([]);
  });
  it("types a size as text too", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="dimensions" typeId="table" label="Sizes" />);
    await user.type(screen.getByLabelText("Sizes", { selector: "input" }), "120 x 75 x 75 cm{Enter}");
    expect(chipText()).toEqual(["120 × 75 × 75 cm"]);
  });
  it("is free of axe violations", async () => {
    const { container } = render(<Harness scaleId="dimensions" typeId="table" label="Sizes" />);
    await noViolations(container);
  });
});

describe("sofa dimensions per option", () => {
  const options = [{ id: "2-seater", label: "2-seater" }, { id: "3-seater", label: "3-seater" }];
  function Sofa() {
    const [v, set] = useState({});
    return <><OptionDimensionsEditor typeId="sofa" options={options} value={v} onChange={set} /><output data-testid="out">{JSON.stringify(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scales.format(x)])))}</output></>;
  }
  it("each option gets its own Width x Depth x Height", async () => {
    const user = userEvent.setup();
    render(<Sofa />);
    const two = screen.getByRole("region", { name: "Dimensions for 2-seater" });
    const three = screen.getByRole("region", { name: "Dimensions for 3-seater" });
    expect(within(two).getByLabelText("Depth")).toBeInTheDocument();
    for (const [box, vals] of [[two, ["160", "88", "85"]], [three, ["210", "90", "88"]]]) {
      await user.type(within(box).getByLabelText("Width"), vals[0]);
      await user.type(within(box).getByLabelText("Depth"), vals[1]);
      await user.type(within(box).getByLabelText("Height"), vals[2]);
      await user.click(within(box).getByRole("button", { name: "Set dimensions" }));
    }
    expect(JSON.parse(screen.getByTestId("out").textContent)).toEqual({ "2-seater": "160 × 88 × 85 cm", "3-seater": "210 × 90 × 88 cm" });
    expect(within(two).getByRole("button", { name: "Update" })).toBeInTheDocument();
  });
  it("says what to do when there are no options", () => {
    render(<OptionDimensionsEditor typeId="sofa" options={[]} value={{}} onChange={() => {}} />);
    expect(screen.getByText(/Add the options first/)).toBeInTheDocument();
  });
  it("is free of axe violations", async () => {
    const { container } = render(<Sofa />);
    await noViolations(container);
  });
});
