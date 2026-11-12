import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BODY_FIELDS, DIMENSION_FIELDS, emptyCustomSize, fieldFrom } from "@epicmkt/shared";
import { seriousViolations } from "../../test/axe.js";
import CustomSize from "./CustomSize.jsx";

const dress = { ...emptyCustomSize("size"), fields: BODY_FIELDS.slice(0, 2).map(fieldFrom), price: { mode: "fixed", base: "4500" } };
const sofa = { ...emptyCustomSize("size"), fields: DIMENSION_FIELDS.slice(0, 1).map(fieldFrom), price: { mode: "per-extra", base: "30000", perUnit: "100", field: "width", over: "180" } };

describe("CustomSize (made to measure)", () => {
  it("shows one field per measurement the seller asked for, and renders nothing when it is off", () => {
    const { container, rerender } = render(<CustomSize config={dress} itemName="Wrap dress" />);
    expect(screen.getByLabelText(/Bust/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Waist/)).toBeInTheDocument();
    rerender(<CustomSize config={{ ...dress, enabled: false }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("explains a missing or impossible measurement after the buyer leaves the field, not while typing", async () => {
    const user = userEvent.setup();
    render(<CustomSize config={dress} itemName="Wrap dress" />);
    const bust = screen.getByLabelText(/Bust/);
    await user.type(bust, "5");
    expect(screen.queryByText(/should be between/)).toBeNull();
    await user.tab();
    expect(screen.getByText("Bust should be between 60 and 200 cm.")).toBeInTheDocument();
    expect(bust).toHaveAttribute("aria-invalid", "true");
  });

  it("gives the price from the rule and the exact message line, reading inches too", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CustomSize config={dress} itemName="Wrap dress" onChange={onChange} />);
    expect(screen.getByText("Fill in the measurements to see the price.")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Bust/), "36 in");
    await user.type(screen.getByLabelText(/Waist/), "74");
    expect(screen.getByText("KES 4,500")).toBeInTheDocument();
    expect(screen.getByText("Wrap dress, Made to measure: Bust 91.4 cm, Waist 74 cm, KES 4,500")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ ok: true, values: { bust: 91.4, waist: 74 }, price: 4500, message: "Wrap dress, Made to measure: Bust 91.4 cm, Waist 74 cm, KES 4,500" });
  });

  it("charges per extra unit above the starting size", async () => {
    const user = userEvent.setup();
    render(<CustomSize config={sofa} itemName="Sofa" />);
    await user.type(screen.getByLabelText(/Width/), "200");
    expect(screen.getByText("KES 32,000")).toBeInTheDocument();
  });

  it("has no serious accessibility violations", async () => {
    const { container } = render(<CustomSize config={dress} itemName="Wrap dress" />);
    expect(await seriousViolations(container)).toEqual([]);
  });
});
