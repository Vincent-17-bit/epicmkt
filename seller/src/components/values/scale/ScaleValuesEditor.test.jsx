import { describe, it, expect } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { getFixtures, scales } from "@epicmkt/shared";
import { EDITORS } from "./wrappers.jsx";
import ScaleValuesEditor from "./ScaleValuesEditor.jsx";
import { scaleForAxis } from "../../../lib/axisScales.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const noViolations = async (node) => expect((await axe(node)).violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);

function Harness({ scaleId, initial = [], label = "Size", onList, ...props }) {
  const [list, setList] = useState(initial);
  const Editor = EDITORS[scaleId];
  return <Editor label={label} values={list} onChange={(l) => { setList(l); onList?.(l); }} {...props} />;
}
const chips = () => screen.queryAllByTestId("scale-chip").map((c) => c.querySelector("span").textContent);
const type = async (user, text) => { await user.type(screen.getByRole("textbox"), `${text}{Enter}`); };

describe("water (volume)", () => {
  it("adds 5, 10 and 20 litres in the fixture's words and previews them", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="volume" typeId="drinking-water" axisKey="size" />);
    for (const t of ["5 litres", "10 L", "20 l"]) await type(user, t);
    expect(chips()).toEqual(["5 L", "10 L", "20 L"]);
    expect(screen.getByTestId("scale-preview")).toHaveTextContent("5 L · 10 L · 20 L");
  });
  it("asks which unit a bare 20 is in, and a tap finishes it", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="volume" />);
    await type(user, "20");
    expect(screen.getByRole("alert")).toHaveTextContent(/unit/i);
    expect(screen.getByRole("group", { name: /Which unit is “20” in/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /litres/ }));
    expect(chips()).toEqual(["20 L"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("shows what a buyer will see while typing, and an error for nonsense", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="volume" />);
    await user.type(screen.getByRole("textbox"), "20 litres");
    expect(screen.getByText("20 L")).toBeInTheDocument();
    await user.clear(screen.getByRole("textbox"));
    await type(user, "lots");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });
  it("merges a duplicate quietly and keeps one chip", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="volume" />);
    await type(user, "1 L");
    await type(user, "1000 ml");
    expect(chips()).toEqual(["1 L"]);
    expect(screen.getByRole("status")).toHaveTextContent(/same as 1 L/);
  });
  it("flags an unusual size without blocking", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="volume" typeId="drinking-water" axisKey="size" />);
    await type(user, "500 L");
    expect(chips()).toEqual(["500 L"]);
    expect(screen.getAllByText(/Check this|unusual|realistic/i).length).toBeGreaterThan(0);
  });
  it("is free of axe violations", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness scaleId="volume" />);
    await type(user, "5 L");
    await type(user, "5");
    await noViolations(container);
  });
});

describe("reordering", () => {
  it("moves a chip earlier and later with named buttons and announces it", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="volume" initial={["5 L", "10 L", "20 L"].map((r) => scales.parse("volume", r).value)} />);
    await user.click(screen.getByRole("button", { name: "Move 20 L earlier" }));
    expect(chips()).toEqual(["5 L", "20 L", "10 L"]);
    expect(screen.getByRole("status")).toHaveTextContent("20 L moved to position 2 of 3.");
    expect(screen.getByRole("button", { name: "Move 5 L earlier" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Sort smallest first" }));
    expect(chips()).toEqual(["5 L", "10 L", "20 L"]);
    await user.click(screen.getByRole("button", { name: "Remove 10 L" }));
    expect(chips()).toEqual(["5 L", "20 L"]);
  });
});

describe("LED strip", () => {
  it("12 V voltage and power in watts", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness scaleId="voltage" label="Voltage" />);
    await type(user, "12v");
    expect(chips()).toEqual(["12 V"]);
    unmount();
    render(<Harness scaleId="power" label="Power" />);
    await type(user, "4.8 W");
    await type(user, "1.5 kW");
    expect(chips()).toEqual(["4.8 W", "1.5 kW"]);
  });
  it("accepts the strip's light colours as choices, in the seller's order", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="label" label="Light colour" />);
    for (const t of ["Warm white", "Cool white", "RGB colour change"]) await type(user, t);
    expect(chips()).toEqual(["Warm white", "Cool white", "RGB colour change"]);
  });
});

