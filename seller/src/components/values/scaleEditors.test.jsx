import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { scales } from "@epicmkt/shared";
import { DimensionsEditor, ScaleValueEditor, ShoeValueEditor, ValueEditor } from "./index.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const parse = (scale, raw, ctx = {}) => scales.parse(scale, raw, ctx).value;

// Keeps the editor's values in state, and exposes them for the test to read back.
function Host({ editor: Editor = ScaleValueEditor, initial = [], onValues, ...props }) {
  const [values, setValues] = useState(initial);
  onValues?.(values);
  return <Editor values={values} onChange={setValues} {...props} />;
}
const mount = (props) => {
  const seen = { current: [] };
  const view = render(<Host {...props} onValues={(v) => { seen.current = v; }} />);
  return { seen, ...view };
};
const chipTexts = () => (screen.queryByRole("list", { name: /values$/ }) ? within(screen.getByRole("list", { name: /values$/ })).getAllByRole("listitem").map((li) => li.querySelector("span").textContent) : []);
const type = async (label, text) => { await userEvent.type(screen.getByRole("textbox", { name: label }), text); };
const add = (label) => userEvent.click(screen.getByRole("button", { name: `Add to ${label}` }));

describe("volume (water refill fixture)", () => {
  const props = { scale: "volume", label: "Refill size", typeId: "drinking-water", axisKey: "size" };
  it("20 litres reads as 20 L and is stored as a scale value", async () => {
    const { seen } = mount(props);
    await type("Refill size", "20 litres");
    expect(screen.getByText("20 L", { selector: "strong" })).toBeInTheDocument(); // the preview, before adding
    await add("Refill size");
    expect(chipTexts()).toEqual(["20 L"]);
    expect(seen.current).toEqual([{ scale: "volume", value: 20, unit: "l" }]);
  });
  it("a bare 20 asks for the unit instead of guessing, and the unit button finishes it", async () => {
    const { seen } = mount(props);
    await type("Refill size", "20");
    const ask = screen.getByRole("group", { name: "Which unit is 20?" });
    await userEvent.click(within(ask).getByRole("button", { name: "l" }));
    expect(chipTexts()).toEqual(["20 L"]);
    expect(seen.current[0]).toMatchObject({ value: 20, unit: "l" });
  });
  it("fills 5, 10 and 20 L in one go with commas", async () => {
    mount(props);
    await type("Refill size", "5 L, 10 L, 20 litres");
    await add("Refill size");
    expect(chipTexts()).toEqual(["5 L", "10 L", "20 L"]);
  });
  it("a duplicate merges with a quiet notice, not an error", async () => {
    mount({ ...props, initial: [parse("volume", "20 L")] });
    await type("Refill size", "20 litres");
    await add("Refill size");
    expect(chipTexts()).toEqual(["20 L"]);
    expect(screen.getByText(/already in the list/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("shows the parse error inline, as an alert after trying to add", async () => {
    mount(props);
    await type("Refill size", "banana");
    expect(screen.getByRole("textbox", { name: "Refill size" })).not.toHaveAttribute("aria-invalid");
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Refill size" })).toHaveAttribute("aria-invalid", "true");
  });
  it("Enter adds", async () => {
    mount(props);
    await type("Refill size", "10 L{Enter}");
    expect(chipTexts()).toEqual(["10 L"]);
  });
  it("values can be reordered and removed, and each button names its value", async () => {
    mount({ ...props, initial: ["5 L", "10 L", "20 L"].map((t) => parse("volume", t)) });
    await userEvent.click(screen.getByRole("button", { name: "Move 20 L earlier" }));
    expect(chipTexts()).toEqual(["5 L", "20 L", "10 L"]);
    expect(screen.getByRole("button", { name: "Move 5 L earlier" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move 10 L later" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Remove 20 L" }));
    expect(chipTexts()).toEqual(["5 L", "10 L"]);
  });
});

describe("LED bulb and strip light fixtures", () => {
  it("power in watts", async () => {
    const { seen } = mount({ scale: "power", label: "Power", typeId: "led-bulb" });
    await type("Power", "9 W, 12 W");
    await add("Power");
    expect(chipTexts()).toEqual(["9 W", "12 W"]);
    expect(seen.current.every((v) => v.scale === "power")).toBe(true);
  });
  it("colour temperature as kelvin or a word", async () => {
    mount({ scale: "color-temperature", label: "Light colour" });
    await type("Light colour", "3000K, warm");
    await add("Light colour");
    expect(chipTexts()).toEqual(["3000 K", "Warm white"]);
  });
  it("voltage", async () => {
    mount({ scale: "voltage", label: "Voltage" });
    await type("Voltage", "12 V{Enter}");
    expect(chipTexts()).toEqual(["12 V"]);
  });
  it("IP rating", async () => {
    mount({ scale: "ip-rating", label: "Protection" });
    await type("Protection", "IP67{Enter}");
    expect(chipTexts()).toEqual(["IP67"]);
  });
  it("strip light length: 5 m and 10 m, and 500 cm merges with 5 m", async () => {
    mount({ scale: "length", label: "Length", initial: [parse("length", "5 m")] });
    await type("Length", "500 cm, 10 m");
    await add("Length");
    expect(chipTexts()).toEqual(["5 m", "10 m"]);
    expect(screen.getByText(/already in the list/)).toBeInTheDocument();
  });
});

describe("other text scales", () => {
  it.each([
    ["count", "Pieces", "set of 4", "Set of 4"],
    ["count", "Seats", "3-seater", "3-seater"],
    ["duration", "Length of treatment", "90 min", "90 min"],
    ["portion", "Portion", "half plate", "Half plate"],
    ["weight", "Pack", "2 kg", "2 kg"],
    ["storage", "Storage", "1 TB", "1 TB"],
    ["screen-inch", "Screen", "55", '55"'],
    ["collar-inch", "Collar", "16", '16"'],
    ["apparel-alpha", "Size", "xl", "XL"],
    ["tyre-size", "Tyre", "205/55 R16", "205/55 R16"],
    ["paper-size", "Paper", "A4", "A4"],
    ["bed-size", "Bed", "6x6", "6 x 6 ft"],
    ["label", "Flavour", "Strawberry", "Strawberry"],
  ])("%s: %s reads %s as %s", async (scale, label, typed, shown) => {
    mount({ scale, label });
    await type(label, `${typed}{Enter}`);
    expect(chipTexts()).toEqual([shown]);
  });
  it("storage 1024 GB reads as 1 TB", async () => {
    mount({ scale: "storage", label: "Storage" });
    await type("Storage", "1024 GB{Enter}");
    expect(chipTexts()).toEqual(["1 TB"]);
  });
  it("asks for a unit for storage and offers the units the scale named", async () => {
    mount({ scale: "storage", label: "Storage" });
    await type("Storage", "256");
    const ask = screen.getByRole("group", { name: "Which unit is 256?" });
    expect(within(ask).getAllByRole("button").map((b) => b.textContent)).toEqual(["MB", "GB", "TB"]);
  });
});

describe("shoe editor", () => {
  it("the system switch decides what a bare 42 means", async () => {
    const { seen } = mount({ editor: ShoeValueEditor });
    await type("Shoe size", "42{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "UK" }));
    await type("Shoe size", "8{Enter}");
    expect(seen.current.map((v) => [v.system, v.value])).toEqual([["eu", 42], ["uk", 8]]);
    expect(chipTexts()).toEqual(["EU 42", "UK 8"]);
  });
  it("each chip explains itself in the other systems", async () => {
    mount({ editor: ShoeValueEditor });
    await type("Shoe size", "42{Enter}");
    const help = within(screen.getByRole("list", { name: "What each size means in other systems" })).getByRole("listitem");
    expect(help).toHaveTextContent("EU 42 = EU 42 · UK 8 · US 9 (about 27 cm)");
  });
  it("US men and US women are different systems", async () => {
    const { seen } = mount({ editor: ShoeValueEditor });
    await userEvent.click(screen.getByRole("button", { name: "US women" }));
    await type("Shoe size", "9{Enter}");
    expect(seen.current[0]).toMatchObject({ system: "us-w", value: 9 });
    expect(chipTexts()).toEqual(["US 9 (women)"]);
  });
  it("rejects a size outside the chart, such as EU 80", async () => {
    mount({ editor: ShoeValueEditor });
    await type("Shoe size", "EU 80{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/outside the shoe chart/);
    expect(chipTexts()).toEqual([]);
  });
  it("quick fill: EU 38 to 47 in half steps", async () => {
    const { seen } = mount({ editor: ShoeValueEditor });
    await userEvent.selectOptions(screen.getByLabelText("Step"), "0.5");
    await userEvent.click(screen.getByRole("button", { name: "Fill sizes" }));
    expect(seen.current).toHaveLength(19);
    expect(chipTexts()[0]).toBe("EU 38");
    expect(chipTexts().at(-1)).toBe("EU 47");
  });
  it("quick fill with a width gives each size that width", async () => {
    const { seen } = mount({ editor: ShoeValueEditor });
    await userEvent.selectOptions(screen.getByLabelText("Width"), "wide");
    await userEvent.click(screen.getByRole("button", { name: "Fill sizes" }));
    expect(seen.current.every((v) => v.width === "wide")).toBe(true);
    expect(chipTexts()[0]).toBe("EU 38 · Wide");
  });
  it("quick fill is idempotent: a second press merges instead of doubling", async () => {
    const { seen } = mount({ editor: ShoeValueEditor });
    await userEvent.click(screen.getByRole("button", { name: "Fill sizes" }));
    await userEvent.click(screen.getByRole("button", { name: "Fill sizes" }));
    expect(seen.current).toHaveLength(10);
  });
  it("a bad quick fill says why", async () => {
    mount({ editor: ShoeValueEditor });
    await userEvent.clear(screen.getByLabelText("To"));
    await userEvent.type(screen.getByLabelText("To"), "30");
    await userEvent.click(screen.getByRole("button", { name: "Fill sizes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/same as or more than/);
  });
  it("shoe 42 and dress 42 are different values in different editors", async () => {
    const shoes = mount({ editor: ShoeValueEditor });
    await type("Shoe size", "42{Enter}");
    const shoeValue = shoes.seen.current[0];
    shoes.unmount();
    const dresses = mount({ scale: "apparel-numeric", label: "Dress size" });
    await type("Dress size", "US 12{Enter}");
    expect(dresses.seen.current[0].scale).toBe("apparel-numeric");
    expect(shoeValue.scale).toBe("shoe");
  });
});

describe("dimensions editor", () => {
  const box = (name) => screen.getByRole("textbox", { name });
  it("a table asks for Length, Width and Height in the chosen unit and previews them", async () => {
    const { seen } = mount({ editor: DimensionsEditor, typeId: "table" });
    await userEvent.type(box("Length in cm"), "120");
    await userEvent.type(box("Width in cm"), "60");
    await userEvent.type(box("Height in cm"), "75");
    expect(screen.getByText("L 120 × W 60 × H 75 cm", { selector: "strong" })).toBeInTheDocument();
    await add("Dimensions");
    expect(chipTexts()).toEqual(["L 120 × W 60 × H 75 cm"]);
    expect(seen.current[0]).toMatchObject({ scale: "dimensions", shape: "rectangular", value: "120x60x75", unit: "cm" });
    expect(box("Length in cm")).toHaveValue("");
  });
  it("a round table asks for Diameter and Height", async () => {
    const { seen } = mount({ editor: DimensionsEditor, typeId: "table" });
    await userEvent.click(screen.getByRole("button", { name: "Round" }));
    expect(screen.queryByRole("textbox", { name: "Length in cm" })).toBeNull();
    await userEvent.type(box("Diameter in cm"), "90{Tab}75{Enter}".replace("{Tab}", ""));
    expect(seen.current).toEqual([]); // 90 then 75 went into the first box only: Height still empty
    await userEvent.clear(box("Diameter in cm"));
    await userEvent.type(box("Diameter in cm"), "90");
    await userEvent.clear(box("Height in cm"));
    await userEvent.type(box("Height in cm"), "75");
    await add("Dimensions");
    expect(seen.current[0]).toMatchObject({ shape: "round", value: "90x75" });
    expect(chipTexts()[0]).toBe("Ø 90 × H 75 cm");
  });
  it("a door asks for Width and Height only", () => {
    mount({ editor: DimensionsEditor, typeId: "door" });
    expect(screen.getAllByRole("textbox").map((b) => b.getAttribute("aria-describedby") && b.closest("label").textContent)).toEqual(["Width in cm", "Height in cm"]);
  });
  it("the unit selector changes the labels and what is stored", async () => {
    const { seen } = mount({ editor: DimensionsEditor, typeId: "door" });
    await userEvent.selectOptions(screen.getByLabelText("Unit"), "in");
    await userEvent.type(box("Width in in"), "36");
    await userEvent.type(box("Height in in"), "80");
    await add("Dimensions");
    expect(seen.current[0]).toMatchObject({ value: "36x80", unit: "in" });
  });
  it("a 750 cm high table warns but does not block", async () => {
    const { seen } = mount({ editor: DimensionsEditor, typeId: "table" });
    await userEvent.type(box("Length in cm"), "120");
    await userEvent.type(box("Width in cm"), "60");
    await userEvent.type(box("Height in cm"), "750");
    expect(screen.getByText(/more than usual/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to Dimensions" })).toBeEnabled();
    await add("Dimensions");
    expect(seen.current).toHaveLength(1);
  });
  it("an impossible number is refused with a sentence", async () => {
    mount({ editor: DimensionsEditor, typeId: "table" });
    await userEvent.type(box("Length in cm"), "120");
    await userEvent.type(box("Width in cm"), "60");
    await userEvent.type(box("Height in cm"), "0");
    expect(screen.getByText(/more than zero/)).toBeInTheDocument();
  });
  it("sofa dimensions are per option: each seats option keeps its own editor and values", async () => {
    const two = mount({ editor: DimensionsEditor, typeId: "sofa", label: "2 seater" });
    await userEvent.type(box("Width in cm"), "160");
    await userEvent.type(box("Depth in cm"), "85");
    await userEvent.type(box("Height in cm"), "80");
    await add("2 seater");
    expect(two.seen.current[0].value).toBe("160x85x80");
    two.unmount();
    const three = mount({ editor: DimensionsEditor, typeId: "sofa", label: "3 seater" });
    await userEvent.type(box("Width in cm"), "210");
    await userEvent.type(box("Depth in cm"), "90");
    await userEvent.type(box("Height in cm"), "82");
    await add("3 seater");
    expect(three.seen.current[0].value).toBe("210x90x82");
    expect(chipTexts()).toEqual(["W 210 × D 90 × H 82 cm"]);
  });
});

describe("ValueEditor router", () => {
  it("picks the shoe and dimensions editors and falls back to text for the rest", () => {
    const a = render(<Host editor={ValueEditor} scale="shoe" />);
    expect(screen.getByRole("group", { name: "Shoe size system" })).toBeInTheDocument();
    a.unmount();
    const b = render(<Host editor={ValueEditor} scale="dimensions" typeId="door" />);
    expect(screen.getByRole("button", { name: "Round" })).toBeInTheDocument();
    b.unmount();
    render(<Host editor={ValueEditor} scale="volume" label="Size" />);
    expect(screen.getByRole("textbox", { name: "Size" })).toBeInTheDocument();
  });
});

describe("accessibility (axe)", () => {
  it.each([
    ["volume", { scale: "volume", label: "Refill size", initial: ["5 L", "10 L"].map((t) => parse("volume", t)) }],
    ["shoe", { editor: ShoeValueEditor, initial: [parse("shoe", "EU 42")] }],
    ["dimensions", { editor: DimensionsEditor, typeId: "table", initial: [parse("dimensions", "120 x 60 x 75 cm", { typeId: "table" })] }],
  ])("%s editor has no violations", async (_n, props) => {
    const { container } = mount(props);
    expect((await axe(container)).violations).toEqual([]);
  });
  it("still has none while asking for a unit and showing an error", async () => {
    const { container } = mount({ scale: "volume", label: "Refill size" });
    await type("Refill size", "20");
    expect((await axe(container)).violations).toEqual([]);
  });
});
