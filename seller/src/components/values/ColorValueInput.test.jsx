import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import ColorValueInput from "./ColorValueInput.jsx";
import { createLocalSource } from "./source.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });

function Harness({ source, onValue }) {
  const [value, setValue] = useState(null);
  return <ColorValueInput source={source} value={value} onChange={(v) => { setValue(v); onValue?.(v); }} />;
}

describe("ColorValueInput", () => {
  it("a palette tap uses the colour already in the list", async () => {
    const source = createLocalSource([{ id: "c1", kind: "color", label: "Red", hex: "#d32f2f" }]);
    const add = vi.spyOn(source, "add");
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness source={source} onValue={onValue} />);
    await user.click(screen.getByRole("button", { name: "Red" }));
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" })));
    expect(add).not.toHaveBeenCalled();
    expect(screen.getByTestId("value-chip")).toHaveAttribute("data-card", "swatch");
  });

  it("a palette tap adds the colour with the palette's shade when it is new, as a pending swatch", async () => {
    const source = createLocalSource();
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness source={source} onValue={onValue} />);
    await user.click(screen.getByRole("button", { name: "Blue" }));
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(expect.objectContaining({ label: "Blue", hex: "#1976d2", status: "pending" })));
    expect(screen.getByTestId("value-chip")).toHaveTextContent("Pending review");
  });

  it("types \"Wine red\" with no shade: added as a text card", async () => {
    const source = createLocalSource();
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness source={source} onValue={onValue} />);
    await user.type(screen.getByRole("combobox", { name: "Colour" }), "Wine red");
    await user.click(await screen.findByRole("option", { name: /Add “Wine red”/ }));
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(expect.objectContaining({ label: "Wine red", hex: null })));
    expect(screen.getByTestId("value-chip")).toHaveAttribute("data-card", "text");
  });

  it("types \"Wine red\" with an exact shade: added as a swatch card", async () => {
    const source = createLocalSource();
    const add = vi.spyOn(source, "add");
    const user = userEvent.setup();
    render(<Harness source={source} />);
    await user.click(screen.getByRole("checkbox", { name: /exact shade/ }));
    const hex = screen.getByLabelText(/Shade \(hex code/);
    await user.clear(hex);
    await user.type(hex, "#8B1A2B");
    await user.type(screen.getByRole("combobox", { name: "Colour" }), "Wine red");
    await user.click(await screen.findByRole("option", { name: /Add “Wine red”/ }));
    await waitFor(() => expect(add).toHaveBeenCalledWith("color", "Wine red", "#8b1a2b"));
    expect(await screen.findByRole("img", { name: "Colour sample for Wine red" })).toBeInTheDocument();
    expect(screen.getByTestId("value-chip")).toHaveAttribute("data-card", "swatch");
  });

  it("an invalid shade blocks Add and explains", async () => {
    const user = userEvent.setup();
    render(<Harness source={createLocalSource()} />);
    await user.click(screen.getByRole("checkbox", { name: /exact shade/ }));
    const hex = screen.getByLabelText(/Shade \(hex code/);
    await user.clear(hex);
    await user.type(hex, "#12");
    expect(hex).toHaveAttribute("aria-invalid", "true");
    await user.type(screen.getByRole("combobox", { name: "Colour" }), "Teal");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("A shade looks like #A1B2C3."));
    expect(screen.queryByRole("option", { name: /Add/ })).not.toBeInTheDocument();
  });

  it("an existing name keeps its own shade: typing it resolves to it and no add happens", async () => {
    const source = createLocalSource([{ id: "c9", kind: "color", label: "Wine red", hex: "#722f37" }]);
    const add = vi.spyOn(source, "add");
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness source={source} onValue={onValue} />);
    await user.type(screen.getByRole("combobox", { name: "Colour" }), "WINE RED{Enter}");
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(expect.objectContaining({ id: "c9", hex: "#722f37" })));
    expect(add).not.toHaveBeenCalled();
  });

  it("says so when a palette colour cannot be added", async () => {
    const source = { search: async () => { throw new Error("offline"); }, add: vi.fn() };
    const user = userEvent.setup();
    render(<Harness source={source} />);
    await user.click(screen.getByRole("button", { name: "Green" }));
    expect(await screen.findByText(/could not add that colour/)).toBeInTheDocument();
  });

  it("has no axe violations (palette, shade controls, chosen swatch)", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness source={createLocalSource()} />);
    expect((await axe(container)).violations).toEqual([]);
    await user.click(screen.getByRole("checkbox", { name: /exact shade/ }));
    expect((await axe(container)).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Red" }));
    await screen.findByTestId("value-chip");
    expect((await axe(container)).violations).toEqual([]);
  });
});