describe("LED bulb", () => {
  it("wattage 5, 9 and 12 W; colour temperature; IP rating", async () => {
    const user = userEvent.setup();
    const w = render(<Harness scaleId="power" label="Wattage" />);
    for (const t of ["5 W", "9W", "12 w"]) await type(user, t);
    expect(chips()).toEqual(["5 W", "9 W", "12 W"]);
    w.unmount();
    const k = render(<Harness scaleId="color-temperature" label="Colour temperature" />);
    await type(user, "3000k");
    expect(chips()).toEqual(["3000 K"]);
    k.unmount();
    render(<Harness scaleId="ip-rating" label="Protection" />);
    await type(user, "ip44");
    expect(chips()).toEqual(["IP44"]);
  });
});

describe("the other 1.4 scales", () => {
  it.each([
    ["count", ["4", "3-seater", "set of 6"], ["4 pcs", "3-seater", "Set of 6"]],
    ["weight", ["6 kg", "22.5 kg", "500 g"], ["6 kg", "22.5 kg", "500 g"]],
    ["duration", ["30 min", "1 h", "3 months"], ["30 min", "1 h", "3 months"]],
    ["portion", ["small", "half plate", "full plate"], ["Small", "Half plate", "Full plate"]]
  ])("%s", async (scaleId, typed, shown) => {
    const user = userEvent.setup();
    render(<Harness scaleId={scaleId} label="Option" />);
    for (const t of typed) await type(user, t);
    expect(chips()).toEqual(shown);
  });
});

describe("fixtures: every axis of water, LED strip and LED bulb", () => {
  const fixtures = getFixtures().filter((f) => ["drinking-water", "led-strip", "led-bulb"].includes(f.productType));
  const cases = fixtures.flatMap((f) => f.detail.options.map((axis) => [`${f.productType}.${axis.key}`, f.productType, axis]));
  it("finds all three fixtures", () => expect(fixtures.map((f) => f.productType).sort()).toEqual(["drinking-water", "led-bulb", "led-strip"]));
  it.each(cases)("%s: typing the fixture's labels gives the same chips, in order", async (_name, typeId, axis) => {
    const user = userEvent.setup();
    const scaleId = scaleForAxis(typeId, axis);
    render(<Harness scaleId={scaleId} label={axis.label} typeId={typeId} axisKey={axis.key} />);
    for (const v of axis.values) await user.type(screen.getByLabelText(axis.label, { selector: "input" }), `${v.label}{Enter}`);
    expect(chips()).toEqual(axis.values.map((v) => v.label));
  });
  it("the scale picked for each strip and bulb axis is the one that reads it", () => {
    expect(scaleForAxis("led-strip", { key: "length" })).toBe("length");
    expect(scaleForAxis("led-bulb", { key: "wattage" })).toBe("power");
    expect(scaleForAxis("led-strip", { key: "colour" })).toBe("label");
  });
});

describe("drag and drop", () => {
  it("dropping a chip on another moves it there and announces it", () => {
    render(<Harness scaleId="volume" initial={["5 L", "10 L", "20 L"].map((r) => scales.parse("volume", r).value)} />);
    const items = screen.getAllByTestId("scale-chip");
    const data = { setData() {}, effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(items[2], { dataTransfer: data });
    fireEvent.dragOver(items[0], { dataTransfer: data });
    fireEvent.drop(items[0], { dataTransfer: data });
    expect(chips()).toEqual(["20 L", "5 L", "10 L"]);
    expect(screen.getByRole("status")).toHaveTextContent("20 L moved to position 1 of 3.");
  });
  it("a drop on itself changes nothing, and the arrow buttons still work", async () => {
    const user = userEvent.setup();
    render(<Harness scaleId="volume" initial={["5 L", "10 L"].map((r) => scales.parse("volume", r).value)} />);
    const items = screen.getAllByTestId("scale-chip");
    const data = { setData() {}, effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(items[0], { dataTransfer: data });
    fireEvent.drop(items[0], { dataTransfer: data });
    expect(chips()).toEqual(["5 L", "10 L"]);
    await user.click(screen.getByRole("button", { name: "Move 5 L later" }));
    expect(chips()).toEqual(["10 L", "5 L"]);
    expect(screen.getByText(/Drag a value to reorder/)).toBeInTheDocument();
  });
});

describe("generic editor", () => {
  it("works for any registered scale", async () => {
    const user = userEvent.setup();
    function G() { const [l, set] = useState([]); return <ScaleValuesEditor scaleId="screen-inch" label="Screen" values={l} onChange={set} />; }
    render(<G />);
    await type(user, "6.7 in");
    expect(chips()).toEqual(['6.7"']);
    expect(within(screen.getByRole("group", { name: "Screen values" })).getAllByRole("listitem")).toHaveLength(1);
  });
});
