import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { scales } from "@epicmkt/shared";

const TYPES = [
  { id: "drinking-water", name: "Drinking water", axes: [{ key: "size", label: "Size", display: "button" }, { key: "fill", label: "Fill", display: "button" }] },
  { id: "shoes-eu", name: "Shoes", axes: [{ key: "size", label: "Size", display: "button" }] },
  { id: "table", name: "Table", axes: [{ key: "size", label: "Size", display: "text-card" }] },
  { id: "plain", name: "Plain", axes: [] },
];
vi.mock("./steps/useProductTypes.js", () => ({ useProductTypes: () => ({ types: TYPES, loading: false, error: false }) }));

const { default: OptionsStep } = await import("./steps/OptionsStep.jsx");
const { STEPS, optionEditorsOn } = await import("./steps/index.js");
const { withAxisValues, axisValues } = await import("./model/options.js");
const { typeSlice } = await import("./model/type.js");
const { scaleForAxis } = await import("../../../../lib/axisScales.js");

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
beforeEach(() => vi.stubEnv("VITE_OPTION_EDITORS", "true"));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

function Harness({ initial = { productTypeId: "drinking-water" }, onForm }) {
  const [form, setForm] = useState(initial);
  const patch = (key, value) => setForm((f) => { const n = { ...f, [key]: value }; onForm?.(n); return n; });
  return <OptionsStep form={form} patch={patch} />;
}

describe("Options step", () => {
  it("is hidden unless the option editors are switched on, and then only for a typed item", () => {
    const step = STEPS.find((s) => s.id === "options");
    vi.stubEnv("VITE_OPTION_EDITORS", "");
    expect(optionEditorsOn()).toBe(false);
    expect(step.visibleWhen({ form: { productTypeId: "shoes-eu" } })).toBe(false);
    expect(render(<OptionsStep form={{ productTypeId: "shoes-eu" }} patch={() => {}} />).container).toBeEmptyDOMElement(); // off: nothing renders
    vi.stubEnv("VITE_OPTION_EDITORS", "true");
    expect(step.visibleWhen({ form: { productTypeId: "shoes-eu" } })).toBe(true);
    expect(step.visibleWhen({ form: { productTypeId: null } })).toBe(false); // Other goods
    expect(step.visibleWhen({ form: {} })).toBe(false);                      // no type: the form is as before
  });

  it("picks the editor by the axis's scale: litres for water, shoe sizes for shoes", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    expect(screen.getByTestId("scale-editor-volume")).toBeInTheDocument();
    expect(screen.getByTestId("scale-editor-label")).toBeInTheDocument(); // an axis with no known scale is a list of choices
    await user.type(screen.getByLabelText("Size", { selector: "input" }), "20 litres{Enter}");
    expect(screen.getByTestId("scale-chip")).toHaveTextContent("20 L");
    unmount();
    render(<Harness initial={{ productTypeId: "shoes-eu" }} />);
    expect(screen.getByTestId("scale-editor-shoe")).toBeInTheDocument();
  });

  it("keeps the typed values on the form as stored scale values, and nothing else changes", async () => {
    const user = userEvent.setup();
    let last;
    render(<Harness onForm={(f) => { last = f; }} />);
    await user.type(screen.getByLabelText("Size", { selector: "input" }), "5 L{Enter}");
    await user.type(screen.getByLabelText("Fill", { selector: "input" }), "Refill{Enter}");
    expect(last.productTypeId).toBe("drinking-water");
    expect(last.optionValues.size).toEqual([scales.parse("volume", "5 L").value]);
    expect(last.optionValues.fill[0]).toMatchObject({ scale: "label", value: "Refill" });
  });

  it("restores values already on the form", () => {
    render(<Harness initial={{ productTypeId: "drinking-water", optionValues: { size: [scales.parse("volume", "10 L").value] } }} />);
    expect(screen.getByTestId("scale-chip")).toHaveTextContent("10 L");
  });

  it("a type with no axes says so, and a table gets the dimensions editor", () => {
    const { unmount } = render(<Harness initial={{ productTypeId: "plain" }} />);
    expect(screen.getByText("Plain has no options to fill in.")).toBeInTheDocument();
    unmount();
    render(<Harness initial={{ productTypeId: "table" }} />);
    expect(screen.getByTestId("scale-editor-dimensions")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Add size" })).toBeInTheDocument();
  });

  it("is free of axe violations", async () => {
    const { container } = render(<Harness />);
    expect((await axe(container)).violations.map((v) => v.id)).toEqual([]);
  });
});

describe("option values on the form", () => {
  const v = scales.parse("volume", "5 L").value;
  it("an empty list removes the axis, and the last axis removes the key", () => {
    const one = withAxisValues({ name: "x" }, "size", [v]);
    expect(axisValues(one, "size")).toEqual([v]);
    expect(withAxisValues(one, "size", [])).toEqual({ name: "x" });
  });
  it("changing the type drops the values typed for the old type", () => {
    const form = { productTypeId: "drinking-water", optionValues: { size: [v] }, name: "x" };
    const next = typeSlice.reduce(form, { type: "patch", key: "productTypeId", value: "shoes-eu" });
    expect(next).toEqual({ productTypeId: "shoes-eu", name: "x" });
  });
  it("scaleForAxis: the axis's own scale wins, then the table, then choices", () => {
    expect(scaleForAxis("drinking-water", { key: "size" })).toBe("volume");
    expect(scaleForAxis("drinking-water", { key: "size", scale: "weight" })).toBe("weight");
    expect(scaleForAxis("anything", { key: "colour" })).toBe("label");
  });
});
