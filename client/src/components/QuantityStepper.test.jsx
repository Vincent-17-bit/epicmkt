import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { quantityRules } from "@epicmkt/shared";
import QuantityStepper from "./QuantityStepper.jsx";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });

function Harness({ mode = "units", rules, start, size, onValue }) {
  const [value, setValue] = useState(start);
  return <QuantityStepper mode={mode} rules={rules} value={value} size={size} onChange={(v) => { setValue(v); onValue?.(v); }} />;
}
const units = (stock = null) => quantityRules("units", { stock });
const kg = (stock = null) => quantityRules("measure", { quantity: { min: 0.5, step: 0.25, unit: "kg" }, stock });
const box = () => screen.getByRole("textbox");

describe("QuantityStepper", () => {
  it("minus stops at the minimum, plus at the stock", async () => {
    render(<Harness rules={units(3)} start={1} />);
    expect(screen.getByRole("button", { name: "One less" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(box()).toHaveValue("3");
    expect(screen.getByRole("button", { name: "One more" })).toBeDisabled();
  });

  it("a typed value applies on blur, rounded and held between the limits, with the hint", async () => {
    render(<Harness rules={units(3)} start={1} />);
    await userEvent.clear(box());
    await userEvent.type(box(), "9");
    await userEvent.tab();
    expect(box()).toHaveValue("3");
    expect(screen.getByText("Only 3 available")).toBeInTheDocument();
    await userEvent.clear(box());
    await userEvent.type(box(), "0");
    await userEvent.tab();
    expect(box()).toHaveValue("1");
  });

  it("Enter applies a typed value", async () => {
    const seen = [];
    render(<Harness rules={units()} start={1} onValue={(v) => seen.push(v)} />);
    await userEvent.clear(box());
    await userEvent.type(box(), "7{Enter}");
    expect(seen.at(-1)).toBe(7);
  });

  it("measured items step by their rule and round typed amounts to it", async () => {
    render(<Harness mode="measure" rules={kg()} start={0.5} />);
    expect(screen.getByRole("button", { name: "One less" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(box()).toHaveValue("0.75");
    await userEvent.clear(box());
    await userEvent.type(box(), "1.6");
    await userEvent.tab();
    expect(box()).toHaveValue("1.5");
    await userEvent.clear(box());
    await userEvent.type(box(), "0.1");
    await userEvent.tab();
    expect(box()).toHaveValue("0.5");
    expect(screen.getByText("The least you can order is 0.5 kg")).toBeInTheDocument();
  });

  it("comes in two sizes and is marked so a swipe on it never closes a drawer", () => {
    const { container, rerender } = render(<QuantityStepper mode="units" rules={units()} value={1} onChange={() => {}} size="sm" />);
    expect(container.firstChild).toHaveAttribute("data-size", "sm");
    expect(container.firstChild).toHaveAttribute("data-no-swipe");
    rerender(<QuantityStepper mode="units" rules={units()} value={1} onChange={() => {}} size="md" />);
    expect(container.firstChild).toHaveAttribute("data-size", "md");
  });

  it("has no accessibility violations in either size", async () => {
    const { container } = render(
      <>
        <QuantityStepper mode="units" rules={units()} value={2} onChange={() => {}} size="md" />
        <QuantityStepper mode="units" rules={units()} value={2} onChange={() => {}} size="sm" label="Quantity of Table" />
      </>
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
